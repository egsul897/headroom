/**
 * F-7B.3D §12 - the F-7 trust scorer must score the CURRENT architecture: F-7B.2 source-anchored attribution and
 * F-7B.3B first-class conflict evidence. Synthetic, generic, zero model calls.
 *
 * The scorer's job is to say whether source-backed OWNED evidence survived stitching. It is not Pass C and must never
 * become Pass C: a value preserved in conflict evidence is preserved, and the conflict is still unresolved.
 */
import { describe, expect, it } from "vitest";
import { census, scoreCanary } from "../../scripts/f7b-score";
import { planCompilationShards } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { stitchShardResults } from "../../lib/contract-model/compiler/semantic/shard-stitcher";
import type { ShardExecutionResult, ShardPlan, StitchedCompilation } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../../lib/contract-model/compiler/semantic-accountability/types";
import type { Frozen, ShardRecord } from "../../scripts/f7b-lib";
import { buildTestIndex } from "./context-retrieval-test-utils";
import { definitionFor, money, CO, INST, DOC } from "./f7a-synthetic-corpus";

const CAND = "cand:1.01";
const BUDGET = { targetPrimaryChars: 400, maxPrimaryChars: 100_000, maxContextChars: 8_000, maxContextEntryChars: 1_200, maxUnitsPerShard: 1 };

function fixture(lines: string[], items: (t: string) => SemanticInventoryItem[] = () => []) {
  const text = ["SECTION 1.01. Defined Terms .", ...lines].join("\n");
  const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
  const section = index.resolveUniqueNodeByRef(DOC, "1.01");
  if (section.status !== "UNIQUE") throw new Error("fixture: section not unique");
  const regionText = index.getNodeText(section.node.nodeId, "DESCENDANTS");
  const sourceContext: SourceContextResult = { state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: DOC, sourceNodeId: section.node.nodeId, sectionRef: "1.01", charStart: section.node.charStart, charEnd: section.node.charStart + regionText.length, text: regionText, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: regionText.length, budgetChars: 24_000 };
  const inventoryItems = items(regionText);
  const inventory: FrozenSemanticInventory = { candidateRef: CAND, items: inventoryItems, uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "synthetic", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0, sourceContextState: "COMPLETE_LOCAL_SOURCE", frozenContentHash: `frozen:${CAND}:${inventoryItems.length}`, frozenAt: "2026-01-01T00:00:00.000Z", algorithmVersion: "v5", promptVersion: "v5", provider: "synthetic", model: "synthetic", telemetryCostUsd: null };
  const plan = planCompilationShards({ candidateRef: CAND, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext, frozenInventory: inventory, structuralIndex: index, budget: BUDGET, generation: { algorithmVersion: "alg.v1", promptVersion: "prompt.v1" } });
  const frozen = { chewy: { index } as never, unit: {} as never, callerInput: { candidateRef: CAND, companyId: CO, instrumentKey: INST, sourceContext, frozenInventory: inventory } as never, plan, identity: {} } as unknown as Frozen;
  return { frozen, plan, inventory, regions: [{ regionId: "operative", text: regionText }], regionText };
}

function invItem(id: string, regionText: string, needle: string): SemanticInventoryItem {
  const at = regionText.indexOf(needle);
  if (at < 0) throw new Error(`fixture: "${needle}" not found`);
  return { inventoryItemId: id, sourceSpan: { regionId: "operative", documentId: DOC, sourceNodeId: null, sectionRef: "1.01", charStart: at, charEnd: at + needle.length, sourceCitation: "§1.01", excerpt: needle }, semanticRole: "THRESHOLD", proposition: `p ${id}`, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentItemId: null, relatedItemIds: [], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: "DEFINITIONAL", detectionMethod: "MODEL" };
}

const ok = (shardId: string, shardHash: string, definitions: ReturnType<typeof definitionFor>[]): ShardExecutionResult =>
  ({ shardId, shardHash, status: "SHARD_COMPLETE", composition: { rules: [], definitions, sharedCapacities: [], inventoryDispositions: [] }, failureReasons: [], unresolvedIssues: [], reusedFromHash: false, attempts: 1, telemetry: null });

