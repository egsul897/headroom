/**
 * Browser-safe indicative reflow for edited dashboard financials.
 *
 * Does NOT import the IR runtime (node:crypto via evaluate-expression).
 * Arithmetic mirrors the net-leverage IR tree for live edits only; results
 * remain CALLER_SUPPLIED / INDICATIVE and never claim legal capacity.
 *
 * Server/tests use calculateContractualLeverage (full IR path).
 */

import { CAPACITY_DISCLAIMER } from "./disclaimer";
import { identifyLeverageComponents } from "./identify";
import type {
  ContractualLeverageResult,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
} from "./types";

export function reflowIndicativeLeverage(
  req: LeverageCalculationRequest,
  financials: LeverageFinancialInputs,
): ContractualLeverageResult {
  const base: ContractualLeverageResult = {
    status: "MISSING_DEFINITIONS",
    name: req.name,
    sectionRef: req.sectionRef,
    documentName: req.documentName ?? null,
    debtBasis: null,
    formulaDisplay: null,
    citations: [],
    limitations: [
      "Live dashboard reflow uses caller-edited financials (CALLER_SUPPLIED) — indicative mathematical result only.",
      CAPACITY_DISCLAIMER,
    ],
    inputs: [],
    missingRequirements: [],
    currentRatio: null,
    threshold: req.threshold ?? null,
    ratioHeadroom: null,
    debtHeadroomMillions: null,
    runtimeStatus: null,
    inputAuthority: "CALLER_SUPPLIED",
    computationAuthority: "INDICATIVE",
    contractualEligibility: "PROVISIONAL_HEURISTIC",
    headroomPresentation: "NOT_PRESENTED_AS_CAPACITY",
    capacityDisclaimer: CAPACITY_DISCLAIMER,
    ebitdaBuildup: null,
    ns4SnapshotId: null,
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
      limitations: [...identified.limitations, ...base.limitations],
    };
  }

  const debt = identified.debtBasis === "secured" ? financials.securedDebt : financials.totalDebt;
  const inputs = [
    {
      key: "EBITDA",
      label: "Consolidated EBITDA (covenant)",
      valueMillions: financials.ebitda,
      required: true,
      status: financials.ebitda != null && financials.ebitda !== 0 ? ("RESOLVED" as const) : ("MISSING" as const),
      authority: "CALLER_SUPPLIED" as const,
    },
    {
      key: identified.debtBasis === "secured" ? "Secured Debt" : "Total Debt",
      label: identified.debtBasis === "secured" ? "Secured Debt" : "Total Debt",
      valueMillions: debt,
      required: true,
      status: debt != null ? ("RESOLVED" as const) : ("MISSING" as const),
      authority: "CALLER_SUPPLIED" as const,
    },
    ...(identified.netsCash
      ? [
          {
            key: "Cash",
            label: "Unrestricted cash & Cash Equivalents",
            valueMillions: financials.cash,
            required: true,
            status: financials.cash != null ? ("RESOLVED" as const) : ("MISSING" as const),
            authority: "CALLER_SUPPLIED" as const,
          },
        ]
      : []),
  ];

  const missing = inputs.filter((i) => i.status === "MISSING").map((i) => i.label);
  if (missing.length > 0 || financials.ebitda === 0) {
    return {
      ...base,
      status: "MISSING_INPUTS",
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations: identified.citations,
      limitations: [...identified.limitations, ...base.limitations],
      inputs,
      missingRequirements: missing.length ? missing : ["Non-zero Consolidated EBITDA (covenant)"],
    };
  }

  const netDebt = identified.netsCash ? debt! - financials.cash! : debt!;
  const currentRatio = netDebt / financials.ebitda!;
  const ratioHeadroom = req.threshold != null ? req.threshold - currentRatio : null;
  let debtHeadroomMillions: number | null = null;
  const limitations = [
    ...identified.limitations,
    "Displayed as indicative leverage and mathematical ratio headroom until operative definitions, debt basis, cash-netting mechanics, threshold, and financial inputs are sufficiently verified (approved, period-matched).",
    ...base.limitations,
  ];

  if (identified.hasUnsupportedCashCap) {
    limitations.push("Mathematical dollar room withheld — unsupported cash-cap mechanics in the definition.");
  } else if (req.threshold != null && req.threshold > 0) {
    debtHeadroomMillions = Math.max(0, req.threshold * financials.ebitda! - netDebt);
  }

  return {
    status: "COMPUTED",
    name: req.name,
    sectionRef: req.sectionRef,
    documentName: req.documentName ?? null,
    debtBasis: identified.debtBasis,
    formulaDisplay: identified.formulaDisplay,
    citations: identified.citations,
    limitations,
    inputs,
    missingRequirements: [],
    currentRatio,
    threshold: req.threshold ?? null,
    ratioHeadroom,
    debtHeadroomMillions,
    runtimeStatus: "EXECUTABLE",
    inputAuthority: "CALLER_SUPPLIED",
    computationAuthority: "INDICATIVE",
    contractualEligibility: "PROVISIONAL_HEURISTIC",
    headroomPresentation: ratioHeadroom != null || debtHeadroomMillions != null ? "MATHEMATICAL_RATIO_HEADROOM" : "NOT_PRESENTED_AS_CAPACITY",
    capacityDisclaimer: CAPACITY_DISCLAIMER,
    ebitdaBuildup: null,
    ns4SnapshotId: null,
  };
}
