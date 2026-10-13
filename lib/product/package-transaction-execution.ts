/**
 * Canonical multi-covenant transaction evaluation workflow.
 *
 * Composes existing engines only:
 *   evaluateCrossDomainTransaction → covenant-engine sims + contractual computation
 *   resolveCanonicalVerifiedRemaining → resolveUtilization + computeVerifiedRemaining
 *
 * Does NOT invent a parallel capacity / covenant calculator.
 * A transaction is never PERMITTED merely because one applicable covenant passes.
 */

import type { CompanyCovenantData, TransactionStatus } from "@/lib/covenant-engine";
import type { ContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import {
  CROSS_DOMAIN_CANONICAL_OWNER,
  CROSS_DOMAIN_EVALUATION_VERSION,
  covenantDomainCoverage,
  evaluateCrossDomainTransaction,
  type ApprovedFinancialIdentity,
  type ContemplatedCrossDomainTransaction,
  type CovenantDomain,
  type CrossDomainScenarioKind,
  type CrossDomainTransactionEvaluation,
  type CrossDomainUtilizationAuthority,
  type DomainEvaluationSlice,
  type DomainSupportLevel,
} from "@/lib/product/cross-domain-transaction";
import type {
  ExecutionStatus,
  ProductionAuthorityClassification,
  UnifiedTransactionExecutionResult,
} from "@/lib/product/verified-transaction-execution";

export const PACKAGE_TRANSACTION_EXECUTION_VERSION =
  "package-transaction-execution.v1" as const;

/** Mandate step identifiers (1–10). */
export type PackageTransactionStepId =
  | "ACCEPT_TRANSACTION_AND_PACKAGE"
  | "IDENTIFY_APPLICABLE_COVENANTS"
  | "CLASSIFY_RELEVANCE"
  | "RESOLVE_PERMISSIBLE_PATHS"
  | "COMPUTE_GROSS_CAPACITY"
  | "APPLY_SHARED_CAPACITY"
  | "REQUIRE_UTILIZATION_COMPLETENESS"
  | "EVALUATE_CONDITIONS"
  | "HYPOTHETICAL_POST_STATE"
  | "RETURN_RESULTS_WITH_TRACE";

export interface PackageTransactionStep {
  id: PackageTransactionStepId;
  index: number;
  title: string;
  status: "OK" | "PARTIAL" | "BLOCKED" | "REFUSED";
  detail: string;
  evidence: string[];
}

/** Domains potentially applicable by scenario kind (fail-closed: more is safer). */
const SCENARIO_APPLICABLE: Record<CrossDomainScenarioKind, readonly CovenantDomain[]> = {
  DEBT_FUNDED_ACQUISITION: [
    "DEBT_INCURRENCE_REFINANCING",
    "LIENS_SECURED_CAPACITY",
    "INVESTMENTS_ACQUISITIONS",
    "GUARANTEES",
    "FINANCIAL_COVENANTS_RATIO_CAPACITY",
    "CROSS_DOCUMENT_SHARED_CAPACITY",
    "AMENDMENT_VERSION_EFFECTIVE_DATE",
    "LEDGER_UTILIZATION_RECLASSIFICATION",
    "SUBSIDIARY_DESIGNATION_STRUCTURAL",
  ],
  DIVIDEND_AVAILABLE_AMOUNT: [
    "RESTRICTED_PAYMENTS_BUILDER",
    "FINANCIAL_COVENANTS_RATIO_CAPACITY",
    "CROSS_DOCUMENT_SHARED_CAPACITY",
    "AMENDMENT_VERSION_EFFECTIVE_DATE",
    "LEDGER_UTILIZATION_RECLASSIFICATION",
    "AFFILIATE_TRANSACTIONS",
  ],
  ASSET_SALE_PROCEEDS: [
    "ASSET_SALES_PROCEEDS",
    "FINANCIAL_COVENANTS_RATIO_CAPACITY",
    "CROSS_DOCUMENT_SHARED_CAPACITY",
    "AMENDMENT_VERSION_EFFECTIVE_DATE",
    "LEDGER_UTILIZATION_RECLASSIFICATION",
  ],
  REFINANCING: [
    "DEBT_INCURRENCE_REFINANCING",
    "LIENS_SECURED_CAPACITY",
    "FINANCIAL_COVENANTS_RATIO_CAPACITY",
    "CROSS_DOCUMENT_SHARED_CAPACITY",
    "AMENDMENT_VERSION_EFFECTIVE_DATE",
    "LEDGER_UTILIZATION_RECLASSIFICATION",
    "GUARANTEES",
  ],
  INTERCOMPANY_TRANSFER: [
    "INVESTMENTS_ACQUISITIONS",
    "AFFILIATE_TRANSACTIONS",
    "GUARANTEES",
    "SUBSIDIARY_DESIGNATION_STRUCTURAL",
    "CROSS_DOCUMENT_SHARED_CAPACITY",
    "AMENDMENT_VERSION_EFFECTIVE_DATE",
    "LEDGER_UTILIZATION_RECLASSIFICATION",
  ],
};

/**
 * Fail-closed precedence for package-wide permission.
 * not_tested outranks review_required: an untested applicable domain
 * cannot be papered over by PARTIAL review of another domain.
 */
function worstStatus(statuses: TransactionStatus[]): TransactionStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("not_tested")) return "not_tested";
  if (statuses.includes("review_required")) return "review_required";
  return "clear";
}

