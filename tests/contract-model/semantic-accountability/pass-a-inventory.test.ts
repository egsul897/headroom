/**
 * SEMANTIC ACCOUNTABILITY - Pass A gates over the general synthetic corpus
 * (mission §16/§17): CRITICAL inventory recall 100%, MATERIAL recall >= 98%,
 * material quantitative-value recall >= 99%, ZERO silent absences; plus the
 * source-context sufficiency layer (I39 truncation, I40 ambiguity, cross-
 * reference expansion with provenance), the deterministic scanner, the
 * anti-hallucination gate, empty-inventory suspicion, freeze/stability and
 * the anti-enumeration variants (I36-I38).
 */
import { describe, expect, it } from "vitest";
import { resolveReferenceTarget } from "../../../lib/contract-model/compiler/semantic-accountability/reference-resolver";
import { normalizeInventorySubmission, runSemanticInventory } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { scanQuantitativeValues } from "../../../lib/contract-model/compiler/semantic-accountability/quantitative";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import { CORPUS, I36_VARIANTS, I37_VARIANTS } from "./corpus";
import { accountRecall, buildIndexFor, buildScenario, DOC_ID, scriptedInventoryCaller, scriptedWireItems, silentAbsences, type BuiltScenario } from "./harness";

const built = new Map<string, Promise<BuiltScenario>>();
const get = (id: string) => built.get(id) ?? (() => { const p = buildScenario(CORPUS.find((s) => s.id === id)!); built.set(id, p); return p; })();

describe("semantic accountability - Pass A over the synthetic corpus (I1-I45)", () => {
  it("the corpus has at least 40 wholly synthetic scenarios and every named scenario I1-I45", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(40);
    for (let i = 1; i <= 45; i++) expect(CORPUS.some((s) => s.id === `I${i}`)).toBe(true);
  });

  for (const scenario of CORPUS) {
    it(`${scenario.id} ${scenario.title}: source context = ${scenario.expectedContextState}; 100% CRITICAL recall; every declared value found; 0 silent absences`, async () => {
      const b = await get(scenario.id);
      expect(b.sourceContext.state).toBe(scenario.expectedContextState);
      expect(b.inventory.inventoryStatus).toBe("INVENTORY_OK");
      expect(b.inventory.rejectedUnverifiableItems).toBe(0);
      const recall = accountRecall(b);
      expect(recall.missingRefs).toEqual([]);
      expect(recall.missingValues).toEqual([]);
      expect(silentAbsences(b)).toEqual([]);
      for (const ref of scenario.expectedUnresolvedReferenceStatuses ?? []) expect(b.sourceContext.unresolvedReferences.map((u) => u.status)).toContain(ref);
      // Every expansion region carries real provenance (mission §13).
      for (const r of b.sourceContext.regions.filter((r) => r.kind !== "OPERATIVE")) {
        expect(r.sourceNodeId).toBeTruthy();
        expect(r.sectionRef).toBeTruthy();
        expect(r.charEnd).toBeGreaterThan(r.charStart);
        expect(r.expandedFor?.referenceText).toBeTruthy();
      }
    });
  }

  it("aggregate Pass A gates (mission §17): CRITICAL 100%, MATERIAL >= 98%, quantitative >= 99%, silent absences = 0", async () => {
    const totals = { criticalExpected: 0, criticalRecalled: 0, materialExpected: 0, materialRecalled: 0, valuesExpected: 0, valuesRecalled: 0 };
    let silent = 0;
    for (const s of CORPUS) {
      const b = await get(s.id);
      const r = accountRecall(b);
      totals.criticalExpected += r.criticalExpected;
      totals.criticalRecalled += r.criticalRecalled;
      totals.materialExpected += r.materialExpected;
      totals.materialRecalled += r.materialRecalled;
      totals.valuesExpected += r.valuesExpected;
      totals.valuesRecalled += r.valuesRecalled;
      silent += silentAbsences(b).length;
    }
    expect(totals.criticalExpected).toBeGreaterThan(80);
    expect(totals.criticalRecalled / totals.criticalExpected).toBe(1);
    expect(totals.materialRecalled / totals.materialExpected).toBeGreaterThanOrEqual(0.98);
    expect(totals.valuesExpected).toBeGreaterThan(80);
    expect(totals.valuesRecalled / totals.valuesExpected).toBeGreaterThanOrEqual(0.99);
    expect(silent).toBe(0);
  });

  it("stability (mission §27): two independent Pass A runs over the same source produce identical item ids and the same frozen hash", async () => {
    for (const s of CORPUS.slice(0, 12)) {
      const a = await buildScenario(s);
      const b = await buildScenario(s);
      expect(b.inventory.items.map((i) => i.inventoryItemId)).toEqual(a.inventory.items.map((i) => i.inventoryItemId));
      expect(b.inventory.frozenContentHash).toBe(a.inventory.frozenContentHash);
    }
  });

  it("inventory ids are content-derived, never positional or proposition-derived: reordering and rewording the model's output leaves ids unchanged", async () => {
    const s = CORPUS.find((x) => x.id === "I6")!;
    const base = await buildScenario(s);
    const reordered = scriptedWireItems([...s.items].reverse()).map((w) => ({ ...w, proposition: `reworded ${w.proposition}` }));
    const alt = normalizeInventorySubmission({ candidateRef: s.id, sourceContext: base.sourceContext }, reordered);
    expect(new Set(alt.items.map((i) => i.inventoryItemId))).toEqual(new Set(base.inventory.items.map((i) => i.inventoryItemId)));
  });
});