const rec = (shardId: string): ShardRecord => ({ stage: 2, attempt: 1, shardId, shardHash: "h", ordinal: 0, ownedUnits: 1, sourceChars: 1, contextEntries: 0, contextChars: 0, unresolvedContext: 0, oversized: false, ownedItems: 0, ownedMaterialItems: 0, estimatedFirstTurnInputTokens: 1, preCallEstimate: { inputTokens: 1, outputTokens: 1, usd: 0 }, actual: { inputTokens: 1, outputTokens: 1, turns: 1, latencyMs: 1, costUsd: 0, attemptCount: 1, retryCount: 0, rateLimitFailures: 0 }, compileStatus: "COMPLETED", shardStatus: "SHARD_COMPLETE", failureReasons: [], toolCalls: 0, toolCallNames: [], rawSubmissionRetained: true, rules: 0, definitions: 0, sharedCapacities: 0, dispositionsEmitted: 0, ownedAccountability: { represented: 0, dispositioned: 0, missingMaterial: 0, valuesRepresented: 0, valuesMissing: 0, danglingLineage: 0, semanticallyComplete: false, byDisposition: {} }, lineageClaimsOnUnownedItems: 0, definitionsOutsideOwnedUnits: [], unresolvedIssues: [], errorSummary: null, transportNormalization: null } as unknown as ShardRecord);

function run(f: ReturnType<typeof fixture>, byShard: Map<string, ReturnType<typeof definitionFor>[]>) {
  const results = f.plan.shards.map((s) => ok(s.shardId, s.shardHash, byShard.get(s.shardId) ?? []));
  const stitched = stitchShardResults({ plan: f.plan, results, frozenInventory: f.inventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: CAND, sourceRegions: f.regions });
  const score = scoreCanary(f.frozen, results, results.map((r) => rec(r.shardId)), stitched, []);
  return { stitched, score };
}

function shardOwning(plan: ShardPlan, term: string): string {
  const unit = plan.units.find((u) => u.kind === "DEFINITION" && u.normalizedTermName === term.toLowerCase());
  if (!unit) throw new Error(`no unit for ${term}`);
  return plan.unitOwnerShard[unit.unitKey]!;
}

/** Two owner shards that each earn ownership of "Shared Term" by a DIFFERENT proof, so a real conflict is possible. */
function conflictFixture() {
  const f = fixture([
    `“Alpha Amount” means an amount determined on the applicable basis, and “Shared Term” has the meaning assigned to such term in Section 6.01(a).`,
    `“Beta Amount” means an amount equal to $20,000,000 for the applicable period.`,
    `“Gamma Amount” means an amount equal to $30,000,000 for the applicable period.`,
  ], (t) => [invItem("inv-item:beta", t, "$20,000,000"), invItem("inv-item:gamma", t, "$30,000,000")]);
  return { f, alpha: shardOwning(f.plan, "Alpha Amount"), beta: shardOwning(f.plan, "Beta Amount"), gamma: shardOwning(f.plan, "Gamma Amount") };
}

// ---------------------------------------------------------------------------

describe("F-7B.3D §12 A - a value in the canonical definition is preserved", () => {
  it("reports no loss when the value survives in the authoritative array", () => {
    const { f, beta } = conflictFixture();
    const { score } = run(f, new Map([[beta, [definitionFor("Beta Amount", money(20_000_000, ["inv-item:beta"]), { lineage: ["inv-item:beta"] })]]]));
    expect(score.B.valuesLostByStitching).toBe(0);
  });
});

describe("F-7B.3D §12 B - a value only in a conflict variant is preserved, and the conflict stays unresolved", () => {
  const { f, alpha, beta } = conflictFixture();
  const { stitched, score } = run(f, new Map([
    [alpha, [definitionFor("Shared Term", null)]],
    [beta, [definitionFor("Shared Term", money(77_000_000, ["inv-item:beta"]), { lineage: ["inv-item:beta"] })]],
  ]));

  it("counts the conflict variant as preservation", () => {
    expect(score.B.valuesLostByStitching).toBe(0);
    expect(score.B.valuesPreservedOnlyByConflictEvidence).toBeGreaterThan(0);
    expect(score.B.valuesLostBeforeConflictEvidenceDiagnostic).toBeGreaterThan(0);
  });

  it("does not call the conflict resolved", () => {
    expect(stitched.definitionConflicts.length).toBe(1);
    expect(stitched.definitionConflicts[0]!.requiresReview).toBe(true);
    expect(stitched.definitions.find((d) => d.termName === "Shared Term")!.sufficiency).toBe("AMBIGUOUS");
    expect(stitched.accountability.semanticallyComplete).toBe(false);
  });
});

