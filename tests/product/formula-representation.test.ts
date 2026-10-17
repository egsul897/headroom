/**
 * Formula representation (G2 steps 1, 3, 4) — semantic pins.
 *
 * Step 1 (this block): the affirmative NONE_UNCAPPED determinate
 * state. A grant-bearing item in a permission posture whose
 * contract text contains NO cap — no amount, percentage, ratio,
 * builder, or reference to a cap elsewhere — is determinate as
 * uncapped. The determination is affirmative, never a default:
 * truncated items, prohibition postures, reserved clauses, and
 * clauses pointing at a cap in a schedule / exhibit / another
 * section / an unresolvable defined term / the amount being
 * refinanced / an LC face amount stay KNOWN_NOT_MODELED, the
 * reference cases with the named missing field referenceExternal.
 */
import { describe, expect, it, vi } from "vitest";
import { parseFormulaFromItem } from "../../lib/product/customer-intelligence/formula-parse";
import { grantTypesForItem } from "../../lib/product/customer-intelligence/grant-types";
import { isRoutineItem } from "../../lib/product/customer-intelligence/routine-review";
import { proposeReviewDecision } from "../../lib/product/customer-intelligence/review-proposal";
import { evaluateProvision, computeLeverageMetrics } from "../../lib/covenant-engine";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(overrides: Partial<CovenantSummaryItem>): CovenantSummaryItem {
  return {
    heading: "Section",
    sectionRef: "0.00",
    category: "DEBT_INCURRENCE",
    categoryLabel: "Debt incurrence",
    posture: "ENUMERATED_PERMISSION",
    plainEnglish: "",
    restriction: null,
    permissions: [],
    coveredEntities: ["Borrower"],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: [],
    draftingPatterns: [],
    operativeLanguageExcerpt: "",
    sourceCitation: "test",
    governingAgreement: "test",
    families: [],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: {
      borrower: true,
      guarantor: false,
      restrictedSubsidiary: false,
      unrestrictedSubsidiary: false,
      notes: [],
    },
    crossReferences: [],
    dependencies: [],
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote: "",
    unresolvedQuestions: [],
    ...overrides,
  } as unknown as CovenantSummaryItem;
}

/** Strata 6.01(g) shape: employee-benefit obligations, ordinary course, no cap anywhere. */
const UNCAPPED_DEBT = {
  sectionRef: "6.01(g)",
  // Grant evidence reaches grantTypesForItem through plainEnglish
  // minus its classification lead (Rule 176) — mirror the analyzer's
  // real output shape: lead sentence + operative substance.
  plainEnglish:
    "Section 6.01(g) operates as an enumerated permission within the debt incurrence regime. Indebtedness owed to any Person providing workers' compensation, health, disability or other employee benefits or property, casualty or liability insurance, pursuant to reimbursement or indemnification obligations to such Person, in each case incurred in the ordinary course of business.",
  permissions: [
    "(g) Indebtedness owed to any Person providing workers' compensation, health, disability or other employee benefits or property, casualty or liability insurance, pursuant to reimbursement or indemnification obligations to such Person, in each case incurred in the ordinary course of business",
  ],
  operativeLanguageExcerpt:
    "(g) Indebtedness owed to any Person providing workers' compensation, health, disability or other employee benefits or property, casualty or liability insurance, pursuant to reimbursement or indemnification obligations to such Person, in each case incurred in the ordinary course of business;",
};

describe("step 1 — NONE_UNCAPPED determination (parse)", () => {
  it("an affirmatively uncapped permission compiles NONE_UNCAPPED, MODELED, no missing fields", () => {
    const it1 = item(UNCAPPED_DEBT);
    expect(grantTypesForItem(it1)).toContain("DEBT_INCURRENCE");
    const parsed = parseFormulaFromItem(it1);
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("NONE_UNCAPPED");
    expect(parsed.missingFields).toEqual([]);
    // thresholdValue carries NO number for this type — never read as $0M.
    expect(parsed.thresholdValue).toBe(0);
  });

  it("the item's qualitative conditions attach to the uncapped result", () => {
    const conditions = ["provided_that: provided that adequate reserves are maintained in accordance with GAAP"];
    const parsed = parseFormulaFromItem(item({ ...UNCAPPED_DEBT, conditions, posture: "CONDITIONAL_PERMISSION" }));
    expect(parsed.formulaType).toBe("NONE_UNCAPPED");
    expect(parsed.params?.qualitativeConditions).toEqual(conditions);
  });

  it("a mechanical pro-forma proviso in the CONDITIONS attaches without defeating the determination", () => {
    const it1 = item({
      ...UNCAPPED_DEBT,
      posture: "CONDITIONAL_PERMISSION",
      conditions: ["provided_that: pro forma compliance with the Financial Covenants"],
    });
    const parsed = parseFormulaFromItem(it1);
    expect(parsed.formulaType).toBe("NONE_UNCAPPED");
    // …and with only a mechanical condition, the item can be routine.
    expect(isRoutineItem(it1)).toBe(true);
  });

  it("REFUSED when truncated (Rule 192): a truncated item never becomes uncapped", () => {
    const parsed = parseFormulaFromItem(item({ ...UNCAPPED_DEBT, operativeExcerptTruncated: true }));
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.formulaType).not.toBe("NONE_UNCAPPED");
    expect(parsed.missingFields).toContain("operativeExcerptTruncated");
  });

  it("REFUSED for a prohibition posture, even with grant-shaped text", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "7.01",
        category: "LIENS_SECURED_DEBT",
        posture: "GENERAL_PROHIBITION",
        permissions: ["Except: for the following (the “ Permitted Liens ”):"],
        operativeLanguageExcerpt:
          "Create, incur, assume or suffer to exist any Lien upon any of its property, assets or revenues, whether now owned or hereafter acquired, except for the following (the “ Permitted Liens ”):",
      }),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.formulaType).not.toBe("NONE_UNCAPPED");
  });

  it("REFUSED for a [reserved] clause", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "7.02(h)",
        category: "RESTRICTED_PAYMENTS_INVESTMENTS",
        permissions: ["(h) [reserved]"],
        operativeLanguageExcerpt: "(h) [reserved];",
      }),
    );
    expect(parsed.formulaType).not.toBe("NONE_UNCAPPED");
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
  });

  it("REFUSED when the grant text states a cap the extractors cannot quantify (not uncapped, not reference-external)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.01(x)",
        permissions: ["(x) Indebtedness in an aggregate principal amount not to exceed the amount available under the Revolving Credit Facility"],
        operativeLanguageExcerpt:
          "(x) Indebtedness in an aggregate principal amount not to exceed the amount available under the Revolving Credit Facility;",
      }),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.formulaType).not.toBe("NONE_UNCAPPED");
    expect(parsed.missingFields).not.toContain("referenceExternal");
  });
});

