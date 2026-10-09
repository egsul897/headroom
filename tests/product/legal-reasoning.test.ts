import { describe, expect, it } from "vitest";
import {
  retrieveTransactionDependencies,
  inferTransactionKind,
  buildTransactionAnalysisScaffold,
  buildPartyIdentity,
  partiesLikelySame,
  normalizePartyName,
  assessStructuralQuality,
  listBenchmarkCases,
  scoreAgainstAdjudicated,
  searchPrecedentClauses,
  listPrecedentClauseQueries,
  LEGAL_BENCHMARK_CASES,
} from "../../lib/product/legal-reasoning";
import { detectPatternsInText, allPatterns } from "../../lib/knowledge-factory/patterns/library";
import { seedDraftingPatterns } from "../../lib/product/covenant-intelligence-loop/patterns";
import { listExercises } from "../../lib/product/covenant-intelligence-loop/exercise-library";
import { challengeLegalConclusions } from "../../lib/product/legal-intelligence/challenge";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(partial: Partial<CovenantSummaryItem> & { sectionRef: string; category: CovenantSummaryItem["category"] }): CovenantSummaryItem & {
  sourceId: string;
  documentTitle: string;
} {
  const base: CovenantSummaryItem = {
    category: partial.category,
    categoryLabel: partial.category,
    heading: partial.heading ?? `Section ${partial.sectionRef}`,
    posture: partial.posture ?? "GENERAL_PROHIBITION",
    plainEnglish: partial.plainEnglish ?? "The Borrower shall not incur Indebtedness except as permitted.",
    restriction: partial.restriction !== undefined ? partial.restriction : "shall not incur Indebtedness",
    permissions: partial.permissions ?? ["except Permitted Indebtedness"],
    coveredEntities: [],
    exceptions: partial.exceptions ?? ["provided that no Default"],
    conditions: partial.conditions ?? ["so long as no Event of Default"],
    materialBasketsThresholds: partial.materialBasketsThresholds ?? ["greater of $50 million and 5% of EBITDA"],
    draftingPatterns: [],
    operativeLanguageExcerpt: partial.operativeLanguageExcerpt ?? "shall not incur Indebtedness except…",
    sourceCitation: `§${partial.sectionRef}`,
    governingAgreement: "Test Credit Agreement",
    families: [],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: {
      borrower: true,
      guarantor: true,
      restrictedSubsidiary: true,
      unrestrictedSubsidiary: false,
      notes: [],
    },
    crossReferences: [],
    dependencies: [],
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote: "",
    unresolvedQuestions: [],
    analysis: {
      sectionRef: partial.sectionRef,
      heading: partial.heading ?? `Section ${partial.sectionRef}`,
      category: partial.category,
      categoryLabel: partial.category,
      families: [],
      posture: partial.posture ?? "GENERAL_PROHIBITION",
      plainEnglish: partial.plainEnglish ?? "",
      restriction: null,
      permissions: [],
      coveredEntities: [],
      entityScopeNotes: [],
      exceptions: [],
      conditions: [],
      basketsAndThresholds: [],
      draftingPatterns: [],
      applicableDefinitions: [],
      crossReferences: [],
      dependencies: [],
      operativeLanguageExcerpt: "",
      sourceCitation: `§${partial.sectionRef}`,
      epistemicStatus: "DISCOVERED_CANDIDATE",
      interpretationNote: "",
      unresolved: [],
    },
    ...partial,
  };
  return { ...base, sourceId: "src-test", documentTitle: "Test Credit Agreement" };
}

