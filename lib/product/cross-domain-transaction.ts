/**
 * Package-wide cross-domain transaction evaluation.
 *
 * Composes the existing covenant-engine simulations (debt, RP waterfall,
 * asset sale) with contractual EBITDA/ratio computation — no parallel engine.
 * Gross mathematical capacity is never labeled as verified available capacity.
 */

import {
  computeCovenantPosition,
  documentsWithAssetSale,
  simulateAssetSale,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type CompanyCovenantData,
  type DebtIncurrenceSimulation,
  type RestrictedPaymentSimulation,
  type AssetSaleSimulation,
  type TransactionStatus,
} from "@/lib/covenant-engine";
import {
  computeContractualCovenantMetrics,
  type ContractualComputationResult,
} from "@/lib/product/contractual-computation";
import type { ContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";

export const CROSS_DOMAIN_EVALUATION_VERSION = "cross-domain-transaction.v1" as const;

/** Covenant families the product tracks for package-wide coverage. */
export type CovenantDomain =
  | "DEBT_INCURRENCE_REFINANCING"
  | "LIENS_SECURED_CAPACITY"
  | "RESTRICTED_PAYMENTS_BUILDER"
  | "INVESTMENTS_ACQUISITIONS"
  | "ASSET_SALES_PROCEEDS"
  | "FINANCIAL_COVENANTS_RATIO_CAPACITY"
  | "CROSS_DOCUMENT_SHARED_CAPACITY"
  | "AMENDMENT_VERSION_EFFECTIVE_DATE"
  | "LEDGER_UTILIZATION_RECLASSIFICATION"
  | "MULTI_CONDITION_SIMULATION";

export type DomainSupportLevel = "EXECUTABLE" | "PARTIAL" | "UNSUPPORTED";

export type CrossDomainScenarioKind =
  | "DEBT_FUNDED_ACQUISITION"
  | "DIVIDEND_AVAILABLE_AMOUNT"
  | "ASSET_SALE_PROCEEDS"
  | "REFINANCING"
  | "INTERCOMPANY_TRANSFER";

export interface TransactionAssumptions {
  /** Required — evaluation refuses without explicit assumptions. */
  statements: string[];
  entityScope: string[];
  evaluationDate: string;
  /** When false, remaining capacity is never claimed from empty ledger. */
  utilizationAttributed: boolean;
  utilizationCompletenessCertified: boolean;
}

export interface ContemplatedCrossDomainTransaction {
  kind: CrossDomainScenarioKind;
  label: string;
  amountMillions: number;
  /** Debt / lien leg securedness when applicable. */
  secured: boolean;
  /** Optional RP document id; defaults to first document with rpWaterfall. */
  rpDocumentId?: string;
  /** Optional asset-sale document id; defaults to first with assetSale config. */
  assetSaleDocumentId?: string;
  /** When true for asset sale, proceeds assumed reinvested within window. */
  reinvestProceeds?: boolean;
  assumptions: TransactionAssumptions;
}

export interface DomainEvaluationSlice {
  domain: CovenantDomain;
  support: DomainSupportLevel;
  status: TransactionStatus | "not_applicable";
  summary: string;
  grossCapacityMillions: number | null;
  /** Always null unless utilization attributed AND completeness certified. */
  verifiedRemainingMillions: number | null;
  citations: string[];
  missingInputs: string[];
  notes: string[];
}

export interface CrossDomainTransactionEvaluation {
  version: typeof CROSS_DOMAIN_EVALUATION_VERSION;
  scenario: ContemplatedCrossDomainTransaction;
  overallStatus: TransactionStatus;
  domains: DomainEvaluationSlice[];
  contractualComputation: ContractualComputationResult;
  debtSimulation: DebtIncurrenceSimulation | null;
  rpSimulation: RestrictedPaymentSimulation | null;
  assetSaleSimulation: AssetSaleSimulation | null;
  proForma: {
    totalNetLeverage: number | null;
    seniorSecuredNetLeverage: number | null;
    interestCoverage: number | null;
  };
  /** Package-wide narrative limitations — never invent permissions. */
  packageLimitations: string[];
  authorityNote: string;
}

export interface CovenantDomainCoverageRow {
  domain: CovenantDomain;
  support: DomainSupportLevel;
  executableToday: string;
  partial: string;
  unsupported: string;
}

/** Static coverage map — code-backed inventory, not a separate audit product. */
export function covenantDomainCoverage(): CovenantDomainCoverageRow[] {
  return [
    {
      domain: "DEBT_INCURRENCE_REFINANCING",
      support: "EXECUTABLE",
      executableToday:
        "simulateDebtIncurrence + capacityFormulas + LEVERAGE/COVERAGE/FLAT/GREATER_OF provisions",
      partial: "Refinancing continuity / maturity walls not modeled as first-class effects",
      unsupported: "First-lien-only debtBasis; instrument-specific netting bases",
    },
    {
      domain: "LIENS_SECURED_CAPACITY",
      support: "PARTIAL",
      executableToday: "Secured-side capacityFormulas and LEVERAGE_RATIO_ROOM(debtBasis=secured)",
      partial: "Lien baskets evaluated as capacity leaves; priority tiers via solver-native only when declared",
      unsupported: "Automatic-link-only liens without independent ceiling still review_required",
    },
    {
      domain: "RESTRICTED_PAYMENTS_BUILDER",
      support: "EXECUTABLE",
      executableToday: "simulateRestrictedPayment waterfall + BUILDER_BASKET + RATIO_GATE",
      partial: "Ledger pool shared across dividend/investment; not Permission-attributed",
      unsupported: "Builder builder-basket elections beyond configured CNI/equity params",
    },
    {
      domain: "INVESTMENTS_ACQUISITIONS",
      support: "PARTIAL",
      executableToday: "RP waterfall kind=investment; acquisition treated as debt+investment composition here",
      partial: "No separate Permitted Acquisition basket engine beyond provision leaves",
      unsupported: "Unrestricted subsidiary redesignation; guarantee scoping for targets",
    },
    {
      domain: "ASSET_SALES_PROCEEDS",
      support: "PARTIAL",
      executableToday: "simulateAssetSale excess-proceeds / offer trigger when assetSale config present",
      partial: "Debt repayment / capacity restore from proceeds requires contractualAuthorityRef (recipes)",
      unsupported: "Proceeds application waterfalls not configured on all packages",
    },
    {
      domain: "FINANCIAL_COVENANTS_RATIO_CAPACITY",
      support: "EXECUTABLE",
      executableToday:
        "computeContractualCovenantMetrics + buildDebtRatioTests; EBITDA derivation kinds (reported vs independent)",
      partial: "Maintenance springing covenants without financial inputs stay missing",
      unsupported: "Independent Coherent $1,700M build-up (reported/supporting only)",
    },
    {
      domain: "CROSS_DOCUMENT_SHARED_CAPACITY",
      support: "PARTIAL",
      executableToday: "Per-document min/max capacityFormulas; binding document selection on debt sim",
      partial: "SharedCapacityConstraint / solver-native when declarations present",
      unsupported: "Implicit stacking across documents without express shared cap",
    },
    {
      domain: "AMENDMENT_VERSION_EFFECTIVE_DATE",
      support: "PARTIAL",
      executableToday: "loadCompanyCovenantData date-scopes provisions; amendment recipes refuse silent graph mutate",
      partial: "Operative resolution surfaces on review workspace",
      unsupported: "Auto-recompile of IR from amendment text in product path",
    },
    {
      domain: "LEDGER_UTILIZATION_RECLASSIFICATION",
      support: "PARTIAL",
      executableToday: "RP pool from ledger; reclassification recipe with explicit election",
      partial: "Attributed utilization + completeness cert required for remaining claims",
      unsupported: "Empty ledger never treated as verified zero utilization",
    },
    {
      domain: "MULTI_CONDITION_SIMULATION",
      support: "PARTIAL",
      executableToday: "This module composes debt + RP + asset-sale + ratios for multi-family scenarios",
      partial: "Sequential Phase 4D recipes for certified worlds",
      unsupported: "Intercompany / guarantee chains without entity-scope facts",
    },
  ];
}

function refuseWithoutAssumptions(
  tx: ContemplatedCrossDomainTransaction,
): string | null {
  if (!tx.assumptions.statements.length) {
    return "Explicit transaction assumptions are required — evaluation refused.";
  }
  if (!tx.assumptions.entityScope.length) {
    return "Entity scope is required — evaluation refused.";
  }
  if (!tx.assumptions.evaluationDate) {
    return "Evaluation date is required — evaluation refused.";
  }
  return null;
}

function remainingAllowed(assumptions: TransactionAssumptions): boolean {
  return assumptions.utilizationAttributed && assumptions.utilizationCompletenessCertified;
}

function worstTxnStatus(statuses: TransactionStatus[]): TransactionStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("review_required")) return "review_required";
  if (statuses.includes("not_tested")) return "not_tested";
  return "clear";
}

