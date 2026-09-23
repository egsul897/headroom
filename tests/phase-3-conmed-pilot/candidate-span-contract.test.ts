/**
 * CANDIDATE-SPAN CONTRACT REMEDIATION DESIGN - the claims the design rests on, pinned.
 *
 * Every test here is zero-cost: fixtures, real production source text, and the artifacts the
 * design scripts wrote. Nothing calls a model. The production files are read as sentinels, so a
 * future edit that silently changes the contract fails here rather than in a paid run.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { economicItems, foreignItems, CONTROL_SECTIONS } from "../../scripts/p3-conmed-pilot/false-credit-span-probe";
import { FOCUS_IDS } from "../../scripts/p3-conmed-pilot/span-contract-sim";

const OUT = "docs/phase-3-candidate-span-remediation";
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
const src = (f: string) => fs.readFileSync(f, "utf8");
/** The cross-dataset census lives with the preceding mission's artifacts; this mission extended it. */
const census = () => JSON.parse(fs.readFileSync("docs/phase-3-shard-threshold-simulation/05-cross-dataset-span-census.json", "utf8"));

describe("the current contract, read from production source (§2)", () => {
  it("orchestrator.ts builds operativeSourceText by concatenating EVERY structural node's subtree", () => {
    expect(src("lib/contract-model/analysis/orchestrator.ts")).toContain(
      'const operativeSourceText = candidate.structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\\n\\n");',
    );
  });
  it("the pilot harness reproduces that expression byte-for-byte", () => {
    expect(src("scripts/p3-conmed-pilot/pipeline.ts")).toContain(
      'candidate.structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\\n\\n")',
    );
  });
  it("Pass C appends the containing section only as a LINK, and only for the four modifier roles", () => {
    const passC = src("lib/contract-model/compiler/discovery/pass-c-neighborhood.ts");
    expect(passC).toContain("structuralNodeIds.push(sectionNodeId)");
    expect(passC).toContain('item.role === "EXCEPTION" || item.role === "BASKET" || item.role === "PROVISO" || item.role === "CONDITION"');
    expect(passC).toContain("Neighborhood guarantee");
  });
  it("candidate identity is already anchor-only, so the proposal changes no discoveryId", () => {
    expect(src("lib/contract-model/compiler/discovery/pass-d-reconcile.ts")).toContain(
      "const mergeKey = `${primaryNodeId}::${item.role}::${computeCandidateContentFingerprint(item)}`",
    );
  });
  it("the verifier builds its SOURCE side from the same over-wide operative text", () => {
    expect(src("lib/contract-model/compiler/semantic-verification/verify.ts")).toContain(
      "buildSourceInventory(compilerInput.candidateRef, compilerInput.operativeSourceText,",
    );
  });
  it("Gate 2 - the only gate that can permit a review skip - reads operativeSourceText alone", () => {
    expect(src("lib/contract-model/compiler/semantic-verification/verify.ts")).toContain(
      "conditionSuspicion = await classifyConditionSuspicion(compilerInput.operativeSourceText,",
    );
  });
});

describe("the typed-context channel already exists (§3, §4)", () => {
  it("ContextItemType already carries every class the proposal needs - no new abstraction", () => {
    const types = src("lib/contract-model/compiler/context-retrieval/types.ts");
    for (const t of ["OPERATIVE_SOURCE", "PARENT_SCOPE", "CHILD_RULE", "SIBLING_CONTEXT", "PROVISO", "EXCEPTION", "CONDITION", "SHARED_CAP", "DEFINITION", "ENTITY_SCOPE", "CROSS_REFERENCE"]) {
      expect(types).toContain(`| "${t}"`);
    }
  });
  it("retrieveParentScope emits the ancestor's OWN text (the chapeau), not its subtree", () => {
    const sc = src("lib/contract-model/compiler/context-retrieval/structural-context.ts");
    expect(sc).toContain('const ancestors = index.getAncestors(nodeId).filter((n) => n.nodeType !== "ARTICLE");');
    expect(sc).toContain('const text = index.getNodeText(ancestor.nodeId, "OWN");');
    expect(sc).toContain('makeItemInput("PARENT_SCOPE"');
  });
  it("the prompt already renders operative text and typed context as two separate blocks", () => {
    const caller = src("lib/contract-model/compiler/semantic/caller.ts");
    expect(caller).toContain("`Operative source text (${input.sourceSectionRef ?? \"no section ref\"}):`");
    expect(caller).toContain("Already-gathered context");
    expect(caller).toContain("(${i.type}, ${i.sourceCitation})");
  });
});

