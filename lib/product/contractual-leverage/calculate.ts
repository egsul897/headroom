/**
 * End-to-end contractual leverage calculation:
 * identify definitions → compile IR (provenance) → resolve inputs → arithmetic.
 *
 * Fail-closed: missing critical inputs or unsupported shapes never invent values.
 *
 * Arithmetic is local (DIVIDE / SUBTRACT / MAX matching the compiled IR shape).
 * Product code must not import Phase-4 raw runtime primitives — see
 * tests/contract-model/verified-execution.test.ts §17.
 */

import { compileLeverageExpressions } from "./compile";
import { identifyLeverageComponents } from "./identify";
import type {
  ContractualLeverageResult,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
  ResolvedInputLine,
} from "./types";

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

/**
 * Calculate one contractual leverage ratio (and optional debt headroom) from
 * definition texts + verified financial inputs. Pure — no I/O, no company branches.
 *
 * Math mirrors compiled IR: (Debt [− Cash]) / EBITDA and
 * max(0, threshold × EBITDA − netDebt).
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

  const ebitda = req.financials.ebitda!;
  const grossDebt =
    (identified.debtBasis === "secured" ? req.financials.securedDebt : req.financials.totalDebt)!;
  const netDebt = identified.netsCash ? grossDebt - req.financials.cash! : grossDebt;

  if (!Number.isFinite(ebitda) || !Number.isFinite(netDebt)) {
    return {
      ...base,
      status: "EVALUATION_ERROR",
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations: identified.citations,
      limitations: identified.limitations,
      inputs,
      missingRequirements: ["Finite contractual financial inputs"],
      runtimeStatus: "EVALUATION_ERROR",
    };
  }

  const currentRatio = netDebt / ebitda;
  let ratioHeadroom: number | null = null;
  let debtHeadroomMillions: number | null = null;
  const limitations = [...identified.limitations];

  if (req.threshold != null && Number.isFinite(req.threshold)) {
    ratioHeadroom = req.threshold - currentRatio;
  }

  if (compiled.debtHeadroomExpression && req.threshold != null && Number.isFinite(req.threshold)) {
    // max(0, threshold × EBITDA − netDebt) — same shape as compiled IR MAX.
    debtHeadroomMillions = Math.max(0, req.threshold * ebitda - netDebt);
  } else if (req.threshold == null) {
    limitations.push("No ratio threshold supplied — dollar debt headroom not computed.");
  }

  return {
    status: "COMPUTED",
    name: req.name,
    sectionRef: req.sectionRef,
    documentName: req.documentName ?? null,
    debtBasis: identified.debtBasis,
    formulaDisplay: compiled.formulaDisplay,
    citations: identified.citations,
    limitations,
    inputs,
    missingRequirements: [],
    currentRatio,
    threshold: req.threshold ?? null,
    ratioHeadroom,
    debtHeadroomMillions,
    runtimeStatus: "EXECUTABLE",
  };
}

/** Recalculate a prior request against edited financial inputs (dashboard live reflow). */
export function recalculateWithFinancials(
  req: LeverageCalculationRequest,
  financials: LeverageFinancialInputs,
): ContractualLeverageResult {
  return calculateContractualLeverage({ ...req, financials });
}
