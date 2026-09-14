/**
 * F-7A - bounded compilation shards: planner, ownership, cross-shard context, stitching, collisions, partial failure,
 * isolated retry, source-change invalidation and global accountability (mission §19 A-H, §9-§15). Zero model calls:
 * every "shard compilation" is a scripted, lineage-bearing emitter.
 */
import { describe, expect, it } from "vitest";
import { planCompilationShards, DEFAULT_SHARD_BUDGET, buildShardCompilerInput } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { stitchShardResults } from "../../lib/contract-model/compiler/semantic/shard-stitcher";
import { executeShardPlan, classifyShardStatus } from "../../lib/contract-model/compiler/semantic/shard-execution";
import { estimateOutputTokens } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { ShardExecutionResult, ShardPlan } from "../../lib/contract-model/compiler/semantic/shard-types";
import { renderAccountabilityContext } from "../../lib/contract-model/compiler/semantic/caller";
import { testCompilerInput, emptyContextBundle } from "./semantic-compiler/test-helpers";
import { buildChapeauCorpus, buildDefinitionsCorpus, definitionFor, emitDefinitionsForShard, emitRulesForShard, maxOf, money, ruleFor, termName, termRef, CO, INST, DOC, type SyntheticCorpus } from "./f7a-synthetic-corpus";

const SMALL = { targetPrimaryChars: 1_200, maxPrimaryChars: 2_400, maxContextChars: 4_000, maxContextEntryChars: 600, maxUnitsPerShard: 16 };

function planFor(corpus: SyntheticCorpus, candidateRef: string, budget = SMALL): ShardPlan {
  return planCompilationShards({ candidateRef, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext: corpus.sourceContext, frozenInventory: corpus.frozenInventory, structuralIndex: corpus.index, budget, generation: { algorithmVersion: "alg.v1", promptVersion: "prompt.v1" } });
}

function ok(shardId: string, shardHash: string, composition: ShardExecutionResult["composition"]): ShardExecutionResult {
  return { shardId, shardHash, status: "SHARD_COMPLETE", composition, failureReasons: [], unresolvedIssues: [], reusedFromHash: false, attempts: 1, telemetry: null };
}

const stitch = (corpus: SyntheticCorpus, plan: ShardPlan, results: ShardExecutionResult[], candidateRef: string) => stitchShardResults({ plan, results, frozenInventory: corpus.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef });

describe("F-7A §19 A - 100 independent definitions", () => {
  const corpus = buildDefinitionsCorpus({ count: 100 });
  const plan = planFor(corpus, "cand:1.01");

  it("derives one unit per detected definition (plus the lead-in) from the structural index - never from a model", () => {
    expect(plan.derivation.operative).toBe("STRUCTURAL_DEFINITIONS");
    expect(plan.units.filter((u) => u.kind === "DEFINITION")).toHaveLength(100);
    expect(plan.units.filter((u) => u.kind === "LEAD_IN")).toHaveLength(1);
    const defs = plan.units.filter((u) => u.kind === "DEFINITION");
    for (let i = 0; i < defs.length; i++) expect(defs[i]!.termName).toBe(termName(i + 1));
    // units tile the region in order
    for (let i = 1; i < plan.units.length; i++) expect(plan.units[i]!.charStart).toBe(plan.units[i - 1]!.charEnd);
  });

  it("batches into bounded shards: more than one call, far fewer than 100, every shard within the budget, no unit split", () => {
    expect(plan.shards.length).toBeGreaterThan(1);
    expect(plan.shards.length).toBeLessThan(100);
    for (const s of plan.shards) {
      expect(s.oversized).toBe(false);
      expect(s.primaryChars).toBeLessThanOrEqual(SMALL.maxPrimaryChars);
      expect(s.ownedUnitKeys.length).toBeLessThanOrEqual(SMALL.maxUnitsPerShard);
      expect(s.estimate.outputTokens).toBe(estimateOutputTokens(s.ownedUnitKeys.filter((k) => plan.units.find((u) => u.unitKey === k)!.kind !== "LEAD_IN").length));
    }
    const covered = plan.shards.flatMap((s) => s.ownedUnitKeys);
    expect(new Set(covered).size).toBe(plan.units.length);
  });

  it("every material item has exactly one primary owner (zero unowned, zero multiply owned) and the proof says so", () => {
    expect(plan.ownershipProof).toEqual({ materialItems: 100, ownedOnce: 100, unowned: 0, multiplyOwned: 0 });
    expect(plan.unplacedItemIds).toEqual([]);
    const owners = new Map<string, number>();
    for (const s of plan.shards) for (const id of s.ownedItemIds) owners.set(id, (owners.get(id) ?? 0) + 1);
    expect([...owners.values()].every((n) => n === 1)).toBe(true);
    expect(Object.keys(plan.itemOwnerShard)).toHaveLength(100);
  });

  it("is deterministic: the same input yields the identical plan; packing budget never changes item -> unit ownership", () => {
    const again = planFor(corpus, "cand:1.01");
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
    const other = planFor(corpus, "cand:1.01", { ...SMALL, targetPrimaryChars: 3_000, maxPrimaryChars: 6_000 });
    expect(other.shards.length).toBeLessThan(plan.shards.length);
    expect(other.itemOwnerUnit).toEqual(plan.itemOwnerUnit);
  });

  it("the faithful emitters stitch back into one IR with every definition, value and lineage preserved and the GLOBAL Pass C complete", () => {
    const results = plan.shards.map((s) => ok(s.shardId, s.shardHash, emitDefinitionsForShard(corpus, plan, s)));
    const st = stitch(corpus, plan, results, "cand:1.01");
    expect(st.definitions).toHaveLength(100);
    expect(st.collisions.filter((c) => c.requiresReview)).toEqual([]);
    expect(st.contextualEmissions).toEqual([]);
    expect(st.accountability.counts.materialMissingFromComposition).toBe(0);
    expect(st.accountability.counts.represented).toBe(100);
    expect(st.accountability.counts.danglingLineageReferences).toBe(0);
    expect(st.accountability.semanticallyComplete).toBe(true);
    expect(st.status).toBe("COMPLETED");
    expect(st.unresolvedOwnedItems).toEqual([]);
  });
});