describe("F-7B.3D §12 C - a value only in a contextual emission does not satisfy owned preservation", () => {
  it("keeps contextual evidence out of the owned-preservation metric", () => {
    const { f, alpha } = conflictFixture();
    const { stitched, score } = run(f, new Map([[alpha, [definitionFor("Nowhere Term", money(5_000_000))]]]));
    expect(stitched.definitions.some((d) => d.termName === "Nowhere Term")).toBe(false);
    expect(stitched.contextualEmissions.length).toBeGreaterThan(0);
    // the contextual value is neither counted as preserved owned evidence nor reported as an owned loss
    expect(score.B.valuesLostByStitching).toBe(0);
    expect(score.B.valuesOnlyInDroppedContextualEmissions).toBeGreaterThan(0);
    // §9: the contextual value is labelled CONTEXTUAL_EXCLUDED, never OWNED_PRESERVED and never OWNED_LOST
    expect(score.B.dispositions.CONTEXTUAL_EXCLUDED).toBeGreaterThan(0);
    expect(score.B.dispositions.OWNED_LOST).toBe(0);
    expect(score.C.dispositions.OWNED_LOST).toBe(0);
    expect(score.C.dispositions.OWNED_PRESERVED).toBe(score.C.ownedLineageDistinctExpected - (score.C.dispositions.OWNED_PRESERVED_IN_CONFLICT_EVIDENCE ?? 0) - (score.C.dispositions.CONTEXTUAL_EXCLUDED ?? 0));
  });
});

describe("F-7B.3D §12 D - digest and inv-item forms are one identity", () => {
  it("does not report a loss when the shard cited a bare digest", () => {
    const { f, beta } = conflictFixture();
    const bare = "beta"; // bare digest form of inv-item:beta
    const { score } = run(f, new Map([[beta, [definitionFor("Beta Amount", money(20_000_000, [bare]), { lineage: [bare] })]]]));
    expect(score.C.ownedLineageDistinctLost).toBe(0);
  });
});

describe("F-7B.3D §12 E - distinct ids gate, occurrences stay diagnostic", () => {
  it("counts one owned item once however many times it is cited", () => {
    const { f, beta } = conflictFixture();
    const many = definitionFor("Beta Amount", money(20_000_000, ["inv-item:beta", "inv-item:beta", "inv-item:beta"]), { lineage: ["inv-item:beta", "inv-item:beta"] });
    const { score } = run(f, new Map([[beta, [many]]]));
    expect(score.C.ownedLineageDistinctExpected).toBe(1);
    expect(score.C.ownedLineageDistinctLost).toBe(0);
    expect(score.C.ownedLineageOccurrencesExpected).toBeGreaterThan(1);
    expect(typeof score.C.ownedLineageOccurrencesLostDiagnostic).toBe("number");
  });
});

describe("F-7B.3D §12 F - lineage in a conflict variant is preserved without Pass-C credit", () => {
  const { f, alpha, gamma } = conflictFixture();
  const { stitched, score } = run(f, new Map([
    [alpha, [definitionFor("Shared Term", null)]],
    [gamma, [definitionFor("Shared Term", money(9, ["inv-item:gamma"]), { lineage: ["inv-item:gamma"] })]],
  ]));

  it("preserves the lineage", () => {
    expect(score.C.ownedLineageDistinctLost).toBe(0);
    expect(score.C.ownedLineageDistinctPreservedOnlyByConflictEvidence).toBeGreaterThan(0);
  });

  it("gives the conflicted item no REPRESENTED credit", () => {
    const item = stitched.accountability.items.find((i) => i.inventoryItemId === "inv-item:gamma");
    expect(item?.disposition).not.toBe("REPRESENTED");
    expect(stitched.accountability.semanticallyComplete).toBe(false);
  });
});

