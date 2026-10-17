/**
 * Generalization proof: the covenant-intelligence rules are written
 * against drafting shapes, not against any one document.
 *
 * These tests deliberately use NO Quila-shaped text — different agreement
 * types (credit agreement, not indenture), different section numbering
 * (§ symbol, Article VII, numeric clauses), different heading casing,
 * different currency prefixes, and different prohibition phrasings
 * ("will not", "Neither … shall"). A rule that only works on the
 * document it was debugged against fails here.
 */
import { describe, expect, it } from "vitest";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { classifyFamiliesFromText } from "../../lib/knowledge-factory/taxonomy/families";
import type {
  KnowledgeTaxonomyFamily,
  StructuralNodeRecord,
} from "../../lib/knowledge-factory/types";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import { grantTypesForItem } from "../../lib/product/customer-intelligence/grant-types";

function node(
  nodeId: string,
  sectionRef: string,
  heading: string,
  charStart: number,
  charEnd: number,
): StructuralNodeRecord {
  return {
    nodeId,
    sourceId: "test:general",
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

function analyze(
  excerpt: string,
  heading: string,
  families: KnowledgeTaxonomyFamily[],
  candidateId = "c-general",
  definitions: Array<{ term: string; excerpt: string }> = [],
) {
  return analyzeProvision({
    sourceId: "test:general",
    documentTitle: "Test Agreement",
    candidate: {
      candidateId,
      sourceId: "test:general",
      nodeId: "n-general",
      families,
      signals: [],
      excerpt,
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: 8,
    },
    definitions: definitions.map((d) => ({ ...d, sourceId: "test:general", nodeId: "n-general", charStart: 0, charEnd: 0 })),
    structuralNodes: [node("n-general", "7.02", heading, 0, 100)],
  });
}

describe("generalization: agreement types and drafting shapes", () => {
  it("credit-agreement Negative Pledge (Section 7.02, Borrower) reads as a Liens prohibition", () => {
    const a = analyze(
      "Section 7.02 Negative Pledge. The Borrower shall not create, incur or assume any Lien upon any of its property except Permitted Liens.",
      "Negative Pledge",
      ["LIENS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
    expect(a.restriction ?? "").toMatch(/shall not/i);
  });

  it("'will not' is a prohibition, not an obligation", () => {
    const a = analyze(
      "The Company will not, and will not permit any Subsidiary to, incur Indebtedness except Permitted Indebtedness.",
      "Limitation on Indebtedness",
      ["INDEBTEDNESS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
  });

  it("'Neither X nor Y shall' is a prohibition with no 'not'", () => {
    const a = analyze(
      "Neither the Issuer nor any Restricted Subsidiary shall create any Lien upon any of its assets except Permitted Liens.",
      "Limitation on Liens",
      ["LIENS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
    expect(a.posture).not.toBe("OBLIGATION");
  });

  it("all-caps heading still classifies", () => {
    const a = analyze(
      "THE ISSUER SHALL NOT INCUR INDEBTEDNESS EXCEPT PERMITTED INDEBTEDNESS.",
      "LIMITATION ON INDEBTEDNESS",
      ["INDEBTEDNESS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
  });

  it("restricted-payments covenant reads as a prohibition", () => {
    const a = analyze(
      "Section 9.03 Limitation on Restricted Payments. The Company shall not make any Restricted Payment except as permitted by this Section 9.03.",
      "Limitation on Restricted Payments",
      ["RESTRICTED_PAYMENTS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
  });
});

describe("generalization: clause markers and currency forms", () => {
  it("roman-numeral greater-of limbs stay inside their basket", () => {
    const a = analyze(
      "The Borrower shall not incur Indebtedness except: " +
        "(a) Indebtedness under the Credit Agreement in an aggregate principal amount not to exceed $200,000,000; " +
        "(b) Indebtedness in an aggregate principal amount not to exceed the greater of (i) $25,000,000 and (ii) 15% of Consolidated EBITDA; " +
        "(c) Indebtedness evidenced by the Notes.",
      "Limitation on Indebtedness",
      ["INDEBTEDNESS"],
    );
    expect(a.permissions).toHaveLength(3);
    expect(a.permissions[1]).toContain("$25,000,000");
    expect(a.permissions[1]).toContain("15% of Consolidated EBITDA");
    expect(a.permissions[1]).not.toContain("(c)");
  });

  it("numeric clause markers (1)/(2) split like letter clauses", () => {
    const a = analyze(
      "The Borrower shall not incur Indebtedness except: " +
        "(1) Indebtedness under the Credit Agreement; " +
        "(2) Indebtedness in an aggregate principal amount not to exceed $40,000,000.",
      "Limitation on Indebtedness",
      ["INDEBTEDNESS"],
    );
    expect(a.permissions).toHaveLength(2);
    expect(a.permissions[1]).toContain("$40,000,000");
  });

  it("US$ prefix survives in a basket clause", () => {
    const a = analyze(
      "The Issuer shall not incur Indebtedness except: (a) Indebtedness in an aggregate principal amount not to exceed US$100 million.",
      "Limitation on Indebtedness",
      ["INDEBTEDNESS"],
    );
    expect(a.permissions).toHaveLength(1);
    expect(a.permissions[0]).toContain("US$100 million");
  });
});

describe("generalization: family synonyms", () => {
  it("'Limitation on Debt' / 'shall not incur Debt' classifies as INDEBTEDNESS", () => {
    const families = classifyFamiliesFromText(
      "The Issuer shall not incur any Debt except Permitted Debt.",
      "Limitation on Debt",
    );
    expect(families).toContain("INDEBTEDNESS");
  });

  it("'Junior Debt Prepayments' does NOT gain INDEBTEDNESS (precision guard)", () => {
    const families = classifyFamiliesFromText(
      "The Issuer shall not prepay any Junior Debt except as permitted by this Section.",
      "Junior Debt Prepayments",
    );
    expect(families).toContain("JUNIOR_DEBT_PREPAYMENTS");
    expect(families).not.toContain("INDEBTEDNESS");
  });
});

describe("generalization: TOC shapes", () => {
  it("§-symbol body section is operative, not TOC", () => {
    const text = "§ 5.24 Limitation on Indebtedness. The Issuer shall not incur Indebtedness except Permitted Indebtedness.";
    const body = spanOf(text, "§ 5.24");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-524", "5.24", "Limitation on Indebtedness", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("ARTICLE-style dotted-leader TOC entry is suppressed", () => {
    const text = [
      "ARTICLE 6  COVENANTS  ..........  42",
      "Section 6.01 Limitation on Indebtedness. The Issuer shall not incur Indebtedness except Permitted Indebtedness.",
      "",
    ].join("\n");
    const toc = spanOf(text, "ARTICLE 6");
    const body = spanOf(text, "Section 6.01");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-6", "6", "Covenants", toc.start, toc.end),
      node("body-601", "6.01", "Limitation on Indebtedness", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.nodeId).toBe("body-601");
  });

  it("roman-numeral bare TOC entry (VII. … 35) is suppressed", () => {
    const text = ["VII. Limitation on Indebtedness 35", ""].join("\n");
    const toc = spanOf(text, "VII. Limitation on Indebtedness 35");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-vii", "7", "Limitation on Indebtedness", toc.start, toc.end),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("rule 163: multi-line Section-prefixed TOC entry is suppressed (EDGAR splits ref/title/page across lines)", () => {
    // Strata shape: the TOC lists "Section 6.01." / "Indebtedness" /
    // "109" on separate lines. No single line matches the TOC
    // patterns, so the TOC node survived and duplicated the body
    // section (same sectionRef, different excerpt, dedup kept both).
    const text = [
      "Section 6.01.",
      "Indebtedness",
      "109",
      "",
      "Section 6.01. Indebtedness. No Loan Party shall create Indebtedness except Permitted Indebtedness.",
      "",
    ].join("\n");
    const toc = spanOf(text, "Section 6.01.");
    const body = spanOf(text, "Section 6.01. Indebtedness. No Loan Party");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-601", "6.01", "Section 6.01.\nIndebtedness", toc.start, toc.end),
      node("body-601", "6.01", "Indebtedness", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.nodeId).toBe("body-601");
  });

  it("rule 163: multi-line ARTICLE-level TOC entry is suppressed", () => {
    // Aon shape: "ARTICLE IV" / "CONDITIONS PRECEDENT" / "45" on
    // separate lines. Same multi-line escape as the Section shape.
    const text = [
      "ARTICLE IV",
      "CONDITIONS PRECEDENT",
      "45",
      "",
      "ARTICLE IV CONDITIONS PRECEDENT. The Loans shall not become effective unless the conditions are met.",
      "",
    ].join("\n");
    const toc = spanOf(text, "ARTICLE IV");
    const body = spanOf(text, "ARTICLE IV CONDITIONS PRECEDENT. The Loans");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-4", "4", "ARTICLE IV\nCONDITIONS PRECEDENT", toc.start, toc.end),
      node("body-4", "4", "CONDITIONS PRECEDENT", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.nodeId).toBe("body-4");
  });

  it("rule 163: TOC-shaped span WITH an operative verb is not suppressed (verb guard)", () => {
    const text = "Section 6.01. Indebtedness 109 The Borrower shall not create Indebtedness except Permitted Indebtedness.";
    const body = spanOf(text, "Section 6.01");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-601", "6.01", "Indebtedness", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("rule 163: article-level TOC LIST is suppressed (Aon shape — many entries, one span)", () => {
    // One TOC article node spans the whole entry list ("Article V
    // ... 48 5.1. ... 48 5.2. ... 49"), so no single-entry shape
    // matches. The entry count (≥3) identifies the TOC block.
    const text = [
      "Article V",
      "REPRESENTATIONS AND WARRANTIES",
      "48",
      "5.1. Corporate Existence and Standing",
      "48",
      "5.2. Authorization and Validity",
      "49",
      "5.3. Compliance with Laws",
      "49",
      "",
      "ARTICLE V REPRESENTATIONS AND WARRANTIES. The Parent represents and warrants that no Default has occurred. The Borrower shall not create Indebtedness except Permitted Indebtedness.",
      "",
    ].join("\n");
    const toc = spanOf(text, "Article V");
    const body = spanOf(text, "ARTICLE V REPRESENTATIONS AND WARRANTIES. The Parent");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-5", "5", "REPRESENTATIONS AND WARRANTIES", toc.start, toc.end),
      node("body-5", "5", "REPRESENTATIONS AND WARRANTIES", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.nodeId).toBe("body-5");
  });

  it("rule 163: body text with cross-references is not suppressed (entry-count guard)", () => {
    // No operative verb, but the cross-reference pair cannot fake
    // three TOC-list entries, so the body section survives.
    const text =
      "ARTICLE V REPRESENTATIONS AND WARRANTIES. No Default or Event of Default has occurred. " +
      "The representations in Sections 5.6 and 5.18 are true.";
    const body = spanOf(text, "ARTICLE V");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-5", "5", "REPRESENTATIONS AND WARRANTIES", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("rule 164: UNKNOWN gate matches plural heading keywords (COVENANTS, Subsidiaries)", () => {
    // Aon shape: the covenants article heading is plural
    // ("ARTICLE VI COVENANTS") and the excerpt mentions
    // "Subsidiaries". The singular-only gate dropped the entire
    // article while its TOC artifact survived. The amendment
    // cross-reference keeps the discovery score at 2 (the real
    // excerpt's signal) so the test exercises the gate, not the
    // score filter.
    const text =
      "ARTICLE VI COVENANTS. Subject to the Certain Funds Provisions, so long as any Loan shall remain unpaid, " +
      "each Loan Party will maintain, for itself and its Subsidiaries, a system of accounting designed to produce financial statements. " +
      "This Section 6.1 is subject to amendment under Section 8.2.";
    const body = spanOf(text, "ARTICLE VI");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-6", "6", "ARTICLE VI\nCOVENANTS", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("rule 164: UNKNOWN gate still drops a keyword-free administrative section", () => {
    const text =
      "ARTICLE X MISCELLANEOUS. This Agreement may be executed in counterparts. Notices must be sent to the address on file.";
    const body = spanOf(text, "ARTICLE X");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-10", "10", "MISCELLANEOUS", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(0);
  });
});

describe("generalization: rule 165 — compiler grants need operative text + parser title shape", () => {
  const grantItem = (heading: string, plainEnglish: string, families: string[] = []) =>
    ({ heading, plainEnglish, families, category: "OTHER" }) as unknown as Parameters<typeof grantTypesForItem>[0];

  it("Borrower alone mints no DEBT grant (Successors shape)", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "Section 9.04. Successors",
          "Section 9.04 states an event-of-default trigger covering Borrower. shall not be less than $5,000,000 unless each of the Borrower Representative and the Administrative Agent otherwise consent.",
        ),
      ),
    ).toEqual([]);
  });

  it("attorney-client mints no LIEN grant (GAAP fragment shape)", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "Section 6.14 , provided that in the event of any change",
          "Section 6.14 imposes an affirmative obligation for Borrower. subject to attorney-client or similar privilege. Material baskets/thresholds identified: Amount/threshold: $100,000,000.",
        ),
      ),
    ).toEqual([]);
  });

  it("unsecured and Borrowing Base mint no grant", () => {
    // "unsecured" must not fire SECURED (no word boundary inside it);
    // "Borrowing Base" is a defined term, not incurrence.
    expect(grantTypesForItem(grantItem("Section 6.02. Other Obligations", "The Borrower shall not permit unsecured obligations to exceed the Borrowing Base."))).toEqual([]);
    expect(grantTypesForItem(grantItem("Section 2.06. Letters", "The Borrower Representative may request Letters of Credit. shall not exceed the lesser of (x) the Aggregate Revolving Commitment and (y) the Borrowing Base."))).toEqual([]);
    // ...while a genuine Liens heading is still legitimate LIEN evidence.
    expect(grantTypesForItem(grantItem("Section 6.02. Liens", "The Borrower shall not permit obligations to exceed the applicable cap."))).toEqual(["LIEN"]);
  });

  it("defined-terms tail mints no grant (Acquisition Agreement is metadata)", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "Section 6.14. Reporting",
          "The Borrower shall deliver reports. Controlling defined terms: Acquisition, Acquisition Agreement, Administrative Agent.",
        ),
      ),
    ).toEqual([]);
  });

  it("a wrong LIENS family cannot launder a LIEN grant (Representations shape)", () => {
    expect(
      grantTypesForItem(
        grantItem("REPRESENTATIONS AND WARRANTIES", "Section V states an event-of-default trigger covering Loan Parties. Material baskets/thresholds identified: Amount/threshold: $200,000,000.", ["EVENTS_OF_DEFAULT", "LIENS"]),
      ),
    ).toEqual([]);
  });

  it("genuine debt and lien baskets still compile", () => {
    expect(
      grantTypesForItem(
        grantItem("6.01(e)", "Section 6.01(e) is a prohibition covering Borrower. shall not exceed $20,000,000 at any time outstanding; such Indebtedness is incurred prior to or within 90 days after such acquisition."),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
    expect(
      grantTypesForItem(
        grantItem("6.02(l)", "Section 6.02(l) operates as a permission. other Liens incurred in the ordinary course of business securing Indebtedness that do not in the aggregate exceed $250,000 at any time outstanding."),
      ),
      // Rule 201: the $250k caps the lien / secured obligation, not a
      // new debt basket — the debt is already counted under its
      // Section 6.01 basket. The secured sim clears via Rule 196
      // residual pairing, not a dual-grant LINK.
    ).toEqual(["LIEN"]);
  });

  it("genuine RP and Investment items still compile", () => {
    expect(grantTypesForItem(grantItem("Section 7.05. Restricted Payments", "The Borrower may pay Dividends and make Restricted Payments up to the Available Amount."))).toEqual(["RESTRICTED_PAYMENT"]);
    expect(grantTypesForItem(grantItem("Section 7.06. Investments", "The Borrower may make Permitted Investments in Subsidiaries."))).toEqual(["INVESTMENT"]);
  });

});

describe("generalization: rule 166 — default triggers never mint capacity", () => {
  const grantItem = (heading: string, plainEnglish: string, category: string) =>
    ({ heading, plainEnglish, families: [], category }) as unknown as Parameters<typeof grantTypesForItem>[0];

  it("a Defaults article with secured-Indebtedness language mints no grant", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "DEFAULTS",
          "Section VII states an event-of-default trigger covering Loan Parties. shall not apply to secured Indebtedness that becomes due as a result of the voluntary sale or transfer of the Property securing such Indebtedness. It does not itself permit or prohibit the underlying activity; it defines when the described failure or default becomes an Event of Default. Material baskets/thresholds identified: Amount/threshold: $200,000,000.",
          "EVENTS_OF_DEFAULT",
        ),
      ),
    ).toEqual([]);
  });

  it("the same language in a covenants item still compiles", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "6.02(l)",
          "Section 6.02(l) operates as a permission. other Liens incurred in the ordinary course of business securing Indebtedness that do not in the aggregate exceed $250,000 at any time outstanding.",
          "OTHER",
        ),
      ),
      // Rule 201: lien-only (see the Rule 165 test above).
    ).toEqual(["LIEN"]);
  });
});

