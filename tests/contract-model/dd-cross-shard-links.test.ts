/**
 * PHASE 3 / 6.01 PRECISION AUDIT §17 - deterministic cross-shard structural linkage in the stitcher.
 *
 * A prohibition and the carve-outs enumerated under a "shall not apply to" lead-in are compiled in different shards;
 * so are a basket and the baskets it depends on by section number. No shard's model can link them. The stitcher can,
 * from the source alone. Synthetic document, scripted shard results, zero model calls.
 */
import { describe, expect, it } from "vitest";
import { buildTestIndex } from "./context-retrieval-test-utils";
import { planCompilationShards } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { stitchShardResults, synthesizeCrossShardLinks } from "../../lib/contract-model/compiler/semantic/shard-stitcher";
import type { ShardExecutionResult } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../../lib/contract-model/compiler/semantic-accountability/types";
import { money, ruleFor } from "./f7a-synthetic-corpus";

const DOC = "link-doc", CO = "link-co", INST = "link-inst", CAND = "cand:7.01";
const SMALL = { targetPrimaryChars: 900, maxPrimaryChars: 1_800, maxContextChars: 4_000, maxContextEntryChars: 600, maxUnitsPerShard: 4 };

function corpus(children: number, opts: { duplicateClause?: number } = {}) {
  const lines = ["SECTION 7.01. Indebtedness . The following shall apply with respect to Indebtedness.", "(a) The Borrower shall not, and shall not permit any Subsidiary to, create, incur or assume any Indebtedness of any kind whatsoever.", "(b) The provisions of Section 7.01(a) hereof shall not apply to:"];
  for (let i = 1; i <= children; i++) lines.push(`(${i}) Indebtedness of the Borrower in an aggregate principal amount at any time outstanding not to exceed $${(i * 1_000_000).toLocaleString("en-US")}, plus any Refinancing thereof, provided that the proceeds are applied as set forth herein and the incurrence is otherwise permitted by the terms of this Agreement;`);
  lines.push("(c) For purposes of determining compliance with this Section 7.01, the Borrower may classify any item of Indebtedness in any manner that complies with this covenant.");
  const text = lines.join("\n");
  const index = buildTestIndex([{ documentId: DOC, label: "SA", text }]);
  const sec = index.resolveUniqueNodeByRef(DOC, "7.01");
  if (sec.status !== "UNIQUE") throw new Error("7.01 not unique");
  const regionText = index.getNodeText(sec.node.nodeId, "DESCENDANTS");
  const sourceContext: SourceContextResult = { state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: DOC, sourceNodeId: sec.node.nodeId, sectionRef: "7.01", charStart: sec.node.charStart, charEnd: sec.node.charStart + regionText.length, text: regionText, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: regionText.length, budgetChars: 24_000 };
  const item = (id: string, needle: string, role: SemanticInventoryItem["semanticRole"], extra: Partial<SemanticInventoryItem> = {}): SemanticInventoryItem => { const at = regionText.indexOf(needle); if (at < 0) throw new Error(`needle ${needle}`); return { inventoryItemId: id, sourceSpan: { regionId: "operative", documentId: DOC, sourceNodeId: null, sectionRef: null, charStart: at, charEnd: at + needle.length, sourceCitation: "§7.01", excerpt: needle }, semanticRole: role, proposition: id, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentItemId: null, relatedItemIds: [], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", detectionMethod: "MODEL", ...extra }; };
  const items = [item("inv-item:prohib", "shall not, and shall not permit any Subsidiary to, create, incur", "PROHIBITION"), item("inv-item:chapeau", "shall not apply to:", "CONDITION")];
  for (let i = 1; i <= children; i++) items.push(item(`inv-item:c${i}`, `$${(i * 1_000_000).toLocaleString("en-US")}`, "PERMISSION"));
  items.push(item("inv-item:construction", "may classify any item of Indebtedness", "OTHER"));
  const frozenInventory: FrozenSemanticInventory = { candidateRef: CAND, items, uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "synthetic", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0, sourceContextState: "COMPLETE_LOCAL_SOURCE", frozenContentHash: `frozen:${children}`, frozenAt: "2026-01-01T00:00:00.000Z", algorithmVersion: "semantic-accountability.v5", promptVersion: "semantic-inventory-prompt.v5", provider: "synthetic", model: "synthetic", telemetryCostUsd: null };
  const plan = planCompilationShards({ candidateRef: CAND, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext, frozenInventory, structuralIndex: index, budget: SMALL, generation: { algorithmVersion: "alg.v1", promptVersion: "prompt.v1" } });
  void opts;
  return { plan, frozenInventory, regionText, sourceContext };
}

/** Each shard emits exactly the rules for the clauses it owns, as a scripted model would. */
function scriptedResults(c: ReturnType<typeof corpus>, children: number, opts: { dependsOnSectionRefs?: Record<string, string[]>; duplicateSectionFor?: number } = {}): ShardExecutionResult[] {
  return c.plan.shards.map((s) => {
    const rules = [];
    for (const key of s.ownedUnitKeys) {
      const u = c.plan.units.find((x) => x.unitKey === key)!;
      const ref = u.sectionRef ?? "";
      if (ref === "7.01(a)") rules.push({ ...ruleFor("p", CAND, "7.01(a)", null, { lineage: ["inv-item:prohib"] }), ruleType: "PROHIBITION" as const, posture: "PROHIBITION" as const });
      const m = /^7\.01\(b\)\((\d+)\)$/.exec(ref);
      if (m) {
        const i = Number(m[1]);
        const sectionRef = opts.duplicateSectionFor === i ? `7.01(b)(${i - 1})` : ref;
        const deps = (opts.dependsOnSectionRefs?.[ref] ?? []).map((target) => ({ relationshipType: "REQUIRES" as const, targetRef: target, description: `depends on ${target}`, reason: "cross-unit dependency preserved as unresolved by the model - never guessed" }));
        rules.push({ ...ruleFor(`b${i}`, CAND, sectionRef, money(i * 1_000_000, [`inv-item:c${i}`]), { lineage: [`inv-item:c${i}`] }), ...(deps.length ? { unresolvedDependencies: deps } : {}) });
      }
      if (ref === "7.01(c)") rules.push({ ...ruleFor("rc", CAND, "7.01(c) [rules of construction]", null, { lineage: ["inv-item:construction"] }) });
    }
    return { shardId: s.shardId, shardHash: s.shardHash, status: "SHARD_COMPLETE" as const, composition: { rules, definitions: [], sharedCapacities: [], inventoryDispositions: [] }, failureReasons: [], unresolvedIssues: [], reusedFromHash: false, attempts: 1, telemetry: null };
  });
}

describe("§17 deterministic cross-shard linkage", () => {
  const N = 10;
  it("the carve-outs enumerated under a 'shall not apply to' lead-in become exceptions of every prohibition compiled from the referenced section, across shards", () => {
    const c = corpus(N);
    expect(c.plan.shards.length).toBeGreaterThan(1);
    const results = scriptedResults(c, N);
    const stitched = stitchShardResults({ plan: c.plan, results, frozenInventory: c.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: CAND, sourceRegions: c.sourceContext.regions.map((r) => ({ regionId: r.regionId, text: r.text })) });
    const prohibition = stitched.rules.find((r) => r.ruleType === "PROHIBITION")!;
    expect(prohibition).toBeDefined();
    const baskets = stitched.rules.filter((r) => /^7\.01\(b\)\(\d+\)$/.test(r.sourceSectionRef ?? ""));
    expect(baskets.length).toBe(N);
    const linked = new Set(prohibition.exceptions.map((e) => e.permissionRuleId));
    for (const b of baskets) expect(linked.has(b.ruleId), b.sourceSectionRef ?? "").toBe(true);
    // the rules-of-construction clause is not a carve-out and is not linked; every synthesized exception carries provenance
    const construction = stitched.rules.find((r) => (r.sourceSectionRef ?? "").includes("rules of construction"))!;
    expect(linked.has(construction.ruleId)).toBe(false);
    for (const e of prohibition.exceptions) { expect(e.provenance?.sourceCitation).toBe("§7.01(b)"); expect(e.appliesToRuleId).toBe(prohibition.ruleId); }
    expect(stitched.crossShardLinks?.exceptionsSynthesized.length).toBe(N);
  });

  it("a section-reference dependency is resolved to the ONE rule compiled from that section; ambiguous or absent targets stay unresolved, never guessed", () => {
    const c = corpus(N);
    const results = scriptedResults(c, N, { dependsOnSectionRefs: { "7.01(b)(3)": ["Section 7.01(b)(1)", "Section 7.01(b)(2)", "Section 9.99(z)"] }, duplicateSectionFor: 2 });
    const stitched = stitchShardResults({ plan: c.plan, results, frozenInventory: c.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: CAND, sourceRegions: c.sourceContext.regions.map((r) => ({ regionId: r.regionId, text: r.text })) });
    const r3 = stitched.rules.find((r) => r.sourceSectionRef === "7.01(b)(3)")!;
    const r1 = stitched.rules.find((r) => r.sourceSectionRef === "7.01(b)(1)");
    // (b)(1) is shared by two rules here (clause 2 was scripted to carry (1)'s section), so it is AMBIGUOUS and stays unresolved; 9.99(z) has no rule
    expect(stitched.rules.filter((r) => r.sourceSectionRef === "7.01(b)(1)").length).toBe(2);
    expect(r1).toBeDefined();
    expect(r3.dependsOn.some((d) => d.targetRuleId === r1!.ruleId)).toBe(false);
    // (b)(1): two rules -> ambiguous; (b)(2): its clause was relabelled, so no rule -> absent; 9.99(z): no rule -> absent. All three stay unresolved.
    expect((r3.unresolvedDependencies ?? []).map((u) => u.targetRef).sort()).toEqual(["Section 7.01(b)(1)", "Section 7.01(b)(2)", "Section 9.99(z)"]);
    const report = stitched.crossShardLinks!;
    expect(report.dependenciesLeftUnresolved.map((u) => u.reason).sort()).toEqual(["MORE_THAN_ONE_RULE_COMPILED_FROM_THAT_SECTION", "NO_RULE_COMPILED_FROM_THAT_SECTION", "NO_RULE_COMPILED_FROM_THAT_SECTION"]);
    // 7.01(b)(2) was re-labelled onto (b)(1), so no rule is compiled from (b)(2): it must NOT resolve either
    expect(report.dependenciesResolved.length).toBe(0);
  });

  it("a unique section-reference dependency IS resolved and removed from the unresolved list", () => {
    const c = corpus(N);
    const results = scriptedResults(c, N, { dependsOnSectionRefs: { "7.01(b)(3)": ["Section 7.01(b)(5)"] } });
    const stitched = stitchShardResults({ plan: c.plan, results, frozenInventory: c.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: CAND, sourceRegions: c.sourceContext.regions.map((r) => ({ regionId: r.regionId, text: r.text })) });
    const r3 = stitched.rules.find((r) => r.sourceSectionRef === "7.01(b)(3)")!;
    const r5 = stitched.rules.find((r) => r.sourceSectionRef === "7.01(b)(5)")!;
    expect(r3.dependsOn.some((d) => d.targetRuleId === r5.ruleId && d.relationshipType === "REQUIRES")).toBe(true);
    expect(r3.unresolvedDependencies ?? []).toEqual([]);
    expect(stitched.crossShardLinks?.dependenciesResolved).toEqual([{ ruleId: r3.ruleId, targetRef: "Section 7.01(b)(5)", targetRuleId: r5.ruleId }]);
  });

  it("the pass is a pure function of the rules and the source: a document with no such lead-in adds nothing", () => {
    const c = corpus(3);
    const stitchedRules = scriptedResults(c, 3).flatMap((r) => r.composition!.rules);
    const before = JSON.stringify(stitchedRules);
    const report = synthesizeCrossShardLinks(stitchedRules.filter((r) => r.ruleType === "PROHIBITION"), c.plan, new Map([["operative", "no lead-in here"]]), DOC);
    expect(report.exceptionsSynthesized).toEqual([]);
    expect(JSON.stringify(stitchedRules)).toBe(before);
  });
});
