/**
 * Synthetic calculation example library for verified covenant mechanics.
 *
 * IMPORTANT:
 * - Inputs marked `inputKind: "synthetic"` are NOT authentic customer financials.
 * - Expected results are stored separately from any engine prediction.
 * - These cases do not promote provisions into certified legal truth.
 */

import { createHash } from "node:crypto";

export type CalcScenarioKind =
  | "BELOW_LIMIT"
  | "AT_LIMIT"
  | "ABOVE_LIMIT"
  | "MULTI_BASKET"
  | "SHARED_CAPACITY"
  | "RATIO_CHANGE"
  | "DIVIDEND"
  | "INVESTMENT"
  | "EQUITY_CONTRIBUTION"
  | "DEBT_REPAYMENT"
  | "RECLASSIFICATION"
  | "SEQUENTIAL"
  | "CROSS_DOCUMENT";

export interface SyntheticFinancialInputs {
  inputKind: "synthetic";
  currency: "USD";
  consolidatedEBITDA?: number;
  consolidatedTotalDebt?: number;
  unrestrictedCash?: number;
  availableAmountBuilder?: number;
  outstandingInvestments?: number;
  outstandingRestrictedPayments?: number;
  outstandingIndebtedness?: number;
  notes?: string;
}

export interface CalculationExampleCase {
  caseId: string;
  schema: "kf-calculation-example.v1";
  mechanicId: string;
  mechanicLabel: string;
  scenarioKind: CalcScenarioKind;
  sourceLinked: boolean;
  /** Optional authentic provision reference — never invents operative authority. */
  sourceRef?: {
    sourceId?: string;
    sectionCitation?: string;
    documentClass?: string;
    note: string;
  };
  inputs: SyntheticFinancialInputs;
  proposedTransaction: {
    action: string;
    amount: number;
    currency: "USD";
    baskets?: string[];
  };
  /** Independently stated expected outcome — not an engine prediction. */
  expected: {
    permitted: boolean;
    remainingCapacity?: number;
    blockedReason?: string;
    notes: string;
  };
  /** Engine prediction slot — left null until a graded run fills it. */
  enginePrediction: null | {
    permitted: boolean;
    remainingCapacity?: number;
    runId?: string;
  };
  verificationStatus: "SYNTHETIC_UNVERIFIED" | "SYNTHETIC_VALIDATED";
  createdAt: string;
}

