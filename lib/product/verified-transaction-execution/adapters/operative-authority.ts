/**
 * Operative source-authority adapter for unified transaction execution.
 *
 * Reconciled to merged #274 (`operative-handoff.ts`) and #283
 * (`operative-authority/*`). Orchestration accepts an already-classified
 * `OperativeSourceAuthority` claim (project from #274 via
 * `operativeAuthorityFromProvision` or from #283 via
 * `operativeAuthorityFromGoverningProvision`) and fails closed on
 * provisional / conflicted / unconfirmed identity. Never silently rewrites
 * the package graph. Never promotes CONFIRMED_OPERATIVE_WITH_CAVEATS or
 * unproven conditions-precedent satisfaction to unconditional production.
 */

export type { OperativeAuthorityClassification } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import type { OperativeAuthorityClassification } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import type { OperativeProvisionResolution } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import {
  evaluateProductionAuthorityPromotion,
  type ProductionAuthorityEvaluation,
} from "@/lib/contract-model/compiler/operative-authority";
import type {
  ConditionsPrecedentSatisfaction,
  GoverningAuthorityClassification,
  GoverningProvisionResolution,
} from "@/lib/contract-model/compiler/operative-authority";

export type DocumentOperativeStatus =
  | "OPERATIVE"
  | "PROVISIONAL"
  | "SUPERSEDED"
  | "UNKNOWN";

export interface OperativeSourceAuthority {
  /** Canonical instrument key when identity is confirmed; null if provisional. */
  canonicalInstrumentKey: string | null;
  sourceDocumentId: string;
  sourceSectionRef: string;
  sourceCitation: string;
  authorityClassification: OperativeAuthorityClassification;
  documentStatus: DocumentOperativeStatus;
  effectiveAsOfDate: string;
  /** True when instrument membership relies on provisional associations. */
  provisionalIdentity: boolean;
  /** Conflicting same-date / competing amendment effects. */
  conflictingAmendment: boolean;
  unresolvedConflicts: string[];
  mayConsolidateOperative: boolean;
  /**
   * Optional #283 governing classification. When set to
   * CONFIRMED_OPERATIVE_WITH_CAVEATS (or other non-unconditional classes),
   * production promotion is refused even if #274 handoff says CONFIRMED_OPERATIVE.
   */
  governingAuthorityClassification?: GoverningAuthorityClassification | null;
  /** Explicit CP treatment from #283 — never inferred from contractual wording alone. */
  conditionsPrecedentSatisfaction?: ConditionsPrecedentSatisfaction | null;
  /** Source-backed caveats (effectiveness, CP, out-of-package priors, etc.). */
  operativeCaveats?: string[];
}
export interface OperativeAuthorityEvaluation {
  ok: boolean;
  authority: OperativeAuthorityClassification;
  blockers: string[];
  sourceCitation: string;
  sourceDocumentId: string;
  /** #283 production-promotion gate (never ACTIVE for caveated / unproven CP). */
  productionPromotion: ProductionAuthorityEvaluation;
}

const BLOCKING: ReadonlySet<OperativeAuthorityClassification> = new Set([
  "PROVISIONAL_IDENTITY_BLOCKED",
  "NOT_YET_EFFECTIVE",
  "SUPERSEDED_SOURCE",
  "AMBIGUOUS",
  "REVIEW_REQUIRED",
  "CONFLICTED",
  "UNSUPPORTED",
]);

/**
 * Project a #274 OperativeProvisionResolution into the orchestration claim shape.
 */
export function operativeAuthorityFromProvision(
  provision: OperativeProvisionResolution,
  opts?: {
    documentStatus?: DocumentOperativeStatus;
    mayConsolidateOperative?: boolean;
  },
): OperativeSourceAuthority {
  const provisional =
    provision.authorityClassification === "PROVISIONAL_IDENTITY_BLOCKED" ||
    provision.canonicalInstrumentKey == null;
  return {
    canonicalInstrumentKey: provision.canonicalInstrumentKey,
    sourceDocumentId: provision.sourceDocumentId ?? "",
    sourceSectionRef: provision.sectionRef ?? provision.definedTermRef ?? "",
    sourceCitation: provision.sourceSpan.citation ?? provision.provisionKey,
    authorityClassification: provision.authorityClassification,
    documentStatus:
      opts?.documentStatus ??
      (provisional
        ? "PROVISIONAL"
        : provision.authorityClassification === "SUPERSEDED_SOURCE"
          ? "SUPERSEDED"
          : "OPERATIVE"),
    effectiveAsOfDate: provision.effectiveAsOfDate,
    provisionalIdentity: provisional,
    conflictingAmendment: provision.authorityClassification === "CONFLICTED",
    unresolvedConflicts: [...provision.unresolvedConflicts],
    mayConsolidateOperative: opts?.mayConsolidateOperative ?? !provisional,
    governingAuthorityClassification: null,
    conditionsPrecedentSatisfaction: null,
    operativeCaveats: [],
  };
}

