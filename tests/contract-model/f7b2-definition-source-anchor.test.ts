/**
 * F-7B.2 §20 - source-anchored definition attribution: the safety matrix A-J.
 *
 * Every case is synthetic and generic (no real agreement text, no package-specific term) and runs with zero model
 * calls: each "shard compilation" is a scripted emitter. What is under test is the stitcher's attribution decision -
 * which model-emitted definitions may enter authoritative IR, and on what evidence.
 *
 * The invariant (mission §4): a definition enters the stitched IR only with at least one of three affirmative proofs -
 *   1. PLANNER_DEFINITION_UNIT          - its term is a planner DEFINITION unit this shard owns;
 *   2. OWNED_INVENTORY_LINEAGE          - it carries lineage to inventory items this shard owns;
 *   3. UNIQUE_PRIMARY_SOURCE_DECLARATION- its term is declared exactly once in this shard's own primary source.
 * Shard position alone ("the model emitted it here") is no longer evidence of anything.
 */
import { describe, expect, it } from "vitest";
import { planCompilationShards } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { stitchShardResults } from "../../lib/contract-model/compiler/semantic/shard-stitcher";
import { buildOwnedDeclarationIndex, locateDefinitionDeclaration } from "../../lib/contract-model/compiler/semantic/definition-source-anchor";
import type { ShardExecutionResult, ShardPlan, StitchedCompilation } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../../lib/contract-model/compiler/semantic-accountability/types";
import { buildTestIndex } from "./context-retrieval-test-utils";
import { definitionFor, maxOf, money, termRef, CO, INST, DOC } from "./f7a-synthetic-corpus";

const BUDGET = { targetPrimaryChars: 400, maxPrimaryChars: 100_000, maxContextChars: 8_000, maxContextEntryChars: 1_200, maxUnitsPerShard: 2 };
const CAND = "cand:1.01";

interface Fixture { plan: ShardPlan; inventory: FrozenSemanticInventory; regions: { regionId: string; text: string }[]; regionText: string }

/**
 * Builds a one-section definitions corpus from explicit lines, so each case controls its own source text exactly.
 * `items` receives the region text and returns the frozen inventory items (lineage targets) for that case.
 */
function fixture(lines: string[], items: (regionText: string) => SemanticInventoryItem[] = () => [], budget = BUDGET): Fixture {
  // a short heading keeps the definitions' share of the region above the planner's definition-corpus coverage floor
  const text = ["SECTION 1.01. Defined Terms .", ...lines].join("\n");
  const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
  const section = index.resolveUniqueNodeByRef(DOC, "1.01");
  if (section.status !== "UNIQUE") throw new Error("fixture: section 1.01 not unique");
  const regionText = index.getNodeText(section.node.nodeId, "DESCENDANTS");
  const sourceContext: SourceContextResult = { state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: DOC, sourceNodeId: section.node.nodeId, sectionRef: "1.01", charStart: section.node.charStart, charEnd: section.node.charStart + regionText.length, text: regionText, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: regionText.length, budgetChars: 24_000 };
  const inventoryItems = items(regionText);
  const inventory: FrozenSemanticInventory = { candidateRef: CAND, items: inventoryItems, uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "synthetic", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0, sourceContextState: "COMPLETE_LOCAL_SOURCE", frozenContentHash: `frozen:${CAND}:${inventoryItems.length}`, frozenAt: "2026-01-01T00:00:00.000Z", algorithmVersion: "semantic-accountability.v5", promptVersion: "semantic-inventory-prompt.v5", provider: "synthetic", model: "synthetic", telemetryCostUsd: null };
  const plan = planCompilationShards({ candidateRef: CAND, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext, frozenInventory: inventory, structuralIndex: index, budget, generation: { algorithmVersion: "alg.v1", promptVersion: "prompt.v1" } });
  return { plan, inventory, regions: [{ regionId: "operative", text: regionText }], regionText };
}

function invItem(id: string, regionText: string, needle: string, extra: Partial<SemanticInventoryItem> = {}): SemanticInventoryItem {
  const at = regionText.indexOf(needle);
  if (at < 0) throw new Error(`fixture: inventory anchor "${needle}" not found`);
  return { inventoryItemId: id, sourceSpan: { regionId: "operative", documentId: DOC, sourceNodeId: null, sectionRef: "1.01", charStart: at, charEnd: at + needle.length, sourceCitation: "§1.01", excerpt: needle }, semanticRole: "THRESHOLD", proposition: `proposition ${id}`, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentItemId: null, relatedItemIds: [], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: "DEFINITIONAL", detectionMethod: "MODEL", ...extra };
}

