/**
 * Package-wide cross-domain transaction evaluation.
 *
 * CANONICAL implementation (PR #340 · cross-domain-transaction.v2).
 * Competing v1 modules on #334/#336 must not land: #336 still gates remaining on
 * caller booleans; #334 always-withholds but never routes through
 * resolveUtilization / computeVerifiedRemaining. Retain this module only.
 *
 * Composes the existing covenant-engine simulations (debt, RP waterfall,
 * asset sale) with contractual EBITDA/ratio computation — no parallel engine.
 *
 * Verified remaining capacity is authorized ONLY via the canonical
 * resolveUtilization + computeVerifiedRemaining path (attributed ledger
 * evidence + trusted completeness certificate + identity match). Caller-supplied
 * utilizationAttributed / utilizationCompletenessCertified booleans NEVER
 * authorize verifiedRemainingMillions. Gross / modeled remaining are never
 * relabeled as verified.
 *
 * Field trust model for CrossDomainUtilizationAuthority:
 * - CALLER-SUPPLIED (untrusted alone): capacityRuleId, asOf, companyId,
 *   documentId, provisionId, periodKey, records[], completenessCertificate blob
 *   (including issuer.role / actorId strings), sharedCapacityId, crossDocumentConstraints,
 *   allowSyntheticRemaining.
 * - INDEPENDENTLY AUTHENTICATED (host / company-state): expectedIdentity from
 *   CompanyCovenantData + evaluation date; TrustedIssuerAuthorizationContext
 *   principals registry (never derived from the certificate); record approval /
 *   authenticity semantics enforced inside resolveUtilization; production gate
 *   via authorizeCompletenessIssuer + requireNonFixtureIdentity.
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
  type FinancialSnapshotInput,
  type TransactionStatus,
} from "@/lib/covenant-engine";
import {
  computeVerifiedRemaining,
  type VerifiedRemainingResult,
} from "@/lib/capacity/verified-remaining";
import { resolveUtilization } from "@/lib/capacity/utilization-resolver";
import type { TrustedIssuerAuthorizationContext } from "@/lib/capacity/completeness-issuer-auth";
import type {
  UtilizationCompletenessCertificate,
  UtilizationEvidenceRecord,
} from "@/lib/capacity/utilization-types";
import {
  computeContractualCovenantMetrics,
  type ContractualComputationResult,
} from "@/lib/product/contractual-computation";
import type { ContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";

export const CROSS_DOMAIN_EVALUATION_VERSION = "cross-domain-transaction.v2" as const;
/** Sole canonical owner — do not land competing v1 copies from #334/#336. */
export const CROSS_DOMAIN_CANONICAL_OWNER = "PR#340" as const;

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
  /**
   * Caller-supplied flags. Kept for API compatibility / disclosure only.
   * They NEVER authorize verifiedRemainingMillions — that requires
   * CrossDomainUtilizationAuthority through the canonical capacity path.
   */
  utilizationAttributed?: boolean;
  utilizationCompletenessCertified?: boolean;
}

/**
 * Canonical utilization / capacity authority for verified remaining.
 * Must carry attributed evidence + trusted completeness + identity.
 * Every field on this object is caller-constructed; authorization still
 * requires expectedIdentity binding + host trustedIssuerAuth (or explicit
 * allowSyntheticRemaining demo hatch that never runs in production loaders).
 */
export interface CrossDomainUtilizationAuthority {
  capacityRuleId: string;
  asOf: string;
  companyId: string;
  documentId?: string | null;
  provisionId?: string | null;
  periodKey?: string | null;
  records: readonly UtilizationEvidenceRecord[];
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  /**
   * Host-supplied issuer registry — independently authenticated.
   * Certificate issuer.role / actorId strings alone never suffice.
   */
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  sharedCapacityId?: string | null;
  crossDocumentConstraints?: string[];
  /**
   * Test/demo only. Never set by production Simulate / Position loaders.
   * Propagates into resolveUtilization / computeVerifiedRemaining.
   */
  allowSyntheticRemaining?: boolean;
}

/**
 * Independently authenticated evaluation identity from company-state / loader.
 * Bound against CrossDomainUtilizationAuthority before any remaining claim.
 */
export interface UtilizationAuthorityExpectedIdentity {
  companyId: string;
  asOf: string;
  knownDocumentIds: readonly string[];
  /** Provision ids and codes accepted for provisionId binding. */
  knownProvisionIds: readonly string[];
}

