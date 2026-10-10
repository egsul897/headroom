/**
 * Production-authority gate for Agent #7 operative-restatement handoff.
 *
 * CONFIRMED_OPERATIVE_WITH_CAVEATS (and any authority carrying unproven CP
 * satisfaction, provisional identity, conflicts, or unresolved historical
 * priors) MUST NOT become PRODUCTION_AUTHORITY_ACTIVE.
 *
 * Downstream consumers (Agent #6 retrieval, Agent #10 / unified execution,
 * capacity) call `evaluateProductionAuthorityPromotion` before elevating
 * any claim to production-authoritative capacity.
 */

import {
  isLegallyConfirmedAmendmentChain,
  mayConsolidateOperativeAgreement,
} from "../package-graph/instrument-grouping";
import type { InstrumentAssociationKind, InstrumentGroupingResult } from "../package-graph/types";
import type {
  ConditionsPrecedentSatisfaction,
  ConfirmedInstrumentIdentityView,
  GoverningAuthorityClassification,
  GoverningProvisionResolution,
  OperativeAuthorityHandoffBundle,
  RestatementAuthorityResolution,
} from "./types";

/** Explicit production disposition — never inferred from silence. */
export type ProductionAuthorityDisposition =
  | "PRODUCTION_AUTHORITY_ACTIVE"
  | "PRODUCTION_AUTHORITY_REFUSED"
  | "HYPOTHETICAL_OR_DISCLOSED_ONLY";

export interface ProductionAuthorityEvaluation {
  disposition: ProductionAuthorityDisposition;
  /** True only for unconditional PRODUCTION_AUTHORITY_ACTIVE. */
  productionAuthorityActive: boolean;
  refusalReasons: string[];
  /** Authority classification that was evaluated (when provision-scoped). */
  authorityClassification: GoverningAuthorityClassification | null;
  conditionsPrecedentSatisfaction: ConditionsPrecedentSatisfaction | null;
  caveats: string[];
}

const BLOCKING_CLASSIFICATIONS = new Set<GoverningAuthorityClassification>([
  "PROVISIONAL_IDENTITY_BLOCKED",
  "AMBIGUOUS",
  "REVIEW_REQUIRED",
  "UNSUPPORTED",
  "NOT_YET_EFFECTIVE",
  "SUPERSEDED_SOURCE",
]);

function hasUnprovenCp(
  satisfaction: ConditionsPrecedentSatisfaction | null | undefined,
  caveats: string[],
): boolean {
  if (satisfaction === "NOT_INDEPENDENTLY_PROVEN") return true;
  return caveats.some((c) => c.includes("CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN"));
}

/**
 * Evaluate whether a single provision's operative authority may become
 * PRODUCTION_AUTHORITY_ACTIVE.
 *
 * When `attemptPromotionToProduction` is true and the authority is caveated
 * or blocked, the result is always PRODUCTION_AUTHORITY_REFUSED with an
 * explicit refusal reason (regression surface for check #9).
 */
export function evaluateProductionAuthorityPromotion(input: {
  authorityClassification: GoverningAuthorityClassification;
  conditionsPrecedentSatisfaction?: ConditionsPrecedentSatisfaction | null;
  caveats?: string[];
  /** When true, models a downstream consumer attempting elevation to production. */
  attemptPromotionToProduction?: boolean;
}): ProductionAuthorityEvaluation {
  const caveats = [...(input.caveats ?? [])];
  const refusalReasons: string[] = [];
  const cp = input.conditionsPrecedentSatisfaction ?? null;
  const classification = input.authorityClassification;

  if (BLOCKING_CLASSIFICATIONS.has(classification)) {
    refusalReasons.push(
      `Authority classification ${classification} cannot authorize PRODUCTION_AUTHORITY_ACTIVE.`,
    );
    return {
      disposition: "PRODUCTION_AUTHORITY_REFUSED",
      productionAuthorityActive: false,
      refusalReasons,
      authorityClassification: classification,
      conditionsPrecedentSatisfaction: cp,
      caveats,
    };
  }

  if (classification === "CONFIRMED_OPERATIVE_WITH_CAVEATS" || hasUnprovenCp(cp, caveats)) {
    refusalReasons.push(
      "CONFIRMED_OPERATIVE_WITH_CAVEATS (or unproven conditions-precedent satisfaction) cannot become unconditional PRODUCTION_AUTHORITY_ACTIVE.",
    );
    if (hasUnprovenCp(cp, caveats)) {
      refusalReasons.push(
        "Conditions-precedent satisfaction is NOT_INDEPENDENTLY_PROVEN — contractual language and execution evidence support inference only; CP satisfaction is not established.",
      );
    }
    if (input.attemptPromotionToProduction) {
      refusalReasons.push(
        "Downstream promotion attempt to PRODUCTION_AUTHORITY_ACTIVE refused.",
      );
    }
    return {
      disposition: "HYPOTHETICAL_OR_DISCLOSED_ONLY",
      productionAuthorityActive: false,
      refusalReasons,
      authorityClassification: classification,
      conditionsPrecedentSatisfaction: cp,
      caveats,
    };
  }

  if (classification === "CONFIRMED_OPERATIVE") {
    // Unconditional operative text authority — still does not alone activate
    // production capacity (financial/utilization evidence remain separate).
    // This gate only answers: may this operative-text authority be treated as
    // unconditional production operative authority?
    if (input.attemptPromotionToProduction) {
      return {
        disposition: "PRODUCTION_AUTHORITY_ACTIVE",
        productionAuthorityActive: true,
        refusalReasons: [],
        authorityClassification: classification,
        conditionsPrecedentSatisfaction: cp,
        caveats,
      };
    }
    return {
      disposition: "PRODUCTION_AUTHORITY_ACTIVE",
      productionAuthorityActive: true,
      refusalReasons: [],
      authorityClassification: classification,
      conditionsPrecedentSatisfaction: cp,
      caveats,
    };
  }

  refusalReasons.push(`Unrecognized authority classification: ${classification}`);
  return {
    disposition: "PRODUCTION_AUTHORITY_REFUSED",
    productionAuthorityActive: false,
    refusalReasons,
    authorityClassification: classification,
    conditionsPrecedentSatisfaction: cp,
    caveats,
  };
}

