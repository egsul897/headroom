/**
 * End-to-end contractual leverage calculation:
 * identify definitions → optional EBITDA build-up → compile IR → resolve inputs → evaluate.
 *
 * Fail-closed: missing critical inputs or unsupported shapes never invent values.
 * Caller-supplied / seeded inputs are never labeled APPROVED merely by reaching the resolver.
 * Mathematical headroom is never presented as legal debt-incurrence capacity.
 */

import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { fixtureInputResolver, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { rational, rationalFromNumber, toApproximateNumber } from "@/lib/contract-model/runtime/decimal";
import { money } from "@/lib/contract-model/runtime/values";
import type { InputProvenance } from "@/lib/contract-model/runtime/types";
import { compileLeverageExpressions } from "./compile";
import { CAPACITY_DISCLAIMER } from "./disclaimer";
import { calculateEbitdaBuildup } from "./ebitda-buildup";
import { identifyLeverageComponents } from "./identify";
import type {
  ComputationAuthority,
  ContractualLeverageResult,
  FinancialInputAuthority,
  HeadroomPresentation,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
  ResolvedInputLine,
} from "./types";

export { CAPACITY_DISCLAIMER } from "./disclaimer";

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

function inputProvenance(authority: FinancialInputAuthority): InputProvenance {
  const source =
    authority === "APPROVED_PERIOD_MATCHED"
      ? "approved-period-matched-financials"
      : authority === "SEEDED_SNAPSHOT"
        ? "seeded-financial-snapshot"
        : "caller-supplied-financials";
  return {
    source,
    sourceVersion: "contractual-leverage.v1",
    selectionMethod: "EXACT_CALLER_SUPPLIED",
    identityStrength: "CONTRACT_NAME_ONLY",
    currency: "USD",
    note: `Input authority: ${authority} — not upgraded by resolver presence`,
  };
}

function buildInputLines(
  financials: LeverageFinancialInputs,
  debtBasis: "total" | "secured",
  netsCash: boolean,
  authority: FinancialInputAuthority,
  ebitdaAuthority: FinancialInputAuthority,
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
      authority: ebitdaAuthority,
    },
    {
      key: debtBasis === "secured" ? "Secured Debt" : "Total Debt",
      label: debtLabel,
      valueMillions: debtValue,
      required: true,
      status: debtValue != null ? "RESOLVED" : "MISSING",
      authority,
    },
  ];
  if (netsCash) {
    lines.push({
      key: "Cash",
      label: "Unrestricted cash & Cash Equivalents",
      valueMillions: financials.cash,
      required: true,
      status: financials.cash != null ? "RESOLVED" : "MISSING",
      authority,
    });
  }
  return lines;
}

function moneyMetric(key: string, millions: number, authority: FinancialInputAuthority) {
  return metricInput(
    key,
    money(rationalFromNumber(millions), "USD", { exprId: null, inputKeys: [key] }),
    inputProvenance(authority),
  );
}

function resolveComputationAuthority(args: {
  inputAuthority: FinancialInputAuthority;
  ebitdaAuthority: FinancialInputAuthority;
  hasUnsupportedCashCap: boolean;
  hasUnresolvedProForma: boolean;
  thresholdKnown: boolean;
  debtBasisKnown: boolean;
}): ComputationAuthority {
  if (args.hasUnsupportedCashCap || args.hasUnresolvedProForma) return "INDICATIVE";
  if (!args.thresholdKnown || !args.debtBasisKnown) return "INDICATIVE";
  if (args.inputAuthority !== "APPROVED_PERIOD_MATCHED") return "INDICATIVE";
  if (args.ebitdaAuthority !== "APPROVED_PERIOD_MATCHED") return "INDICATIVE";
  return "CONTRACTUAL_EXECUTABLE";
}

function emptyResult(partial: Partial<ContractualLeverageResult> & Pick<ContractualLeverageResult, "status" | "name" | "sectionRef">): ContractualLeverageResult {
  return {
    documentName: null,
    debtBasis: null,
    formulaDisplay: null,
    citations: [],
    limitations: [],
    inputs: [],
    missingRequirements: [],
    currentRatio: null,
    threshold: null,
    ratioHeadroom: null,
    debtHeadroomMillions: null,
    runtimeStatus: null,
    inputAuthority: "CALLER_SUPPLIED",
    computationAuthority: "INDICATIVE",
    headroomPresentation: "NOT_PRESENTED_AS_CAPACITY",
    capacityDisclaimer: CAPACITY_DISCLAIMER,
    ebitdaBuildup: null,
    ...partial,
  };
}