/**
 * Project a #283 GoverningProvisionResolution into the orchestration claim shape.
 * Preserves caveats and CP satisfaction; does not mutate package-graph edges.
 */
export function operativeAuthorityFromGoverningProvision(
  provision: GoverningProvisionResolution,
  opts: {
    canonicalInstrumentKey: string | null;
    sourceCitation?: string;
    mayConsolidateOperative?: boolean;
  },
): OperativeSourceAuthority {
  const governing = provision.authorityClassification;
  const provisional = governing === "PROVISIONAL_IDENTITY_BLOCKED";
  const conflicting =
    provision.unresolvedConflicts.length > 0 ||
    provision.instrumentLinks.some((l) => l.relationshipToGoverning === "CONFLICTING");

  // Map #283 governing classes onto the #274 handoff union without inventing
  // CONFIRMED_OPERATIVE when the governing class is caveated or blocked.
  let authorityClassification: OperativeAuthorityClassification;
  if (governing === "CONFIRMED_OPERATIVE") {
    authorityClassification = "CONFIRMED_OPERATIVE";
  } else if (governing === "CONFIRMED_OPERATIVE_WITH_CAVEATS") {
    // Disclosed operative selection with caveats — not unconditional confirmed.
    authorityClassification = "REVIEW_REQUIRED";
  } else if (governing === "PROVISIONAL_IDENTITY_BLOCKED") {
    authorityClassification = "PROVISIONAL_IDENTITY_BLOCKED";
  } else if (governing === "NOT_YET_EFFECTIVE") {
    authorityClassification = "NOT_YET_EFFECTIVE";
  } else if (governing === "SUPERSEDED_SOURCE") {
    authorityClassification = "SUPERSEDED_SOURCE";
  } else if (governing === "AMBIGUOUS") {
    authorityClassification = "AMBIGUOUS";
  } else if (governing === "UNSUPPORTED") {
    authorityClassification = "UNSUPPORTED";
  } else {
    authorityClassification = "REVIEW_REQUIRED";
  }

  if (conflicting) {
    authorityClassification = "CONFLICTED";
  }

  return {
    canonicalInstrumentKey: opts.canonicalInstrumentKey,
    sourceDocumentId: provision.governingDocumentId ?? "",
    sourceSectionRef: provision.sectionRef ?? provision.definedTermRef ?? provision.provisionKey,
    sourceCitation:
      opts.sourceCitation ??
      `${provision.governingDocumentId ?? "unknown"}:${provision.sectionRef ?? provision.provisionKey}`,
    authorityClassification,
    documentStatus: provisional
      ? "PROVISIONAL"
      : governing === "SUPERSEDED_SOURCE"
        ? "SUPERSEDED"
        : governing === "CONFIRMED_OPERATIVE" ||
            governing === "CONFIRMED_OPERATIVE_WITH_CAVEATS"
          ? "OPERATIVE"
          : "UNKNOWN",
    effectiveAsOfDate: provision.asOfDate,
    provisionalIdentity: provisional || opts.canonicalInstrumentKey == null,
    conflictingAmendment: conflicting,
    unresolvedConflicts: [...provision.unresolvedConflicts],
    mayConsolidateOperative:
      opts.mayConsolidateOperative ??
      (!provisional &&
        opts.canonicalInstrumentKey != null &&
        governing === "CONFIRMED_OPERATIVE"),
    governingAuthorityClassification: governing,
    conditionsPrecedentSatisfaction:
      provision.provenance.conditionsPrecedentSatisfaction,
    operativeCaveats: [...provision.caveats],
  };
}

/**
 * Gate operative source authority for execution.
 * Provisional documents never promote to operative. Conflicting amendments refuse.
 * Unproven CP / CONFIRMED_OPERATIVE_WITH_CAVEATS refuse unconditional production.
 */
