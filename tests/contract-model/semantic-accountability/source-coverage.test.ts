/**
 * SOURCE COVERAGE - the zero-cost adversarial gate (repair mission §12).
 *
 * Part 1: the six immutable audit counterexamples, driven end to end through
 * the real runSemanticInventory -> reconcileInventoryWithComposition ->
 * rollupAgreementSemanticStatus, exactly as the independent audit drove them.
 * Each was INVENTORY_OK / semanticallyComplete=true / no failure reason before
 * this repair (docs/source-coverage-repair/01).
 *
 * Part 2: the general deterministic matrix - short clauses, enumerated
 * carve-outs, chapeaux, provisos, definitions, dependency regions, every
 * quantitative kind, and the non-semantic classes that must NOT be reported.
 *
 * Part 3: the trust-boundary invariant, enforced at three independent points.
 *
 * Every text here is wholly synthetic.
 */
import { describe, expect, it } from "vitest";
import { AUDIT_COUNTEREXAMPLES, auditSourceContext, auditWireItems, AUDIT_DOC_ID, type AuditCounterexample } from "./audit-counterexamples";
import { runSemanticInventory } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { rollupAgreementSemanticStatus } from "../../../lib/contract-model/compiler/semantic-accountability/rollup";
import { classifyUnaccountedFragment, computeSourceCoverage, isAccountedDisposition, segmentSourceUnits, type AccountingSpanInput } from "../../../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { scanQuantitativeValues } from "../../../lib/contract-model/compiler/semantic-accountability/quantitative";
import type { SourceContextRegion } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const region = (regionId: string, text: string, kind: SourceContextRegion["kind"] = "OPERATIVE"): SourceContextRegion => ({
  regionId, kind, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null,
});

/** Coverage over one region with the given anchored excerpts (CRITICAL unless a materiality is given). */
function coverOne(text: string, anchored: (string | [string, string])[], regionId = "operative") {
  const regions = [region(regionId, text)];
  const spans: AccountingSpanInput[] = anchored.map((a) => {
    const [needle, materiality] = Array.isArray(a) ? a : [a, "CRITICAL"];
    const i = text.indexOf(needle);
    if (i < 0) throw new Error(`needle not in text: ${needle}`);
    return { regionId, charStart: i, charEnd: i + needle.length, materiality: materiality! };
  });
  return computeSourceCoverage({ regions, spans });
}

const unaccountedText = (cov: ReturnType<typeof coverOne>) => cov.unaccounted.map((s) => s.excerpt).join(" ⋮ ");
const flags = (text: string, anchored: (string | [string, string])[], needle: string) => unaccountedText(coverOne(text, anchored)).includes(needle);

const scriptedCaller = (items: WireInventoryItem[], gap: WireInventoryItem[] = []): StageCaller => {
  let call = 0;
  return { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: call++ === 0 ? items : gap } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
};

