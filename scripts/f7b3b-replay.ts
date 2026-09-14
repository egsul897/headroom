/**
 * F-7B.3B §1/§2/§18 - deterministic offline re-stitch of the FIFTEEN frozen paid shard results (five Stage-1 +
 * ten Wave A). Zero model calls: it reads committed evidence, stitches, and reports the conflict inventory and the
 * pre-registered §12 loss metrics.
 *   npx tsx scripts/f7b3b-replay.ts --mode before|after --out <path>
 */
import { createHash } from "node:crypto";
import { normalizeDefinedTermRef } from "../lib/contract-model/compiler/amendment/chain";
import type { ShardExecutionResult, StitchedCompilation } from "../lib/contract-model/compiler/semantic/shard-types";
import { F7A_BASELINE, freezeAndPlan, gitSha, writeJson } from "./f7b-lib";
import { loadFrozenStage1, loadStage2, stitchAll } from "./f7b3-lib";

const mode = (process.argv[process.argv.indexOf("--mode") + 1] ?? "").toLowerCase();
const out = process.argv[process.argv.indexOf("--out") + 1] ?? "";
if ((mode !== "before" && mode !== "after") || !out) { console.error("usage: --mode before|after --out <path>"); process.exit(2); }

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Canonical content hash of an IR object with volatile ids stripped, so two emissions of one definition compare by meaning. */
const contentHash = (o: unknown): string => sha256(JSON.stringify(o, (k, v) => (k === "exprId" || k === "definitionId" || k === "ruleId" || k === "sharedCapId" ? undefined : v)));

/** Generic IR traversal: every quantitative literal and every inventory lineage reference, wherever they are nested. */
function census(o: unknown): { values: string[]; lineage: string[] } {
  const values: string[] = []; const lineage: string[] = [];
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const r = x as Record<string, unknown>;
    if (typeof r.kind === "string" && ["MONEY", "PERCENT", "RATIO", "NUMBER"].includes(r.kind)) {
      const amount = r.amount ?? r.value ?? r.ratio ?? r.percent;
      if (amount !== undefined && amount !== null) values.push(`${r.kind}:${String(amount)}`);
    }
    if (Array.isArray(r.inventoryItemIds)) lineage.push(...(r.inventoryItemIds as string[]));
    for (const v of Object.values(r)) if (v && typeof v === "object") walk(v);
  };
  walk(o);
  return { values, lineage };
}

const frozen = freezeAndPlan();
const { plan } = frozen;
const stage1 = loadFrozenStage1(); const stage2 = loadStage2();
const evidence = plan.shards.flatMap((s) => { const e = stage1.get(s.shardId) ?? stage2.get(s.shardId); return e ? [{ shard: s, e }] : []; });
if (evidence.length !== 15) { console.error(`F7B_3B_BASELINE_INVALID: expected 15 frozen shard results, found ${evidence.length}`); process.exit(3); }
const results: ShardExecutionResult[] = evidence.map((x) => x.e.result);
const stitched = stitchAll(frozen, results) as StitchedCompilation & { definitionConflicts?: unknown[] };

const knownIds = new Set(frozen.callerInput.frozenInventory!.items.map((i) => i.inventoryItemId));
const digestOf = (id: string) => { const i = id.indexOf(":"); return (i >= 0 ? id.slice(i + 1) : id).toLowerCase(); };
const digestIndex = new Map(frozen.callerInput.frozenInventory!.items.map((i) => [digestOf(i.inventoryItemId), i.inventoryItemId]));
const canon = (raw: string) => (knownIds.has(raw) ? raw : digestIndex.get(digestOf(raw)) ?? raw);
const ownedItemsOf = new Map(plan.shards.map((s) => [s.shardId, new Set(s.ownedItemIds)]));

// ---- conflict inventory, reconstructed from the raw compositions (independent of the stitcher's own bookkeeping)
const ownedUnitOf = (shardId: string) => new Set(plan.shards.find((s) => s.shardId === shardId)!.ownedUnitKeys);
const emissionsById = new Map<string, { shardId: string; ordinal: number; index: number; def: Record<string, unknown>; hash: string }[]>();
for (const { shard, e } of evidence) {
  (e.result.composition?.definitions ?? []).forEach((d, i) => {
    const rec = emissionsById.get(d.definitionId) ?? [];
    rec.push({ shardId: shard.shardId, ordinal: shard.ordinal, index: i, def: d as unknown as Record<string, unknown>, hash: contentHash(d) });
    emissionsById.set(d.definitionId, rec);
  });
}
const conflicts = [...emissionsById.entries()]
  .filter(([, em]) => new Set(em.map((x) => x.hash)).size > 1)
  .map(([definitionId, em]) => ({
    definitionId, termName: String(em[0]!.def.termName ?? ""),
    emissions: em.map((x) => {
      const c = census(x.def);
      const att = stitched.definitionAttribution.find((a) => a.objectId === definitionId && a.shardId === x.shardId);
      return {
        shardId: x.shardId, shardOrdinal: x.ordinal, emissionIndex: x.index, contentHash: x.hash,
        attributionMethod: att?.method ?? "(none)", attributedUnit: att?.unitKey ?? null, hasSourceAnchor: Boolean(att?.anchor),
        lineage: [...new Set(c.lineage.map(canon).filter((id) => (ownedItemsOf.get(x.shardId) ?? new Set()).has(id)))].sort(), lineageCount: c.lineage.length,
        values: [...c.values].sort(), quantitativeCount: c.values.length,
        sufficiency: x.def.sufficiency ?? null,
        hasCalculationExpression: x.def.calculationExpression !== null && x.def.calculationExpression !== undefined,
        dependsOnTerms: x.def.dependsOnTerms ?? [],
      };
    }),
    distinctVariants: new Set(em.map((x) => x.hash)).size,
  }))
  .sort((a, b) => a.termName.localeCompare(b.termName));