describe("legal-reasoning patterns and exercises", () => {
  it("includes new structural patterns and detects them", () => {
    const ids = allPatterns().map((p) => p.patternId);
    expect(ids).toContain("ratio-lien");
    expect(ids).toContain("available-amount-definition");
    expect(ids).toContain("liability-management");
    expect(detectPatternsInText("Available Amount means the sum of…")).toContain("available-amount-definition");
    expect(detectPatternsInText("Permitted Liens subject to Secured Net Leverage Ratio")).toContain("ratio-lien");
    expect(detectPatternsInText("exchange offer for outstanding notes")).toContain("liability-management");
  });

  it("seeds drafting patterns for new pattern ids", () => {
    const seeded = seedDraftingPatterns();
    expect(seeded.some((p) => p.patternId === "subsidiary-designation")).toBe(true);
    expect(seeded.some((p) => p.patternId === "financial-covenant-cure")).toBe(true);
  });

  it("registers LME / designation / cure exercises", () => {
    const ids = listExercises().map((e) => e.exerciseId);
    expect(ids).toContain("lme.debt_exchange");
    expect(ids).toContain("entity.designate_unrestricted");
    expect(ids).toContain("fc.equity_cure");
  });
});

describe("transaction dependency traversal", () => {
  it("infers transaction kinds", () => {
    expect(inferTransactionKind("Can we incur secured debt?")).toBe("SECURED_DEBT");
    expect(inferTransactionKind("open-market purchase of notes")).toBe("LIABILITY_MANAGEMENT");
    expect(inferTransactionKind("designate an Unrestricted Subsidiary")).toBe("SUBSIDIARY_DESIGNATION");
  });

  it("retrieves seed provisions and pattern hits", () => {
    const items = [
      item({
        sectionRef: "7.01",
        category: "DEBT_INCURRENCE",
        plainEnglish: "shall not incur Indebtedness except ratio debt and general basket",
        materialBasketsThresholds: ["Leverage Ratio", "greater of"],
      }),
      item({
        sectionRef: "7.02",
        category: "LIENS_SECURED_DEBT",
        heading: "Liens",
        plainEnglish: "shall not create Liens except Permitted Liens subject to Secured Net Leverage Ratio",
      }),
      item({
        sectionRef: "7.06",
        category: "RESTRICTED_PAYMENTS_INVESTMENTS",
        plainEnglish: "shall not make Restricted Payments except from Available Amount means builder",
      }),
    ];
    const bundle = retrieveTransactionDependencies({
      transactionKind: "SECURED_DEBT",
      items,
    });
    expect(bundle.seedCategories).toContain("DEBT_INCURRENCE");
    expect(bundle.provisions.length).toBeGreaterThan(0);
    expect(bundle.patternHits.length).toBeGreaterThan(0);
    expect(bundle.limitations.some((l) => /not certified/i.test(l))).toBe(true);
  });

  it("builds a 10-step analysis scaffold", () => {
    const items = [
      item({ sectionRef: "7.01", category: "DEBT_INCURRENCE" }),
      item({
        sectionRef: "7.02",
        category: "LIENS_SECURED_DEBT",
        plainEnglish: "Permitted Liens if Secured Net Leverage Ratio ≤ 3.50",
      }),
    ];
    const scaffold = buildTransactionAnalysisScaffold({
      question: "Can we incur $100M secured debt?",
      items,
    });
    expect(scaffold).not.toBeNull();
    expect(scaffold!.steps).toHaveLength(10);
    expect(scaffold!.promotedToLegalTruth).toBe(0);
    expect(scaffold!.steps[0]!.name).toMatch(/restrictions/i);
  });
});

describe("party identity + structural quality", () => {
  it("normalizes party names and matches CIK", () => {
    expect(normalizePartyName("Acme Corp.")).toBe("acme");
    const a = buildPartyIdentity({ issuerName: "Acme Inc.", issuerCik: "123" });
    const b = buildPartyIdentity({ issuerName: "ACME CORPORATION", issuerCik: "0000000123" });
    expect(a.cik).toBe("0000000123");
    expect(partiesLikelySame(a, b)).toBe(true);
  });

  it("assesses provision intelligence coverage", () => {
    const report = assessStructuralQuality([
      {
        sourceId: "s1",
        title: "CA",
        documentClass: "CREDIT_AGREEMENT",
        issuerName: "Acme",
        issuerCik: "1",
        metadata: {
          covenantSummary: {
            schemaVersion: "product.covenant-summary.v2",
            sourceId: "s1",
            governingAgreement: "CA",
            issuerCik: "0000000001",
            documentClass: "CREDIT_AGREEMENT",
            items: [
              item({ sectionRef: "7.01", category: "DEBT_INCURRENCE" }),
              item({
                sectionRef: "9.01",
                category: "OTHER",
                plainEnglish: "ambiguous miscellaneous",
                restriction: null,
                permissions: [],
                posture: "UNRESOLVED",
              }),
            ],
            definedTermsSample: [{ term: "EBITDA", excerpt: "means…" }],
            countsByCategory: {},
            generatedAt: new Date().toISOString(),
            promotedToLegalTruth: 0,
            note: "",
          },
        },
      },
    ]);
    expect(report.documentsWithProvisionIntelligence).toBe(1);
    expect(report.provisionRows).toBe(2);
    expect(report.unknownOrAmbiguousProvisions).toBeGreaterThanOrEqual(1);
    expect(report.definitionResolution.termsSampled).toBeGreaterThan(0);
  });
});