describe("generalization: rule 168 — maintenance covenants never mint capacity", () => {
  const grantItem = (heading: string, plainEnglish: string, category: string) =>
    ({ heading, plainEnglish, families: [], category }) as unknown as Parameters<typeof grantTypesForItem>[0];

  it("a leverage maintenance covenant with acquisition language mints no grant", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "Financial Covenants (a) Consolidated Adjusted EBITDA to Consolidated Interest Expense",
          "Section 6.14 is a financial maintenance covenant. The Parent will maintain a ratio of Consolidated Adjusted EBITDA to Consolidated Interest Expense of not less than 4.0 to 1.0. Conditions: provided that, upon the written notice of the Parent, upon an acquisition the maximum ratio shall be increased.",
          "FINANCIAL_MAINTENANCE",
        ),
      ),
    ).toEqual([]);
  });

  it("ratio-gated incurrence in a covenants item still compiles as debt", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "6.01(k)",
          "The Borrower may incur Indebtedness so long as the Consolidated Leverage Ratio does not exceed 4.0 to 1.0 after giving effect to such incurrence.",
          "OTHER",
        ),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
  });
});

describe("generalization: rule 169 — DEBT needs affirmative borrowing permission", () => {
  const grantItem = (heading: string, plainEnglish: string, category = "OTHER") =>
    ({ heading, plainEnglish, families: [], category }) as unknown as Parameters<typeof grantTypesForItem>[0];

  it("a pure prohibition mints no DEBT grant", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "6.16. Indebtedness",
          "The Parent will not permit any Subsidiary to create, incur, assume or suffer to exist any Indebtedness.",
        ),
      ),
    ).toEqual([]);
  });

  it("an unrelated monetary threshold mints no DEBT grant", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "7.5. Cross-Default",
          "Indebtedness in excess of $200,000,000 shall constitute an Event of Default.",
        ),
      ),
    ).toEqual([]);
  });

  it("an evidence-of-indebtedness section mints no DEBT grant (Noteless shape)", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "Noteless Agreement; Evidence of Indebtedness",
          "Section 2.13 is a general debt incurrence prohibition covering Borrower. shall not in any manner affect the obligation of the Borrower to repay the Obligations in accordance with their terms; provided It is subject to enumerated exceptions/permissions, including: (b) The Administrative Agent shall also maintain accounts in which it will record the amount of each Loan. (d) Any Lender may request that its Loans be evidenced by a promissory note.",
        ),
      ),
    ).toEqual([]);
  });

  it("a prohibition with an express exception mints DEBT (6.16 shape)", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "6.16. Indebtedness",
          "Section 6.16 is a general debt incurrence prohibition covering Loan Parties. create, incur, assume or suffer to exist any Indebtedness, except as expressly permitted. It is subject to enumerated exceptions, including: (l) other Indebtedness in an aggregate principal amount outstanding at no time exceeding an amount equal to the greater of $1,000,000,000.",
        ),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
  });

  it("an RP item that merely mentions Indebtedness returns RP-only", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "7.05. Restricted Payments",
          "The Borrower may pay Dividends and make Restricted Payments. Indebtedness under the Credit Agreement shall be repaid in full before any such payment.",
        ),
      ),
    ).toEqual(["RESTRICTED_PAYMENT"]);
  });
});