describe("before/after simulation (§7, §8)", () => {
  const s = read("02-conmed-before-after.json");
  it("covers the full 137-candidate dedup population with 0 model calls", () => {
    expect(s.modelCalls).toBe(0);
    expect(s.population).toBe(137);
    expect(s.dual).toBe(67);
  });
  it("collapses operative text by ~79% and removes the over-8k class", () => {
    expect(s.current.total).toBe(505889);
    expect(s.proposed.total).toBe(104459);
    expect(s.reductionPct).toBeCloseTo(79.35, 2);
    expect(s.current.over4k).toBe(65);
    expect(s.proposed.over4k).toBe(6);
    expect(s.current.over8k).toBe(14);
    expect(s.proposed.over8k).toBe(1);
  });
  it("halves the planner shards and drains the 16-sequential-call class", () => {
    expect(s.shards).toMatchObject({ current: 374, proposed: 191, currentSharded: 77, proposedSharded: 33 });
    expect(s.inventoryCalls.current).toBeGreaterThan(s.inventoryCalls.proposed);
    expect(s.maxSequentialCalls.currentHistogram["16"]).toBe(40);
    expect(s.maxSequentialCalls.proposedHistogram["16"]).toBe(2);
  });
  it("every candidate still over 4k afterwards is a section-level candidate with ONE structural node", () => {
    expect(s.residualOver4k).toHaveLength(6);
    for (const r of s.residualOver4k) expect(r.nodeIds).toBe(1);
    expect(s.residualOver4k.map((r: { ref: string }) => r.ref).sort()).toEqual(["7.2", "7.3", "7.4", "7.5", "7.8", "7.9"]);
  });
  it("collapses the 7.2(k) family and 7.2(e) long to their true anchor spans, leaving short cases untouched", () => {
    const f = s.focus;
    expect([f.long_7_2_e.currentChars, f.long_7_2_e.proposedChars]).toEqual([9045, 200]);
    expect([f.long_7_2_k.currentChars, f.long_7_2_k.proposedChars]).toEqual([9621, 776]);
    expect([f.k_i.currentChars, f.k_i.proposedChars]).toEqual([8899, 54]);
    expect([f.k_ii.currentChars, f.k_ii.proposedChars]).toEqual([9300, 455]);
    for (const slot of ["long_7_2_e", "long_7_2_k", "k_i", "k_ii"]) {
      expect(f[slot].proposedShards).toBe(1);
      expect(f[slot].currentMaxSeq).toBe(16);
      expect(f[slot].proposedMaxSeq).toBe(14);
    }
    for (const slot of ["short_7_2_e", "parent_7_2_k", "medium_7_6"]) {
      expect(f[slot].currentChars).toBe(f[slot].proposedChars);
      expect(f[slot].currentShards).toBe(f[slot].proposedShards);
    }
    expect(Object.keys(FOCUS_IDS).sort()).toEqual(Object.keys(f).sort());
  });
  it("loses no linked context: every dual candidate already carries its parent as typed PARENT_SCOPE", () => {
    const r = s.linkedContextRetention;
    expect(r.dualCandidates).toBe(67);
    expect(r.parentPresentInRealContextBundle).toBe(67);
    expect(r.parentPresentAsTypedPARENT_SCOPEalone).toBe(67);
    expect(r.contextLossCases).toEqual([]);
    expect(r.parentScopeChars.max).toBeLessThan(1000); // chapeau (OWN text), not the 8,843-char subtree
  });
});

describe("false-credit exposure (§5)", () => {
  const p = read("05-false-credit-span-probe.json");
  it("the probe is deterministic and anchor-relative", () => {
    const text = "The Borrower may incur Indebtedness not to exceed $50,000,000.";
    const parent = "Liens securing up to $125,000,000 are permitted.";
    expect(economicItems(text, "7.2(x)")).toContain("AMOUNT:$50,000,000");
    expect(foreignItems(`${text}\n\n${parent}`, text, "7.2(x)")).toContain("AMOUNT:$125,000,000");
    expect(foreignItems(text, text, "7.2(x)")).toEqual([]);
  });
  it("every dual-key CONMED candidate inherits foreign economic items today", () => {
    const c = p.conmed;
    expect(c.dualKey).toBe(67);
    expect(c.candidatesInheritingForeignEconomicItems).toBe(67);
    expect(c.totalForeignItemsInVerifierSourceWindow).toBeGreaterThan(5000);
    expect(c.currentTotalItems).toBeGreaterThan(c.proposedTotalItems * 3);
  });
  it("names 12 distinct control sections and reports which are exposed", () => {
    expect(CONTROL_SECTIONS).toHaveLength(12);
    const ctrl = p.dsgr.carryingAControlSectionAsParent;
    expect(ctrl.candidates).toBe(ctrl.inheritingForeignItems);
    expect(ctrl.exposedControlSections.length + ctrl.unexposedControlSections.length).toBe(12);
    expect(ctrl.exposedControlSections.length).toBe(8);
    for (const k of [...ctrl.exposedControlSections, ...ctrl.unexposedControlSections]) expect(CONTROL_SECTIONS).toContain(k);
  });
});

