/**
 * P3-IAD1 — Dashboard invent-absence.
 *
 * UNKNOWN / NOT_LOADED ≠ VERIFIED_EMPTY ≠ VERIFIED_POPULATED / VERIFIED_TRACKED.
 * A null used figure must not render as `$0 used`. Maturities and facilities
 * paint verified-empty copy only after an authoritative successful load.
 *
 * IMPLEMENTED ≠ CERTIFIED. Zero provider calls.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CovenantFamiliesView } from "../../components/CovenantOverview";
import { DashboardClient } from "../../components/DashboardClient";
import type { CovenantFamilySection, OverviewRow } from "../../lib/covenant-overview-builder";
import { DASHBOARD_UNKNOWN, DASHBOARD_VERIFIED_EMPTY, resolveDashboardCopy } from "../../lib/dashboard/copy";
import {
  capacityUsedCaption,
  facilitiesQueryFromPosition,
  facilitiesStateFromQuery,
  maturitiesQueryFromPosition,
  maturitiesStateFromQuery,
  presentFacilities,
  presentMaturities,
  presentUsed,
  presentedCapacityUsedCaption,
  type FacilitiesLoadState,
  type FacilitiesQuery,
  type MaturitiesLoadState,
  type MaturitiesQuery,
  type UsedCaptionState,
} from "../../lib/dashboard/load-state";
import type { SolverNativeCompanyContext } from "../../lib/covenant-engine";
import { getFinancialPosition } from "../../lib/financial-core/position-service";
import { fact, type DebtEvent, type Facility, type FinancialState } from "../../lib/financial-core/types";

const ROOT = path.resolve(__dirname, "../..");
const VERIFIED_EMPTY_MATURITIES = "No dated maturities on record.";
const VERIFIED_EMPTY_FACILITIES = "No facilities on record.";

const COMPANY_ID = "iad1-fixture";
const AS_OF = new Date("2027-03-31T00:00:00.000Z");
const DOC_ID = "iad1-credit-agreement";

const financialState: FinancialState = {
  id: "iad1-state",
  companyId: COMPANY_ID,
  asOfDate: AS_OF,
  periodType: "ACTUAL",
  scope: { kind: "CONSOLIDATED" },
  effectiveFrom: null,
  effectiveTo: null,
  balanceSheetFacts: {
    cash: fact(80, "REPORTED", AS_OF),
    totalDebtPrincipal: fact(400, "REPORTED", AS_OF),
    securedDebtPrincipal: fact(400, "REPORTED", AS_OF),
  },
  incomeStatementFacts: {
    gaapEbitda: fact(200, "REPORTED", AS_OF),
    cumulativeNetIncomeSinceIssue: fact(50, "REPORTED", AS_OF),
    equityProceedsSinceIssue: fact(10, "REPORTED", AS_OF),
    interestExpense: fact(20, "REPORTED", AS_OF),
  },
  covenantMetricFacts: {
    assumedNewDebtRatePct: fact(5, "ASSUMED", AS_OF),
  },
};

const facilities: Facility[] = [
  {
    id: "iad1-notes",
    companyId: COMPANY_ID,
    name: "IAD1 Fixture Notes",
    facilityType: "NOTES",
    currency: { code: "USD" },
    originalPrincipal: 400,
    secured: false,
    couponType: "FIXED",
    couponPct: 6.5,
    maturityDate: new Date("2030-06-15T00:00:00.000Z"),
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
  {
    id: "iad1-issue",
    companyId: COMPANY_ID,
    facilityId: "iad1-notes",
    eventType: "ISSUANCE",
    date: new Date("2026-01-01T00:00:00.000Z"),
    amount: 400,
    provenance: fact(400, "REPORTED", AS_OF),
  },
];

const financialPosition = getFinancialPosition(financialState, facilities, events, AS_OF, []);

const solverContext: SolverNativeCompanyContext = {
  permissions: [],
  relationships: [],
  sharedConstraints: [],
  collateralScopes: [],
  ruleActivationConditions: [],
  coverageDeclarations: [],
  activationState: { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() },
  asOfDate: AS_OF,
  entityClasses: ["BORROWER"],
  incurringEntity: { id: "iad1-borrower", name: "IAD1 Fixture Co" },
  guarantorStatus: "GUARANTOR",
  collateralPools: [],
  requestedLienPriority: [],
};

function renderDashboard(facilitiesQuery: FacilitiesQuery, maturitiesQuery: MaturitiesQuery): string {
  const { unknownKeys, ...activationRest } = solverContext.activationState;
  return renderToStaticMarkup(
    <DashboardClient
      companyName="IAD1 Fixture Co"
      asOfDate={AS_OF.toISOString()}
      covenantData={{
        companyId: COMPANY_ID,
        documents: [],
        provisions: [],
        financials: {
          ebitda: 200,
          cash: 80,
          interestExpense: 20,
          cumulativeNetIncome: 50,
          equityProceedsSinceIssue: 10,
          assumedNewDebtRatePct: 5,
          totalDebt: 400,
          securedDebt: 400,
        },
        ledger: [],
      }}
      financialPosition={financialPosition}
      solverContext={{ ...solverContext, activationState: { ...activationRest, unknownKeysArray: [...unknownKeys] } }}
      permissionRows={[]}
      coverageDeclarations={[]}
      documentNameEntries={[[DOC_ID, "IAD1 Credit Agreement"]]}
      facilitiesQuery={facilitiesQuery}
      maturitiesQuery={maturitiesQuery}
    />,
  );
}

function slotHtml(html: string, slot: "maturities" | "facilities"): string {
  const marker = `data-slot="${slot}"`;
  const start = html.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  const next = html.indexOf('data-slot="', start + marker.length);
  return html.slice(start, next === -1 ? undefined : next);
}

const loadedFacility = {
  name: "IAD1 Fixture Notes",
  secured: false,
  documentName: "IAD1 Credit Agreement",
  amount: 400,
};

const populatedMaturities: MaturitiesQuery = {
  outcome: "populated",
  nextMaturityLabel: "IAD1 Fixture Notes",
  nextMaturityDate: "2030-06-15",
  nextMaturityAmount: 400,
  dueWithin12: 0,
  dueWithin24: 0,
  dueWithin36: 0,
};

const emptyMaturities: MaturitiesQuery = {
  outcome: "empty",
  dueWithin12: 0,
  dueWithin24: 0,
  dueWithin36: 0,
};

function capacityRow(used: number | null, usageState: "TRACKED" | "NOT_TRACKED"): OverviewRow {
  return {
    kind: "CAPACITY",
    stableKey: `cap-${usageState}-${String(used)}`,
    name: "General debt basket",
    documentName: "Credit Agreement",
    sectionRef: "§4.01",
    formulaDisplay: "Flat amount",
    currentCapacity: 100,
    capacityUnlimited: false,
    usageState,
    used,
    remaining: used === null ? 100 : 100 - used,
    utilizationPct: null,
    bindingState: "AVAILABLE",
    status: "MODELED",
    reviewState: "NOT_TRACKED",
    entityScope: [],
    tier: "PRIMARY",
  };
}

function renderCapacity(row: OverviewRow): string {
  const family: CovenantFamilySection = {
    family: "INDEBTEDNESS",
    coverageState: "MODELED_AND_EVALUABLE",
    counts: { modeled: 1, reviewRequired: 0, unmodeled: 0 },
    rows: [row],
    advisoryNotes: [],
  };
  return renderToStaticMarkup(<CovenantFamiliesView families={[family]} />);
}

describe("capacity used caption — null is not $0", () => {
  it("TRACKED with null used does not paint $0 used", () => {
    const caption = capacityUsedCaption({ usageState: "TRACKED", used: null, currentCapacity: 100 });
    expect(caption).toBe("$100M capacity — usage not tracked");
    expect(caption).not.toMatch(/\$0M used/);
    expect(presentedCapacityUsedCaption({ usageState: "TRACKED", used: null, currentCapacity: 100 }).kind).toBe("UNKNOWN");
  });

  it("undefined used and a missing usage state fail closed", () => {
    expect(capacityUsedCaption({ usageState: "TRACKED", used: undefined, currentCapacity: 80 })).not.toMatch(/\$0M used/);
    expect(capacityUsedCaption({ used: null, currentCapacity: 80 })).toContain("usage not tracked");
    expect(capacityUsedCaption({ usageState: "NOT_TRACKED", used: null, currentCapacity: 80 })).toBe("$80M capacity — usage not tracked");
  });

  it("a finite tracked zero is VERIFIED_TRACKED, not an invented null coalesce", () => {
    const presented = presentedCapacityUsedCaption({ usageState: "TRACKED", used: 0, currentCapacity: 100 });
    expect(presented.kind).toBe("VERIFIED_TRACKED");
    expect(presented.caption).toBe("$0M used of $100M");
    expect(capacityUsedCaption({ usageState: "TRACKED", used: 12, currentCapacity: 100 })).toBe("$12M used of $100M");
  });

  it("a forged VERIFIED_TRACKED token is not authority for $0 used", () => {
    const forged = { kind: "VERIFIED_TRACKED", used: 0, authority: true } as unknown as UsedCaptionState;
    expect(presentUsed(forged).kind).toBe("UNKNOWN");
  });

  it("renders the capacity bar without inventing $0 used", () => {
    const nullUsed = renderCapacity(capacityRow(null, "TRACKED"));
    expect(nullUsed).toContain('data-used-kind="UNKNOWN"');
    expect(nullUsed).toContain("usage not tracked");
    expect(nullUsed).toContain("Not tracked");
    expect(nullUsed).not.toMatch(/\$0M used/);

    const notTracked = renderCapacity(capacityRow(null, "NOT_TRACKED"));
    expect(notTracked).toContain('data-used-kind="NOT_TRACKED"');
    expect(notTracked).not.toMatch(/\$0M used/);

    const trackedZero = renderCapacity(capacityRow(0, "TRACKED"));
    expect(trackedZero).toContain('data-used-kind="VERIFIED_TRACKED"');
    expect(trackedZero).toContain("$0M used of $100M");
  });
});

describe("maturities and facilities — UNKNOWN is not verified empty", () => {
  const absentQueries: { name: string; facilities: FacilitiesQuery; maturities: MaturitiesQuery }[] = [
    { name: "failed", facilities: { outcome: "failed" }, maturities: { outcome: "failed" } },
    { name: "skipped", facilities: { outcome: "skipped" }, maturities: { outcome: "skipped" } },
    { name: "not_loaded", facilities: { outcome: "not_loaded" }, maturities: { outcome: "not_loaded" } },
  ];

  for (const query of absentQueries) {
    it(`${query.name} renders UNKNOWN copy, not verified-empty sentences or $0 windows`, () => {
      const html = renderDashboard(query.facilities, query.maturities);
      const maturities = slotHtml(html, "maturities");
      const facilitiesSlot = slotHtml(html, "facilities");
      const expectedKind = query.name === "not_loaded" ? "NOT_LOADED" : "UNKNOWN";
      expect(maturities).toContain(`data-load-kind="${expectedKind}"`);
      expect(facilitiesSlot).toContain(`data-load-kind="${expectedKind}"`);
      expect(maturities).toContain(DASHBOARD_UNKNOWN.maturities.detail);
      expect(facilitiesSlot).toContain(DASHBOARD_UNKNOWN.facilities.detail);
      expect(maturities).not.toContain(VERIFIED_EMPTY_MATURITIES);
      expect(facilitiesSlot).not.toContain(VERIFIED_EMPTY_FACILITIES);
      expect(maturities).not.toMatch(/\$0M/);
      expect(facilitiesSlot).not.toMatch(/\$0M/);
      expect(facilitiesSlot).not.toContain("IAD1 Fixture Notes");
    });
  }

  it("a kind-only VERIFIED_EMPTY lie does not paint absence", () => {
    const html = renderDashboard(
      { kind: "VERIFIED_EMPTY" } as unknown as FacilitiesQuery,
      { kind: "VERIFIED_EMPTY", dueWithin12: 0, dueWithin24: 0, dueWithin36: 0 } as unknown as MaturitiesQuery,
    );
    expect(slotHtml(html, "maturities")).toContain('data-load-kind="UNKNOWN"');
    expect(slotHtml(html, "facilities")).toContain('data-load-kind="UNKNOWN"');
    expect(html).not.toContain(VERIFIED_EMPTY_MATURITIES);
    expect(html).not.toContain(VERIFIED_EMPTY_FACILITIES);
  });

  it("populated-with-null amount does not become $0 or verified empty", () => {
    const html = renderDashboard(
      { outcome: "populated", facilities: [{ ...loadedFacility, amount: null as unknown as number }] },
      { ...populatedMaturities, nextMaturityAmount: null as unknown as number },
    );
    const maturities = slotHtml(html, "maturities");
    const facilitiesSlot = slotHtml(html, "facilities");
    expect(maturities).toContain('data-load-kind="UNKNOWN"');
    expect(facilitiesSlot).toContain('data-load-kind="UNKNOWN"');
    expect(maturities).not.toContain(VERIFIED_EMPTY_MATURITIES);
    expect(facilitiesSlot).not.toContain(VERIFIED_EMPTY_FACILITIES);
    expect(maturities).not.toMatch(/\$0M/);
    expect(facilitiesSlot).not.toContain("IAD1 Fixture Notes");
  });

  it("empty maturities without authoritative zero dues stay UNKNOWN", () => {
    const html = renderDashboard({ outcome: "empty" }, { outcome: "empty" } as MaturitiesQuery);
    expect(slotHtml(html, "maturities")).toContain('data-load-kind="UNKNOWN"');
    expect(slotHtml(html, "maturities")).not.toContain(VERIFIED_EMPTY_MATURITIES);
    expect(slotHtml(html, "maturities")).not.toMatch(/\$0M/);
    expect(slotHtml(html, "facilities")).toContain('data-load-kind="VERIFIED_EMPTY"');
    expect(slotHtml(html, "facilities")).toContain(VERIFIED_EMPTY_FACILITIES);
  });

  it("non-zero dues labelled empty do not claim no dated maturities", () => {
    const state = maturitiesStateFromQuery({ outcome: "empty", dueWithin12: 10, dueWithin24: 0, dueWithin36: 0 });
    expect(state.kind).toBe("UNKNOWN");
    const html = renderDashboard({ outcome: "failed" }, { outcome: "empty", dueWithin12: 10, dueWithin24: 0, dueWithin36: 0 });
    expect(slotHtml(html, "maturities")).not.toContain(VERIFIED_EMPTY_MATURITIES);
  });

  it("authoritative empty and populated still render", () => {
    const emptyHtml = renderDashboard({ outcome: "empty" }, emptyMaturities);
    expect(slotHtml(emptyHtml, "maturities")).toContain('data-load-kind="VERIFIED_EMPTY"');
    expect(slotHtml(emptyHtml, "maturities")).toContain(VERIFIED_EMPTY_MATURITIES);
    expect(slotHtml(emptyHtml, "maturities")).toContain("$0M");
    expect(slotHtml(emptyHtml, "facilities")).toContain(VERIFIED_EMPTY_FACILITIES);

    const populatedHtml = renderDashboard({ outcome: "populated", facilities: [loadedFacility] }, populatedMaturities);
    expect(slotHtml(populatedHtml, "facilities")).toContain('data-load-kind="VERIFIED_POPULATED"');
    expect(slotHtml(populatedHtml, "facilities")).toContain("IAD1 Fixture Notes");
    expect(slotHtml(populatedHtml, "facilities")).toContain("$400M");
    expect(slotHtml(populatedHtml, "facilities")).not.toContain(VERIFIED_EMPTY_FACILITIES);
    expect(slotHtml(populatedHtml, "maturities")).toContain("2030-06-15");
    expect(slotHtml(populatedHtml, "maturities")).not.toContain(VERIFIED_EMPTY_MATURITIES);
  });
});

describe("present* rejects forged and cross-slot authority", () => {
  it("facilities EMPTY token does not authorize maturities VERIFIED_EMPTY", () => {
    const facilitiesEmpty = facilitiesStateFromQuery({ outcome: "empty" });
    expect(facilitiesEmpty.kind).toBe("VERIFIED_EMPTY");
    if (facilitiesEmpty.kind !== "VERIFIED_EMPTY") return;
    const transplanted = {
      kind: "VERIFIED_EMPTY",
      authority: facilitiesEmpty.authority,
      dueWithin12: 0,
      dueWithin24: 0,
      dueWithin36: 0,
    } as unknown as MaturitiesLoadState;
    expect(presentMaturities(transplanted).kind).toBe("UNKNOWN");
    expect(resolveDashboardCopy("maturities", transplanted).detail).toBe(DASHBOARD_UNKNOWN.maturities.detail);
    expect(resolveDashboardCopy("facilities", facilitiesEmpty).detail).toBe(DASHBOARD_VERIFIED_EMPTY.facilities.detail);
  });

  it("a populated facilities token relabelled VERIFIED_EMPTY does not invent absence", () => {
    const populated = facilitiesStateFromQuery({ outcome: "populated", facilities: [loadedFacility] });
    expect(populated.kind).toBe("VERIFIED_POPULATED");
    if (populated.kind !== "VERIFIED_POPULATED") return;
    const relabelled = { kind: "VERIFIED_EMPTY", authority: populated.authority } as unknown as FacilitiesLoadState;
    expect(presentFacilities(relabelled).kind).toBe("UNKNOWN");
    expect(resolveDashboardCopy("facilities", relabelled).detail).not.toBe(VERIFIED_EMPTY_FACILITIES);
  });

  it("boolean authority and an empty populated list are not verified empty", () => {
    const forged = { kind: "VERIFIED_EMPTY", authority: true, authoritativeEmpty: true } as unknown as FacilitiesLoadState;
    expect(presentFacilities(forged).kind).toBe("UNKNOWN");
    expect(facilitiesStateFromQuery({ outcome: "populated", facilities: [] }).kind).toBe("UNKNOWN");
    expect(maturitiesStateFromQuery({ outcome: "not_loaded" }).kind).toBe("NOT_LOADED");
    expect(maturitiesStateFromQuery({ outcome: "failed" }).kind).toBe("UNKNOWN");
    expect(resolveDashboardCopy("maturities", { kind: "NOT_LOADED" }).detail).toBe(DASHBOARD_UNKNOWN.maturities.detail);
    expect(resolveDashboardCopy("facilities", { kind: "UNKNOWN" }).detail).toBe(DASHBOARD_UNKNOWN.facilities.detail);
  });
});

describe("successful financial-position load is the only page mint path", () => {
  it("maps a loaded position into query outcomes without coercing null used", () => {
    const names = new Map([[DOC_ID, "IAD1 Credit Agreement"]]);
    const facilitiesQuery = facilitiesQueryFromPosition(financialPosition, names);
    expect(facilitiesQuery.outcome).toBe("populated");
    if (facilitiesQuery.outcome !== "populated") return;
    expect(facilitiesQuery.facilities[0]?.name).toBe("IAD1 Fixture Notes");
    expect(facilitiesQuery.facilities[0]?.amount).toBe(400);

    const maturitiesQuery = maturitiesQueryFromPosition(financialPosition);
    expect(maturitiesQuery.outcome).toBe("populated");
    if (maturitiesQuery.outcome !== "populated") return;
    expect(maturitiesQuery.nextMaturityLabel).toBe("IAD1 Fixture Notes");
    expect(maturitiesQuery.nextMaturityAmount).toBe(400);
  });

  it("an empty loaded facility list is outcome empty, and a position with no next maturity is outcome empty", () => {
    const bare = getFinancialPosition(financialState, [], [], AS_OF, []);
    expect(facilitiesQueryFromPosition(bare, new Map()).outcome).toBe("empty");
    const maturitiesQuery = maturitiesQueryFromPosition(bare);
    expect(maturitiesQuery.outcome).toBe("empty");
    if (maturitiesQuery.outcome !== "empty") return;
    expect(maturitiesStateFromQuery(maturitiesQuery).kind).toBe("VERIFIED_EMPTY");
  });
});

describe("source bindings", () => {
  it("CapacityBar no longer coalesces used to 0", () => {
    const source = readFileSync(path.join(ROOT, "components/CovenantOverview.tsx"), "utf8");
    expect(source).not.toContain("used ?? 0");
    expect(source).not.toMatch(/\?\?\s*0/);
    expect(source).toContain("presentedCapacityUsedCaption");
  });

  it("verified-empty sentences live only on the verified-empty copy table", () => {
    const client = readFileSync(path.join(ROOT, "components/DashboardClient.tsx"), "utf8");
    const page = readFileSync(path.join(ROOT, "app/[companyId]/dashboard/page.tsx"), "utf8");
    const copy = readFileSync(path.join(ROOT, "lib/dashboard/copy.ts"), "utf8");
    const loadState = readFileSync(path.join(ROOT, "lib/dashboard/load-state.ts"), "utf8");
    for (const phrase of [VERIFIED_EMPTY_MATURITIES, VERIFIED_EMPTY_FACILITIES]) {
      expect(client).not.toContain(phrase);
      expect(page).not.toContain(phrase);
      expect(loadState).not.toContain(phrase);
    }
    expect(copy).toContain(VERIFIED_EMPTY_MATURITIES);
    expect(copy).toContain(VERIFIED_EMPTY_FACILITIES);
    const unknownBlock = copy.slice(copy.indexOf("export const DASHBOARD_UNKNOWN"), copy.indexOf("export const DASHBOARD_VERIFIED_EMPTY"));
    expect(unknownBlock).not.toContain(VERIFIED_EMPTY_MATURITIES);
    expect(unknownBlock).not.toContain(VERIFIED_EMPTY_FACILITIES);
    expect(copy).toContain("9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04");
    expect(copy).toContain("UNKNOWN ≠ VERIFIED_EMPTY");
    expect(copy).toContain("IMPLEMENTED ≠ CERTIFIED");
  });

  it("the dashboard page mints queries only after the overview load returns, and does not touch Simulate seeds", () => {
    const page = readFileSync(path.join(ROOT, "app/[companyId]/dashboard/page.tsx"), "utf8");
    const loadAt = page.indexOf("await loadCovenantOverviewInputs");
    const facilitiesAt = page.indexOf("facilitiesQueryFromPosition(financialPosition");
    const maturitiesAt = page.indexOf("maturitiesQueryFromPosition(financialPosition");
    expect(loadAt).toBeGreaterThan(-1);
    expect(facilitiesAt).toBeGreaterThan(loadAt);
    expect(maturitiesAt).toBeGreaterThan(loadAt);
    expect(page).not.toContain("emptyCovenantData");
    expect(page).not.toContain("used ?? 0");

    const loadState = readFileSync(path.join(ROOT, "lib/dashboard/load-state.ts"), "utf8");
    expect(loadState).not.toContain("emptyCovenantData");
    expect(loadState).not.toContain("loadCovenantDataOrEmpty");
    expect(loadState).not.toContain("covenant-overview-service");
    expect(loadState).not.toContain("lib/feeds");
    expect(loadState).not.toContain("01-pin-matrix");
  });
});