describe("generalization: rule 170 — INVESTMENT needs affirmative permission", () => {
  const grantItem = (heading: string, plainEnglish: string, category = "OTHER") =>
    ({ heading, plainEnglish, families: [], category }) as unknown as Parameters<typeof grantTypesForItem>[0];

  it("an EBITDA add-back mentioning acquisition/investment mints no grant (16.3(xiv) shape)", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "16.3(xiv)",
          "Section 16.3(xiv) operates as a enumerated permission. Permission substance: (xiv) any fees, costs and expenses (including, without limitation, any issuance costs, advisory and professional fees, any transaction incentives or retention bonuses or similar payments, earnouts or other contingent consideration, and purchase price adjustments), or any amortization thereof, in connection with any proposed or completed acquisition, investment, disposition, issuance, repayment.",
        ),
      ),
    ).toEqual([]);
  });

  it("a genuine permitted-investments basket still compiles", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "Section 7.06. Investments",
          "The Borrower may make Permitted Investments in Subsidiaries.",
        ),
      ),
    ).toEqual(["INVESTMENT"]);
    expect(
      grantTypesForItem(
        grantItem(
          "7.06(k)",
          "Investments in Subsidiaries not exceeding $50,000,000 in the aggregate at any time outstanding.",
        ),
      ),
    ).toEqual(["INVESTMENT"]);
  });
});

