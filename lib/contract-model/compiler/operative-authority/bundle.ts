/**
 * Additive operative-authority handoff bundle for Agent #6 (retrieval) and
 * Agent #10 (execution). Consumes HEADROOM-3 confirmed instrument identity
 * when supplied; never rewrites package-graph membership.
 */

import type { PackageDocumentInput, PackageGraphResult } from "../package-graph/types";
import {
  resolveGoverningProvision,
  type AmendmentLikeAuthority,
  type ResolveGoverningProvisionInput,
} from "./governing-provision";
import { resolvePackageRestatementAuthorities } from "./restatement-authority";
import type {
  ConfirmedInstrumentIdentityView,
  GoverningProvisionResolution,
  OperativeAuthorityHandoffBundle,
  RestatementAuthorityResolution,
} from "./types";

export const OPERATIVE_AUTHORITY_MODULE_VERSION = "operative-restatement-authority.v1";

/** Pinned at Agent #7 kickoff after fetching origin/main (post-#276). */
export const AGENT7_STARTING_MAIN_SHA = "6abe42bae6dfe69bb72467daa7f460b727200d1b";

export interface BuildOperativeAuthorityBundleInput {
  companyId: string;
  packageKey: string;
  asOfDate: string;
  documents: PackageDocumentInput[];
  packageGraph: PackageGraphResult;
  /** Provisions to resolve (section or definition refs). */
  provisions: Array<{ sectionRef?: string | null; definedTermRef?: string | null }>;
  /** Optional #274 confirmed identity — when omitted, family = all instrument documentIds. */
  confirmedInstrumentIdentity?: ConfirmedInstrumentIdentityView | null;
  amendmentLikeAuthorities?: AmendmentLikeAuthority[];
  /** Optional predecessor overrides for tests only. */
  predecessorOverrides?: Record<string, string>;
  /** Instrument document family when identity view absent. */
  instrumentDocumentIds?: string[];
  baseDocumentId?: string | null;
}

function deriveInstrumentFamily(
  graph: PackageGraphResult,
  identity: ConfirmedInstrumentIdentityView | null | undefined,
  explicitIds: string[] | undefined,
): { instrumentDocumentIds: string[]; baseDocumentId: string | null } {
  if (identity) {
    return {
      instrumentDocumentIds: identity.confirmedDocumentIds,
      baseDocumentId: identity.confirmedDocumentIds.slice().sort()[0] ?? null,
    };
  }
  if (explicitIds && explicitIds.length > 0) {
    return { instrumentDocumentIds: explicitIds, baseDocumentId: explicitIds[0] ?? null };
  }
  // Fall back to union of all instrument memberships in the package graph.
  const ids = [...new Set(graph.instruments.flatMap((i) => i.documentIds))];
  const base =
    graph.instruments.find((i) => i.baseDocumentId)?.baseDocumentId ??
    ids.slice().sort()[0] ??
    null;
  return { instrumentDocumentIds: ids, baseDocumentId: base };
}

