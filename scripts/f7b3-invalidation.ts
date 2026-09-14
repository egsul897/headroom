/**
 * F-7B.3 §26 - deterministic invalidation simulation (zero paid calls). A shard is reusable only if its shardHash is
 * unchanged; the hash covers the shard's own primary text, its read-only context and the frozen inventory identity.
 */
import { planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { F7B_BUDGET, freezeAndPlan, writeJson } from "./f7b-lib";
import { F7B3_DIR } from "./f7b3-lib";

const frozen = freezeAndPlan();
const base = frozen.plan;

/** Re-plans over a mutated copy of the source context and reports which shard hashes survive. */
function replan(mutate: (text: string) => string, inventoryHashSuffix = ""): { changed: string[]; reusable: string[] } {
  const ctx = frozen.callerInput.sourceContext!;
  const regions = ctx.regions.map((r, i) => (i === 0 ? { ...r, text: mutate(r.text) } : r));
  const inv = inventoryHashSuffix ? { ...frozen.callerInput.frozenInventory!, frozenContentHash: frozen.callerInput.frozenInventory!.frozenContentHash + inventoryHashSuffix } : frozen.callerInput.frozenInventory!;
  const plan = planCompilationShards({ candidateRef: frozen.callerInput.candidateRef, companyId: frozen.callerInput.companyId, instrumentKey: frozen.callerInput.instrumentKey, documentId: "doc-a", sourceContext: { ...ctx, regions }, frozenInventory: inv, structuralIndex: frozen.chewy.index, budget: F7B_BUDGET, generation: { algorithmVersion: frozen.callerInput.compilerAlgorithmVersion, promptVersion: frozen.callerInput.compilerPromptVersion } });
  const baseHashes = new Map(base.shards.map((s) => [s.shardId, s.shardHash]));
  const changed: string[] = []; const reusable: string[] = [];
  for (const s of plan.shards) (baseHashes.get(s.shardId) === s.shardHash ? reusable : changed).push(s.shardId);
  for (const s of base.shards) if (!plan.shards.some((x) => x.shardId === s.shardId)) changed.push(s.shardId);
  return { changed: [...new Set(changed)], reusable };
}

// One source byte inside the owned text of a single shard: flip a digit in the middle of the region.
const target = base.shards[15]!;
const unit = base.units.find((u) => u.unitKey === target.ownedUnitKeys[0])!;
const at = unit.charStart + Math.floor((unit.charEnd - unit.charStart) / 2);
const oneByte = replan((t) => t.slice(0, at) + (t[at] === "x" ? "y" : "x") + t.slice(at + 1));
const inventoryChange = replan((t) => t, ":mutated");

writeJson(`${F7B3_DIR}/03-invalidation-simulation.json`, {
  artifact: "F-7B.3 §26 - deterministic invalidation simulation, zero paid calls",
  at: new Date().toISOString(), planHash: base.planHash, totalShards: base.shards.length,
  oneSourceByteChange: { mutatedRegionOffset: at, mutatedInsideShard: target.shardId, mutatedInsideUnit: unit.unitKey, invalidatedShards: oneByte.changed.length, reusableShards: oneByte.reusable.length, invalidatedShardIds: oneByte.changed, ownerInvalidated: oneByte.changed.includes(target.shardId), note: "Only shards whose own primary text or read-only context covers the mutated byte change hash; every other shard's result stays reusable by hash." },
  frozenInventoryHashChange: { invalidatedShards: inventoryChange.changed.length, reusableShards: inventoryChange.reusable.length, allInvalidated: inventoryChange.reusable.length === 0, note: "The frozen inventory identity is part of every shard hash, so a Pass A change invalidates every shard - no partial reuse." },
});
console.log(JSON.stringify({ oneByte: { invalidated: oneByte.changed.length, reusable: oneByte.reusable.length, ownerInvalidated: oneByte.changed.includes(target.shardId) }, inventoryChange: { invalidated: inventoryChange.changed.length, reusable: inventoryChange.reusable.length } }, null, 1));