describe("generalization: rule 176 (corrected) — strip the analyzer lead sentence", () => {
  const grantItem = (heading: string, plainEnglish: string, extra: Record<string, unknown> = {}) =>
    ({ heading, plainEnglish, families: [], category: "OTHER", ...extra }) as unknown as Parameters<typeof grantTypesForItem>[0];
  const ANALYZER_TEMPLATE =
    'Section 1(c)(b)(j) ("1(c)(b)(j)") operates as a enumerated permission within the liens and secured debt regime for Guarantor(s). Permission substance: (j) Agent shall have received searches of UCC, judgment lien, tax lien and litigation lien search reports and evidence that no Liens exist thereon other than Permitted Liens.';

  it("a conditions-precedent clause does not mint DEBT from the lead sentence", () => {
    expect(grantTypesForItem(grantItem("1(c)(b)(j)", ANALYZER_TEMPLATE))).toEqual(["LIEN"]);
    // Real analyzer output uses curly quotes around the heading.
    expect(
      grantTypesForItem(
        grantItem(
          "1(c)(b)(j)",
          "Section 1(c)(b)(j) (\u201c1(c)(b)(j)\u201d) operates as a enumerated permission within the liens and secured debt regime for Guarantor(s). Permission substance: (j) Agent shall have received searches and evidence that no Liens exist thereon other than Permitted Liens.",
        ),
      ),
    ).toEqual(["LIEN"]);
  });

  it("an EDITED item keeps its first sentence (counsel's words)", () => {
    expect(
      grantTypesForItem(
        grantItem("6.01(k)", "The Borrower may incur Indebtedness up to $50,000,000.", {
          reviewerDecision: "EDITED",
        }),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
  });

  it("a genuine debt basket still compiles after the lead strip", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "6.01(e)",
          'Section 6.01(e) ("6.01(e)") is a general debt incurrence prohibition covering Borrower. shall not exceed $20,000,000 at any time outstanding; such Indebtedness is incurred prior to acquisition.',
        ),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
  });

  it("a lead sentence naming the liens regime does not mint DEBT on a lien-only item", () => {
    expect(
      grantTypesForItem(
        grantItem(
          "6.02(a)",
          'Section 6.02(a) ("6.02(a)") is a general lien prohibition covering Borrower. shall not permit any Liens on its Property.',
        ),
      ),
    ).toEqual(["LIEN"]);
  });
});

