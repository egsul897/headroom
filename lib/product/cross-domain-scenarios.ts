/**
 * Representative cross-domain scenarios for authentic / seed packages.
 * Scenario data only — evaluation uses evaluateCrossDomainTransaction (no company branches).
 */

import type { CompanyCovenantData } from "@/lib/covenant-engine";
import {
  evaluateCrossDomainTransaction,
  type ContemplatedCrossDomainTransaction,
  type CrossDomainTransactionEvaluation,
} from "./cross-domain-transaction";
import type { ContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import {
  resolveContractualEbitdaDerivation,
  COHERENT_EBITDA_EVIDENCE,
  MATTHEWS_EBITDA_EVIDENCE,
} from "@/lib/financial-certificate-engine";
import { COHERENT_DATA } from "@/prisma/seed-data";

function baseAssumptions(
  over: Partial<ContemplatedCrossDomainTransaction["assumptions"]> &
    Pick<ContemplatedCrossDomainTransaction["assumptions"], "statements" | "entityScope" | "evaluationDate">,
): ContemplatedCrossDomainTransaction["assumptions"] {
  return {
    utilizationAttributed: false,
    utilizationCompletenessCertified: false,
    ...over,
  };
}

/** Coherent seed package — multi-family scenarios. */
export function coherentPackageData(): CompanyCovenantData {
  return COHERENT_DATA as CompanyCovenantData;
}

export function coherentDebtFundedAcquisition(amountMillions = 150): ContemplatedCrossDomainTransaction {
  return {
    kind: "DEBT_FUNDED_ACQUISITION",
    label: `Debt-funded acquisition — $${amountMillions}M secured financing + investment capacity`,
    amountMillions,
    secured: true,
    assumptions: baseAssumptions({
      evaluationDate: "2026-06-30",
      entityScope: ["BORROWER", "RESTRICTED_SUBSIDIARY"],
      statements: [
        "Target joins restricted group; no unrestricted subsidiary election.",
        "Financing is secured incremental debt tested under Credit Agreement + Indenture capacityFormulas.",
        "Investment leg tested via Indenture RP waterfall kind=investment (not a separate PA basket).",
        "No attributed historical utilization; remaining capacity not claimed.",
      ],
    }),
  };
}

export function coherentDividend(amountMillions = 50): ContemplatedCrossDomainTransaction {
  return {
    kind: "DIVIDEND_AVAILABLE_AMOUNT",
    label: `Dividend — $${amountMillions}M against builder / general / ratio-gate waterfall`,
    amountMillions,
    secured: false,
    assumptions: baseAssumptions({
      evaluationDate: "2026-06-30",
      entityScope: ["BORROWER"],
      statements: [
        "Cash dividend by Borrower to public holders.",
        "Uses Indenture §3.4 RP waterfall (builder → general → ratio gate).",
        "Ledger pool usage applied before simulation; empty attributed utilization not assumed zero for remaining claims.",
      ],
    }),
  };
}

export function coherentAssetSale(netProceedsMillions = 200): ContemplatedCrossDomainTransaction {
  return {
    kind: "ASSET_SALE_PROCEEDS",
    label: `Asset sale — $${netProceedsMillions}M net proceeds (no reinvestment assumed)`,
    amountMillions: netProceedsMillions,
    secured: false,
    reinvestProceeds: false,
    assumptions: baseAssumptions({
      evaluationDate: "2026-06-30",
      entityScope: ["BORROWER", "RESTRICTED_SUBSIDIARY"],
      statements: [
        "Disposition of non-core assets by a Restricted Subsidiary.",
        "Proceeds not reinvested within the contractual window for this simulation.",
        "Debt repayment / basket restore from proceeds not inferred without contractualAuthorityRef.",
      ],
    }),
  };
}

export function coherentRefinancing(amountMillions = 500): ContemplatedCrossDomainTransaction {
  return {
    kind: "REFINANCING",
    label: `Refinancing — $${amountMillions}M secured refinancing incurrence`,
    amountMillions,
    secured: true,
    assumptions: baseAssumptions({
      evaluationDate: "2026-06-30",
      entityScope: ["BORROWER"],
      statements: [
        "New secured notes refinance existing secured indebtedness in equal principal amount.",
        "Tested as secured debt incurrence under package capacityFormulas + ratio tests.",
        "Permitted refinancing maturity walls are not separately encoded — limitation disclosed.",
      ],
    }),
  };
}

export function coherentIntercompanyTransfer(amountMillions = 25): ContemplatedCrossDomainTransaction {
  return {
    kind: "INTERCOMPANY_TRANSFER",
    label: `Intercompany transfer — $${amountMillions}M (expected unsupported)`,
    amountMillions,
    secured: false,
    assumptions: baseAssumptions({
      evaluationDate: "2026-06-30",
      entityScope: ["BORROWER", "RESTRICTED_SUBSIDIARY"],
      statements: [
        "Loan from Borrower to a non-guarantor Restricted Subsidiary.",
        "Entity/guarantee graph facts required — must fail closed if absent.",
      ],
    }),
  };
}

export function evaluateCoherentScenario(
  tx: ContemplatedCrossDomainTransaction,
): CrossDomainTransactionEvaluation {
  const derivation = resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE);
  return evaluateCrossDomainTransaction({
    data: coherentPackageData(),
    transaction: tx,
    ebitdaDerivation: derivation,
  });
}