describe("benchmarks + precedent clause search", () => {
  it("catalogs all required case kinds", () => {
    const kinds = new Set(LEGAL_BENCHMARK_CASES.map((c) => c.kind));
    expect(kinds.has("SHARED_CAPACITY")).toBe(true);
    expect(kinds.has("NO_VALID_PATH")).toBe(true);
    expect(kinds.has("MISSING_FINANCIAL_INPUTS")).toBe(true);
    expect(listBenchmarkCases({ adjudicatedOnly: true }).length).toBeGreaterThanOrEqual(2);
  });

  it("scores adjudicated missing-inputs case without inventing capacity", () => {
    const caseDef = LEGAL_BENCHMARK_CASES.find((c) => c.caseId === "bench.missing.financials")!;
    const pass = scoreAgainstAdjudicated({
      caseDef,
      retrievedSectionRefs: [],
      claimedPermissions: [],
      claimedCapacityWithoutInputs: false,
      unsupportedConclusions: [],
    });
    expect(pass.metrics.unsupported_conclusion_rate).toBe(0);

    const fail = scoreAgainstAdjudicated({
      caseDef,
      retrievedSectionRefs: [],
      claimedPermissions: ["$50M remaining"],
      claimedCapacityWithoutInputs: true,
      unsupportedConclusions: ["invented capacity"],
    });
    expect(fail.metrics.unsupported_conclusion_rate).toBe(1);
  });

  it("searches precedent clauses without fabricating frequency stats", () => {
    expect(listPrecedentClauseQueries()).toContain("builder_basket");
    const hits = searchPrecedentClauses({ query: "available_amount", limit: 5 });
    // Index may be present in CI; when present, hits carry authority note.
    for (const h of hits) {
      expect(h.authorityNote).toMatch(/PRECEDENT/);
      expect(h).not.toHaveProperty("marketFrequency");
    }
  });
});

describe("adversarial second-pass categories", () => {
  it("flags unsupported stacking and missed restrictions without auto-correcting", () => {
    const findings = challengeLegalConclusions({
      companyId: "demo",
      conclusions: [
        {
          id: "c1",
          kind: "CAPACITY_EXECUTED",
          statement: "Initial stacked capacity",
          executability: "LEGACY_ENGINE",
          evidenceCitations: ["§7.01"],
          missingInputs: [],
          limitations: [],
          promotedToLegalTruth: 0,
        },
      ],
      context: {
        hasApprovedFinancialSnapshot: true,
        hasUtilizationLedger: false,
        hasVerifiedIrPackage: false,
        outOfPackageAmendments: [],
        unresolvedDefinitionTerms: [],
        entityScopeUnresolved: false,
        claimsStackingWithoutSharedCapAnalysis: true,
        missedRestrictionHints: ["§7.03 junior debt prepayment"],
        overlookedProvisoHints: ["provided that no Default exists"],
      },
    });
    expect(findings.some((f) => f.category === "UNSUPPORTED_STACKING")).toBe(true);
    expect(findings.some((f) => f.category === "MISSED_RESTRICTION")).toBe(true);
    expect(findings.some((f) => f.category === "OVERLOOKED_PROVISO")).toBe(true);
  });
});