describe("generalization: rule 179 — shared aggregate caps are one basket", () => {
  it("detects the aggregate proviso and resolves member clauses", async () => {
    const { detectSharedCapGroup } = await import(
      "../../lib/product/customer-intelligence/shared-cap"
    );
    const item = {
      sectionRef: "6.01(e)",
      plainEnglish:
        'Section 6.01(e) ("6.01(e)") is a general debt incurrence prohibition. the aggregate principal amount of Indebtedness permitted by this clause (e) and any Aircraft Financing permitted by clause (j) below, together with any Refinance Indebtedness in respect thereof permitted by clause (f) below, shall not exceed $20,000,000 at any time outstanding.',
      conditions: [],
    } as unknown as Parameters<typeof detectSharedCapGroup>[0];
    const group = detectSharedCapGroup(item);
    expect(group?.capMillions).toBe(20);
    expect(group?.memberSectionRefs).toEqual(["6.01(e)", "6.01(j)", "6.01(f)"]);
  });

  it("detects the group from the excerpt when the summary truncated the proviso", async () => {
    const { detectSharedCapGroup } = await import(
      "../../lib/product/customer-intelligence/shared-cap"
    );
    const item = {
      sectionRef: "6.01(e)",
      plainEnglish: "shall not exceed $20,000,000 at any time outstanding.",
      conditions: [],
      operativeLanguageExcerpt:
        "(e) Indebtedness of any Borrower incurred to finance the acquisition of fixed assets; provided that (i) such Indebtedness is incurred prior to or within 90 days after such acquisition and (ii) the aggregate principal amount of Indebtedness permitted by this clause (e) and any Aircraft Financing permitted by clause (j) below, together with any Refinance Indebtedness in respect thereof permitted by clause (f) below, shall not exceed $20,000,000 at any time outstanding;",
    } as unknown as Parameters<typeof detectSharedCapGroup>[0];
    const group = detectSharedCapGroup(item);
    expect(group?.capMillions).toBe(20);
    expect(group?.memberSectionRefs).toEqual(["6.01(e)", "6.01(j)", "6.01(f)"]);
  });

  it("does not detect a standalone cap as a shared group", async () => {
    const { detectSharedCapGroup } = await import(
      "../../lib/product/customer-intelligence/shared-cap"
    );
    const item = {
      sectionRef: "6.01(e)",
      plainEnglish:
        "Indebtedness of the Borrower shall not exceed $20,000,000 at any time outstanding.",
      conditions: [],
    } as unknown as Parameters<typeof detectSharedCapGroup>[0];
    expect(detectSharedCapGroup(item)).toBeNull();
  });

  it("the legacy formula counts a shared group once", async () => {
    const { buildCapacityFormulas } = await import(
      "../../lib/product/customer-intelligence/capacity-formulas"
    );
    const formulas = buildCapacityFormulas(
      ["counsel:doc:6.01_e_:DEBT", "counsel:doc:6.01_j_:DEBT", "counsel:doc:6.02_l_:DEBT"],
      ["counsel:doc:6.02_l_:LIEN"],
      [{ capMillions: 20, memberCodes: ["counsel:doc:6.01_e_:DEBT", "counsel:doc:6.01_j_:DEBT"], label: "Shared aggregate cap (6.01(e))" }],
    );
    // unsecured = MIN(20, 20+20) + 0.25, not 20+20+0.25
    const unsecured = formulas.unsecured!;
    expect(unsecured.items).toHaveLength(2);
    const group = unsecured.items.find((i) => i.op === "MIN") as { op: "MIN"; items: unknown[] };
    expect(group).toBeDefined();
    expect(group.items[0]).toEqual({ op: "CONST", value: 20, label: "Shared aggregate cap (6.01(e))" });
  });
});