describe("F-7A §19 B - definition A references definition B in another shard", () => {
  const references = new Map<number, number>([[3, 40], [41, 2]]);
  const corpus = buildDefinitionsCorpus({ count: 48, references });
  const plan = planFor(corpus, "cand:1.01");
  const shardOf = (i: number) => plan.itemOwnerShard[`inv-item:${String(i).padStart(3, "0")}`]!;

  it("B appears as read-only REFERENCED_TERM context in A's shard, carrying provenance and B's owner; ownership stays with B's shard", () => {
    expect(shardOf(3)).not.toBe(shardOf(40));
    const shardA = plan.shards.find((s) => s.shardId === shardOf(3))!;
    const ctx = shardA.context.find((c) => c.kind === "REFERENCED_TERM" && c.contextKey === `term:${termName(40).toLowerCase()}`)!;
    expect(ctx).toBeDefined();
    expect(ctx.ownerShardId).toBe(shardOf(40));
    expect(ctx.sourceUnitKey).toBe(plan.itemOwnerUnit["inv-item:040"]);
    expect(ctx.absCharStart).not.toBeNull();
    expect(ctx.text).toContain(`“${termName(40)}” means`);
    expect(shardA.ownedItemIds).not.toContain("inv-item:040");
  });

  it("the shard compiler input renders B as an explicitly read-only region and lists only A's shard's own items as its accountability obligation", () => {
    const base = testCompilerInput({ companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, candidateRef: "cand:1.01", sourceSectionRef: "1.01", operativeSourceText: corpus.sourceContext.regions[0]!.text, contextBundle: emptyContextBundle(), sourceContext: corpus.sourceContext, frozenInventory: corpus.frozenInventory });
    const shardA = plan.shards.find((s) => s.shardId === shardOf(3))!;
    const input = buildShardCompilerInput(base, plan, shardA);
    expect(input.candidateRef).toBe(`cand:1.01#${shardA.shardId}`);
    expect(input.operativeSourceText).toBe(corpus.sourceContext.regions[0]!.text.slice(shardA.primaryCharStart, shardA.primaryCharEnd));
    expect(input.frozenInventory!.items.map((i) => i.inventoryItemId).sort()).toEqual([...shardA.ownedItemIds].sort());
    const rendered = renderAccountabilityContext(input);
    expect(rendered).toContain("READ-ONLY DEPENDENCY CONTEXT (REFERENCED_TERM");
    expect(rendered).toContain(`“${termName(40)}” means`);
    expect(rendered).not.toContain("inv-item:040");
  });

  it("A's shard emitting B's definition too is a contextual emission: dropped, never credited, and the candidate requires review; B's own shard's copy is the one stitched", () => {
    const results = plan.shards.map((s) => {
      const comp = emitDefinitionsForShard(corpus, plan, s, references);
      if (s.shardId === shardOf(3)) comp.definitions.push(definitionFor(termName(40), money(99, ["inv-item:040"]), { lineage: ["inv-item:040"] }));
      return ok(s.shardId, s.shardHash, comp);
    });
    const st = stitch(corpus, plan, results, "cand:1.01");
    expect(st.definitions.filter((d) => d.termName === termName(40))).toHaveLength(1);
    expect(st.definitions.find((d) => d.termName === termName(40))!.calculationExpression).not.toMatchObject({ operands: [{ amount: 99 }] });
    expect(st.contextualEmissions).toEqual([{ shardId: shardOf(3), kind: "DEFINITION", objectId: expect.any(String), ownerShardId: shardOf(40) }]);
    expect(st.collisions.some((c) => c.kind === "DEFINITION_EMITTED_BY_NON_OWNER" && c.requiresReview)).toBe(true);
    expect(st.status).toBe("REVIEW_REQUIRED");
    expect(st.failureReasons).toContain("SHARD_CONFLICT");
    // the only credit for item 040 comes from B's shard
    const rec = st.accountability.items.find((i) => i.inventoryItemId === "inv-item:040")!;
    expect(rec.disposition).toBe("REPRESENTED");
    expect(rec.lineageIrPaths.every((p) => p.startsWith("definitions["))).toBe(true);
  });

  it("if B's shard fails, B's items are MISSING even though A's shard saw B as context - context never earns credit", () => {
    const results = plan.shards.map((s) => (s.shardId === shardOf(40) ? { ...ok(s.shardId, s.shardHash, null), status: "SHARD_PROVIDER_FAILURE" as const, failureReasons: ["PROVIDER_FAILURE" as const] } : ok(s.shardId, s.shardHash, emitDefinitionsForShard(corpus, plan, s, references))));
    const st = stitch(corpus, plan, results, "cand:1.01");
    expect(st.accountability.items.find((i) => i.inventoryItemId === "inv-item:040")!.disposition).toBe("MISSING_FROM_COMPOSITION");
    expect(st.unresolvedOwnedItems.map((u) => u.inventoryItemId)).toContain("inv-item:040");
    expect(st.status).toBe("PARTIAL");
  });
});