export function evaluateOperativeSourceAuthority(
  authority: OperativeSourceAuthority,
  expectedInstrumentKey: string,
  evaluationAsOf: string,
): OperativeAuthorityEvaluation {
  const blockers: string[] = [];

  if (authority.provisionalIdentity || authority.documentStatus === "PROVISIONAL") {
    blockers.push(
      "provisional document cannot authorize operative execution — provisional never promotes to operative",
    );
  }

  if (!authority.mayConsolidateOperative) {
    blockers.push(
      "mayConsolidateOperative=false — instrument identity not confirmed for operative consolidation",
    );
  }

  if (authority.conflictingAmendment || authority.authorityClassification === "CONFLICTED") {
    blockers.push(
      "conflicting amendment effects — cannot select a unique operative provision",
    );
    for (const c of authority.unresolvedConflicts) {
      blockers.push(`unresolved conflict: ${c}`);
    }
  }

  if (authority.canonicalInstrumentKey == null) {
    blockers.push(
      "canonicalInstrumentKey is null — unconfirmed instrument identity refuses execution",
    );
  } else if (authority.canonicalInstrumentKey !== expectedInstrumentKey) {
    blockers.push(
      `operative instrument "${authority.canonicalInstrumentKey}" ≠ expected "${expectedInstrumentKey}"`,
    );
  }

  if (authority.authorityClassification === "PROVISIONAL_IDENTITY_BLOCKED") {
    blockers.push("authorityClassification=PROVISIONAL_IDENTITY_BLOCKED");
  }

  if (BLOCKING.has(authority.authorityClassification)) {
    if (
      authority.authorityClassification !== "PROVISIONAL_IDENTITY_BLOCKED" &&
      authority.authorityClassification !== "CONFLICTED"
    ) {
      blockers.push(
        `operative authority ${authority.authorityClassification} is not CONFIRMED_OPERATIVE`,
      );
    }
  }

  if (
    authority.effectiveAsOfDate &&
    authority.effectiveAsOfDate > evaluationAsOf &&
    authority.authorityClassification === "NOT_YET_EFFECTIVE"
  ) {
    blockers.push(
      `operative provision effective ${authority.effectiveAsOfDate} after evaluation as-of ${evaluationAsOf}`,
    );
  }

  if (authority.sourceDocumentId.trim() === "" || authority.sourceCitation.trim() === "") {
    blockers.push("operative source document/citation missing");
  }

  const governingClass: GoverningAuthorityClassification =
    authority.governingAuthorityClassification ??
    (authority.authorityClassification === "CONFIRMED_OPERATIVE"
      ? "CONFIRMED_OPERATIVE"
      : authority.authorityClassification === "PROVISIONAL_IDENTITY_BLOCKED"
        ? "PROVISIONAL_IDENTITY_BLOCKED"
        : authority.authorityClassification === "NOT_YET_EFFECTIVE"
          ? "NOT_YET_EFFECTIVE"
          : authority.authorityClassification === "SUPERSEDED_SOURCE"
            ? "SUPERSEDED_SOURCE"
            : authority.authorityClassification === "AMBIGUOUS"
              ? "AMBIGUOUS"
              : authority.authorityClassification === "UNSUPPORTED"
                ? "UNSUPPORTED"
                : "REVIEW_REQUIRED");

  const productionPromotion = evaluateProductionAuthorityPromotion({
    authorityClassification: governingClass,
    conditionsPrecedentSatisfaction:
      authority.conditionsPrecedentSatisfaction ?? null,
    caveats: authority.operativeCaveats ?? [],
    attemptPromotionToProduction: true,
  });

  if (!productionPromotion.productionAuthorityActive) {
    for (const reason of productionPromotion.refusalReasons) {
      // Informational for disclosed/hypothetical paths; production mode
      // consumers read productionPromotion / classifyProductionAuthority.
      if (
        governingClass === "CONFIRMED_OPERATIVE_WITH_CAVEATS" ||
        authority.conditionsPrecedentSatisfaction === "NOT_INDEPENDENTLY_PROVEN"
      ) {
        // Do not treat as hard operative.ok failure when #274 says CONFIRMED_OPERATIVE
        // and only production elevation is refused — unless governing class is WITH_CAVEATS
        // which already maps to REVIEW_REQUIRED in the #283 projector.
        void reason;
      }
    }
  }

  const unique = [...new Set(blockers)];
  return {
    ok: unique.length === 0 && authority.authorityClassification === "CONFIRMED_OPERATIVE",
    authority: authority.authorityClassification,
    blockers: unique,
    sourceCitation: authority.sourceCitation,
    sourceDocumentId: authority.sourceDocumentId,
    productionPromotion,
  };
}