function domainById(
  domains: DomainEvaluationSlice[],
  id: CovenantDomain,
): DomainEvaluationSlice | undefined {
  return domains.find((d) => d.domain === id);
}

/**
 * Minimal verified-execution handoff consumed for customer permission.
 * Callers supply the result of executeUnifiedVerifiedTransaction (REQUIRE).
 * Descriptive modeling statuses never alone authorize packagePermitted.
 */
export interface VerifiedExecutionPermissionHandoff {
  executionStatus: ExecutionStatus;
  productionAuthority: ProductionAuthorityClassification;
  contractVersion: string;
}

export interface PackageTransactionRequest {
  /** Operative financing-package identity (company + as-of + optional snapshot). */
  packageIdentity: {
    companyId: string;
    evaluationDate: string;
    approvedSnapshotId?: string | null;
    documentIds?: string[];
  };
  data: CompanyCovenantData;
  transaction: ContemplatedCrossDomainTransaction;
  ebitdaDerivation?: ContractualEbitdaDerivation | null;
  utilizationAuthority?: CrossDomainUtilizationAuthority | null;
  expectedFinancialIdentity?: ApprovedFinancialIdentity | null;
  /**
   * Result of canonical executeUnifiedVerifiedTransaction under REQUIRE gates.
   * Required for packagePermitted=true. Modeling-only clear/EXECUTABLE is insufficient.
   */
  verifiedExecution?:
    | VerifiedExecutionPermissionHandoff
    | Pick<
        UnifiedTransactionExecutionResult,
        "executionStatus" | "productionAuthority" | "contractVersion"
      >
    | null;
}