describe("F-7A §19 C - shared-capacity construct whose members span a packing boundary", () => {
  const corpus = buildDefinitionsCorpus({ count: 30, sharedCapGroup: [10, 11, 12, 13, 14] });
  const plan = planFor(corpus, "cand:1.01");

  it("forces the shared-capacity head and its members into one must-link group and one shard", () => {
    const g = plan.mustLinkGroups.find((x) => x.unitKeys.includes(plan.itemOwnerUnit["inv-item:010"]!))!;
    expect(g).toBeDefined();
    expect(g.links.every((l) => l.kind === "SHARED_CAP")).toBe(true);
    const shards = new Set([10, 11, 12, 13, 14].map((i) => plan.itemOwnerShard[`inv-item:${String(i).padStart(3, "0")}`]));
    expect(shards.size).toBe(1);
  });

  it("without the shared-capacity link the same members would have been split across shards (the link is what kept the owner coherent)", () => {
    const plain = planFor(buildDefinitionsCorpus({ count: 30 }), "cand:1.01");
    const shards = new Set([10, 11, 12, 13, 14].map((i) => plain.itemOwnerShard[`inv-item:${String(i).padStart(3, "0")}`]));
    expect(plain.mustLinkGroups).toEqual([]);
    expect(shards.size).toBeGreaterThan(1);
  });

  it("a must-link block larger than the max is still one shard, flagged oversized - never split", () => {
    const wide = buildDefinitionsCorpus({ count: 30, sharedCapGroup: [2, 25] });
    const p = planFor(wide, "cand:1.01");
    const shard = p.shards.find((s) => s.shardId === p.itemOwnerShard["inv-item:002"])!;
    expect(shard.shardId).toBe(p.itemOwnerShard["inv-item:025"]);
    expect(shard.oversized).toBe(true);
    expect(p.totals.oversizedShards).toBe(1);
  });
});

