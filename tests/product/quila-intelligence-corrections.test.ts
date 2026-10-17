/**
 * Fail-before corpus for the live Project Quila indenture output (2026-10-15).
 *
 * The pipeline ran end-to-end, but the intelligence was not commercially
 * reliable: table-of-contents headings were emitted as covenant candidates,
 * event-of-default triggers were labeled permissions, defeasance and
 * administrative provisions were labeled operating covenants, duplicate
 * section candidates appeared, and dollar amounts lost their units
 * ("$150.0" for "U.S.$150.0 million"). The source-text page also rendered
 * raw "%PDF-1.7" bytes instead of extracted text.
 *
 * These tests use synthetic indenture-shaped text only — no customer
 * document bytes, no fixture/benchmark material.
 */
import { describe, expect, it } from "vitest";
import { classifyFamiliesFromText } from "../../lib/knowledge-factory/taxonomy/families";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import type { StructuralNodeRecord } from "../../lib/knowledge-factory/types";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import { extractTextAsync } from "../../lib/knowledge-factory/pipeline/text";
import { loadSourceTextFromBytes } from "../../lib/product/customer-intelligence/source-text";

function node(
  nodeId: string,
  sectionRef: string,
  heading: string,
  charStart: number,
  charEnd: number,
): StructuralNodeRecord {
  return {
    nodeId,
    sourceId: "test:quila",
    nodeType: "SECTION",
    sectionRef,
    heading,
    charStart,
    charEnd,
    ambiguous: false,
  };
}

function spanOf(text: string, needle: string, from = 0): { start: number; end: number } {
  const start = text.indexOf(needle, from);
  if (start < 0) throw new Error(`needle not found: ${needle}`);
  return { start, end: start + needle.length };
}

describe("table-of-contents suppression + dedup", () => {
  const text = [
    "TABLE OF CONTENTS",
    "Section 6.01 Limitation on Indebtedness .................... 45",
    "Section 6.02 Limitation on Restricted Payments ............ 50",
    "ARTICLE VI COVENANTS",
    "Section 6.01 Limitation on Indebtedness. The Issuer shall not incur Indebtedness except Permitted Indebtedness.",
    "Section 6.02 Limitation on Restricted Payments. The Issuer shall not make any Restricted Payment except as permitted by this Section 6.02.",
    "",
  ].join("\n");

  it("emits one candidate per section: body wins, TOC lines are not candidates", () => {
    const toc601 = spanOf(text, "Section 6.01 Limitation on Indebtedness ...");
    const toc602 = spanOf(text, "Section 6.02 Limitation on Restricted Payments ...");
    const body601 = spanOf(text, "Section 6.01 Limitation on Indebtedness. The Issuer");
    const body602 = spanOf(text, "Section 6.02 Limitation on Restricted Payments. The Issuer");
    const nodes = [
      node("toc-601", "6.01", "Limitation on Indebtedness", toc601.start, toc601.end),
      node("toc-602", "6.02", "Limitation on Restricted Payments", toc602.start, toc602.end),
      node("body-601", "6.01", "Limitation on Indebtedness", body601.start, body601.end),
      node("body-602", "6.02", "Limitation on Restricted Payments", body602.start, body602.end),
    ];
    const candidates = discoverCovenantCandidates("test:quila", text, nodes);
    expect(candidates).toHaveLength(2);
    const c601 = candidates.find((c) => c.nodeId === "body-601");
    expect(c601).toBeDefined();
    expect(c601!.excerpt).toContain("shall not incur");
    expect(candidates.map((c) => c.nodeId).sort()).toEqual(["body-601", "body-602"]);
  });

  it("drops a TOC-only section entirely (no body to fall back to)", () => {
    const tocText = [
      "TABLE OF CONTENTS",
      "Section 6.05 Limitation on Liens .................... 58",
      "ARTICLE VI COVENANTS",
      "",
    ].join("\n");
    const toc605 = spanOf(tocText, "Section 6.05 Limitation on Liens ...");
    const candidates = discoverCovenantCandidates(
      "test:quila",
      tocText,
      [node("toc-605", "6.05", "Limitation on Liens", toc605.start, toc605.end)],
    );
    expect(candidates).toHaveLength(0);
  });
});