/** Approved financial identity consumed by Position / Simulate. */
export interface ApprovedFinancialIdentity {
  companyId: string;
  snapshotId: string | null;
  asOf: string;
  /** Fingerprint of numeric inputs used for ratio / capacity math. */
  inputFingerprint: string;
}

export interface DomainInputIdentity {
  companyId: string;
  documentId: string | null;
  provisionId: string | null;
  periodKey: string | null;
  asOf: string;
  financialFingerprint: string | null;
}

export interface DomainEvaluationSlice {
  domain: CovenantDomain;
  support: DomainSupportLevel;
  status: TransactionStatus | "not_applicable";
  summary: string;
  grossCapacityMillions: number | null;
  /** Engine-modeled remaining — never labeled verified. */
  modeledRemainingMillions: number | null;
  /**
   * Only non-null when computeVerifiedRemaining supports the claim via
   * attributed evidence + trusted completeness certificate.
   */
  verifiedRemainingMillions: number | null;
  /** Explicit reason when verified remaining is null. */
  verifiedRemainingRefusalReason: string | null;
  sourceProvision: string | null;
  inputIdentity: DomainInputIdentity;
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
  approvedFinancialIdentity: ApprovedFinancialIdentity | null;
  financialIdentityValid: boolean;
  /** Package-wide narrative limitations — never invent permissions. */
  packageLimitations: string[];
  authorityNote: string;
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

/** Fingerprint of approved financial inputs used by Position / Simulate. */
export function fingerprintFinancialInputs(fin: FinancialSnapshotInput | null | undefined): string {
  if (fin == null) return "missing";
  return [
    fin.ebitda,
    fin.cash,
    fin.totalDebt,
    fin.securedDebt,
    fin.interestExpense,
    fin.cumulativeNetIncome ?? "",
    fin.equityProceedsSinceIssue ?? "",
  ].join("|");
}

export function buildApprovedFinancialIdentity(params: {
  companyId: string;
  asOf: string;
  financials: FinancialSnapshotInput | null | undefined;
  snapshotId?: string | null;
}): ApprovedFinancialIdentity {
  return {
    companyId: params.companyId,
    snapshotId: params.snapshotId ?? null,
    asOf: params.asOf,
    inputFingerprint: fingerprintFinancialInputs(params.financials),
  };
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

function worstTxnStatus(statuses: TransactionStatus[]): TransactionStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("review_required")) return "review_required";
  if (statuses.includes("not_tested")) return "not_tested";
  return "clear";
}

/** PARTIAL / UNSUPPORTED domains must not report fully-evaluated clear. */
function statusForSupport(
  support: DomainSupportLevel,
  candidate: TransactionStatus | "not_applicable",
): TransactionStatus | "not_applicable" {
  if (candidate === "not_applicable") return candidate;
  if (support === "UNSUPPORTED") {
    return candidate === "blocked" ? "blocked" : "not_tested";
  }
  if (support === "PARTIAL" && candidate === "clear") {
    return "review_required";
  }
  return candidate;
}

type RemainingClaim = {
  verifiedRemainingMillions: number | null;
  verifiedRemainingRefusalReason: string | null;
  modeledRemainingMillions: number | null;
  verifiedResult: VerifiedRemainingResult | null;
};

function refuseRemaining(
  modeled: number | null,
  reason: string,
  verifiedResult: VerifiedRemainingResult | null = null,
): RemainingClaim {
  return {
    verifiedRemainingMillions: null,
    verifiedRemainingRefusalReason: reason,
    modeledRemainingMillions: modeled,
    verifiedResult,
  };
}

/**
 * Bind caller-supplied authority identity to independently authenticated
 * company-state / evaluation identity. Mismatch → no verified remaining.
 */
export function bindUtilizationAuthorityIdentity(
  auth: CrossDomainUtilizationAuthority,
  expected: UtilizationAuthorityExpectedIdentity | null | undefined,
): string | null {
  if (!expected) {
    return "Verified remaining unavailable — expected evaluation identity not supplied for authority binding.";
  }
  if (auth.companyId !== expected.companyId) {
    return `Verified remaining unavailable — authority companyId "${auth.companyId}" does not match evaluation company "${expected.companyId}".`;
  }
  if (auth.asOf.slice(0, 10) !== expected.asOf.slice(0, 10)) {
    return `Verified remaining unavailable — authority as-of ${auth.asOf.slice(0, 10)} does not match evaluation as-of ${expected.asOf.slice(0, 10)}.`;
  }
  if (auth.documentId != null && auth.documentId !== "") {
    if (!expected.knownDocumentIds.includes(auth.documentId)) {
      return `Verified remaining unavailable — authority documentId "${auth.documentId}" is not in the evaluated company package.`;
    }
  }
  if (auth.provisionId != null && auth.provisionId !== "") {
    if (!expected.knownProvisionIds.includes(auth.provisionId)) {
      return `Verified remaining unavailable — authority provisionId "${auth.provisionId}" is not in the evaluated company package.`;
    }
  }
  return null;
}