describe("F-7A §19 D - chapeau + 20 child clauses", () => {
  const corpus = buildChapeauCorpus(20);
  const plan = planFor(corpus, "cand:6.04", { ...SMALL, targetPrimaryChars: 400, maxPrimaryChars: 800 });

  it("derives structural units (chapeau own text + one per child), owns the chapeau item once, and spreads children over several shards", () => {
    expect(plan.derivation.operative).toBe("STRUCTURAL_NODES");
    expect(plan.units.filter((u) => u.sectionRef === "6.04")).toHaveLength(1);
    expect(plan.units.filter((u) => u.sectionRef && /^6\.04\([a-t]\)$/.test(u.sectionRef))).toHaveLength(20);
    expect(plan.ownershipProof).toEqual({ materialItems: 21, ownedOnce: 21, unowned: 0, multiplyOwned: 0 });
    expect(plan.shards.length).toBeGreaterThan(2);
  });

  it("every shard that does not own the chapeau receives it as CHAPEAU context (owner = the chapeau's shard) plus the parent item, without owning them", () => {
    const chapeauUnit = plan.itemOwnerUnit["inv-item:chapeau"]!;
    const chapeauShard = plan.unitOwnerShard[chapeauUnit]!;
    for (const s of plan.shards) {
      if (s.shardId === chapeauShard) continue;
      const ctx = s.context.find((c) => c.kind === "CHAPEAU" && c.sourceUnitKey === chapeauUnit);
      expect(ctx, `shard ${s.shardId} lacks the chapeau`).toBeDefined();
      expect(ctx!.ownerShardId).toBe(chapeauShard);
      expect(ctx!.text).toContain("so long as no Default");
      expect(s.context.some((c) => c.kind === "PARENT_ITEM" && c.contextKey === "parent-item:inv-item:chapeau")).toBe(true);
      expect(s.ownedItemIds).not.toContain("inv-item:chapeau");
    }
  });

  it("rules from every shard stitch into 20 rules with ownership-derived ids, every child value present, and the chapeau item credited exactly once", () => {
    const results = plan.shards.map((s) => {
      const comp = emitRulesForShard(corpus, plan, s, "cand:6.04");
      // the chapeau's own shard represents the chapeau condition on its first rule (or as a disposition when it owns no clause)
      if (s.shardId === plan.unitOwnerShard[plan.itemOwnerUnit["inv-item:chapeau"]!]) {
        if (comp.rules[0]) comp.rules[0].inventoryItemIds = [...(comp.rules[0].inventoryItemIds ?? []), "inv-item:chapeau"];
        else comp.inventoryDispositions.push({ inventoryItemId: "inv-item:chapeau", disposition: "INTENTIONALLY_NON_COMPUTATIONAL", note: "chapeau condition" });
      }
      return ok(s.shardId, s.shardHash, comp);
    });
    const st = stitch(corpus, plan, results, "cand:6.04");
    expect(st.rules).toHaveLength(20);
    expect(new Set(st.rules.map((r) => r.ruleId)).size).toBe(20);
    expect(st.accountability.counts.materialMissingFromComposition).toBe(0);
    expect(st.accountability.counts.materialQuantitativeValuesMissing).toBe(0);
    expect(st.status).toBe("COMPLETED");
  });
});

