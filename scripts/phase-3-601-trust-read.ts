/**
 * PHASE 3 / 6.01 remediation §20 - HD-6 fix: the ONE canonical reader of a production compile result's sharded trust
 * fields. The pinned finalizer read `execution.sharded.contextualEmissions` as a LIST (`.filter is not a function` -
 * production exposes a COUNT) and then substituted `collisionsByKind.CONTEXTUAL_UNOWNED_DEFINITION` for the violation
 * counter, which measures DETECTION (already demoted), not CREDIT. This reader:
 *  - validates the canonical shape field by field and names every mismatch (never guesses a field path);
 *  - never defaults a missing counter to zero: a counter whose field is absent is reported NOT_MEASURABLE with the
 *    exact missing path, so an artifact produced by an older production version can never read as "clean";
 *  - separates contextual emissions DETECTED from contextual emissions CREDITED (mission §18).
 */

export interface ShardTrustRead {
  ok: boolean;
  problems: string[];
  executionMode: string | null;
  sharded: null | {
    executed: number; reused: number; retries: number;
    statusCounts: Record<string, number>;
    collisions: number; collisionsByKind: Record<string, number>;
    definitionConflicts: number; conflictVariants: number;
    contextualEmissionsDetected: number;
    /** The only "contextual ownership-credit violation" count. NOT_MEASURABLE (null) when the artifact predates the field. */
    contextualEmissionsCredited: number | null;
    unresolvedOwnedItems: number;
    attributionProofCounts: { PLANNER_DEFINITION_UNIT: number; OWNED_INVENTORY_LINEAGE: number; UNIQUE_PRIMARY_SOURCE_DECLARATION: number; NONE: number } | null;
    unresolvedOwnedItemList: unknown[];
    shards: unknown[];
  };
  counters: {
    contextualOwnershipCreditViolations: { value: number | null; state: "MEASURED" | "NOT_MEASURABLE"; source: string };
    sourceUnverifiableAuthoritativeIr: { value: number | null; state: "MEASURED" | "NOT_MEASURABLE"; source: string };
    distinctOwnedLineageLost: { value: number | null; state: "MEASURED" | "NOT_MEASURABLE"; source: string };
    silentIncompatibleMerges: { value: number | null; state: "MEASURED" | "NOT_MEASURABLE"; source: string };
  };
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const numRecord = (x: unknown): x is Record<string, number> => isRecord(x) && Object.values(x).every(isNum);

/** Reads the canonical `execution.sharded` block of a SemanticCompilationResult. Pure; throws never; every problem is named. */
export function readShardTrust(compileResult: unknown): ShardTrustRead {
  const problems: string[] = [];
  const nm = (v: number | null, source: string): ShardTrustRead["counters"][keyof ShardTrustRead["counters"]] => ({ value: v, state: v === null ? "NOT_MEASURABLE" : "MEASURED", source });
  const notMeasurable = (why: string) => ({ ok: false, problems: [...problems, why], executionMode: null, sharded: null, counters: { contextualOwnershipCreditViolations: nm(null, why), sourceUnverifiableAuthoritativeIr: nm(null, why), distinctOwnedLineageLost: nm(null, why), silentIncompatibleMerges: nm(null, why) } });
  if (!isRecord(compileResult)) return notMeasurable("compile result is not an object");
  const execution = compileResult.execution;
  if (!isRecord(execution)) return notMeasurable("execution block missing");
  const mode = typeof execution.mode === "string" ? execution.mode : null;
  const sh = execution.sharded;
  if (mode !== "SHARDED" || !isRecord(sh)) return { ...notMeasurable(`execution.mode is ${mode ?? "(absent)"}; sharded trust counters apply only to SHARDED execution`), executionMode: mode };
  const req = <T>(path: string, ok: boolean, value: T, fallback: T): T => { if (!ok) problems.push(`execution.sharded.${path} missing or not the canonical shape`); return ok ? value : fallback; };
  const executed = req("executed", isNum(sh.executed), sh.executed as number, 0);
  const reused = req("reused", isNum(sh.reused), sh.reused as number, 0);
  const retries = req("retries", isNum(sh.retries), sh.retries as number, 0);
  const statusCounts = req("statusCounts", numRecord(sh.statusCounts), sh.statusCounts as Record<string, number>, {});
  const collisions = req("collisions", isNum(sh.collisions), sh.collisions as number, 0);
  const collisionsByKind = req("collisionsByKind", numRecord(sh.collisionsByKind), sh.collisionsByKind as Record<string, number>, {});
  const definitionConflicts = req("definitionConflicts", isNum(sh.definitionConflicts), sh.definitionConflicts as number, 0);
  const conflictVariants = req("conflictVariants", isNum(sh.conflictVariants), sh.conflictVariants as number, 0);
  // HD-6 root cause: a COUNT, never a list.
  if (Array.isArray(sh.contextualEmissions)) problems.push("execution.sharded.contextualEmissions is a list - the canonical production shape is a count");
  const contextualEmissionsDetected = req("contextualEmissions", isNum(sh.contextualEmissions), sh.contextualEmissions as number, 0);
  const contextualEmissionsCredited = isNum(sh.contextualEmissionsCredited) ? (sh.contextualEmissionsCredited as number) : null;
  if (contextualEmissionsCredited === null) problems.push("execution.sharded.contextualEmissionsCredited absent - the artifact predates the §18 counter; contextual ownership-credit violations are NOT_MEASURABLE from this artifact (never defaulted to 0)");
  const unresolvedOwnedItems = req("unresolvedOwnedItems", isNum(sh.unresolvedOwnedItems), sh.unresolvedOwnedItems as number, 0);
  const apc = sh.attributionProofCounts;
  const attributionProofCounts = isRecord(apc) && isNum(apc.NONE) && isNum(apc.PLANNER_DEFINITION_UNIT) && isNum(apc.OWNED_INVENTORY_LINEAGE) && isNum(apc.UNIQUE_PRIMARY_SOURCE_DECLARATION) ? (apc as ShardTrustRead["sharded"] extends infer S ? S extends { attributionProofCounts: infer C } ? NonNullable<C> : never : never) : null;
  if (!attributionProofCounts) problems.push("execution.sharded.attributionProofCounts missing or not the canonical shape");
  const unresolvedOwnedItemList = Array.isArray(sh.unresolvedOwnedItemList) ? sh.unresolvedOwnedItemList : (problems.push("execution.sharded.unresolvedOwnedItemList missing"), []);
  const shards = Array.isArray(sh.shards) ? sh.shards : (problems.push("execution.sharded.shards missing"), []);
  const ok = problems.length === 0;
  return {
    ok, problems, executionMode: mode,
    sharded: { executed, reused, retries, statusCounts, collisions, collisionsByKind, definitionConflicts, conflictVariants, contextualEmissionsDetected, contextualEmissionsCredited, unresolvedOwnedItems, attributionProofCounts, unresolvedOwnedItemList, shards },
    counters: {
      contextualOwnershipCreditViolations: nm(contextualEmissionsCredited, "execution.sharded.contextualEmissionsCredited (contextual emissions that survived into the stitched IR; detection alone is not a violation)"),
      sourceUnverifiableAuthoritativeIr: nm(attributionProofCounts ? attributionProofCounts.NONE : null, "execution.sharded.attributionProofCounts.NONE (retained definitions with no proof class)"),
      distinctOwnedLineageLost: nm(isNum(sh.unresolvedOwnedItems) ? unresolvedOwnedItems : null, "execution.sharded.unresolvedOwnedItems"),
      silentIncompatibleMerges: nm(isNum(sh.definitionConflicts) && isNum(sh.conflictVariants) ? (definitionConflicts > 0 && conflictVariants === 0 ? definitionConflicts : 0) : null, "execution.sharded.definitionConflicts with conflictVariants = 0"),
    },
  };
}