/** Runs the whole accountability chain for a counterexample, composing an IR that fully accounts for every accepted item. */
async function runChain(c: AuditCounterexample) {
  const sc = auditSourceContext(c);
  const inventory = await runSemanticInventory({ candidateRef: `audit-${c.id}`, documentId: AUDIT_DOC_ID, sourceContext: sc, caller: scriptedCaller(auditWireItems(c)) });
  const composition = { rules: [{ inventoryItemIds: inventory.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] };
  const accountability = reconcileInventoryWithComposition({ inventory, composition: composition as never, dispositions: [], sourceContextState: sc.state });
  const rollup = rollupAgreementSemanticStatus([{ candidateRef: `audit-${c.id}`, accountability, verification: null }] as never);
  return { inventory, accountability, rollup };
}

// ---------------------------------------------------------------------------
// Part 1 - the immutable audit counterexamples (mission §1)
// ---------------------------------------------------------------------------

describe("source coverage - audit counterexample regressions (each was silent before the repair)", () => {
  for (const c of AUDIT_COUNTEREXAMPLES) {
    it(`${c.id}: ${c.title} - ${c.omittedSemantics} is surfaced, and the unit can never be semanticallyComplete`, async () => {
      const { inventory, accountability, rollup } = await runChain(c);
      for (const m of c.mustBeUnaccounted) {
        const hit = inventory.unaccountedSource.some((s) => s.regionId === m.regionId && s.excerpt.replace(/\s+/g, " ").includes(m.needle.replace(/\s+/g, " ").slice(0, 38)));
        expect(hit, `${c.id}: "${m.needle.slice(0, 60)}" must be UNACCOUNTED_SOURCE, got ${JSON.stringify(inventory.unaccountedSource.map((s) => s.excerpt.slice(0, 60)))}`).toBe(true);
      }
      expect(inventory.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
      expect(accountability.semanticallyComplete).toBe(false);
      expect(accountability.counts.unaccountedSource).toBeGreaterThan(0);
      expect((rollup as { status: string }).status).not.toBe("SEMANTICALLY_COMPLETE");
    });
  }

  it("every counterexample reports a reason a reviewer can act on, never a bare status", async () => {
    for (const c of AUDIT_COUNTEREXAMPLES) {
      const { inventory, accountability } = await runChain(c);
      expect(inventory.unaccountedSource.every((s) => s.reason.length > 20), c.id).toBe(true);
      expect(accountability.reasons.some((r) => r.includes("stretch(es) of source")), c.id).toBe(true);
    }
  });

  it("the value-carrying counterexamples (D cure period, E maturity date, F expanded cap) also surface the value itself, of whatever kind", async () => {
    for (const id of ["D", "E", "F"] as const) {
      const c = AUDIT_COUNTEREXAMPLES.find((x) => x.id === id)!;
      const { inventory } = await runChain(c);
      expect(inventory.uninventoriedValues.length, id).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Part 2 - the general deterministic matrix (mission §12)
// ---------------------------------------------------------------------------

describe("source coverage - short and unenumerated clauses (no length floor exists)", () => {
  it("a 29-character absolute prohibition standing alone is unaccounted", () => {
    expect(flags("The Borrower shall maintain insurance. The Borrower shall not incur Debt.", ["The Borrower shall maintain insurance."], "shall not incur Debt")).toBe(true);
  });
  it("a short permission is unaccounted", () => {
    expect(flags("The Borrower shall deliver notices. The Borrower may prepay Loans.", ["The Borrower shall deliver notices."], "may prepay Loans")).toBe(true);
  });
  it("a 15-character clause is unaccounted", () => {
    expect(flags("The Agent may act. No Liens allowed.", ["The Agent may act."], "No Liens allowed")).toBe(true);
  });
  it("a one-word-per-clause list is each unaccounted", () => {
    const cov = coverOne("The Borrower shall report. (a) Revenue. (b) EBITDA. (c) Headcount.", ["The Borrower shall report."]);
    const t = unaccountedText(cov);
    for (const w of ["Revenue", "EBITDA", "Headcount"]) expect(t).toContain(w);
  });
  it("length alone never changes a verdict: the same clause at 20, 60 and 200 characters is flagged identically", () => {
    const mk = (pad: string) => `The Agent may act. The Borrower shall not sell assets${pad}.`;
    for (const pad of ["", " of any kind whatsoever", " of any kind whatsoever to any Person in any transaction or series of related transactions occurring at any time before or after the date hereof"]) {
      expect(flags(mk(pad), ["The Agent may act."], "shall not sell assets")).toBe(true);
    }
  });
});

describe("source coverage - vocabulary independence (no word list gates eligibility)", () => {
  const anchored = ["The Borrower shall deliver a compliance certificate."];
  const base = "The Borrower shall deliver a compliance certificate. ";
  it("'will cause ... to become a Guarantor' is unaccounted", () => {
    expect(flags(base + "The Borrower will cause each Subsidiary to become a Guarantor.", anchored, "become a Guarantor")).toBe(true);
  });
  it("'agrees to cause' is unaccounted", () => {
    expect(flags(base + "The Borrower agrees to cause each Subsidiary to pledge its equity.", anchored, "pledge its equity")).toBe(true);
  });
  it("'undertakes' is unaccounted", () => {
    expect(flags(base + "The Borrower undertakes the grant of a security interest in all assets.", anchored, "security interest in all assets")).toBe(true);
  });
  it("'is obligated to' is unaccounted", () => {
    expect(flags(base + "The Borrower is obligated to repay all outstanding amounts.", anchored, "repay all outstanding amounts")).toBe(true);
  });
  it("a bare declarative with no modal at all is unaccounted", () => {
    expect(flags(base + "All Collateral secures the Obligations on a first-priority basis.", anchored, "secures the Obligations")).toBe(true);
  });
  it("nonsense words carrying a proposition are unaccounted (the detector reads structure, not a dictionary)", () => {
    expect(flags(base + "The Zorb frobnicates each Quux upon the Grault Date.", anchored, "frobnicates")).toBe(true);
  });
});

describe("source coverage - enumerated carve-outs, chapeaux and nesting (mission §7)", () => {
  const lienText = "The Borrower shall not create any Lien upon any of its property, other than the following: (i) Liens for taxes not yet due; (ii) statutory Liens of landlords; (iii) Liens securing Priority Debt; (iv) Liens on Foreign Subsidiary equity.";
  it("a covered chapeau NEVER discharges its uncovered children - all four carve-outs are surfaced", () => {
    const t = unaccountedText(coverOne(lienText, ["The Borrower shall not create any Lien upon any of its property, other than the following:"]));
    for (const n of ["taxes not yet due", "statutory Liens of landlords", "securing Priority Debt", "Foreign Subsidiary equity"]) expect(t).toContain(n);
  });
  it("covered children discharge the lead-in they hang off - but only that lead-in, never a substantive main clause beside it", () => {
    const cov = coverOne(lienText, ["(i) Liens for taxes not yet due", "(ii) statutory Liens of landlords", "(iii) Liens securing Priority Debt", "(iv) Liens on Foreign Subsidiary equity"]);
    // "other than the following:" is discharged as connective glue; the prohibition itself is NOT - an inventory
    // that lists only the carve-outs has not captured "shall not create any Lien".
    expect(unaccountedText(cov)).toContain("shall not create any Lien");
    expect(unaccountedText(cov)).not.toContain("other than the following");
  });

  it("a lead-in with no internal comma IS discharged in full by its covered children", () => {
    const text = "The Borrower shall report the following: (a) Revenue; (b) EBITDA.";
    const cov = coverOne(text, ["(a) Revenue", "(b) EBITDA"]);
    expect(cov.unaccounted).toEqual([]);
    expect(cov.countsByDisposition.COVERED_BY_CHILD_DESCENT).toBeGreaterThan(0);
  });
  it("descent is refused when even ONE child is unaccounted", () => {
    const cov = coverOne(lienText, ["(i) Liens for taxes not yet due", "(ii) statutory Liens of landlords", "(iii) Liens securing Priority Debt"]);
    expect(unaccountedText(cov)).toContain("Foreign Subsidiary equity");
    expect(cov.countsByDisposition.COVERED_BY_CHILD_DESCENT).toBe(0);
  });
  it("descent is refused when the lead-in carries a quantitative value of its own", () => {
    const text = "The Borrower shall not incur Debt exceeding $10,000,000, except: (a) trade payables; (b) capital leases.";
    const cov = coverOne(text, ["(a) trade payables", "(b) capital leases"]);
    expect(unaccountedText(cov)).toContain("$10,000,000");
  });
  it("an inline enumerated list with no colon still has a lead-in owner", () => {
    const text = "The Applicable Margin for any day shall be (a) 2.50% per annum if leverage is high, (b) 1.50% per annum otherwise.";
    const cov = coverOne(text, ["2.50% per annum if leverage is high", "1.50% per annum otherwise"]);
    expect(cov.unaccounted).toEqual([]);
  });
  it("a nested sub-enumeration is accounted independently of its parent list", () => {
    const text = "The Borrower shall not dispose of assets, except: (a) sales of inventory; (b) sales of equipment, provided that (i) no Default exists and (ii) proceeds are reinvested.";
    const t = unaccountedText(coverOne(text, ["(a) sales of inventory", "(b) sales of equipment"]));
    expect(t).toContain("no Default exists");
    expect(t).toContain("proceeds are reinvested");
  });
  it("an enumerator prefix cannot hide an exception (the v2 conditional-tail rule was anchored at ^ and could be defeated by '(iv) ')", () => {
    expect(flags("The Borrower shall not incur Debt. (iv) except Liens for taxes not yet due.", ["The Borrower shall not incur Debt."], "except Liens for taxes")).toBe(true);
  });
});

describe("source coverage - provisos, conditional tails and coverage arithmetic", () => {
  it("a proviso tail behind a fully covered main clause is surfaced", () => {
    expect(flags("The Borrower may make Investments in Joint Ventures; provided that no Default has occurred.", ["The Borrower may make Investments in Joint Ventures"], "no Default has occurred")).toBe(true);
  });
  it("a comma-delimited qualifier inside a lead-in is surfaced", () => {
    const text = '"Zeta Amount" means Net Income plus, without duplication and to the extent deducted, the sum of (i) interest expense; (ii) taxes.';
    const t = unaccountedText(coverOne(text, ['"Zeta Amount" means Net Income plus', "(i) interest expense", "(ii) taxes"]));
    expect(t).toContain("without duplication and to the extent deducted");
  });
  it("more than half of a boundary-free sentence can no longer vanish behind one broad span", () => {
    const text = "The Borrower shall cause the Collateral Agent to hold a perfected first priority security interest in all Collateral at all times and the Borrower shall not permit any Subsidiary to become an obligor in respect of Indebtedness that is contractually senior to the Notes";
    const covered = text.slice(0, Math.floor(text.length * 0.55));
    expect(flags(text, [covered], "contractually senior")).toBe(true);
  });
  it("coverage arithmetic has no threshold: 45%, 50%, 51%, 60% and 90% coverage all leave the remainder accountable", () => {
    const text = "The Borrower shall not permit any Subsidiary to become an obligor in respect of Indebtedness that is contractually senior in right of payment to the Notes at any time";
    for (const frac of [0.45, 0.5, 0.51, 0.6, 0.9]) {
      const cov = coverOne(text, [text.slice(0, Math.floor(text.length * frac))]);
      expect(cov.unaccounted.length, `coverage ${frac}`).toBeGreaterThan(0);
    }
  });
  it("an em-dash carve-out is surfaced", () => {
    expect(flags("Each Subsidiary shall become a Guarantor — other than a Subsidiary that owns Material Intellectual Property.", ["Each Subsidiary shall become a Guarantor"], "Material Intellectual Property")).toBe(true);
  });
  it("a semicolon chain leaves every unanchored link accountable", () => {
    const text = "The Borrower shall: pay all taxes; maintain insurance; preserve its existence; deliver notices.";
    const t = unaccountedText(coverOne(text, ["pay all taxes"]));
    for (const n of ["maintain insurance", "preserve its existence", "deliver notices"]) expect(t).toContain(n);
  });
});

describe("source coverage - definitions and dependency-expanded regions (mission §9)", () => {
  const opText = "The Borrower shall not make Investments other than Permitted Investments as defined in Section 1.01.";
  const xrefText = "Permitted Investments means investments not to exceed $75,000,000 in the aggregate; provided that no Default shall have occurred.";
  const regions = [region("operative", opText), region("xref-0", xrefText, "CROSS_REFERENCE_EXPANSION")];
  const opSpan: AccountingSpanInput = { regionId: "operative", charStart: 0, charEnd: opText.length, materiality: "CRITICAL" };

  it("a dependency-expanded region with NO ownership link participates in full and its uncovered text is unaccounted", () => {
    const cov = computeSourceCoverage({ regions, spans: [opSpan] });
    expect(cov.unaccounted.some((s) => s.regionId === "xref-0")).toBe(true);
    expect(cov.unaccountedValues.some((v) => v.rawText === "$75,000,000")).toBe(true);
  });
  it("a dependency region WITH an explicit ownership link is discharged, and the link is disclosed", () => {
    const cov = computeSourceCoverage({ regions, spans: [opSpan], externalAccountability: [{ regionId: "xref-0", ownerCandidateRef: "unit-1.01", ownerInventoryHash: "hash-abc" }] });
    expect(cov.unaccounted).toEqual([]);
    expect(cov.spans.find((s) => s.regionId === "xref-0")!.externalOwnerRef).toBe("unit-1.01");
  });
  it("an ownership link missing its proof hash discharges nothing", () => {
    const cov = computeSourceCoverage({ regions, spans: [opSpan], externalAccountability: [{ regionId: "xref-0", ownerCandidateRef: "unit-1.01", ownerInventoryHash: "" }] });
    expect(cov.unaccounted.some((s) => s.regionId === "xref-0")).toBe(true);
  });
  it("an ownership link for a DIFFERENT region discharges nothing", () => {
    const cov = computeSourceCoverage({ regions, spans: [opSpan], externalAccountability: [{ regionId: "xref-9", ownerCandidateRef: "u", ownerInventoryHash: "h" }] });
    expect(cov.unaccounted.some((s) => s.regionId === "xref-0")).toBe(true);
  });
  it("an enclosing-node expansion is treated exactly like any other region - kind grants no exemption", () => {
    const cov = computeSourceCoverage({ regions: [region("operative", opText), region("encl-0", "The Borrower shall also pledge all equity of each Subsidiary.", "ENCLOSING_NODE_EXPANSION")], spans: [opSpan] });
    expect(cov.unaccounted.some((s) => s.regionId === "encl-0")).toBe(true);
  });
  it("a defined term inventoried inside the expansion region discharges it without any link", () => {
    // One item per independent proposition - the definition and its proviso. A single span over both would not
    // discharge both (canary #3): a span claim is not semantic coverage of everything inside it.
    const defEnd = xrefText.indexOf(";") + 1;
    const cov = computeSourceCoverage({ regions, spans: [opSpan,
      { regionId: "xref-0", charStart: 0, charEnd: defEnd, materiality: "MATERIAL" },
      { regionId: "xref-0", charStart: defEnd + 1, charEnd: xrefText.length, materiality: "MATERIAL" },
    ] });
    expect(cov.unaccounted).toEqual([]);
  });
});

describe("source coverage - every quantitative kind blocks, in every region (audit finding 2)", () => {
  const cases: [string, string][] = [
    ["MONEY", "The cap is $12,500,000 in the aggregate."],
    ["PERCENT", "The rate steps up by 25 basis points."],
    ["RATIO", "The ratio may not exceed 2.00 to 1.00."],
    ["DAYS", "The cure period is 30 days after notice."],
    ["PERIOD", "The availability period is 6 months."],
    ["DATE", "The maturity date is March 31, 2030."],
    ["MULTIPLIER", "The incremental amount is 1.75 times EBITDA."],
  ];
  for (const [kind, sentence] of cases) {
    it(`an uncovered ${kind} value is surfaced and blocks`, () => {
      const text = `The Borrower shall deliver quarterly statements. ${sentence}`;
      const cov = coverOne(text, ["The Borrower shall deliver quarterly statements."]);
      expect(cov.unaccountedValues.map((v) => v.kind)).toContain(kind);
    });
  }
  it("a value under a REVIEW_UNCERTAIN or INFORMATIONAL item is NOT accounted for", () => {
    const text = "The commitment fee is 0.50% per annum on the unused amount.";
    for (const m of ["REVIEW_UNCERTAIN", "INFORMATIONAL"]) {
      const cov = coverOne(text, [[text, m]]);
      expect(cov.unaccountedValues.length, m).toBeGreaterThan(0);
    }
  });
  it("a value inside a CRITICAL/MATERIAL span is accounted for", () => {
    const text = "The commitment fee is 0.50% per annum on the unused amount.";
    for (const m of ["CRITICAL", "MATERIAL"]) expect(coverOne(text, [[text, m]]).unaccountedValues, m).toEqual([]);
  });
  it("a value inside deterministically non-semantic source (a page footer) is not reported as a gap", () => {
    const cov = coverOne("The Borrower shall pay all taxes.\nPage 12 of 40\n", ["The Borrower shall pay all taxes."]);
    expect(cov.unaccounted).toEqual([]);
  });
  it("a value split across a comma is never split across units ('March 31, 2030' stays whole)", () => {
    const text = "All Loans mature on March 31, 2030.";
    const cov = coverOne(text, []);
    expect(cov.unaccountedValues.some((v) => v.rawText === "March 31, 2030")).toBe(true);
  });
});

describe("source coverage - non-semantic classes are suppressed, never the trust boundary", () => {
  const noise: [string, string][] = [
    ["a numbered section caption", "SECTION 7.04 Dispositions."],
    ["an ALL-CAPS article heading", "ARTICLE VII\nNEGATIVE COVENANTS"],
    ["a bare cross-reference", "See Section 6.02."],
    ["a table-of-contents leader", "Negative Covenants..............72"],
    ["page furniture", "Page 12 of 40"],
    ["a lone page number", "- 12 -"],
    ["a bare enumerator", "(a)"],
    ["punctuation only", "; :,"],
    ["connective glue", "and"],
    ["a quoted defined-term label", '"Permitted Liens" means'],
  ];
  for (const [label, fragment] of noise) {
    it(`${label} is classified non-semantic and reported to nobody`, () => {
      const { disposition } = classifyUnaccountedFragment(fragment, []);
      expect(disposition, `${label} -> ${disposition}`).not.toBe("UNACCOUNTED_SOURCE");
      expect(isAccountedDisposition(disposition)).toBe(true);
    });
  }
  it("a heading that actually carries a proposition is NOT suppressed", () => {
    expect(classifyUnaccountedFragment("SECTION 7.04 Dispositions. The Borrower shall not sell assets.", []).disposition).toBe("UNACCOUNTED_SOURCE");
  });
  it("noise carrying a quantitative value is NOT suppressed", () => {
    const vals = scanQuantitativeValues("Page 12 of 40 and $5,000,000");
    expect(classifyUnaccountedFragment("Page 12 of 40 and $5,000,000", vals).disposition).toBe("UNACCOUNTED_SOURCE");
  });
  it("an unknown fragment with any content word defaults to UNACCOUNTED_SOURCE", () => {
    expect(classifyUnaccountedFragment("blorp quux", []).disposition).toBe("UNACCOUNTED_SOURCE");
  });
});

describe("canary #2 - a subordinating connective is never sufficient to make uncovered text harmless", () => {
  // The exact fixture the independent red team used (its scenario S9). Before the fix, every word of the
  // exception was in the closed-class set - except / as / provided / in / Section, and the digits of "6.02" are
  // invisible to contentWords - so the fragment scored zero content words and was dismissed as STRUCTURAL_NOISE
  // while the whole cross-referenced exception disappeared: unaccounted 0, semanticallyComplete true.
  const TEXT = "The Borrower shall not make any Investment, except as provided in Section 6.02, at any time prior to the Maturity Date.";

  it("A: 'except as provided in Section 6.02' stays UNACCOUNTED_SOURCE when no MATERIAL item covers it, and blocks completeness", async () => {
    const cov = coverOne(TEXT, ["The Borrower shall not make any Investment,", "at any time prior to the Maturity Date."]);
    expect(unaccountedText(cov)).toContain("except as provided in Section 6.02");
    expect(cov.unaccounted).toHaveLength(1);

    // ... and end to end, the unit can no longer be semanticallyComplete.
    const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region("operative", TEXT)], unresolvedReferences: [], reasons: [], totalChars: TEXT.length, budgetChars: 10_000 };
    const wire = ["The Borrower shall not make any Investment,", "at any time prior to the Maturity Date."].map((excerpt, i): WireInventoryItem => ({ localRef: `a${i}`, semanticRole: "PROHIBITION", proposition: `p${i}`, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }));
    const inv = await runSemanticInventory({ candidateRef: "canary2", documentId: "d", sourceContext: sc, caller: scriptedCaller(wire) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    expect(inv.unaccountedSource.map((u) => u.excerpt).join(" ")).toContain("except as provided in Section 6.02");
    const rec = reconcileInventoryWithComposition({ inventory: inv, composition: { rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] } as never, dispositions: [], sourceContextState: sc.state });
    expect(rec.semanticallyComplete).toBe(false);

    // Contrast: when a MATERIAL item DOES cover the exception, normal completeness behaviour proceeds.
    expect(coverOne(TEXT, [TEXT]).unaccounted).toEqual([]);
  });

  it("B: a connective-only fragment with no independent semantic content stays suppressible", () => {
    // The negative control. Removing subordinating connectives from the closed class must not make pure
    // structural glue blocking - "and" carries no proposition and is still STRUCTURAL_NOISE.
    expect(classifyUnaccountedFragment("and", []).disposition).toBe("STRUCTURAL_NOISE");
    expect(isAccountedDisposition(classifyUnaccountedFragment("and", []).disposition)).toBe(true);
  });
});

describe("canary #2B - structural connective ownership", () => {
  const I5 = "The Borrower may make Investments in Joint Ventures in an aggregate amount not to exceed $40,000,000; provided that no Default has occurred and is continuing; provided further that, if the Total Leverage Ratio exceeds 4.00 to 1.00, such amount shall not exceed $20,000,000.";
  const S9 = "The Borrower shall not make any Investment, except as provided in Section 6.02, at any time prior to the Maturity Date.";

  it("A POSITIVE: a bare 'provided that' whose condition IS covered inherits coverage from the clause it introduces", () => {
    const cov = coverOne(I5, [
      "The Borrower may make Investments in Joint Ventures in an aggregate amount not to exceed $40,000,000",
      "no Default has occurred and is continuing",
      "if the Total Leverage Ratio exceeds 4.00 to 1.00, such amount shall not exceed $20,000,000",
    ]);
    expect(cov.unaccounted).toEqual([]);
    expect(cov.countsByDisposition.COVERED_BY_CONNECTIVE_OWNERSHIP).toBeGreaterThan(0);
    // ...and it is inheritance, not suppression: with the condition NOT covered, the whole clause is a gap again.
    const uncovered = coverOne(I5, ["The Borrower may make Investments in Joint Ventures in an aggregate amount not to exceed $40,000,000"]);
    expect(unaccountedText(uncovered)).toContain("no Default has occurred and is continuing");
  });

  it("B NEGATIVE: the canary #2 fixture is unchanged - a connective carrying its own cross-reference never inherits", () => {
    // "except as provided in Section 6.02" is adjacent to a covered clause exactly as "provided that" is, so
    // adjacency cannot be what separates them. The reference IS the content of the exception: the fragment
    // carries its own object, so it can never be discharged by whatever happens to follow it.
    const cov = coverOne(S9, ["The Borrower shall not make any Investment,", "at any time prior to the Maturity Date."]);
    expect(unaccountedText(cov)).toContain("except as provided in Section 6.02");
    expect(cov.countsByDisposition.COVERED_BY_CONNECTIVE_OWNERSHIP).toBe(0);
  });
});

describe("canary #3 - a source-span claim is not semantic coverage by itself", () => {
  // The red team's RT-8 fixture, verbatim: three independent material propositions, ONE CRITICAL item whose span
  // is the whole region and whose proposition ("this section contains provisions") represents none of them.
  const RT8 = "The Borrower shall not incur Indebtedness exceeding $10,000,000. The Borrower shall maintain a Leverage Ratio of not more than 4.00 to 1.00 as of the last day of each fiscal quarter. The cure period is 30 days.";

  it("ATTACK: one overbroad CRITICAL span cannot discharge the independent propositions inside it", async () => {
    const cov = coverOne(RT8, [RT8]);
    // Before: the whole region was COVERED_BY_INVENTORY, unaccounted 0, unaccountedValues 0.
    expect(cov.unaccounted.length).toBeGreaterThan(0);
    expect(unaccountedText(cov)).toContain("Leverage Ratio");
    expect(unaccountedText(cov)).toContain("cure period");
    expect(cov.unaccountedValues.map((v) => v.kind).sort()).toEqual(["DAYS", "RATIO"]);

    // End to end, with the item reconciling REPRESENTED exactly as the audit's IR made it.
    const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region("operative", RT8)], unresolvedReferences: [], reasons: [], totalChars: RT8.length, budgetChars: 10_000 };
    const blanket: WireInventoryItem = { localRef: "blanket", semanticRole: "OTHER", proposition: "this section contains provisions", excerpt: RT8, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" };
    const inv = await runSemanticInventory({ candidateRef: "canary3", documentId: "d", sourceContext: sc, caller: scriptedCaller([blanket]) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    const rec = reconcileInventoryWithComposition({
      inventory: inv,
      composition: { rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] } as never,
      dispositions: inv.items.map((i) => ({ inventoryItemId: i.inventoryItemId, disposition: "REPRESENTED", note: "matched in IR" })),
      sourceContextState: sc.state,
    });
    expect(rec.semanticallyComplete).toBe(false);
  });

  it("LEGITIMATE BROAD SPAN: one item anchoring a continuous clause that punctuation splits internally stays covered", () => {
    // A comma is not an independent-proposition boundary, so a genuine single proposition spanning several
    // internal units keeps full credit - broad citations are not prohibited, only cross-proposition claims.
    const text = "If the Total Leverage Ratio exceeds 4.00 to 1.00, such amount shall not exceed $20,000,000.";
    const cov = coverOne(text, ["If the Total Leverage Ratio exceeds 4.00 to 1.00, such amount shall not exceed $20,000,000"]);
    expect(cov.unaccounted).toEqual([]);
    expect(cov.unaccountedValues).toEqual([]);
  });

  it("SPLIT-CLAUSE CONTROL: an item semantically representing clause A but spanning A and B covers A only", () => {
    // Wholly generic - no covenant-family semantics anywhere in this fixture.
    const text = "Clause A states the first obligation. Clause B states the second obligation.";
    const cov = coverOne(text, [text]);
    expect(cov.spans.some((s) => s.disposition === "COVERED_BY_INVENTORY" && s.excerpt.includes("Clause A"))).toBe(true);
    expect(unaccountedText(cov)).toContain("Clause B states the second obligation.");
    expect(unaccountedText(cov)).not.toContain("Clause A");
  });
});

describe("canary #4 - child coverage cannot erase independent parent semantics", () => {
  // The red team's RT-4 / S5 fixture, verbatim: a 176-character lead-in carrying a prepayment obligation, a cure
  // period and a prohibition, with ONLY its two enumerated children inventoried. Before: the whole lead-in was
  // COVERED_BY_CHILD_DESCENT, unaccounted 0, semanticallyComplete true.
  const RT4 = "The Borrower shall prepay the Loans in full upon a Change of Control and shall cure any Default within thirty days after notice and shall not incur any Indebtedness other than (a) the Existing Debt (b) the Revolving Loans.";

  it("ATTACK: a lead-in carrying independent conjuncts keeps them accountable; only the fragment that introduces the children is discharged", async () => {
    const cov = coverOne(RT4, ["(a) the Existing Debt", "(b) the Revolving Loans."]);
    expect(unaccountedText(cov)).toContain("shall prepay the Loans in full upon a Change of Control");
    expect(unaccountedText(cov)).toContain("shall cure any Default within thirty days after notice");
    // The introducing fragment - and only it - is discharged.
    expect(cov.spans.some((s) => s.disposition === "COVERED_BY_CHILD_DESCENT" && s.excerpt.includes("other than"))).toBe(true);

    const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region("operative", RT4)], unresolvedReferences: [], reasons: [], totalChars: RT4.length, budgetChars: 10_000 };
    const wire = ["(a) the Existing Debt", "(b) the Revolving Loans."].map((excerpt, i): WireInventoryItem => ({ localRef: `c${i}`, semanticRole: "EXCEPTION", proposition: `child ${i}`, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }));
    const inv = await runSemanticInventory({ candidateRef: "canary4", documentId: "d", sourceContext: sc, caller: scriptedCaller(wire) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    const rec = reconcileInventoryWithComposition({
      inventory: inv,
      composition: { rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] } as never,
      dispositions: inv.items.map((i) => ({ inventoryItemId: i.inventoryItemId, disposition: "REPRESENTED", note: "matched" })),
      sourceContextState: sc.state,
    });
    expect(rec.semanticallyComplete).toBe(false);
  });

  it("LEGITIMATE PURE CHAPEAU: a lead-in that only introduces its children is still discharged by descent", () => {
    const text = "The Borrower may make the following Investments: (a) Investments in Subsidiaries. (b) Investments in Joint Ventures.";
    const cov = coverOne(text, ["(a) Investments in Subsidiaries.", "(b) Investments in Joint Ventures."]);
    expect(cov.unaccounted).toEqual([]);
    expect(cov.countsByDisposition.COVERED_BY_CHILD_DESCENT).toBeGreaterThan(0);
  });

  it("MIXED PARENT: a parent obligation and its value stay accountable while the introducing fragment is discharged", () => {
    // Wholly generic - no covenant-family semantics.
    const text = "The Company shall comply within 30 days and may take only the following actions: (a) Action A. (b) Action B.";
    const cov = coverOne(text, ["(a) Action A.", "(b) Action B."]);
    expect(unaccountedText(cov)).toContain("shall comply within 30 days");
    expect(cov.unaccountedValues.map((v) => v.kind)).toContain("DAYS");
    expect(cov.spans.some((s) => s.disposition === "COVERED_BY_CHILD_DESCENT" && s.excerpt.includes("following actions"))).toBe(true);
  });
});

describe("canary #5 - quotation marks do not make source non-semantic", () => {
  // The red team's S6 fixture, verbatim: an amendment installing a replacement covenant. Before, the quoted
  // replacement matched DEFINED_TERM_LABEL_RE (any quoted run up to 120 chars alone in a segment) and the whole
  // new covenant disappeared with INVENTORY_OK / semanticallyComplete=true.
  const S6 = 'Section 6.02 of the Credit Agreement is amended and restated to read as follows: "The Borrower shall not make any Restricted Payment while any Default is continuing."';
  const LEAD_IN = "Section 6.02 of the Credit Agreement is amended and restated to read as follows:";

  it("ATTACK: quoted replacement covenant text is accountable, not a defined-term label", async () => {
    const cov = coverOne(S6, [LEAD_IN]);
    expect(unaccountedText(cov)).toContain("shall not make any Restricted Payment");
    expect(cov.spans.some((s) => s.disposition === "DEFINED_TERM_LABEL")).toBe(false);

    const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region("operative", S6)], unresolvedReferences: [], reasons: [], totalChars: S6.length, budgetChars: 10_000 };
    const wire: WireInventoryItem[] = [{ localRef: "lead", semanticRole: "OTHER", proposition: "section 6.02 is amended and restated", excerpt: LEAD_IN, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }];
    const inv = await runSemanticInventory({ candidateRef: "canary5", documentId: "d", sourceContext: sc, caller: scriptedCaller(wire) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    const rec = reconcileInventoryWithComposition({
      inventory: inv,
      composition: { rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] } as never,
      dispositions: inv.items.map((i) => ({ inventoryItemId: i.inventoryItemId, disposition: "REPRESENTED", note: "matched" })),
      sourceContextState: sc.state,
    });
    expect(rec.semanticallyComplete).toBe(false);
  });

  it("TRUE LABEL CONTROL: a quoted defined-term name is still non-blocking", () => {
    const text = 'The following terms are defined below.\n"Consolidated EBITDA"\n"Applicable Margin"\nEach term has the meaning assigned to it.';
    const cov = coverOne(text, ["The following terms are defined below.", "Each term has the meaning assigned to it."]);
    expect(cov.unaccounted).toEqual([]);
    expect(cov.countsByDisposition.DEFINED_TERM_LABEL).toBeGreaterThan(0);
    for (const name of ['"Consolidated EBITDA"', '"Applicable Margin" means', '"Change of Control".']) {
      expect(classifyUnaccountedFragment(name, []).disposition, name).toBe("DEFINED_TERM_LABEL");
    }
  });

  it("GENERIC QUOTED PROPOSITION: no legal or amendment vocabulary needed to keep quoted text accountable", () => {
    const text = 'The text is replaced with:\n"The Company must deliver the report."';
    const cov = coverOne(text, ["The text is replaced with:"]);
    expect(unaccountedText(cov)).toContain("The Company must deliver the report.");
  });
});

describe("source coverage - segmentation, tables and duplicates", () => {
  it("line-broken rows are separate units, not one block (audit finding 7)", () => {
    const text = "Reporting Requirements\nAnnual statements within 90 days after year end\nQuarterly statements within 45 days after quarter end\nNotice of any Default promptly";
    const t = unaccountedText(coverOne(text, ["Annual statements within 90 days after year end"]));
    expect(t).toContain("Quarterly statements");
    expect(t).toContain("Notice of any Default");
  });
  it("a line-broken block is more than one unit", () => {
    expect(segmentSourceUnits("alpha covenant\nbeta covenant\ngamma covenant").length).toBe(3);
  });
  it("text with no terminator at all is still segmented and still accountable", () => {
    const text = "The Borrower shall not incur Debt and shall not create Liens and shall not sell assets";
    expect(coverOne(text, []).unaccounted.length).toBeGreaterThan(0);
  });
  it("overlapping item spans do not double-count or create phantom gaps", () => {
    const text = "The Borrower shall not incur Debt in excess of the Cap.";
    const cov = coverOne(text, ["The Borrower shall not incur Debt", "shall not incur Debt in excess of the Cap."]);
    expect(cov.unaccounted).toEqual([]);
  });
  it("duplicate identical spans are idempotent", () => {
    const text = "The Borrower shall not incur Debt.";
    expect(coverOne(text, [text, text, text]).unaccounted).toEqual([]);
  });
  it("spans are contiguous and tile the region exactly", () => {
    const text = "SECTION 1. The Borrower shall not incur Debt. (a) except trade payables.";
    const cov = coverOne(text, ["The Borrower shall not incur Debt."]);
    const inRegion = cov.spans.filter((s) => s.regionId === "operative").sort((a, b) => a.charStart - b.charStart);
    expect(inRegion[0]!.charStart).toBe(0);
    expect(inRegion[inRegion.length - 1]!.charEnd).toBe(text.length);
  });
  it("coverage is deterministic: the same input twice gives byte-identical output", () => {
    const text = "The Borrower shall not incur Debt, except: (a) trade payables; (b) capital leases up to $1,000,000.";
    expect(JSON.stringify(coverOne(text, ["(a) trade payables"]))).toBe(JSON.stringify(coverOne(text, ["(a) trade payables"])));
  });
  it("an empty region is accounted for trivially and never reported", () => {
    expect(computeSourceCoverage({ regions: [region("operative", "")], spans: [] }).unaccounted).toEqual([]);
  });
  it("a whitespace-only region is never reported", () => {
    expect(computeSourceCoverage({ regions: [region("operative", "   \n\n  ")], spans: [] }).unaccounted).toEqual([]);
  });
});

describe("source coverage - materiality cannot be gamed", () => {
  const text = "The Borrower shall not incur Debt. The Borrower shall not create Liens.";
  it("downgrading an item to INFORMATIONAL removes its coverage (fail-safe direction)", () => {
    expect(flags(text, [["The Borrower shall not incur Debt.", "INFORMATIONAL"]], "shall not incur Debt")).toBe(true);
  });
  it("a single blanket CRITICAL span still cannot hide a value outside it", () => {
    const t2 = "The Borrower shall not incur Debt. Cure period: 30 days.";
    const cov = coverOne(t2, ["The Borrower shall not incur Debt."]);
    expect(cov.unaccountedValues.length).toBeGreaterThan(0);
  });
  it("a span reaching beyond the region is clamped, not trusted past the end", () => {
    // One proposition, one span that overruns the region end (canary #3 clips credit at proposition boundaries,
    // so this fixture is a single sentence - the subject here is the region-length clamp).
    const one = "The Borrower shall not incur Debt.";
    const cov = computeSourceCoverage({ regions: [region("operative", one)], spans: [{ regionId: "operative", charStart: 0, charEnd: 10_000, materiality: "CRITICAL" }] });
    expect(cov.unaccounted).toEqual([]);
    expect(cov.spans.every((s) => s.charEnd <= one.length)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Part 3 - NO_SEMANTIC_COMPLETE_WITH_UNACCOUNTED_SOURCE (mission §14)
// ---------------------------------------------------------------------------

describe("trust-boundary invariant - NO_SEMANTIC_COMPLETE_WITH_UNACCOUNTED_SOURCE", () => {
  const gapText = "The Borrower shall deliver notices. The Borrower shall not incur Debt.";
  const sourceContext = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region("operative", gapText)], unresolvedReferences: [], reasons: [], totalChars: gapText.length, budgetChars: 10_000 };
  const item: WireInventoryItem = { localRef: "a", semanticRole: "REQUIREMENT", proposition: "notices", excerpt: "The Borrower shall deliver notices.", regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" };

  it("enforcement point 1 - the inventory refuses INVENTORY_OK", async () => {
    const inv = await runSemanticInventory({ candidateRef: "inv-1", documentId: "d", sourceContext, caller: scriptedCaller([item]) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
  });
  it("enforcement point 2 - reconciliation refuses semanticallyComplete even if the status string says OK", async () => {
    const inv = await runSemanticInventory({ candidateRef: "inv-2", documentId: "d", sourceContext, caller: scriptedCaller([item]) });
    const tampered = { ...inv, inventoryStatus: "INVENTORY_OK" as const };
    const r = reconcileInventoryWithComposition({ inventory: tampered, composition: { rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] } as never, dispositions: [], sourceContextState: "COMPLETE_LOCAL_SOURCE" });
    expect(r.semanticallyComplete).toBe(false);
  });
  it("enforcement point 3 - an unaccounted VALUE alone refuses completeness, with no unaccounted text at all", async () => {
    const valueText = "The Borrower shall pay the fee of 0.50% per annum.";
    const sc = { ...sourceContext, regions: [region("operative", valueText)], totalChars: valueText.length };
    const nonMaterial: WireInventoryItem = { ...item, excerpt: valueText, materiality: "REVIEW_UNCERTAIN" };
    const inv = await runSemanticInventory({ candidateRef: "inv-3", documentId: "d", sourceContext: sc, caller: scriptedCaller([nonMaterial], [nonMaterial]) });
    expect(inv.uninventoriedValues.length).toBeGreaterThan(0);
    const r = reconcileInventoryWithComposition({ inventory: { ...inv, inventoryStatus: "INVENTORY_OK" as const, unaccountedSource: [] }, composition: { rules: [], definitions: [], sharedCapacities: [] } as never, dispositions: [], sourceContextState: "COMPLETE_LOCAL_SOURCE" });
    expect(r.semanticallyComplete).toBe(false);
  });
  it("the gap call is remediation, not detection: a gap call returning nothing leaves the gap open", async () => {
    const inv = await runSemanticInventory({ candidateRef: "inv-4", documentId: "d", sourceContext, caller: scriptedCaller([item], []) });
    expect(inv.gapReinventory).toMatchObject({ attempted: true, itemsAdded: 0 });
    expect(inv.unaccountedSource.length).toBeGreaterThan(0);
  });
  it("a gap call echoing the gap verbatim as a NON-material item closes nothing", async () => {
    const echo: WireInventoryItem = { ...item, localRef: "echo", excerpt: "The Borrower shall not incur Debt.", materiality: "REVIEW_UNCERTAIN" };
    const inv = await runSemanticInventory({ candidateRef: "inv-5", documentId: "d", sourceContext, caller: scriptedCaller([item], [echo]) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
  });
  it("a gap call that closes the gap with a MATERIAL item yields INVENTORY_OK with the addition disclosed", async () => {
    const fix: WireInventoryItem = { ...item, localRef: "fix", excerpt: "The Borrower shall not incur Debt.", semanticRole: "PROHIBITION", materiality: "CRITICAL" };
    const inv = await runSemanticInventory({ candidateRef: "inv-6", documentId: "d", sourceContext, caller: scriptedCaller([item], [fix]) });
    expect(inv.inventoryStatus).toBe("INVENTORY_OK");
    expect(inv.gapReinventory).toMatchObject({ attempted: true, itemsAdded: 1, segmentsAfter: 0 });
  });
  it("the frozen hash carries the unaccounted spans, so a gap cannot be edited away downstream", async () => {
    const open = await runSemanticInventory({ candidateRef: "inv-7", documentId: "d", sourceContext, caller: scriptedCaller([item], []) });
    const fix: WireInventoryItem = { ...item, localRef: "fix", excerpt: "The Borrower shall not incur Debt.", materiality: "CRITICAL" };
    const closed = await runSemanticInventory({ candidateRef: "inv-7", documentId: "d", sourceContext, caller: scriptedCaller([item], [fix]) });
    expect(open.frozenContentHash).not.toBe(closed.frozenContentHash);
  });
  it("the coverage summary discloses how much source reached an accounted disposition", async () => {
    const inv = await runSemanticInventory({ candidateRef: "inv-8", documentId: "d", sourceContext, caller: scriptedCaller([item], []) });
    expect(inv.sourceCoverage.accountedCharFraction).toBeLessThan(1);
    expect(inv.sourceCoverage.regionsConsidered).toEqual(["operative"]);
  });
});
