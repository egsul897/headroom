/**
 * Consumer pins for the unified covenant-level grammar: every reader
 * that used to carry a partial, strict ratio pattern now flows through
 * the one parser/tokenizer (lib/contract-model/covenant-computation/
 * covenant-levels.ts).
 *
 * This file imports ONLY modules that exist on the base tree, so each
 * test fails on base by assertion (the old strict behavior), not by a
 * missing import. All fixtures are SYNTHETIC (invented issuer
 * "Meridian Packaging Holdings, Inc.", invented figures), per the
 * PR #430 discipline.
 */
import { describe, expect, it } from "vitest";
import { SyntheticContractAnalyzer } from "../../../lib/contract-model/analyzer/synthetic-analyzer";
import { checkSectionBasketCompleteness } from "../../../lib/contract-model/compiler/basket-completeness";
import type { CandidateContractRule } from "../../../lib/contract-model/types";
import { runCovenantComputation } from "../../../lib/contract-model/covenant-computation";
import type { ComputationPackage } from "../../../lib/contract-model/covenant-computation/types";
import { analyzeProvision } from "../../../lib/product/covenant-intelligence/analyze-provision";
import type { StructuralNodeRecord } from "../../../lib/knowledge-factory/types";
import { parseMaintenanceRatio } from "../../../lib/product/customer-intelligence/maintenance-ratio";
import type { CovenantSummaryItem } from "../../../lib/product/covenant-intelligence/summarize";
import { runAgreementPipeline } from "../../../lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { buildCovenantOverview } from "../../../lib/covenant-overview-builder";
import { getFinancialPosition } from "../../../lib/financial-core/position-service";
import { fact, type FinancialState } from "../../../lib/financial-core/types";
import type { CompanyCovenantData, SolverNativeCompanyContext } from "../../../lib/covenant-engine";

describe("consumer: synthetic-analyzer reads non-:1.00 formats (gap 1)", () => {
  const doc = [
    "Section 6.10 Financial Covenants. The Borrower shall not permit the Consolidated Leverage Ratio to be greater than 4.5:1.",
    "Section 6.11 Coverage. The Borrower shall not permit the Interest Coverage Ratio to be less than 3.00 to 1.",
  ].join("\n");

  it("emits RATIO_TEST rules for '4.5:1' and '3.00 to 1' (both invisible to the old N.NN:1.00 pattern)", async () => {
    const result = await new SyntheticContractAnalyzer().analyze({ documentText: doc, definitionsText: "" });
    const ratioRules = result.rules.filter((r) => r.ruleType === "RATIO_TEST");
    expect(ratioRules.map((r) => r.thresholdValue).sort()).toEqual([3, 4.5]);
  });
});

describe("consumer: basket-completeness sees 'X to 1' figures (gap 1)", () => {
  function rule(overrides: Partial<CandidateContractRule>): CandidateContractRule {
    return {
      covenantFamily: "INDEBTEDNESS",
      ruleType: "QUANTITATIVE_PERMISSION",
      evaluationClass: "EXECUTABLE",
      action: "INDEBTEDNESS",
      entityScope: [],
      entityScopeExcluded: [],
      conditions: [],
      exceptions: [],
      sourceSectionRef: "9.01",
      definedTermRefs: [],
      ...overrides,
    } as CandidateContractRule;
  }

  it("a ratio basket written '4.5 to 1' is detected as a section figure and matches its rule", () => {
    const text = "Section 9.01. Leverage Test. The ratio shall not exceed 4.5 to 1 at any time.";
    // Detection: with NO rule carrying the figure, the checker must
    // report 4.5 as an unmatched section number. (On the base tree the
    // strict N.NN:1.00 pattern never extracts it, so nothing is
    // reported at all — the miss is silent there.)
    const detected = checkSectionBasketCompleteness("9.01", text, []);
    expect(detected.unmatchedNumbers.map((u) => u.value)).toContain(4.5);
    // Matching: a rule carrying 4.5 covers it — no flag.
    const result = checkSectionBasketCompleteness("9.01", text, [rule({ thresholdValue: 4.5 })]);
    expect(result.unmatchedNumbers.map((u) => u.value)).not.toContain(4.5);
    expect(result.flagged).toBe(false);
  });
});

