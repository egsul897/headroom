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
        metadata: { covenantSummary: { items: [storedItem] } },
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