function ok(shardId: string, shardHash: string, composition: ShardExecutionResult["composition"]): ShardExecutionResult {
  return { shardId, shardHash, status: "SHARD_COMPLETE", composition, failureReasons: [], unresolvedIssues: [], reusedFromHash: false, attempts: 1, telemetry: null };
}

/** Stitches with the primary-source proof class available (production passes the same region texts). */
function stitch(f: Fixture, emissions: Map<string, ReturnType<typeof composition>>): StitchedCompilation {
  const results = f.plan.shards.map((s) => ok(s.shardId, s.shardHash, emissions.get(s.shardId) ?? { rules: [], definitions: [], sharedCapacities: [], inventoryDispositions: [] }));
  return stitchShardResults({ plan: f.plan, results, frozenInventory: f.inventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: CAND, sourceRegions: f.regions });
}

const composition = (definitions: ReturnType<typeof definitionFor>[]) => ({ rules: [], definitions, sharedCapacities: [], inventoryDispositions: [] });

/** The shard that owns the planner DEFINITION unit for `term`. */
function shardOwning(plan: ShardPlan, term: string): string {
  const unit = plan.units.find((u) => u.kind === "DEFINITION" && u.normalizedTermName === term.toLowerCase());
  if (!unit) throw new Error(`fixture: no planner DEFINITION unit for ${term}`);
  return plan.unitOwnerShard[unit.unitKey]!;
}

const attributionOf = (st: StitchedCompilation, term: string) => st.definitionAttribution.find((a) => a.termName === term);
const retainedTerms = (st: StitchedCompilation) => st.definitions.map((d) => d.termName).sort();
const kinds = (st: StitchedCompilation) => st.collisions.map((c) => c.kind);

// ---------------------------------------------------------------------------

describe("F-7B.2 §20 A - a nested definition declared inside the shard's own unit is anchored, not guessed", () => {
  const f = fixture([
    `“Alpha Amount” means the greater of (a) $10,000,000 and (b) 5% of Consolidated EBITDA determined on the Measurement Basis, and “Measurement Basis” has the meaning assigned to such term in Section 6.01(a).`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
  ]);
  const owner = shardOwning(f.plan, "Alpha Amount");
  const st = stitch(f, new Map([[owner, composition([definitionFor("Alpha Amount", money(10_000_000)), definitionFor("Measurement Basis", money(1))])]]));

  it("retains the nested definition and attributes it to the ENCLOSING owned unit, with a real source anchor", () => {
    expect(retainedTerms(st)).toContain("Measurement Basis");
    const att = attributionOf(st, "Measurement Basis")!;
    expect(att.method).toBe("PRIMARY_SOURCE_DECLARATION");
    expect(att.unitKey).toBe(f.plan.units.find((u) => u.normalizedTermName === "alpha amount")!.unitKey);
    expect(att.anchor).not.toBeNull();
    expect(att.anchor!.method).toBe("UNIQUE_PRIMARY_SOURCE_DECLARATION");
    expect(f.regionText.slice(att.anchor!.charStart + f.plan.units.find((u) => u.normalizedTermName === "alpha amount")!.charStart, att.anchor!.charEnd + f.plan.units.find((u) => u.normalizedTermName === "alpha amount")!.charStart)).toContain("Measurement Basis");
  });

  it("creates no planner unit for the nested term - the frozen plan is untouched", () => {
    expect(f.plan.units.some((u) => u.normalizedTermName === "measurement basis")).toBe(false);
  });

  it("publishes the anchor as stitcher/audit metadata, never inside the IR definition object", () => {
    expect(st.definitionSourceAnchors.some((a) => a.normalizedTermName === "measurement basis")).toBe(true);
    const ir = st.definitions.find((d) => d.termName === "Measurement Basis")!;
    expect(JSON.stringify(ir)).not.toContain("UNIQUE_PRIMARY_SOURCE_DECLARATION");
    expect(Object.keys(ir)).not.toContain("sourceAnchor");
  });
});

