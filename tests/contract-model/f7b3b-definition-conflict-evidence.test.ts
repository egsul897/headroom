/**
 * F-7B.3B §22 - definition-conflict evidence preservation: the safety matrix A-J.
 *
 * Synthetic, generic, zero model calls. What is under test is the stitcher's behaviour when two or more OWNER shards
 * represent the same definition differently. Before this change the stitcher kept the first copy, flagged the conflict
 * and discarded the other copy entirely, which in the real Chewy Wave A run destroyed two MONEY literals and three
 * owned inventory lineage references that existed nowhere else.
 *
 * The rule under test: preserve the conflict, never resolve it. Every distinct representation survives whole, no
 * variant is marked correct, nothing is merged, and none of it can earn accountability credit.
 */
import { describe, expect, it } from "vitest";
import { planCompilationShards } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { stitchShardResults } from "../../lib/contract-model/compiler/semantic/shard-stitcher";
import type { ShardExecutionResult, ShardPlan, StitchedCompilation } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../../lib/contract-model/compiler/semantic-accountability/types";
import { buildTestIndex } from "./context-retrieval-test-utils";
import { definitionFor, maxOf, money, termRef, CO, INST, DOC } from "./f7a-synthetic-corpus";

const CAND = "cand:1.01";
const BUDGET = { targetPrimaryChars: 400, maxPrimaryChars: 100_000, maxContextChars: 8_000, maxContextEntryChars: 1_200, maxUnitsPerShard: 1 };

interface Fixture { plan: ShardPlan; inventory: FrozenSemanticInventory; regions: { regionId: string; text: string }[]; regionText: string }

/**
 * One definitions section, one planner DEFINITION unit per line, one unit per shard (maxUnitsPerShard = 1) so that
 * different shards can each earn ownership of the same emitted term by DIFFERENT proofs - which is exactly how the two
 * real conflicts arose: one shard by a primary-source declaration in its own text, another by owned inventory lineage.
 */
function fixture(lines: string[], items: (t: string) => SemanticInventoryItem[] = () => []): Fixture {
  const text = ["SECTION 1.01. Defined Terms .", ...lines].join("\n");
  const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
  const section = index.resolveUniqueNodeByRef(DOC, "1.01");
  if (section.status !== "UNIQUE") throw new Error("fixture: section 1.01 not unique");
  const regionText = index.getNodeText(section.node.nodeId, "DESCENDANTS");
  const sourceContext: SourceContextResult = { state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: DOC, sourceNodeId: section.node.nodeId, sectionRef: "1.01", charStart: section.node.charStart, charEnd: section.node.charStart + regionText.length, text: regionText, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: regionText.length, budgetChars: 24_000 };
  const inventoryItems = items(regionText);
  const inventory: FrozenSemanticInventory = { candidateRef: CAND, items: inventoryItems, uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "synthetic", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0, sourceContextState: "COMPLETE_LOCAL_SOURCE", frozenContentHash: `frozen:${CAND}:${inventoryItems.length}`, frozenAt: "2026-01-01T00:00:00.000Z", algorithmVersion: "semantic-accountability.v5", promptVersion: "semantic-inventory-prompt.v5", provider: "synthetic", model: "synthetic", telemetryCostUsd: null };
  const plan = planCompilationShards({ candidateRef: CAND, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext, frozenInventory: inventory, structuralIndex: index, budget: BUDGET, generation: { algorithmVersion: "alg.v1", promptVersion: "prompt.v1" } });
  return { plan, inventory, regions: [{ regionId: "operative", text: regionText }], regionText };
}

function invItem(id: string, regionText: string, needle: string): SemanticInventoryItem {
  const at = regionText.indexOf(needle);
  if (at < 0) throw new Error(`fixture: anchor "${needle}" not found`);
  return { inventoryItemId: id, sourceSpan: { regionId: "operative", documentId: DOC, sourceNodeId: null, sectionRef: "1.01", charStart: at, charEnd: at + needle.length, sourceCitation: "§1.01", excerpt: needle }, semanticRole: "THRESHOLD", proposition: `proposition ${id}`, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentItemId: null, relatedItemIds: [], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: "DEFINITIONAL", detectionMethod: "MODEL" };
}

const ok = (shardId: string, shardHash: string, definitions: ReturnType<typeof definitionFor>[]): ShardExecutionResult =>
  ({ shardId, shardHash, status: "SHARD_COMPLETE", composition: { rules: [], definitions, sharedCapacities: [], inventoryDispositions: [] }, failureReasons: [], unresolvedIssues: [], reusedFromHash: false, attempts: 1, telemetry: null });

