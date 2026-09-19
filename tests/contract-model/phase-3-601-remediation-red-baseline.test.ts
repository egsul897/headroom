/**
 * PHASE 3 / 6.01 TRUST-FAILURE REMEDIATION §10 - failure-preserving red baseline.
 *
 * Replays the EXACT frozen paid evidence (mission phase-3-final-601-final-paid) through the real production stitcher:
 * the pre-fix plan (planner semantic-compilation-shards.v1, hash-verified against the paid run) and the three
 * persisted terminal shard records. Zero model calls. These assertions must keep reproducing the failure forever -
 * they are the deterministic record of WHAT failed, independent of any later planner change (which produces a new
 * plan identity and is proven separately by the closure test).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { stitchShardResults } from "../../lib/contract-model/compiler/semantic/shard-stitcher";
import type { ShardExecutionResult, ShardPlan } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { FrozenSemanticInventory } from "../../lib/contract-model/compiler/semantic-accountability/types";

const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-paid";
const FROZEN = JSON.parse(readFileSync("tests/fixtures/phase-3-601-remediation/frozen-pre-fix-plan.json", "utf8")) as { paidPlanHash: string; sourceContext: { state: "COMPLETE_LOCAL_SOURCE"; regions: { regionId: string; text: string }[] }; companyId: string; instrumentKey: string; candidateRef: string; plan: ShardPlan };
const inventory = JSON.parse(readFileSync(`${RAW}/frozen-inventory.json`, "utf8")) as FrozenSemanticInventory;
const records = readdirSync(`${RAW}/durable-shards`).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${RAW}/durable-shards/${f}`, "utf8")) as { planHash: string; shardId: string; shardHash: string; result: ShardExecutionResult });

const SHARD0 = "shard:f266a61ab75f65592b9d";
const SHARD1 = "shard:9c94d27339b0f37fb71c";
const SHARD2 = "shard:6b6e808a01e1dcd22a81";
const HASH0 = "4b97a4f01be352664f66d7165e37f3b0a42600a829e306f819c7b3489123fc2f";
const HASH1 = "f422344546f42e86dd6951848772cf0f832347a84eb324e561bf6ca912d6881c";

describe("§10 red baseline - frozen identities", () => {
  it("the frozen pre-fix plan IS the paid plan (planHash) and its shard identities are the paid shard identities", () => {
    expect(FROZEN.plan.planHash).toBe("eab77c1aad1d941440f0d412e20578902c6744a5e100a0306153ea02e1720552");
    expect(FROZEN.plan.planHash).toBe(FROZEN.paidPlanHash);
    expect(FROZEN.plan.frozenContentHash).toBe(inventory.frozenContentHash);
    expect(FROZEN.plan.shards.map((s) => [s.shardId, s.shardHash])).toEqual([[SHARD0, HASH0], [SHARD1, HASH1], [SHARD2, "22cc2abe2bc60728a737b17828c0fbabca2ac3a67d51146e78dffab801dccfd2"]]);
    expect(records).toHaveLength(3);
    for (const r of records) { expect(r.planHash).toBe(FROZEN.plan.planHash); expect(r.result.shardHash).toBe(r.shardHash); }
  });

  it("shard 0 and shard 1 ended SHARD_MISSING_CONTEXT; shard 2 SHARD_COMPLETE (the control)", () => {
    const by = new Map(records.map((r) => [r.shardId, r.result]));
    expect(by.get(SHARD0)!.status).toBe("SHARD_MISSING_CONTEXT");
    expect(by.get(SHARD0)!.failureReasons).toEqual(["MISSING_CONTEXT", "OPERATIVE_STATE_UNRESOLVED"]);
    expect(by.get(SHARD1)!.status).toBe("SHARD_MISSING_CONTEXT");
    expect(by.get(SHARD1)!.failureReasons).toEqual(["MISSING_CONTEXT"]);
    expect(by.get(SHARD2)!.status).toBe("SHARD_COMPLETE");
  });

  it("exactly ONE rule per failed shard carries sufficiency MISSING_CONTEXT - the single escalation trigger of each shard", () => {
    const by = new Map(records.map((r) => [r.shardId, r.result]));
    const missing0 = by.get(SHARD0)!.composition!.rules.filter((r) => r.sufficiency === "MISSING_CONTEXT");
    const missing1 = by.get(SHARD1)!.composition!.rules.filter((r) => r.sufficiency === "MISSING_CONTEXT");
    expect(missing0.map((r) => [r.ruleId, r.sourceSectionRef])).toEqual([["ir-rule:f8040ca894957f7bb7a0121c", "6.01(b)(1)(X)"]]);
    expect(missing1.map((r) => [r.ruleId, r.sourceSectionRef])).toEqual([["ir-rule:aebc09fce0c0397c1d57ff37", "6.01(b)(32)"]]);
    expect(by.get(SHARD0)!.composition!.definitions.filter((d) => d.sufficiency === "MISSING_CONTEXT")).toHaveLength(0);
    expect(by.get(SHARD1)!.composition!.definitions.filter((d) => d.sufficiency === "MISSING_CONTEXT")).toHaveLength(0);
    // the requests those two rules recorded, verbatim from the persisted terminal result
    expect(missing0[0]!.unresolvedDependencies!.map((d) => d.targetRef)).toEqual(["Section 2.18", "Section 2.19", "Section 2.22"]);
    expect(missing1[0]!.sufficiencyReasons.join(" ")).toMatch(/'Available Amount' is not defined anywhere/);
    expect(missing1[0]!.sufficiencyReasons.join(" ")).toMatch(/'Not Otherwise Applied'/);
  });

  it("the pre-fix planner left the exact requested facts out of both shards (AMBIGUOUS sections, NOT_FOUND definition, BUDGET-starved term)", () => {
    const s0 = FROZEN.plan.shards.find((s) => s.shardId === SHARD0)!;
    const s1 = FROZEN.plan.shards.find((s) => s.shardId === SHARD1)!;
    const u0 = s0.unresolvedContext.map((u) => `${u.kind}:${u.key}:${u.reason}`);
    const u1 = s1.unresolvedContext.map((u) => `${u.kind}:${u.key}:${u.reason}`);
    expect(u0).toEqual(expect.arrayContaining(["REFERENCED_SECTION:2.18:AMBIGUOUS", "REFERENCED_SECTION:2.19:AMBIGUOUS", "REFERENCED_SECTION:2.22:AMBIGUOUS", "REFERENCED_TERM:permitted ratio debt:NOT_FOUND"]));
    expect(u1).toEqual(expect.arrayContaining(["REFERENCED_TERM:available amount:NOT_FOUND", "REFERENCED_TERM:term:not otherwise applied:BUDGET"]));
    // PARENT_ITEM entries consumed the context budget ahead of every referenced term/section in shard 0
    expect(s0.context.filter((c) => c.kind === "PARENT_ITEM")).toHaveLength(25);
    expect(s0.context.filter((c) => c.kind === "REFERENCED_SECTION")).toHaveLength(0);
    expect(s0.unresolvedContext.filter((u) => u.reason === "BUDGET")).toHaveLength(16);
    // the oversized atomic unit
    expect(s1.oversized).toBe(true);
    expect(s1.ownedUnitKeys).toHaveLength(69);
    expect(s1.ownedItemIds).toHaveLength(270);
    expect(s1.primaryChars).toBe(29414);
  });
});

describe("§10 red baseline - the real stitcher over the frozen results reproduces the paid trust failure", () => {
  const results = FROZEN.plan.shards.map((s) => records.find((r) => r.shardId === s.shardId)!.result);
  const stitched = stitchShardResults({ plan: FROZEN.plan, results, frozenInventory: inventory, sourceContextState: FROZEN.sourceContext.state, companyId: FROZEN.companyId, instrumentKey: FROZEN.instrumentKey, candidateRef: FROZEN.candidateRef, sourceRegions: FROZEN.sourceContext.regions });

  it("all 317 owned material items of the two incomplete shards are left unresolved (52 + 265) - the stitcher is correct to do so", () => {
    expect(stitched.unresolvedOwnedItems).toHaveLength(317);
    expect(stitched.unresolvedOwnedItems.filter((u) => u.shardId === SHARD0)).toHaveLength(52);
    expect(stitched.unresolvedOwnedItems.filter((u) => u.shardId === SHARD1)).toHaveLength(265);
    expect(stitched.unresolvedOwnedItems.every((u) => u.shardStatus === "SHARD_MISSING_CONTEXT")).toBe(true);
    expect(new Set(stitched.unresolvedOwnedItems.map((u) => u.inventoryItemId)).size).toBe(317);
  });

  it("5 owned material quantitative values lost and 5 material items missing from the composition (4 CRITICAL)", () => {
    expect(stitched.accountability.counts.materialQuantitativeValuesMissing).toBe(5);
    expect(stitched.accountability.counts.materialMissingFromComposition).toBe(5);
    const missing = stitched.accountability.items.filter((r) => r.disposition === "MISSING_FROM_COMPOSITION" && (r.materiality === "CRITICAL" || r.materiality === "MATERIAL"));
    expect(missing).toHaveLength(5);
    expect(stitched.accountability.counts.criticalMissingFromComposition).toBe(4);
    expect(missing.filter((r) => r.materiality === "CRITICAL")).toHaveLength(4);
    expect(stitched.accountability.semanticallyComplete).toBe(false);
  });

  it("stitched status PARTIAL with MISSING_CONTEXT / SHARD_INCOMPLETE / OPERATIVE_STATE_UNRESOLVED carried, and the paid census (3 collisions: 2 CONTEXTUAL_UNOWNED_DEFINITION demoted, 1 RULE_POSSIBLE_DUPLICATE)", () => {
    expect(stitched.status).toBe("PARTIAL");
    expect(stitched.failureReasons).toEqual(expect.arrayContaining(["MISSING_CONTEXT", "SHARD_INCOMPLETE", "OPERATIVE_STATE_UNRESOLVED", "SHARD_CONFLICT", "INVENTORY_ITEM_MISSING_FROM_COMPOSITION"]));
    const kinds: Record<string, number> = {};
    for (const c of stitched.collisions) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    expect(kinds).toEqual({ CONTEXTUAL_UNOWNED_DEFINITION: 2, RULE_POSSIBLE_DUPLICATE: 1 });
    expect(stitched.contextualEmissions).toHaveLength(2);
    // demoted, never credited: neither contextual definition survives into the stitched IR
    const demoted = new Set(stitched.contextualEmissions.map((e) => e.objectId));
    expect(stitched.definitions.some((d) => demoted.has(d.definitionId))).toBe(false);
    expect(stitched.definitionAttribution.filter((a) => demoted.has(a.objectId)).every((a) => a.retained === false)).toBe(true);
  });
});