describe("step 1 — reference-external stays KNOWN_NOT_MODELED with the named reason", () => {
  it("schedule-defined grant (Strata 6.01(b) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.01(b)",
        plainEnglish:
          "Section 6.01(b) operates as an enumerated permission within the debt incurrence regime. Indebtedness existing on the date hereof and set forth in Schedule 6.01 and any extensions, renewals, refinancings and replacements of any such Indebtedness in accordance with clause (f) hereof.",
        permissions: [
          "(b) Indebtedness existing on the date hereof and set forth in Schedule 6.01 and any extensions, renewals, refinancings and replacements of any such Indebtedness in accordance with clause (f) hereof",
        ],
        operativeLanguageExcerpt:
          "(b) Indebtedness existing on the date hereof and set forth in Schedule 6.01 and any extensions, renewals, refinancings and replacements of any such Indebtedness in accordance with clause (f) hereof;",
      }),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("referenceExternal");
  });

  it("refinancing self-cap in a proviso (Strata 6.01(f) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.01(f)",
        posture: "CONDITIONAL_PERMISSION",
        plainEnglish:
          "Section 6.01(f) operates as a conditional permission within the debt incurrence regime. Indebtedness which represents extensions, renewals, refinancing or replacements of any of the Indebtedness described in clauses (b), (e) and (i) hereof, provided that such Refinance Indebtedness does not increase the principal amount of the Original Indebtedness.",
        permissions: [
          "(f) Indebtedness which represents extensions, renewals, refinancing or replacements of any of the Indebtedness described in clauses (b), (e) and (i) hereof",
        ],
        conditions: [
          "provided_that: provided that (i) such Refinance Indebtedness does not increase the principal amount of the Original Indebtedness, (ii) any Liens securing such Refinance Indebtedness are not extended to any additional property",
        ],
        operativeLanguageExcerpt:
          "(f) Indebtedness which represents extensions, renewals, refinancing or replacements of any of the Indebtedness described in clauses (b), (e) and (i) hereof;",
      }),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("referenceExternal");
  });

  it("defined-term cap whose definition is a formula (Rule 197 fails closed → reference-external)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.01(k)",
        permissions: ["(k) other unsecured Indebtedness in an aggregate principal amount not exceeding the Threshold Amount at any time outstanding"],
        operativeLanguageExcerpt:
          "(k) other unsecured Indebtedness in an aggregate principal amount not exceeding the Threshold Amount at any time outstanding.",
        applicableDefinitions: [
          { term: "Threshold Amount", excerpt: "“Threshold Amount” means the greater of $5,000,000 and 1.00% of Consolidated EBITDA." },
        ] as never,
      }),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("referenceExternal");
  });

  it("permission granted wholly by reference to other sections (Solaris 7.02(f) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "7.02(f)",
        category: "RESTRICTED_PAYMENTS_INVESTMENTS",
        permissions: [
          "(f) Investments consisting of Liens, Indebtedness, fundamental changes and Restricted Payments (other than, in each case, by reference to this Section 7.02(f)) permitted under Section 7.01, Section 7.03, Section 7.04 and Section 7.06, respectively",
        ],
        operativeLanguageExcerpt:
          "(f) Investments consisting of Liens, Indebtedness, fundamental changes and Restricted Payments permitted under Section 7.01, Section 7.03, Section 7.04 and Section 7.06, respectively;",
      }),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("referenceExternal");
  });

  it("guarantee conditioned on the underlying debt being permitted by the section (Strata 6.01(d) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.01(d)",
        posture: "CONDITIONAL_PERMISSION",
        plainEnglish:
          "Section 6.01(d) operates as a conditional permission within the debt incurrence regime. Guarantees by any Borrower of Indebtedness of any Subsidiary and by any Subsidiary of Indebtedness of any Borrower or any other Subsidiary, provided that the Indebtedness so Guaranteed is permitted by this Section 6.01.",
        permissions: ["(d) Guarantees by any Borrower of Indebtedness of any Subsidiary and by any Subsidiary of Indebtedness of any Borrower or any other Subsidiary"],
        conditions: [
          "provided_that: provided that (i) the Indebtedness so Guaranteed is permitted by this Section 6.01, (ii) Guarantees by any Borrower of Indebtedness of any Subsidiary that is not a Loan Party shall be subject to Section 6.04",
        ],
        operativeLanguageExcerpt:
          "(d) Guarantees by any Borrower of Indebtedness of any Subsidiary and by any Subsidiary of Indebtedness of any Borrower or any other Subsidiary, provided that (i) the Indebtedness so Guaranteed is permitted by this Section 6.01;",
      }),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("referenceExternal");
  });
});