export interface PackageTransactionResult {
  version: typeof PACKAGE_TRANSACTION_EXECUTION_VERSION;
  crossDomainVersion: typeof CROSS_DOMAIN_EVALUATION_VERSION;
  canonicalOwner: typeof CROSS_DOMAIN_CANONICAL_OWNER;
  packageIdentity: PackageTransactionRequest["packageIdentity"];
  /** Domains identified as potentially applicable for this scenario. */
  applicableDomains: CovenantDomain[];
  /** Domains considered genuinely irrelevant for this scenario. */
  irrelevantDomains: CovenantDomain[];
  /** Applicable domains that are PARTIAL / UNSUPPORTED / etc. */
  supportByDomain: Array<{
    domain: CovenantDomain;
    support: DomainSupportLevel;
    status: DomainEvaluationSlice["status"];
    applicable: boolean;
  }>;
  /**
   * Descriptive modeling overall from applicable domains only.
   * Never upgraded to customer permission without verified REQUIRE execution.
   */
  overallStatus: TransactionStatus;
  /**
   * Customer permission. True only when canonical verified transaction execution
   * under REQUIRE gates returns EXECUTED_SATISFIED with PRODUCTION_AUTHORITY_ACTIVE.
   * Clear modeled domains / EXECUTABLE coverage labels alone never suffice.
   */
  packagePermitted: boolean;
  /** Echo of verified-execution handoff used for permission (null when absent). */
  verifiedExecutionHandoff: VerifiedExecutionPermissionHandoff | null;
  steps: PackageTransactionStep[];
  evaluation: CrossDomainTransactionEvaluation;
  citations: string[];
  missingInputs: string[];
  assumptions: string[];
  limitations: string[];
  unresolvedBlockers: string[];
  /** Atomic hypothetical post-transaction state (pro forma + capacity notes). */
  hypotheticalPostState: {
    totalNetLeverage: number | null;
    seniorSecuredNetLeverage: number | null;
    interestCoverage: number | null;
    postsToLedger: false;
    authority: "HYPOTHETICAL";
  };
  trace: string[];
}

/**
 * Execute the canonical multi-covenant package workflow (mandate steps 1–10).
 */
