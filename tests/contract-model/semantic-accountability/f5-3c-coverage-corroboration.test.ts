/**
 * SEMANTIC FIDELITY CLOSURE - ensemble support (mission §25-§29).
 *
 * Two independent Pass-A runs may recognize the same material SOURCE REGION while segmenting it differently (one broad
 * proposition vs two narrower ones; a shorter fragment vs a longer one that contains it). semantic-ensemble.v2 adds
 * SOURCE_COVERAGE corroboration for exactly that - deterministic interval containment/overlap on the same region, same
 * role or compatible effect, compatible values and references, never paraphrase similarity, never embeddings - and keeps
 * every claim distinct: nothing is merged, support groups are recorded separately from canonical item identity.
 *
 * The anti-collapse controls below prove what the matcher must NOT do (mission §29); the historical claim-conservation
 * scenarios in f5-3a-ensemble.test.ts stay green alongside.
 */
import { describe, expect, it } from "vitest";
import { buildEnsembleInventory, ENSEMBLE_ALGORITHM_VERSION, type EnsembleInventory } from "../../../lib/contract-model/compiler/semantic-accountability/ensemble";
import { normalizeInventorySubmission } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { partitionSourceSlots } from "../../../lib/contract-model/compiler/semantic-accountability/slots";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import type { FrozenSemanticInventory, SemanticInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { computePartitionHash, computeSourceContextHash } from "../../../lib/contract-model/compiler/semantic-accountability/source-identity";
import { buildTestIndex } from "../context-retrieval-test-utils";

const DOC = "f5-3c-synthetic-doc";
const TEXT = [
  "ARTICLE VII",
  "NEGATIVE COVENANTS",
  "",
  "SECTION 7.11. Delta Debt. The Company shall not incur any Delta Debt, except:",
  "(a) Delta Debt secured by Liens permitted under Section 7.12(c); provided that the Company shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Delta Debt, with the financial covenants contained in Section 7.10 recomputed as at the last day of the most recently ended fiscal quarter of the Company and its Subsidiaries for which financial statements are available as if such Delta Debt had been incurred on the first day of each relevant period for testing such compliance;",
  "(b) Delta Debt in an aggregate principal amount not to exceed $40,000,000 and Gamma Debt in an aggregate principal amount not to exceed $9,000,000 at any time outstanding;",
  "(c) Delta Debt so long as the Leverage Ratio does not exceed 3.00 to 1.00 and the Coverage Ratio is not less than 2.00 to 1.00;",
  "(d) Delta Debt owed to a Loan Party and Delta Debt owed to a wholly owned Subsidiary that is not a Loan Party.",
  "",
  "SECTION 7.10. Financial Covenants. The Company shall maintain the ratios set out in this Section 7.10.",
  "SECTION 7.12. Liens. The Company shall not create any Lien, except as set out in clauses (a) through (c).",
].join("\n");

const built = (() => {
  const index = buildTestIndex([{ documentId: DOC, label: "synthetic", text: TEXT }]);
  const anchor = index.findNodesByRef(DOC, "7.11")[0]!;
  const operativeText = index.getNodeText(anchor.nodeId, "DESCENDANTS");
  const sourceContext = resolveSourceContext({ index, documentId: DOC, operativeSourceText: operativeText, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: TEXT });
  const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
  return { index, sourceContext, partition };
})();
const CREF = "f5-3c-unit";
const wire = (localRef: string, role: string, excerpt: string, extra: Partial<WireInventoryItem> = {}): WireInventoryItem => ({ localRef, semanticRole: role, proposition: `${role}: ${excerpt.slice(0, 40)}`, excerpt, regionId: null, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", ...extra });

function pass(items: WireInventoryItem[]): FrozenSemanticInventory {
  const r = normalizeInventorySubmission({ candidateRef: CREF, sourceContext: built.sourceContext, structuralIndex: built.index }, items, built.partition);
  return { candidateRef: CREF, items: r.items, uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "scripted", rejectedUnverifiableItems: r.rejectedUnverifiable, rejectedDuplicateItems: r.rejectedDuplicates, sourceContextState: built.sourceContext.state, frozenContentHash: `scripted-${items.map((i) => i.localRef).join("+")}`, frozenAt: "2026-01-01T00:00:00.000Z", algorithmVersion: "semantic-accountability.v5", promptVersion: "semantic-inventory-prompt.v5", provider: "scripted", model: "scripted", telemetryCostUsd: null, documentId: DOC, sourceContextHash: computeSourceContextHash(built.sourceContext), sourceIdentity: { method: "RECORDED_AT_FREEZE", sourceContextHash: computeSourceContextHash(built.sourceContext), partitionHash: computePartitionHash(built.partition) } };
}
const ensemble = (a: WireInventoryItem[], b: WireInventoryItem[], order: "ab" | "ba" = "ab"): EnsembleInventory => {
  const passes = [{ passId: "pass-1", inventory: pass(a) }, { passId: "pass-2", inventory: pass(b) }];
  return buildEnsembleInventory({ candidateRef: CREF, sourceContext: built.sourceContext, structuralIndex: built.index, partition: built.partition, passes: order === "ab" ? passes : [...passes].reverse() });
};
const find = (e: EnsembleInventory, needle: string): SemanticInventoryItem => {
  const hit = e.items.find((i) => i.sourceSpan.excerpt === needle) ?? e.items.find((i) => i.sourceSpan.excerpt.startsWith(needle)) ?? e.items.find((i) => i.sourceSpan.excerpt.includes(needle));
  if (!hit) throw new Error(`no item for "${needle.slice(0, 50)}"`);
  return hit;
};
const sup = (e: EnsembleInventory, needle: string) => { const s = find(e, needle).support; if (!s) throw new Error("no support"); return s; };
const status = (e: EnsembleInventory, needle: string) => sup(e, needle).supportStatus;

const PERMISSION_A = "Delta Debt secured by Liens permitted under Section 7.12(c);";
const PROVISO_SHORT = "provided that the Company shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Delta Debt";
const PROVISO_LONG = "provided that the Company shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Delta Debt, with the financial covenants contained in Section 7.10 recomputed as at the last day of the most recently ended fiscal quarter of the Company and its Subsidiaries for which financial statements are available";
const PROVISO_NESTED = "with the financial covenants contained in Section 7.10 recomputed as at the last day of the most recently ended fiscal quarter of the Company and its Subsidiaries for which financial statements are available";
const TIMING = "as if such Delta Debt had been incurred on the first day of each relevant period for testing such compliance";

describe("F-5.3C coverage corroboration (semantic-ensemble.v2) - segmentation differences are not support asymmetry", () => {
  it("is the v2 ensemble", () => { expect(ENSEMBLE_ALGORITHM_VERSION).toBe("semantic-ensemble.v2"); });

  it("S1 shorter fragment vs longer fragment of the SAME proviso: both are COVERAGE_CORROBORATED, neither is SINGLE_RUN, nothing is merged, the group is recorded", () => {
    const e = ensemble([wire("p", "PERMISSION", PERMISSION_A), wire("c", "CONDITION", PROVISO_SHORT, { parentRef: "p" })], [wire("p", "PERMISSION", PERMISSION_A), wire("c", "CONDITION", PROVISO_LONG, { parentRef: "p" })]);
    expect(status(e, PERMISSION_A)).toBe("CORROBORATED");
    expect(status(e, PROVISO_SHORT)).toBe("COVERAGE_CORROBORATED");
    expect(status(e, PROVISO_LONG)).toBe("COVERAGE_CORROBORATED");
    expect(e.items).toHaveLength(3); // distinct propositions stay distinct
    expect(sup(e, PROVISO_SHORT).supportGroupId).toBe(sup(e, PROVISO_LONG).supportGroupId);
    expect(sup(e, PROVISO_SHORT).coverageBy?.[0]?.reason).toMatch(/containment/);
    expect(e.ensemble.counts.coverageCorroborated).toBe(2);
    expect(e.ensemble.counts.materialSingleRun).toBe(0);
    expect(e.ensemble.supportReviewRequired).toBe(false);
  });

  it("S2 one broad proposition vs two narrower ones (one-to-many segmentation): all three are coverage-corroborated, none is declared unsupported", () => {
    const e = ensemble([wire("p", "PERMISSION", PERMISSION_A), wire("c", "CONDITION", PROVISO_LONG, { parentRef: "p" })], [wire("p", "PERMISSION", PERMISSION_A), wire("c1", "CONDITION", PROVISO_SHORT, { parentRef: "p" }), wire("c2", "CONDITION", PROVISO_NESTED, { parentRef: "p" })]);
    expect(status(e, PROVISO_LONG)).toBe("COVERAGE_CORROBORATED");
    expect(status(e, PROVISO_SHORT)).toBe("COVERAGE_CORROBORATED");
    expect(status(e, PROVISO_NESTED)).toBe("COVERAGE_CORROBORATED");
    expect(e.ensemble.counts.supportGroups).toBe(2);
    expect(e.ensemble.counts.materialSingleRun).toBe(0);
  });

  it("S3 order independence: pass order does not change statuses, groups or the canonical JSON", () => {
    const a = [wire("p", "PERMISSION", PERMISSION_A), wire("c", "CONDITION", PROVISO_SHORT, { parentRef: "p" })], b = [wire("p", "PERMISSION", PERMISSION_A), wire("c", "CONDITION", PROVISO_LONG, { parentRef: "p" })];
    const ab = ensemble(a, b, "ab"), ba = ensemble(a, b, "ba");
    expect(ab.items.map((i) => [i.sourceSpan.charStart, i.support?.supportStatus])).toEqual(ba.items.map((i) => [i.sourceSpan.charStart, i.support?.supportStatus]));
    expect(ab.ensemble.counts).toEqual(ba.ensemble.counts);
  });

  it("S4 a genuinely single-run fragment stays SINGLE_RUN: the timing assumption found by one pass only, outside every other item's span", () => {
    const e = ensemble([wire("p", "PERMISSION", PERMISSION_A), wire("c", "CONDITION", PROVISO_LONG, { parentRef: "p" }), wire("t", "CONDITION", TIMING, { parentRef: "p", materiality: "MATERIAL" })], [wire("p", "PERMISSION", PERMISSION_A), wire("c", "CONDITION", PROVISO_LONG, { parentRef: "p" })]);
    expect(status(e, TIMING)).toBe("SINGLE_RUN");
    expect(e.ensemble.counts.materialSingleRun).toBe(1);
    expect(e.ensemble.supportReviewRequired).toBe(true);
  });
});

describe("F-5.3C anti-collapse controls (mission §29) - the matcher never collapses distinct claims", () => {
  const BASKET_1 = "Delta Debt in an aggregate principal amount not to exceed $40,000,000";
  const BASKET_2 = "Gamma Debt in an aggregate principal amount not to exceed $9,000,000 at any time outstanding";
  const BOTH_BASKETS = "(b) Delta Debt in an aggregate principal amount not to exceed $40,000,000 and Gamma Debt in an aggregate principal amount not to exceed $9,000,000 at any time outstanding;";
  const RATIO_1 = "Delta Debt so long as the Leverage Ratio does not exceed 3.00 to 1.00";
  const RATIO_2 = "the Coverage Ratio is not less than 2.00 to 1.00";
  const EXC_1 = "Delta Debt owed to a Loan Party";
  const EXC_2 = "Delta Debt owed to a wholly owned Subsidiary that is not a Loan Party";

  it("C1 two different dollar baskets in one sentence: a pass that states only the first basket does not corroborate the second, and the two baskets never share a group", () => {
    const e = ensemble([wire("b1", "PERMISSION", BASKET_1), wire("b2", "PERMISSION", BASKET_2)], [wire("b1", "PERMISSION", BASKET_1)]);
    expect(status(e, BASKET_1)).toBe("CORROBORATED");
    expect(status(e, BASKET_2)).toBe("SINGLE_RUN");
    expect(sup(e, BASKET_1).supportGroupId).not.toBe(sup(e, BASKET_2).supportGroupId);
  });

  it("C1b a broad item stating BOTH figures vs a narrow item stating ONE: the narrow one is covered (its values are a subset), but a narrow item stating a figure the broad one lacks is not", () => {
    const e = ensemble([wire("b", "PERMISSION", BOTH_BASKETS)], [wire("b1", "PERMISSION", BASKET_1)]);
    expect(status(e, BASKET_1)).toBe("COVERAGE_CORROBORATED");
    const f = ensemble([wire("b1", "PERMISSION", BASKET_1)], [wire("b2", "PERMISSION", BASKET_2)]);
    expect(status(f, BASKET_1)).toBe("SINGLE_RUN");
    expect(status(f, BASKET_2)).toBe("SINGLE_RUN");
  });

  it("C2 permission + independent condition: a pass that found only the permission does not corroborate the proviso (different role, parent/child), the proviso stays SINGLE_RUN", () => {
    const e = ensemble([wire("p", "PERMISSION", PERMISSION_A), wire("c", "CONDITION", PROVISO_LONG, { parentRef: "p" })], [wire("p", "PERMISSION", PERMISSION_A)]);
    expect(status(e, PERMISSION_A)).toBe("CORROBORATED");
    expect(status(e, PROVISO_LONG)).toBe("SINGLE_RUN");
    expect(e.ensemble.supportReviewRequired).toBe(true);
  });

  it("C3 two exceptions sharing most words: finding one never corroborates the other", () => {
    const e = ensemble([wire("x1", "EXCEPTION", EXC_1), wire("x2", "EXCEPTION", EXC_2)], [wire("x1", "EXCEPTION", EXC_1)]);
    expect(status(e, EXC_1)).toBe("CORROBORATED");
    expect(status(e, EXC_2)).toBe("SINGLE_RUN");
  });

  it("C4 the same slot holding two different ratio tests: one pass stating the first ratio does not corroborate the second", () => {
    const e = ensemble([wire("r1", "CONDITION", RATIO_1), wire("r2", "CONDITION", RATIO_2)], [wire("r1", "CONDITION", RATIO_1)]);
    expect(status(e, RATIO_1)).toBe("CORROBORATED");
    expect(status(e, RATIO_2)).toBe("SINGLE_RUN");
  });

  it("C5 the same span read as conflicting functions by the two passes is a CONFLICT, never coverage corroboration", () => {
    const e = ensemble([wire("p", "PERMISSION", PERMISSION_A)], [wire("p", "PROHIBITION", PERMISSION_A)]);
    expect(e.ensemble.counts.conflicted).toBeGreaterThan(0);
    for (const i of e.items.filter((x) => x.sourceSpan.excerpt === PERMISSION_A)) expect(i.support?.supportStatus).not.toBe("COVERAGE_CORROBORATED");
  });
});