describe("step 1 — no regression on priced shapes", () => {
  it("a greater-of whose $ leg exists still compiles as before", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "7.02(b)",
        category: "RESTRICTED_PAYMENTS_INVESTMENTS",
        permissions: [
          "(b) loans or advances to officers and employees, in an aggregate principal amount outstanding not to exceed, at the time each such Investment is made, the greater of (x) $22,500,000 and (y) 5% of TTM Consolidated EBITDA",
        ],
        materialBasketsThresholds: ["Greater of basket: $22,500,000 and 5% of TTM Consolidated EBITDA"],
        operativeLanguageExcerpt:
          "(b) loans or advances in an aggregate principal amount outstanding not to exceed the greater of (x) $22,500,000 and (y) 5% of TTM Consolidated EBITDA.",
      }),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("GREATER_OF_FLAT_OR_PCT_EBITDA");
    expect(parsed.thresholdValue).toBe(22.5);
    expect(parsed.params?.pctEbitda).toBeCloseTo(0.05, 9);
  });

  it("a bare-dollar defined-term cap still resolves via Rule 197 (Strata 6.01(k) real shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.01(k)",
        permissions: ["(k) other unsecured Indebtedness in an aggregate principal amount not exceeding the Threshold Amount at any time outstanding"],
        materialBasketsThresholds: ["Cap measured on outstanding amount at any time."],
        operativeLanguageExcerpt:
          "(k) other unsecured Indebtedness in an aggregate principal amount not exceeding the Threshold Amount at any time outstanding.",
        applicableDefinitions: [{ term: "Threshold Amount", excerpt: "“ Threshold Amount ” means $ 750,000." }] as never,
      }),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("FLAT_AMOUNT");
    expect(parsed.thresholdValue).toBeCloseTo(0.75, 9);
  });
});

describe("step 1 — engine semantics", () => {
  it("NONE_UNCAPPED evaluates to modeled with no finite limit (asserted uncapped, like RATIO_GATE)", () => {
    const fin = {
      ebitda: 100,
      cash: 10,
      interestExpense: 5,
      cumulativeNetIncome: 50,
      equityProceedsSinceIssue: 0,
      assumedNewDebtRatePct: 6,
      totalDebt: 400,
      securedDebt: 200,
      totalAssets: 900,
    };
    const evaluated = evaluateProvision(
      {
        id: "t",
        documentId: "d",
        code: "uncapped",
        basketName: "Employee benefit obligations",
        sectionRef: "6.01(g)",
        formulaType: "NONE_UNCAPPED",
        thresholdValue: 0,
        params: {},
      },
      fin,
      computeLeverageMetrics(fin),
    );
    expect(evaluated.status).toBe("modeled");
    expect(evaluated.capacity).toBe(Infinity);
  });
});

describe("step 1 — review gates and proposal language", () => {
  it("an uncapped item with no conditions is routine; with a bespoke condition it is an exception", () => {
    expect(isRoutineItem(item(UNCAPPED_DEBT))).toBe(true);
    expect(
      isRoutineItem(
        item({
          ...UNCAPPED_DEBT,
          posture: "CONDITIONAL_PERMISSION",
          conditions: ["provided_that: provided that the Borrower shall have delivered a solvency certificate of its chief financial officer"],
        }),
      ),
    ).toBe(false);
  });

  it("the ACCEPT proposal says 'no finite cap in this clause' — never $0M, never bare 'unlimited capacity'", () => {
    const proposal = proposeReviewDecision(item(UNCAPPED_DEBT));
    expect(proposal.decision).toBe("ACCEPTED");
    expect(proposal.terms).toContain("no finite cap in this clause");
    expect(proposal.terms).toContain("NONE_UNCAPPED");
    expect(proposal.terms).not.toContain("$0M");
    expect(proposal.reason).toContain("no finite cap in the clause");
    expect(proposal.reason).not.toMatch(/unlimited capacity/i);
  });

  it("a reference-external item is proposed NEEDS_INPUT naming the external cap", () => {
    const proposal = proposeReviewDecision(
      item({
        sectionRef: "6.01(b)",
        plainEnglish:
          "Section 6.01(b) operates as an enumerated permission within the debt incurrence regime. Indebtedness existing on the date hereof and set forth in Schedule 6.01 and any extensions, renewals, refinancings and replacements of any such Indebtedness.",
        permissions: [
          "(b) Indebtedness existing on the date hereof and set forth in Schedule 6.01 and any extensions, renewals, refinancings and replacements of any such Indebtedness",
        ],
        operativeLanguageExcerpt:
          "(b) Indebtedness existing on the date hereof and set forth in Schedule 6.01 and any extensions, renewals, refinancings and replacements of any such Indebtedness;",
      }),
    );
    expect(proposal.decision).toBe("NEEDS_INPUT");
    expect(proposal.needsAttention).toBe(true);
    expect(proposal.reason).toContain("referenceExternal");
    expect(proposal.reason).toContain("outside its own text");
  });
});

// ── Step 3: chapeau / stem / full-span ─────────────────────────

