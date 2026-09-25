/**
 * ZERO-COST SHARD-THRESHOLD SIMULATION — helper behaviour, artifact consistency, and the
 * candidate-span premise the simulation surfaced (parent section appended as operative text).
 * No model calls anywhere in this file: everything is fixtures, source text, and written artifacts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { THRESHOLDS, budgetFor, classifyBoundary, compositeSplitRisk } from "../../scripts/p3-conmed-pilot/shard-threshold-sim";
import { DEFAULT_SHARD_BUDGET } from "../../lib/contract-model/compiler/semantic/shard-planner";
import type { CompilationShard } from "../../lib/contract-model/compiler/semantic/shard-types";

const OUT = "docs/phase-3-shard-threshold-simulation";
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
const shard = (start: number, end: number) => ({ primaryCharStart: start, primaryCharEnd: end }) as unknown as CompilationShard;

describe("thresholds and budget derivation (§3)", () => {
  it("tests exactly the eight mandated thresholds, control first, strictly decreasing", () => {
    expect([...THRESHOLDS]).toEqual([12_000, 10_000, 9_000, 8_000, 7_000, 6_000, 5_000, 4_000]);
    expect(THRESHOLDS[0]).toBe(DEFAULT_SHARD_BUDGET.targetPrimaryChars);
    for (let i = 1; i < THRESHOLDS.length; i++) expect(THRESHOLDS[i]!).toBeLessThan(THRESHOLDS[i - 1]!);
  });
  it("derives maxPrimaryChars at the production ratio (2x) and leaves every other budget field untouched", () => {
    expect(DEFAULT_SHARD_BUDGET.maxPrimaryChars).toBe(2 * DEFAULT_SHARD_BUDGET.targetPrimaryChars);
    for (const t of THRESHOLDS) {
      const b = budgetFor(t);
      expect(b.targetPrimaryChars).toBe(t);
      expect(b.maxPrimaryChars).toBe(2 * t);
      expect(b.maxContextChars).toBe(DEFAULT_SHARD_BUDGET.maxContextChars);
      expect(b.maxRequiredContextChars).toBe(DEFAULT_SHARD_BUDGET.maxRequiredContextChars);
      expect(b.maxContextEntryChars).toBe(DEFAULT_SHARD_BUDGET.maxContextEntryChars);
      expect(b.maxUnitsPerShard).toBe(DEFAULT_SHARD_BUDGET.maxUnitsPerShard);
    }
    expect(budgetFor(12_000)).toEqual(DEFAULT_SHARD_BUDGET);
  });
});

describe("boundary classification (§7)", () => {
  const text = "The Borrower shall not incur Indebtedness; provided that (a) Indebtedness under the Loan Documents; (b) Indebtedness existing on the Closing Date. Section 7.3 Liens. (i) purchase money Liens and (ii) other Liens";
  it("treats the trailing edge of the last shard as an exact structural boundary", () => {
    expect(classifyBoundary(text, 10, true)).toBe("EXACT_STRUCTURAL_BOUNDARY");
  });
  it("recognises clause and sub-clause markers opening the next shard", () => {
    expect(classifyBoundary(text, text.indexOf("(b)"), false)).toBe("CLAUSE_BOUNDARY");
    expect(classifyBoundary(text, text.indexOf("(ii)"), false)).toBe("SUBCLAUSE_BOUNDARY");
  });
  it("recognises a sentence/semicolon edge, a section heading edge, and a mid-sentence cut", () => {
    expect(classifyBoundary(text, text.indexOf(" provided that"), false)).toBe("SENTENCE_BOUNDARY");
    expect(classifyBoundary(text, text.indexOf("Section 7.3"), false)).toBe("EXACT_STRUCTURAL_BOUNDARY");
    expect(classifyBoundary(text, text.indexOf("incur") + 2, false)).toBe("MID_SENTENCE");
  });
  it("returns UNKNOWN when there is no text on one side of the edge", () => {
    expect(classifyBoundary(text, 0, false)).toBe("UNKNOWN");
    expect(classifyBoundary(text, text.length, false)).toBe("UNKNOWN");
  });
});

describe("composite-split risk (§8)", () => {
  const text = "The Borrower may incur Indebtedness in an aggregate principal amount not to exceed $50,000,000 provided that no Default has occurred. Liens securing such Indebtedness are permitted.";
  it("a single shard carries no composite-split risk", () => {
    expect(compositeSplitRisk(text, [shard(0, text.length)])).toEqual({ risk: false, reasons: [] });
  });
  it("flags a proviso that opens the next shard while its primary clause ends the previous one", () => {
    const cut = text.indexOf(" provided that") + 1;
    const r = compositeSplitRisk(text, [shard(0, cut), shard(cut, text.length)]);
    expect(r.risk).toBe(true);
    expect(r.reasons.some((x) => x.startsWith("proviso/exception opens shard 2"))).toBe(true);
  });
  it("always records the planner's truncated-chapeau delivery once a candidate has more than one shard", () => {
    const cut = text.indexOf("Liens securing");
    const r = compositeSplitRisk(text, [shard(0, cut), shard(cut, text.length)]);
    expect(r.reasons.filter((x) => x.includes("TRUNCATED context")).length).toBe(1);
  });
});

describe("simulation artifacts (§5/§6) are internally consistent", () => {
  const rows = read("01-per-threshold.json") as any[];
  it("has one row per threshold, in mandated order, over the 137-candidate dedup population", () => {
    expect(rows.map((r) => r.threshold)).toEqual([...THRESHOLDS]);
    for (const r of rows) { expect(r.candidates).toBe(137); expect(r.maxPrimaryChars).toBe(2 * r.threshold); expect(r.unsharded + r.sharded).toBe(137); }
  });
  it("shows the threshold is inert on every call-profile metric and never produces mid-sentence or unknown edges", () => {
    for (const r of rows) {
      expect(r.unsharded).toBe(60);
      expect(r.sharded).toBe(77);
      expect(r.estInventoryCalls).toBe(354);
      expect(r.estMaxSequentialCallsPerConversation).toBe(16);
      expect(r.midSentence).toBe(0);
      expect(r.unknown).toBe(0);
      expect(r.estCompileConversations).toBe(r.totalShards);
    }
    expect(rows[1].totalShards).toBe(rows[0].totalShards); // 10,000 is indistinguishable from the 12,000 control
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].totalShards).toBeGreaterThanOrEqual(rows[i - 1].totalShards);
      expect(rows[i].compositeSplitRiskCount).toBeGreaterThanOrEqual(rows[i - 1].compositeSplitRiskCount);
      expect(rows[i].maxPrimaryCharsObserved).toBeLessThanOrEqual(rows[i - 1].maxPrimaryCharsObserved);
    }
    expect(rows[0].oversizedShards).toBe(0);
    expect(rows[rows.length - 1].oversizedShards).toBeGreaterThan(0); // 4,000 makes the appended parent sections oversized atomic units
  });
  it("maps the 7.2(k) family exactly: intact at 12k/10k, split own|parent from 9k down, never further", () => {
    const f = read("02-focus-cases.json");
    expect(f.short_7_2_e.plans["12000"].shards).toBe(1);
    expect(f.short_7_2_e.plans["4000"].shards).toBe(1);
    expect(f.medium_7_6.plans["4000"].shards).toBe(1);
    expect(f.hard_7_2_k.chars).toBe(9621);
    expect(f.hard_7_2_k.plans["12000"].slices).toEqual([{ start: 0, end: 9621 }]);
    for (const t of ["9000", "8000", "7000", "6000", "5000", "4000"]) expect(f.hard_7_2_k.plans[t].slices).toEqual([{ start: 0, end: 776 }, { start: 776, end: 9621 }]);
    expect(f.k_ii.plans["9000"].slices).toEqual([{ start: 0, end: 455 }, { start: 455, end: 9300 }]);
    expect(f.k_i.plans["4000"].slices).toEqual([{ start: 0, end: 8899 }]); // 54-char own text + parent: no seam the planner can find
  });
});

describe("candidate-span premise (§4C/§10): the parent section is appended as operative text", () => {
  const sealed = JSON.parse(fs.readFileSync("tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json", "utf8")) as any[];
  it("67 of the 163 sealed CONMED candidates carry their containing section as a second structural key, always via NEIGHBORHOOD_EXPANSION", () => {
    const dual = sealed.filter((c) => (c.structuralNodeKeys ?? []).length > 1);
    expect(sealed.length).toBe(163);
    expect(dual.length).toBe(67);
    expect(sealed.some((c) => (c.structuralNodeKeys ?? []).length > 2)).toBe(false);
    for (const c of dual) {
      const [own, parent] = c.structuralNodeKeys as string[];
      expect(own!.startsWith(parent!)).toBe(true);
      expect(own).not.toBe(parent);
      expect(c.discoveryMethods).toContain("NEIGHBORHOOD_EXPANSION");
      expect(["EXCEPTION", "BASKET", "PROVISO", "CONDITION"]).toContain(c.role);
    }
    expect(sealed.filter((c) => (c.structuralNodeKeys ?? []).length === 1).every((c) => !(c.discoveryMethods ?? []).includes("NEIGHBORHOOD_EXPANSION"))).toBe(true);
  });
  it("Pass C still LINKS the containing section, and neither caller turns that link into a span", () => {
    // Recorded the defect when this simulation found it; records the fix now that R1/R2 landed.
    const orchestrator = fs.readFileSync("lib/contract-model/analysis/orchestrator.ts", "utf8");
    const pipeline = fs.readFileSync("scripts/p3-conmed-pilot/pipeline.ts", "utf8");
    const passC = fs.readFileSync("lib/contract-model/compiler/discovery/pass-c-neighborhood.ts", "utf8");
    expect(passC).toContain("structuralNodeIds.push(sectionNodeId)");
    for (const caller of [orchestrator, pipeline]) {
      expect(caller).not.toContain('candidate.structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\\n\\n")');
    }
    expect(orchestrator).toContain("operativeSourceTextFor(candidate, index)");
    expect(pipeline).toContain("operativeSourceTextFor(candidate, index)");
  });
  it("the cross-dataset census and the controls inspection agree with the fixtures", () => {
    const census = read("05-cross-dataset-span-census.json");
    expect(census.modelCalls).toBe(0);
    expect(census.universe).toEqual({ candidates: 1248, dual: 488, dualPct: 39.1 });
    const by = Object.fromEntries(census.datasets.map((d: any) => [d.dataset, d]));
    expect(by.conmed.dual).toBe(67); expect(by.dsgr.dual).toBe(234); expect(by.lsb.dual).toBe(45); expect(by.fwrg.dual).toBe(142);
    for (const d of census.datasets) { expect(d.allDualAreNeighborhoodExpansion).toBe(true); expect(d.appendedParentChars.median).toBeGreaterThan(d.ownCharsOfDual.median); }
    const controls = read("06-false-credit-controls-structural.json");
    expect(controls.controls.length).toBe(14);
    expect(controls.totals).toEqual({ controls: 14, sectionsAppendedAtLeastOnce: 9, appendedCandidateTotal: 93 });
  });
});
