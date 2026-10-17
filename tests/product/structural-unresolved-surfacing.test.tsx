/**
 * Phase E surfacing: Permission `params.structuralUnresolved` (minted by
 * compile-accepted.ts when counsel accepts an item whose structural
 * relationship is unresolved) must be VISIBLE where the permission is
 * displayed — overview capacity rows (Dashboard/Position), Simulate
 * traces, capacity-page binding citations. Display only: no figure,
 * status, or gate may change because of the flag.
 *
 * Covers: the defensive params reader, the (documentId, code) key-set
 * join Simulate uses, the pure overview builder's row mapping, the
 * rendered marker in the real CovenantOverview component, and the
 * capacity page's permission-id loader (mocked Prisma).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  readStructuralProvenanceFlags,
  structuralUnresolvedProvisionKeys,
  STRUCTURAL_UNRESOLVED_NOTICE,
  type FormulaParams,
} from "../../lib/covenant-engine";
import { buildCovenantOverview, type PermissionRowInput } from "../../lib/covenant-overview-builder";
import { getFinancialPosition } from "../../lib/financial-core/position-service";
import { fact, type DebtEvent, type Facility, type FinancialState } from "../../lib/financial-core/types";
import type { CompanyCovenantData, SolverNativeCompanyContext } from "../../lib/covenant-engine";
import { CovenantOverviewView } from "../../components/CovenantOverview";

const mocks = vi.hoisted(() => ({ permissionFindMany: vi.fn() }));
vi.mock("../../lib/prisma", () => ({
  prisma: { permission: { findMany: mocks.permissionFindMany } },
}));
import { loadStructuralUnresolvedPermissionIds } from "../../lib/product/customer-intelligence/structural-flags";

/** The exact params shape compile-accepted.ts mints for an unresolved item. */
const MINTED_FLAGGED = {
  structuralNodeId: "node-sec-7-02-a",
  structuralArticleHeading: "ARTICLE VII — NEGATIVE COVENANTS",
  structuralUnresolved: true,
} as unknown as FormulaParams;

/** Same provenance keys, relationship resolved — the key is omitted at mint time. */
const MINTED_RESOLVED = {
  structuralNodeId: "node-sec-7-02-b",
  structuralArticleHeading: "ARTICLE VII — NEGATIVE COVENANTS",
} as unknown as FormulaParams;

describe("readStructuralProvenanceFlags", () => {
  it("reads the minted shape verbatim", () => {
    expect(readStructuralProvenanceFlags(MINTED_FLAGGED)).toEqual({
      structuralNodeId: "node-sec-7-02-a",
      structuralArticleHeading: "ARTICLE VII — NEGATIVE COVENANTS",
      structuralUnresolved: true,
    });
  });

  it("absent key (resolved at mint time) is not unresolved", () => {
    expect(readStructuralProvenanceFlags(MINTED_RESOLVED).structuralUnresolved).toBe(false);
    expect(readStructuralProvenanceFlags({}).structuralUnresolved).toBe(false);
    expect(readStructuralProvenanceFlags(null).structuralUnresolved).toBe(false);
    expect(readStructuralProvenanceFlags(undefined).structuralUnresolved).toBe(false);
  });

  it("only an exact boolean true counts — truthy lookalikes are not evidence", () => {
    expect(readStructuralProvenanceFlags({ structuralUnresolved: "true" }).structuralUnresolved).toBe(false);
    expect(readStructuralProvenanceFlags({ structuralUnresolved: 1 }).structuralUnresolved).toBe(false);
    expect(readStructuralProvenanceFlags({ structuralUnresolved: false }).structuralUnresolved).toBe(false);
  });

  it("non-object params and non-string provenance values degrade to nulls, never throw", () => {
    expect(readStructuralProvenanceFlags("junk")).toEqual({
      structuralNodeId: null,
      structuralArticleHeading: null,
      structuralUnresolved: false,
    });
    expect(readStructuralProvenanceFlags([1, 2]).structuralUnresolved).toBe(false);
    expect(readStructuralProvenanceFlags({ structuralNodeId: 42, structuralArticleHeading: {} })).toEqual({
      structuralNodeId: null,
      structuralArticleHeading: null,
      structuralUnresolved: false,
    });
  });
});