export function executePackageTransaction(
  request: PackageTransactionRequest,
): PackageTransactionResult {
  const { data, transaction: tx } = request;
  const packageIdentity = {
    ...request.packageIdentity,
    companyId: request.packageIdentity.companyId || data.companyId,
    evaluationDate:
      request.packageIdentity.evaluationDate || tx.assumptions.evaluationDate,
    documentIds:
      request.packageIdentity.documentIds ?? data.documents.map((d) => d.id),
  };

  // Step 1 — accept transaction + package identity
  const identityMismatch =
    packageIdentity.companyId !== data.companyId
      ? `Package companyId ${packageIdentity.companyId} ≠ data.companyId ${data.companyId}`
      : null;

  const evaluation = evaluateCrossDomainTransaction({
    data,
    transaction: {
      ...tx,
      assumptions: {
        ...tx.assumptions,
        evaluationDate: packageIdentity.evaluationDate,
      },
    },
    ebitdaDerivation: request.ebitdaDerivation ?? null,
    utilizationAuthority: request.utilizationAuthority ?? null,
    expectedFinancialIdentity: request.expectedFinancialIdentity ?? null,
    authoritySurface: "PRODUCTION",
  });

  const coverage = covenantDomainCoverage();
  const allDomains = coverage.map((r) => r.domain);
  const applicable = [...SCENARIO_APPLICABLE[tx.kind]];
  // Always include composition slice for traceability.
  if (!applicable.includes("MULTI_CONDITION_SIMULATION")) {
    applicable.push("MULTI_CONDITION_SIMULATION");
  }
  const irrelevant = allDomains.filter((d) => !applicable.includes(d));

  const supportByDomain = allDomains.map((domain) => {
    const slice = domainById(evaluation.domains, domain);
    const inv = coverage.find((r) => r.domain === domain);
    return {
      domain,
      support: slice?.support ?? inv?.support ?? ("NOT_IMPLEMENTED" as const),
      status: slice?.status ?? ("not_tested" as const),
      applicable: applicable.includes(domain),
    };
  });

  const applicableSlices = applicable
    .map((d) => domainById(evaluation.domains, d))
    .filter((s): s is DomainEvaluationSlice => s != null);

  const applicableStatuses: TransactionStatus[] = applicableSlices
    .map((s) => s.status)
    .filter((s): s is TransactionStatus => s !== "not_applicable");

  // Descriptive modeling status — separate from customer permission.
  const overallStatus: TransactionStatus = identityMismatch
    ? "review_required"
    : worstStatus(
        applicableStatuses.length
          ? applicableStatuses
          : [evaluation.overallStatus],
      );

  const verifiedHandoff: VerifiedExecutionPermissionHandoff | null =
    request.verifiedExecution
      ? {
          executionStatus: request.verifiedExecution.executionStatus,
          productionAuthority: request.verifiedExecution.productionAuthority,
          contractVersion: request.verifiedExecution.contractVersion,
        }
      : null;

  // Customer permission requires successful REQUIRE verified execution with
  // production authority active — never modeled clear / EXECUTABLE labels alone.
  const packagePermitted =
    !identityMismatch &&
    verifiedHandoff != null &&
    verifiedHandoff.executionStatus === "EXECUTED_SATISFIED" &&
    verifiedHandoff.productionAuthority === "PRODUCTION_AUTHORITY_ACTIVE";

  const citations = [
    ...new Set(applicableSlices.flatMap((s) => s.citations).filter(Boolean)),
  ];
  const missingInputs = [
    ...new Set([
      ...applicableSlices.flatMap((s) => s.missingInputs),
      ...(identityMismatch ? [identityMismatch] : []),
    ]),
  ];
  const assumptions = [...tx.assumptions.statements];
  const limitations = [...evaluation.packageLimitations];
  const unresolvedBlockers: string[] = [];
  if (identityMismatch) unresolvedBlockers.push(identityMismatch);
  if (!verifiedHandoff) {
    unresolvedBlockers.push(
      "packagePermitted=false — canonical verified transaction execution (REQUIRE) not supplied; modeled clear/EXECUTABLE labels are insufficient",
    );
  } else if (verifiedHandoff.executionStatus !== "EXECUTED_SATISFIED") {
    unresolvedBlockers.push(
      `packagePermitted=false — verified execution status ${verifiedHandoff.executionStatus} (REQUIRE must EXECUTED_SATISFIED)`,
    );
  } else if (verifiedHandoff.productionAuthority !== "PRODUCTION_AUTHORITY_ACTIVE") {
    unresolvedBlockers.push(
      `packagePermitted=false — production authority ${verifiedHandoff.productionAuthority} (host trusted-issuer not ACTIVE)`,
    );
  }
  for (const s of applicableSlices) {
    if (s.support === "UNSUPPORTED" || s.support === "NOT_IMPLEMENTED") {
      unresolvedBlockers.push(`${s.domain}: ${s.support} — ${s.summary}`);
    } else if (s.status === "blocked") {
      unresolvedBlockers.push(`${s.domain}: blocked — ${s.summary}`);
    } else if (s.status === "not_tested") {
      unresolvedBlockers.push(`${s.domain}: not_tested — ${s.summary}`);
    } else if (s.support === "PARTIAL" && s.status !== "not_applicable") {
      unresolvedBlockers.push(
        `${s.domain}: PARTIAL — cannot publish package-wide PERMITTED`,
      );
    }
    if (
      s.verifiedRemainingMillions == null &&
      s.grossCapacityMillions != null &&
      s.verifiedRemainingRefusalReason
    ) {
      // Disclosure only — not always a blocker for hypothetical gross.
    }
  }
  if (!request.utilizationAuthority) {
    unresolvedBlockers.push(
      "Verified remaining unpublished — canonical utilization authority absent",
    );
  }

  const sharedNotes = applicableSlices
    .filter((s) => s.domain === "CROSS_DOCUMENT_SHARED_CAPACITY")
    .flatMap((s) => s.notes);

  const steps: PackageTransactionStep[] = [
    {
      id: "ACCEPT_TRANSACTION_AND_PACKAGE",
      index: 1,
      title: "Accept proposed transaction and operative financing-package identity",
      status: identityMismatch ? "REFUSED" : "OK",
      detail: identityMismatch
        ? identityMismatch
        : `company=${packageIdentity.companyId} asOf=${packageIdentity.evaluationDate} docs=${packageIdentity.documentIds?.length ?? 0} snapshot=${packageIdentity.approvedSnapshotId ?? "—"} kind=${tx.kind} amount=$${tx.amountMillions}M`,
      evidence: [
        `data.companyId=${data.companyId}`,
        `financialIdentityValid=${evaluation.financialIdentityValid}`,
      ],
    },
    {
      id: "IDENTIFY_APPLICABLE_COVENANTS",
      index: 2,
      title: "Identify every potentially applicable covenant and cross-document restriction",
      status: "OK",
      detail: `${applicable.length} applicable · ${irrelevant.length} irrelevant for ${tx.kind}`,
      evidence: applicable.map(String),
    },
    {
      id: "CLASSIFY_RELEVANCE",
      index: 3,
      title: "Determine which conditions apply and which are genuinely irrelevant",
      status: "OK",
      detail: `Irrelevant (disclosed, not evaluated as gating): ${irrelevant.join(", ") || "none"}`,
      evidence: irrelevant.map(String),
    },
    {
      id: "RESOLVE_PERMISSIBLE_PATHS",
      index: 4,
      title: "Resolve explicit permissible paths without silently choosing favorable baskets",
      status: applicableSlices.some((s) => s.status === "blocked")
        ? "BLOCKED"
        : applicableSlices.some(
              (s) => s.support === "UNSUPPORTED" || s.status === "not_tested",
            )
          ? "REFUSED"
          : "PARTIAL",
      detail:
        "Paths follow capacityFormulas / waterfall order; no silent basket election. Solver-native elections require declarations.",
      evidence: applicableSlices
        .filter((s) => s.sourceProvision)
        .map((s) => `${s.domain} ← ${s.sourceProvision}`),
    },
    {
      id: "COMPUTE_GROSS_CAPACITY",
      index: 5,
      title: "Compute gross mathematical capacity separately from verified remaining",
      status: "OK",
      detail: applicableSlices
        .filter((s) => s.grossCapacityMillions != null)
        .map(
          (s) =>
            `${s.domain} gross=$${s.grossCapacityMillions!.toFixed(1)}M modeled=${
              s.modeledRemainingMillions != null
                ? `$${s.modeledRemainingMillions.toFixed(1)}M`
                : "n/a"
            } verified=${
              s.verifiedRemainingMillions != null
                ? `$${s.verifiedRemainingMillions.toFixed(1)}M`
                : "withheld"
            }`,
        )
        .join(" · ") || "No gross capacity published for applicable domains",
      evidence: applicableSlices
        .filter((s) => s.grossCapacityMillions != null)
        .map((s) => `${s.domain}:${s.grossCapacityMillions}`),
    },
    {
      id: "APPLY_SHARED_CAPACITY",
      index: 6,
      title: "Apply shared capacity without double counting",
      status: request.utilizationAuthority?.sharedCapacityId ? "OK" : "PARTIAL",
      detail:
        sharedNotes[0] ??
        "Shared-pool remaining attributed once via claimedSharedPools; implicit stacking refused.",
      evidence: sharedNotes,
    },
    {
      id: "REQUIRE_UTILIZATION_COMPLETENESS",
      index: 7,
      title:
        "Require authoritative utilization and ledger completeness before publishing verified remaining",
      status: applicableSlices.some((s) => s.verifiedRemainingMillions != null)
        ? "OK"
        : "REFUSED",
      detail: request.utilizationAuthority
        ? "Authority supplied — remaining only if resolveUtilization + computeVerifiedRemaining support publication"
        : "No utilization authority — verified remaining withheld (caller flags ignored)",
      evidence: applicableSlices
        .filter((s) => s.verifiedRemainingRefusalReason)
        .map((s) => `${s.domain}: ${s.verifiedRemainingRefusalReason}`),
    },
    {
      id: "EVALUATE_CONDITIONS",
      index: 8,
      title: "Evaluate financial, entity, document-version and timing conditions",
      status: evaluation.financialIdentityValid ? "PARTIAL" : "BLOCKED",
      detail: `entityScope=[${tx.assumptions.entityScope.join(", ")}] asOf=${packageIdentity.evaluationDate} financialIdentityValid=${evaluation.financialIdentityValid}`,
      evidence: [
        ...tx.assumptions.entityScope.map((e) => `entity:${e}`),
        `ebitdaDerivation=${evaluation.contractualComputation.ebitdaDerivation?.kind ?? "none"}`,
      ],
    },
    {
      id: "HYPOTHETICAL_POST_STATE",
      index: 9,
      title: "Produce an atomic hypothetical post-transaction state",
      status: "OK",
      detail: `TNL=${evaluation.proForma.totalNetLeverage?.toFixed(2) ?? "n/a"} SSNL=${evaluation.proForma.seniorSecuredNetLeverage?.toFixed(2) ?? "n/a"} coverage=${evaluation.proForma.interestCoverage?.toFixed(2) ?? "n/a"} · postsToLedger=false`,
      evidence: ["authority=HYPOTHETICAL", "no ledger mutation"],
    },
    {
      id: "RETURN_RESULTS_WITH_TRACE",
      index: 10,
      title:
        "Return per-covenant and overall results with citations, missing inputs, assumptions, limitations and trace",
      status: packagePermitted ? "OK" : "PARTIAL",
      detail: `overall(modeled)=${overallStatus} packagePermitted=${packagePermitted} (requires REQUIRE EXECUTED_SATISFIED + PRODUCTION_AUTHORITY_ACTIVE; verified=${verifiedHandoff?.executionStatus ?? "absent"})`,
      evidence: [
        `citations=${citations.length}`,
        `missingInputs=${missingInputs.length}`,
        `limitations=${limitations.length}`,
        `blockers=${unresolvedBlockers.length}`,
        `verifiedExecution=${verifiedHandoff?.executionStatus ?? "absent"}/${verifiedHandoff?.productionAuthority ?? "n/a"}`,
      ],
    },
  ];

  const trace = [
    `${PACKAGE_TRANSACTION_EXECUTION_VERSION} via ${CROSS_DOMAIN_EVALUATION_VERSION}`,
    `owner=${CROSS_DOMAIN_CANONICAL_OWNER}`,
    `scenario=${tx.kind} amount=${tx.amountMillions} secured=${tx.secured}`,
    `overall(modeled)=${overallStatus} packagePermitted=${packagePermitted}`,
    `verifiedExecution=${verifiedHandoff?.executionStatus ?? "absent"} productionAuthority=${verifiedHandoff?.productionAuthority ?? "n/a"}`,
    ...steps.map((s) => `step${s.index}:${s.id}:${s.status}`),
    evaluation.authorityNote,
  ];

  return {
    version: PACKAGE_TRANSACTION_EXECUTION_VERSION,
    crossDomainVersion: CROSS_DOMAIN_EVALUATION_VERSION,
    canonicalOwner: CROSS_DOMAIN_CANONICAL_OWNER,
    packageIdentity,
    applicableDomains: applicable,
    irrelevantDomains: irrelevant,
    supportByDomain,
    overallStatus,
    packagePermitted,
    verifiedExecutionHandoff: verifiedHandoff,
    steps,
    evaluation,
    citations,
    missingInputs,
    assumptions,
    limitations,
    unresolvedBlockers: [...new Set(unresolvedBlockers)],
    hypotheticalPostState: {
      totalNetLeverage: evaluation.proForma.totalNetLeverage,
      seniorSecuredNetLeverage: evaluation.proForma.seniorSecuredNetLeverage,
      interestCoverage: evaluation.proForma.interestCoverage,
      postsToLedger: false,
      authority: "HYPOTHETICAL",
    },
    trace,
  };
}