describe("F-7B.2 §20 B - a definition seen only in read-only context can never be owned", () => {
  const f = fixture([
    `“Alpha Amount” means an amount equal to $10,000,000 for the applicable period.`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
    `“Gamma Amount” means an amount equal to $30,000,000 for the applicable period.`,
    `“Delta Amount” means an amount equal to $40,000,000 for the applicable period.`,
  ]);
  // the shard that owns Alpha emits a definition for a term declared in ANOTHER shard's primary text
  const owner = shardOwning(f.plan, "Alpha Amount");
  const foreign = "Delta Amount";
  const st = stitch(f, new Map([[owner, composition([definitionFor(foreign, money(40_000_000))])]]));

  it("drops it, records CONTEXTUAL_UNOWNED_DEFINITION or non-owner emission, and never credits the emitting shard", () => {
    expect(retainedTerms(st)).not.toContain(foreign);
    expect(st.contextualEmissions.some((e) => e.kind === "DEFINITION")).toBe(true);
    expect(kinds(st).some((k) => k === "CONTEXTUAL_UNOWNED_DEFINITION" || k === "DEFINITION_EMITTED_BY_NON_OWNER")).toBe(true);
  });

  it("the locator refuses it too: the term is not declared in the emitting shard's owned source", () => {
    const shard = f.plan.shards.find((s) => s.shardId === owner)!;
    const units = shard.ownedUnitKeys.map((k) => f.plan.units.find((u) => u.unitKey === k)!);
    const index = buildOwnedDeclarationIndex(units.map((u) => ({ unitKey: u.unitKey, documentId: u.documentId, regionId: u.regionId, text: f.regionText.slice(u.charStart, u.charEnd), charStart: u.charStart, charEnd: u.charEnd, absCharStart: u.absCharStart })));
    expect(locateDefinitionDeclaration(foreign, index).status).toBe("NOT_DECLARED_IN_OWNED_SOURCE");
  });
});

describe("F-7B.2 §20 C - a term owned by another shard's planner unit stays with its owner", () => {
  const f = fixture([
    `“Alpha Amount” means an amount equal to $10,000,000 for the applicable period.`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
    `“Gamma Amount” means an amount equal to $30,000,000 for the applicable period.`,
    `“Delta Amount” means an amount equal to $40,000,000 for the applicable period.`,
  ]);
  const alphaShard = shardOwning(f.plan, "Alpha Amount");
  const deltaShard = shardOwning(f.plan, "Delta Amount");
  const st = stitch(f, new Map([
    [alphaShard, composition([definitionFor("Alpha Amount", money(10_000_000)), definitionFor("Delta Amount", money(99))])],
    [deltaShard, composition([definitionFor("Delta Amount", money(40_000_000))])],
  ]));

  it("keeps only the owner's copy; the non-owner copy is a contextual emission", () => {
    expect(alphaShard).not.toBe(deltaShard);
    expect(st.definitions.filter((d) => d.termName === "Delta Amount")).toHaveLength(1);
    expect(kinds(st)).toContain("DEFINITION_EMITTED_BY_NON_OWNER");
    expect(st.definitionAttribution.filter((a) => a.termName === "Delta Amount" && !a.retained)).toHaveLength(1);
  });
});

describe("F-7B.2 §20 D - two declarations of the same term in owned source is an ambiguity, never a first match", () => {
  const f = fixture([
    `“Alpha Amount” means the amount determined on the applicable basis, and “Shared Basis” has the meaning assigned to such term in Section 6.01(a).`,
    `“Beta Amount” means the amount determined on the applicable basis, and “Shared Basis” has the meaning assigned to such term in Section 6.02(b).`,
  ], () => [], { ...BUDGET, maxUnitsPerShard: 8 });
  const owner = shardOwning(f.plan, "Alpha Amount");
  const st = stitch(f, new Map([[owner, composition([definitionFor("Shared Basis", money(1))])]]));

  it("drops the emission and raises an explicit review collision naming both candidates", () => {
    expect(shardOwning(f.plan, "Beta Amount")).toBe(owner);
    expect(retainedTerms(st)).not.toContain("Shared Basis");
    const c = st.collisions.find((x) => x.kind === "DEFINITION_ATTRIBUTION_AMBIGUOUS")!;
    expect(c).toBeDefined();
    expect(c.requiresReview).toBe(true);
    expect(attributionOf(st, "Shared Basis")!.method).toBe("AMBIGUOUS_PRIMARY_SOURCE");
  });
});