describe("F-7A §19 E/F - partial provider failure and isolated retry", () => {
  const corpus = buildDefinitionsCorpus({ count: 60 });
  const plan = planFor(corpus, "cand:1.01");
  const failing = plan.shards[Math.floor(plan.shards.length / 2)]!;

  it("E. one provider failure among many successes: successful outputs survive, the failed shard's owned items are explicitly unresolved, the candidate is PARTIAL - never COMPLETE", async () => {
    const run = await executeShardPlan({ plan, frozenInventory: corpus.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: "cand:1.01", executor: async (shard) => (shard.shardId === failing.shardId ? { status: "SHARD_PROVIDER_FAILURE", composition: null, failureReasons: ["PROVIDER_FAILURE"], unresolvedIssues: ["gateway_stream_terminated"], telemetry: null } : { status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(corpus, plan, shard), failureReasons: [], unresolvedIssues: [], telemetry: null }) });
    expect(run.stats).toMatchObject({ shards: plan.shards.length, executed: plan.shards.length, reused: 0, retries: 0, failed: 1, complete: plan.shards.length - 1 });
    expect(run.stitched.status).toBe("PARTIAL");
    expect(run.stitched.failureReasons).toEqual(expect.arrayContaining(["PROVIDER_FAILURE", "SHARD_INCOMPLETE", "INVENTORY_ITEM_MISSING_FROM_COMPOSITION"]));
    expect(run.stitched.definitions).toHaveLength(60 - failing.ownedUnitKeys.filter((k) => plan.units.find((u) => u.unitKey === k)!.kind === "DEFINITION").length);
    expect(run.stitched.unresolvedOwnedItems.map((u) => u.inventoryItemId).sort()).toEqual([...failing.ownedMaterialItemIds].sort());
    expect(run.stitched.accountability.counts.materialMissingFromComposition).toBe(failing.ownedMaterialItemIds.length);
    expect(run.stitched.accountability.semanticallyComplete).toBe(false);
    expect(run.stitched.shards.find((s) => s.shardId === failing.shardId)!.status).toBe("SHARD_PROVIDER_FAILURE");
  });

  it("an executor that throws is contained as a provider failure of that shard only", async () => {
    const run = await executeShardPlan({ plan, frozenInventory: corpus.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: "cand:1.01", executor: async (shard) => { if (shard.shardId === failing.shardId) throw new Error("socket hang up"); return { status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(corpus, plan, shard), failureReasons: [], unresolvedIssues: [], telemetry: null }; } });
    expect(run.results.find((r) => r.shardId === failing.shardId)!.status).toBe("SHARD_PROVIDER_FAILURE");
    expect(run.results.find((r) => r.shardId === failing.shardId)!.unresolvedIssues[0]).toContain("socket hang up");
    expect(run.stats.complete).toBe(plan.shards.length - 1);
  });

  it("F. retrying only the failed shard with unchanged hashes reuses every other shard's result (no re-run) and completes the candidate", async () => {
    const first = await executeShardPlan({ plan, frozenInventory: corpus.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: "cand:1.01", executor: async (shard) => (shard.shardId === failing.shardId ? { status: "SHARD_PROVIDER_FAILURE", composition: null, failureReasons: ["PROVIDER_FAILURE"], unresolvedIssues: [], telemetry: null } : { status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(corpus, plan, shard), failureReasons: [], unresolvedIssues: [], telemetry: null }) });
    const prior = new Map(first.results.map((r) => [r.shardHash, r]));
    const calls: string[] = [];
    const second = await executeShardPlan({ plan, priorResults: prior, frozenInventory: corpus.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: "cand:1.01", executor: async (shard) => { calls.push(shard.shardId); return { status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(corpus, plan, shard), failureReasons: [], unresolvedIssues: [], telemetry: null }; } });
    expect(calls).toEqual([failing.shardId]);
    expect(second.stats).toMatchObject({ executed: 1, reused: plan.shards.length - 1, retries: 0 });
    expect(second.results.filter((r) => r.reusedFromHash)).toHaveLength(plan.shards.length - 1);
    expect(second.stitched.status).toBe("COMPLETED");
    expect(second.stitched.accountability.semanticallyComplete).toBe(true);
  });

  it("bounded in-run retry: only SHARD_PROVIDER_FAILURE is retried, at most maxAttemptsPerShard times, never globally", async () => {
    let attemptsSeen = 0;
    const run = await executeShardPlan({ plan, maxAttemptsPerShard: 2, frozenInventory: corpus.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: "cand:1.01", executor: async (shard, attempt) => { if (shard.shardId === failing.shardId) { attemptsSeen = attempt; if (attempt === 1) return { status: "SHARD_PROVIDER_FAILURE", composition: null, failureReasons: ["PROVIDER_FAILURE"], unresolvedIssues: [], telemetry: null }; } return { status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(corpus, plan, shard), failureReasons: [], unresolvedIssues: [], telemetry: null }; } });
    expect(attemptsSeen).toBe(2);
    expect(run.stats.retries).toBe(1);
    expect(run.stats.executed).toBe(plan.shards.length + 1);
    expect(run.stitched.status).toBe("COMPLETED");
  });

  it("classifyShardStatus maps the compiler's own outcome vocabulary", () => {
    expect(classifyShardStatus("FAILED", ["PROVIDER_FAILURE"])).toBe("SHARD_PROVIDER_FAILURE");
    expect(classifyShardStatus("FAILED", ["MODEL_SCHEMA_FAILURE"])).toBe("SHARD_SCHEMA_FAILURE");
    expect(classifyShardStatus("PARTIAL", ["OUTPUT_TRUNCATED"])).toBe("SHARD_PARTIAL");
    expect(classifyShardStatus("REVIEW_REQUIRED", ["MISSING_CONTEXT"])).toBe("SHARD_MISSING_CONTEXT");
    expect(classifyShardStatus("COMPLETED", [])).toBe("SHARD_COMPLETE");
  });
});