describe("generalization: rule 180 — maintenance ratio provisions", () => {
  const ratioItem = (plainEnglish: string, baskets: string[], excerpt = "") =>
    ({
      heading: "6.14",
      plainEnglish,
      materialBasketsThresholds: baskets,
      operativeLanguageExcerpt: excerpt,
    }) as unknown as Parameters<
      typeof import("../../lib/product/customer-intelligence/maintenance-ratio").parseMaintenanceRatio
    >[0];

  it("mints a flat leverage test", async () => {
    const { parseMaintenanceRatio } = await import(
      "../../lib/product/customer-intelligence/maintenance-ratio"
    );
    expect(
      parseMaintenanceRatio(
        ratioItem(
          "The Borrower shall not permit the Total Net Leverage Ratio to exceed 4.00 to 1.00 at any quarter end.",
          ["Ratio threshold: 4.00 to 1.00"],
        ),
      ),
    ).toEqual({ formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4, debtBasis: "total" });
  });

  it("mints a flat coverage test", async () => {
    const { parseMaintenanceRatio } = await import(
      "../../lib/product/customer-intelligence/maintenance-ratio"
    );
    expect(
      parseMaintenanceRatio(
        ratioItem(
          "The Borrower shall maintain a Consolidated Interest Coverage Ratio of not less than 2.50 to 1.00.",
          ["Ratio threshold: 2.50 to 1.00"],
        ),
      ),
    ).toEqual({ formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2.5 });
  });

  it("Rule 192: refuses a single-test provision from a truncated excerpt (the tail may hide more tests)", async () => {
    const { parseMaintenanceRatio } = await import(
      "../../lib/product/customer-intelligence/maintenance-ratio"
    );
    expect(
      parseMaintenanceRatio(
        ratioItem(
          "The Borrower shall not permit the Total Net Leverage Ratio to exceed 4.00 to 1.00 at any quarter end.",
          ["Ratio threshold: 4.00 to 1.00"],
        ) as unknown as Parameters<
          typeof import("../../lib/product/customer-intelligence/maintenance-ratio").parseMaintenanceRatio
        >[0],
      ),
    ).toEqual({ formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4, debtBasis: "total" });
    const truncated = {
      ...ratioItem(
        "The Borrower shall not permit the Total Net Leverage Ratio to exceed 4.00 to 1.00 at any quarter end.",
        ["Ratio threshold: 4.00 to 1.00"],
      ),
      operativeExcerptTruncated: true,
    };
    expect(parseMaintenanceRatio(truncated as never)).toBeNull();
    const edited = { ...truncated, reviewerDecision: "EDITED" as const };
    expect(parseMaintenanceRatio(edited as never)).toEqual({
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 4,
      debtBasis: "total",
    });
  });

  it("refuses a stepped schedule (several distinct thresholds)", async () => {
    const { parseMaintenanceRatio } = await import(
      "../../lib/product/customer-intelligence/maintenance-ratio"
    );
    expect(
      parseMaintenanceRatio(
        ratioItem(
          "Leverage Ratio shall not exceed 4.75 to 1.00, then 4.50 to 1.00, then 4.25 to 1.00.",
          ["Ratio threshold: 4.75 to 1.00", "Ratio threshold: 4.50 to 1.00", "Ratio threshold: 4.25 to 1.00"],
        ),
      ),
    ).toBeNull();
  });

  it("refuses a stepped schedule even when the baskets list only the first leg", async () => {
    // The genuine gap: parseRatio returned only the FIRST ratio, so a
    // stepped schedule whose baskets captured one threshold passed the
    // agreement check and compiled flat at the first leg. The text
    // carries all three legs, so the all-ratios check must refuse it.
    const { parseMaintenanceRatio } = await import(
      "../../lib/product/customer-intelligence/maintenance-ratio"
    );
    expect(
      parseMaintenanceRatio(
        ratioItem(
          "Leverage Ratio shall not exceed 4.75 to 1.00, then 4.50 to 1.00, then 4.25 to 1.00.",
          ["Ratio threshold: 4.75 to 1.00"],
        ),
      ),
    ).toBeNull();
  });

  it("refuses conflated tests (leverage + coverage in one item)", async () => {
    const { parseMaintenanceRatio } = await import(
      "../../lib/product/customer-intelligence/maintenance-ratio"
    );
    expect(
      parseMaintenanceRatio(
        ratioItem(
          "The Borrower shall maintain an Interest Coverage Ratio of not less than 2.00 to 1.00 and shall not permit the Total Net Leverage Ratio to exceed 2.00 to 1.00.",
          ["Ratio threshold: 2.00 to 1.00"],
        ),
      ),
    ).toBeNull();
  });

  it("refuses a leverage test with a coverage direction", async () => {
    const { parseMaintenanceRatio } = await import(
      "../../lib/product/customer-intelligence/maintenance-ratio"
    );
    expect(
      parseMaintenanceRatio(
        ratioItem(
          "The Borrower shall maintain a Total Net Leverage Ratio of not less than 4.00 to 1.00.",
          ["Ratio threshold: 4.00 to 1.00"],
        ),
      ),
    ).toBeNull();
  });
});