/**
 * Resolve verified remaining exclusively through the canonical capacity path.
 *
 * Trace:
 *   CrossDomainUtilizationAuthority
 *     → bindUtilizationAuthorityIdentity(expectedIdentity)
 *     → resolveUtilization({ records, completenessCertificate, trustedIssuerAuth })
 *     → computeVerifiedRemaining({ gross, utilization })
 *     → verifiedRemainingMillions ONLY from verified.supportedRemaining when
 *       verified.mayPublishAvailable (never from modeled/gross, never from caller flags)
 *
 * Caller-supplied assumption booleans are ignored for authorization.
 */
export function resolveCanonicalVerifiedRemaining(params: {
  grossCapacityMillions: number | null;
  modeledRemainingMillions: number | null;
  gateSatisfied: boolean;
  utilizationAuthority: CrossDomainUtilizationAuthority | null | undefined;
  /** Independently authenticated company-state / evaluation identity. */
  expectedIdentity?: UtilizationAuthorityExpectedIdentity | null;
  /** Shared-pool ids already used to publish remaining in this evaluation. */
  claimedSharedPools: Set<string>;
  sourceCitations?: string[];
}): RemainingClaim {
  const modeled = params.modeledRemainingMillions;
  const auth = params.utilizationAuthority;

  if (!auth) {
    return refuseRemaining(
      modeled,
      "Verified remaining unavailable — no canonical utilization/capacity authority supplied (caller flags cannot authorize remaining).",
    );
  }

  const identityBlock = bindUtilizationAuthorityIdentity(auth, params.expectedIdentity);
  if (identityBlock) {
    return refuseRemaining(modeled, identityBlock);
  }

  if (auth.sharedCapacityId && params.claimedSharedPools.has(auth.sharedCapacityId)) {
    return refuseRemaining(
      modeled,
      `Shared capacity ${auth.sharedCapacityId} remaining already claimed — refuse double-count across baskets.`,
    );
  }

  const cert = auth.completenessCertificate ?? null;
  if (cert) {
    if (cert.capacityRuleId !== auth.capacityRuleId) {
      return refuseRemaining(
        modeled,
        "Verified remaining unavailable — completeness certificate capacityRuleId does not match authority identity.",
      );
    }
    if (cert.asOf.slice(0, 10) !== auth.asOf.slice(0, 10)) {
      return refuseRemaining(
        modeled,
        "Verified remaining unavailable — completeness certificate as-of does not match authority as-of.",
      );
    }
  }

  // Reject records that attribute to a different rule when not on a shared pool.
  if (!auth.sharedCapacityId) {
    const foreign = auth.records.filter(
      (r) =>
        r.capacityRuleId != null &&
        r.capacityRuleId !== auth.capacityRuleId &&
        r.status !== "SUPERSEDED" &&
        r.status !== "REVERSED",
    );
    if (foreign.length > 0) {
      return refuseRemaining(
        modeled,
        "Verified remaining unavailable — ledger records attribute to a different capacityRuleId than the authority identity.",
      );
    }
  }

  const utilization = resolveUtilization({
    capacityRuleId: auth.capacityRuleId,
    asOf: auth.asOf,
    records: auth.records,
    completenessCertificate: cert,
    trustedIssuerAuth: auth.trustedIssuerAuth ?? null,
    sharedCapacityId: auth.sharedCapacityId ?? null,
    allowSyntheticRemaining: auth.allowSyntheticRemaining,
  });

  const verified = computeVerifiedRemaining({
    gross: {
      amount: params.grossCapacityMillions,
      gateSatisfied: params.gateSatisfied,
      modeled: params.grossCapacityMillions != null && Number.isFinite(params.grossCapacityMillions),
      capacityRuleId: auth.capacityRuleId,
    },
    utilization,
    crossDocumentConstraints: auth.crossDocumentConstraints ?? [],
    sourceCitations: params.sourceCitations ?? [],
    certificationStatus: utilization.completenessCertified ? "PARTIAL_ADAPTER" : "NOT_CERTIFIED",
    allowSyntheticRemaining: auth.allowSyntheticRemaining,
  });

  // Hard guard: never copy modeled/gross into verified — only supportedRemaining
  // from computeVerifiedRemaining when mayPublishAvailable.
  if (verified.supportedRemaining == null || !verified.mayPublishAvailable) {
    const reason =
      verified.blockers[0] ??
      verified.note ??
      "Verified remaining unavailable — utilization knowledge does not support a remaining claim.";
    return refuseRemaining(modeled, reason, verified);
  }

  if (auth.sharedCapacityId) {
    params.claimedSharedPools.add(auth.sharedCapacityId);
  }

  return {
    verifiedRemainingMillions: verified.supportedRemaining,
    verifiedRemainingRefusalReason: null,
    modeledRemainingMillions: modeled,
    verifiedResult: verified,
  };
}

