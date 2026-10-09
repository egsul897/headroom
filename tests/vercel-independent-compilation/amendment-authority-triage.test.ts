import { describe, expect, it } from "vitest";
import {
  triageAmendmentAuthorityClaim,
  summarizeAmendmentAuthorityTriage,
} from "../../lib/contract-model/compiler/inference/amendment-authority-triage";
import { stripHtmlPreserveStructure } from "../../lib/contract-model/compiler/deterministic-extraction/html-text";
import { extractDeterministicCovenantFacts } from "../../lib/contract-model/compiler/deterministic-extraction";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

describe("amendment-authority triage", () => {
  it("labels Phase-2 family-signal claims as overbroad, not amendment precedence", () => {
    const r = triageAmendmentAuthorityClaim({
      claim:
        "Structural/family recognition is not operative authority; governing operative text and amendments must be compiled.",
      excerpt: "SECTION 7.02. Indebtedness. The Borrower will not create, incur or assume any Indebtedness.",
      documentId: "chwy/doc-a.txt",
    });
    expect(r.rootCause).toBe("OVERBROAD_UNCERTAINTY_CLASSIFICATION");
    expect(r.materiality).toBe("NOISE");
  });

  it("separates false amendment detection in negative covenants", () => {
    const r = triageAmendmentAuthorityClaim({
      claim:
        "Structural/family recognition is not operative authority; governing operative text and amendments must be compiled.",
      excerpt: "No Loan Party shall amend, modify, alter, or change any of the terms of any Material Agreement.",
      documentId: "lsb/article-6.txt",
    });
    expect(r.rootCause).toBe("FALSE_AMENDMENT_DETECTION");
  });

  it("flags excerpt-only packages as missing operative document", () => {
    const r = triageAmendmentAuthorityClaim({
      claim: "Amendment relationship evidence was observed; operative precedence unresolved.",
      excerpt: "SECTION 1. Definitions.",
      documentId: "fwrg/definitions-excerpt.txt",
      sourceClass: "CURATED_EXCERPT",
      packageHasFullOperativeText: false,
    });
    expect(r.rootCause).toBe("MISSING_OPERATIVE_DOCUMENT");
  });

  it("summarizes root-cause histogram", () => {
    const rows = [
      triageAmendmentAuthorityClaim({
        claim: "Covenant-family/signal recognition is not a verified operative prohibition or permission; semantic compilation and independent verification are required.",
        excerpt: "Liens.",
        documentId: "x",
      }),
      triageAmendmentAuthorityClaim({
        claim: "Amendment relationship evidence was observed; operative precedence unresolved.",
        excerpt: "The Credit Agreement is hereby amended as follows.",
        documentId: "y",
        amendmentPipelineConflict: true,
      }),
    ];
    const s = summarizeAmendmentAuthorityTriage(rows);
    expect(s.OVERBROAD_UNCERTAINTY_CLASSIFICATION).toBe(1);
    expect(s.GENUINE_UNRESOLVED_AMENDMENT_PRECEDENCE).toBe(1);
  });
});

describe("HTML preserve-structure strip", () => {
  it("keeps block newlines so structural headings can parse", () => {
    const html = `<html><body><p>ARTICLE VII</p><p>SECTION 7.01. Liens.</p><p>The Borrower shall not create any Lien.</p></body></html>`;
    const text = stripHtmlPreserveStructure(html);
    expect(text).toMatch(/ARTICLE VII/);
    expect(text).toMatch(/SECTION 7\.01/);
    const nodes = parseDocumentStructure({ documentId: "t", label: "t", text });
    expect(nodes.length).toBeGreaterThan(0);
  });
});

describe("deterministic extraction v2 claim labels", () => {
  it("emits semantic (not amendment) uncertainty for family signals alone", () => {
    const out = extractDeterministicCovenantFacts({
      text: "SECTION 7.02. Indebtedness. The Borrower will not incur any Indebtedness except as permitted herein.",
      documentId: "d",
      candidateRef: "c",
      citation: "7.02",
    });
    const kinds = out.hypotheses.map((h) => h.kind);
    expect(kinds).toContain("OPERATIVE_AUTHORITY_GUESS");
    expect(kinds).not.toContain("AMENDMENT_AUTHORITY_GUESS");
    expect(out.hypotheses.some((h) => /covenant-family\/signal recognition/i.test(h.claim))).toBe(true);
  });
});
