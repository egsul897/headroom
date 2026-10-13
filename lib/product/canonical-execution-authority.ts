/**
 * Canonical execution authority classes for Position / Ask / Simulate.
 *
 * Authoritative transaction-permissibility conclusions may only arise from the
 * verified package execution spine (REQUIRE gates):
 *
 *   compileOperativeCovenantPackage / compileFrozenDebtPackage
 *     → evaluateVerifiedCapacity + simulateVerifiedTransaction
 *     → executeUnifiedVerifiedTransaction
 *
 * Cross-domain package modeling (#334) is a supporting layer. Its gross-capacity
 * "clear" outcomes are MODELED_GROSS only — never VERIFIED_TRANSACTION_PERMITTED
 * and never VERIFIED_REMAINING.
 */

import type { CustomerStatusCode } from "@/lib/customer-workflow/status-contract";
import type { CrossDomainTransactionEvaluation } from "@/lib/product/cross-domain-transaction";
import type { ProductExecutionHandoff } from "@/lib/product/verified-transaction-execution/types";

/** Structural subset — avoids circular import of certified-simulate-bridge. */
export interface VerifiedSimulateAuthorityInput {
  executable: boolean;
  refusalSummary: string[];
  certified: {
    verifiedPackagePresent: boolean;
    blockers: string[];
  };
  pathEnumeration?: {
    incompleteReasons?: string[];
  };
}

export const CANONICAL_EXECUTION_AUTHORITY_VERSION =
  "canonical-execution-authority.v1" as const;

/**
 * Product vocabulary required by the canonical execution architecture directive.
 * Distinct from legacy engine TransactionStatus ("clear"/"blocked").
 */
export type ExecutionAuthorityClass =
  | "MODELED_GROSS"
  | "VERIFIED_REMAINING"
  | "VERIFIED_TRANSACTION_PERMITTED"
  | "NEEDS_INPUT"
  | "UNSUPPORTED"
  | "REVIEW_REQUIRED";

/** Canonical identity keys shared across verified spine + supporting layers. */
export interface CanonicalExecutionIdentities {
  companyId: string;
  instrumentKey: string | null;
  documentIds: string[];
  provisionCodes: string[];
  packageVersion: string | null;
  entityScope: string[];
  financialSnapshotId: string | null;
  ledgerAuthority: "NONE" | "ATTRIBUTED" | "UNKNOWN_HISTORY" | "COMPLETENESS_CERTIFIED";
  evaluationDate: string | null;
}

export interface DomainAuthoritySlice {
  domain: string;
  modeledStatus: string;
  authorityClass: ExecutionAuthorityClass;
  blocksPermissibility: boolean;
  note: string;
}

export interface TransactionPermissibilityVerdict {
  version: typeof CANONICAL_EXECUTION_AUTHORITY_VERSION;
  /** Authoritative claim class for transaction permissibility. */
  authorityClass: ExecutionAuthorityClass;
  /** True only for VERIFIED_TRANSACTION_PERMITTED from the verified spine. */
  permitted: boolean;
  /** Supporting modeled gross may be clear while permitted stays false. */
  modeledGrossClear: boolean;
  blockingDomains: string[];
  domainSlices: DomainAuthoritySlice[];
  identities: CanonicalExecutionIdentities;
  source:
    | "VERIFIED_SPINE"
    | "CROSS_DOMAIN_SUPPORTING"
    | "COMPOSED_SPINE_WITH_CROSS_DOMAIN_MODEL";
  limitations: string[];
}

const BLOCKING_ENGINE_STATUSES = new Set([
  "blocked",
  "review_required",
  "not_tested",
  "not_applicable",
]);

/** Map authority class → existing customer status presentation contract. */
export function executionAuthorityToCustomerStatus(
  authority: ExecutionAuthorityClass,
): CustomerStatusCode {
  switch (authority) {
    case "MODELED_GROSS":
      return "GROSS_CONTRACTUAL";
    case "VERIFIED_REMAINING":
      return "VERIFIED_UTILIZATION_COMPLETE";
    case "VERIFIED_TRANSACTION_PERMITTED":
      return "VERIFIED_EXECUTABLE";
    case "NEEDS_INPUT":
      return "NEEDS_INPUT";
    case "UNSUPPORTED":
      return "UNSUPPORTED";
    case "REVIEW_REQUIRED":
      return "REVIEW_REQUIRED";
  }
}