describe("semantic accountability - Pass A deterministic gates", () => {
  it("anti-hallucination: an excerpt that is not a real substring of any region is rejected and counted, never trusted", async () => {
    const s = CORPUS.find((x) => x.id === "I6")!;
    const b = await buildScenario(s);
    const wire = [...scriptedWireItems(s.items), { ...scriptedWireItems(s.items)[0]!, localRef: "fake", excerpt: "Indebtedness not to exceed $999,000,000 under the imaginary basket" }];
    const inv = await runSemanticInventory({ candidateRef: s.id, documentId: DOC_ID, sourceContext: b.sourceContext, caller: scriptedInventoryCaller(wire) });
    expect(inv.rejectedUnverifiableItems).toBe(1);
    expect(inv.items.length).toBe(s.items.length);
    expect(inv.items.some((i) => i.sourceSpan.excerpt.includes("$999,000,000"))).toBe(false);
  });

  it("duplicate role+span submissions are dropped and counted; whitespace-variant excerpts still locate to real offsets", async () => {
    const s = CORPUS.find((x) => x.id === "I6")!;
    const b = await buildScenario(s);
    const base = scriptedWireItems(s.items);
    const wire = [...base, { ...base[1]!, localRef: "dup", excerpt: base[1]!.excerpt.replace(/ /g, "  ") }];
    const inv = await runSemanticInventory({ candidateRef: s.id, documentId: DOC_ID, sourceContext: b.sourceContext, caller: scriptedInventoryCaller(wire) });
    expect(inv.rejectedDuplicateItems).toBe(1);
    expect(inv.items.length).toBe(s.items.length);
  });

  it("the scanner completes values the model omitted: every declared ground-truth value is attached even though the scripted model listed none", async () => {
    const b = await buildScenario(CORPUS.find((x) => x.id === "I20")!);
    const step = b.inventory.items.find((i) => i.semanticRole === "ALTERNATIVE")!;
    expect(step.quantitativeValues.map((v) => `${v.kind}:${v.normalizedValue}`).sort()).toEqual(["PERCENT:0", "PERCENT:0.25", "RATIO:2.5", "RATIO:3"].sort());
  });

  it("empty inventory over material-looking source is INVENTORY_EMPTY_SUSPECT, never 'nothing material here'; a failed call is INVENTORY_FAILED; a synthetic caller is SKIPPED", async () => {
    const s = CORPUS.find((x) => x.id === "I6")!;
    const b = await buildScenario(s);
    const empty = await runSemanticInventory({ candidateRef: s.id, documentId: DOC_ID, sourceContext: b.sourceContext, caller: scriptedInventoryCaller([]) });
    expect(empty.inventoryStatus).toBe("INVENTORY_EMPTY_SUSPECT");
    expect(empty.uninventoriedValues.length).toBeGreaterThanOrEqual(2);
    const failed = await runSemanticInventory({ candidateRef: s.id, documentId: DOC_ID, sourceContext: b.sourceContext, caller: scriptedInventoryCaller([], { fail: true }) });
    expect(failed.inventoryStatus).toBe("INVENTORY_FAILED");
    const skipped = await runSemanticInventory({ candidateRef: s.id, documentId: DOC_ID, sourceContext: b.sourceContext, caller: { ...scriptedInventoryCaller([]), isSynthetic: true } });
    expect(skipped.inventoryStatus).toBe("INVENTORY_SKIPPED_NO_PROVIDER");
    expect(skipped.uninventoriedValues.length).toBeGreaterThanOrEqual(2);
  });

  it("a value the model never inventoried is surfaced as UNINVENTORIED (not dropped, not auto-material)", async () => {
    const s = CORPUS.find((x) => x.id === "I6")!;
    const b = await buildScenario(s);
    const inv = await runSemanticInventory({ candidateRef: s.id, documentId: DOC_ID, sourceContext: b.sourceContext, caller: scriptedInventoryCaller(scriptedWireItems(s.items.filter((i) => i.ref !== "b"))) });
    expect(inv.uninventoriedValues.map((v) => v.rawText)).toEqual(["$10,000,000"]);
  });

  it("deterministic scanner: money/percent/ratio/days/period/date/multiplier by unit shape, precedence-ordered, no overlaps", () => {
    const vals = scanQuantitativeValues("not to exceed the greater of $12,500,000 and 7.5% of Base; 4.50 to 1.00; 3.0x; within ninety (90) days; 25 basis points; four consecutive fiscal quarters; on March 31, 2027; 2.00 times; $1.5 billion");
    const summary = vals.map((v) => `${v.kind}:${v.rawText}:${v.normalizedValue}`);
    expect(summary).toEqual(["MONEY:$12,500,000:12500000", "PERCENT:7.5%:0.075", "RATIO:4.50 to 1.00:4.5", "RATIO:3.0x:3", "DAYS:ninety (90) days:90", "PERCENT:25 basis points:0.0025", "PERIOD:four consecutive fiscal quarters:4", "DATE:March 31, 2027:null", "MULTIPLIER:2.00 times:2", "MONEY:$1.5 billion:1500000000"]);
    for (let i = 1; i < vals.length; i++) expect(vals[i]!.charStart).toBeGreaterThanOrEqual(vals[i - 1]!.charEnd);
  });
});