describe("structuralUnresolvedProvisionKeys (Simulate's exact-key join)", () => {
  it("keys flagged permissions by `${documentId}:${code}` — the key the panels build from a displayed provision", () => {
    const keys = structuralUnresolvedProvisionKeys([
      { documentId: "doc-1", code: "debt-a", params: MINTED_FLAGGED },
      { documentId: "doc-1", code: "debt-b", params: MINTED_RESOLVED },
    ]);
    expect([...keys]).toEqual(["doc-1:debt-a"]);
    // The displayed-provision side of the join (SimulateClient) builds
    // `${provision.documentId}:${provision.code}` — identical string.
    const displayedProvision = { documentId: "doc-1", code: "debt-a" };
    expect(keys.has(`${displayedProvision.documentId}:${displayedProvision.code}`)).toBe(true);
  });

  it("skips codeless permissions and null params — never fuzzy-matches", () => {
    const keys = structuralUnresolvedProvisionKeys([
      { documentId: "doc-1", code: null, params: MINTED_FLAGGED },
      { documentId: "doc-1", params: MINTED_FLAGGED },
      { documentId: "doc-1", code: "debt-c", params: null },
    ]);
    expect(keys.size).toBe(0);
  });
});

describe("loadStructuralUnresolvedPermissionIds (capacity page citations)", () => {
  it("returns only ids whose minted params carry structuralUnresolved === true", async () => {
    mocks.permissionFindMany.mockResolvedValue([
      { id: "p-flagged", params: MINTED_FLAGGED },
      { id: "p-resolved", params: MINTED_RESOLVED },
      { id: "p-null", params: null },
      { id: "p-stringy", params: { structuralUnresolved: "true" } },
    ]);
    const ids = await loadStructuralUnresolvedPermissionIds("co-1");
    expect([...ids]).toEqual(["p-flagged"]);
    expect(mocks.permissionFindMany).toHaveBeenCalledWith({
      where: { companyId: "co-1" },
      select: { id: true, params: true },
    });
  });
});

// ---------------------------------------------------------------------------
// Overview builder + real component render (in-memory fixture, same
// convention as tests/unseen-company-ui.test.tsx).
// ---------------------------------------------------------------------------

const COMPANY_ID = "structural-flag-fixture-co";
const DOC_ID = "structural-flag-fixture-ca";
const AS_OF = new Date("2027-03-31T00:00:00.000Z");

const financialState: FinancialState = {
  id: "sf-state-1",
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
  covenantMetricFacts: { assumedNewDebtRatePct: fact(5, "ASSUMED", AS_OF) },
};