describe("consumer: analyze-provision labels colon-form ratio thresholds (gap 1)", () => {
  function node(nodeId: string, sectionRef: string, heading: string): StructuralNodeRecord {
    return { nodeId, sourceId: "test:levels", nodeType: "SECTION", sectionRef, heading, charStart: 0, charEnd: 100, ambiguous: false };
  }

  it("a '4.50:1.00' level becomes a 'Ratio threshold:' label (the old reader only saw 'N to 1.00')", () => {
    const a = analyzeProvision({
      sourceId: "test:levels",
      documentTitle: "Meridian Packaging Credit Agreement (synthetic)",
      candidate: {
        candidateId: "c-levels",
        sourceId: "test:levels",
        nodeId: "n-levels",
        families: ["FINANCIAL_MAINTENANCE_COVENANTS"],
        signals: [],
        excerpt: "Section 7.11 Financial Covenants. The Borrower shall not permit the Consolidated Total Net Leverage Ratio to exceed 4.50:1.00.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 8,
      },
      definitions: [],
      structuralNodes: [node("n-levels", "7.11", "Financial Covenants")],
    });
    expect(a.basketsAndThresholds.some((b) => b.startsWith("Ratio threshold:") && b.includes("4.50:1.00"))).toBe(true);
  });
});

describe("consumer: Rule 180 (parseMaintenanceRatio) — unified labels + agreementMetric", () => {
  function item(overrides: Partial<CovenantSummaryItem>): CovenantSummaryItem {
    return {
      category: "FINANCIAL_MAINTENANCE",
      categoryLabel: "Financial maintenance",
      sectionRef: "7.11",
      heading: "Financial Covenants",
      posture: "MAINTENANCE_TEST",
      plainEnglish: "",
      restriction: null,
      permissions: [],
      coveredEntities: [],
      exceptions: [],
      conditions: [],
      materialBasketsThresholds: [],
      draftingPatterns: [],
      operativeLanguageExcerpt: "",
      ...overrides,
    } as CovenantSummaryItem;
  }

  it("compiles a colon-form threshold the old label regex could not read", () => {
    const r = parseMaintenanceRatio(item({
      materialBasketsThresholds: ["Ratio threshold: 4.50:1.00"],
      operativeLanguageExcerpt: "The Borrower shall not permit the Consolidated Total Net Leverage Ratio to exceed 4.50:1.00.",
    }));
    expect(r).not.toBeNull();
    expect(r!.formulaType).toBe("LEVERAGE_RATIO_ROOM");
    expect(r!.thresholdValue).toBe(4.5);
  });

  it("records agreementMetric NET_LEVERAGE when the parser agrees and the engine computes net leverage on the total basis", () => {
    const r = parseMaintenanceRatio(item({
      materialBasketsThresholds: ["Ratio threshold: 4.50 to 1.00"],
      operativeLanguageExcerpt: "The Borrower shall not permit the Consolidated Total Net Leverage Ratio to exceed 4.50 to 1.00.",
    }));
    expect(r).not.toBeNull();
    expect(r!.agreementMetric).toBe("NET_LEVERAGE");
  });

  it("does NOT record a metric for a gross 'Total Leverage Ratio' (engine computes net — mismatch stays unset)", () => {
    const r = parseMaintenanceRatio(item({
      materialBasketsThresholds: ["Ratio threshold: 4.50 to 1.00"],
      operativeLanguageExcerpt: "The Borrower shall not permit the Consolidated Total Leverage Ratio to exceed 4.50 to 1.00.",
    }));
    expect(r).not.toBeNull();
    expect(r!.agreementMetric).toBeUndefined();
  });

  it("does NOT record FIXED_CHARGE_COVERAGE (the engine computes interest coverage for a coverage row)", () => {
    const r = parseMaintenanceRatio(item({
      materialBasketsThresholds: ["Ratio threshold: 1.10 to 1.00"],
      operativeLanguageExcerpt: "The Borrower shall maintain a Consolidated Fixed Charge Coverage Ratio of not less than 1.10 to 1.00.",
    }));
    expect(r).not.toBeNull();
    expect(r!.formulaType).toBe("COVERAGE_RATIO_ROOM");
    expect(r!.agreementMetric).toBeUndefined();
  });

  it("records INTEREST_COVERAGE for an interest-coverage test", () => {
    const r = parseMaintenanceRatio(item({
      materialBasketsThresholds: ["Ratio threshold: 3.00 to 1.00"],
      operativeLanguageExcerpt: "The Borrower shall maintain a Consolidated Interest Coverage Ratio of not less than 3.00 to 1.00.",
    }));
    expect(r).not.toBeNull();
    expect(r!.agreementMetric).toBe("INTEREST_COVERAGE");
  });
});

