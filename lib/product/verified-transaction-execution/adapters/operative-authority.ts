/**
 * Operative source-authority adapter for unified transaction execution.
 *
 * Reconciled to merged #274 (`operative-handoff.ts`): reuses the same
 * `OperativeAuthorityClassification` union. Orchestration still accepts an
 * already-classified `OperativeSourceAuthority` claim (callers may project
 * from `OperativeProvisionResolution` via `operativeAuthorityFromProvision`)
 * and fails closed on provisional / conflicted / unconfirmed identity.
 */

export type { OperativeAuthorityClassification } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import type { OperativeAuthorityClassification } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import type { OperativeProvisionResolution } from "@/lib/contract-model/compiler/package-graph/operative-handoff";

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
}

export interface OperativeAuthorityEvaluation {
  ok: boolean;
  authority: OperativeAuthorityClassification;
  blockers: string[];
  sourceCitation: string;
  sourceDocumentId: string;
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
  };
}

/**
 * Gate operative source authority for execution.
 * Provisional documents never promote to operative. Conflicting amendments refuse.
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

  const unique = [...new Set(blockers)];
  return {
    ok: unique.length === 0 && authority.authorityClassification === "CONFIRMED_OPERATIVE",
    authority: authority.authorityClassification,
    blockers: unique,
    sourceCitation: authority.sourceCitation,
    sourceDocumentId: authority.sourceDocumentId,
  };
}