const facilities: Facility[] = [
  {
    id: "sf-term-loan",
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
];

const events: DebtEvent[] = [
  { id: "sf-ev-1", companyId: COMPANY_ID, facilityId: "sf-term-loan", eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 600, provenance: fact(600, "REPORTED", AS_OF) },
];

const financialPosition = getFinancialPosition(financialState, facilities, events, AS_OF, [{ referenceRate: "SOFR", assumedRatePct: 5.5 }]);

const covenantData: CompanyCovenantData = {
  companyId: COMPANY_ID,
  documents: [{ id: DOC_ID, name: "Structural Flag Fixture Credit Agreement", type: "CREDIT_AGREEMENT", governs: "Term Loan B" }],
  provisions: [],
  financials: { ebitda: 500, cash: 80, interestExpense: 40, cumulativeNetIncome: 100, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 5, totalDebt: 1000, securedDebt: 600 },
  ledger: [],
};

const permissionRows: PermissionRowInput[] = [
  {
    id: "perm-flagged-modeled",
    documentId: DOC_ID,
    code: "debt-flagged",
    grantType: "DEBT_INCURRENCE",
    action: "General debt basket (structurally unresolved source)",
    entityScope: ["BORROWER"],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 150,
    params: MINTED_FLAGGED,
    sectionRef: "§7.02(a)",
    modelingStatus: "MODELED",
    reviewStatus: "UNVERIFIED",
    notes: null,
  },
  {
    id: "perm-resolved-modeled",
    documentId: DOC_ID,
    code: "debt-resolved",
    grantType: "DEBT_INCURRENCE",
    action: "Ratio debt basket (structurally resolved source)",
    entityScope: ["BORROWER"],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 250,
    params: MINTED_RESOLVED,
    sectionRef: "§7.02(b)",
    modelingStatus: "MODELED",
    reviewStatus: "UNVERIFIED",
    notes: null,
  },
  {
    id: "perm-flagged-unmodeled",
    documentId: DOC_ID,
    code: "lien-flagged",
    grantType: "LIEN",
    action: "General lien basket (structurally unresolved source)",
    entityScope: [],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 0,
    params: MINTED_FLAGGED,
    sectionRef: "§7.01(a)",
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
  ratioProvisions: [],
  activationState: { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() },
  asOfDate: AS_OF,
  entityClasses: ["BORROWER"],
  incurringEntity: { id: "sf-borrower", name: "Structural Flag Fixture Co" },
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
  documentNameById: new Map([[DOC_ID, "Structural Flag Fixture Credit Agreement"]]),
});

const overview = {
  company: { id: COMPANY_ID, name: "Structural Flag Fixture Co", ticker: null, onboardingStatus: "ACTIVE" as const, tenantKind: "CUSTOMER" as const },
  ...overviewCore,
};

function rowByStableKey(stableKey: string) {
  for (const fam of overview.covenantFamilies) {
    const row = fam.rows.find((r) => r.stableKey === stableKey);
    if (row) return row;
  }
  return undefined;
}

describe("buildCovenantOverview — structuralUnresolved row mapping", () => {
  it("stamps the flag on a MODELED permission row minted from an unresolved item", () => {
    const row = rowByStableKey("perm:perm-flagged-modeled");
    expect(row?.kind).toBe("CAPACITY");
    if (row?.kind === "CAPACITY") {
      expect(row.structuralUnresolved).toBe(true);
      // Display only: the computed figure is untouched by the flag.
      expect(row.currentCapacity).toBe(150);
      expect(row.status).toBe("MODELED");
    }
  });

  it("stamps the flag on a KNOWN_NOT_MODELED permission row too", () => {
    const row = rowByStableKey("perm:perm-flagged-unmodeled");
    expect(row?.kind).toBe("CAPACITY");
    if (row?.kind === "CAPACITY") {
      expect(row.structuralUnresolved).toBe(true);
      expect(row.status).toBe("UNMODELED");
    }
  });

  it("leaves resolved permissions unflagged (undefined, not false)", () => {
    const row = rowByStableKey("perm:perm-resolved-modeled");
    expect(row?.kind).toBe("CAPACITY");
    if (row?.kind === "CAPACITY") {
      expect(row.structuralUnresolved).toBeUndefined();
      expect(row.currentCapacity).toBe(250);
    }
  });
});

describe("CovenantOverviewView — rendered marker", () => {
  it("renders the plain-words notice once per flagged row and never for resolved rows", () => {
    const html = renderToStaticMarkup(<CovenantOverviewView overview={overview} />);
    const occurrences = html.split("Structural relationship unresolved").length - 1;
    expect(occurrences).toBe(2);
    expect(html).toContain("treat this permission");
    // Sanity: the notice constant the components render is the same text.
    expect(STRUCTURAL_UNRESOLVED_NOTICE).toContain("Structural relationship unresolved");
  });
});