describe("F-7B.3D §12 G - a unique primary-source declaration is source-verifiable", () => {
  it("does not flag an anchored definition as unverifiable", () => {
    const { f, alpha } = conflictFixture();
    const { stitched, score } = run(f, new Map([[alpha, [definitionFor("Shared Term", money(3))]]]));
    expect(stitched.definitions.some((d) => d.termName === "Shared Term")).toBe(true);
    expect(score.H.proofClassCounts.UNIQUE_PRIMARY_SOURCE_DECLARATION).toBeGreaterThan(0);
    expect(score.H.sourceUnverifiableSurviving).toBe(0);
  });
});

describe("F-7B.3D §12 H - unattributed retained IR would be source-unverifiable", () => {
  it("counts a definition with none of the three proofs", () => {
    const { f, alpha } = conflictFixture();
    const { stitched, score } = run(f, new Map([[alpha, [definitionFor("Nowhere Term", money(1))]]]));
    // the stitcher drops it as contextual, so nothing unverifiable survives - the proof classes are what gate retention
    expect(stitched.definitions.some((d) => d.termName === "Nowhere Term")).toBe(false);
    expect(score.H.proofClassCounts.NONE).toBe(0);
    expect(score.H.sourceUnverifiableSurviving).toBe(0);
  });
});

describe("F-7B.3D §12 I - neither conflict variant is chosen as legal truth", () => {
  it("keeps one canonical AMBIGUOUS copy and both variants", () => {
    const { f, alpha, beta } = conflictFixture();
    const { stitched, score } = run(f, new Map([
      [alpha, [definitionFor("Shared Term", money(11))]],
      [beta, [definitionFor("Shared Term", money(22, ["inv-item:beta"]), { lineage: ["inv-item:beta"] })]],
    ]));
    expect(stitched.definitions.filter((d) => d.termName === "Shared Term")).toHaveLength(1);
    expect(stitched.definitions.find((d) => d.termName === "Shared Term")!.sufficiency).toBe("AMBIGUOUS");
    expect(score.H.conflictVariants).toBe(2);
    expect(score.H.conflictsRequiringReview).toBe(1);
  });
});

describe("F-7B.3D §12 J - remove the conflict evidence and the loss metric fails again", () => {
  it("reports the loss when preserved variants are taken away", () => {
    const { f, alpha, beta } = conflictFixture();
    const results = f.plan.shards.map((s) => ok(s.shardId, s.shardHash, s.shardId === alpha ? [definitionFor("Shared Term", null)] : s.shardId === beta ? [definitionFor("Shared Term", money(88_000_000, ["inv-item:beta"]), { lineage: ["inv-item:beta"] })] : []));
    const stitched = stitchShardResults({ plan: f.plan, results, frozenInventory: f.inventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: CAND, sourceRegions: f.regions });
    const withEvidence = scoreCanary(f.frozen, results, results.map((r) => rec(r.shardId)), stitched, []);
    expect(withEvidence.B.valuesLostByStitching).toBe(0);
    // strip the preserved variants: the scorer must go back to reporting a real loss
    const stripped: StitchedCompilation = { ...stitched, definitionConflicts: [] };
    const without = scoreCanary(f.frozen, results, results.map((r) => rec(r.shardId)), stripped, []);
    expect(without.B.valuesLostByStitching).toBeGreaterThan(0);
    expect(without.C.ownedLineageDistinctLost).toBeGreaterThan(0);
  });
});

describe("F-7B.3D - census exposes lineage ids for canonical comparison", () => {
  it("returns the raw ids alongside the counts", () => {
    const c = census({ rules: [], definitions: [definitionFor("X", money(1, ["inv-item:a"]), { lineage: ["inv-item:a"] })], sharedCapacities: [] });
    expect(c.lineageIds).toContain("inv-item:a");
    expect(c.lineageRefs).toBe(c.lineageIds.length);
  });
});