export interface BundleProductionAuthoritySummary {
  /** True only when every provision is PRODUCTION_AUTHORITY_ACTIVE. */
  allProvisionsProductionActive: boolean;
  /** True when any provision is caveated / blocked from production. */
  anyProductionRefused: boolean;
  /** True when any provision is HYPOTHETICAL_OR_DISCLOSED_ONLY. */
  anyCaveatedDisclosedOnly: boolean;
  byProvision: Array<{
    provisionKey: string;
    sectionRef: string | null;
    evaluation: ProductionAuthorityEvaluation;
  }>;
  restatementAuthorities: Array<{
    successorDocumentId: string;
    status: RestatementAuthorityResolution["status"];
    conditionsPrecedentSatisfaction: ConditionsPrecedentSatisfaction;
    effectivenessInference: RestatementAuthorityResolution["effectivenessInference"];
    doesNotMutatePackageGraphRelationship: true;
  }>;
}

/**
 * Summarize production-authority disposition across an operative-authority
 * handoff bundle. Never strips caveats, source identity, or effective dates.
 */
export function summarizeBundleProductionAuthority(
  bundle: OperativeAuthorityHandoffBundle,
  opts?: { attemptPromotionToProduction?: boolean },
): BundleProductionAuthoritySummary {
  const byProvision = bundle.provisions.map((p: GoverningProvisionResolution) => {
    const evaluation = evaluateProductionAuthorityPromotion({
      authorityClassification: p.authorityClassification,
      conditionsPrecedentSatisfaction: p.provenance.conditionsPrecedentSatisfaction,
      caveats: p.caveats,
      attemptPromotionToProduction: opts?.attemptPromotionToProduction,
    });
    return {
      provisionKey: p.provisionKey,
      sectionRef: p.sectionRef,
      evaluation,
    };
  });

  return {
    allProvisionsProductionActive: byProvision.length > 0 && byProvision.every((x) => x.evaluation.productionAuthorityActive),
    anyProductionRefused: byProvision.some((x) => !x.evaluation.productionAuthorityActive),
    anyCaveatedDisclosedOnly: byProvision.some((x) => x.evaluation.disposition === "HYPOTHETICAL_OR_DISCLOSED_ONLY"),
    byProvision,
    restatementAuthorities: bundle.restatementAuthorities.map((a) => ({
      successorDocumentId: a.successorDocumentId,
      status: a.status,
      conditionsPrecedentSatisfaction: a.conditionsPrecedentSatisfaction,
      effectivenessInference: a.effectivenessInference,
      doesNotMutatePackageGraphRelationship: true as const,
    })),
  };
}

/**
 * Extract a #274-compatible confirmed-identity view from a package-graph
 * instrument grouping row. Never invents confirmed membership from provisional ids.
 */
export function confirmedIdentityFromInstrumentGrouping(
  instrument: Pick<
    InstrumentGroupingResult,
    | "instrumentKey"
    | "documentIds"
    | "provisionalDocumentIds"
    | "associationKind"
    | "provisionalBridgeBlockers"
    | "reviewStatus"
  >,
): ConfirmedInstrumentIdentityView {
  const may =
    mayConsolidateOperativeAgreement(instrument) && isLegallyConfirmedAmendmentChain(instrument);
  return {
    instrumentKey: instrument.instrumentKey,
    confirmedDocumentIds: [...instrument.documentIds].sort(),
    provisionalDocumentIds: [...(instrument.provisionalDocumentIds ?? [])].sort(),
    mayConsolidateOperative: may,
    associationKind: instrument.associationKind as InstrumentAssociationKind | undefined,
    bridgeBlockers: instrument.provisionalBridgeBlockers,
  };
}