describe("F-7A §19 G - one source change in definition 73 invalidates only the shards it touches", () => {
  const base = buildDefinitionsCorpus({ count: 100, references: new Map([[5, 73]]) });
  const changed = buildDefinitionsCorpus({ count: 100, references: new Map([[5, 73]]), overrideText: new Map([[73, `“${termName(73)}” means the greater of (a) $73,000,001 and (b) 2% of Consolidated EBITDA.`]]) });
  // hold the inventory identity constant so the test isolates the SOURCE effect (in production Pass A would re-freeze too)
  changed.frozenInventory.frozenContentHash = base.frozenInventory.frozenContentHash;
  const p1 = planFor(base, "cand:1.01");
  const p2 = planFor(changed, "cand:1.01");

  it("shard ids (packing sets) are unchanged; only the owner shard of definition 73 and the shard that reads it as context change their freeze hash", () => {
    expect(p2.shards.map((s) => s.shardId)).toEqual(p1.shards.map((s) => s.shardId));
    const owner73 = p1.itemOwnerShard["inv-item:073"]!;
    const reader = p1.itemOwnerShard["inv-item:005"]!;
    const changedShards = p1.shards.filter((s, i) => s.shardHash !== p2.shards[i]!.shardHash).map((s) => s.shardId);
    expect(changedShards.sort()).toEqual([...new Set([owner73, reader])].sort());
    expect(p1.planHash).not.toBe(p2.planHash);
  });

  it("a prior execution stays reusable for every unaffected shard after the change", async () => {
    const first = await executeShardPlan({ plan: p1, frozenInventory: base.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: "cand:1.01", executor: async (shard) => ({ status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(base, p1, shard, new Map([[5, 73]])), failureReasons: [], unresolvedIssues: [], telemetry: null }) });
    const calls: string[] = [];
    const second = await executeShardPlan({ plan: p2, priorResults: new Map(first.results.map((r) => [r.shardHash, r])), frozenInventory: changed.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: "cand:1.01", executor: async (shard) => { calls.push(shard.shardId); return { status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(changed, p2, shard, new Map([[5, 73]])), failureReasons: [], unresolvedIssues: [], telemetry: null }; } });
    expect(calls.sort()).toEqual([...new Set([p1.itemOwnerShard["inv-item:073"]!, p1.itemOwnerShard["inv-item:005"]!])].sort());
    expect(second.stats.reused).toBe(p1.shards.length - calls.length);
  });

  it("a changed frozen inventory hash invalidates every shard", () => {
    const reinventoried = buildDefinitionsCorpus({ count: 100 });
    reinventoried.frozenInventory.frozenContentHash = "frozen:different";
    const p3 = planFor(reinventoried, "cand:1.01");
    const p0 = planFor(buildDefinitionsCorpus({ count: 100 }), "cand:1.01");
    expect(p3.shards.every((s, i) => s.shardHash !== p0.shards[i]!.shardHash)).toBe(true);
  });
});

