/**
 * Neon corpus flywheel — generalized structural remediations proven on
 * authentic fixtures (no Neon, no paid inference).
 *
 * 1) Definitions-section clause parsing must not let one term's last limb
 *    swallow later defined terms (DSGR Available Amount `(viii)`).
 * 2) Deep SUBCLAUSE nesting (depth > 3) must keep parent ownership via
 *    nestRank (Chewy Available Amount builder `(a)` / `(A)` / `(B)`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import {
  detectStructuralDefinitions,
  findTopLevelDefinitionStarts,
} from "../../lib/contract-model/compiler/structural-definitions";

const DSGR_DOC_D =
  "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt";
const CHWY_DOC_A =
  "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";

describe("definition-body clause scope (DSGR Available Amount)", () => {
  it("findTopLevelDefinitionStarts locates Available Amount and the next term on the operative §1.01", () => {
    const text = readFileSync(DSGR_DOC_D, "utf8");
    const nodes = parseDocumentStructure({ documentId: "dsgr-d", label: "DSGR", text });
    const defs = detectStructuralDefinitions("dsgr-d", text, nodes).filter((d) => !d.nested);
    const aa = defs.find((d) => d.normalizedTerm === "available amount");
    const next = defs[defs.findIndex((d) => d.normalizedTerm === "available amount") + 1];
    expect(aa).toBeDefined();
    expect(next).toBeDefined();
    // Prefer the operative Defined Terms section (not a TOC stub sharing sectionRef 1.01).
    const section = [...nodes]
      .filter((n) => n.nodeType === "SECTION" && n.sectionRef === "1.01" && /defin/i.test(n.heading))
      .sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0];
    expect(section).toBeDefined();
    expect(section!.charStart).toBeLessThanOrEqual(aa!.charStart);
    expect(section!.charEnd).toBeGreaterThan(aa!.charStart);
    const starts = findTopLevelDefinitionStarts(text, section!.charStart, section!.charEnd);
    expect(starts).toContain(aa!.charStart);
    expect(starts).toContain(next!.charStart);
  });

  it("Available Amount last limb 1.01(viii) does not swallow later defined terms", () => {
    const text = readFileSync(DSGR_DOC_D, "utf8");
    const nodes = parseDocumentStructure({ documentId: "dsgr-d", label: "DSGR", text });
    const defs = detectStructuralDefinitions("dsgr-d", text, nodes).filter((d) => !d.nested);
    const aa = defs.find((d) => d.normalizedTerm === "available amount")!;
    const next = defs[defs.findIndex((d) => d.normalizedTerm === "available amount") + 1]!;
    // The AA limb sits inside the operative §1.01 body (charStart after AA declaration).
    const viii = nodes.find(
      (n) => n.sectionRef === "1.01(viii)" && n.charStart > aa.charStart && n.charStart < next.charStart,
    );
    expect(viii).toBeDefined();
    expect(viii!.charEnd).toBeLessThanOrEqual(next.charStart);
    // Must not own ~89% of §1.01 (pre-fix span was ~163k chars).
    expect(viii!.charEnd - viii!.charStart).toBeLessThan(8_000);
    // Later definitions' markers must not nest under (viii).
    const falseChildren = nodes.filter(
      (n) => n.sectionRef.startsWith("1.01(viii)(") && n.charStart >= next.charStart,
    );
    expect(falseChildren).toEqual([]);
    // Owned text must still contain the AA limb and must not include the next term's declaration.
    const owned = text.slice(viii!.charStart, viii!.charEnd);
    expect(owned).toMatch(/^\(viii\)/);
    expect(owned).not.toContain(`“${next.exactTerm}”`);
  });

  it("synthetic definitions section: last limb of term A ends before term B", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Alpha Basket” means the sum of:",
      "(i) cash on hand; plus",
      "(ii) the greater of $1 and 10% of EBITDA; plus",
      "(iii) unused commitments.",
      "“Beta Ratio” means Consolidated Total Debt divided by Consolidated EBITDA.",
      "SECTION 1.02. Other Interpretive Provisions.",
      "The meanings apply.",
    ].join("\n");
    const nodes = parseDocumentStructure({ documentId: "syn-def", label: "syn", text });
    const iii = nodes.find((n) => n.sectionRef === "1.01(iii)");
    const betaStart = text.indexOf("“Beta Ratio”");
    expect(iii).toBeDefined();
    expect(betaStart).toBeGreaterThan(0);
    expect(iii!.charEnd).toBeLessThanOrEqual(betaStart);
    expect(text.slice(iii!.charStart, iii!.charEnd)).toContain("unused commitments");
    expect(text.slice(iii!.charStart, iii!.charEnd)).not.toContain("Beta Ratio");
  });
});

describe("deep nestRank ownership (Chewy Available Amount builder)", () => {
  it("6.08(a)(3)(a) owns (A)/(B) children through the start of (b)", () => {
    const text = readFileSync(CHWY_DOC_A, "utf8");
    const nodes = parseDocumentStructure({ documentId: "chwy", label: "CHWY", text });
    const a = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)");
    const b = nodes.find((n) => n.sectionRef === "6.08(a)(3)(b)");
    const aA = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)(A)");
    const aB = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)(B)");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(aA).toBeDefined();
    expect(aB).toBeDefined();
    expect(aA!.parentNodeId).toBe(a!.nodeId);
    expect(aB!.parentNodeId).toBe(a!.nodeId);
    expect(a!.charEnd).toBe(b!.charStart);
    const owned = text.slice(a!.charStart, a!.charEnd);
    expect(owned).toMatch(/^\(a\)\s+the greater of \(x\)/);
    expect(owned).toContain("(A)");
    expect(owned).toContain("(B)");
    // Material volitional / EOD proviso lives after (B) inside builder limb (a)
    // (source may wrap "Specified" / "Event" across a line break).
    expect(owned).toMatch(/Specified\s+Event\s+of\s+Default/i);
  });

  it("synthetic deep letter nesting preserves parent ownership past schema SUBCLAUSE clamp", () => {
    // Numeric `(3)` is not required here — the defect is depth>3 letter nesting
    // under an already-open letter list, which clamps nodeType at SUBCLAUSE.
    const text = [
      "SECTION 6.08. Restricted Payments.",
      "The Borrower will not:",
      "(a) make Restricted Payments equal to:",
      "(a) the greater of (x) 50% and (y) zero and (z)",
      "(A) cumulative EBITDA",
      "minus (B) 140% of Fixed Charges, provided that no amount shall be included under this clause (a) if there is a continuing Specified Event of Default; plus",
      "(b) the aggregate amount of Net Proceeds.",
    ].join("\n");
    const nodes = parseDocumentStructure({ documentId: "syn-deep", label: "syn", text });
    const builderA = nodes.find((n) => n.sectionRef === "6.08(a)(a)");
    const builderB = nodes.find((n) => n.sectionRef === "6.08(a)(b)");
    const A = nodes.find((n) => n.sectionRef === "6.08(a)(a)(A)");
    const B = nodes.find((n) => n.sectionRef === "6.08(a)(a)(B)");
    expect(builderA && builderB && A && B).toBeTruthy();
    expect(A!.parentNodeId).toBe(builderA!.nodeId);
    expect(B!.parentNodeId).toBe(builderA!.nodeId);
    expect(builderA!.charEnd).toBe(builderB!.charStart);
    expect(text.slice(builderA!.charStart, builderA!.charEnd)).toMatch(/Specified\s+Event\s+of\s+Default/i);
  });
});