/**
 * Cross-domain gross modeling → authority class.
 * Guarantees: never VERIFIED_REMAINING, never VERIFIED_TRANSACTION_PERMITTED.
 */
export function classifyCrossDomainEvaluation(
  evaluation: CrossDomainTransactionEvaluation,
  identities?: Partial<CanonicalExecutionIdentities>,
): TransactionPermissibilityVerdict {
  const domainSlices: DomainAuthoritySlice[] = evaluation.domains.map((d) => {
    const supportUnsupported = d.support === "UNSUPPORTED";
    const statusBlocks =
      d.status === "blocked" ||
      d.status === "review_required" ||
      d.status === "not_tested";
    let authorityClass: ExecutionAuthorityClass = "MODELED_GROSS";
    if (supportUnsupported || d.status === "not_tested") {
      authorityClass = "UNSUPPORTED";
    } else if (d.status === "review_required" || d.missingInputs.length > 0) {
      authorityClass =
        d.missingInputs.length > 0 && d.status !== "blocked"
          ? "NEEDS_INPUT"
          : "REVIEW_REQUIRED";
    } else if (d.status === "blocked") {
      authorityClass = "UNSUPPORTED";
    } else if (d.verifiedRemainingMillions != null) {
      // Defensive: cross-domain must not publish verified remaining. Demote.
      authorityClass = "MODELED_GROSS";
    }

    return {
      domain: d.domain,
      modeledStatus: String(d.status),
      authorityClass,
      blocksPermissibility:
        supportUnsupported ||
        statusBlocks ||
        d.verifiedRemainingMillions != null /* illegal remaining publication */,
      note:
        d.verifiedRemainingMillions != null
          ? "Illegal verified-remaining publication on cross-domain path — demoted to MODELED_GROSS / blocking."
          : d.summary,
    };
  });

  // Any applicable domain that is not modeled-clear blocks permissibility.
  const blockingDomains = domainSlices
    .filter((s) => s.blocksPermissibility && s.modeledStatus !== "not_applicable")
    .map((s) => s.domain);

  const modeledGrossClear =
    evaluation.overallStatus === "clear" && blockingDomains.length === 0;

  // Cross-domain alone can NEVER be transaction-permitted.
  let authorityClass: ExecutionAuthorityClass = "MODELED_GROSS";
  if (evaluation.overallStatus === "review_required") {
    authorityClass = "REVIEW_REQUIRED";
  } else if (evaluation.overallStatus === "not_tested") {
    authorityClass = "UNSUPPORTED";
  } else if (evaluation.overallStatus === "blocked" || blockingDomains.length > 0) {
    authorityClass = blockingDomains.some(
      (d) =>
        domainSlices.find((s) => s.domain === d)?.authorityClass === "NEEDS_INPUT",
    )
      ? "NEEDS_INPUT"
      : evaluation.overallStatus === "blocked"
        ? "UNSUPPORTED"
        : "REVIEW_REQUIRED";
  } else if (modeledGrossClear) {
    authorityClass = "MODELED_GROSS";
  }

  const id: CanonicalExecutionIdentities = {
    companyId: identities?.companyId ?? "unknown",
    instrumentKey: identities?.instrumentKey ?? null,
    documentIds: identities?.documentIds ?? [],
    provisionCodes: identities?.provisionCodes ?? [],
    packageVersion: identities?.packageVersion ?? evaluation.version,
    entityScope: identities?.entityScope ?? evaluation.scenario.assumptions.entityScope,
    financialSnapshotId: identities?.financialSnapshotId ?? null,
    ledgerAuthority: identities?.ledgerAuthority ?? "NONE",
    evaluationDate:
      identities?.evaluationDate ?? evaluation.scenario.assumptions.evaluationDate,
  };

  return {
    version: CANONICAL_EXECUTION_AUTHORITY_VERSION,
    authorityClass,
    permitted: false,
    modeledGrossClear,
    blockingDomains,
    domainSlices,
    identities: id,
    source: "CROSS_DOMAIN_SUPPORTING",
    limitations: [
      ...evaluation.packageLimitations,
      "Cross-domain evaluator is a supporting modeling layer — not an independent certification engine.",
      "Authoritative transaction-permissibility requires the verified package execution spine (REQUIRE).",
      "Successful cross-domain gross-capacity calculation must not be promoted to PERMITTED.",
    ],
  };
}

/**
 * Verified simulate / product handoff → authoritative permissibility class.
 */