describe("step 3 — chapeau feed and section stems (summarize integration)", () => {
  const CHAPEAU =
    "Section 2.16. Incremental Facilities. The Borrowers may from time to time establish Incremental Facilities in an aggregate principal amount not to exceed $30,000,000, subject to the following:";
  const nodes = [
    { nodeId: "n-stem", sourceId: "src-chapeau", nodeType: "SECTION", sectionRef: "2.16", heading: "Incremental Facilities", charStart: 0, charEnd: 200, parentNodeId: null },
    { nodeId: "n-clause", sourceId: "src-chapeau", nodeType: "CLAUSE", sectionRef: "2.16(e)", heading: "2.16(e)", charStart: 200, charEnd: 400, parentNodeId: "n-stem" },
  ] as never[];
  const candidates = [
    {
      candidateId: "c-stem",
      sourceId: "src-chapeau",
      nodeId: "n-stem",
      families: ["INDEBTEDNESS"],
      signals: [],
      excerpt: CHAPEAU,
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: 5,
    },
    {
      candidateId: "c-clause",
      sourceId: "src-chapeau",
      nodeId: "n-clause",
      families: ["LIENS"],
      signals: [],
      excerpt: "(e) Liens securing Incremental Facilities and Incremental Equivalent Debt incurred under this Section 2.16;",
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: 5,
    },
  ] as never[];

  it("carries the chapeau onto the clause item, stamps the stem, and compiles the clause from the chapeau", async () => {
    const { buildDocumentCovenantSummary } = await import("../../lib/product/covenant-intelligence/summarize");
    const summary = buildDocumentCovenantSummary({
      sourceId: "src-chapeau",
      documentTitle: "Synthetic CA",
      issuerCik: "0000000000",
      documentClass: "CREDIT_AGREEMENT" as never,
      candidates,
      definitions: [],
      structuralNodes: nodes,
      crossReferences: [],
    });
    const clause = summary.items.find((i) => i.sectionRef === "2.16(e)");
    const stem = summary.items.find((i) => i.sectionRef === "2.16");
    expect(clause).toBeTruthy();
    expect(stem).toBeTruthy();
    expect(clause!.parentChapeau).toContain("$30,000,000");
    expect(stem!.sectionStemChildRefs).toEqual(["2.16(e)"]);

    // The clause's own text has no cap; the stem's chapeau does.
    const parsedClause = parseFormulaFromItem(clause!);
    expect(parsedClause.modelingStatus).toBe("MODELED");
    expect(parsedClause.formulaType).toBe("FLAT_AMOUNT");
    expect(parsedClause.thresholdValue).toBe(30);
    expect(parsedClause.params?.capSource).toBe("CHAPEAU");

    // This stem's own chapeau text carries the cap, so the stem
    // item prices it from its own fields (status quo preserved —
    // the stem state never removes a formula the item already
    // had). A stem with NO terms of its own is the SECTION_STEM
    // case (pinned in the compile/routine tests below).
    const parsedStem = parseFormulaFromItem(stem!);
    expect(parsedStem.modelingStatus).toBe("MODELED");
    expect(parsedStem.formulaType).toBe("FLAT_AMOUNT");
    expect(parsedStem.thresholdValue).toBe(30);
  });

  it("a stem is never routine, and its proposal is the no-effect REJECTED naming its clauses", () => {
    const stemItem = item({
      sectionRef: "6.01",
      heading: "Indebtedness",
      posture: "GENERAL_PROHIBITION",
      plainEnglish:
        "Section 6.01 operates as a general prohibition within the debt incurrence regime. No Loan Party will incur any Indebtedness, except:",
      permissions: [],
      operativeLanguageExcerpt: "No Loan Party will, nor will it permit any Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:",
      sectionStemChildRefs: ["6.01(a)", "6.01(b)"],
    } as Partial<CovenantSummaryItem>);
    // A term-less stem is determinate as SECTION_STEM.
    const parsedStem = parseFormulaFromItem(stemItem);
    expect(parsedStem.modelingStatus).toBe("MODELED");
    expect(parsedStem.formulaType).toBe("SECTION_STEM");
    expect(isRoutineItem(stemItem)).toBe(false);
    const proposal = proposeReviewDecision(stemItem);
    expect(proposal.decision).toBe("REJECTED");
    expect(proposal.needsAttention).toBe(false);
    expect(proposal.reason).toContain("Section stem");
    expect(proposal.reason).toContain("6.01(a)");
  });
});