// ---- §12 pre-registered loss metrics -------------------------------------------------------------------
// Owned evidence = everything an OWNER shard emitted for a definition the stitcher accepted as owned. Contextual
// emissions are excluded by design: they were never owned, so they are not owned evidence to conserve.
const contextualIds = new Set(stitched.contextualEmissions.map((c) => c.objectId));
const ownedEmissions = [...emissionsById.entries()].flatMap(([id, em]) => (contextualIds.has(id) ? [] : em));
// The baseline is the ACCEPTED SCOPED composition, exactly as §12 words it, so it must mirror the two transforms the
// stitcher applies before ownership is decided: digest-form id canonicalization, then scoping to the emitting shard's
// own inventory items. Measuring raw model text against canonicalized stitched ids compares two different id spaces and
// manufactures losses that never happened.
const beforeCensus = ownedEmissions.reduce((acc, x) => {
  const c = census(x.def);
  acc.values.push(...c.values);
  const owned = ownedItemsOf.get(x.shardId)!;
  acc.lineage.push(...c.lineage.map(canon).filter((id) => owned.has(id)));
  return acc;
}, { values: [] as string[], lineage: [] as string[] });
const canonicalRaw = census({ rules: stitched.rules, definitions: stitched.definitions, sharedCapacities: stitched.sharedCapacities });
const canonical = { values: canonicalRaw.values, lineage: canonicalRaw.lineage.map(canon) };
const evidenceCensusRaw = census((stitched as { definitionConflicts?: unknown }).definitionConflicts ?? []);
const evidenceCensus = { values: evidenceCensusRaw.values, lineage: evidenceCensusRaw.lineage.map(canon) };
const survivingValues = new Set([...canonical.values, ...evidenceCensus.values]);
const survivingLineage = new Set([...canonical.lineage, ...evidenceCensus.lineage]);
// lineage that is validly excluded: a claim on an item this shard does not own is stripped, and that removal is recorded
const strippedLineage = new Set(stitched.collisions.filter((c) => c.kind === "LINEAGE_CLAIM_ON_UNOWNED_ITEM" && c.itemId).map((c) => c.itemId!));
const valuesLost = [...new Set(beforeCensus.values)].filter((v) => !survivingValues.has(v));
const lineageLost = [...new Set(beforeCensus.lineage)].filter((l) => !survivingLineage.has(l) && !strippedLineage.has(l));