export function classifyVerifiedSimulate(
  verified: VerifiedSimulateAuthorityInput | null | undefined,
  identities?: Partial<CanonicalExecutionIdentities>,
): TransactionPermissibilityVerdict {
  const blockers = [
    ...(verified?.refusalSummary ?? []),
    ...(verified?.certified.blockers ?? []),
  ];
  const incomplete = verified?.pathEnumeration.incompleteReasons ?? [];

  let authorityClass: ExecutionAuthorityClass = "NEEDS_INPUT";
  if (!verified || !verified.certified.verifiedPackagePresent) {
    authorityClass = incomplete.includes("NO_VERIFIED_EXECUTION_PACKAGE")
      ? "NEEDS_INPUT"
      : "NEEDS_INPUT";
  } else if (verified.executable === true) {
    authorityClass = "VERIFIED_TRANSACTION_PERMITTED";
  } else if (blockers.some((b) => /UNSUPPORTED|NOT_TESTED|NO_CANDIDATE/i.test(b))) {
    authorityClass = "UNSUPPORTED";
  } else if (blockers.length > 0 || incomplete.length > 0) {
    authorityClass = blockers.some((b) => /REVIEW|AMEND|OPERATIVE/i.test(b))
      ? "REVIEW_REQUIRED"
      : "NEEDS_INPUT";
  }

  return {
    version: CANONICAL_EXECUTION_AUTHORITY_VERSION,
    authorityClass,
    permitted: authorityClass === "VERIFIED_TRANSACTION_PERMITTED",
    modeledGrossClear: false,
    blockingDomains: blockers,
    domainSlices: [],
    identities: {
      companyId: identities?.companyId ?? "unknown",
      instrumentKey: identities?.instrumentKey ?? null,
      documentIds: identities?.documentIds ?? [],
      provisionCodes: identities?.provisionCodes ?? [],
      packageVersion: identities?.packageVersion ?? null,
      entityScope: identities?.entityScope ?? [],
      financialSnapshotId: identities?.financialSnapshotId ?? null,
      ledgerAuthority: identities?.ledgerAuthority ?? "NONE",
      evaluationDate: identities?.evaluationDate ?? null,
    },
    source: "VERIFIED_SPINE",
    limitations:
      authorityClass === "VERIFIED_TRANSACTION_PERMITTED"
        ? [
            "Verified spine SATISFIED under REQUIRE — still not a legal opinion or production activation unless productionAuthority is ACTIVE.",
          ]
        : [
            "Verified spine did not affirmatively permit this transaction.",
            ...blockers,
            ...incomplete,
          ],
  };
}

export function classifyProductHandoff(
  handoff: ProductExecutionHandoff,
  identities?: Partial<CanonicalExecutionIdentities>,
): TransactionPermissibilityVerdict {
  let authorityClass: ExecutionAuthorityClass = "REVIEW_REQUIRED";
  if (handoff.executable && handoff.remainingPublicationAllowed) {
    authorityClass = "VERIFIED_TRANSACTION_PERMITTED";
  } else if (handoff.executable) {
    // Executable hypothetical without remaining publication — still verified path, but
    // remaining may be withheld. Treat as permitted under REQUIRE only when executable.
    authorityClass = "VERIFIED_TRANSACTION_PERMITTED";
  } else if (handoff.blockers.some((b) => /NO_VERIFIED|MISSING|NEEDS/i.test(b))) {
    authorityClass = "NEEDS_INPUT";
  } else if (handoff.blockers.some((b) => /UNSUPPORTED|NOT_TESTED/i.test(b))) {
    authorityClass = "UNSUPPORTED";
  }

  return {
    version: CANONICAL_EXECUTION_AUTHORITY_VERSION,
    authorityClass,
    permitted: authorityClass === "VERIFIED_TRANSACTION_PERMITTED",
    modeledGrossClear: false,
    blockingDomains: [...handoff.blockers],
    domainSlices: [],
    identities: {
      companyId: identities?.companyId ?? "unknown",
      instrumentKey: identities?.instrumentKey ?? null,
      documentIds: identities?.documentIds ?? [],
      provisionCodes: identities?.provisionCodes ?? [],
      packageVersion: identities?.packageVersion ?? handoff.contractVersion,
      entityScope: identities?.entityScope ?? [],
      financialSnapshotId: identities?.financialSnapshotId ?? null,
      ledgerAuthority: handoff.utilizationSupportsRemaining
        ? "COMPLETENESS_CERTIFIED"
        : "NONE",
      evaluationDate: identities?.evaluationDate ?? null,
    },
    source: "VERIFIED_SPINE",
    limitations: [handoff.authorityNote, ...handoff.blockers],
  };
}