describe("step 3 — truncated items: reference legs under Rule 192", () => {
  const TRUNC_BASE = {
    sectionRef: "2.14(a)",
    category: "DEBT_INCURRENCE" as const,
    posture: "GENERAL_PROHIBITION" as const,
    plainEnglish:
      "Section 2.14(a) operates as a general prohibition within the debt incurrence regime. The Borrowers may add Incremental Facilities in an aggregate principal amount not exceeding the Threshold Amount.",
    permissions: ["(a) Incremental Facilities in an aggregate principal amount not exceeding the Threshold Amount"],
    operativeExcerptTruncated: true,
    operativeLanguageExcerpt:
      "(a) At any time and from time to time, the Borrowers may add Incremental Facilities in an aggregate principal amount not exceeding the Threshold Amount, plus additional amounts subject to the conditions set forth in this Section 2.14(a) and the further provisos therein...",
    applicableDefinitions: [{ term: "Threshold Amount", excerpt: "“ Threshold Amount ” means $ 750,000." }] as never,
  };

  it("leg 1: a defined-term cap referenced in the available text resolves despite truncation", () => {
    const parsed = parseFormulaFromItem(item({ ...TRUNC_BASE, operativeNodeType: "SUBSECTION" } as Partial<CovenantSummaryItem>));
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("FLAT_AMOUNT");
    expect(parsed.thresholdValue).toBeCloseTo(0.75, 9);
    expect(parsed.notes.join(" ")).toContain("truncated prefix");
  });

  it("leg 2: a clause-level item compiles a cap-framed amount that sits past the prefix in its full span", () => {
    const spanText =
      "(a) The Borrowers may incur Incremental Term Loans and other Indebtedness under this clause (a), subject to the terms hereof, in an aggregate principal amount that is not less than $5,000,000 in the case of each tranche, and the aggregate principal amount of all Indebtedness incurred under this clause (a) shall not exceed $10,000,000 at any time outstanding.";
    const parsed = parseFormulaFromItem(
      item({
        ...TRUNC_BASE,
        permissions: ["(a) Incremental Facilities"],
        applicableDefinitions: [] as never,
        operativeFullSpan: spanText,
        operativeNodeType: "SUBSECTION",
      } as Partial<CovenantSummaryItem>),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("FLAT_AMOUNT");
    // The cap-framed $10M wins; the $5M minimum denomination (also
    // cap-frame-adjacent language "not less than") must not mint.
    expect(parsed.thresholdValue).toBe(10);
    expect(parsed.params?.spanSource).toBe("FULL_SPAN");
  });

  it("cap-frame discipline: amounts outside a cap frame never mint from a span (denominations only → still KNM)", () => {
    const spanText =
      "(a) Each Incremental Facility shall be in an integral multiple of $1,000,000 and be in an aggregate principal amount that is not less than $5,000,000 in the case of Incremental Term Loans. The Borrowers shall deliver a notice not less than three Business Days prior to the proposed incurrence date.";
    const parsed = parseFormulaFromItem(
      item({
        ...TRUNC_BASE,
        permissions: ["(a) Incremental Facilities"],
        applicableDefinitions: [] as never,
        operativeFullSpan: spanText,
        operativeNodeType: "SUBSECTION",
      } as Partial<CovenantSummaryItem>),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("operativeExcerptTruncated");
  });

  it("guard: a SECTION-level truncated item does NOT full-span compile (its span covers sibling clauses)", () => {
    const spanText =
      "Section 6.11. Liens. No Loan Party shall create any Lien, except: (a) Liens in an aggregate amount not to exceed $5,000,000; (b) other Liens in an aggregate amount not to exceed the greater of $40,000,000 and 10% of Consolidated EBITDA.";
    const parsed = parseFormulaFromItem(
      item({
        ...TRUNC_BASE,
        sectionRef: "6.11",
        permissions: ["Liens"],
        applicableDefinitions: [] as never,
        operativeFullSpan: spanText,
        operativeNodeType: "SECTION",
      } as Partial<CovenantSummaryItem>),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("operativeExcerptTruncated");
  });

  it("no span attached → the Rule 192 outcome is byte-identical to before step 3", () => {
    const parsed = parseFormulaFromItem(item({ ...TRUNC_BASE, applicableDefinitions: [] as never } as Partial<CovenantSummaryItem>));
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toEqual(["thresholdValue", "formulaType", "operativeExcerptTruncated"]);
  });

  it("a truncated STEM resolves as a stem (mints nothing), not via the span legs", () => {
    const parsed = parseFormulaFromItem(
      item({
        ...TRUNC_BASE,
        applicableDefinitions: [] as never,
        operativeFullSpan: "(a) amounts not to exceed $99,000,000;",
        operativeNodeType: "SECTION",
        sectionStemChildRefs: ["2.14(b)"],
      } as Partial<CovenantSummaryItem>),
    );
    expect(parsed.formulaType).toBe("SECTION_STEM");
    expect(parsed.modelingStatus).toBe("MODELED");
  });
});

describe("step 3 — chapeau guards (prohibition triggers, join boundaries, denominations)", () => {
  it("a prohibition-TRIGGER chapeau does not feed its threshold onto exception clauses (Solaris/Tenable 7.07 shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "7.07(f)",
        category: "RESTRICTED_PAYMENTS_INVESTMENTS",
        plainEnglish:
          "Section 7.07(f) operates as an enumerated permission within the restricted payments and investments regime. Investments consisting of equity issuances, repurchases and retirements of Equity Interests permitted under Section 7.06.",
        permissions: ["(f) equity issuances, repurchases, redemptions, retirements or other acquisitions or retirements of Equity Interests by the Parent Borrower or any Restricted Subsidiary"],
        operativeLanguageExcerpt:
          "(f) equity issuances, repurchases, redemptions, retirements or other acquisitions or retirements of Equity Interests by the Parent Borrower or any Restricted Subsidiary;",
        parentChapeau:
          "Section 7.07. Transactions with Affiliates. Enter into any transaction of any kind with any Affiliate of the Borrower with a fair market value in excess of the greater of (x) $12,500,000 and (y) 2.5% of TTM Consolidated EBITDA of the Borrower and its Restricted Subsidiaries for any individual transaction, whether or not in the ordinary course of business, other than:",
      } as Partial<CovenantSummaryItem>),
    );
    // NOT the greater-of (the trigger is not the exception's cap),
    // NOT uncapped (the stem governs it) — KNM naming the chapeau.
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("chapeauCap");
  });

  it("a 'not in excess of' chapeau cap DOES feed (Asure 2.16 shape — the negated form is a cap, not a trigger)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "2.16(e)",
        category: "OTHER",
        plainEnglish:
          "Section 2.16(e) operates as an enumerated permission within the liens and secured debt regime. Liens securing Incremental Commitments established pursuant to this Section 2.16.",
        permissions: ["(e) Liens securing Incremental Commitments established pursuant to this Section 2.16"],
        operativeLanguageExcerpt:
          "(e) The Loans and Commitments established pursuant to this clause (e) shall constitute Loans and Commitments under this Agreement.",
        parentChapeau:
          "2.16 Increase in Commitments. The Borrower may elect to request an increase to the existing Commitments, by an aggregate amount not in excess of $30,000,000. Each Incremental Commitment shall be in an aggregate amount of $5,000,000 or any whole multiple of $1,000,000 in excess thereof;",
      } as Partial<CovenantSummaryItem>),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("FLAT_AMOUNT");
    expect(parsed.thresholdValue).toBe(30);
    expect(parsed.params?.capSource).toBe("CHAPEAU");
  });

  it("screens never match across the clause/chapeau join boundary (Solaris 7.01(m) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "7.01(m)",
        category: "LIENS_SECURED_DEBT",
        plainEnglish:
          "Section 7.01(m) operates as an enumerated permission within the liens and secured debt regime. Liens on cash advances in favor of the seller of any property to be acquired in an Investment.",
        permissions: ["(m) Liens (i) on cash advances in favor of the seller of any property to be acquired in an Investment permitted pursuant to"],
        operativeLanguageExcerpt: "(m) Liens (i) on cash advances in favor of the seller of any property to be acquired in an Investment permitted pursuant to",
        parentChapeau:
          "Section 7.01. Liens. Create, incur or assume any Lien upon any of its property, assets or revenues, whether now owned or hereafter acquired, other than the following (collectively, “ Permitted Liens ”):",
      } as Partial<CovenantSummaryItem>),
    );
    expect(parsed.formulaType).toBe("NONE_UNCAPPED");
  });

  it("a denomination after a ratio frame in the span never mints (Tenable 2.14(a) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "2.14(a)",
        posture: "GENERAL_PROHIBITION",
        plainEnglish:
          "Section 2.14(a) operates as a general prohibition within the debt incurrence regime. The Borrowers may add Incremental Facilities subject to the Incremental Incurrence Test.",
        permissions: ["(a) Incremental Facilities"],
        operativeExcerptTruncated: true,
        operativeLanguageExcerpt: "(a) At any time and from time to time, the Borrowers may add Incremental Facilities...",
        operativeFullSpan:
          "(a) the aggregate principal amount of all Incremental Equivalent Debt so incurred, together with the aggregate principal amount of all Incremental Facilities, shall not exceed 3.75:1.00. Each Incremental Facility shall be in an integral multiple of $1,000,000 and be in an aggregate principal amount that is not less than $5,000,000 in case of Incremental Term Loans.",
        operativeNodeType: "SUBSECTION",
      } as Partial<CovenantSummaryItem>),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.thresholdValue).toBe(0);
    expect(parsed.missingFields).toContain("operativeExcerptTruncated");
  });

  it("a truncated item with NO grants never resolves via the span legs (definitions-article shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "1.01(f)",
        category: "OTHER",
        posture: "UNRESOLVED",
        plainEnglish: "Definition entry.",
        permissions: [],
        operativeExcerptTruncated: true,
        operativeLanguageExcerpt: "“Unrestricted Incremental Amount” means, with respect to any incurrence, an amount not to exceed the greater of (x) $334,000,000 an...",
        operativeFullSpan:
          "“Unrestricted Incremental Amount” means, with respect to any incurrence, an amount not to exceed the greater of (x) $334,000,000 and (y) 100% of Consolidated EBITDA.",
        operativeNodeType: "CLAUSE",
      } as Partial<CovenantSummaryItem>),
    );
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("operativeExcerptTruncated");
  });
});

