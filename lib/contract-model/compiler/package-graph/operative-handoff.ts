/**
 * HEADROOM-3 Scope D — deterministic operative-provision resolution contract
 * for HEADROOM-1 (compiler consumers).
 *
 * This module ADAPTS existing Phase 2G operative-state outputs and Phase 2C
 * instrument identity. It does not modify compiler internals, does not invent
 * IR, and fails closed whenever:
 *   - instrument identity is provisional / unconfirmed
 *   - provision-level authority is missing or ambiguous
 *   - effective dating cannot establish application as of the query date
 *   - multiple versions remain plausible
 *
 * A newer package document never silently replaces every provision in an
 * older document — only effects with explicit target + authority apply.
 */
import type { OperativeContractState, OperativeProvisionView, OperativeStateStatus } from "../amendment/types";
import {
  isLegallyConfirmedAmendmentChain,
  mayConsolidateOperativeAgreement,
} from "./instrument-grouping";
import type { InstrumentGroupingResult, PackageGraphResult } from "./types";
import { assignPackageDocumentRoles, type PackageDocumentRoleAssignment } from "./document-roles";

export type OperativeAuthorityClassification =
  | "CONFIRMED_OPERATIVE"
  | "PROVISIONAL_IDENTITY_BLOCKED"
  | "NOT_YET_EFFECTIVE"
  | "SUPERSEDED_SOURCE"
  | "AMBIGUOUS"
  | "REVIEW_REQUIRED"
  | "CONFLICTED"
  | "UNSUPPORTED";

export interface OperativeAmendmentChainLink {
  effectId: string;
  amendmentDocumentId: string;
  operation: string;
  effectiveDate: string | null;
  effectiveDateStatus: string;
  sourceCitation: string;
  appliedAsOfQuery: boolean;
}

export interface OperativeProvisionResolution {
  provisionKey: string;
  kind: "SECTION" | "DEFINITION";
  sectionRef: string | null;
  definedTermRef: string | null;
  /** Present only when instrument membership is confirmed (trusted edges). */
  canonicalInstrumentKey: string | null;
  /** Always the grouping key used for the query; may be non-canonical when provisional. */
  instrumentKey: string;
  sourceDocumentId: string | null;
  sourceSpan: {
    citation: string | null;
    nodeId: string | null;
    nodeKey: string | null;
  };
  applicableAmendmentChain: OperativeAmendmentChainLink[];
  effectiveAsOfDate: string;
  supersessionStatus: "CURRENT_OPERATIVE" | "KNOWN_SUPERSEDED" | "PARTIALLY_SUPERSEDED" | "UNKNOWN";
  authorityClassification: OperativeAuthorityClassification;
  unresolvedConflicts: string[];
  provenance: {
    operativeStateStatus: OperativeStateStatus;
    targetResolutionStatus: string;
    structuralHealthStatus: string;
    associationKind: string;
    reviewRequired: boolean;
    currentTextPresent: boolean;
    attemptedTextPresent: boolean;
  };
}

export interface OperativeHandoffBundle {
  companyId: string;
  packageKey: string;
  asOfDate: string;
  documentRoles: PackageDocumentRoleAssignment[];
  instruments: Array<{
    instrumentKey: string;
    associationKind: string;
    reviewStatus: string;
    confirmedDocumentIds: string[];
    provisionalDocumentIds: string[];
    mayConsolidateOperative: boolean;
    bridgeBlockers: Array<{ sourceDocumentId: string; targetDocumentId: string; reason: string }>;
  }>;
  provisions: OperativeProvisionResolution[];
  unsupportedCases: string[];
}