/**
 * Compose supporting cross-domain modeling with verified-spine authority.
 * Authoritative permitted bit comes ONLY from the spine.
 *
 * Rule: if any applicable modeled domain blocks, overall cannot be PERMITTED
 * even if debt capacity alone would clear — and even if spine were hypothetically
 * green (defense in depth: spine must also agree).
 */
export function composeAuthoritativePermissibility(args: {
  verified: TransactionPermissibilityVerdict;
  crossDomain?: TransactionPermissibilityVerdict | null;
  identities?: Partial<CanonicalExecutionIdentities>;
}): TransactionPermissibilityVerdict {
  const xd = args.crossDomain ?? null;
  const blockingFromModel = xd?.blockingDomains ?? [];
  const modeledBlocks = blockingFromModel.length > 0;

  if (modeledBlocks) {
    return {
      version: CANONICAL_EXECUTION_AUTHORITY_VERSION,
      authorityClass:
        xd?.authorityClass === "NEEDS_INPUT" ? "NEEDS_INPUT" : "REVIEW_REQUIRED",
      permitted: false,
      modeledGrossClear: false,
      blockingDomains: blockingFromModel,
      domainSlices: xd?.domainSlices ?? [],
      identities: {
        ...args.verified.identities,
        ...xd?.identities,
        ...args.identities,
        companyId:
          args.identities?.companyId ??
          args.verified.identities.companyId ??
          xd?.identities.companyId ??
          "unknown",
      },
      source: "COMPOSED_SPINE_WITH_CROSS_DOMAIN_MODEL",
      limitations: [
        "Applicable covenant domain(s) failed or are incomplete — overall not PERMITTED.",
        `Blocking domains: ${blockingFromModel.join(", ")}`,
        ...(xd?.limitations ?? []),
        ...args.verified.limitations,
      ],
    };
  }

  // No modeled blockers: authoritative answer is still the verified spine only.
  if (args.verified.permitted) {
    return {
      ...args.verified,
      source: xd ? "COMPOSED_SPINE_WITH_CROSS_DOMAIN_MODEL" : "VERIFIED_SPINE",
      domainSlices: xd?.domainSlices ?? args.verified.domainSlices,
      limitations: [
        ...args.verified.limitations,
        ...(xd
          ? [
              "Cross-domain modeling attached as supporting context (MODELED_GROSS); permissibility from verified spine.",
            ]
          : []),
      ],
    };
  }

  // Spine refused — surface spine class; attach modeled gross as context only.
  return {
    ...args.verified,
    permitted: false,
    modeledGrossClear: xd?.modeledGrossClear ?? false,
    source: xd ? "COMPOSED_SPINE_WITH_CROSS_DOMAIN_MODEL" : "VERIFIED_SPINE",
    domainSlices: xd?.domainSlices ?? [],
    limitations: [
      ...args.verified.limitations,
      ...(xd?.modeledGrossClear
        ? [
            "Supporting cross-domain modeled gross is clear but is NOT promoted to VERIFIED_TRANSACTION_PERMITTED.",
          ]
        : []),
      ...(xd?.limitations ?? []),
    ],
  };
}

/**
 * Fail-closed guard used by product surfaces: refuse to label PERMITTED from
 * cross-domain overallStatus alone.
 */
export function assertNotPromotedFromCrossDomainGross(
  evaluation: CrossDomainTransactionEvaluation,
): ExecutionAuthorityClass {
  const verdict = classifyCrossDomainEvaluation(evaluation);
  if (
    verdict.authorityClass === "VERIFIED_TRANSACTION_PERMITTED" ||
    verdict.authorityClass === "VERIFIED_REMAINING" ||
    verdict.permitted
  ) {
    throw new Error(
      "CANONICAL_AUTHORITY_VIOLATION: cross-domain path attempted verified permissibility/remaining promotion",
    );
  }
  // Even when overallStatus === "clear", product must present MODELED_GROSS.
  if (evaluation.overallStatus === "clear") {
    return "MODELED_GROSS";
  }
  return verdict.authorityClass;
}

export function domainStatusBlocksPermissibility(status: string): boolean {
  return BLOCKING_ENGINE_STATUSES.has(status);
}