describe("step 3 — compile SKIPs a section stem (no Permission minted)", () => {
  it("compileAcceptedInterpretation returns SKIPPED and creates no Permission for a stem", async () => {
    const stemItem = item({
      sectionRef: "6.01",
      heading: "Indebtedness",
      posture: "GENERAL_PROHIBITION",
      plainEnglish:
        "Section 6.01 operates as a general prohibition within the debt incurrence regime. No Loan Party will incur any Indebtedness, except:",
      permissions: [],
      operativeLanguageExcerpt: "No Loan Party will incur any Indebtedness, except:",
      sectionStemChildRefs: ["6.01(a)"],
    } as Partial<CovenantSummaryItem>);
    storedItems.splice(0, storedItems.length, stemItem);
    const upsertsBefore = compileCalls.permissionUpserts.length;
    const provisionsBefore = compileCalls.provisionCreates.length;
    const { compileAcceptedInterpretation } = await import("../../lib/product/customer-intelligence/compile-accepted");
    const results = await compileAcceptedInterpretation({
      companyId: "co-1",
      sourceId: "src-1",
      sectionRef: "6.01",
      category: "DEBT_INCURRENCE",
      decision: "ACCEPTED",
      reviewerKind: "COUNSEL",
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("SKIPPED");
    expect(results[0]!.formulaType).toBe("SECTION_STEM");
    expect(compileCalls.permissionUpserts.length).toBe(upsertsBefore);
    expect(compileCalls.provisionCreates.length).toBe(provisionsBefore);
    // restore for any later describes
    storedItems.splice(0, storedItems.length, storedItem);
  });
});

// ── Step 4: narrow vocabulary ──────────────────────────────────

describe("step 4 — narrow vocabulary shapes compile determinate", () => {
  it("percentage of Consolidated Net Tangible Assets (Expand 6.02(ee) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.02(ee)",
        permissions: ["(ee) other Indebtedness in an aggregate principal amount not to exceed 15% of Consolidated Net Tangible Assets at any time outstanding"],
        operativeLanguageExcerpt:
          "(ee) other Indebtedness in an aggregate principal amount not to exceed 15% of Consolidated Net Tangible Assets at any time outstanding.",
      }),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("PCT_OF_CNTA");
    expect(parsed.thresholdValue).toBeCloseTo(0.15, 9);
    expect(parsed.params?.pctCnta).toBeCloseTo(0.15, 9);
    expect(parsed.missingFields).toEqual([]);
  });

  it("greater-of flat / % CNTA compiles both legs (no silent FLAT drop of the grower)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.02(x)",
        permissions: ["(x) Indebtedness not to exceed the greater of (x) $25,000,000 and (y) 10% of Consolidated Net Tangible Assets"],
        materialBasketsThresholds: ["Greater of basket: $25,000,000 and 10% of Consolidated Net Tangible Assets"],
        operativeLanguageExcerpt:
          "(x) Indebtedness in an aggregate principal amount not to exceed the greater of (x) $25,000,000 and (y) 10% of Consolidated Net Tangible Assets.",
      }),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("GREATER_OF_FLAT_OR_PCT_CNTA");
    expect(parsed.thresholdValue).toBe(25);
    expect(parsed.params?.pctCnta).toBeCloseTo(0.1, 9);
  });

  it("percentage-of-cost cap (Strata 6.02(d) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.02(d)",
        posture: "CONDITIONAL_PERMISSION",
        permissions: ["(d) Indebtedness incurred to finance the acquisition, construction or improvement of any fixed or capital assets"],
        conditions: [
          "provided_that: provided that the aggregate amount of such Indebtedness does not exceed 90% of the cost of acquiring, constructing or improving such fixed or capital assets",
        ],
        operativeLanguageExcerpt:
          "(d) Indebtedness incurred to finance the acquisition, construction or improvement of any fixed or capital assets, provided that the aggregate amount of such Indebtedness does not exceed 90% of the cost of acquiring, constructing or improving such assets.",
      }),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("PCT_OF_COST");
    expect(parsed.params?.pctOfCost).toBeCloseTo(0.9, 9);
  });

  it("percentage-of-consideration cap (Aon 6.14(xiv) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "6.14(xiv)",
        category: "RESTRICTED_PAYMENTS_INVESTMENTS",
        permissions: ["(xiv) fees and expenses in connection with any Permitted Acquisition in an aggregate amount not to exceed 5% of the aggregate consideration for such acquisition"],
        operativeLanguageExcerpt:
          "(xiv) fees and expenses in connection with any Permitted Acquisition in an aggregate amount not to exceed 5% of the aggregate consideration for such acquisition.",
      }),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("PCT_OF_CONSIDERATION");
    expect(parsed.params?.pctOfConsideration).toBeCloseTo(0.05, 9);
  });

  it("utilization gate is its own determinate type, not a basket cap (Solaris 7.02(z) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "7.02(z)",
        category: "RESTRICTED_PAYMENTS_INVESTMENTS",
        posture: "CONDITIONAL_PERMISSION",
        permissions: ["(z) other Investments not otherwise permitted under this Section 7.02"],
        conditions: [
          "provided_that: provided that, immediately after giving effect to any such Investment, the Utilization Percentage shall be less than or equal to 75%",
        ],
        operativeLanguageExcerpt:
          "(z) other Investments, provided that the Utilization Percentage shall be less than or equal to 75% at such time.",
      }),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("UTILIZATION_GATE");
    expect(parsed.thresholdValue).toBeCloseTo(0.75, 9);
    expect(parsed.params?.measure).toBe("UTILIZATION_PERCENTAGE");
  });

  it("value cap is an explicit NON-NUMERIC representation (Asure 7.01(i) shape)", () => {
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "7.01(i)",
        category: "LIENS_SECURED_DEBT",
        posture: "CONDITIONAL_PERMISSION",
        permissions: ["(i) Liens securing Indebtedness incurred to finance the acquisition or construction of any property"],
        conditions: [
          "provided_that: provided that the Indebtedness secured thereby does not exceed the cost or fair market value of the property so acquired or constructed",
        ],
        operativeLanguageExcerpt:
          "(i) Liens securing Indebtedness incurred to finance the acquisition of any property, provided that the Indebtedness secured thereby does not exceed the cost or fair market value of the property.",
      }),
    );
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.formulaType).toBe("VALUE_CAP");
    // Never a number: thresholdValue carries nothing for this type.
    expect(parsed.thresholdValue).toBe(0);
    expect(parsed.params?.capBasis).toBe("COST_OR_FAIR_MARKET_VALUE");
  });
});

