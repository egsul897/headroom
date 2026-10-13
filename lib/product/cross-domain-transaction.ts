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

/**
 * Role of this module in the product architecture.
 * Supporting package-wide modeling only — not an independent certification engine.
 * Authoritative remaining / transaction-permissibility → verified execution spine.
 */
export const CROSS_DOMAIN_LAYER_ROLE =
  "SUPPORTING_PACKAGE_WIDE_MODELING_NOT_CERTIFICATION_ENGINE" as const;

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
  layerRole: typeof CROSS_DOMAIN_LAYER_ROLE;
  scenario: ContemplatedCrossDomainTransaction;
  /**
   * Legacy engine composition status (clear/blocked/…).
   * MUST NOT be presented as VERIFIED_TRANSACTION_PERMITTED.
   * Product surfaces must read `claimClass` / `transactionPermissibility`.
   */
  overallStatus: TransactionStatus;
  /**
   * Canonical authority class for this layer's outputs.
   * Always MODELED_GROSS when overallStatus is clear; never VERIFIED_*.
   */
  claimClass:
    | "MODELED_GROSS"
    | "NEEDS_INPUT"
    | "UNSUPPORTED"
    | "REVIEW_REQUIRED";
  /**
   * Always false on this path — permissibility requires the verified spine.
   */
  transactionPermissibility: false;
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

/**
 * Verified remaining must never be manufactured from caller-supplied booleans.
 * TransactionAssumptions.utilizationAttributed / utilizationCompletenessCertified
 * are disclosure flags only — remaining requires store-backed attributed ledger
 * usage AND a validated UtilizationCompletenessCertificate (Phase 4C/4E), which
 * this LEGACY cross-domain evaluator does not load. Always withhold.
 */
