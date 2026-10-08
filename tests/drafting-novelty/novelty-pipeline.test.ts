import { describe, expect, it } from "vitest";
import {
  detectCategories,
  extractSignatureTokens,
  extractUnitsFromDocument,
  jaccard,
  lexicalJaccard,
  makeSignature,
  maskNumericLiterals,
  normalizeDraftingText,
  scoreNovelty,
  shingles,
  signatureDistance,
} from "../../lib/drafting-novelty";
import type { DocumentSource, DraftingUnit } from "../../lib/drafting-novelty";

const SAMPLE_RECLASS = `
SECTION 1.08(f) Fixed Amounts and Incurrence-Based Amounts.
In connection with any action taken substantially concurrently, within five Business Days, if the Borrower incurs Indebtedness under Fixed Amounts
and also under Incurrence-Based Amounts, then the Fixed Amounts shall be disregarded in the calculation of the financial test applicable to such
Incurrence-Based Amounts, and amounts incurred in reliance on Fixed Amounts shall be automatically and immediately reclassified at any time,
unless the Initial Borrower otherwise elects from time to time, as incurred under the applicable Incurrence-Based Amounts.
`;

const SAMPLE_PROVISO = `
SECTION 7.1 Financial Condition Covenants.
(a) Permit the Consolidated Senior Secured Leverage Ratio to exceed 3.75 to 1.00. Notwithstanding the foregoing, if the Parent Borrower
consummates a Material Acquisition, the Consolidated Senior Secured Leverage Ratio may be 0.50 to 1.00 greater than the ratio set forth above
for four consecutive fiscal quarters; provided that (x) such step-up shall not exceed 6.00 to 1.00, (y) such step-up shall be permitted only twice
during the term of this Agreement and (z) there shall be at least two fiscal quarters in between any such step-ups.
`;

const SAMPLE_SHARED = `
Indebtedness of the Borrower or any Restricted Subsidiary incurred under Section 6.01(q) together with Section 6.01(r), in the aggregate with
amounts outstanding under the Senior Notes Indenture, shall not exceed the greater of $50,000,000 and 25% of Consolidated EBITDA.
`;

describe("drafting-novelty normalization + signatures", () => {
  it("normalizes quotes and masks numeric literals deterministically", () => {
    const n = normalizeDraftingText("“Fixed Amounts” — $108.0 million");
    expect(n).toContain('"Fixed Amounts"');
    expect(n).toContain("-");
    const masked = maskNumericLiterals("greater of $108.0 million and 15% of Consolidated EBITDA at 5.50 to 1.00");
    expect(masked).toContain("<MONEY>");
    expect(masked).toContain("<PCT>");
    expect(masked).toContain("<RATIO>");
  });

  it("detects reclassification / proviso / shared-capacity categories", () => {
    expect(detectCategories(SAMPLE_RECLASS)).toContain("RECLASSIFICATION");
    expect(detectCategories(SAMPLE_PROVISO)).toEqual(expect.arrayContaining(["PROVISO_PLACEMENT", "COVENANT_STRUCTURE"]));
    expect(detectCategories(SAMPLE_SHARED)).toEqual(expect.arrayContaining(["SHARED_CAPACITY", "BASKET_FORMULA"]));
  });

  it("emits high-risk structural tokens without treating amounts as identity", () => {
    const tokens = extractSignatureTokens("RECLASSIFICATION", SAMPLE_RECLASS);
    expect(tokens).toEqual(expect.arrayContaining(["RECLASSIFY_AUTOMATIC", "FIXED_VS_INCURRENCE"]));
    const proviso = extractSignatureTokens("PROVISO_PLACEMENT", SAMPLE_PROVISO);
    expect(proviso).toEqual(expect.arrayContaining(["PROVISO_AFTER_PERMISSION", "NOTWITHSTANDING_OVERRIDE", "STEP_UP_WITH_LIMITS"]));
  });

  it("signature distance is 0 for identical token sets and >0 across shapes", () => {
    const a = makeSignature("RECLASSIFICATION", extractSignatureTokens("RECLASSIFICATION", SAMPLE_RECLASS));
    const b = makeSignature("RECLASSIFICATION", extractSignatureTokens("RECLASSIFICATION", SAMPLE_RECLASS));
    const c = makeSignature("PROVISO_PLACEMENT", extractSignatureTokens("PROVISO_PLACEMENT", SAMPLE_PROVISO));
    expect(signatureDistance(a, b)).toBe(0);
    expect(signatureDistance(a, c)).toBe(1);
  });
});

describe("drafting-novelty lexical similarity disclaimer surface", () => {
  it("jaccard is symmetric and high for near-copies after numeric masking", () => {
    const a = "greater of $50,000,000 and 25% of Consolidated EBITDA";
    const b = "greater of $75,000,000 and 30% of Consolidated EBITDA";
    expect(lexicalJaccard(a, b)).toBeGreaterThan(0.5);
    expect(jaccard(shingles(a), shingles(b))).toBe(lexicalJaccard(a, b));
  });
});

describe("drafting-novelty extraction + scoring", () => {
  const doc: DocumentSource = {
    documentId: "probe-sample",
    packageId: "sample-package",
    role: "PROBE",
    path: "virtual/sample.txt",
    label: "sample",
    publicSourceNote: "unit test",
  };

  const corpusDoc: DocumentSource = {
    ...doc,
    documentId: "corpus-sample",
    packageId: "corpus-package",
    role: "CORPUS",
    path: "virtual/corpus.txt",
  };

  it("extracts units with exact source spans", () => {
    const units = extractUnitsFromDocument(doc, SAMPLE_RECLASS + "\n" + SAMPLE_PROVISO + "\n" + SAMPLE_SHARED);
    expect(units.length).toBeGreaterThan(0);
    for (const u of units) {
      expect(u.span.charEnd).toBeGreaterThan(u.span.charStart);
      expect(u.span.excerpt.length).toBeGreaterThan(0);
      expect(u.signature.key.startsWith(u.category)).toBe(true);
    }
  });

  it("scores probe-only shapes above corpus-supported shapes and tags failure modes", () => {
    const probeUnits = extractUnitsFromDocument(doc, SAMPLE_RECLASS);
    const corpusUnits = extractUnitsFromDocument(corpusDoc, SAMPLE_PROVISO);
    const findings = scoreNovelty([...probeUnits, ...corpusUnits] as DraftingUnit[]);
    expect(findings.length).toBeGreaterThan(0);
    const reclass = findings.find((f) => f.category === "RECLASSIFICATION");
    expect(reclass).toBeTruthy();
    expect(reclass!.corpusSupport).toBe(0);
    expect(reclass!.suspectedFailureMode).toBe("CAPACITY_OVERSTATEMENT");
    expect(reclass!.comparisonExamples.every((n) => n.equivalenceClaim === "NONE_LEXICAL_ONLY")).toBe(true);
  });

  it("is deterministic for the same inputs", () => {
    const units = extractUnitsFromDocument(doc, SAMPLE_RECLASS + SAMPLE_SHARED);
    const a = scoreNovelty(units).map((f) => f.findingId);
    const b = scoreNovelty(units).map((f) => f.findingId);
    expect(a).toEqual(b);
  });
});