function verdictFor(
  authorities: RestatementAuthorityResolution[],
  provisions: GoverningProvisionResolution[],
): Pick<OperativeAuthorityHandoffBundle, "verdict" | "verdictReasons" | "unsupportedCases"> {
  const unsupportedCases: string[] = [];
  const verdictReasons: string[] = [];

  const confirmed = authorities.filter((a) => a.status === "OPERATIVE_AUTHORITY_CONFIRMED");
  const blocked = authorities.filter((a) => a.status === "UNSUPPORTED" || a.status === "AMBIGUOUS");
  // Historical restatements whose prior agreement is simply absent from the
  // package (e.g. Fourth AR restating an out-of-package Third AR) are
  // expected REVIEW_REQUIRED items — they do not block a later confirmed
  // in-package restatement from verifying the live chain tip.
  const confirmedPredecessorIds = new Set(confirmed.map((a) => a.predecessorDocumentId).filter(Boolean));
  const blockingReview = authorities.filter(
    (a) =>
      a.status === "REVIEW_REQUIRED" &&
      // Block only when this successor is not itself the confirmed predecessor
      // of a later in-package restatement (i.e. not a historical chain tip).
      !confirmedPredecessorIds.has(a.successorDocumentId),
  );
  const historicalReview = authorities.filter(
    (a) => a.status === "REVIEW_REQUIRED" && confirmedPredecessorIds.has(a.successorDocumentId),
  );

  const provisionOk = provisions.filter(
    (p) =>
      p.authorityClassification === "CONFIRMED_OPERATIVE" ||
      p.authorityClassification === "CONFIRMED_OPERATIVE_WITH_CAVEATS" ||
      p.authorityClassification === "NOT_YET_EFFECTIVE" ||
      p.authorityClassification === "SUPERSEDED_SOURCE",
  );
  const provisionBlocked = provisions.filter(
    (p) =>
      p.authorityClassification === "AMBIGUOUS" ||
      p.authorityClassification === "UNSUPPORTED" ||
      p.authorityClassification === "PROVISIONAL_IDENTITY_BLOCKED",
  );

  for (const a of authorities) {
    if (a.caveats.includes("CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN")) {
      unsupportedCases.push(`CP_SATISFACTION_NOT_INDEPENDENTLY_PROVEN:${a.successorDocumentId}`);
    }
    if (a.evidence.packageGraphRelationshipStatus && a.evidence.packageGraphRelationshipStatus !== "RESOLVED") {
      unsupportedCases.push(`PACKAGE_GRAPH_RESTATES_UNCHANGED:${a.successorDocumentId}:${a.evidence.packageGraphRelationshipStatus}`);
    }
  }
  for (const a of historicalReview) {
    unsupportedCases.push(`HISTORICAL_PRIOR_OUT_OF_PACKAGE:${a.successorDocumentId}`);
  }
  unsupportedCases.push("NO_PACKAGE_GRAPH_EDGE_MUTATION");
  unsupportedCases.push("NO_PRODUCTION_NEON_WRITES");
  unsupportedCases.push("NO_PAID_INFERENCE");

  if (
    confirmed.length > 0 &&
    provisionOk.length === provisions.length &&
    provisionBlocked.length === 0 &&
    blockingReview.length === 0
  ) {
    verdictReasons.push("All requested provisions resolve under source-backed restatement authority.");
    if (unsupportedCases.some((c) => c.startsWith("CP_SATISFACTION"))) {
      verdictReasons.push("CP satisfaction remains a disclosed caveat — not independently proven from package artifacts.");
    }
    if (historicalReview.length > 0) {
      verdictReasons.push(
        `${historicalReview.length} historical restatement(s) correctly remain REVIEW_REQUIRED because their prior agreement is out of package.`,
      );
    }
    return { verdict: "OPERATIVE_RESTATEMENT_AUTHORITY_VERIFIED", verdictReasons, unsupportedCases };
  }

  if (confirmed.length > 0 || provisionOk.length > 0) {
    verdictReasons.push(
      `Partial authority: ${confirmed.length} confirmed restatement(s); ${provisionOk.length}/${provisions.length} provision(s) resolved; ${blockingReview.length} blocking review item(s); ${provisionBlocked.length} provision block(s).`,
    );
    return { verdict: "OPERATIVE_RESTATEMENT_AUTHORITY_PARTIAL", verdictReasons, unsupportedCases };
  }

  verdictReasons.push(
    `Blocked: no confirmed restatement authority (${blocked.length} unsupported/ambiguous, ${blockingReview.length} review-required); ${provisionBlocked.length} provision block(s).`,
  );
  return { verdict: "OPERATIVE_RESTATEMENT_AUTHORITY_BLOCKED", verdictReasons, unsupportedCases };
}

/**
 * Build the additive operative-authority handoff bundle.
 */
export function buildOperativeAuthorityHandoffBundle(
  input: BuildOperativeAuthorityBundleInput,
): OperativeAuthorityHandoffBundle {
  const authorities = resolvePackageRestatementAuthorities({
    documents: input.documents,
    packageGraph: input.packageGraph,
    predecessorOverrides: input.predecessorOverrides,
  });

  const family = deriveInstrumentFamily(
    input.packageGraph,
    input.confirmedInstrumentIdentity,
    input.instrumentDocumentIds,
  );
  const baseDocumentId = input.baseDocumentId !== undefined ? input.baseDocumentId : family.baseDocumentId;

  const provisions = input.provisions.map((p) => {
    const govInput: ResolveGoverningProvisionInput = {
      asOfDate: input.asOfDate,
      sectionRef: p.sectionRef,
      definedTermRef: p.definedTermRef,
      instrumentDocumentIds: family.instrumentDocumentIds,
      baseDocumentId,
      restatementAuthorities: authorities,
      amendmentLikeAuthorities: input.amendmentLikeAuthorities,
      confirmedInstrumentIdentity: input.confirmedInstrumentIdentity,
    };
    return resolveGoverningProvision(govInput);
  });

  const { verdict, verdictReasons, unsupportedCases } = verdictFor(authorities, provisions);

  return {
    companyId: input.companyId,
    packageKey: input.packageKey,
    asOfDate: input.asOfDate,
    startingMainSha: AGENT7_STARTING_MAIN_SHA,
    packageGraphAuthorityPr: "https://github.com/egsul897/headroom/pull/274",
    worHoldoutPr: "https://github.com/egsul897/headroom/pull/276",
    restatementAuthorities: authorities,
    provisions,
    unsupportedCases,
    verdict,
    verdictReasons,
  };
}