/** Matthews-shaped package: financials + secured ratio debt provision (minimal). */
export function matthewsMinimalPackageData(): CompanyCovenantData {
  return {
    companyId: "matthews",
    documents: [
      {
        id: "matw-indenture",
        name: "2027 Senior Secured Notes Indenture",
        type: "INDENTURE",
        governs: "Second lien notes",
        capacityFormulas: {
          secured: { op: "REF", code: "ind_ratio_debt_secured" },
          unsecured: { op: "REF", code: "ind_ratio_debt_secured" },
        },
      },
    ],
    provisions: [
      {
        id: "prov-matw-ssnl",
        documentId: "matw-indenture",
        code: "ind_ratio_debt_secured",
        basketName: "Permitted Debt — Secured Net Leverage",
        sectionRef: "Permitted Debt cl. (1)(b)(x) — SSNL ≤ 3.50x",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 3.5,
        params: { debtBasis: "secured" },
      },
    ],
    financials: {
      ebitda: 128.313,
      cash: 33.513,
      interestExpense: 54.64,
      cumulativeNetIncome: -3.472,
      equityProceedsSinceIssue: 0,
      assumedNewDebtRatePct: 8.625,
      totalDebt: 809.211,
      securedDebt: 778.882,
    },
    ledger: [],
  };
}

export function matthewsRefinancing(amountMillions = 50): ContemplatedCrossDomainTransaction {
  return {
    kind: "REFINANCING",
    label: `Matthews refinancing — $${amountMillions}M secured (SSNL already above 3.50x)`,
    amountMillions,
    secured: true,
    assumptions: baseAssumptions({
      evaluationDate: "2024-12-31",
      entityScope: ["BORROWER"],
      statements: [
        "Secured refinancing tested solely under Indenture SSNL ≤ 3.50x ratio room (minimal package).",
        "Full Matthews Permission graph not required for this ratio-room demonstration.",
      ],
    }),
  };
}

export function evaluateMatthewsScenario(
  tx: ContemplatedCrossDomainTransaction,
  data: CompanyCovenantData = matthewsMinimalPackageData(),
  derivation: ContractualEbitdaDerivation = resolveContractualEbitdaDerivation(MATTHEWS_EBITDA_EVIDENCE),
): CrossDomainTransactionEvaluation {
  return evaluateCrossDomainTransaction({ data, transaction: tx, ebitdaDerivation: derivation });
}

/** List all Coherent demo scenarios for product surfaces. */
export function listCoherentCrossDomainScenarios(): ContemplatedCrossDomainTransaction[] {
  return [
    coherentDebtFundedAcquisition(),
    coherentDividend(),
    coherentAssetSale(),
    coherentRefinancing(),
    coherentIntercompanyTransfer(),
  ];
}

/**
 * Company-agnostic scenario templates (amounts + assumption shells).
 * Evaluation uses whatever CompanyCovenantData the loader supplies.
 */
export function defaultCrossDomainScenarioTemplates(evaluationDate: string): ContemplatedCrossDomainTransaction[] {
  const entityScope = ["BORROWER", "RESTRICTED_SUBSIDIARY"];
  return [
    {
      kind: "DEBT_FUNDED_ACQUISITION",
      label: "Debt-funded acquisition — $150M secured financing + investment capacity",
      amountMillions: 150,
      secured: true,
      assumptions: baseAssumptions({
        evaluationDate,
        entityScope,
        statements: [
          "Target joins restricted group; no unrestricted subsidiary election.",
          "Secured incremental debt tested under package capacityFormulas.",
          "Investment leg tested via RP waterfall kind=investment when configured.",
          "No attributed historical utilization; remaining capacity not claimed.",
        ],
      }),
    },
    {
      kind: "DIVIDEND_AVAILABLE_AMOUNT",
      label: "Dividend — $50M against RP waterfall / available amount",
      amountMillions: 50,
      secured: false,
      assumptions: baseAssumptions({
        evaluationDate,
        entityScope: ["BORROWER"],
        statements: [
          "Cash dividend by Borrower.",
          "Uses configured RP waterfall when present.",
          "Ledger pool applied before simulation; remaining not claimed without attribution.",
        ],
      }),
    },
    {
      kind: "ASSET_SALE_PROCEEDS",
      label: "Asset sale — $200M net proceeds (no reinvestment assumed)",
      amountMillions: 200,
      secured: false,
      reinvestProceeds: false,
      assumptions: baseAssumptions({
        evaluationDate,
        entityScope,
        statements: [
          "Disposition by a Restricted Subsidiary.",
          "Proceeds not reinvested within the contractual window for this simulation.",
          "Basket restore from debt repayment not inferred without contractualAuthorityRef.",
        ],
      }),
    },
    {
      kind: "REFINANCING",
      label: "Refinancing — $500M secured refinancing incurrence",
      amountMillions: 500,
      secured: true,
      assumptions: baseAssumptions({
        evaluationDate,
        entityScope: ["BORROWER"],
        statements: [
          "New secured debt refinances existing secured indebtedness.",
          "Tested as secured debt incurrence + ratio tests.",
          "Maturity walls not separately encoded — limitation disclosed in evaluation.",
        ],
      }),
    },
    {
      kind: "INTERCOMPANY_TRANSFER",
      label: "Intercompany transfer — $25M (fails closed without entity graph)",
      amountMillions: 25,
      secured: false,
      assumptions: baseAssumptions({
        evaluationDate,
        entityScope,
        statements: [
          "Loan from Borrower to a non-guarantor Restricted Subsidiary.",
          "Must fail closed without entity/guarantee facts.",
        ],
      }),
    },
  ];
}

export function evaluateDefaultCrossDomainScenarios(params: {
  data: CompanyCovenantData;
  evaluationDate: string;
  ebitdaDerivation?: ContractualEbitdaDerivation | null;
}): CrossDomainTransactionEvaluation[] {
  return defaultCrossDomainScenarioTemplates(params.evaluationDate).map((tx) =>
    evaluateCrossDomainTransaction({
      data: params.data,
      transaction: tx,
      ebitdaDerivation: params.ebitdaDerivation ?? null,
    }),
  );
}