function remainingAllowed(_assumptions: TransactionAssumptions): boolean {
  return false;
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
  let debtSim: DebtIncurrenceSimulation | null = null;
  let rpSim: RestrictedPaymentSimulation | null = null;
  let assetSaleSim: AssetSaleSimulation | null = null;
  const statusAcc: TransactionStatus[] = [];

  const allowRemaining = remainingAllowed(tx.assumptions);
  if (!allowRemaining) {
    packageLimitations.push(
      "Verified remaining capacity withheld — LEGACY cross-domain path never publishes remaining from caller flags; requires store-backed attributed utilization + completeness certificate.",
    );
  }
  if (
    tx.assumptions.utilizationAttributed ||
    tx.assumptions.utilizationCompletenessCertified
  ) {
    packageLimitations.push(
      "Caller-supplied utilizationAttributed / utilizationCompletenessCertified flags are ignored for remaining publication (fail-closed).",
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
  ): { slice: DomainEvaluationSlice; sim: DebtIncurrenceSimulation } => {
    const sim = simulateDebtIncurrence(data, position, amount, secured);
    statusAcc.push(sim.status);
    return {
      sim,
      slice: {
        domain: "DEBT_INCURRENCE_REFINANCING",
        support: "EXECUTABLE",
        status: sim.status,
        summary: `${label}: ${sim.status} · binding ${
          sim.binding?.documentName ?? "n/a"
        } · overall gross capacity ${
          sim.overallCapacity != null && Number.isFinite(sim.overallCapacity)
            ? `$${sim.overallCapacity.toFixed(1)}M`
            : "n/a"
        }`,
        grossCapacityMillions:
          sim.overallCapacity != null && Number.isFinite(sim.overallCapacity)
            ? sim.overallCapacity
            : null,
        verifiedRemainingMillions: null,
        citations: sim.perDocument.map(
          (d) => `${d.documentName}${d.bindingProvision ? ` · ${d.bindingProvision.sectionRef}` : ""}`,
        ),
        missingInputs: sim.reason ? [sim.reason] : [],
        notes: sim.ratioTests
          .filter((r) => r.applies)
          .map(
            (r) =>
              `${r.metricName} ${r.preTransactionRatio?.toFixed(2)}x → ${r.postTransactionRatio?.toFixed(2) ?? "n/a"}x vs ${r.threshold}x (${r.status})`,
          ),
      },
    };
  };

  const runRp = (
    amount: number,
    kind: "dividend" | "investment",
  ): { slice: DomainEvaluationSlice; sim: RestrictedPaymentSimulation | null } => {
    const docId =
      tx.rpDocumentId ??
      data.documents.find((d) => d.rpWaterfall)?.id;
    if (!docId) {
      // Incomplete package coverage must worsen overallStatus (not leave "clear").
      statusAcc.push("not_tested");
      return {
        sim: null,
        slice: {
          domain:
            kind === "dividend" ? "RESTRICTED_PAYMENTS_BUILDER" : "INVESTMENTS_ACQUISITIONS",
          support: "UNSUPPORTED",
          status: "not_tested",
          summary: "No document with rpWaterfall configuration",
          grossCapacityMillions: null,
          verifiedRemainingMillions: null,
          citations: [],
          missingInputs: ["rpWaterfall"],
          notes: [
            kind === "investment"
              ? "Acquisition investment leg untested — debt capacity alone cannot permit the transaction."
              : "RP waterfall untested — dividend capacity not established.",
          ],
        },
      };
    }
    const sim = simulateRestrictedPayment(data, position, docId, amount, kind);
    statusAcc.push(sim.status);
    const stepGross = Object.values(sim.stepCapacitiesRemaining).reduce((a, b) => a + b, 0);
    return {
      sim,
      slice: {
        domain: kind === "dividend" ? "RESTRICTED_PAYMENTS_BUILDER" : "INVESTMENTS_ACQUISITIONS",
        support: "EXECUTABLE",
        status: sim.status,
        summary: `${kind} $${amount}M · ${sim.status} · remaining unallocated $${sim.remaining.toFixed(1)}M`,
        grossCapacityMillions: stepGross,
        // Never publish remaining from this supporting layer (allowRemaining is always false).
        verifiedRemainingMillions: null,
        citations: sim.steps.map((s) => `${s.sectionRef} · ${s.basketName}`),
        missingInputs: sim.reason ? [sim.reason] : [],
        notes: [`Ledger RP pool used before sim: $${sim.poolUsed.toFixed(1)}M`],
      },
    };
  };

  const runAssetSale = (
    netProceeds: number,
  ): { slice: DomainEvaluationSlice; sim: AssetSaleSimulation | null } => {
    const docId =
      tx.assetSaleDocumentId ?? documentsWithAssetSale(data)[0]?.id;
    if (!docId) {
      statusAcc.push("not_tested");
      return {
        sim: null,
        slice: {
          domain: "ASSET_SALES_PROCEEDS",
          support: "UNSUPPORTED",
          status: "not_tested",
          summary: "No document with assetSale configuration",
          grossCapacityMillions: null,
          verifiedRemainingMillions: null,
          citations: [],
          missingInputs: ["assetSale"],
          notes: ["Asset-sale path untested — incomplete package coverage blocks permissibility."],
        },
      };
    }
    const sim = simulateAssetSale(
      data,
      position,
      docId,
      netProceeds,
      Boolean(tx.reinvestProceeds),
    );
    statusAcc.push(
      sim.status === "clear"
        ? "clear"
        : sim.status === "review_required"
          ? "review_required"
          : "not_tested",
    );
    return {
      sim,
      slice: {
        domain: "ASSET_SALES_PROCEEDS",
        support: "PARTIAL",
        status: sim.status,
        summary: `Net proceeds $${netProceeds}M · offerTriggered=${sim.offerTriggered ?? false} · reinvest=${tx.reinvestProceeds ?? false}`,
        grossCapacityMillions: sim.excessProceedsThreshold ?? null,
        verifiedRemainingMillions: null,
        citations: [sim.documentName ?? docId],
        missingInputs: sim.reason ? [sim.reason] : [],
        notes: [
          "Capacity restore from repayment of debt with proceeds requires explicit contractualAuthorityRef (not inferred).",
        ],
      },
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
      const debt = runDebt(tx.amountMillions, tx.secured, "Acquisition financing debt");
      debtSim = debt.sim;
      domains.push(debt.slice);
      const rp = runRp(tx.amountMillions, "investment");
      rpSim = rp.sim;
      domains.push(rp.slice);
      packageLimitations.push(
        "Acquisition target guarantee / restricted-group admission not simulated — entity scope stated in assumptions only.",
      );
      break;
    }
    case "DIVIDEND_AVAILABLE_AMOUNT": {
      const rp = runRp(tx.amountMillions, "dividend");
      rpSim = rp.sim;
      domains.push(rp.slice);
      break;
    }
    case "ASSET_SALE_PROCEEDS": {
      const sale = runAssetSale(tx.amountMillions);
      assetSaleSim = sale.sim;
      domains.push(sale.slice);
      break;
    }
    case "REFINANCING": {
      const debt = runDebt(tx.amountMillions, tx.secured, "Refinancing incurrence");
      debtSim = debt.sim;
      domains.push(debt.slice);
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

  // Map legacy overallStatus → canonical claim class. clear ⇒ MODELED_GROSS only.
  const claimClass: CrossDomainTransactionEvaluation["claimClass"] = assumptionBlock
    ? "NEEDS_INPUT"
    : overallStatus === "clear"
      ? "MODELED_GROSS"
      : overallStatus === "blocked"
        ? "UNSUPPORTED"
        : overallStatus === "not_tested"
          ? "UNSUPPORTED"
          : "REVIEW_REQUIRED";

  const proForma = {
    totalNetLeverage:
      debtSim?.proForma.totalNetLeverage ??
      rpSim?.proFormaTotalNetLeverage ??
      assetSaleSim?.proFormaTotalNetLeverage ??
      contractualComputation.leverage.totalNetLeverage,
    seniorSecuredNetLeverage:
      debtSim?.proForma.seniorSecuredNetLeverage ??
      contractualComputation.leverage.seniorSecuredNetLeverage,
    interestCoverage:
      debtSim != null
        ? debtSim.proForma.fixedChargeCoverage
        : contractualComputation.leverage.interestCoverage,
  };

  // Defense in depth: strip any accidental remaining publication on domain slices.
  for (const d of domains) {
    if (d.verifiedRemainingMillions != null) {
      d.verifiedRemainingMillions = null;
      d.notes.push(
        "Stripped verifiedRemainingMillions — cross-domain layer cannot publish verified remaining.",
      );
    }
  }

  void allowRemaining; // retained for call-site clarity; always false by design

  return {
    version: CROSS_DOMAIN_EVALUATION_VERSION,
    layerRole: CROSS_DOMAIN_LAYER_ROLE,
    scenario: tx,
    overallStatus,
    claimClass,
    transactionPermissibility: false,
    domains,
    contractualComputation,
    debtSimulation: debtSim,
    rpSimulation: rpSim,
    assetSaleSimulation: assetSaleSim,
    proForma,
    packageLimitations: [
      ...packageLimitations,
      "claimClass is MODELED_GROSS (or NEEDS_INPUT/UNSUPPORTED/REVIEW_REQUIRED) — never VERIFIED_TRANSACTION_PERMITTED.",
      "Route authoritative remaining and permissibility through executeUnifiedVerifiedTransaction / verified spine.",
    ],
    authorityNote:
      "SUPPORTING cross-domain modeling (LEGACY_ENGINE composition + contractual computation) — NOT_CERTIFIED_4E. Gross ≠ verified remaining. transactionPermissibility=false always on this path.",
  };
}