describe("non-covenant provisions are not operating covenants", () => {
  it("defeasance is not emitted as a covenant candidate", () => {
    const text =
      "Section 10.04 Legal Defeasance. The Issuer may elect defeasance, provided that the Issuer shall have deposited with the Trustee money sufficient to pay all principal and interest on the Notes.";
    const s = spanOf(text, "Section 10.04");
    const candidates = discoverCovenantCandidates("test:quila", text, [
      node("n-def", "10.04", "Legal Defeasance and Covenant Defeasance", s.start, s.end),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("defeasance analysis is OTHER / UNRESOLVED, never an obligation covenant", () => {
    const analysis = analyzeProvision({
      sourceId: "test:quila",
      documentTitle: "Test Indenture",
      candidate: {
        candidateId: "c-def",
        sourceId: "test:quila",
        nodeId: "n-def",
        families: ["UNKNOWN"],
        signals: [],
        excerpt:
          "The Issuer may elect defeasance, provided that the Issuer shall have deposited with the Trustee money sufficient to pay all principal and interest on the Notes.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 3,
      },
      definitions: [],
      structuralNodes: [
        node("n-def", "10.04", "Legal Defeasance and Covenant Defeasance", 0, 100),
      ],
    });
    expect(analysis.category).toBe("OTHER");
    expect(analysis.posture).toBe("UNRESOLVED");
  });

  it("an event-of-default trigger is not an enumerated permission", () => {
    const analysis = analyzeProvision({
      sourceId: "test:quila",
      documentTitle: "Test Indenture",
      candidate: {
        candidateId: "c-eod",
        sourceId: "test:quila",
        nodeId: "n-eod",
        families: ["EVENTS_OF_DEFAULT"],
        signals: [],
        excerpt:
          "(j) default under any Indebtedness of the Issuer in excess of $30.0 million, which default shall constitute an Event of Default.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 5,
      },
      definitions: [],
      structuralNodes: [node("n-eod", "8.01(j)", "(j) Cross-Default", 0, 100)],
    });
    expect(analysis.category).toBe("EVENTS_OF_DEFAULT");
    expect(analysis.posture).toBe("UNRESOLVED");
    expect(analysis.permissions).toEqual([]);
    expect(analysis.plainEnglish).toMatch(/event-of-default/i);
  });

  it("a 'shall not be construed' interpretation clause is not a prohibition", () => {
    const analysis = analyzeProvision({
      sourceId: "test:quila",
      documentTitle: "Test Indenture",
      candidate: {
        candidateId: "c-admin",
        sourceId: "test:quila",
        nodeId: "n-admin",
        families: ["UNKNOWN"],
        signals: [],
        excerpt:
          "This Indenture shall not be construed to prevent the Issuer from incurring Indebtedness except as otherwise provided herein.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 3,
      },
      definitions: [],
      structuralNodes: [
        node("n-admin", "15.10", "No Adverse Interpretation of Other Agreements", 0, 100),
      ],
    });
    expect(analysis.category).toBe("OTHER");
    expect(analysis.posture).toBe("UNRESOLVED");
  });

  it("a bare 'provided that' does not manufacture a conditions family", () => {
    const families = classifyFamiliesFromText(
      "The Issuer may elect defeasance, provided that the Issuer shall have deposited money sufficient to pay the Notes.",
      "Legal Defeasance",
    );
    expect(families).toEqual(["UNKNOWN"]);
  });

  it("a genuine debt-incurrence prohibition still classifies correctly", () => {
    const analysis = analyzeProvision({
      sourceId: "test:quila",
      documentTitle: "Test Indenture",
      candidate: {
        candidateId: "c-debt",
        sourceId: "test:quila",
        nodeId: "n-debt",
        families: ["INDEBTEDNESS"],
        signals: [],
        excerpt:
          "The Issuer shall not incur Indebtedness except Permitted Indebtedness. Permitted Indebtedness includes Indebtedness under the Credit Facilities.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 8,
      },
      definitions: [],
      structuralNodes: [node("n-debt", "6.01", "Limitation on Indebtedness", 0, 100)],
    });
    expect(analysis.category).toBe("DEBT_INCURRENCE");
    expect(analysis.posture).toBe("GENERAL_PROHIBITION");
  });
});

describe("unit-preserving amounts", () => {
  it("keeps 'million' on dollar thresholds", () => {
    const analysis = analyzeProvision({
      sourceId: "test:quila",
      documentTitle: "Test Indenture",
      candidate: {
        candidateId: "c-amt",
        sourceId: "test:quila",
        nodeId: "n-amt",
        families: ["FINANCIAL_MAINTENANCE_COVENANTS"],
        signals: [],
        excerpt:
          "The Issuer shall maintain revolving commitments of no less than U.S.$150.0 million and cash of no less than U.S.$100.0 million.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 6,
      },
      definitions: [],
      structuralNodes: [node("n-amt", "5.24", "Required Revolving Credit Facility", 0, 100)],
    });
    expect(analysis.basketsAndThresholds.join(" ")).toContain("$150.0 million");
    expect(analysis.basketsAndThresholds.join(" ")).toContain("$100.0 million");
    expect(analysis.basketsAndThresholds.join(" ")).not.toMatch(/\$150\.0(?!\s*million)/);
  });

  it("keeps 'million' on the fixed limb of a greater-of basket", () => {
    const analysis = analyzeProvision({
      sourceId: "test:quila",
      documentTitle: "Test Indenture",
      candidate: {
        candidateId: "c-go",
        sourceId: "test:quila",
        nodeId: "n-go",
        families: ["INDEBTEDNESS"],
        signals: [],
        excerpt:
          "Permitted Indebtedness includes Indebtedness in an aggregate principal amount not to exceed the greater of (x) $150.0 million and (y) 5.0% of Consolidated EBITDA.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 8,
      },
      definitions: [],
      structuralNodes: [node("n-go", "6.01", "Limitation on Indebtedness", 0, 100)],
    });
    expect(analysis.basketsAndThresholds.join(" ")).toContain(
      "Greater of basket: $150.0 million and 5.0% of Consolidated EBITDA",
    );
  });
});

describe("source text is extracted text, never raw PDF bytes", () => {
  it("a malformed PDF yields no raw '%PDF' bytes in extracted text", async () => {
    const fakePdf = Buffer.from(
      "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\n\x00\x01\x02binary-gibberish",
      "latin1",
    );
    const { text } = await extractTextAsync(fakePdf, "document.pdf");
    expect(text).not.toContain("%PDF");
    expect(text).not.toContain("binary-gibberish");
  });

  it("loadSourceTextFromBytes never surfaces raw PDF bytes", async () => {
    const fakePdf = Buffer.from("%PDF-1.7\n\x00\x01\x02binary-gibberish", "latin1");
    const out = await loadSourceTextFromBytes(fakePdf, "document.pdf");
    expect(out.text).not.toContain("%PDF");
    expect(out.text).not.toContain("binary-gibberish");
  });

  it("plain text still extracts", async () => {
    const out = await loadSourceTextFromBytes(
      Buffer.from("Section 6.01 Limitation on Indebtedness.", "utf8"),
      "document.txt",
    );
    expect(out.text).toContain("Section 6.01");
  });
});

describe("chapeau inheritance: bare sub-clauses under a prohibition-with-except chapeau are permissions", () => {
  const chapeau = "The Borrower shall not create, incur, assume or suffer to exist any Lien except:";
  function subClause(excerpt: string, parentChapeau?: string) {
    return analyzeProvision({
      sourceId: "test:quila",
      documentTitle: "Test Credit Agreement",
      candidate: {
        candidateId: "c-sub",
        sourceId: "test:quila",
        nodeId: "n-sub",
        families: ["LIENS"],
        signals: [],
        excerpt,
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 5,
      },
      definitions: [],
      structuralNodes: [node("n-sub", "7.01(a)", "(a) Liens for taxes", 0, 100)],
      parentChapeau,
    });
  }

  it("a bare sub-clause under a shall-not/except chapeau is an enumerated permission", () => {
    expect(subClause("(a) Liens for taxes not yet due.", chapeau).posture).toBe("ENUMERATED_PERMISSION");
  });

  it("a bare sub-clause with its own provided-that is a conditional permission", () => {
    expect(
      subClause("(a) Liens for taxes not yet due, provided that no Default has occurred.", chapeau).posture,
    ).toBe("CONDITIONAL_PERMISSION");
  });

  it("a sub-clause with its own shall-not stays a prohibition (own signal wins)", () => {
    expect(
      subClause("(a) The Borrower shall not create Liens for taxes.", chapeau).posture,
    ).toBe("GENERAL_PROHIBITION");
  });

  it("no inheritance when the chapeau has no except frame", () => {
    expect(
      subClause("(a) Liens for taxes not yet due.", "The Borrower shall not create any Lien.").posture,
    ).toBe("UNRESOLVED");
  });

  it("no inheritance without a parent chapeau", () => {
    expect(subClause("(a) Liens for taxes not yet due.").posture).toBe("UNRESOLVED");
  });

  it("a bare-stem chapeau (Create, incur or assume ... other than) also frames permissions", () => {
    expect(
      subClause(
        "(a) Liens for taxes not yet due.",
        "Create, incur or assume any Lien upon any property, other than the following:",
      ).posture,
    ).toBe("ENUMERATED_PERMISSION");
  });

  it("the bare-stem chapeau itself is a general prohibition", () => {
    expect(
      subClause(
        "Create, incur or assume any Lien upon any property, other than the following:",
        undefined,
      ).posture,
    ).toBe("GENERAL_PROHIBITION");
  });

  it("the summarizer wires the parent chapeau to the sub-clause", async () => {
    const { buildDocumentCovenantSummary } = await import(
      "../../lib/product/covenant-intelligence/summarize"
    );
    const parentExcerpt = `${chapeau}\n(a) Liens for taxes not yet due.\n(b) Liens for carriers.`;
    const summary = buildDocumentCovenantSummary({
      sourceId: "test:quila",
      documentTitle: "Test Credit Agreement",
      issuerCik: "0000000001",
      documentClass: "CREDIT_AGREEMENT",
      candidates: [
        {
          candidateId: "c-parent",
          sourceId: "test:quila",
          nodeId: "n-parent",
          families: ["LIENS"],
          signals: [],
          excerpt: parentExcerpt,
          representationLevel: "DISCOVERED_CANDIDATE",
          discoveryScore: 8,
        },
        {
          candidateId: "c-sub",
          sourceId: "test:quila",
          nodeId: "n-sub",
          families: ["LIENS"],
          signals: [],
          excerpt: "(a) Liens for taxes not yet due.",
          representationLevel: "DISCOVERED_CANDIDATE",
          discoveryScore: 5,
        },
      ],
      definitions: [],
      structuralNodes: [
        { nodeId: "n-parent", sourceId: "test:quila", nodeType: "SECTION", sectionRef: "7.01", heading: "Liens", charStart: 0, charEnd: 200 },
        { nodeId: "n-sub", sourceId: "test:quila", nodeType: "SUBSECTION", sectionRef: "7.01(a)", heading: "(a) Liens for taxes", charStart: 0, charEnd: 100, parentNodeId: "n-parent" },
      ],
    });
    const child = summary.items.find((i) => i.sectionRef === "7.01(a)");
    expect(child?.posture).toBe("ENUMERATED_PERMISSION");
  });
});