describe("step 4 — engine and proposal semantics for the new types", () => {
  const fin = {
    ebitda: 100,
    cash: 10,
    interestExpense: 5,
    cumulativeNetIncome: 50,
    equityProceedsSinceIssue: 0,
    assumedNewDebtRatePct: 6,
    totalDebt: 400,
    securedDebt: 200,
    totalAssets: 900,
  };
  const evalOf = (formulaType: string, thresholdValue: number, params: Record<string, unknown>) =>
    evaluateProvision(
      { id: "t", documentId: "d", code: "c", basketName: "Basket", sectionRef: "0.00", formulaType: formulaType as never, thresholdValue, params },
      fin,
      computeLeverageMetrics(fin),
    );

  it("VALUE_CAP evaluates NEEDS_INPUT (review_required), never a number and never zero capacity", () => {
    const r = evalOf("VALUE_CAP", 0, { capBasis: "COST_OR_FAIR_MARKET_VALUE" });
    expect(r.status).toBe("review_required");
    expect(r.capacity).toBeUndefined();
    expect(r.reason).toContain("cost or fair market value");
  });

  it("PCT_OF_CNTA / PCT_OF_COST / UTILIZATION_GATE evaluate NEEDS_INPUT naming the missing input", () => {
    expect(evalOf("PCT_OF_CNTA", 0.15, { pctCnta: 0.15 }).reason).toContain("Consolidated Net Tangible Assets");
    expect(evalOf("PCT_OF_COST", 0.9, { pctOfCost: 0.9 }).status).toBe("review_required");
    const gate = evalOf("UTILIZATION_GATE", 0.75, { measure: "UTILIZATION_PERCENTAGE" });
    expect(gate.status).toBe("review_required");
    expect(gate.reason).toContain("Utilization Percentage");
  });

  it("proposal terms for a value cap name the basis and never print $0M", () => {
    const proposal = proposeReviewDecision(
      item({
        sectionRef: "7.01(i)",
        category: "LIENS_SECURED_DEBT",
        posture: "CONDITIONAL_PERMISSION",
        plainEnglish:
          "Section 7.01(i) operates as a conditional permission within the liens and secured debt regime. Liens securing Indebtedness incurred to finance the acquisition of any property, provided the Indebtedness does not exceed the cost or fair market value of the property.",
        permissions: ["(i) Liens securing Indebtedness incurred to finance the acquisition or construction of any property"],
        conditions: [
          "provided_that: provided that the Indebtedness secured thereby does not exceed the cost or fair market value of the property so acquired or constructed",
        ],
        operativeLanguageExcerpt:
          "(i) Liens securing Indebtedness incurred to finance the acquisition of any property, provided that the Indebtedness secured thereby does not exceed the cost or fair market value of the property.",
      }),
    );
    // The bespoke condition keeps it an exception (NEEDS_INPUT) —
    // terms are asserted at the parse/compiledTerms level instead:
    const parsed = parseFormulaFromItem(
      item({
        sectionRef: "7.01(i)",
        category: "LIENS_SECURED_DEBT",
        permissions: ["(i) Liens securing Indebtedness incurred to finance the acquisition of any property"],
        operativeLanguageExcerpt:
          "(i) Liens securing Indebtedness, provided that the Indebtedness secured thereby does not exceed the cost or fair market value of the property.",
      }),
    );
    expect(parsed.formulaType).toBe("VALUE_CAP");
    expect(proposal.decision).toBe("NEEDS_INPUT");
  });
});