describe("rule 187: no junk Except permission from a bare chapeau colon", () => {
  it("a chapeau ending in 'except:' (clauses in child items) mints no permission", () => {
    const a = analyze(
      "Section 6.01 Indebtedness. No Loan Party will, nor will it permit any Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:",
      "Indebtedness",
      ["RESTRICTED_PAYMENTS"],
    );
    expect(a.permissions).toEqual([]);
  });

  it("'except' with substantive remainder still mints the Except permission", () => {
    const a = analyze(
      "Section 7.02 Negative Pledge. The Borrower shall not create any Lien except as set forth in Section 5.2.",
      "Negative Pledge",
      ["RESTRICTED_PAYMENTS"],
    );
    expect(a.permissions).toEqual(["Except: as set forth in Section 5.2."]);
  });

  it("'except' with a bare pointer remainder mints no permission", () => {
    const a = analyze(
      "Section 6.01 Indebtedness. No Loan Party will incur any Indebtedness, except (a).",
      "Indebtedness",
      ["RESTRICTED_PAYMENTS"],
    );
    expect(a.permissions).toEqual([]);
  });
});

/** Rule 199: defined terms match as whole words/phrases, not substrings. */
describe("rule 199: defined-term word-boundary matching", () => {
  const defs = [
    { term: "SEC", excerpt: "\u201cSEC\u201d means the Securities and Exchange Commission of the U.S." },
    { term: "Threshold Amount", excerpt: "\u201cThreshold Amount\u201d means $ 750,000." },
  ];
  it("SEC does not attach when the excerpt only says 'unsecured'", () => {
    const a = analyze("(k) other unsecured Indebtedness in an aggregate principal amount not exceeding the Threshold Amount.", "6.01(k)", ["INDEBTEDNESS"], "c-199a", defs);
    expect(a.applicableDefinitions.map((d) => d.term)).not.toContain("SEC");
  });
  it("SEC attaches when the excerpt mentions the SEC standalone", () => {
    const a = analyze("The Borrower shall file reports with the SEC as required by law.", "5.01", ["GENERAL_CONDITIONS_AND_EXCEPTIONS"], "c-199b", defs);
    expect(a.applicableDefinitions.map((d) => d.term)).toContain("SEC");
  });
  it("a multi-word term attaches across a line break in the excerpt", () => {
    const a = analyze("(k) other unsecured Indebtedness not exceeding the Threshold\nAmount at any time.", "6.01(k)", ["INDEBTEDNESS"], "c-199c", defs);
    expect(a.applicableDefinitions.map((d) => d.term)).toContain("Threshold Amount");
  });
});

