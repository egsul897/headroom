/**
 * PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §27 - GENERALITY.
 *
 * Required-dependency prematerialization must be a property of the ARCHITECTURE, not of one document. Every corpus
 * here is synthetic and parameterized: the defined-term names, the section numbers, the chain shape and the amounts
 * are all inputs. Nothing in these tests names a real agreement, a real term or a real section, and no test asserts a
 * count that only one document could produce.
 *
 * The shape under test is the one the paid failure exposed: an operative clause whose limit is a defined term, whose
 * definition is itself composed of further defined terms, one of which is only reachable through a limit-bearing
 * position and another only through a cross-reference written inside a required definition.
 *
 *   A - the same structure with a DIFFERENT definition name is still fully delivered.
 *   B - the same structure with a DIFFERENT cross-referenced section is still fully delivered.
 *   C - a FORWARDING definition's section target is delivered, one bounded hop.
 *   D - several required definitions and a required section are delivered together, none starved by the others.
 *   E - a required closure that does not fit reacts DETERMINISTICALLY (re-shard, then bounded excerpt, then an
 *       explicit, certified planning failure) and never silently leaves a dependency to a tool call.
 *   F - the same structure with different VALUES produces the same required key set (no value-dependent behaviour).
 */
import { describe, expect, it } from "vitest";
import { buildTestIndex } from "./context-retrieval-test-utils";
import { planCompilationShards, DEFAULT_SHARD_BUDGET } from "../../lib/contract-model/compiler/semantic/shard-planner";
import type { ShardPlan } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../../lib/contract-model/compiler/semantic-accountability/types";

const CO = "dd-co";
const INST = "dd-instrument";
const DOC = "dd-doc";

interface Shape {
  /** The defined term the operative clause is bounded by. */
  capTerm: string;
  /** The three components the cap term's own definition is composed of. */
  componentTerms: [string, string, string];
  /** Reachable only from a component's limit-bearing position ("incurred within ..."). */
  deepTerm: string;
  /** Written as a cross-reference INSIDE the root definition. */
  crossRefSection: string;
  /** The section a forwarding definition points at. */
  forwardingSection: string;
  forwardingTerm: string;
  operativeSection: string;
  amounts: [number, number, number];
  /** false: the cross-referenced section is CITED but has no structural occurrence - a genuinely absent dependency. */
  crossRefSectionExists?: boolean;
}