describe("F-7B.2 §20 E - a mention of a term is not a definition of it", () => {
  const f = fixture([
    `“Alpha Amount” means an amount equal to $10,000,000 calculated on a “Measurement Basis” as described in Section 6.01 and excluding any Beta Reference.`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
  ]);
  const owner = shardOwning(f.plan, "Alpha Amount");
  const st = stitch(f, new Map([[owner, composition([definitionFor("Measurement Basis", money(1)), definitionFor("Beta Reference", money(2))])]]));

  it("refuses both: a quoted term with no definitional grammar, and a bare capitalized mention", () => {
    expect(retainedTerms(st)).not.toContain("Measurement Basis");
    expect(retainedTerms(st)).not.toContain("Beta Reference");
    for (const t of ["Measurement Basis", "Beta Reference"]) {
      expect(attributionOf(st, t)!.method).toBe("UNATTRIBUTED");
      expect(attributionOf(st, t)!.unitKey).toBeNull();
    }
    expect(kinds(st).filter((k) => k === "CONTEXTUAL_UNOWNED_DEFINITION")).toHaveLength(2);
  });
});

describe("F-7B.2 §20 F - owned inventory lineage alone still retains a definition (no locator needed)", () => {
  const f = fixture([
    `“Alpha Amount” means an amount equal to $10,000,000 plus the Retained Excess described in this clause.`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
  ], (t) => [invItem("inv-item:alpha", t, "$10,000,000")]);
  const owner = shardOwning(f.plan, "Alpha Amount");
  const st = stitch(f, new Map([[owner, composition([definitionFor("Retained Excess", money(1, ["inv-item:alpha"]), { lineage: ["inv-item:alpha"] })])]]));

  it("attributes it by lineage to the unit that owns the cited inventory item", () => {
    expect(retainedTerms(st)).toContain("Retained Excess");
    const att = attributionOf(st, "Retained Excess")!;
    expect(att.method).toBe("LINEAGE_MAJORITY");
    expect(att.unitKey).toBe(f.plan.itemOwnerUnit["inv-item:alpha"]);
    expect(att.anchor).toBeNull();
  });
});

describe("F-7B.2 §20 G - term unit and lineage disagreeing is surfaced, never silently reconciled", () => {
  const f = fixture([
    `“Alpha Amount” means an amount equal to $10,000,000 for the applicable period.`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
  ], (t) => [invItem("inv-item:beta", t, "$20,000,000")], { ...BUDGET, maxUnitsPerShard: 8 });
  const owner = shardOwning(f.plan, "Alpha Amount");
  // the emitted definition IS the planner term "Alpha Amount" but cites lineage owned by the Beta unit
  const st = stitch(f, new Map([[owner, composition([definitionFor("Alpha Amount", money(10_000_000, ["inv-item:beta"]), { lineage: ["inv-item:beta"] })])]]));

  it("uses the term-unit proof (precedence) and records an explicit conflict for review", () => {
    expect(shardOwning(f.plan, "Beta Amount")).toBe(owner);
    const att = attributionOf(st, "Alpha Amount")!;
    expect(att.method).toBe("DEFINITION_TERM");
    expect(att.unitKey).toBe(f.plan.units.find((u) => u.normalizedTermName === "alpha amount")!.unitKey);
    const c = st.collisions.find((x) => x.kind === "DEFINITION_ATTRIBUTION_CONFLICT")!;
    expect(c).toBeDefined();
    expect(c.requiresReview).toBe(true);
    expect(retainedTerms(st)).toContain("Alpha Amount");
  });
});

describe("F-7B.2 §20 H - dropping an unowned definition leaves no dangling reference behind", () => {
  const f = fixture([
    `“Alpha Amount” means an amount equal to the greater of $10,000,000 and the Foreign Measure for the period.`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
    `“Gamma Amount” means an amount equal to $30,000,000 for the applicable period.`,
    `“Delta Amount” means an amount equal to $40,000,000 for the applicable period.`,
  ]);
  const owner = shardOwning(f.plan, "Alpha Amount");
  const st = stitch(f, new Map([[owner, composition([
    definitionFor("Alpha Amount", maxOf(money(10_000_000), termRef("Delta Amount"))),
    definitionFor("Delta Amount", money(40_000_000)),
  ])]]));

  it("keeps the owned definition and its by-name reference intact, with zero dangling id references", () => {
    expect(retainedTerms(st)).toContain("Alpha Amount");
    expect(st.definitions.filter((d) => d.termName === "Delta Amount")).toHaveLength(0);
    expect(st.accountability.counts.danglingLineageReferences).toBe(0);
    expect(kinds(st)).not.toContain("DANGLING_RULE_REFERENCE");
    const alpha = st.definitions.find((d) => d.termName === "Alpha Amount")!;
    expect(JSON.stringify(alpha)).toContain("Delta Amount");
  });

  it("does not report completeness it cannot prove: the dropped emission is visible for review", () => {
    expect(st.collisions.filter((c) => c.requiresReview).length).toBeGreaterThan(0);
    expect(st.unresolvedIssues.join(" ")).toContain("Delta Amount");
  });
});