describe("semantic accountability - source-context sufficiency (mission §12/§13/§15)", () => {
  it("I39: a window cut inside a unit that exceeds the operative-unit budget is TRUNCATED_SOURCE with the omitted span disclosed - never COMPLETE, never silently extended", async () => {
    const b = await get("I39");
    expect(b.sourceContext.state).toBe("TRUNCATED_SOURCE");
    expect(b.sourceContext.reasons.join(" ")).toMatch(/never supplied/);
    expect(b.sourceContext.regions[0]!.unitExtension).toBeNull();
  });

  it("I39 contrast: the same unit supplied in full is COMPLETE_LOCAL_SOURCE (truncation is decided against the real boundary, not a window size)", async () => {
    const s = CORPUS.find((x) => x.id === "I39")!;
    const { index, anchor } = buildIndexFor(s);
    const full = index.getNodeText(anchor.nodeId, "DESCENDANTS");
    const sc = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: full, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: index.getDocumentText(DOC_ID) ?? null });
    expect(sc.state).toBe("COMPLETE_LOCAL_SOURCE");
  });

  it("without an anchor node and without document text, completeness is UNKNOWN_SOURCE_COMPLETENESS - never assumed", async () => {
    const s = CORPUS.find((x) => x.id === "I6")!;
    const { index, anchor } = buildIndexFor(s);
    const sc = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: index.getNodeText(anchor.nodeId, "DESCENDANTS"), anchorNodeId: null, operativeCharStart: null, documentText: null });
    expect(sc.state).toBe("UNKNOWN_SOURCE_COMPLETENESS");
  });

  it("§13 compilation unit: a window cut inside a definition is EXTENDED to the definition span WITH provenance (unitExtension), state COMPLETE - not merely flagged", async () => {
    const s = CORPUS.find((x) => x.id === "I1")!;
    const { index, anchor } = buildIndexFor(s);
    const full = index.getNodeText(anchor.nodeId, "DESCENDANTS");
    const defStart = full.indexOf("\"Consolidated Zeta Amount\"");
    const cut = full.slice(defStart, defStart + Math.floor(full.length * 0.5));
    for (const anchorNodeId of [null, anchor.nodeId]) {
      const sc = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: cut, anchorNodeId, operativeCharStart: anchor.charStart + defStart, documentText: index.getDocumentText(DOC_ID) ?? null });
      expect(sc.state, String(anchorNodeId)).toBe("COMPLETE_LOCAL_SOURCE");
      const op = sc.regions[0]!;
      expect(op.unitExtension?.unitBoundary).toBe("DEFINITION_SPAN");
      expect(op.unitExtension?.originalCharEnd).toBe(anchor.charStart + defStart + cut.length);
      expect(op.text.length).toBeGreaterThan(cut.length);
      expect(op.text).toContain("business optimization expenses");
    }
  });

  it("§13 compilation unit: a covenant window cut inside its section is EXTENDED to the anchoring node (ANCHOR_NODE boundary); the extended text is what Pass A inventories", async () => {
    const s = CORPUS.find((x) => x.id === "I6")!;
    const { index, anchor } = buildIndexFor(s);
    const full = index.getNodeText(anchor.nodeId, "DESCENDANTS");
    const cut = full.slice(0, full.indexOf("(b)"));
    const sc = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: cut, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: index.getDocumentText(DOC_ID) ?? null });
    expect(sc.state).toBe("COMPLETE_LOCAL_SOURCE");
    expect(sc.regions[0]!.unitExtension?.unitBoundary).toBe("ANCHOR_NODE");
    expect(sc.regions[0]!.text).toBe(full);
    expect(sc.regions[0]!.charStart).toBe(anchor.charStart);
    expect(sc.regions[0]!.charEnd).toBe(anchor.charEnd);
    const inv = await runSemanticInventory({ candidateRef: "ext", documentId: DOC_ID, sourceContext: sc, caller: scriptedInventoryCaller(scriptedWireItems(s.items)) });
    expect(inv.items.length).toBe(s.items.length);
  });

  it("§12 a unit larger than the operative-unit budget is TRUNCATED_SOURCE - the window is NOT silently extended and the budget is NOT raised", async () => {
    const s = CORPUS.find((x) => x.id === "I6")!;
    const { index, anchor } = buildIndexFor(s);
    const full = index.getNodeText(anchor.nodeId, "DESCENDANTS");
    const cut = full.slice(0, full.indexOf("(b)"));
    const sc = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: cut, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: index.getDocumentText(DOC_ID) ?? null, maxOperativeUnitChars: 120 });
    expect(sc.state).toBe("TRUNCATED_SOURCE");
    expect(sc.regions[0]!.text).toBe(cut);
    expect(sc.regions[0]!.unitExtension).toBeNull();
    expect(sc.reasons.join(" ")).toMatch(/exceed the 120-char operative-unit budget/);
  });

  it("§13 a window that already IS its unit (modulo whitespace) is COMPLETE with no extension; a window spanning two definitions extends to the end of the second", async () => {
    const s34 = CORPUS.find((x) => x.id === "I34")!;
    const { index, anchor } = buildIndexFor(s34);
    const full = index.getNodeText(anchor.nodeId, "DESCENDANTS");
    const a = full.indexOf("\"Term Alpha Amount\"");
    const g = full.indexOf("\"Term Gamma Amount\"");
    const window = full.slice(a, g + 10); // starts at Alpha, ends inside Gamma
    const sc = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: window, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart + a, documentText: index.getDocumentText(DOC_ID) ?? null });
    expect(sc.state).toBe("COMPLETE_LOCAL_SOURCE");
    expect(sc.regions[0]!.unitExtension?.unitBoundary).toBe("DEFINITION_SPAN");
    expect(sc.regions[0]!.text).toContain("Term Alpha Amount and Term Beta Amount");
    const exact = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: full, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: index.getDocumentText(DOC_ID) ?? null });
    expect(exact.regions[0]!.unitExtension).toBeNull();
    expect(exact.state).toBe("COMPLETE_LOCAL_SOURCE");
  });

  it("I10/I29/I32: an explicit cross-section reference is expanded as a bounded region WITH provenance (nodeId, sectionRef, offsets, the justifying reference text)", async () => {
    for (const id of ["I10", "I29", "I32"]) {
      const b = await get(id);
      const xref = b.sourceContext.regions.find((r) => r.kind === "CROSS_REFERENCE_EXPANSION");
      expect(xref, id).toBeDefined();
      expect(xref!.sectionRef).toMatch(/^7\.0[16]/);
      expect(xref!.text.length).toBeGreaterThan(20);
      expect(xref!.expandedFor!.resolution).toMatch(/UNIQUE|RESOLVED_VIA_ENCLOSING_NODE/);
    }
  });

  it("I40: two substantive occurrences of one label are AMBIGUOUS - listed with both candidates, never guessed, never expanded", async () => {
    const b = await get("I40");
    const amb = b.sourceContext.unresolvedReferences.find((u) => u.status === "AMBIGUOUS");
    expect(amb).toBeDefined();
    expect(amb!.candidateNodeIds.length).toBe(2);
    expect(b.sourceContext.regions.filter((r) => r.kind === "CROSS_REFERENCE_EXPANSION")).toEqual([]);
    const direct = resolveReferenceTarget(b.index, DOC_ID, "Section 7.02");
    expect(direct.status).toBe("AMBIGUOUS");
    expect(direct.node).toBeNull();
  });

  it("reference resolution is generic: prefix stripping, enclosing-node fallback with disclosure, NOT_FOUND for a nonexistent section", async () => {
    const b = await get("I10");
    expect(resolveReferenceTarget(b.index, DOC_ID, "Section 7.01(a)").status).toBe("UNIQUE");
    expect(resolveReferenceTarget(b.index, DOC_ID, "§ 7.01(a)").status).toBe("UNIQUE");
    const enclosing = resolveReferenceTarget(b.index, DOC_ID, "Section 7.01(a)(iii)");
    expect(enclosing.status).toBe("RESOLVED_VIA_ENCLOSING_NODE");
    expect(enclosing.normalizedRef).toBe("7.01(a)");
    expect(resolveReferenceTarget(b.index, DOC_ID, "Section 99.99").status).toBe("NOT_FOUND");
  });

  it("a heading-only duplicate occurrence (table-of-contents shape) is excluded WITH disclosure; the substantive occurrence is taken", () => {
    const toc = `TABLE OF CONTENTS\n\nSECTION 7.01 Indebtedness\nSECTION 7.02 Liens\n\nARTICLE VII\nNEGATIVE COVENANTS\n\nSECTION 7.01 Indebtedness. The Borrower will not incur Indebtedness except Indebtedness in an aggregate principal amount not to exceed $25,000,000 at any time outstanding, together with any refinancing thereof on terms no less favorable to the Lenders, in each case subject to the conditions set forth herein.\n\nSECTION 7.02 Liens. The Borrower will not create Liens except Liens securing Indebtedness permitted under Section 7.01 and Liens not exceeding $3,000,000 in the aggregate at any time outstanding, in each case subject to the conditions set forth herein and the intercreditor arrangements.\n`;
    const { index } = buildIndexFor({ id: "toc", title: "", text: toc, anchorRef: "7.02", items: [], compose: () => ({ rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] }), expectedContextState: "COMPLETE_LOCAL_SOURCE", expectSemanticallyComplete: true });
    const r = resolveReferenceTarget(index, DOC_ID, "Section 7.01");
    expect(["UNIQUE", "UNIQUE_AFTER_DEGENERATE_EXCLUSION"]).toContain(r.status);
    expect(r.node).not.toBeNull();
    expect(index.getNodeText(r.node!.nodeId, "DESCENDANTS")).toContain("$25,000,000");
    if (r.status === "UNIQUE_AFTER_DEGENERATE_EXCLUSION") expect(r.excludedDegenerateNodeIds.length).toBeGreaterThanOrEqual(1);
  });
});