export const BASE: Shape = {
  capTerm: "Aggregate Basket Cap",
  componentTerms: ["Scheduled Basket Amount", "Reinvested Basket Amount", "Elective Basket Amount"],
  deepTerm: "Qualifying Disposition Proceeds",
  crossRefSection: "3.07(b)",
  forwardingSection: "9.11(a)",
  forwardingTerm: "Designated Reference Amount",
  operativeSection: "8.02",
  amounts: [75_000_000, 40_000_000, 25_000_000],
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * Builds a two-section synthetic agreement: a definitions section carrying the chain, and an operative section whose
 * single permitted clause is bounded by the cap term. Only the operative section is owned by the shard.
 */
function buildCorpus(shape: Shape): { index: ReturnType<typeof buildTestIndex>; sourceContext: SourceContextResult; frozenInventory: FrozenSemanticInventory } {
  const [c1, c2, c3] = shape.componentTerms;
  const lines = [
    "SECTION 1.01. Defined Terms . As used in this Agreement, the following terms have the meanings specified below.",
    `“${shape.capTerm}” means, at any time, the sum of the ${c1}, the ${c2} and the ${c3}.`,
    `“${c1}” means ${money(shape.amounts[0])}.`,
    `“${c2}” means an amount equal to the ${shape.deepTerm} incurred within the twelve-month period then ended.`,
    `“${c3}” means ${money(shape.amounts[1])}, subject to Section ${shape.crossRefSection}.`,
    `“${shape.deepTerm}” means the net cash proceeds of any disposition permitted hereunder, up to ${money(shape.amounts[2])}.`,
    `“${shape.forwardingTerm}” has the meaning assigned to such term in Section ${shape.forwardingSection}.`,
    ...(shape.crossRefSectionExists === false ? [] : [
      `SECTION ${shape.crossRefSection.replace(/\(.*$/, "")}. Basket Reinstatement . Amounts applied under this Section reinstate the corresponding basket.`,
      `(b) Reinstatement occurs only on the date the applicable amount is irrevocably applied.`,
    ]),
    `SECTION ${shape.forwardingSection.replace(/\(.*$/, "")}. Reference Amounts . Reference amounts are determined as provided below.`,
    `(a) The reference amount for any period is the amount certified by a Responsible Officer for such period.`,
    `SECTION ${shape.operativeSection}. Limitation on Incurrence . The Borrower shall not incur any obligation, except:`,
    `(a) obligations in an aggregate principal amount not to exceed the ${shape.capTerm} at the time of incurrence, determined by reference to the ${shape.forwardingTerm};`,
  ];
  const text = lines.join("\n");
  const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
  const op = index.resolveUniqueNodeByRef(DOC, shape.operativeSection);
  if (op.status !== "UNIQUE") throw new Error(`generality corpus: section ${shape.operativeSection} not unique`);
  const regionText = index.getNodeText(op.node.nodeId, "DESCENDANTS");
  const sourceContext: SourceContextResult = {
    state: "COMPLETE_LOCAL_SOURCE",
    regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: DOC, sourceNodeId: op.node.nodeId, sectionRef: shape.operativeSection, charStart: op.node.charStart, charEnd: op.node.charStart + regionText.length, text: regionText, expandedFor: null, truncatedAtBudget: false, unitExtension: null }],
    unresolvedReferences: [], reasons: [], totalChars: regionText.length, budgetChars: 24_000,
  };
  const at = regionText.indexOf("(a) obligations");
  const item: SemanticInventoryItem = {
    inventoryItemId: "inv-item:op-a", sourceSpan: { regionId: "operative", documentId: DOC, sourceNodeId: op.node.nodeId, sectionRef: `${shape.operativeSection}(a)`, charStart: at, charEnd: regionText.length, sourceCitation: `§${shape.operativeSection}(a)`, excerpt: regionText.slice(at) },
    semanticRole: "PERMISSION", proposition: `clause (a) permits obligations up to the ${shape.capTerm}`, quantitativeValues: [],
    referencedTerms: [shape.capTerm, shape.forwardingTerm], referencedSections: [], parentItemId: null, relatedItemIds: [],
    materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", detectionMethod: "MODEL",
  };
  const frozenInventory: FrozenSemanticInventory = {
    candidateRef: `cand:${shape.operativeSection}`, items: [item], uninventoriedValues: [], unaccountedSource: [],
    sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] },
    gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "synthetic", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0,
    sourceContextState: "COMPLETE_LOCAL_SOURCE", frozenContentHash: `frozen:${shape.operativeSection}`, frozenAt: "2026-01-01T00:00:00.000Z",
    algorithmVersion: "semantic-accountability.v5", promptVersion: "semantic-inventory-prompt.v5", provider: "synthetic", model: "synthetic", telemetryCostUsd: null,
  };
  return { index, sourceContext, frozenInventory };
}

export function planFor(shape: Shape, budget: Partial<typeof DEFAULT_SHARD_BUDGET> = {}): ShardPlan {
  const { index, sourceContext, frozenInventory } = buildCorpus(shape);
  return planCompilationShards({ candidateRef: frozenInventory.candidateRef, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext, frozenInventory, structuralIndex: index, budget, generation: { algorithmVersion: "alg.v1", promptVersion: "prompt.v1" } });
}

/** Keys the planner actually DELIVERED in the required tier (not merely derived). */
function deliveredRequiredKeys(plan: ShardPlan): Set<string> {
  return new Set(plan.shards.flatMap((s) => s.context.filter((e) => e.tier === "REQUIRED").map((e) => e.contextKey)));
}
const termKey = (t: string) => `term:${t.toLowerCase()}`;
const sectionKey = (r: string) => `section:${r.toLowerCase()}`;