function mapAuthority(
  instrument: InstrumentGroupingResult,
  view: OperativeProvisionView,
  asOfDate: string,
): { authority: OperativeAuthorityClassification; supersessionStatus: OperativeProvisionResolution["supersessionStatus"]; unresolved: string[] } {
  const unresolved: string[] = [...view.unresolvedIssues];
  for (const c of view.conflicts) {
    unresolved.push(`${c.conflictType}: ${c.reason}`);
  }

  if (!isLegallyConfirmedAmendmentChain(instrument) || !mayConsolidateOperativeAgreement(instrument)) {
    return {
      authority: "PROVISIONAL_IDENTITY_BLOCKED",
      supersessionStatus: "UNKNOWN",
      unresolved: [
        ...unresolved,
        "Canonical instrument identity is not confirmed; provisional associations cannot authorize operative consolidation.",
      ],
    };
  }

  if (view.status === "OPERATIVE_STATE_CONFLICTED") {
    return { authority: "CONFLICTED", supersessionStatus: "UNKNOWN", unresolved };
  }

  if (view.targetResolutionStatus === "AMBIGUOUS") {
    return { authority: "AMBIGUOUS", supersessionStatus: "UNKNOWN", unresolved };
  }

  // Future-dated applied chain empty but fullChain has later effects.
  const futureOnly =
    view.appliedChain.length === 0 &&
    view.fullChain.some((e) => e.effectiveDate.date !== null && e.effectiveDate.date > asOfDate);
  if (futureOnly) {
    return {
      authority: "NOT_YET_EFFECTIVE",
      supersessionStatus: "CURRENT_OPERATIVE",
      unresolved: [...unresolved, `Amendment effect(s) effective after as-of date ${asOfDate}.`],
    };
  }

  if (view.supersededSourceNodeIds.length > 0 && view.currentSourceDocumentId !== view.documentId) {
    // Base source superseded; current text from a later amendment document.
    if (view.status === "OPERATIVE_STATE_RESOLVED" && view.currentText !== null) {
      return { authority: "CONFIRMED_OPERATIVE", supersessionStatus: "PARTIALLY_SUPERSEDED", unresolved };
    }
  }

  if (view.reviewRequired || view.status === "OPERATIVE_STATE_REVIEW_REQUIRED" || view.status === "OPERATIVE_STATE_PARTIAL") {
    // Superseded citation without unique target attachment.
    if (view.targetResolutionStatus !== "UNIQUE" && view.attemptedText !== null) {
      return { authority: "SUPERSEDED_SOURCE", supersessionStatus: "KNOWN_SUPERSEDED", unresolved };
    }
    return { authority: "REVIEW_REQUIRED", supersessionStatus: view.supersededSourceNodeIds.length > 0 ? "PARTIALLY_SUPERSEDED" : "UNKNOWN", unresolved };
  }

  if (view.status === "OPERATIVE_STATE_RESOLVED" && view.currentText !== null) {
    return {
      authority: "CONFIRMED_OPERATIVE",
      supersessionStatus: view.supersededSourceNodeIds.length > 0 ? "PARTIALLY_SUPERSEDED" : "CURRENT_OPERATIVE",
      unresolved,
    };
  }

  return { authority: "UNSUPPORTED", supersessionStatus: "UNKNOWN", unresolved };
}

function toChainLinks(view: OperativeProvisionView): OperativeAmendmentChainLink[] {
  return view.fullChain.map((e) => ({
    effectId: e.effectId,
    amendmentDocumentId: e.amendmentDocumentId,
    operation: e.operation,
    effectiveDate: e.effectiveDate.date,
    effectiveDateStatus: e.effectiveDate.status,
    sourceCitation: e.sourceCitation,
    appliedAsOfQuery: e.appliedAsOfQuery,
  }));
}

/**
 * Build the HEADROOM-1 handoff bundle from an already-computed package graph
 * and per-instrument operative contract states. Caller owns computing
 * OperativeContractState (via computeOperativeContractState); this function
 * only projects + gates authority.
 */