/** Rule 200: a heading split across source lines is one line. */
describe("rule 200: heading whitespace normalization", () => {
  it("collapses a newline inside a node heading", () => {
    const a = analyzeProvision({
      sourceId: "test:general",
      documentTitle: "Test Agreement",
      candidate: {
        candidateId: "c-200",
        sourceId: "test:general",
        nodeId: "n-200",
        families: ["GENERAL_CONDITIONS_AND_EXCEPTIONS"],
        signals: [],
        excerpt: "Additional Guarantors shall execute a joinder.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 8,
      },
      definitions: [],
      structuralNodes: [
        {
          nodeId: "n-200",
          sourceId: "test:general",
          nodeType: "SECTION",
          sectionRef: "6.17",
          heading: "Additional\nGuarantors",
          charStart: 0,
          charEnd: 100,
          ambiguous: false,
        } as any,
      ],
    });
    expect(a.heading).toBe("Additional Guarantors");
    expect(a.heading).not.toContain("\n");
  });
});

/** Rule 205: basket-shaped candidates survive the 120-item cap. */
describe("rule 205: basket-shaped candidates rank first in the cap", () => {
  it("a low-score basket candidate survives the cap over higher-scored noise", async () => {
    const { buildDocumentCovenantSummary } = await import("../../lib/product/covenant-intelligence/summarize");
    const candidates: any[] = [];
    const nodes: any[] = [];
    // Cap is 1000 (raised from 120): 1000 noise + 1 basket = 1001
    // candidates, so the cap binds and the basket must survive it.
    for (let i = 0; i < 1000; i++) {
      candidates.push({
        candidateId: `c-fill-${i}`,
        sourceId: "test:205",
        nodeId: `n-fill-${i}`,
        families: ["UNKNOWN"],
        signals: [],
        excerpt: `Section 9.${i} Miscellaneous administrative provision with no dollar amount.`,
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 10,
      });
      nodes.push({ nodeId: `n-fill-${i}`, sourceId: "test:205", nodeType: "SECTION", sectionRef: `9.${i}`, heading: `Section 9.${i}`, charStart: i * 100, charEnd: i * 100 + 50, ambiguous: false });
    }
    candidates.push({
      candidateId: "c-basket",
      sourceId: "test:205",
      nodeId: "n-basket",
      families: ["INDEBTEDNESS"],
      signals: [],
      excerpt: "(f) Indebtedness of any Person that becomes a Subsidiary of the Borrower after the date hereof in an aggregate principal amount not to exceed $5,000,000.",
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: 0,
    });
    nodes.push({ nodeId: "n-basket", sourceId: "test:205", nodeType: "SUBSECTION", sectionRef: "7.02(f)", heading: "7.02(f)", charStart: 0, charEnd: 100, ambiguous: false });
    const summary = buildDocumentCovenantSummary({
      sourceId: "test:205",
      documentTitle: "Test Agreement",
      issuerCik: "0000123456",
      documentClass: "CREDIT_AGREEMENT",
      candidates,
      definitions: [],
      structuralNodes: nodes,
    });
    expect(summary.items.length).toBe(1000);
    expect(summary.items.some((i) => i.sectionRef === "7.02(f)")).toBe(true);
  });
});
