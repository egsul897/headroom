/**
 * Generic/unseen-company UI generalization proof (task "UNIVERSAL HEADROOM
 * PRODUCT EXPERIENCE" §73 - "NOT COHERENT. NOT MATTHEWS... Populate
 * generalized read-model state with: financial metrics, capital structure,
 * multiple covenant families, capacity rules, ratio rule, unmodeled family,
 * review item. Verify automatically: same shell, same Dashboard, same row
 * components, same formula/citation presentation, same fail-closed
 * behavior.").
 *
 * Deliberately NOT database-backed - every input below is hand-built
 * in-memory and fed straight into the same PURE functions the real pages
 * call (`buildCovenantOverview`, lib/covenant-overview-builder.ts;
 * `getFinancialPosition`, lib/financial-core/position-service.ts, both
 * unmodified), then rendered through the exact same components
 * (components/CovenantOverview.tsx, unmodified) Coherent and Matthews
 * render through. This is a pure UI/read-model generalization proof, not a
 * re-test of the calculation engines themselves (already covered
 * extensively elsewhere) or of the contract analyzer (§73 - "does NOT prove
 * analyzer generalization").
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCovenantOverview, type PermissionRowInput } from "../lib/covenant-overview-builder";
import { getFinancialPosition } from "../lib/financial-core/position-service";
import { fact, type DebtEvent, type Facility, type FinancialState } from "../lib/financial-core/types";
import type { CompanyCovenantData, SolverNativeCompanyContext } from "../lib/covenant-engine";
import { CovenantOverviewView } from "../components/CovenantOverview";

const COMPANY_ID = "unseen-fixture-co";
const AS_OF = new Date("2027-03-31T00:00:00.000Z");
const DOC_ID = "unseen-fixture-credit-agreement";

const financialState: FinancialState = {
  id: "unseen-fixture-state-1",
  companyId: COMPANY_ID,
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
  covenantMetricFacts: {
    // Deliberately zero/unset - triggers a real REVIEW_REQUIRED row below
    // (a COVERAGE_RATIO_ROOM provision needs this to convert a ratio into a
    // dollar/x figure), not a fabricated one.
    assumedNewDebtRatePct: fact(0, "ASSUMED", AS_OF),
  },
};

const facilities: Facility[] = [
  {
    id: "unseen-fixture-term-loan",
    companyId: COMPANY_ID,
    name: "Term Loan B",
    facilityType: "TERM_LOAN",
    currency: { code: "USD" },
    originalPrincipal: 600,
    secured: true,
    couponType: "FLOATING",
    marginBps: 300,
    referenceRate: "SOFR",
    governingDocumentId: DOC_ID,
    obligorEntityClasses: ["BORROWER"],
    guarantorEntityClasses: [],
    collateralPoolIds: [],
    originatingPermissionIds: [],
    effectiveFrom: null,
    effectiveTo: null,
  },
  {
    id: "unseen-fixture-notes",
    companyId: COMPANY_ID,
    name: "Unsecured Notes",
    facilityType: "NOTES",
    currency: { code: "USD" },
    originalPrincipal: 400,
    secured: false,
    couponType: "FIXED",
    couponPct: 6.5,
    governingDocumentId: DOC_ID,
    obligorEntityClasses: ["BORROWER"],
    guarantorEntityClasses: [],
    collateralPoolIds: [],
    originatingPermissionIds: [],
    effectiveFrom: null,
    effectiveTo: null,
  },
];

const events: DebtEvent[] = [
  { id: "unseen-fixture-ev-1", companyId: COMPANY_ID, facilityId: "unseen-fixture-term-loan", eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 600, provenance: fact(600, "REPORTED", AS_OF) },
  { id: "unseen-fixture-ev-2", companyId: COMPANY_ID, facilityId: "unseen-fixture-notes", eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 400, provenance: fact(400, "REPORTED", AS_OF) },
];

const financialPosition = getFinancialPosition(financialState, facilities, events, AS_OF, [{ referenceRate: "SOFR", assumedRatePct: 5.5 }]);

const covenantData: CompanyCovenantData = {
  companyId: COMPANY_ID,
  documents: [{ id: DOC_ID, name: "Unseen Fixture Credit Agreement", type: "CREDIT_AGREEMENT", governs: "Term Loan B / Unsecured Notes" }],
  // A ratio rule (MODELED) and a review item (REVIEW_REQUIRED) - both land
  // in FINANCIAL_COVENANTS automatically via buildDebtRatioTests, purely off
  // formulaType, never a hardcoded provision code.
  provisions: [
    { id: "unseen-lev-ratio", documentId: DOC_ID, code: "lev", basketName: "Total Leverage Ratio", sectionRef: "§6.1", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, params: {} },
    { id: "unseen-cov-ratio", documentId: DOC_ID, code: "cov", basketName: "Interest Coverage Ratio", sectionRef: "§6.2", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2.0, params: {} },
  ],
  financials: { ebitda: 500, cash: 80, interestExpense: 40, cumulativeNetIncome: 100, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 0, totalDebt: 1000, securedDebt: 600 },
  ledger: [],
};

// A capacity rule (INDEBTEDNESS, real $150M basket) and an unmodeled family
// item (LIENS, KNOWN_NOT_MODELED - "present in documents, not modeled").
const permissionRows: PermissionRowInput[] = [
  {
    id: "unseen-perm-debt",
    documentId: DOC_ID,
    code: "debt1",
    grantType: "DEBT_INCURRENCE",
    action: "General debt basket",
    entityScope: ["BORROWER"],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 150,
    params: null,
    sectionRef: "§3.1",
    modelingStatus: "MODELED",
    reviewStatus: "VERIFIED",
    notes: null,
  },
  {
    id: "unseen-perm-lien",
    documentId: DOC_ID,
    code: "lien1",
    grantType: "LIEN",
    action: "General lien basket",
    entityScope: [],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 0,
    params: null,
    sectionRef: "§3.2",
    modelingStatus: "KNOWN_NOT_MODELED",
    reviewStatus: "UNVERIFIED",
    notes: "Lien basket text not yet extracted from the executed agreement.",
  },
];

const emptySolverContext: SolverNativeCompanyContext = {
  permissions: [],
  relationships: [],
  sharedConstraints: [],
  collateralScopes: [],
  ruleActivationConditions: [],
  coverageDeclarations: [],
  activationState: { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() },
  asOfDate: AS_OF,
  entityClasses: ["BORROWER"],
  incurringEntity: { id: "unseen-fixture-borrower", name: "Unseen Fixture Co" },
  guarantorStatus: "GUARANTOR",
  collateralPools: [],
  requestedLienPriority: [],
};

const overviewCore = buildCovenantOverview({
  asOfDate: AS_OF,
  covenantData,
  financialPosition,
  solverContext: emptySolverContext,
  permissionRows,
  coverageDeclarations: [],
  documentNameById: new Map([[DOC_ID, "Unseen Fixture Credit Agreement"]]),
});

const overview = { company: { id: COMPANY_ID, name: "Unseen Fixture Co", ticker: null, onboardingStatus: "ACTIVE" as const, tenantKind: "CUSTOMER" as const }, ...overviewCore };

describe("a genuinely unseen company (not Coherent, not Matthews) - UI generalization proof", () => {
  it("renders through the exact same components/CSS classes as Coherent/Matthews, with zero company-specific code involved", () => {
    const html = renderToStaticMarkup(<CovenantOverviewView overview={overview} />);
    for (const cls of ["family-section", "covenant-row", "status-pill", "headline-capacity-card", "tier-label"]) {
      expect(html).toContain(cls);
    }
  });

  it("shows the real capacity rule ($150M general debt basket) in Indebtedness", () => {
    const debt = overview.covenantFamilies.find((f) => f.family === "INDEBTEDNESS");
    expect(debt).toBeDefined();
    const row = debt!.rows.find((r) => r.stableKey === "perm:unseen-perm-debt");
    expect(row).toMatchObject({ kind: "CAPACITY", status: "MODELED", currentCapacity: 150 });
  });

  it("shows the unmodeled family item honestly (present in documents, not modeled) - never $0", () => {
    const liens = overview.covenantFamilies.find((f) => f.family === "LIENS");
    expect(liens).toBeDefined();
    expect(liens!.coverageState).toBe("PRESENT_BUT_UNMODELED");
    const row = liens!.rows.find((r) => r.stableKey === "perm:unseen-perm-lien");
    expect(row).toMatchObject({ status: "UNMODELED", tier: "EXCEPTION" });
    if (row!.kind === "CAPACITY") expect(row!.currentCapacity).toBeNull();
  });

  it("shows the ratio rule (MODELED) and the review item (REVIEW_REQUIRED) in Financial Covenants, both without a hardcoded provision code", () => {
    const fc = overview.covenantFamilies.find((f) => f.family === "FINANCIAL_COVENANTS");
    expect(fc).toBeDefined();
    const leverageRow = fc!.rows.find((r) => r.stableKey === "ratio:unseen-lev-ratio");
    expect(leverageRow).toMatchObject({ kind: "RATIO", status: "MODELED" });
    const coverageRow = fc!.rows.find((r) => r.stableKey === "ratio:unseen-cov-ratio");
    expect(coverageRow).toMatchObject({ kind: "RATIO", status: "REVIEW_REQUIRED" });
    expect(fc!.counts.reviewRequired).toBe(1);
  });

  it("surfaces the review item in Needs Attention - a real, derived signal, never a fabricated alert", () => {
    expect(overview.attentionItems.some((a) => a.description.includes("Financial Covenants") && a.description.includes("review"))).toBe(true);
  });

  it("never fabricates a headline capacity figure - this fixture's document has no capacityFormulas, so it shows NOT_MODELED honestly", () => {
    expect(overview.securedCapacity.status).toBe("NOT_MODELED");
    expect(overview.securedCapacity.remainingCapacity).toBeUndefined();
    expect(overview.unsecuredCapacity.status).toBe("NOT_MODELED");
  });

  it("carries real capital-structure/financial-position data through headline metrics, sourced from the same financial-core the real pages use", () => {
    const netDebt = overview.headlineMetrics.find((m) => m.key === "netDebt");
    expect(netDebt?.value).toBe("$920M"); // 1000 total debt - 80 cash, computed by financial-core, not this test
  });
});