describe("F-7A §19 H / §11 - collisions and conflicts are explicit, never silently deduplicated", () => {
  const corpus = buildDefinitionsCorpus({ count: 40 });
  const plan = planFor(corpus, "cand:1.01");

  it("one shard emitting the same definition twice with IDENTICAL content keeps one copy without review; with DIFFERENT content the kept copy becomes AMBIGUOUS and the candidate requires review", () => {
    const owner = plan.shards.find((s) => s.ownedItemIds.includes("inv-item:004"))!;
    const consistent = plan.shards.map((s) => { const c = emitDefinitionsForShard(corpus, plan, s); if (s.shardId === owner.shardId) c.definitions.push(JSON.parse(JSON.stringify(c.definitions.find((d) => d.termName === termName(4))!))); return ok(s.shardId, s.shardHash, c); });
    const st1 = stitch(corpus, plan, consistent, "cand:1.01");
    expect(st1.definitions.filter((d) => d.termName === termName(4))).toHaveLength(1);
    expect(st1.collisions.map((c) => c.kind)).toEqual(["DEFINITION_DUPLICATE_CONSISTENT"]);
    expect(st1.status).toBe("COMPLETED");

    const conflicting = plan.shards.map((s) => { const c = emitDefinitionsForShard(corpus, plan, s); if (s.shardId === owner.shardId) c.definitions.push(definitionFor(termName(4), maxOf(money(4_000_000, ["inv-item:004"]), termRef("Total Assets")), { lineage: ["inv-item:004"] })); return ok(s.shardId, s.shardHash, c); });
    const st2 = stitch(corpus, plan, conflicting, "cand:1.01");
    const kept = st2.definitions.find((d) => d.termName === termName(4))!;
    expect(kept.sufficiency).toBe("AMBIGUOUS");
    expect(st2.collisions.some((c) => c.kind === "DEFINITION_CONFLICT" && c.requiresReview)).toBe(true);
    expect(st2.status).toBe("REVIEW_REQUIRED");
    expect(st2.failureReasons).toContain("SHARD_CONFLICT");
  });

  it("lineage claims on items owned by another shard are stripped and recorded (no duplicate accountability credit); dispositions on unowned items are dropped", () => {
    const [a, b] = plan.shards;
    const foreignItem = b!.ownedItemIds[0]!;
    const results = plan.shards.map((s) => { const c = emitDefinitionsForShard(corpus, plan, s); if (s.shardId === a!.shardId) { c.definitions[0]!.inventoryItemIds = [...(c.definitions[0]!.inventoryItemIds ?? []), foreignItem]; c.inventoryDispositions.push({ inventoryItemId: foreignItem, disposition: "AMBIGUOUS", note: "not mine" }); } return ok(s.shardId, s.shardHash, c); });
    const st = stitch(corpus, plan, results, "cand:1.01");
    expect(st.definitions[0]!.inventoryItemIds).not.toContain(foreignItem);
    expect(st.collisions.filter((c) => c.kind === "LINEAGE_CLAIM_ON_UNOWNED_ITEM").map((c) => c.itemId)).toEqual([foreignItem]);
    expect(st.collisions.some((c) => c.kind === "DISPOSITION_ON_UNOWNED_ITEM" && c.itemId === foreignItem)).toBe(true);
    expect(st.inventoryDispositions.some((d) => d.inventoryItemId === foreignItem)).toBe(false);
    // the item is still represented - by its real owner shard - exactly once
    const rec = st.accountability.items.find((i) => i.inventoryItemId === foreignItem)!;
    expect(rec.disposition).toBe("REPRESENTED");
    // and the stripped claim earned nothing: the lineage paths are exactly those of an honest run without the claim
    const honest = stitch(corpus, plan, plan.shards.map((s) => ok(s.shardId, s.shardHash, emitDefinitionsForShard(corpus, plan, s))), "cand:1.01");
    expect(rec.lineageIrPaths).toEqual(honest.accountability.items.find((i) => i.inventoryItemId === foreignItem)!.lineageIrPaths);
    expect(rec.lineageIrPaths.every((p) => p.startsWith("definitions["))).toBe(true);
  });

  it("digest-form lineage ids (bare 24-hex, as a paid run may cite them) are canonicalized to the owned item before scoping - never stripped as unknown", () => {
    const results = plan.shards.map((s) => { const c = emitDefinitionsForShard(corpus, plan, s); for (const d of c.definitions) d.inventoryItemIds = (d.inventoryItemIds ?? []).map((id) => id.slice(id.indexOf(":") + 1)); return ok(s.shardId, s.shardHash, c); });
    const honest = stitch(corpus, plan, plan.shards.map((s) => ok(s.shardId, s.shardHash, emitDefinitionsForShard(corpus, plan, s))), "cand:1.01");
    const st = stitch(corpus, plan, results, "cand:1.01");
    expect(st.canonicalizedLineageReferences).toBeGreaterThan(0);
    expect(st.collisions.filter((c) => c.kind === "LINEAGE_CLAIM_ON_UNOWNED_ITEM")).toEqual([]);
    expect(st.definitions.map((d) => d.inventoryItemIds)).toEqual(honest.definitions.map((d) => d.inventoryItemIds));
    expect(st.accountability.counts).toEqual(honest.accountability.counts);
    expect(st.status).toBe(honest.status);
  });

  it("a rule referencing a rule that lives in another shard never keeps a dangling id: dependsOn becomes an unresolved dependency, an expression reference becomes an UNSUPPORTED node", () => {
    const chapeau = buildChapeauCorpus(6);
    const p = planFor(chapeau, "cand:6.04", { ...SMALL, targetPrimaryChars: 300, maxPrimaryChars: 600 });
    expect(p.shards.length).toBeGreaterThan(1);
    // the shard owning the first child clauses also emits a rule for a clause OWNED BY THE LAST SHARD (out of scope -> dropped) and references it two ways.
    const lastShard = p.shards[p.shards.length - 1]!;
    const shard1Unit = p.units.find((u) => u.unitKey === lastShard.ownedUnitKeys[0])!;
    const foreignIds = chapeau.itemsBySection.get(shard1Unit.sectionRef!) ?? [];
    expect(foreignIds.length).toBe(1);
    const injector = p.shards.findIndex((s) => s.shardId !== lastShard.shardId && s.ownedUnitKeys.some((k) => k.includes("(")));
    expect(injector).toBeGreaterThanOrEqual(0);
    let droppedId = "";
    const results = p.shards.map((s, i) => { const c = emitRulesForShard(chapeau, p, s, "cand:6.04"); if (i === injector && c.rules[0]) { const extra = ruleFor("rx", `cand:6.04#${s.shardId}`, shard1Unit.sectionRef!, money(1, foreignIds), { lineage: foreignIds }); droppedId = extra.ruleId; c.rules.push(extra); c.rules[0].dependsOn = [{ relationshipType: "REQUIRES", targetRuleId: extra.ruleId, description: "cross-shard" }]; c.rules[0].capacityExpression = { exprId: "x", kind: "RULE_REFERENCE", type: "CAPACITY", ruleId: extra.ruleId, companyId: CO, instrumentKey: INST } as never; } return ok(s.shardId, s.shardHash, c); });
    const st = stitch(chapeau, p, results, "cand:6.04");
    expect(st.collisions.some((c) => c.kind === "RULE_EMITTED_OUT_OF_SCOPE" && c.objectId === droppedId)).toBe(true);
    const first = st.rules.find((r) => (r.unresolvedDependencies ?? []).length > 0)!;
    expect(first).toBeDefined();
    expect(first.dependsOn).toEqual([]);
    expect(first.unresolvedDependencies![0]!.targetRef).toBe(droppedId);
    expect(first.capacityExpression).toMatchObject({ kind: "UNSUPPORTED", requiredReview: true });
    expect(st.collisions.some((c) => c.kind === "DANGLING_RULE_REFERENCE")).toBe(true);
    expect(st.status).toBe("REVIEW_REQUIRED");
  });
});

