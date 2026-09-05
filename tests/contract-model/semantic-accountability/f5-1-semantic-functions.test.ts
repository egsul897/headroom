/**
 * F-5.1 (Phase 3 Chewy remediation 5) - canonical semantic functions, role-blind identity and the false-merge guards.
 *
 * Anti-enumeration (mission §13): every scenario is a generic drafting SHAPE with invented names/numbers - nothing here
 * is a Chewy provision, a covenant family or a template. Trust safety (mission §14): distinct propositions never merge
 * because functions happen to coincide, uncertainty stays explicit, coverage/values/spans/slots/lineage survive migration.
 */
import { describe, expect, it } from "vitest";
import { computeInventoryItemId, normalizeInventorySubmission, normalizedStart } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { deriveLegacyRole, deriveSemanticFunctions, effectsContradict, functionsOf, functionsSignature, roleToFunctions, unionFunctions } from "../../../lib/contract-model/compiler/semantic-accountability/semantic-functions";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import type { SemanticInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { buildTestIndex } from "../context-retrieval-test-utils";

const DOC = "f5-1-synthetic-doc";
const TEXT = [
  "ARTICLE VII",
  "NEGATIVE COVENANTS",
  "",
  "SECTION 7.05. Omega Restrictions. The Company shall not, and shall not permit any Subsidiary to, make any Omega Payment; provided that the Company may make Omega Payments so long as no Trigger Event has occurred and is continuing.",
  "(a) Omega Payments in an aggregate amount not to exceed the greater of $50,000,000 and 12.5% of Consolidated EBITDA;",
  "(b) Omega Payments made in reliance on the Builder Amount, so long as the Total Leverage Ratio does not exceed 4.00 to 1.00; and",
  "(c) Omega Payments permitted pursuant to Section 6.01(b)(12); provided that amounts under clauses (x) and (y) shall not exceed $100,000,000 in the aggregate.",
  "(d) upon an Event of Default, the Omega Commitment terminates and no further Omega Payment may be made.",
  "(e) the Company may make Investments in any Subsidiary, other than any Unrestricted Subsidiary that is a Zeta Entity, in an amount not to exceed $7,000,000 within ninety (90) days after the Closing Date.",
  "",
  "SECTION 6.01. Indebtedness. The Company may incur Indebtedness as set out in clauses (b)(1) through (b)(12).",
].join("\n");

function build(sectionRef: string) {
  const index = buildTestIndex([{ documentId: DOC, label: "synthetic", text: TEXT }]);
  const anchor = index.findNodesByRef(DOC, sectionRef)[0]!;
  const operativeText = index.getNodeText(anchor.nodeId, "DESCENDANTS");
  const sourceContext = resolveSourceContext({ index, documentId: DOC, operativeSourceText: operativeText, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: TEXT });
  return { index, sourceContext };
}
const wire = (localRef: string, role: string, excerpt: string, extra: Partial<WireInventoryItem> = {}): WireInventoryItem => ({ localRef, semanticRole: role, proposition: `${role}: ${excerpt.slice(0, 40)}`, excerpt, regionId: null, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", ...extra });
const { index, sourceContext } = build("7.05");
const input = { candidateRef: "f5-1-unit", sourceContext, structuralIndex: index };
const norm = (items: WireInventoryItem[]) => normalizeInventorySubmission(input, items);
const ids = (r: { items: SemanticInventoryItem[] }) => r.items.map((i) => i.inventoryItemId).sort();
const one = (r: { items: SemanticInventoryItem[] }, needle: string) => r.items.find((i) => i.sourceSpan.excerpt === needle) ?? r.items.find((i) => i.sourceSpan.excerpt.startsWith(needle)) ?? r.items.find((i) => i.sourceSpan.excerpt.includes(needle))!;

describe("F-5.1 A - 'the greater of $50M and 12.5% of EBITDA': a branch is value + formula component + alternative at once, never a forced choice", () => {
  it("three runs labelling the $50M branch VALUE / FORMULA_COMPONENT / ALTERNATIVE freeze to ONE identity; the canonical functions carry all three", () => {
    const runs = ["VALUE", "FORMULA_COMPONENT", "ALTERNATIVE"].map((role) => norm([wire("s", "ALTERNATIVE", "the greater of $50,000,000 and 12.5% of Consolidated EBITDA"), wire("x", role, "$50,000,000"), wire("y", role, "12.5% of Consolidated EBITDA")]));
    expect(ids(runs[1]!)).toEqual(ids(runs[0]!));
    expect(ids(runs[2]!)).toEqual(ids(runs[0]!));
    for (const r of runs) {
      expect(r.items).toHaveLength(3); // selection + two branches stay atomic (mission §9)
      const branch = one(r, "$50,000,000");
      expect(branch.sourceSpan.excerpt).toBe("$50,000,000");
      expect(branch.semanticFunctions!.quantitative).toContain("VALUE"); // a stated number with no comparator is a VALUE (deterministic)
      expect(branch.semanticFunctions!.logic).toContain("ALTERNATIVE"); // it hangs from "the greater of" in the same slot (deterministic)
      expect(one(r, "the greater of").semanticFunctions!.logic).toContain("ALTERNATIVE");
    }
    expect(one(runs[1]!, "$50,000,000").semanticFunctions!.quantitative).toEqual(["VALUE", "FORMULA_COMPONENT"]);
    expect(one(runs[1]!, "12.5%").declaredRoles).toEqual(["FORMULA_COMPONENT"]);
  });
  it("the model may declare several roles at once (additionalRoles); they union into the canonical functions and the legacy role stays the declared primary", () => {
    const r = norm([wire("x", "ALTERNATIVE", "$50,000,000", { additionalRoles: ["VALUE", "FORMULA_COMPONENT", "NOT_A_ROLE"] })]);
    const it_ = r.items[0]!;
    expect(it_.declaredRoles).toEqual(["ALTERNATIVE", "VALUE", "FORMULA_COMPONENT", "OTHER"]);
    expect(functionsSignature(it_.semanticFunctions!)).toBe("logic:ALTERNATIVE|quantitative:VALUE|quantitative:FORMULA_COMPONENT");
    expect(it_.semanticRole).toBe("ALTERNATIVE");
    expect(it_.functionProvenance!.deterministic).toEqual([]);
  });
});

describe("F-5.1 B - 'so long as Total Leverage Ratio does not exceed 4.00x': condition + threshold + ratio without conflation", () => {
  it("CONDITION and THRESHOLD labels over the proviso are one identity carrying logic:CONDITION and quantitative:THRESHOLD with the RATIO value attached", () => {
    const ex = "so long as the Total Leverage Ratio does not exceed 4.00 to 1.00";
    const a = norm([wire("c", "CONDITION", ex)]);
    const b = norm([wire("t", "THRESHOLD", ex)]);
    expect(ids(a)).toEqual(ids(b));
    for (const r of [a, b]) {
      const it_ = r.items[0]!;
      expect(it_.semanticFunctions!.logic).toContain("CONDITION"); // "so long as" opener (deterministic) even when the model said THRESHOLD
      expect(it_.semanticFunctions!.quantitative).toContain("THRESHOLD"); // "does not exceed" + a stated ratio (deterministic) even when the model said CONDITION
      expect(it_.quantitativeValues.map((v) => v.kind)).toEqual(["RATIO"]);
      expect(it_.semanticFunctions!.quantitative).not.toContain("VALUE"); // a compared number is a threshold, not a bare value
    }
    expect(a.items[0]!.semanticRole).toBe("CONDITION");
    expect(b.items[0]!.semanticRole).toBe("THRESHOLD"); // legacy role honours the consistent declared primary
    expect(a.items[0]!.functionProvenance!.deterministic).toEqual(["quantitative:THRESHOLD"]);
  });
});

describe("F-5.1 C - 'pursuant to Section 6.01(b)(12)': explicit reference without REFERENCE-vs-DEPENDENCY identity drift", () => {
  it("REFERENCE and DEPENDENCY labels over the citation are one identity; dependency:REFERENCE is deterministic from the citation itself", () => {
    const ex = "permitted pursuant to Section 6.01(b)(12)";
    const a = norm([wire("r", "REFERENCE", ex, { referencedSections: ["Section 6.01(b)(12)"] })]);
    const b = norm([wire("d", "DEPENDENCY", ex)]);
    expect(ids(a)).toEqual(ids(b));
    expect(a.items[0]!.semanticFunctions!.dependency).toEqual(["REFERENCE"]);
    expect(b.items[0]!.semanticFunctions!.dependency).toEqual(["REFERENCE", "DEPENDENCY"]);
    expect(b.items[0]!.functionProvenance!.deterministic).toEqual(["dependency:REFERENCE"]);
  });
  it("a citation nested inside the permission it qualifies stays its OWN identity (different start) - the permission does not swallow it", () => {
    const r = norm([wire("p", "PERMISSION", "Omega Payments permitted pursuant to Section 6.01(b)(12)"), wire("d", "REFERENCE", "pursuant to Section 6.01(b)(12)", { parentRef: "p" })]);
    expect(r.items).toHaveLength(2);
    expect(r.rejectedDuplicates).toBe(0);
    const perm = one(r, "Omega Payments permitted");
    expect(perm.semanticFunctions!.dependency).toContain("REFERENCE"); // the permission's own span cites the section too
    expect(one(r, "pursuant to").parentItemId).toBe(perm.inventoryItemId);
  });
});

describe("F-5.1 D - 'amounts under clauses (x) and (y) shall not exceed $100M in the aggregate': shared cap + cap value + references", () => {
  it("SHARED_CAP, THRESHOLD and REFERENCE labels over the proviso are one identity; no scalar role absorbs the others", () => {
    const ex = "amounts under clauses (x) and (y) shall not exceed $100,000,000 in the aggregate";
    const runs = [norm([wire("s", "SHARED_CAP", ex, { referencedSections: ["clause (x)", "clause (y)"] })]), norm([wire("t", "THRESHOLD", ex)]), norm([wire("r", "REFERENCE", ex)])];
    expect(ids(runs[1]!)).toEqual(ids(runs[0]!));
    expect(ids(runs[2]!)).toEqual(ids(runs[0]!));
    const shared = runs[0]!.items[0]!;
    expect(shared.semanticFunctions!.dependency).toEqual(["REFERENCE", "SHARED_CAP"]);
    expect(shared.semanticFunctions!.quantitative).toEqual(["THRESHOLD"]);
    expect(shared.semanticRole).toBe("SHARED_CAP");
    const merged = norm([wire("s", "SHARED_CAP", ex), wire("t", "THRESHOLD", ex), wire("r", "REFERENCE", ex)]);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]!.declaredRoles).toEqual(["SHARED_CAP", "THRESHOLD", "REFERENCE"]);
    expect(merged.items[0]!.semanticRole).toBe("SHARED_CAP");
    expect(merged.items[0]!.quantitativeValues.map((v) => v.rawText)).toEqual(["$100,000,000"]);
  });
});

describe("F-5.1 E - 'upon an Event of Default, the commitment terminates': trigger vs operative consequence", () => {
  it("the trigger and the consequence are two propositions (different starts) even when one run labels both TRIGGER; the trigger function is deterministic from 'upon'", () => {
    const a = norm([wire("t", "TRIGGER", "upon an Event of Default"), wire("c", "PROHIBITION", "no further Omega Payment may be made")]);
    const b = norm([wire("t", "TRIGGER", "upon an Event of Default"), wire("c", "TRIGGER", "no further Omega Payment may be made")]);
    expect(a.items).toHaveLength(2);
    expect(ids(a)).toEqual(ids(b));
    expect(one(a, "upon an Event").semanticFunctions!.logic).toEqual(["TRIGGER"]);
    expect(one(a, "no further").semanticFunctions!.effect).toBe("PROHIBITION");
    expect(one(b, "no further").semanticFunctions!.effect).toBe("NONE"); // the model's label is honoured as declared, never invented
    const c = norm([wire("t", "CONDITION", "upon an Event of Default")]);
    expect(c.items[0]!.semanticFunctions!.logic).toEqual(["CONDITION", "TRIGGER"]);
  });
});

describe("F-5.1 F - a genuine permission and a genuine exception over overlapping text stay distinct", () => {
  it("the carve-out nested inside the permission keeps its own identity; the permission carries effect:PERMISSION, the carve-out logic:EXCEPTION", () => {
    const perm = "the Company may make Investments in any Subsidiary, other than any Unrestricted Subsidiary that is a Zeta Entity";
    const exc = "other than any Unrestricted Subsidiary that is a Zeta Entity";
    const r = norm([wire("p", "PERMISSION", perm), wire("e", "EXCEPTION", exc, { parentRef: "p" })]);
    expect(r.items).toHaveLength(2);
    expect(one(r, "may make").semanticFunctions!.effect).toBe("PERMISSION");
    expect(one(r, "may make").semanticFunctions!.logic).toEqual([]); // the permission is not an exception because its text contains one
    expect(one(r, "other than any").semanticFunctions!.logic).toEqual(["EXCEPTION"]);
    expect(one(r, "other than any").parentItemId).toBe(one(r, "may make").inventoryItemId);
    // the same two propositions in the other order / the other way round get the same two identities
    expect(ids(norm([wire("e", "EXCEPTION", exc), wire("p", "PERMISSION", perm)]))).toEqual(ids(r));
  });
  it("the SAME span labelled PERMISSION in one run and EXCEPTION in the other (a lettered carve-out that grants what it excepts) is ONE identity with both functions", () => {
    const ex = "the Company may make Investments in any Subsidiary";
    const a = norm([wire("p", "PERMISSION", ex)]);
    const b = norm([wire("e", "EXCEPTION", ex)]);
    expect(ids(a)).toEqual(ids(b));
    const both = norm([wire("p", "PERMISSION", ex), wire("e", "EXCEPTION", ex)]);
    expect(both.items).toHaveLength(1);
    expect(both.items[0]!.semanticFunctions!.effect).toBe("PERMISSION");
    expect(both.items[0]!.semanticFunctions!.logic).toEqual(["EXCEPTION"]);
  });
});

describe("F-5.1 trust safety (mission §14)", () => {
  it("two genuinely different propositions never merge because their canonical functions coincide: disjoint spans, different values, contradictory effects, nested starts", () => {
    // same slot & role & functions, disjoint spans
    const disjoint = norm([wire("a", "PERMISSION", "Omega Payments made in reliance on the Builder Amount"), wire("b", "PERMISSION", "Omega Payments to repurchase Equity Interests")]);
    expect(disjoint.items).toHaveLength(1 + 0 + (disjoint.rejectedUnverifiable === 1 ? 0 : 1)); // the second excerpt is not in this section -> rejected, never merged into the first
    expect(disjoint.rejectedDuplicates).toBe(0);
    // different values over the same words
    const values = norm([wire("x", "VALUE", "$50,000,000"), wire("y", "VALUE", "$100,000,000"), wire("z", "VALUE", "$7,000,000")]);
    expect(new Set(ids(values)).size).toBe(3);
    // contradictory deontic effects over one stretch
    const ex = "the Company may make Investments in any Subsidiary";
    const contradictory = norm([wire("p", "PERMISSION", ex), wire("q", "PROHIBITION", ex), wire("r", "REQUIREMENT", ex)]);
    expect(contradictory.items).toHaveLength(3);
    expect(contradictory.items.every((i) => i.mergedDuplicates === undefined || i.mergedDuplicates === 0)).toBe(true);
    expect(effectsContradict("PERMISSION", "PROHIBITION")).toBe(true);
    expect(effectsContradict("PERMISSION", "NONE")).toBe(false);
    // a nested clause that starts elsewhere
    const nested = norm([wire("p", "PERMISSION", "the Company may make Investments in any Subsidiary, other than any Unrestricted Subsidiary that is a Zeta Entity, in an amount not to exceed $7,000,000"), wire("c", "CONDITION", "in an amount not to exceed $7,000,000")]);
    expect(nested.items).toHaveLength(2); // both carry $7,000,000, but the cap clause is not the bare value and starts elsewhere
    expect(one(nested, "in an amount not").semanticFunctions!.quantitative).toEqual(["THRESHOLD"]);
  });
  it("a bare value inside its wider wording is boundary slop, not a nested proposition ('$50,000,000' vs 'the greater of $50,000,000' - value-pinned)", () => {
    const r = norm([wire("a", "ALTERNATIVE", "$50,000,000"), wire("b", "VALUE", "the greater of $50,000,000")]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.declaredRoles).toEqual(["ALTERNATIVE", "VALUE"]);
  });
  it("uncertainty stays explicit and ambiguity never becomes completeness: REVIEW_UNCERTAIN / ambiguity flags survive the merge, OTHER contributes no function", () => {
    const ex = "so long as the Total Leverage Ratio does not exceed 4.00 to 1.00";
    const r = norm([wire("a", "OTHER", ex, { materiality: "REVIEW_UNCERTAIN", ambiguity: "AMBIGUOUS_DRAFTING", ambiguityReason: "could be read either way" }), wire("b", "OTHER", ex, { materiality: "REVIEW_UNCERTAIN" })]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.materiality).toBe("REVIEW_UNCERTAIN");
    expect(r.items[0]!.ambiguity).toBe("AMBIGUOUS_DRAFTING");
    expect(r.items[0]!.declaredRoles).toEqual(["OTHER"]);
    expect(r.items[0]!.functionProvenance!.declared).toEqual([]);
    expect(r.items[0]!.semanticFunctions!.logic).toEqual(["CONDITION"]); // structure still says what it is
    expect(r.items[0]!.semanticRole).toBe("CONDITION"); // legacy role derived from the canonical functions when the model said nothing usable
  });
  it("materiality is unchanged by relabelling; quantitative values, spans, slot ids and lineage survive the merge", () => {
    const perm = "the Company may make Investments in any Subsidiary";
    const r = norm([wire("p", "PERMISSION", perm, { materiality: "MATERIAL" }), wire("e", "EXCEPTION", perm, { materiality: "MATERIAL" }), wire("c", "CONDITION", "in an amount not to exceed $7,000,000", { parentRef: "e" }), wire("t", "TIME_PERIOD", "within ninety (90) days after the Closing Date", { parentRef: "p" })]);
    const p = one(r, "may make");
    expect(p.materiality).toBe("MATERIAL"); // two MATERIAL claims never inflate to CRITICAL
    expect(p.slotId).toMatch(/^operative:/);
    expect(one(r, "not to exceed $7,000,000").parentItemId).toBe(p.inventoryItemId); // the parent ref pointed at the merged-away duplicate; it resolves to the surviving identity
    expect(one(r, "ninety").parentItemId).toBe(p.inventoryItemId);
    expect(one(r, "ninety").semanticFunctions!.quantitative).toEqual(["TIME_PERIOD"]);
    expect(one(r, "ninety").quantitativeValues.map((v) => v.kind)).toEqual(["DAYS"]);
    expect(one(r, "not to exceed $7,000,000").quantitativeValues.map((v) => v.rawText)).toEqual(["$7,000,000"]);
  });
  it("the deterministic rules only ADD structural functions; they never decide a deontic effect and never remove a declared function", () => {
    const f = deriveSemanticFunctions({ declaredRoles: ["EXCEPTION"], spanText: "provided that the Company shall not incur Indebtedness in excess of $5,000,000 pursuant to Section 6.01", precedingText: "", values: [{ kind: "MONEY", rawText: "$5,000,000", normalizedValue: 5_000_000, unit: "USD", charStart: 0, charEnd: 10 }], referencedSections: [], operative: "OPERATIVE" });
    expect(f.functions.effect).toBe("NONE"); // "shall not" is not inferred into PROHIBITION by keyword
    expect(f.functions.logic).toEqual(["CONDITION", "EXCEPTION"]);
    expect(f.functions.quantitative).toEqual(["THRESHOLD"]);
    expect(f.functions.dependency).toEqual(["REFERENCE"]);
    expect(f.provenance.declared).toEqual(["logic:EXCEPTION"]);
    expect(f.provenance.deterministic.sort()).toEqual(["dependency:REFERENCE", "logic:CONDITION", "quantitative:THRESHOLD"]);
    const nothing = deriveSemanticFunctions({ declaredRoles: ["OTHER"], spanText: "a descriptive sentence with no structure", values: [], referencedSections: [], operative: "DEFINITIONAL" });
    expect(functionsSignature(nothing.functions)).toBe("");
    expect(nothing.functions.effect).toBe("NONE"); // the operative flag is not folded into the effect dimension
  });
});

describe("F-5.1 identity mechanism (mission §8) and compatibility (mission §6)", () => {
  it("computeInventoryItemId is role-blind: slot, coordination position, cluster ordinal and values only", () => {
    const v = [{ kind: "MONEY" as const, rawText: "$1", normalizedValue: 1, unit: "USD", charStart: 0, charEnd: 2 }];
    expect(computeInventoryItemId("u", "operative", "operative:7.05(a)#1", 0, v)).toBe(computeInventoryItemId("u", "operative", "operative:7.05(a)#1", 0, v));
    expect(computeInventoryItemId("u", "operative", "operative:7.05(a)#1", 0, v)).not.toBe(computeInventoryItemId("u", "operative", "operative:7.05(a)#1", 1, v));
    expect(computeInventoryItemId("u", "operative", "operative:7.05(a)#1", 0, v)).not.toBe(computeInventoryItemId("u", "operative", "operative:7.05(a)#1", 0, []));
    expect(computeInventoryItemId("u", "operative", "operative:7.05(a)#1", 0, v, 1)).not.toBe(computeInventoryItemId("u", "operative", "operative:7.05(a)#1", 0, v, 0));
  });
  it("normalizedStart skips enumerators and coordinating connectives so '(a) X' and 'and X' start where 'X' starts", () => {
    const t = "; and (b) Omega Payments made in reliance";
    expect(normalizedStart(t, 0)).toBe(t.indexOf("Omega"));
    expect(normalizedStart(t, t.indexOf("(b)"))).toBe(t.indexOf("Omega"));
    expect(normalizedStart(t, t.indexOf("Omega"))).toBe(t.indexOf("Omega"));
  });
  it("legacy semanticRole round-trips a single declared role, derives from precedence otherwise, and v4 evidence maps its scalar role onto functions", () => {
    for (const role of ["VALUE", "FORMULA_COMPONENT", "THRESHOLD", "CONDITION", "EXCEPTION", "PERMISSION", "PROHIBITION", "REQUIREMENT", "ALTERNATIVE", "TRIGGER", "TIME_PERIOD", "DEPENDENCY", "REFERENCE", "RECLASSIFICATION", "SHARED_CAP", "CURE"] as const) {
      expect(deriveLegacyRole(roleToFunctions(role), [role])).toBe(role);
    }
    expect(deriveLegacyRole(roleToFunctions("OTHER"), ["OTHER"])).toBe("OTHER");
    expect(deriveLegacyRole(unionFunctions(roleToFunctions("ALTERNATIVE"), roleToFunctions("VALUE")))).toBe("ALTERNATIVE");
    expect(deriveLegacyRole(unionFunctions(roleToFunctions("SHARED_CAP"), roleToFunctions("THRESHOLD")))).toBe("SHARED_CAP");
    expect(deriveLegacyRole(unionFunctions(roleToFunctions("PERMISSION"), roleToFunctions("REFERENCE")))).toBe("PERMISSION");
    const v4 = { semanticRole: "DEPENDENCY" as const };
    expect(functionsOf(v4).dependency).toEqual(["DEPENDENCY"]);
    expect(functionsOf({ semanticRole: "OTHER", semanticFunctions: roleToFunctions("CURE") }).logic).toEqual(["CURE"]);
  });
});