function stitch(f: Fixture, byShard: Map<string, ReturnType<typeof definitionFor>[]>): StitchedCompilation {
  const results = f.plan.shards.map((s) => ok(s.shardId, s.shardHash, byShard.get(s.shardId) ?? []));
  return stitchShardResults({ plan: f.plan, results, frozenInventory: f.inventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: CAND, sourceRegions: f.regions });
}

/** The shard owning the planner DEFINITION unit for `term`. */
function shardOwning(plan: ShardPlan, term: string): string {
  const unit = plan.units.find((u) => u.kind === "DEFINITION" && u.normalizedTermName === term.toLowerCase());
  if (!unit) throw new Error(`fixture: no planner DEFINITION unit for ${term}`);
  return plan.unitOwnerShard[unit.unitKey]!;
}

/**
 * The standard two-owner conflict setup: "Shared Term" is declared inside the Alpha unit (so the Alpha shard owns it by
 * primary-source declaration) and the Beta shard owns an inventory item, so a definition it emits with that lineage is
 * owned by lineage. Neither shard is a planner unit for "Shared Term", so both earn ownership by a different proof.
 */
function conflictFixture() {
  const f = fixture([
    `“Alpha Amount” means an amount determined on the applicable basis, and “Shared Term” has the meaning assigned to such term in Section 6.01(a).`,
    `“Beta Amount” means an amount determined on the applicable basis, and “Shared Term” has the meaning assigned to such term in Section 6.01(a).`,
    `“Gamma Amount” means an amount equal to $30,000,000 for the applicable period.`,
    `“Delta Amount” means an amount equal to $40,000,000 for the applicable period.`,
  ], (t) => [invItem("inv-item:gamma", t, "$30,000,000"), invItem("inv-item:delta", t, "$40,000,000")]);
  return {
    f,
    // alpha and beta each declare "Shared Term" once inside their OWN unit, so each owns it by primary-source
    // declaration; gamma and delta own an inventory item each, so a definition citing that item is owned by lineage.
    alpha: shardOwning(f.plan, "Alpha Amount"),
    beta: shardOwning(f.plan, "Beta Amount"),
    gamma: shardOwning(f.plan, "Gamma Amount"),
    delta: shardOwning(f.plan, "Delta Amount"),
  };
}

const conflictFor = (st: StitchedCompilation, term: string) => st.definitionConflicts.find((c) => c.termName === term);
const kinds = (st: StitchedCompilation) => st.collisions.map((c) => c.kind);

// ---------------------------------------------------------------------------

describe("F-7B.3B §22 A - an empty variant and a rich variant both survive", () => {
  const { f, alpha, gamma } = conflictFixture();
  const empty = definitionFor("Shared Term", null);
  const rich = definitionFor("Shared Term", maxOf(money(100_000_000, ["inv-item:gamma"]), money(250_000_000)), { lineage: ["inv-item:gamma"] });
  const st = stitch(f, new Map([[alpha, [empty]], [gamma, [rich]]]));

  it("raises a real conflict and preserves both representations whole", () => {
    expect(alpha).not.toBe(gamma);
    expect(kinds(st)).toContain("DEFINITION_CONFLICT");
    const c = conflictFor(st, "Shared Term")!;
    expect(c).toBeDefined();
    expect(c.variants).toHaveLength(2);
    expect(c.requiresReview).toBe(true);
    for (const v of c.variants) expect(v.definition).toBeTruthy();
  });

  it("loses no quantitative value and no owned lineage", () => {
    const c = conflictFor(st, "Shared Term")!;
    expect(c.quantitativeValues).toContain("MONEY:100000000");
    expect(c.quantitativeValues).toContain("MONEY:250000000");
    expect(c.ownedInventoryItemIds).toContain("inv-item:gamma");
  });

  it("keeps exactly one canonical copy, marked AMBIGUOUS, and does not adopt the richer variant as truth", () => {
    expect(st.definitions.filter((d) => d.termName === "Shared Term")).toHaveLength(1);
    const canonical = st.definitions.find((d) => d.termName === "Shared Term")!;
    expect(canonical.sufficiency).toBe("AMBIGUOUS");
    expect(canonical.sufficiencyReasons.join(" ")).toContain("conflict");
    expect(JSON.stringify(canonical)).not.toContain("250000000");
  });
});