describe("F-7B.2 §20 I - the same nested definition emitted twice with identical content yields one authoritative copy", () => {
  const f = fixture([
    `“Alpha Amount” means the amount determined on the applicable basis, and “Measurement Basis” has the meaning assigned to such term in Section 6.01(a).`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
  ], () => [], { ...BUDGET, maxUnitsPerShard: 8 });
  const owner = shardOwning(f.plan, "Alpha Amount");
  const twice = definitionFor("Measurement Basis", money(1));
  const st = stitch(f, new Map([[owner, composition([twice, twice])]]));

  it("keeps exactly one and marks the duplicate as consistent, not as a conflict", () => {
    expect(st.definitions.filter((d) => d.termName === "Measurement Basis")).toHaveLength(1);
    expect(kinds(st)).toContain("DEFINITION_DUPLICATE_CONSISTENT");
    expect(kinds(st)).not.toContain("DEFINITION_CONFLICT");
  });
});

describe("F-7B.2 §20 J - the same nested definition emitted twice with different content is an explicit conflict", () => {
  const f = fixture([
    `“Alpha Amount” means the amount determined on the applicable basis, and “Measurement Basis” has the meaning assigned to such term in Section 6.01(a).`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
  ], () => [], { ...BUDGET, maxUnitsPerShard: 8 });
  const owner = shardOwning(f.plan, "Alpha Amount");
  const st = stitch(f, new Map([[owner, composition([definitionFor("Measurement Basis", money(1)), definitionFor("Measurement Basis", money(2))])]]));

  it("keeps one copy, flags DEFINITION_CONFLICT for review and never silently reconciles the two", () => {
    expect(st.definitions.filter((d) => d.termName === "Measurement Basis")).toHaveLength(1);
    const c = st.collisions.find((x) => x.kind === "DEFINITION_CONFLICT")!;
    expect(c).toBeDefined();
    expect(c.requiresReview).toBe(true);
  });
});

describe("F-7B.2 §5 - the SHARD_FIRST_UNIT fallback no longer exists for definitions", () => {
  it("is absent from the stitcher's definition path", () => {
    const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../lib/contract-model/compiler/semantic/shard-stitcher.ts"), "utf-8") as string;
    const attributeDefinition = src.slice(src.indexOf("function attributeDefinition"), src.indexOf("function attributeDefinition") + 2_500);
    expect(attributeDefinition).not.toContain("SHARD_FIRST_UNIT");
  });

  it("every retained definition in every case above carries at least one of the three proof classes", () => {
    const f = fixture([
      `“Alpha Amount” means the amount determined on the applicable basis, and “Measurement Basis” has the meaning assigned to such term in Section 6.01(a).`,
      `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
    ], (t) => [invItem("inv-item:beta", t, "$20,000,000")], { ...BUDGET, maxUnitsPerShard: 8 });
    const owner = shardOwning(f.plan, "Alpha Amount");
    const st = stitch(f, new Map([[owner, composition([
      definitionFor("Alpha Amount", money(1)),
      definitionFor("Measurement Basis", money(2)),
      definitionFor("Residual Amount", money(3, ["inv-item:beta"]), { lineage: ["inv-item:beta"] }),
      definitionFor("Unproven Amount", money(4)),
    ])]]));
    const proven = new Set(["DEFINITION_TERM", "LINEAGE_MAJORITY", "PRIMARY_SOURCE_DECLARATION"]);
    for (const d of st.definitions) expect(proven.has(attributionOf(st, d.termName)!.method)).toBe(true);
    expect(retainedTerms(st)).not.toContain("Unproven Amount");
  });
});