export function buildOperativeHandoffBundle(input: {
  packageGraph: PackageGraphResult;
  asOfDate: string;
  operativeStates: OperativeContractState[];
}): OperativeHandoffBundle {
  const { packageGraph, asOfDate, operativeStates } = input;
  const instrumentByKey = new Map(packageGraph.instruments.map((i) => [i.instrumentKey, i] as const));
  const documentRoles = assignPackageDocumentRoles(
    packageGraph.classifications,
    packageGraph.identities,
    packageGraph.relationshipCandidates,
  );

  const unsupportedCases = [
    "PR246_TOCTOU_UNIQUENESS: uniqueness/TOCTOU protection for relationship edge persistence is not activated (preserved blocker from PR #246).",
    "PR246_DUPLICATE_ROW_POPULATION: large duplicate-row population remediation is not activated.",
    "PR246_SELF_LOOPS: self-loop graph expansion cleanup is not activated.",
    "PR246_UNTESTED_ROLLBACK: migration rollback for broad graph expansion remains untested — expansion not merged.",
    "WHOLE_DOCUMENT_RESTATEMENT_WITHOUT_RESOLVED_OPERATIVE_DOCUMENT: partial restatement without unique provision targets fails closed.",
  ];

  const provisions: OperativeProvisionResolution[] = [];
  for (const state of operativeStates) {
    const instrument = instrumentByKey.get(state.instrumentKey);
    if (!instrument) {
      unsupportedCases.push(`MISSING_INSTRUMENT_FOR_STATE:${state.instrumentKey}`);
      continue;
    }
    for (const view of state.provisions) {
      const mapped = mapAuthority(instrument, view, asOfDate);
      const canonical =
        isLegallyConfirmedAmendmentChain(instrument) && (instrument.provisionalDocumentIds?.length ?? 0) === 0
          ? instrument.instrumentKey
          : null;
      provisions.push({
        provisionKey: view.provisionKey,
        kind: view.kind,
        sectionRef: view.sectionRef,
        definedTermRef: view.definedTermRef,
        canonicalInstrumentKey: canonical,
        instrumentKey: instrument.instrumentKey,
        sourceDocumentId: view.currentSourceDocumentId,
        sourceSpan: {
          citation: view.appliedChain.at(-1)?.sourceCitation ?? view.fullChain.at(-1)?.sourceCitation ?? null,
          nodeId: view.currentSourceNodeId,
          nodeKey: view.currentSourceNodeKey,
        },
        applicableAmendmentChain: toChainLinks(view),
        effectiveAsOfDate: asOfDate,
        supersessionStatus: mapped.supersessionStatus,
        authorityClassification: mapped.authority,
        unresolvedConflicts: mapped.unresolved,
        provenance: {
          operativeStateStatus: view.status,
          targetResolutionStatus: view.targetResolutionStatus,
          structuralHealthStatus: view.structuralHealthStatus,
          associationKind: instrument.associationKind ?? "CONFIRMED",
          reviewRequired: view.reviewRequired,
          currentTextPresent: view.currentText !== null,
          attemptedTextPresent: view.attemptedText !== null,
        },
      });
    }

    // Unattached effects that could not bind to a provision — surface as unsupported/review.
    for (const effect of state.unattachedEffects) {
      provisions.push({
        provisionKey: `${state.instrumentKey}::UNATTACHED::${effect.effectId}`,
        kind: effect.target.targetSectionRef ? "SECTION" : "DEFINITION",
        sectionRef: effect.target.targetSectionRef,
        definedTermRef: effect.target.targetDefinedTermRef,
        canonicalInstrumentKey: isLegallyConfirmedAmendmentChain(instrument) ? instrument.instrumentKey : null,
        instrumentKey: instrument.instrumentKey,
        sourceDocumentId: effect.amendmentDocumentId,
        sourceSpan: {
          citation: effect.sourceCitation,
          nodeId: null,
          nodeKey: null,
        },
        applicableAmendmentChain: [
          {
            effectId: effect.effectId,
            amendmentDocumentId: effect.amendmentDocumentId,
            operation: effect.operation,
            effectiveDate: effect.effectiveDate.date,
            effectiveDateStatus: effect.effectiveDate.status,
            sourceCitation: effect.sourceCitation,
            appliedAsOfQuery: false,
          },
        ],
        effectiveAsOfDate: asOfDate,
        supersessionStatus: "UNKNOWN",
        authorityClassification: effect.effectiveDate.date === null ? "REVIEW_REQUIRED" : "AMBIGUOUS",
        unresolvedConflicts: [
          effect.unresolvedReason ?? "Effect could not be attached to a unique provision — fails closed.",
        ],
        provenance: {
          operativeStateStatus: state.status,
          targetResolutionStatus: "NOT_FOUND",
          structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
          associationKind: instrument.associationKind ?? "CONFIRMED",
          reviewRequired: true,
          currentTextPresent: false,
          attemptedTextPresent: effect.newText !== null,
        },
      });
    }
  }

  // Deterministic ordering for replay stability.
  provisions.sort((a, b) => a.provisionKey.localeCompare(b.provisionKey) || a.instrumentKey.localeCompare(b.instrumentKey));

  return {
    companyId: packageGraph.companyId,
    packageKey: packageGraph.packageKey,
    asOfDate,
    documentRoles,
    instruments: packageGraph.instruments.map((i) => ({
      instrumentKey: i.instrumentKey,
      associationKind: i.associationKind ?? "CONFIRMED",
      reviewStatus: i.reviewStatus,
      confirmedDocumentIds: [...i.documentIds].sort(),
      provisionalDocumentIds: [...(i.provisionalDocumentIds ?? [])].sort(),
      mayConsolidateOperative: mayConsolidateOperativeAgreement(i),
      bridgeBlockers: [...(i.provisionalBridgeBlockers ?? [])]
        .map((b) => ({
          sourceDocumentId: b.sourceDocumentId,
          targetDocumentId: b.targetDocumentId,
          reason: b.reason,
        }))
        .sort((a, b) => `${a.sourceDocumentId}:${a.targetDocumentId}`.localeCompare(`${b.sourceDocumentId}:${b.targetDocumentId}`)),
    })),
    provisions,
    unsupportedCases,
  };
}