function baseInputIdentity(
  data: CompanyCovenantData,
  asOf: string,
  financialFingerprint: string | null,
  over?: Partial<DomainInputIdentity>,
): DomainInputIdentity {
  return {
    companyId: data.companyId,
    documentId: over?.documentId ?? null,
    provisionId: over?.provisionId ?? null,
    periodKey: over?.periodKey ?? null,
    asOf,
    financialFingerprint,
  };
}

function emptyRemainingNotes(claim: RemainingClaim): string[] {
  const notes: string[] = [];
  if (claim.modeledRemainingMillions != null) {
    notes.push(
      `Modeled remaining $${claim.modeledRemainingMillions.toFixed(1)}M is not verified remaining.`,
    );
  }
  if (claim.verifiedRemainingRefusalReason) {
    notes.push(claim.verifiedRemainingRefusalReason);
  }
  return notes;
}

/**
 * Evaluate a multi-family contemplated transaction against a company's
 * CompanyCovenantData (provisions + financials + ledger + document configs).
 */
export function evaluateCrossDomainTransaction(params: {
  data: CompanyCovenantData;
  transaction: ContemplatedCrossDomainTransaction;
  ebitdaDerivation?: ContractualEbitdaDerivation | null;
  /** Sole path that may authorize verifiedRemainingMillions. */
  utilizationAuthority?: CrossDomainUtilizationAuthority | null;
  /**
   * Expected approved financial identity (from Position / approved snapshot).
   * When supplied and mismatched vs current data, ratio/debt domains invalidate.
   */
  expectedFinancialIdentity?: ApprovedFinancialIdentity | null;
}): CrossDomainTransactionEvaluation {
  const { data, transaction: tx } = params;
  const assumptionBlock = refuseWithoutAssumptions(tx);
  const position = computeCovenantPosition(data);
  const asOf = tx.assumptions.evaluationDate;
  const financialFingerprint = fingerprintFinancialInputs(data.financials);
  const currentIdentity = buildApprovedFinancialIdentity({
    companyId: data.companyId,
    asOf,
    financials: data.financials,
    snapshotId: params.expectedFinancialIdentity?.snapshotId ?? null,
  });
  const financialIdentityValid =
    !params.expectedFinancialIdentity ||
    (params.expectedFinancialIdentity.companyId === currentIdentity.companyId &&
      params.expectedFinancialIdentity.inputFingerprint === currentIdentity.inputFingerprint &&
      params.expectedFinancialIdentity.asOf.slice(0, 10) === currentIdentity.asOf.slice(0, 10));

  const contractualComputation = computeContractualCovenantMetrics({
    financials: data.financials,
    provisions: data.provisions,
    ebitdaDerivation: params.ebitdaDerivation ?? null,
  });

  const packageLimitations: string[] = [
    "Gross capacity is never described as verified available capacity.",
    "Modeled remaining is never relabeled as verified remaining.",
    "Caller-supplied utilizationAttributed / utilizationCompletenessCertified flags never authorize verified remaining.",
    "No contractual permissions or historical utilization are invented.",
  ];
  if (assumptionBlock) packageLimitations.push(assumptionBlock);
  if (!financialIdentityValid) {
    packageLimitations.push(
      "Approved financial inputs changed or mismatch Position identity — affected ratio/debt simulations invalidated.",
    );
  }
  if (
    tx.assumptions.utilizationAttributed === true ||
    tx.assumptions.utilizationCompletenessCertified === true
  ) {
    packageLimitations.push(
      "Caller set utilizationAttributed and/or utilizationCompletenessCertified — ignored for verified remaining authorization.",
    );
  }
  if (!params.utilizationAuthority) {
    packageLimitations.push(
      "Verified remaining capacity withheld — canonical utilization authority not supplied.",
    );
  }

  const domains: DomainEvaluationSlice[] = [];
  let debtSim: DebtIncurrenceSimulation | null = null;
  let rpSim: RestrictedPaymentSimulation | null = null;
  let assetSaleSim: AssetSaleSimulation | null = null;
  const statusAcc: TransactionStatus[] = [];
  const claimedSharedPools = new Set<string>();
  const expectedIdentity: UtilizationAuthorityExpectedIdentity = {
    companyId: data.companyId,
    asOf,
    knownDocumentIds: data.documents.map((d) => d.id),
    knownProvisionIds: data.provisions.flatMap((p) =>
      [p.id, p.code].filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  };

  const applyRemaining = (
    slice: Omit<
      DomainEvaluationSlice,
      "verifiedRemainingMillions" | "verifiedRemainingRefusalReason" | "modeledRemainingMillions"
    > & { modeledRemainingMillions?: number | null; gateSatisfied?: boolean },
  ): DomainEvaluationSlice => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: slice.grossCapacityMillions,
      modeledRemainingMillions: slice.modeledRemainingMillions ?? null,
      gateSatisfied: slice.gateSatisfied ?? slice.status !== "blocked",
      utilizationAuthority: params.utilizationAuthority,
      expectedIdentity,
      claimedSharedPools,
      sourceCitations: slice.citations,
    });
    return {
      ...slice,
      status: statusForSupport(slice.support, slice.status),
      modeledRemainingMillions: claim.modeledRemainingMillions,
      verifiedRemainingMillions: claim.verifiedRemainingMillions,
      verifiedRemainingRefusalReason: claim.verifiedRemainingRefusalReason,
      notes: [...slice.notes, ...emptyRemainingNotes(claim)],
    };
  };

  // --- Financial covenants / ratios ---
  const ratioInvalid = !financialIdentityValid;
  const ratioSlice = applyRemaining({
    domain: "FINANCIAL_COVENANTS_RATIO_CAPACITY",
    support: contractualComputation.status === "OK" && !ratioInvalid ? "EXECUTABLE" : "PARTIAL",
    status: ratioInvalid
      ? "review_required"
      : contractualComputation.status === "OK"
        ? "clear"
        : "review_required",
    summary: ratioInvalid
      ? "Financial identity mismatch — ratio capacity invalidated"
      : contractualComputation.contractualEbitda != null
        ? `Contractual EBITDA $${contractualComputation.contractualEbitda}M · TNL ${
            contractualComputation.leverage.totalNetLeverage?.toFixed(2) ?? "n/a"
          }x · derivation ${contractualComputation.ebitdaDerivation?.kind ?? "not attached"}`
        : "Contractual EBITDA missing",
    grossCapacityMillions:
      contractualComputation.ratioTests.find((r) => r.formulaType === "LEVERAGE_RATIO_ROOM")
        ?.ratioDebtCapacityMillions ?? null,
    modeledRemainingMillions: null,
    sourceProvision:
      contractualComputation.ratioTests[0]?.sectionRef ??
      contractualComputation.ratioTests[0]?.provisionCode ??
      null,
    inputIdentity: baseInputIdentity(data, asOf, financialFingerprint, {
      periodKey: params.ebitdaDerivation?.measurementPeriod ?? null,
    }),
    citations: contractualComputation.ratioTests.map((r) => r.sectionRef),
    missingInputs: [
      ...contractualComputation.missingInputs,
      ...(ratioInvalid ? ["approved financial identity match"] : []),
    ],
    notes: [
      ...contractualComputation.notes,
      ...(contractualComputation.ebitdaDerivation?.unresolvedAdjustments ?? []),
    ],
  });
  domains.push(ratioSlice);
  if (ratioInvalid) statusAcc.push("review_required");

  const runDebt = (
    amount: number,
    secured: boolean,
    label: string,
  ): { slice: DomainEvaluationSlice; sim: DebtIncurrenceSimulation } => {
    const sim = simulateDebtIncurrence(data, position, amount, secured);
    const invalidated = !financialIdentityValid;
    const status: TransactionStatus = invalidated ? "review_required" : sim.status;
    statusAcc.push(status);
    const gross =
      sim.overallCapacity != null && Number.isFinite(sim.overallCapacity)
        ? sim.overallCapacity
        : null;
    const bindingRef = sim.binding?.bindingProvision?.sectionRef ?? null;
    return {
      sim,
      slice: applyRemaining({
        domain: "DEBT_INCURRENCE_REFINANCING",
        support: "EXECUTABLE",
        status,
        summary: invalidated
          ? `${label}: invalidated — approved financial inputs changed`
          : `${label}: ${sim.status} · binding ${
              sim.binding?.documentName ?? "n/a"
            } · overall gross capacity ${
              gross != null ? `$${gross.toFixed(1)}M` : "n/a"
            }`,
        grossCapacityMillions: gross,
        modeledRemainingMillions: gross,
        gateSatisfied: sim.status === "clear",
        sourceProvision: bindingRef,
        inputIdentity: baseInputIdentity(data, asOf, financialFingerprint, {
          documentId: sim.binding?.documentId ?? null,
          provisionId: sim.binding?.bindingProvision?.code ?? null,
        }),
        citations: sim.perDocument.map(
          (d) =>
            `${d.documentName}${d.bindingProvision ? ` · ${d.bindingProvision.sectionRef}` : ""}`,
        ),
        missingInputs: [
          ...(sim.reason ? [sim.reason] : []),
          ...(invalidated ? ["approved financial identity match"] : []),
        ],
        notes: sim.ratioTests
          .filter((r) => r.applies)
          .map(
            (r) =>
              `${r.metricName} ${r.preTransactionRatio?.toFixed(2)}x → ${r.postTransactionRatio?.toFixed(2) ?? "n/a"}x vs ${r.threshold}x (${r.status})`,
          ),
      }),
    };
  };

  const runRp = (
    amount: number,
    kind: "dividend" | "investment",
  ): { slice: DomainEvaluationSlice; sim: RestrictedPaymentSimulation | null } => {
    const docId = tx.rpDocumentId ?? data.documents.find((d) => d.rpWaterfall)?.id;
    if (!docId) {
      return {
        sim: null,
        slice: applyRemaining({
          domain: kind === "dividend" ? "RESTRICTED_PAYMENTS_BUILDER" : "INVESTMENTS_ACQUISITIONS",
          support: "UNSUPPORTED",
          status: "not_tested",
          summary: "No document with rpWaterfall configuration",
          grossCapacityMillions: null,
          modeledRemainingMillions: null,
          sourceProvision: null,
          inputIdentity: baseInputIdentity(data, asOf, financialFingerprint),
          citations: [],
          missingInputs: ["rpWaterfall"],
          notes: ["UNSUPPORTED — not represented as fully evaluated."],
        }),
      };
    }
    const sim = simulateRestrictedPayment(data, position, docId, amount, kind);
    statusAcc.push(sim.status);
    const stepGross = Object.values(sim.stepCapacitiesRemaining).reduce((a, b) => a + b, 0);
    const support: DomainSupportLevel =
      kind === "dividend" ? "EXECUTABLE" : "PARTIAL";
    return {
      sim,
      slice: applyRemaining({
        domain: kind === "dividend" ? "RESTRICTED_PAYMENTS_BUILDER" : "INVESTMENTS_ACQUISITIONS",
        support,
        status: sim.status,
        summary: `${kind} $${amount}M · ${sim.status} · modeled unallocated $${sim.remaining.toFixed(1)}M`,
        grossCapacityMillions: stepGross,
        modeledRemainingMillions: sim.remaining,
        gateSatisfied: sim.status === "clear",
        sourceProvision: sim.steps[0]?.sectionRef ?? null,
        inputIdentity: baseInputIdentity(data, asOf, financialFingerprint, {
          documentId: docId,
        }),
        citations: sim.steps.map((s) => `${s.sectionRef} · ${s.basketName}`),
        missingInputs: sim.reason ? [sim.reason] : [],
        notes: [`Ledger RP pool used before sim: $${sim.poolUsed.toFixed(1)}M`],
      }),
    };
  };

  const runAssetSale = (
    netProceeds: number,
  ): { slice: DomainEvaluationSlice; sim: AssetSaleSimulation | null } => {
    const docId = tx.assetSaleDocumentId ?? documentsWithAssetSale(data)[0]?.id;
    if (!docId) {
      return {
        sim: null,
        slice: applyRemaining({
          domain: "ASSET_SALES_PROCEEDS",
          support: "UNSUPPORTED",
          status: "not_tested",
          summary: "No document with assetSale configuration",
          grossCapacityMillions: null,
          modeledRemainingMillions: null,
          sourceProvision: null,
          inputIdentity: baseInputIdentity(data, asOf, financialFingerprint),
          citations: [],
          missingInputs: ["assetSale"],
          notes: ["UNSUPPORTED — not represented as fully evaluated."],
        }),
      };
    }
    const sim = simulateAssetSale(
      data,
      position,
      docId,
      netProceeds,
      Boolean(tx.reinvestProceeds),
    );
    const mapped: TransactionStatus =
      sim.status === "clear"
        ? "clear"
        : sim.status === "review_required"
          ? "review_required"
          : "not_tested";
    statusAcc.push(mapped);
    return {
      sim,
      slice: applyRemaining({
        domain: "ASSET_SALES_PROCEEDS",
        support: "PARTIAL",
        status: mapped,
        summary: `Net proceeds $${netProceeds}M · offerTriggered=${sim.offerTriggered ?? false} · reinvest=${tx.reinvestProceeds ?? false}`,
        grossCapacityMillions: sim.excessProceedsThreshold ?? null,
        modeledRemainingMillions: null,
        sourceProvision: sim.documentName ?? docId,
        inputIdentity: baseInputIdentity(data, asOf, financialFingerprint, {
          documentId: docId,
        }),
        citations: [sim.documentName ?? docId],
        missingInputs: sim.reason ? [sim.reason] : [],
        notes: [
          "Capacity restore from repayment of debt with proceeds requires explicit contractualAuthorityRef (not inferred).",
        ],
      }),
    };
  };

  // Lien / secured capacity — PARTIAL must not report clear
  const securedDoc = position.documents.find((d) => d.securedStatus === "modeled");
  domains.push(
    applyRemaining({
      domain: "LIENS_SECURED_CAPACITY",
      support: securedDoc ? "PARTIAL" : "UNSUPPORTED",
      status: securedDoc ? "review_required" : "not_tested",
      summary: securedDoc
        ? `Secured-side gross capacity $${securedDoc.securedCapacity?.toFixed(1) ?? "n/a"}M on ${securedDoc.documentName} (PARTIAL — not fully evaluated)`
        : "No modeled secured capacity formula",
      grossCapacityMillions: securedDoc?.securedCapacity ?? null,
      modeledRemainingMillions: securedDoc?.securedCapacity ?? null,
      sourceProvision: securedDoc?.securedBindingProvision?.sectionRef ?? null,
      inputIdentity: baseInputIdentity(data, asOf, financialFingerprint, {
        documentId: securedDoc?.documentId ?? null,
        provisionId: securedDoc?.securedBindingProvision?.code ?? null,
      }),
      citations: securedDoc?.securedBindingProvision
        ? [securedDoc.securedBindingProvision.sectionRef]
        : [],
      missingInputs: securedDoc
        ? ["independent lien priority / collateral scope evaluation"]
        : ["secured capacityFormulas"],
      notes: [
        "Lien capacity leaves participate via capacityFormulas; not a separate lien engine.",
        "PARTIAL — must not be treated as fully evaluated clear permission.",
      ],
    }),
  );

  domains.push(
    applyRemaining({
      domain: "CROSS_DOCUMENT_SHARED_CAPACITY",
      support: "PARTIAL",
      status: "review_required",
      summary: `${position.documents.length} document(s) in package; binding selected as tightest modeled capacity on debt sims (PARTIAL)`,
      grossCapacityMillions: null,
      modeledRemainingMillions: null,
      sourceProvision: null,
      inputIdentity: baseInputIdentity(data, asOf, financialFingerprint),
      citations: position.documents.map((d) => d.documentName),
      missingInputs: params.utilizationAuthority?.sharedCapacityId
        ? []
        : ["express SharedCapacityConstraint for cross-document pool"],
      notes: [
        "Stacking across documents is not assumed without express shared constraints.",
        "Shared-pool utilization is attributed once — baskets sharing one cap cannot double-count.",
      ],
    }),
  );

  domains.push(
    applyRemaining({
      domain: "AMENDMENT_VERSION_EFFECTIVE_DATE",
      support: "PARTIAL",
      status: "not_applicable",
      summary: `Evaluation date ${tx.assumptions.evaluationDate} — provisions must be date-scoped by loader`,
      grossCapacityMillions: null,
      modeledRemainingMillions: null,
      sourceProvision: null,
      inputIdentity: baseInputIdentity(data, asOf, financialFingerprint, {
        periodKey: tx.assumptions.evaluationDate,
      }),
      citations: [],
      missingInputs: [],
      notes: ["Amendment graph mutation refused without new capacity graph (recipe gate)."],
    }),
  );

  const ledgerClaim = resolveCanonicalVerifiedRemaining({
    grossCapacityMillions: null,
    modeledRemainingMillions: null,
    gateSatisfied: false,
    utilizationAuthority: params.utilizationAuthority,
    expectedIdentity,
    claimedSharedPools,
  });
  domains.push({
    domain: "LEDGER_UTILIZATION_RECLASSIFICATION",
    support: "PARTIAL",
    status: "not_applicable",
    summary: `${data.ledger.length} ledger entr(y/ies) in RP pool math; verified remaining ${
      ledgerClaim.verifiedRemainingMillions != null ? "supported on authority path" : "refused"
    }`,
    grossCapacityMillions: null,
    modeledRemainingMillions: null,
    verifiedRemainingMillions: ledgerClaim.verifiedRemainingMillions,
    verifiedRemainingRefusalReason: ledgerClaim.verifiedRemainingRefusalReason,
    sourceProvision: params.utilizationAuthority?.provisionId ?? null,
    inputIdentity: baseInputIdentity(data, asOf, financialFingerprint, {
      provisionId: params.utilizationAuthority?.provisionId ?? null,
      documentId: params.utilizationAuthority?.documentId ?? null,
    }),
    citations: [],
    missingInputs: ledgerClaim.verifiedRemainingMillions != null
      ? []
      : ["attributed utilization evidence", "trusted completeness certificate"],
    notes: [
      "Caller utilizationAttributed / utilizationCompletenessCertified flags ignored for remaining.",
      ...(ledgerClaim.verifiedRemainingRefusalReason
        ? [ledgerClaim.verifiedRemainingRefusalReason]
        : []),
    ],
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
      domains.push(
        applyRemaining({
          domain: "INVESTMENTS_ACQUISITIONS",
          support: "UNSUPPORTED",
          status: "not_tested",
          summary:
            "Intercompany transfer / guarantee chain requires entity-scope facts not present in legacy snapshot",
          grossCapacityMillions: null,
          modeledRemainingMillions: null,
          sourceProvision: null,
          inputIdentity: baseInputIdentity(data, asOf, financialFingerprint),
          citations: [],
          missingInputs: [
            "restricted-group entity graph",
            "intercompany investment basket attribution",
          ],
          notes: ["Fail-closed — permissions not invented. UNSUPPORTED ≠ clear."],
        }),
      );
      statusAcc.push("not_tested");
      packageLimitations.push(
        "INTERCOMPANY_TRANSFER is unsupported without entity/guarantee facts.",
      );
      break;
    }
  }

  const multiStatus = assumptionBlock
    ? "review_required"
    : worstTxnStatus(statusAcc.length ? statusAcc : ["review_required"]);
  domains.push(
    applyRemaining({
      domain: "MULTI_CONDITION_SIMULATION",
      support: "PARTIAL",
      status: multiStatus,
      summary: `Scenario ${tx.kind} composed across ${domains.length} domain slices`,
      grossCapacityMillions: null,
      modeledRemainingMillions: null,
      sourceProvision: null,
      inputIdentity: baseInputIdentity(data, asOf, financialFingerprint),
      citations: tx.assumptions.statements,
      missingInputs: assumptionBlock ? [assumptionBlock] : [],
      notes: [`Entity scope: ${tx.assumptions.entityScope.join(", ")}`],
    }),
  );

  // Overall follows scenario-executed statuses. Any blocked domain blocks
  // package permission. Static PARTIAL slices stay review_required locally
  // without forcing every scenario to review_required.
  const blockedDomain = domains.some((d) => d.status === "blocked");
  const overallStatus: TransactionStatus = assumptionBlock
    ? "review_required"
    : blockedDomain
      ? "blocked"
      : worstTxnStatus(statusAcc.length ? statusAcc : ["review_required"]);

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

  return {
    version: CROSS_DOMAIN_EVALUATION_VERSION,
    scenario: tx,
    overallStatus,
    domains,
    contractualComputation,
    debtSimulation: debtSim,
    rpSimulation: rpSim,
    assetSaleSimulation: assetSaleSim,
    proForma,
    approvedFinancialIdentity: currentIdentity,
    financialIdentityValid,
    packageLimitations,
    authorityNote:
      "LEGACY_ENGINE package composition + contractual computation — NOT_CERTIFIED_4E. Gross ≠ modeled ≠ verified remaining. Verified remaining only via resolveUtilization + computeVerifiedRemaining.",
  };
}