/**
 * Evaluate a multi-family contemplated transaction against a company's
 * CompanyCovenantData (provisions + financials + ledger + document configs).
 */
export function evaluateCrossDomainTransaction(params: {
  data: CompanyCovenantData;
  transaction: ContemplatedCrossDomainTransaction;
  ebitdaDerivation?: ContractualEbitdaDerivation | null;
}): CrossDomainTransactionEvaluation {
  const { data, transaction: tx } = params;
  const assumptionBlock = refuseWithoutAssumptions(tx);
  const position = computeCovenantPosition(data);
  const contractualComputation = computeContractualCovenantMetrics({
    financials: data.financials,
    provisions: data.provisions,
    ebitdaDerivation: params.ebitdaDerivation ?? null,
  });

  const packageLimitations: string[] = [
    "Gross capacity is never described as verified available capacity.",
    "No contractual permissions or historical utilization are invented.",
  ];
  if (assumptionBlock) packageLimitations.push(assumptionBlock);

  const domains: DomainEvaluationSlice[] = [];
  let debtSimulation: DebtIncurrenceSimulation | null = null;
  let rpSimulation: RestrictedPaymentSimulation | null = null;
  let assetSaleSimulation: AssetSaleSimulation | null = null;
  const statusAcc: TransactionStatus[] = [];

  const allowRemaining = remainingAllowed(tx.assumptions);
  if (!allowRemaining) {
    packageLimitations.push(
      "Verified remaining capacity withheld — utilization not attributed and/or completeness not certified.",
    );
  }

  // --- Financial covenants / ratios (always when financials present) ---
  const ratioSlice: DomainEvaluationSlice = {
    domain: "FINANCIAL_COVENANTS_RATIO_CAPACITY",
    support: contractualComputation.status === "OK" ? "EXECUTABLE" : "PARTIAL",
    status: contractualComputation.status === "OK" ? "clear" : "review_required",
    summary:
      contractualComputation.contractualEbitda != null
        ? `Contractual EBITDA $${contractualComputation.contractualEbitda}M · TNL ${
            contractualComputation.leverage.totalNetLeverage?.toFixed(2) ?? "n/a"
          }x · derivation ${contractualComputation.ebitdaDerivation?.kind ?? "not attached"}`
        : "Contractual EBITDA missing",
    grossCapacityMillions:
      contractualComputation.ratioTests.find((r) => r.formulaType === "LEVERAGE_RATIO_ROOM")
        ?.ratioDebtCapacityMillions ?? null,
    verifiedRemainingMillions: null,
    citations: contractualComputation.ratioTests.map((r) => r.sectionRef),
    missingInputs: contractualComputation.missingInputs,
    notes: [
      ...contractualComputation.notes,
      ...(contractualComputation.ebitdaDerivation?.unresolvedAdjustments ?? []),
    ],
  };
  domains.push(ratioSlice);

  const runDebt = (
    amount: number,
    secured: boolean,
    label: string,
  ): DomainEvaluationSlice => {
    debtSimulation = simulateDebtIncurrence(data, position, amount, secured);
    statusAcc.push(debtSimulation.status);
    return {
      domain: "DEBT_INCURRENCE_REFINANCING",
      support: "EXECUTABLE",
      status: debtSimulation.status,
      summary: `${label}: ${debtSimulation.status} · binding ${
        debtSimulation.binding?.documentName ?? "n/a"
      } · overall gross capacity ${
        debtSimulation.overallCapacity != null && Number.isFinite(debtSimulation.overallCapacity)
          ? `$${debtSimulation.overallCapacity.toFixed(1)}M`
          : "n/a"
      }`,
      grossCapacityMillions:
        debtSimulation.overallCapacity != null && Number.isFinite(debtSimulation.overallCapacity)
          ? debtSimulation.overallCapacity
          : null,
      verifiedRemainingMillions: null,
      citations: debtSimulation.perDocument.map(
        (d) => `${d.documentName}${d.bindingProvision ? ` · ${d.bindingProvision.sectionRef}` : ""}`,
      ),
      missingInputs: debtSimulation.reason ? [debtSimulation.reason] : [],
      notes: debtSimulation.ratioTests
        .filter((r) => r.applies)
        .map(
          (r) =>
            `${r.metricName} ${r.preTransactionRatio?.toFixed(2)}x → ${r.postTransactionRatio?.toFixed(2) ?? "n/a"}x vs ${r.threshold}x (${r.status})`,
        ),
    };
  };

  const runRp = (amount: number, kind: "dividend" | "investment"): DomainEvaluationSlice => {
    const docId =
      tx.rpDocumentId ??
      data.documents.find((d) => d.rpWaterfall)?.id;
    if (!docId) {
      return {
        domain: "RESTRICTED_PAYMENTS_BUILDER",
        support: "UNSUPPORTED",
        status: "not_tested",
        summary: "No document with rpWaterfall configuration",
        grossCapacityMillions: null,
        verifiedRemainingMillions: null,
        citations: [],
        missingInputs: ["rpWaterfall"],
        notes: [],
      };
    }
    rpSimulation = simulateRestrictedPayment(data, position, docId, amount, kind);
    statusAcc.push(rpSimulation.status);
    const stepGross = Object.values(rpSimulation.stepCapacitiesRemaining).reduce((a, b) => a + b, 0);
    return {
      domain: kind === "dividend" ? "RESTRICTED_PAYMENTS_BUILDER" : "INVESTMENTS_ACQUISITIONS",
      support: "EXECUTABLE",
      status: rpSimulation.status,
      summary: `${kind} $${amount}M · ${rpSimulation.status} · remaining unallocated $${rpSimulation.remaining.toFixed(1)}M`,
      grossCapacityMillions: stepGross,
      verifiedRemainingMillions: allowRemaining ? stepGross : null,
      citations: rpSimulation.steps.map((s) => `${s.sectionRef} · ${s.basketName}`),
      missingInputs: rpSimulation.reason ? [rpSimulation.reason] : [],
      notes: [`Ledger RP pool used before sim: $${rpSimulation.poolUsed.toFixed(1)}M`],
    };
  };

  const runAssetSale = (netProceeds: number): DomainEvaluationSlice => {
    const docId =
      tx.assetSaleDocumentId ?? documentsWithAssetSale(data)[0]?.id;
    if (!docId) {
      return {
        domain: "ASSET_SALES_PROCEEDS",
        support: "UNSUPPORTED",
        status: "not_tested",
        summary: "No document with assetSale configuration",
        grossCapacityMillions: null,
        verifiedRemainingMillions: null,
        citations: [],
        missingInputs: ["assetSale"],
        notes: [],
      };
    }
    assetSaleSimulation = simulateAssetSale(
      data,
      position,
      docId,
      netProceeds,
      Boolean(tx.reinvestProceeds),
    );
    statusAcc.push(
      assetSaleSimulation.status === "clear"
        ? "clear"
        : assetSaleSimulation.status === "review_required"
          ? "review_required"
          : "not_tested",
    );
    return {
      domain: "ASSET_SALES_PROCEEDS",
      support: "PARTIAL",
      status: assetSaleSimulation.status,
      summary: `Net proceeds $${netProceeds}M · offerTriggered=${assetSaleSimulation.offerTriggered ?? false} · reinvest=${tx.reinvestProceeds ?? false}`,
      grossCapacityMillions: assetSaleSimulation.excessProceedsThreshold ?? null,
      verifiedRemainingMillions: null,
      citations: [assetSaleSimulation.documentName ?? docId],
      missingInputs: assetSaleSimulation.reason ? [assetSaleSimulation.reason] : [],
      notes: [
        "Capacity restore from repayment of debt with proceeds requires explicit contractualAuthorityRef (not inferred).",
      ],
    };
  };

  // Lien / secured capacity slice from position metrics
  const securedDoc = position.documents.find((d) => d.securedStatus === "modeled");
  domains.push({
    domain: "LIENS_SECURED_CAPACITY",
    support: securedDoc ? "PARTIAL" : "UNSUPPORTED",
    status: securedDoc ? "clear" : "not_tested",
    summary: securedDoc
      ? `Secured-side gross capacity $${securedDoc.securedCapacity?.toFixed(1) ?? "n/a"}M on ${securedDoc.documentName}`
      : "No modeled secured capacity formula",
    grossCapacityMillions: securedDoc?.securedCapacity ?? null,
    verifiedRemainingMillions: null,
    citations: securedDoc?.securedBindingProvision
      ? [securedDoc.securedBindingProvision.sectionRef]
      : [],
    missingInputs: securedDoc ? [] : ["secured capacityFormulas"],
    notes: ["Lien capacity leaves participate via capacityFormulas; not a separate lien engine."],
  });

  domains.push({
    domain: "CROSS_DOCUMENT_SHARED_CAPACITY",
    support: "PARTIAL",
    status: "clear",
    summary: `${position.documents.length} document(s) in package; binding selected as tightest modeled capacity on debt sims`,
    grossCapacityMillions: null,
    verifiedRemainingMillions: null,
    citations: position.documents.map((d) => d.documentName),
    missingInputs: [],
    notes: ["Stacking across documents is not assumed without express shared constraints."],
  });

  domains.push({
    domain: "AMENDMENT_VERSION_EFFECTIVE_DATE",
    support: "PARTIAL",
    status: "not_applicable",
    summary: `Evaluation date ${tx.assumptions.evaluationDate} — provisions must be date-scoped by loader`,
    grossCapacityMillions: null,
    verifiedRemainingMillions: null,
    citations: [],
    missingInputs: [],
    notes: ["Amendment graph mutation refused without new capacity graph (recipe gate)."],
  });

  domains.push({
    domain: "LEDGER_UTILIZATION_RECLASSIFICATION",
    support: data.ledger.length > 0 ? "PARTIAL" : "PARTIAL",
    status: "not_applicable",
    summary: `${data.ledger.length} ledger entr(y/ies) in RP pool math; attributed remaining ${
      allowRemaining ? "permitted" : "refused"
    }`,
    grossCapacityMillions: null,
    verifiedRemainingMillions: null,
    citations: [],
    missingInputs: allowRemaining ? [] : ["attributed utilization", "completeness certificate"],
    notes: [],
  });

  // Scenario-specific composition
  switch (tx.kind) {
    case "DEBT_FUNDED_ACQUISITION": {
      domains.push(runDebt(tx.amountMillions, tx.secured, "Acquisition financing debt"));
      domains.push(runRp(tx.amountMillions, "investment"));
      packageLimitations.push(
        "Acquisition target guarantee / restricted-group admission not simulated — entity scope stated in assumptions only.",
      );
      break;
    }
    case "DIVIDEND_AVAILABLE_AMOUNT": {
      domains.push(runRp(tx.amountMillions, "dividend"));
      break;
    }
    case "ASSET_SALE_PROCEEDS": {
      domains.push(runAssetSale(tx.amountMillions));
      break;
    }
    case "REFINANCING": {
      domains.push(runDebt(tx.amountMillions, tx.secured, "Refinancing incurrence"));
      packageLimitations.push(
        "Refinancing maturity / permitted refinancing conditions are not separately enforced beyond debt capacity + ratio tests.",
      );
      break;
    }
    case "INTERCOMPANY_TRANSFER": {
      domains.push({
        domain: "INVESTMENTS_ACQUISITIONS",
        support: "UNSUPPORTED",
        status: "not_tested",
        summary: "Intercompany transfer / guarantee chain requires entity-scope facts not present in legacy snapshot",
        grossCapacityMillions: null,
        verifiedRemainingMillions: null,
        citations: [],
        missingInputs: ["restricted-group entity graph", "intercompany investment basket attribution"],
        notes: ["Fail-closed — permissions not invented."],
      });
      statusAcc.push("not_tested");
      packageLimitations.push("INTERCOMPANY_TRANSFER is unsupported without entity/guarantee facts.");
      break;
    }
  }

  domains.push({
    domain: "MULTI_CONDITION_SIMULATION",
    support: "PARTIAL",
    status: assumptionBlock ? "review_required" : worstTxnStatus(statusAcc.length ? statusAcc : ["clear"]),
    summary: `Scenario ${tx.kind} composed across ${domains.length} domain slices`,
    grossCapacityMillions: null,
    verifiedRemainingMillions: null,
    citations: tx.assumptions.statements,
    missingInputs: assumptionBlock ? [assumptionBlock] : [],
    notes: [`Entity scope: ${tx.assumptions.entityScope.join(", ")}`],
  });

  const overallStatus = assumptionBlock
    ? "review_required"
    : worstTxnStatus(statusAcc.length ? statusAcc : ["review_required"]);

  const proForma = {
    totalNetLeverage:
      debtSimulation?.proForma.totalNetLeverage ??
      rpSimulation?.proFormaTotalNetLeverage ??
      assetSaleSimulation?.proFormaTotalNetLeverage ??
      contractualComputation.leverage.totalNetLeverage,
    seniorSecuredNetLeverage:
      debtSimulation?.proForma.seniorSecuredNetLeverage ??
      contractualComputation.leverage.seniorSecuredNetLeverage,
    interestCoverage:
      debtSimulation != null
        ? debtSimulation.proForma.fixedChargeCoverage
        : contractualComputation.leverage.interestCoverage,
  };

  return {
    version: CROSS_DOMAIN_EVALUATION_VERSION,
    scenario: tx,
    overallStatus,
    domains,
    contractualComputation,
    debtSimulation,
    rpSimulation,
    assetSaleSimulation,
    proForma,
    packageLimitations,
    authorityNote:
      "LEGACY_ENGINE package composition + contractual computation — NOT_CERTIFIED_4E. Gross ≠ verified remaining.",
  };
}