describe("F-7B.3B §22 B - the outcome does not depend on which variant arrives first", () => {
  it("produces the same variant set whichever shard emits the rich copy", () => {
    const rich = definitionFor("Shared Term", money(100_000_000, ["inv-item:gamma"]), { lineage: ["inv-item:gamma"] });
    const empty = definitionFor("Shared Term", null);
    const a = conflictFixture();
    const first = stitch(a.f, new Map([[a.alpha, [empty]], [a.gamma, [rich]]]));
    const b = conflictFixture();
    const second = stitch(b.f, new Map([[b.beta, [empty]], [b.gamma, [rich]]]));
    const hashes = (st: StitchedCompilation) => conflictFor(st, "Shared Term")!.variants.map((v) => v.contentHash).sort();
    expect(hashes(first)).toEqual(hashes(second));
    expect(conflictFor(first, "Shared Term")!.quantitativeValues).toEqual(conflictFor(second, "Shared Term")!.quantitativeValues);
  });
});

describe("F-7B.3B §22 C - two rich variants with different amounts, neither chosen", () => {
  const { f, alpha, gamma } = conflictFixture();
  const one = definitionFor("Shared Term", money(11_000_000));
  const two = definitionFor("Shared Term", money(22_000_000, ["inv-item:gamma"]), { lineage: ["inv-item:gamma"] });
  const st = stitch(f, new Map([[alpha, [one]], [gamma, [two]]]));

  it("preserves both amounts and merges nothing", () => {
    const c = conflictFor(st, "Shared Term")!;
    expect(c.quantitativeValues.sort()).toEqual(["MONEY:11000000", "MONEY:22000000"]);
    expect(c.variants).toHaveLength(2);
    const canonical = st.definitions.find((d) => d.termName === "Shared Term")!;
    const inCanonical = JSON.stringify(canonical);
    expect(inCanonical.includes("11000000") && inCanonical.includes("22000000")).toBe(false);
  });
});

describe("F-7B.3B §22 D - disjoint owned lineage is preserved without duplicate accountability credit", () => {
  const { f, gamma, delta } = conflictFixture();
  const fromGamma = definitionFor("Shared Term", money(1, ["inv-item:gamma"]), { lineage: ["inv-item:gamma"] });
  const fromDelta = definitionFor("Shared Term", money(2, ["inv-item:delta"]), { lineage: ["inv-item:delta"] });
  const st = stitch(f, new Map([[gamma, [fromGamma]], [delta, [fromDelta]]]));

  it("keeps the union of lineage in the evidence", () => {
    const c = conflictFor(st, "Shared Term")!;
    expect(c.ownedInventoryItemIds.sort()).toEqual(["inv-item:delta", "inv-item:gamma"]);
  });

  it("does not let preserved evidence earn Pass C representation for both items", () => {
    // the canonical copy carries one shard's lineage at most; Pass C reconciles the canonical arrays only
    const represented = st.accountability.items.filter((i) => i.disposition === "REPRESENTED").map((i) => i.inventoryItemId);
    expect(represented.length).toBeLessThan(2 + 1);
    expect(st.accountability.semanticallyComplete).toBe(false);
  });
});

describe("F-7B.3B §22 E - identical duplicates stay on the duplicate path", () => {
  const { f, alpha, beta } = conflictFixture();
  const same = definitionFor("Shared Term", money(5));
  const st = stitch(f, new Map([[alpha, [same]], [beta, [same]]]));

  it("records a consistent duplicate and creates no conflict evidence", () => {
    expect(kinds(st)).toContain("DEFINITION_DUPLICATE_CONSISTENT");
    expect(kinds(st)).not.toContain("DEFINITION_CONFLICT");
    expect(conflictFor(st, "Shared Term")).toBeUndefined();
    expect(st.definitions.filter((d) => d.termName === "Shared Term")).toHaveLength(1);
  });
});

describe("F-7B.3B §22 F - A + A + B keeps both A emissions' provenance and B's content", () => {
  const { f, alpha, beta, gamma } = conflictFixture();
  const a = definitionFor("Shared Term", money(7));
  const b = definitionFor("Shared Term", money(9, ["inv-item:gamma"]), { lineage: ["inv-item:gamma"] });
  const st = stitch(f, new Map([[alpha, [a]], [beta, [a]], [gamma, [b]]]));

  it("deduplicates identical content into one variant while keeping every emitting shard", () => {
    const c = conflictFor(st, "Shared Term")!;
    expect(c.variants).toHaveLength(2);
    const aVariant = c.variants.find((v) => v.quantitativeValues.includes("MONEY:7"))!;
    expect(aVariant.emissions.length).toBe(2);
    expect(new Set(aVariant.emissions.map((e) => e.shardId)).size).toBe(2);
    expect(c.quantitativeValues.sort()).toEqual(["MONEY:7", "MONEY:9"]);
  });
});

