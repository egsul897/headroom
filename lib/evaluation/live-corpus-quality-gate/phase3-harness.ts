/**
 * Phase 3 evaluation harness v1 — stable finding IDs.
 *
 * Phase-1 freeze oracle is IMMUTABLE. The Phase-1 findingId formula embeds
 * status and collides when two PASS findings share sample+dimension+layer
 * (46 listed / 45 unique). This harness assigns ordinal stable IDs so all 46
 * findings remain individually addressable, with an explicit mapping back to
 * the original frozen findingId strings.
 *
 * Does not mutate docs/live-corpus-quality-gate/phase1-freeze/*.
 */
import { loadFrozenFindings, verifyFreezeIntact } from "./phase2-replay";
import type { AuditFinding } from "./types";

export const PHASE3_HARNESS_VERSION = "live-corpus-quality-gate.phase3-harness.v1" as const;

export interface StableFindingRecord {
  /** Ordinal stable ID — unique across all 46 Phase-1 findings. */
  stableFindingId: string;
  /** 0-based ordinal in frozen findings array (stable address). */
  ordinal: number;
  /** Original Phase-1 findingId (may collide). */
  originalFindingId: string;
  /** Disambiguator when originalFindingId collides (1-based within collision group). */
  collisionIndex: number;
  sampleId: string;
  dimension: string;
  layer: string;
  status: string;
  summary: string;
  independentGroundTruth: boolean;
  individuallyAddressable: true;
}

export interface FindingIdCollisionFixReport {
  harnessVersion: typeof PHASE3_HARNESS_VERSION;
  freezeIntact: boolean;
  frozenEvaluationContentSha: string;
  originalListedCount: number;
  originalUniqueFindingIds: number;
  collisionGroups: Array<{
    originalFindingId: string;
    occurrences: number;
    stableFindingIds: string[];
    ordinals: number[];
  }>;
  stableRecords: StableFindingRecord[];
  allIndividuallyAddressable: boolean;
  mappingComplete: boolean;
  note: string;
}

function padOrdinal(n: number): string {
  return String(n + 1).padStart(3, "0");
}

/**
 * Build stable addresses for every frozen finding without mutating the oracle.
 * Collision group members receive distinct stable IDs differing by ordinal + collisionIndex.
 */
export function buildStableFindingRecords(frozen: AuditFinding[] = loadFrozenFindings()): StableFindingRecord[] {
  const occurrenceSoFar = new Map<string, number>();
  return frozen.map((f, ordinal) => {
    const prior = occurrenceSoFar.get(f.findingId) ?? 0;
    const collisionIndex = prior + 1;
    occurrenceSoFar.set(f.findingId, collisionIndex);
    return {
      stableFindingId: `LCQG-F-${padOrdinal(ordinal)}`,
      ordinal,
      originalFindingId: f.findingId,
      collisionIndex,
      sampleId: f.sampleId,
      dimension: f.dimension,
      layer: f.layer,
      status: f.status,
      summary: f.summary,
      independentGroundTruth: f.independentGroundTruth,
      individuallyAddressable: true as const,
    };
  });
}

export function resolveFindingIdCollision(): FindingIdCollisionFixReport {
  const { intact, meta } = verifyFreezeIntact();
  const frozen = loadFrozenFindings();
  const stableRecords = buildStableFindingRecords(frozen);

  const byOriginal = new Map<string, StableFindingRecord[]>();
  for (const r of stableRecords) {
    const list = byOriginal.get(r.originalFindingId) ?? [];
    list.push(r);
    byOriginal.set(r.originalFindingId, list);
  }

  const collisionGroups = [...byOriginal.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([originalFindingId, rows]) => ({
      originalFindingId,
      occurrences: rows.length,
      stableFindingIds: rows.map((r) => r.stableFindingId),
      ordinals: rows.map((r) => r.ordinal),
    }));

  const uniqueStable = new Set(stableRecords.map((r) => r.stableFindingId));
  const allIndividuallyAddressable =
    uniqueStable.size === frozen.length &&
    stableRecords.every((r) => r.individuallyAddressable) &&
    collisionGroups.every((g) => new Set(g.stableFindingIds).size === g.occurrences);

  return {
    harnessVersion: PHASE3_HARNESS_VERSION,
    freezeIntact: intact,
    frozenEvaluationContentSha: String(meta.frozenEvaluationContentSha),
    originalListedCount: frozen.length,
    originalUniqueFindingIds: byOriginal.size,
    collisionGroups,
    stableRecords,
    allIndividuallyAddressable,
    mappingComplete: stableRecords.length === frozen.length,
    note:
      "Phase-3 harness v1 assigns LCQG-F-NNN ordinal IDs. Freeze oracle findingIds unchanged. Collision on gib-doc-a:exception_and_condition_recall:legally_verified:pass (§7.02 vs §7.08) is disambiguated by ordinal.",
  };
}

/** Lookup by stable ID — proves individual addressability. */
export function getFindingByStableId(
  stableFindingId: string,
  records: StableFindingRecord[] = buildStableFindingRecords(),
): StableFindingRecord | undefined {
  return records.find((r) => r.stableFindingId === stableFindingId);
}

/** Lookup all freeze rows sharing an original (possibly colliding) findingId. */
export function getFindingsByOriginalId(
  originalFindingId: string,
  records: StableFindingRecord[] = buildStableFindingRecords(),
): StableFindingRecord[] {
  return records.filter((r) => r.originalFindingId === originalFindingId);
}