const collisionsByKind: Record<string, number> = {};
for (const c of stitched.collisions) collisionsByKind[c.kind] = (collisionsByKind[c.kind] ?? 0) + 1;
const defUnits = plan.units.filter((u) => u.kind === "DEFINITION");
const anchored = new Set(stitched.definitionAttribution.filter((a) => a.anchor).map((a) => a.objectId));
const proofCounts = { PLANNER_DEFINITION_UNIT: 0, OWNED_INVENTORY_LINEAGE: 0, UNIQUE_PRIMARY_SOURCE_DECLARATION: 0, NONE: 0 };
for (const d of stitched.definitions) {
  const proofs: string[] = [];
  if (defUnits.some((u) => u.normalizedTermName === normalizeDefinedTermRef(d.termName))) proofs.push("PLANNER_DEFINITION_UNIT");
  if (census(d).lineage.length > 0) proofs.push("OWNED_INVENTORY_LINEAGE");
  if (anchored.has(d.definitionId)) proofs.push("UNIQUE_PRIMARY_SOURCE_DECLARATION");
  if (proofs.length === 0) proofCounts.NONE++;
  for (const p of proofs) proofCounts[p as keyof typeof proofCounts]++;
}
const acc = stitched.accountability;
const material = new Set(frozen.callerInput.frozenInventory!.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").map((i) => i.inventoryItemId));
const executedShardIds = new Set(results.map((r) => r.shardId));
const matItems = acc.items.filter((i) => material.has(i.inventoryItemId));
const onExecuted = matItems.filter((i) => executedShardIds.has(plan.itemOwnerShard[i.inventoryItemId] ?? ""));
const byDisp = (d: string) => onExecuted.filter((i) => i.disposition === d).length;

writeJson(out, {
  artifact: `F-7B.3B ${mode === "before" ? "§2 reproduction of DEFINITION_CONFLICT_VARIANT_DISCARDED" : "§18 offline re-stitch with conflict-variant preservation"} - 0 model calls, $0`,
  mode, gitSha: gitSha(), at: new Date().toISOString(),
  planHash: plan.planHash, planHashMatchesBaseline: plan.planHash === F7A_BASELINE.planHash,
  frozenShards: evidence.map((x) => ({ ordinal: x.shard.ordinal, shardId: x.shard.shardId, shardHash: x.shard.shardHash, status: x.e.result.status, stage: x.e.record.stage, definitions: x.e.result.composition?.definitions.length ?? 0, compositionHash: sha256(JSON.stringify(x.e.result.composition)) })),
  frozenShardCount: evidence.length,
  definitionConflicts: { count: conflicts.length, names: conflicts.map((c) => c.termName), detail: conflicts },
  conflictEvidencePreserved: { present: Array.isArray((stitched as { definitionConflicts?: unknown[] }).definitionConflicts), records: ((stitched as { definitionConflicts?: unknown[] }).definitionConflicts ?? []).length, payload: (stitched as { definitionConflicts?: unknown[] }).definitionConflicts ?? [] },
  lossMetrics: {
    definition: "owned emissions minus (canonical stitched IR union first-class conflict evidence union validly excluded)",
    ownedDistinctValuesBefore: new Set(beforeCensus.values).size, ownedDistinctLineageBefore: new Set(beforeCensus.lineage).size,
    valuesInCanonical: new Set(canonical.values).size, valuesInConflictEvidence: new Set(evidenceCensus.values).size,
    lineageInCanonical: new Set(canonical.lineage).size, lineageInConflictEvidence: new Set(evidenceCensus.lineage).size,
    lineageValidlyStripped: strippedLineage.size,
    ownedValuesLostByStitching: valuesLost.length, ownedValuesLostList: valuesLost,
    ownedLineageLostByStitching: lineageLost.length, ownedLineageLostList: lineageLost,
  },
  stitched: { status: stitched.status, rules: stitched.rules.length, definitions: stitched.definitions.length, sharedCapacities: stitched.sharedCapacities.length, contextualEmissions: stitched.contextualEmissions.length, collisionsByKind, requiresReview: stitched.collisions.filter((c) => c.requiresReview).length },
  conflictCollisions: stitched.collisions.filter((c) => c.kind === "DEFINITION_CONFLICT").map((c) => ({ objectId: c.objectId, shardId: c.shardId, ownerShardId: c.ownerShardId, requiresReview: c.requiresReview })),
  conflictedDefinitionsInCanonical: conflicts.map((c) => { const d = stitched.definitions.find((x) => x.definitionId === c.definitionId); return { definitionId: c.definitionId, termName: c.termName, retained: Boolean(d), sufficiency: d?.sufficiency ?? null, sufficiencyReasons: d?.sufficiencyReasons ?? [] }; }),
  proofCounts,
  accountability: { executedShards: results.length, executedShardMaterialOwned: onExecuted.length, executedRepresented: byDisp("REPRESENTED"), executedIntentionallyNonComputational: byDisp("INTENTIONALLY_NON_COMPUTATIONAL"), executedUnsupported: byDisp("UNSUPPORTED"), executedAmbiguous: byDisp("AMBIGUOUS"), executedMissing: byDisp("MISSING_FROM_COMPOSITION"), executedAccountabilityRate: +((onExecuted.length - byDisp("MISSING_FROM_COMPOSITION")) / Math.max(1, onExecuted.length)).toFixed(4), materialTotal: material.size, globalPassC: acc.counts, semanticallyComplete: acc.semanticallyComplete },
  danglingLineageReferences: acc.counts.danglingLineageReferences,
  paidCalls: 0, costUsd: 0,
});
console.log(JSON.stringify({ mode, frozenShards: evidence.length, conflicts: conflicts.length, conflictNames: conflicts.map((c) => c.termName), conflictEvidenceRecords: ((stitched as { definitionConflicts?: unknown[] }).definitionConflicts ?? []).length, valuesLost: valuesLost.length, valuesLostList: valuesLost, lineageLost: lineageLost.length, definitions: stitched.definitions.length, proofCounts, accountability: { owned: onExecuted.length, represented: byDisp("REPRESENTED"), missing: byDisp("MISSING_FROM_COMPOSITION") } }, null, 1));