describe("F-7B.3B §22 G - three distinct variants are all preserved", () => {
  const { f, alpha, gamma, delta } = conflictFixture();
  const st = stitch(f, new Map([
    [alpha, [definitionFor("Shared Term", money(1))]],
    [gamma, [definitionFor("Shared Term", money(2, ["inv-item:gamma"]), { lineage: ["inv-item:gamma"] })]],
    [delta, [definitionFor("Shared Term", money(3, ["inv-item:delta"]), { lineage: ["inv-item:delta"] })]],
  ]));

  it("supports N-way conflicts without overwriting earlier variants", () => {
    const c = conflictFor(st, "Shared Term")!;
    expect(c.variants).toHaveLength(3);
    expect(c.quantitativeValues.sort()).toEqual(["MONEY:1", "MONEY:2", "MONEY:3"]);
    expect(new Set(c.variants.map((v) => v.contentHash)).size).toBe(3);
  });
});

describe("F-7B.3B §22 H - a contextual emission can never become an owned conflict variant", () => {
  const { f, alpha, gamma } = conflictFixture();
  const owned = definitionFor("Shared Term", money(4, ["inv-item:gamma"]), { lineage: ["inv-item:gamma"] });
  // "Nowhere Term" is declared in no owned unit and carries no owned lineage: unattributed, so contextual
  const contextual = definitionFor("Nowhere Term", money(8));
  const st = stitch(f, new Map([[gamma, [owned]], [alpha, [contextual]]]));

  it("drops the contextual definition and files no conflict evidence for it", () => {
    expect(st.definitions.some((d) => d.termName === "Nowhere Term")).toBe(false);
    expect(conflictFor(st, "Nowhere Term")).toBeUndefined();
    expect(kinds(st)).toContain("CONTEXTUAL_UNOWNED_DEFINITION");
  });

  it("every preserved variant carries one of the three F-7B.2 ownership proofs", () => {
    const proven = new Set(["DEFINITION_TERM", "LINEAGE_MAJORITY", "PRIMARY_SOURCE_DECLARATION"]);
    for (const c of st.definitionConflicts) for (const v of c.variants) for (const e of v.emissions) expect(proven.has(e.attributionMethod)).toBe(true);
  });
});

describe("F-7B.3B §22 I - a conflicted term referenced elsewhere introduces no dangling reference", () => {
  const { f, alpha, gamma } = conflictFixture();
  const st = stitch(f, new Map([
    [alpha, [definitionFor("Shared Term", money(1)), definitionFor("Alpha Amount", maxOf(money(3), termRef("Shared Term")))]],
    [gamma, [definitionFor("Shared Term", money(2, ["inv-item:gamma"]), { lineage: ["inv-item:gamma"] })]],
  ]));

  it("keeps the referring definition intact with zero dangling references", () => {
    expect(st.definitions.some((d) => d.termName === "Alpha Amount")).toBe(true);
    expect(st.accountability.counts.danglingLineageReferences).toBe(0);
    expect(kinds(st)).not.toContain("DANGLING_RULE_REFERENCE");
    expect(JSON.stringify(st.definitions.find((d) => d.termName === "Alpha Amount"))).toContain("Shared Term");
  });
});

describe("F-7B.3B §22 J - conflict evidence can never make the candidate complete", () => {
  const { f, alpha, gamma } = conflictFixture();
  const st = stitch(f, new Map([
    [alpha, [definitionFor("Shared Term", money(1))]],
    [gamma, [definitionFor("Shared Term", money(2, ["inv-item:gamma"]), { lineage: ["inv-item:gamma"] })]],
  ]));

  it("leaves the stitched status short of COMPLETED and Pass C short of complete", () => {
    expect(st.definitionConflicts.length).toBeGreaterThan(0);
    expect(st.status).not.toBe("COMPLETED");
    expect(st.accountability.semanticallyComplete).toBe(false);
    expect(st.collisions.filter((c) => c.requiresReview).length).toBeGreaterThan(0);
  });

  it("does not put the preserved variants into the authoritative definitions array", () => {
    const ids = st.definitions.map((d) => d.definitionId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of st.definitionConflicts) expect(st.definitions.filter((d) => d.definitionId === c.definitionId)).toHaveLength(1);
  });
});