describe("consumer: covenant-computation thresholds — testKind + the maintenance guard", () => {
  const DEFINITION = "“Consolidated Total Leverage Ratio” means the ratio of Consolidated Total Debt to Consolidated EBITDA.";
  function pkgWith(baskets: ComputationPackage["baskets"]): ComputationPackage {
    return {
      packageKey: "levels-test",
      companyId: "meridian",
      instrumentKey: "ca",
      asOf: "2027-03-31",
      documents: [{ documentId: "doc-1", text: `Credit Agreement. ${DEFINITION}`, role: "CREDIT_AGREEMENT" }],
      baskets,
    } as unknown as ComputationPackage;
  }

  it("an incurrence threshold the parser confirms carries testKind INCURRENCE", () => {
    const result = runCovenantComputation(pkgWith([
      {
        stableKey: "b1", sectionRef: "7.01", covenantFamily: "INDEBTEDNESS", documentId: "doc-1",
        operativeText: "The Borrower may incur Indebtedness if, after giving effect thereto, the Consolidated Total Leverage Ratio would be no greater than 4.50 to 1.00.",
        role: "PERMISSION",
      } as ComputationPackage["baskets"][number],
    ]), { createdAt: "1970-01-01T00:00:00.000Z" });
    const thresholds = result.ratios.flatMap((r) => r.thresholds);
    expect(thresholds).toHaveLength(1);
    expect(thresholds[0]!.canonical).toBe("4.5");
    expect(thresholds[0]!.testKind).toBe("INCURRENCE");
  });

  it("a MAINTENANCE level in a financial-ratios section is NOT collected as an incurrence threshold", () => {
    const result = runCovenantComputation(pkgWith([
      {
        stableKey: "b2", sectionRef: "7.11", covenantFamily: "FINANCIAL_RATIOS", documentId: "doc-1",
        operativeText: "The Consolidated Total Leverage Ratio shall be no greater than 4.50 to 1.00 as of the last day of any fiscal quarter.",
        role: "PERMISSION",
      } as ComputationPackage["baskets"][number],
    ]), { createdAt: "1970-01-01T00:00:00.000Z" });
    const thresholds = result.ratios.flatMap((r) => r.thresholds);
    expect(thresholds).toHaveLength(0);
  });
});

describe("consumer: agreement pipeline emits maintenanceLevels (baseline: none)", () => {
  const AGREEMENT = [
    "CREDIT AGREEMENT dated as of March 1, 2027, among Meridian Packaging Holdings, Inc., as Borrower, and the Lenders party hereto.",
    "ARTICLE VII — NEGATIVE COVENANTS",
    "Section 7.01 Indebtedness. The Borrower shall not incur any Indebtedness except as permitted under this Article.",
    "Section 7.11 Financial Covenants. The Borrower shall not permit the Consolidated Total Net Leverage Ratio to exceed 4.50:1.00.",
  ].join("\n");

  it("finds the maintenance level, DETERMINED, with kind + metric", () => {
    const r = runAgreementPipeline({ sourceId: "meridian-ca", text: AGREEMENT });
    const levels = (r as { maintenanceLevels?: unknown[] }).maintenanceLevels ?? [];
    expect(levels.length).toBeGreaterThan(0);
    const lvl = levels[0] as { testKind: string; levelStatus: string; level: string; metric: string };
    expect(lvl.testKind).toBe("MAINTENANCE");
    expect(lvl.levelStatus).toBe("DETERMINED");
    expect(lvl.level).toBe("4.5");
    expect(lvl.metric).toBe("NET_LEVERAGE");
  });
});