describe("§27 required-dependency delivery is a property of the architecture, not of one document", () => {
  it("A - the operative clause's bounding definition and its whole composition are delivered under ANY name", () => {
    for (const capTerm of ["Aggregate Basket Cap", "Permitted Incremental Capacity", "Maximum Utilization Threshold"]) {
      const shape = { ...BASE, capTerm };
      const plan = planFor(shape);
      const keys = deliveredRequiredKeys(plan);
      expect(keys.has(termKey(capTerm))).toBe(true);
      for (const c of shape.componentTerms) expect(keys.has(termKey(c))).toBe(true);
      expect(plan.dependencyCertification.requiredDependenciesUnresolved).toBe(0);
      expect(plan.dependencyCertification.allShardsExecutable).toBe(true);
    }
  });

  it("B - a cross-reference written inside a required definition is itself required, whatever the section number", () => {
    for (const crossRefSection of ["3.07(b)", "7.04(c)", "11.19(a)"]) {
      const plan = planFor({ ...BASE, crossRefSection });
      const keys = deliveredRequiredKeys(plan);
      expect(keys.has(sectionKey(crossRefSection))).toBe(true);
      const dep = plan.shards.flatMap((s) => s.requiredDependencies).find((d) => d.key === sectionKey(crossRefSection));
      expect(dep?.evidence).toContain("CROSS_REFERENCE_IN_REQUIRED_DEFINITION");
      expect(plan.dependencyCertification.requiredDependenciesUnresolved).toBe(0);
    }
  });

  it("C - a forwarding definition's section target is delivered one bounded hop past the declaration", () => {
    for (const forwardingSection of ["9.11(a)", "5.12(b)(2)"]) {
      const plan = planFor({ ...BASE, forwardingSection });
      const deps = plan.shards.flatMap((s) => s.requiredDependencies);
      const declaration = deps.find((d) => d.key === termKey(BASE.forwardingTerm));
      expect(declaration, `forwarding declaration required for ${forwardingSection}`).toBeDefined();
      const target = deps.find((d) => d.key === sectionKey(forwardingSection));
      expect(target, `forwarding target ${forwardingSection} required`).toBeDefined();
      expect(target!.evidence).toContain("FORWARDING_DEFINITION_TARGET");
      expect(target!.disposition).not.toBe("UNRESOLVED");
      expect(plan.dependencyCertification.requiredDependenciesUnresolved).toBe(0);
    }
  });

  it("D - several required definitions and a required section are delivered together; none is starved by the others", () => {
    const plan = planFor(BASE);
    const keys = deliveredRequiredKeys(plan);
    const expected = [termKey(BASE.capTerm), ...BASE.componentTerms.map(termKey), termKey(BASE.deepTerm), sectionKey(BASE.crossRefSection)];
    for (const k of expected) expect(keys.has(k), `${k} delivered`).toBe(true);
    // every delivered required entry is READ-ONLY context of the REQUIRED tier - never owned material
    for (const s of plan.shards) for (const e of s.context.filter((x) => x.tier === "REQUIRED")) expect(e.ownership).toBe("READ_ONLY_CONTEXT");
    expect(plan.dependencyCertification.requiredDependenciesUnresolved).toBe(0);
  });

  it("E - an over-budget required closure reacts deterministically and never falls back to an optional tool call", () => {
    // The tight ceiling is DERIVED from what this corpus's own closure needs, so the test measures the reaction rather
    // than a hard-coded number that only one corpus would trigger.
    const full = planFor(BASE);
    const needed = full.shards[0]!.context.filter((e) => e.tier === "REQUIRED").reduce((a, e) => a + e.chars, 0);
    expect(needed).toBeGreaterThan(0);
    const ceiling = Math.floor(needed / 2);
    const tight = planFor(BASE, { maxRequiredContextChars: ceiling });
    // §10 reacts in order: re-shard along must-link boundaries first, then bound the entries of whatever still cannot fit
    expect(tight.shards.length).toBeGreaterThanOrEqual(full.shards.length);
    const shard = tight.shards.find((x) => x.dependencyCertificate.requiredTierAllocation.waterFilled) ?? tight.shards[tight.shards.length - 1]!;
    const cert = shard.dependencyCertificate;
    // the allowance is SEARCHED, not chosen: entries are reduced largest-first to one per-entry allowance
    expect(cert.requiredTierAllocation.ceilingChars).toBeLessThanOrEqual(ceiling);
    expect(cert.requiredTierAllocation.waterFilled).toBe(true);
    expect(shard.context.filter((e) => e.tier === "REQUIRED").reduce((a, e) => a + e.chars, 0)).toBeLessThanOrEqual(ceiling);
    // small entries survive in full; only the largest are excerpted - the reduction never starves a short definition
    for (const e of shard.context.filter((x) => x.tier === "REQUIRED")) {
      const dep = shard.requiredDependencies.find((d) => d.key === e.contextKey)!;
      if (dep.fullTextChars <= cert.requiredTierAllocation.perEntryAllowanceChars) expect(e.truncated).toBe(false);
    }
    // whatever still could not be delivered is disclosed as an explicit planning failure - never silent
    if (cert.requiredDependenciesUnresolved > 0) {
      expect(cert.certificateStatus).toBe("PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE");
      for (const u of cert.undelivered) expect(shard.unresolvedContext.some((x) => x.key === u.key && x.reason === "BUDGET")).toBe(true);
    }
    // and the same closure at the production ceiling is fully delivered - the closure is not the problem, capacity is
    expect(full.dependencyCertification.requiredDependenciesUnresolved).toBe(0);
  });

  it("E2 - the required tier is never rescued by, and never leaks into, the optional tier", () => {
    const full = planFor(BASE);
    const needed = full.shards[0]!.context.filter((e) => e.tier === "REQUIRED").reduce((a, e) => a + e.chars, 0);
    const tight = planFor(BASE, { maxRequiredContextChars: Math.floor(needed / 4) });
    // at the production ceiling nothing is split; under a ceiling the closure cannot meet, the planner splits FIRST
    expect(full.requiredContextResharding.splits).toBe(0);
    expect(tight.requiredContextResharding.splits).toBeGreaterThan(0);
    // a required dependency is NEVER re-admitted as interpretive context as a consolation for not fitting the
    // required tier - that is precisely the "put it in unresolvedContext and hope a tool call finds it" shape §10 forbids
    for (const plan of [full, tight]) {
      for (const s of plan.shards) {
        const requiredKeys = new Set(s.requiredDependencies.map((d) => d.key));
        for (const e of s.context) if (e.tier === "INTERPRETIVE") expect(requiredKeys.has(e.contextKey)).toBe(false);
      }
    }
    // every delivered required entry carries real text
    expect(tight.shards.every((s) => s.context.filter((e) => e.tier === "REQUIRED").every((e) => e.chars > 0))).toBe(true);
  });

  it("F - the same structure with different values produces the same required key set", () => {
    const a = planFor({ ...BASE, amounts: [75_000_000, 40_000_000, 25_000_000] });
    const b = planFor({ ...BASE, amounts: [3_250_000, 999_000_000, 12_500] });
    const keysOf = (p: ShardPlan) => [...deliveredRequiredKeys(p)].sort();
    expect(keysOf(b)).toEqual(keysOf(a));
    expect(b.dependencyCertification.requiredDependenciesUnresolved).toBe(0);
  });

  it("G - a dependency that does not exist is disclosed by name and never fabricated", () => {
    const plan = planFor({ ...BASE, crossRefSection: "99.99(z)", crossRefSectionExists: false });
    const dep = plan.shards.flatMap((s) => s.requiredDependencies).find((d) => d.key === sectionKey("99.99(z)"));
    expect(dep, "the cited-but-absent section is still DERIVED as required").toBeDefined();
    expect(dep!.disposition).toBe("UNDELIVERABLE_DISCLOSED");
    expect(dep!.fullText).toBe("");
    // it is disclosed to the model by name, never fabricated and never silently dropped
    expect(plan.shards.some((s) => s.unresolvedContext.some((u) => u.key === sectionKey("99.99(z)")))).toBe(true);
    // an absent dependency is disclosed, not a delivery failure: the plan is still certified executable
    expect(plan.dependencyCertification.requiredDependenciesUnresolved).toBe(0);
  });
});