describe("F-7A §10 - globally stable ids independent of shard-local ordering", () => {
  const corpus = buildChapeauCorpus(8);
  const plan = planFor(corpus, "cand:6.04", { ...SMALL, targetPrimaryChars: 400, maxPrimaryChars: 800 });
  it("reversing the emission order inside every shard yields identical stitched rule ids", () => {
    const forward = plan.shards.map((s) => ok(s.shardId, s.shardHash, emitRulesForShard(corpus, plan, s, "cand:6.04")));
    const reversed = plan.shards.map((s) => { const c = emitRulesForShard(corpus, plan, s, "cand:6.04"); c.rules.reverse(); return ok(s.shardId, s.shardHash, c); });
    const a = stitch(corpus, plan, forward, "cand:6.04");
    const b = stitch(corpus, plan, reversed, "cand:6.04");
    expect(b.rules.map((r) => r.ruleId).sort()).toEqual(a.rules.map((r) => r.ruleId).sort());
    expect(a.rules.map((r) => r.ruleId)).toEqual(b.rules.map((r) => r.ruleId));
  });
  it("a different packing of the same units yields the same rule ids (ids derive from the owner unit, not the shard)", () => {
    const other = planFor(corpus, "cand:6.04", { ...SMALL, targetPrimaryChars: 900, maxPrimaryChars: 1800 });
    expect(other.shards.length).not.toBe(plan.shards.length);
    const a = stitch(corpus, plan, plan.shards.map((s) => ok(s.shardId, s.shardHash, emitRulesForShard(corpus, plan, s, "cand:6.04"))), "cand:6.04");
    const b = stitch(corpus, other, other.shards.map((s) => ok(s.shardId, s.shardHash, emitRulesForShard(corpus, other, s, "cand:6.04"))), "cand:6.04");
    expect(b.rules.map((r) => r.ruleId).sort()).toEqual(a.rules.map((r) => r.ruleId).sort());
  });
});

describe("F-7A §20 - anti-enumeration: the planner works on structure only", () => {
  it("swapping every formula in the corpus for a different shape changes no boundary and no ownership", () => {
    const a = buildDefinitionsCorpus({ count: 25 });
    const b = buildDefinitionsCorpus({ count: 25, overrideText: new Map(Array.from({ length: 25 }, (_, k) => [k + 1, `“${termName(k + 1)}” means the greater of (a) 7.5% of Total Assets and (b) $${((k + 1) * 1_000_000).toLocaleString("en-US")}.`])) });
    const pa = planFor(a, "cand:1.01");
    const pb = planFor(b, "cand:1.01");
    // Same units, same item -> unit ownership, same orchestration code path; only the packing (which depends on the
    // rewritten text's length, never on its formula shape) may differ.
    expect(pb.units.map((u) => u.termName)).toEqual(pa.units.map((u) => u.termName));
    expect(pb.itemOwnerUnit).toEqual(pa.itemOwnerUnit);
    expect(pb.derivation).toEqual(pa.derivation);
    expect(pb.ownershipProof).toEqual(pa.ownershipProof);
    expect(pb.mustLinkGroups).toEqual(pa.mustLinkGroups);
  });
  it("the default budget is the documented one", () => {
    expect(DEFAULT_SHARD_BUDGET).toEqual({ targetPrimaryChars: 12_000, maxPrimaryChars: 24_000, maxContextChars: 10_000, maxContextEntryChars: 1_800, maxUnitsPerShard: 16 });
  });
});
