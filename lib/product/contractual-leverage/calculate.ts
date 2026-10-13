/**
 * End-to-end contractual leverage calculation:
 * identify definitions → compile IR → resolve inputs → evaluate → headroom.
 *
 * Fail-closed: missing critical inputs or unsupported shapes never invent values.
 */

import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { fixtureInputResolver, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { rational, rationalFromNumber, toApproximateNumber } from "@/lib/contract-model/runtime/decimal";
import { money } from "@/lib/contract-model/runtime/values";
import type { InputProvenance } from "@/lib/contract-model/runtime/types";
import { compileLeverageExpressions } from "./compile";
import { identifyLeverageComponents } from "./identify";
import type {
  ContractualLeverageResult,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
  ResolvedInputLine,
} from "./types";

const INPUT_PROVENANCE: InputProvenance = {
  source: "verified-financial-snapshot",
  sourceVersion: "contractual-leverage.v1",
  selectionMethod: "EXACT_CALLER_SUPPLIED",
  identityStrength: "CONTRACT_NAME_ONLY",
  currency: "USD",
  note: "Caller-supplied verified covenant financial inputs ($M)",
};

/** Parse runtime canonical strings ("1.25", "524/425") to a JS number for display/asserts. */
function parseNumeric(serialized: { type: string; amount?: string; value?: string } | null): number | null {
  if (!serialized) return null;
  const raw = serialized.type === "MONEY" ? serialized.amount : serialized.value;
  if (raw == null) return null;
  try {
    if (raw.includes("/")) {
      const [num, den] = raw.split("/");
      if (!num || !den) return null;
      return toApproximateNumber(rational(BigInt(num), BigInt(den)));
    }
    return toApproximateNumber(rationalFromNumber(Number(raw)));
  } catch {
    return null;
  }
}

function buildInputLines(
  financials: LeverageFinancialInputs,
  debtBasis: "total" | "secured",
  netsCash: boolean,
): ResolvedInputLine[] {
  const debtValue = debtBasis === "secured" ? financials.securedDebt : financials.totalDebt;
  const debtLabel = debtBasis === "secured" ? "Secured Debt" : "Total Debt";
  const lines: ResolvedInputLine[] = [
    {
      key: "EBITDA",
      label: "Consolidated EBITDA (covenant)",
      valueMillions: financials.ebitda,
      required: true,
      status: financials.ebitda != null && financials.ebitda !== 0 ? "RESOLVED" : "MISSING",
    },
    {
      key: debtBasis === "secured" ? "Secured Debt" : "Total Debt",
      label: debtLabel,
      valueMillions: debtValue,
      required: true,
      status: debtValue != null ? "RESOLVED" : "MISSING",
    },
  ];
  if (netsCash) {
    lines.push({
      key: "Cash",
      label: "Unrestricted cash & Cash Equivalents",
      valueMillions: financials.cash,
      required: true,
      status: financials.cash != null ? "RESOLVED" : "MISSING",
    });
  }
  return lines;
}

function moneyMetric(key: string, millions: number) {
  return metricInput(key, money(rationalFromNumber(millions), "USD", { exprId: null, inputKeys: [key] }), INPUT_PROVENANCE);
}

/**
 * Calculate one contractual leverage ratio (and optional debt headroom) from
 * definition texts + verified financial inputs. Pure — no I/O, no company branches.
 */
export function calculateContractualLeverage(req: LeverageCalculationRequest): ContractualLeverageResult {
  const base: ContractualLeverageResult = {
    status: "MISSING_DEFINITIONS",
    name: req.name,
    sectionRef: req.sectionRef,
    documentName: req.documentName ?? null,
    debtBasis: null,
    formulaDisplay: null,
    citations: [],
    limitations: [],
    inputs: [],
    missingRequirements: [],
    currentRatio: null,
    threshold: req.threshold ?? null,
    ratioHeadroom: null,
    debtHeadroomMillions: null,
    runtimeStatus: null,
  };

  const identified = identifyLeverageComponents({
    definitions: req.definitions,
    leverageTermCandidates: req.leverageTermCandidates,
    ebitdaTermCandidates: req.ebitdaTermCandidates,
    debtBasisHint: req.debtBasisHint,
  });

  if ("error" in identified) {
    return {
      ...base,
      status: identified.error,
      missingRequirements: identified.missing,
      limitations: identified.limitations,
    };
  }

  const inputs = buildInputLines(req.financials, identified.debtBasis, identified.netsCash);
  const missing = inputs.filter((i) => i.status === "MISSING").map((i) => i.label);
  if (missing.length > 0) {
    return {
      ...base,
      status: "MISSING_INPUTS",
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations: identified.citations,
      limitations: identified.limitations,
      inputs,
      missingRequirements: missing,
    };
  }

  // Zero EBITDA is mathematically invalid for a leverage denominator.
  if (req.financials.ebitda === 0) {
    return {
      ...base,
      status: "MISSING_INPUTS",
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations: identified.citations,
      limitations: [...identified.limitations, "EBITDA is zero — leverage ratio is undefined."],
      inputs,
      missingRequirements: ["Non-zero Consolidated EBITDA (covenant)"],
    };
  }

  const compiled = compileLeverageExpressions({
    components: identified,
    companyId: req.companyId,
    instrumentKey: req.instrumentKey,
    threshold: req.threshold,
  });

  const metrics = [
    moneyMetric("EBITDA", req.financials.ebitda!),
    moneyMetric(
      identified.debtBasis === "secured" ? "Secured Debt" : "Total Debt",
      (identified.debtBasis === "secured" ? req.financials.securedDebt : req.financials.totalDebt)!,
    ),
  ];
  if (identified.netsCash) {
    metrics.push(moneyMetric("Cash", req.financials.cash!));
  }

  const resolver = fixtureInputResolver({ metrics });
  const ratioEval = evaluateExpression({
    expression: compiled.ratioExpression,
    inputs: resolver,
    context: { companyId: req.companyId, instrumentKey: req.instrumentKey },
  });

  if (ratioEval.status !== "EXECUTABLE" || !ratioEval.value) {
    const needs = ratioEval.missingInputKeys ?? [];
    return {
      ...base,
      status: needs.length > 0 ? "MISSING_INPUTS" : "EVALUATION_ERROR",
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations: [...identified.citations, ...ratioEval.provenance.sourceCitations],
      limitations: identified.limitations,
      inputs,
      missingRequirements: needs.length > 0 ? needs : ratioEval.diagnostics.map((d) => d.message),
      runtimeStatus: ratioEval.status,
    };
  }

  const currentRatio = parseNumeric(ratioEval.value as { type: string; value?: string });
  let debtHeadroomMillions: number | null = null;
  let ratioHeadroom: number | null = null;

  if (req.threshold != null && currentRatio != null) {
    ratioHeadroom = req.threshold - currentRatio;
  }

  if (compiled.debtHeadroomExpression) {
    const headEval = evaluateExpression({
      expression: compiled.debtHeadroomExpression,
      inputs: resolver,
      context: { companyId: req.companyId, instrumentKey: req.instrumentKey },
    });
    if (headEval.status === "EXECUTABLE" && headEval.value) {
      debtHeadroomMillions = parseNumeric(headEval.value as { type: string; amount?: string });
    } else {
      // Ratio computed; dollar headroom unsupported/failed — disclose, do not invent.
      identified.limitations.push(
        `Dollar debt headroom not computed (${headEval.status}${headEval.diagnostics[0] ? `: ${headEval.diagnostics[0].message}` : ""}).`,
      );
    }
  } else if (req.threshold == null) {
    identified.limitations.push("No ratio threshold supplied — dollar debt headroom not computed.");
  }

  const citations = [...new Set([...identified.citations, ...ratioEval.provenance.sourceCitations])];

  return {
    status: "COMPUTED",
    name: req.name,
    sectionRef: req.sectionRef,
    documentName: req.documentName ?? null,
    debtBasis: identified.debtBasis,
    formulaDisplay: compiled.formulaDisplay,
    citations,
    limitations: identified.limitations,
    inputs,
    missingRequirements: [],
    currentRatio,
    threshold: req.threshold ?? null,
    ratioHeadroom,
    debtHeadroomMillions,
    runtimeStatus: ratioEval.status,
  };
}

/** Recalculate a prior request against edited financial inputs (dashboard live reflow). */
export function recalculateWithFinancials(
  req: LeverageCalculationRequest,
  financials: LeverageFinancialInputs,
): ContractualLeverageResult {
  return calculateContractualLeverage({ ...req, financials });
}