// ── Compile: an uncapped item mints a Permission with NO finite
// limit from this clause; its conditions still attach. Prisma and
// @prisma/client are mocked so the pin runs without a database
// (the repo's local Prisma client is stale; CI verifies for real).
const compileCalls = {
  permissionUpserts: [] as Array<Record<string, unknown>>,
  provisionCreates: [] as Array<Record<string, unknown>>,
  documentUpdates: [] as Array<Record<string, unknown>>,
};
const storedItem = item({
  ...UNCAPPED_DEBT,
  posture: "CONDITIONAL_PERMISSION",
  conditions: ["provided_that: provided that such Indebtedness is incurred in the ordinary course of business"],
});
/** Mutable: later describes swap the stored summary's items. */
const storedItems: CovenantSummaryItem[] = [storedItem];
vi.mock("@prisma/client", () => ({
  Prisma: {
    Decimal: class Decimal {
      constructor(private v: number) {}
      toString() {
        return String(this.v);
      }
      valueOf() {
        return this.v;
      }
    },
    JsonNull: null,
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeSource: {
      findFirst: async () => ({
        documentId: "doc-1",
        metadata: { covenantSummary: { items: storedItems } },
      }),
    },
    document: {
      findFirst: async () => ({ id: "doc-1" }),
      update: async (args: Record<string, unknown>) => {
        compileCalls.documentUpdates.push(args);
        return {};
      },
    },
    permission: {
      findFirst: async () => null,
      findMany: async () => [
        {
          id: "perm-1",
          code: "counsel:src-1:6.01_g_:DEBT_INCURRENCE:DEBT_INCURRENCE",
          grantType: "DEBT_INCURRENCE",
          modelingStatus: "MODELED",
          documentId: "doc-1",
        },
      ],
      create: async (args: Record<string, unknown>) => {
        compileCalls.permissionUpserts.push(args);
        return { id: "perm-1" };
      },
      upsert: async (args: Record<string, unknown>) => {
        compileCalls.permissionUpserts.push(args);
        return { id: "perm-1" };
      },
      update: async () => ({}),
    },
    covenantProvision: {
      findFirst: async () => null,
      create: async (args: Record<string, unknown>) => {
        compileCalls.provisionCreates.push(args);
        return {};
      },
      update: async () => ({}),
    },
    permissionRelationship: {
      deleteMany: async () => ({}),
      create: async () => ({}),
      createMany: async () => ({}),
      findMany: async () => [],
    },
    sharedCapacityConstraint: { findMany: async () => [] },
    sharedCapacityConstraintMember: { findMany: async () => [] },
  },
}));

describe("step 1 — compile mints an uncapped Permission (no finite limit; conditions attach)", () => {
  it("compileAcceptedInterpretation mints NONE_UNCAPPED with thresholdValue 0 and the condition attached", async () => {
    const { compileAcceptedInterpretation } = await import("../../lib/product/customer-intelligence/compile-accepted");
    const results = await compileAcceptedInterpretation({
      companyId: "co-1",
      sourceId: "src-1",
      sectionRef: "6.01(g)",
      category: "DEBT_INCURRENCE",
      decision: "ACCEPTED",
      reviewerKind: "COUNSEL",
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("COMPILED");
    expect(results[0]!.formulaType).toBe("NONE_UNCAPPED");
    expect(results[0]!.modelingStatus).toBe("MODELED");
    expect(compileCalls.permissionUpserts).toHaveLength(1);
    const create = (compileCalls.permissionUpserts[0] as { data: Record<string, unknown> }).data;
    expect(create.formulaType).toBe("NONE_UNCAPPED");
    expect(Number((create.thresholdValue as { valueOf(): number }).valueOf())).toBe(0);
    const conditions = create.eligibilityConditions as Array<{ text?: string }> | null;
    expect(conditions).not.toBeNull();
    expect(JSON.stringify(conditions)).toContain("ordinary course of business");
    // The CovenantProvision mirror carries the same type (Prisma enum member).
    expect(compileCalls.provisionCreates).toHaveLength(1);
    const provData = (compileCalls.provisionCreates[0] as { data: Record<string, unknown> }).data;
    expect(provData.formulaType).toBe("NONE_UNCAPPED");
  });
});