describe("coverage cannot disappear (§12)", () => {
  it("every appended parent section is itself the anchor of some candidate, in all four datasets", () => {
    const datasets = census().datasets as { appendedParentsIndependentlyAnchored: { notAnchored: string[]; alsoAnchorOfSomeCandidate: number; distinctAppendedParents: number } }[];
    expect(datasets).toHaveLength(4);
    for (const d of datasets) {
      const a = d.appendedParentsIndependentlyAnchored;
      expect(a.notAnchored).toEqual([]);
      expect(a.alsoAnchorOfSomeCandidate).toBe(a.distinctAppendedParents);
    }
  });
  it("the package coverage consumers read the node ARRAY, never the operative text", () => {
    expect(src("lib/contract-model/compiler/coverage-audit/pipeline.ts")).toContain("const discoveredNodeIds = new Set(input.candidates.flatMap((c) => c.structuralNodeIds));");
    expect(src("lib/contract-model/compiler/coverage-audit/discovery-comparison.ts")).toContain("candidates.filter((c) => c.structuralNodeIds.includes(nodeId))");
    expect(src("lib/contract-model/compiler/semantic-coverage/reconciliation.ts")).toContain("c.structuralNodeIds.some((id) => id === anchor.structuralNodeId || ancestorIds.has(id))");
  });
});

describe("the duplicate-candidate question (§9)", () => {
  const q = read("11-duplicate-candidate-question.json");
  it("finds exactly two same-anchor groups, each one clause read under two roles", () => {
    expect(q.groups).toHaveLength(2);
    for (const g of q.groups) {
      expect(g.members).toHaveLength(2);
      expect(new Set(g.members.map((m: { role: string }) => m.role)).size).toBe(2);
      // identity survives: both members collapse to the SAME anchor text under the proposal
      expect(new Set(g.members.map((m: { proposedChars: number }) => m.proposedChars)).size).toBe(1);
      // and they are handed DIFFERENT text today - the artifact
      expect(new Set(g.members.map((m: { currentChars: number }) => m.currentChars)).size).toBe(2);
    }
  });
});

describe("the design itself (§13, §15, §16)", () => {
  const d = read("09-minimal-implementation-design.json");
  const v = read("10-paid-validation-and-success-gate.json");
  it("requires exactly two production files and leaves the frozen variables alone", () => {
    expect(d.exactRequiredProductionFiles).toEqual([
      "lib/contract-model/analysis/orchestrator.ts (R1)",
      "lib/contract-model/compiler/semantic-verification/verify.ts (R3)",
    ]);
    const required = d.changes.filter((c: { classification: string }) => c.classification === "REQUIRED").map((c: { id: string }) => c.id);
    expect(required).toEqual(["R1", "R2", "R3"]);
    for (const frozen of ["few-shot", "targetPrimaryChars", "maxToolCalls", "timeout", "model"]) {
      expect(JSON.stringify(d.notChanged)).toMatch(new RegExp(frozen, "i"));
    }
  });
  it("keeps the paid validation bounded and under a dollar", () => {
    expect(v.candidateCount).toBe(22);
    expect(v.cohorts.reduce((a: number, c: { n: number }) => a + c.n, 0)).toBe(22);
    expect(v.estimatedCost.expectedUsd).toBeLessThan(1);
    expect(v.estimatedCost.ceilingUsd).toBeLessThan(1);
    expect(v.model).toContain("deepseek/deepseek-v4-flash");
    expect(v.timeoutMs).toBe(480000);
  });
  it("states all ten gate criteria", () => {
    expect(Object.keys(v.implementationSuccessGate)).toHaveLength(10);
  });
});