describe("consumer: overview RatioRow flags (#413 semantics)", () => {
  const AS_OF = new Date("2027-03-31T00:00:00.000Z");
  const DOC_ID = "meridian-ca";
  const financialState: FinancialState = {
    id: "meridian-state",
    companyId: "meridian",
    asOfDate: AS_OF,
    periodType: "ACTUAL",
    scope: { kind: "CONSOLIDATED" },
    effectiveFrom: null,
    effectiveTo: null,
    balanceSheetFacts: {
      cash: fact(80, "REPORTED", AS_OF),
      totalDebtPrincipal: fact(1000, "REPORTED", AS_OF),
      securedDebtPrincipal: fact(600, "REPORTED", AS_OF),
    },
    incomeStatementFacts: {
      gaapEbitda: fact(500, "REPORTED", AS_OF),
      cumulativeNetIncomeSinceIssue: fact(100, "REPORTED", AS_OF),
      equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF),
      interestExpense: fact(40, "REPORTED", AS_OF),
    },
    covenantMetricFacts: { assumedNewDebtRatePct: fact(0, "ASSUMED", AS_OF) },
  };
  const financialPosition = getFinancialPosition(financialState, [], [], AS_OF, []);
  const solverContext = {
    permissions: [], relationships: [], sharedConstraints: [], collateralScopes: [],
    ruleActivationConditions: [], coverageDeclarations: [], ratioProvisions: [],
    activationState: { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() },
    asOfDate: AS_OF, entityClasses: ["BORROWER"],
    incurringEntity: { id: "meridian-borrower", name: "Meridian Packaging Holdings, Inc." },
    guarantorStatus: "GUARANTOR", collateralPools: [], requestedLienPriority: [],
  } as unknown as SolverNativeCompanyContext;

  function overviewWith(provisions: CompanyCovenantData["provisions"]) {
    const covenantData: CompanyCovenantData = {
      companyId: "meridian",
      documents: [{ id: DOC_ID, name: "Meridian Credit Agreement", type: "CREDIT_AGREEMENT", governs: "Term Loan" }],
      provisions,
      financials: { ebitda: 500, cash: 80, interestExpense: 40, cumulativeNetIncome: 100, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 0, totalDebt: 1000, securedDebt: 600 },
      ledger: [],
    } as CompanyCovenantData;
    return buildCovenantOverview({
      asOfDate: AS_OF, covenantData, financialPosition, solverContext,
      permissionRows: [], coverageDeclarations: [], documentNameById: new Map([[DOC_ID, "Meridian Credit Agreement"]]),
    });
  }

  it("a Rule 180 maintenance row carries testKind, an as-of complianceVerdict, and agreementDefinedMetric when the recorded metric matches the computed measure", () => {
    // Current net leverage = (1000 - 80) / 500 = 1.84 <= 4.5 → IN_COMPLIANCE.
    const overview = overviewWith([
      {
        id: "lev-1", documentId: DOC_ID,
        code: "counsel:meridian-ca:7.11:FINANCIAL_MAINTENANCE:RATIO",
        basketName: "Consolidated Total Net Leverage Ratio (maintenance ratio test)",
        sectionRef: "7.11", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.5,
        params: { debtBasis: "total", agreementMetric: "NET_LEVERAGE" },
      },
    ]);
    const rows = overview.covenantFamilies.flatMap((f) => f.rows).filter((r) => r.kind === "RATIO");
    const row = rows.find((r) => r.sectionRef === "7.11");
    expect(row).toBeDefined();
    if (row && row.kind === "RATIO") {
      expect(row.testKind).toBe("MAINTENANCE");
      expect(row.complianceVerdict).toBe("IN_COMPLIANCE");
      expect(row.agreementDefinedMetric).toBe("NET_LEVERAGE");
    }
  });

  it("a recorded metric that does NOT match the computed measure is not surfaced as agreement-defined", () => {
    const overview = overviewWith([
      {
        id: "lev-2", documentId: DOC_ID,
        code: "counsel:meridian-ca:7.11:FINANCIAL_MAINTENANCE:RATIO",
        basketName: "Leverage (maintenance ratio test)",
        sectionRef: "7.11", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.5,
        // Engine computes NET leverage on the total basis; a recorded
        // GROSS metric must not be relabeled as the row's metric.
        params: { debtBasis: "total", agreementMetric: "GROSS_LEVERAGE" },
      },
    ]);
    const row = overview.covenantFamilies.flatMap((f) => f.rows).find((r) => r.kind === "RATIO" && r.sectionRef === "7.11");
    expect(row).toBeDefined();
    if (row && row.kind === "RATIO") {
      expect(row.testKind).toBe("MAINTENANCE");
      expect(row.agreementDefinedMetric).toBeUndefined();
    }
  });

  it("a non-Rule-180 ratio row (no FINANCIAL_MAINTENANCE provenance) gets NO testKind and NO verdict", () => {
    const overview = overviewWith([
      {
        id: "lev-3", documentId: DOC_ID, code: "legacy:ratio",
        basketName: "Total Leverage Ratio", sectionRef: "§6.1",
        formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, params: {},
      },
    ]);
    const row = overview.covenantFamilies.flatMap((f) => f.rows).find((r) => r.kind === "RATIO" && r.sectionRef === "§6.1");
    expect(row).toBeDefined();
    if (row && row.kind === "RATIO") {
      expect(row.testKind).toBeUndefined();
      expect(row.complianceVerdict).toBeUndefined();
    }
  });
});
