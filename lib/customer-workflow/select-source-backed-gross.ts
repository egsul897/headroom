/**
 * Provision-identity-aware selection of SOURCE_BACKED_COMPILED_GROSS for Position.
 *
 * Never picks the first non-null metric. Eligible amounts must match applicable
 * instrument, covenant family, entity scope, and governing source. Multiple
 * distinct eligible amounts → AMBIGUOUS (fail closed).
 */

import type {
  CovenantFamilyId,
  EntityScopeId,
} from "@/lib/product/real-dashboard-vertical-slice/provision-legal-context";
import type {
  VerifiedExecutableCompileBridgeResult,
  VerifiedExecutableCompileUnit,
} from "@/lib/product/real-dashboard-vertical-slice/verified-executable-compile-core";

export type { EntityScopeId };

export type SourceBackedGrossCandidate = {
  candidateId: string;
  amountMillions: number;
  instrumentKey: string;
  covenantFamily: CovenantFamilyId | null;
  entityScope: EntityScopeId;
  governingDocumentId: string;
  operativeSourceDocumentId: string;
  sourceSectionRef: string;
};

export type SourceBackedGrossSelectionScope = {
  instrumentKey: string;
  covenantFamily: CovenantFamilyId;
  /** When set (and not UNSPECIFIED), candidate entityScope must match exactly. */
  entityScope?: EntityScopeId | null;
  /** When set, candidate governingDocumentId must match exactly. */
  governingDocumentId?: string | null;
  /**
   * When true (default), operative source document must equal governing document —
   * predecessor discovery text cannot publish under successor governing id.
   */
  requireOperativeSourceOnGoverning?: boolean;
};

export type SourceBackedGrossSelection =
  | {
      status: "RESOLVED";
      amountMillions: number;
      selected: SourceBackedGrossCandidate;
      eligible: SourceBackedGrossCandidate[];
      reason: null;
    }
  | {
      status: "AMBIGUOUS";
      amountMillions: null;
      selected: null;
      eligible: SourceBackedGrossCandidate[];
      reason: string;
    }
  | {
      status: "NONE";
      amountMillions: null;
      selected: null;
      eligible: SourceBackedGrossCandidate[];
      reason: string;
    };

function isEligible(
  c: SourceBackedGrossCandidate,
  scope: SourceBackedGrossSelectionScope,
): boolean {
  if (!(c.amountMillions > 0) && c.amountMillions !== 0) return false;
  if (c.instrumentKey !== scope.instrumentKey) return false;
  if (c.covenantFamily == null || c.covenantFamily !== scope.covenantFamily) return false;

  if (scope.entityScope != null && scope.entityScope !== "UNSPECIFIED") {
    if (c.entityScope !== scope.entityScope) return false;
  }

  if (scope.governingDocumentId != null && scope.governingDocumentId !== "") {
    if (c.governingDocumentId !== scope.governingDocumentId) return false;
  }

  const requireBinding = scope.requireOperativeSourceOnGoverning !== false;
  if (requireBinding) {
    const gov = c.governingDocumentId.trim();
    const src = c.operativeSourceDocumentId.trim();
    if (!gov || !src || gov !== src) return false;
  }

  return true;
}

/**
 * Select a single source-backed GROSS amount by provision identity.
 * Distinct eligible amounts → AMBIGUOUS (never first-match).
 */
export function selectSourceBackedGrossMm(
  candidates: readonly SourceBackedGrossCandidate[],
  scope: SourceBackedGrossSelectionScope,
): SourceBackedGrossSelection {
  if (!scope.instrumentKey?.trim()) {
    return {
      status: "NONE",
      amountMillions: null,
      selected: null,
      eligible: [],
      reason: "Selection scope missing instrumentKey.",
    };
  }

  const eligible = candidates.filter((c) => isEligible(c, scope));

  if (eligible.length === 0) {
    return {
      status: "NONE",
      amountMillions: null,
      selected: null,
      eligible: [],
      reason:
        "No SOURCE_BACKED_COMPILED_GROSS candidate matched instrument, covenant family, entity scope, and governing source.",
    };
  }

  const amounts = new Set(eligible.map((c) => c.amountMillions));
  if (amounts.size > 1) {
    return {
      status: "AMBIGUOUS",
      amountMillions: null,
      selected: null,
      eligible,
      reason: `AMBIGUOUS: ${eligible.length} eligible GROSS candidates with distinct amounts [${[...amounts].join(", ")}] — refuse first-match.`,
    };
  }

  const selected = eligible[0]!;
  return {
    status: "RESOLVED",
    amountMillions: selected.amountMillions,
    selected,
    eligible,
    reason: null,
  };
}

function familyFromUnit(
  u: VerifiedExecutableCompileUnit,
): CovenantFamilyId | null {
  return u.covenantFamily ?? null;
}

/**
 * Build selection candidates from a verified-executable compile bridge result.
 * Only Position-feeding SOURCE_BACKED_COMPILED_GROSS units with amounts.
 */
export function grossCandidatesFromVerifiedExecutableCompile(
  compile: VerifiedExecutableCompileBridgeResult | null | undefined,
): SourceBackedGrossCandidate[] {
  if (!compile) return [];
  const out: SourceBackedGrossCandidate[] = [];
  for (const u of compile.verifiedExecutableUnits) {
    if (!u.feedsPosition) continue;
    if (u.valueClass !== "SOURCE_BACKED_COMPILED_GROSS") continue;
    if (u.sourceBackedGrossCapacityMm == null) continue;
    out.push({
      candidateId: u.candidateId,
      amountMillions: u.sourceBackedGrossCapacityMm,
      instrumentKey: u.instrumentKey || compile.instrumentKey,
      covenantFamily: familyFromUnit(u),
      entityScope: u.entityScope ?? "UNSPECIFIED",
      governingDocumentId: u.documentId,
      operativeSourceDocumentId: u.operativeSourceDocumentId || u.documentId,
      sourceSectionRef: u.sourceSectionRef,
    });
  }
  return out;
}