describe("semantic accountability - anti-enumeration variants (I36-I38)", () => {
  it("I36: the inventory/source-context outcome is identical across arbitrary metric names", async () => {
    const results = await Promise.all(I36_VARIANTS.map(buildScenario));
    const shapes = results.map((b) => ({ state: b.sourceContext.state, n: b.inventory.items.length, roles: b.inventory.items.map((i) => `${i.semanticRole}:${i.materiality}:${i.quantitativeValues.map((v) => `${v.kind}=${v.normalizedValue}`).join(",")}`).sort() }));
    for (const s of shapes.slice(1)) expect(s).toEqual(shapes[0]);
  });

  it("I37: the outcome is identical across arbitrary section numbering", async () => {
    const results = await Promise.all(I37_VARIANTS.map(buildScenario));
    const shapes = results.map((b) => ({ state: b.sourceContext.state, n: b.inventory.items.length, roles: b.inventory.items.map((i) => `${i.semanticRole}:${i.materiality}:${i.quantitativeValues.map((v) => `${v.kind}=${v.normalizedValue}`).join(",")}`).sort() }));
    for (const s of shapes.slice(1)) expect(s).toEqual(shapes[0]);
  });

  it("I38: reordering clauses changes span identities but not the accounted semantics", async () => {
    const a = await get("I6");
    const b = await get("I38");
    const shape = (x: BuiltScenario) => x.inventory.items.map((i) => `${i.semanticRole}:${i.materiality}:${i.quantitativeValues.map((v) => `${v.kind}=${v.normalizedValue}`).join(",")}`).sort();
    expect(shape(b)).toEqual(shape(a));
    expect(new Set(b.inventory.items.map((i) => i.inventoryItemId))).not.toEqual(new Set(a.inventory.items.map((i) => i.inventoryItemId)));
  });
});