/**
 * Calculate one leverage ratio from definition texts + financial inputs.
 * Pure — no I/O, no company branches.
 */
export function calculateContractualLeverage(req: LeverageCalculationRequest): ContractualLeverageResult {
  const baseAuthority: FinancialInputAuthority = req.financialAuthority ?? "CALLER_SUPPLIED";

  const identified = identifyLeverageComponents({
    definitions: req.definitions,
    leverageTermCandidates: req.leverageTermCandidates,
    ebitdaTermCandidates: req.ebitdaTermCandidates,
    debtBasisHint: req.debtBasisHint,
  });

  if ("error" in identified) {
    return emptyResult({
      status: identified.error,
      name: req.name,
      sectionRef: req.sectionRef,
      documentName: req.documentName ?? null,
      threshold: req.threshold ?? null,
      missingRequirements: identified.missing,
      limitations: identified.limitations,
      inputAuthority: baseAuthority,
    });
  }

  // Optional Consolidated EBITDA build-up from line items under the operative definition.
  let financials: LeverageFinancialInputs = { ...req.financials };
  let ebitdaAuthority: FinancialInputAuthority = baseAuthority;
  let ebitdaBuildup = null as ContractualLeverageResult["ebitdaBuildup"];
  const limitations = [...identified.limitations];

  if (req.ebitdaLineItems && req.ebitdaLineItems.length > 0) {
    ebitdaBuildup = calculateEbitdaBuildup({
      companyId: req.companyId,
      instrumentKey: req.instrumentKey,
      ebitdaDefinition: identified.ebitdaTerm,
      lineItems: req.ebitdaLineItems,
      expectedPeriod: req.expectedPeriod,
      // Seeded / public-filing reconstructions are never silently APPROVED.
      evidenceSnapshotStatus:
        req.financialAuthority === "APPROVED_PERIOD_MATCHED" ? "APPROVED" : "REVIEW_REQUIRED",
    });
    if (ebitdaBuildup.status === "COMPUTED" && ebitdaBuildup.valueMillions != null) {
      financials = { ...financials, ebitda: ebitdaBuildup.valueMillions };
      ebitdaAuthority = ebitdaBuildup.authority;
    } else {
      // Build-up requested but incomplete — do not substitute a pre-collapsed leaf as a build-up.
      financials = { ...financials, ebitda: null };
      limitations.push(
        "Consolidated EBITDA build-up did not complete; pre-collapsed EBITDA leaf was not substituted as a build-up.",
      );
      if (ebitdaBuildup.unresolvedComponents.length) {
        limitations.push(`Unresolved EBITDA components: ${ebitdaBuildup.unresolvedComponents.join("; ")}`);
      }
    }
    if (ebitdaBuildup.limitations.length) limitations.push(...ebitdaBuildup.limitations);
  }

  const inputs = buildInputLines(financials, identified.debtBasis, identified.netsCash, baseAuthority, ebitdaAuthority);
  const missing = inputs.filter((i) => i.status === "MISSING").map((i) => i.label);

  if (missing.length > 0) {
    return emptyResult({
      status: "MISSING_INPUTS",
      name: req.name,
      sectionRef: req.sectionRef,
      documentName: req.documentName ?? null,
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations: identified.citations,
      limitations,
      inputs,
      missingRequirements: missing,
      threshold: req.threshold ?? null,
      inputAuthority: baseAuthority,
      ebitdaBuildup,
    });
  }

  if (financials.ebitda === 0) {
    return emptyResult({
      status: "MISSING_INPUTS",
      name: req.name,
      sectionRef: req.sectionRef,
      documentName: req.documentName ?? null,
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations: identified.citations,
      limitations: [...limitations, "EBITDA is zero — leverage ratio is undefined."],
      inputs,
      missingRequirements: ["Non-zero Consolidated EBITDA (covenant)"],
      threshold: req.threshold ?? null,
      inputAuthority: baseAuthority,
      ebitdaBuildup,
    });
  }

  // Unsupported cash caps: still may compute indicative uncapped netting math, but refuse
  // authoritative status and refuse presenting dollar room as anything but mathematical (or null).
  const refuseDollarRoom = identified.hasUnsupportedCashCap;

  const compiled = compileLeverageExpressions({
    components: identified,
    companyId: req.companyId,
    instrumentKey: req.instrumentKey,
    threshold: req.threshold,
    refuseDollarRoom,
  });

  const metrics = [
    moneyMetric("EBITDA", financials.ebitda!, ebitdaAuthority),
    moneyMetric(
      identified.debtBasis === "secured" ? "Secured Debt" : "Total Debt",
      (identified.debtBasis === "secured" ? financials.securedDebt : financials.totalDebt)!,
      baseAuthority,
    ),
  ];
  if (identified.netsCash) {
    metrics.push(moneyMetric("Cash", financials.cash!, baseAuthority));
  }

  const resolver = fixtureInputResolver({ metrics });
  const ratioEval = evaluateExpression({
    expression: compiled.ratioExpression,
    inputs: resolver,
    context: { companyId: req.companyId, instrumentKey: req.instrumentKey },
  });

  if (ratioEval.status !== "EXECUTABLE" || !ratioEval.value) {
    const needs = ratioEval.missingInputKeys ?? [];
    return emptyResult({
      status: needs.length > 0 ? "MISSING_INPUTS" : "EVALUATION_ERROR",
      name: req.name,
      sectionRef: req.sectionRef,
      documentName: req.documentName ?? null,
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations: [...identified.citations, ...ratioEval.provenance.sourceCitations],
      limitations,
      inputs,
      missingRequirements: needs.length > 0 ? needs : ratioEval.diagnostics.map((d) => d.message),
      threshold: req.threshold ?? null,
      runtimeStatus: ratioEval.status,
      inputAuthority: baseAuthority,
      ebitdaBuildup,
    });
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
      limitations.push(
        `Mathematical dollar room not computed (${headEval.status}${headEval.diagnostics[0] ? `: ${headEval.diagnostics[0].message}` : ""}).`,
      );
    }
  } else if (refuseDollarRoom) {
    limitations.push("Mathematical dollar room withheld — unsupported cash-cap mechanics in the definition.");
  } else if (req.threshold == null) {
    limitations.push("No ratio threshold supplied — mathematical dollar room not computed.");
  }

  const computationAuthority = resolveComputationAuthority({
    inputAuthority: baseAuthority,
    ebitdaAuthority,
    hasUnsupportedCashCap: identified.hasUnsupportedCashCap,
    hasUnresolvedProForma: identified.hasUnresolvedProForma,
    thresholdKnown: req.threshold != null,
    debtBasisKnown: identified.debtBasis != null,
  });

  if (computationAuthority === "INDICATIVE") {
    limitations.unshift(
      "Displayed as indicative leverage and mathematical ratio headroom until operative definitions, debt basis, cash-netting mechanics, threshold, and financial inputs are sufficiently verified (approved, period-matched).",
    );
  }

  limitations.push(CAPACITY_DISCLAIMER);

  const headroomPresentation: HeadroomPresentation =
    ratioHeadroom != null || debtHeadroomMillions != null
      ? "MATHEMATICAL_RATIO_HEADROOM"
      : "NOT_PRESENTED_AS_CAPACITY";

  const citations = [...new Set([...identified.citations, ...ratioEval.provenance.sourceCitations, ...(ebitdaBuildup?.citations ?? [])])];

  return {
    status: "COMPUTED",
    name: req.name,
    sectionRef: req.sectionRef,
    documentName: req.documentName ?? null,
    debtBasis: identified.debtBasis,
    formulaDisplay: compiled.formulaDisplay,
    citations,
    limitations,
    inputs,
    missingRequirements: [],
    currentRatio,
    threshold: req.threshold ?? null,
    ratioHeadroom,
    debtHeadroomMillions,
    runtimeStatus: ratioEval.status,
    inputAuthority: baseAuthority,
    computationAuthority,
    headroomPresentation,
    capacityDisclaimer: CAPACITY_DISCLAIMER,
    ebitdaBuildup,
  };
}

/** Recalculate a prior request against edited financial inputs (dashboard live reflow). */
export function recalculateWithFinancials(
  req: LeverageCalculationRequest,
  financials: LeverageFinancialInputs,
): ContractualLeverageResult {
  // Edited dashboard financials are always caller-supplied — never inherit APPROVED.
  return calculateContractualLeverage({
    ...req,
    financials,
    financialAuthority: "CALLER_SUPPLIED",
    // Keep line-item build-up only when authority was already approved; edits override leaf ebitda.
    ebitdaLineItems: undefined,
  });
}