function caseId(parts: string[]): string {
  return `calc:${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

/** Build a starter library of independently specified synthetic cases. */
export function buildSyntheticCalculationLibrary(params?: {
  sourceAnchors?: Array<{ sourceId: string; documentClass: string; sectionCitation?: string }>;
}): CalculationExampleCase[] {
  const now = new Date().toISOString();
  const anchors = params?.sourceAnchors ?? [];
  const anchor = (i: number) => anchors[i % Math.max(anchors.length, 1)];

  const specs: Array<Omit<CalculationExampleCase, "caseId" | "schema" | "createdAt" | "enginePrediction">> = [
    {
      mechanicId: "general-investment-basket-fixed",
      mechanicLabel: "Fixed-dollar general investment basket",
      scenarioKind: "BELOW_LIMIT",
      sourceLinked: anchors.length > 0,
      sourceRef: anchors.length
        ? {
            sourceId: anchor(0)!.sourceId,
            documentClass: anchor(0)!.documentClass,
            sectionCitation: anchor(0)!.sectionCitation,
            note: "Anchor only — synthetic inputs are not certificate evidence",
          }
        : undefined,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        outstandingInvestments: 10_000_000,
        notes: "Synthetic utilization against a $50mm fixed basket",
      },
      proposedTransaction: {
        action: "MAKE_INVESTMENT",
        amount: 25_000_000,
        currency: "USD",
        baskets: ["general-investments"],
      },
      expected: {
        permitted: true,
        remainingCapacity: 15_000_000,
        notes: "10 + 25 < 50 fixed cap → permitted with 15 remaining",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "general-investment-basket-fixed",
      mechanicLabel: "Fixed-dollar general investment basket",
      scenarioKind: "AT_LIMIT",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        outstandingInvestments: 40_000_000,
      },
      proposedTransaction: {
        action: "MAKE_INVESTMENT",
        amount: 10_000_000,
        currency: "USD",
        baskets: ["general-investments"],
      },
      expected: {
        permitted: true,
        remainingCapacity: 0,
        notes: "Exactly at $50mm cap",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "general-investment-basket-fixed",
      mechanicLabel: "Fixed-dollar general investment basket",
      scenarioKind: "ABOVE_LIMIT",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        outstandingInvestments: 45_000_000,
      },
      proposedTransaction: {
        action: "MAKE_INVESTMENT",
        amount: 10_000_000,
        currency: "USD",
        baskets: ["general-investments"],
      },
      expected: {
        permitted: false,
        remainingCapacity: 5_000_000,
        blockedReason: "Exceeds fixed basket capacity",
        notes: "45 + 10 > 50",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "available-amount-rp",
      mechanicLabel: "Restricted payment from Available Amount builder",
      scenarioKind: "DIVIDEND",
      sourceLinked: anchors.length > 1,
      sourceRef: anchors.length > 1
        ? {
            sourceId: anchor(1)!.sourceId,
            documentClass: anchor(1)!.documentClass,
            note: "Builder basket pattern — synthetic builder balance",
          }
        : undefined,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        availableAmountBuilder: 75_000_000,
        outstandingRestrictedPayments: 20_000_000,
      },
      proposedTransaction: {
        action: "RESTRICTED_PAYMENT",
        amount: 30_000_000,
        currency: "USD",
        baskets: ["available-amount"],
      },
      expected: {
        permitted: true,
        remainingCapacity: 25_000_000,
        notes: "Builder 75 − prior RP 20 − dividend 30 = 25",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "shared-rp-investment-capacity",
      mechanicLabel: "Shared RP / investment builder capacity",
      scenarioKind: "SHARED_CAPACITY",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        availableAmountBuilder: 40_000_000,
        outstandingRestrictedPayments: 10_000_000,
        outstandingInvestments: 15_000_000,
        notes: "Investments and RPs share Available Amount",
      },
      proposedTransaction: {
        action: "MAKE_INVESTMENT",
        amount: 20_000_000,
        currency: "USD",
        baskets: ["available-amount", "investments"],
      },
      expected: {
        permitted: false,
        remainingCapacity: 15_000_000,
        blockedReason: "Shared capacity exhausted by prior RP + investments",
        notes: "40 − 10 − 15 = 15 available; 20 proposed → blocked",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "leverage-ratio-debt-incurrence",
      mechanicLabel: "Incurrence leverage test for incremental debt",
      scenarioKind: "RATIO_CHANGE",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        consolidatedEBITDA: 200_000_000,
        consolidatedTotalDebt: 800_000_000,
        notes: "Pro forma leverage must not exceed 5.00x",
      },
      proposedTransaction: {
        action: "INCUR_DEBT",
        amount: 150_000_000,
        currency: "USD",
        baskets: ["ratio-debt"],
      },
      expected: {
        permitted: true,
        notes: "Pro forma debt 950 / EBITDA 200 = 4.75x ≤ 5.00x",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "leverage-ratio-debt-incurrence",
      mechanicLabel: "Incurrence leverage test for incremental debt",
      scenarioKind: "ABOVE_LIMIT",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        consolidatedEBITDA: 200_000_000,
        consolidatedTotalDebt: 900_000_000,
      },
      proposedTransaction: {
        action: "INCUR_DEBT",
        amount: 150_000_000,
        currency: "USD",
        baskets: ["ratio-debt"],
      },
      expected: {
        permitted: false,
        blockedReason: "Pro forma leverage 5.25x exceeds 5.00x",
        notes: "1050 / 200 = 5.25x",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "equity-contribution-builder",
      mechanicLabel: "Equity contribution increases Available Amount",
      scenarioKind: "EQUITY_CONTRIBUTION",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        availableAmountBuilder: 10_000_000,
      },
      proposedTransaction: {
        action: "EQUITY_CONTRIBUTION",
        amount: 50_000_000,
        currency: "USD",
        baskets: ["available-amount-builder"],
      },
      expected: {
        permitted: true,
        remainingCapacity: 60_000_000,
        notes: "Contribution adds to builder; not a restricted payment",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "debt-repayment-reduces-outstanding",
      mechanicLabel: "Debt repayment frees outstanding debt basket",
      scenarioKind: "DEBT_REPAYMENT",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        outstandingIndebtedness: 100_000_000,
      },
      proposedTransaction: {
        action: "REPAY_DEBT",
        amount: 25_000_000,
        currency: "USD",
        baskets: ["permitted-indebtedness-outstanding"],
      },
      expected: {
        permitted: true,
        remainingCapacity: 75_000_000,
        notes: "Repayment reduces outstanding utilization (synthetic ledger)",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "multi-basket-stacking",
      mechanicLabel: "Transaction split across fixed + ratio baskets",
      scenarioKind: "MULTI_BASKET",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        outstandingInvestments: 40_000_000,
        consolidatedEBITDA: 100_000_000,
        consolidatedTotalDebt: 300_000_000,
        notes: "Fixed basket remaining 10; ratio basket available",
      },
      proposedTransaction: {
        action: "MAKE_INVESTMENT",
        amount: 30_000_000,
        currency: "USD",
        baskets: ["general-investments", "ratio-investments"],
      },
      expected: {
        permitted: true,
        remainingCapacity: 0,
        notes: "Allocate 10 to fixed + 20 to ratio path (illustrative stacking)",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "reclassification-between-baskets",
      mechanicLabel: "Reclassify investment from general to ratio basket",
      scenarioKind: "RECLASSIFICATION",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        outstandingInvestments: 50_000_000,
        consolidatedEBITDA: 150_000_000,
      },
      proposedTransaction: {
        action: "RECLASSIFY_INVESTMENT",
        amount: 20_000_000,
        currency: "USD",
        baskets: ["general-investments", "ratio-investments"],
      },
      expected: {
        permitted: true,
        notes: "Reclassification frees general basket without new cash outlay",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "sequential-builder-then-rp",
      mechanicLabel: "Sequential equity contribution then dividend",
      scenarioKind: "SEQUENTIAL",
      sourceLinked: false,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        availableAmountBuilder: 5_000_000,
        outstandingRestrictedPayments: 0,
      },
      proposedTransaction: {
        action: "RESTRICTED_PAYMENT",
        amount: 40_000_000,
        currency: "USD",
        baskets: ["available-amount"],
      },
      expected: {
        permitted: false,
        remainingCapacity: 5_000_000,
        blockedReason: "Insufficient builder before contribution step",
        notes: "Without prior contribution, dividend blocked; pair with equity-contribution case",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
    {
      mechanicId: "cross-document-lien-debt-pairing",
      mechanicLabel: "Debt permission does not alone grant lien permission",
      scenarioKind: "CROSS_DOCUMENT",
      sourceLinked: anchors.length > 0,
      sourceRef: anchors.length
        ? {
            sourceId: anchor(0)!.sourceId,
            documentClass: anchor(0)!.documentClass,
            note: "Cross-document interaction — discovery only, not certified pairing",
          }
        : undefined,
      inputs: {
        inputKind: "synthetic",
        currency: "USD",
        outstandingIndebtedness: 0,
        notes: "Debt basket open; lien basket closed in this synthetic package",
      },
      proposedTransaction: {
        action: "INCUR_SECURED_DEBT",
        amount: 10_000_000,
        currency: "USD",
        baskets: ["ratio-debt", "general-liens"],
      },
      expected: {
        permitted: false,
        blockedReason: "Lien capacity missing despite debt basket room",
        notes: "Illustrates debt→lien dependency; not automatic permission",
      },
      verificationStatus: "SYNTHETIC_VALIDATED",
    },
  ];

  return specs.map((s) => ({
    ...s,
    caseId: caseId([s.mechanicId, s.scenarioKind, String(s.proposedTransaction.amount), s.expected.notes]),
    schema: "kf-calculation-example.v1" as const,
    createdAt: now,
    enginePrediction: null,
  }));
}
