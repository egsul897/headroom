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
  discoverProvisionEdgesFromItems,
  scoreDocumentQuality,
  suggestCategoryForUnknown,
  generateExercisesFromSource,
} from "../../lib/product/legal-reasoning";
import { detectPatternsInText, allPatterns } from "../../lib/knowledge-factory/patterns/library";
import { discoverDocumentRelationships } from "../../lib/knowledge-factory/relationships/discover";
import { seedDraftingPatterns } from "../../lib/product/covenant-intelligence-loop/patterns";
import { listExercises } from "../../lib/product/covenant-intelligence-loop/exercise-library";
import { challengeLegalConclusions } from "../../lib/product/legal-intelligence/challenge";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(partial: Partial<CovenantSummaryItem> & { sectionRef: string; category: CovenantSummaryItem["category"] }): CovenantSummaryItem & {
  sourceId: string;
  documentTitle: string;
} {
  const { category, ...rest } = partial;
  const base: CovenantSummaryItem = {
    category,
    categoryLabel: category,
    heading: rest.heading ?? `Section ${partial.sectionRef}`,
    posture: rest.posture ?? "GENERAL_PROHIBITION",
    plainEnglish: rest.plainEnglish ?? "The Borrower shall not incur Indebtedness except as permitted.",
    restriction: rest.restriction !== undefined ? rest.restriction : "shall not incur Indebtedness",
    permissions: rest.permissions ?? ["except Permitted Indebtedness"],
    coveredEntities: [],
    exceptions: rest.exceptions ?? ["provided that no Default"],
    conditions: rest.conditions ?? ["so long as no Event of Default"],
    materialBasketsThresholds: rest.materialBasketsThresholds ?? ["greater of $50 million and 5% of EBITDA"],
    draftingPatterns: [],
    operativeLanguageExcerpt: rest.operativeLanguageExcerpt ?? "shall not incur Indebtedness except…",
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
      heading: rest.heading ?? `Section ${partial.sectionRef}`,
      category,
      categoryLabel: category,
      families: [],
      posture: rest.posture ?? "GENERAL_PROHIBITION",
      plainEnglish: rest.plainEnglish ?? "",
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
      alternativeInterpretations: [],
      assumptions: [],
      judgmentCalls: [],
    },
    ...rest,
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

describe("provision graph / quality / exercise factory", () => {
  it("discovers provision-level definition and condition edges", () => {
    const edges = discoverProvisionEdgesFromItems([
      item({
        sectionRef: "7.06",
        category: "RESTRICTED_PAYMENTS_INVESTMENTS",
        applicableDefinitions: [{ term: "Available Amount", excerpt: "means…", resolved: true }],
        crossReferences: ["Section 1.01", "Section 7.01"],
        exceptions: ["except as permitted"],
        conditions: ["provided that no Default"],
        plainEnglish: "shared basket capacity for RP and investments",
        materialBasketsThresholds: ["shared capacity aggregate"],
      }),
      item({ sectionRef: "7.01", category: "DEBT_INCURRENCE" }),
    ]);
    expect(edges.some((e) => e.kind === "PROVISION_DEFINITION")).toBe(true);
    expect(edges.some((e) => e.kind === "PROVISION_CROSS_REFERENCE")).toBe(true);
    expect(edges.some((e) => e.kind === "PROVISION_CONDITION")).toBe(true);
    expect(edges.some((e) => e.kind === "PROVISION_SHARED_CAPACITY")).toBe(true);
  });

  it("scores document quality and suggests unknown categories", () => {
    const score = scoreDocumentQuality({
      sourceId: "s1",
      documentClass: "CREDIT_AGREEMENT",
      documentTitle: "Credit Agreement",
      exhibitFilename: "ex10.htm",
      provenance: "sec-edgar",
      summary: {
        schemaVersion: "product.covenant-summary.v2",
        sourceId: "s1",
        governingAgreement: "CA",
        issuerCik: "1",
        documentClass: "CREDIT_AGREEMENT",
        generatedAt: new Date().toISOString(),
        promotedToLegalTruth: 0,
        note: "",
        countsByCategory: {},
        definedTermsSample: [{ term: "EBITDA", excerpt: "means" }],
        items: [
          item({ sectionRef: "7.01", category: "DEBT_INCURRENCE" }),
          item({ sectionRef: "7.02", category: "LIENS_SECURED_DEBT" }),
          item({
            sectionRef: "9.99",
            category: "OTHER",
            plainEnglish: "Limitation on Indebtedness miscellaneous",
            posture: "UNRESOLVED",
            restriction: null,
            permissions: [],
          }),
        ],
      },
    });
    expect(score.score).toBeGreaterThan(0.2);
    const suggestion = suggestCategoryForUnknown(
      item({
        sectionRef: "9.99",
        category: "OTHER",
        plainEnglish: "Limitation on Indebtedness of the Borrower",
        posture: "UNRESOLVED",
      }),
    );
    expect(suggestion.suggested).toBe("DEBT_INCURRENCE");
  });

  it("generates synthetic exercises from authentic categories", () => {
    const gens = generateExercisesFromSource({
      sourceId: "src-ca",
      documentTitle: "Test Credit Agreement",
      items: [
        item({ sectionRef: "7.01", category: "DEBT_INCURRENCE" }),
        item({ sectionRef: "7.02", category: "LIENS_SECURED_DEBT" }),
        item({ sectionRef: "7.06", category: "RESTRICTED_PAYMENTS_INVESTMENTS" }),
        item({ sectionRef: "7.05", category: "ASSET_SALES" }),
      ],
      maxVariants: 6,
    });
    expect(gens.length).toBeGreaterThan(0);
    expect(gens.every((g) => g.syntheticAssumptions.some((a) => /SYNTHETIC/.test(a)))).toBe(true);
    expect(gens.every((g) => /NOT ground truth/i.test(g.note))).toBe(true);
  });

  it("discovers amendment links with family-token overlap", () => {
    const rels = discoverDocumentRelationships([
      {
        sourceId: "base",
        issuerCik: "0000000001",
        accessionNumber: "a",
        exhibitFilename: "ex.htm",
        sourceUrl: "u",
        filingDate: "2020-01-01",
        formType: "8-K",
        documentTitle: "Credit Agreement dated as of January 1, 2020",
        documentClass: "CREDIT_AGREEMENT",
        originalBytesHash: "h1",
        acquisitionTimestamp: "2020-01-01T00:00:00.000Z",
        parserVersion: "t",
        extractionStatus: "STRUCTURALLY_INDEXED",
        representationLevel: "STRUCTURALLY_INDEXED",
        provenance: "sec-edgar",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      },
      {
        sourceId: "amd",
        issuerCik: "0000000001",
        accessionNumber: "b",
        exhibitFilename: "ex2.htm",
        sourceUrl: "u2",
        filingDate: "2021-01-01",
        formType: "8-K",
        documentTitle: "First Amendment to Credit Agreement",
        documentClass: "AMENDMENT",
        originalBytesHash: "h2",
        acquisitionTimestamp: "2021-01-01T00:00:00.000Z",
        parserVersion: "t",
        extractionStatus: "STRUCTURALLY_INDEXED",
        representationLevel: "STRUCTURALLY_INDEXED",
        provenance: "sec-edgar",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      },
    ]);
    expect(rels.some((r) => r.kind === "AGREEMENT_AMENDMENT")).toBe(true);
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
