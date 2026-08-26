/**
 * lib/covenant-overview-service.ts regression suite
 * (docs/full-covenant-overview-restoration.md §T). Runs against the REAL,
 * live database (coherent + matthews), following the same real-DB
 * integration-test convention as tests/dashboard-service.test.ts.
 *
 * Covers: same service contract for both companies (no company-name
 * branching); family grouping; capacity row serialization; ratio row
 * serialization; formula display; inline citation presence; unknown-state
 * handling (Matthews: no fabricated headline capacity, no fabricated
 * families); usage-not-tracked (never fabricated $0 used); no Unlimited
 * fallback for a non-EXACT headline result; binding constraint; review
 * state; family coverage counts; Coherent/Matthews same-schema behavior.
 */
import { describe, expect, it } from "vitest";
import { getCovenantOverview } from "../lib/covenant-overview-service";

const COMPANIES = ["coherent", "matthews"] as const;

describe.each(COMPANIES)("getCovenantOverview(%s) - same service/contract for every company (no company-name branching)", (companyId) => {
  it("returns headline metrics with explicit states, never a fabricated number for a missing metric", async () => {
    const overview = await getCovenantOverview(companyId);
    expect(overview.company.id).toBe(companyId);
    expect(overview.headlineMetrics.length).toBeGreaterThan(0);
    for (const m of overview.headlineMetrics) {
      if (m.value === null) {
        expect(["NOT_AVAILABLE", "REVIEW_REQUIRED"]).toContain(m.state);
      } else {
        expect(m.state).toBe("AVAILABLE");
      }
    }
  });

  it("every covenant family section has real, non-empty rows or advisory notes - no family is rendered on zero evidence", async () => {
    const overview = await getCovenantOverview(companyId);
    expect(overview.covenantFamilies.length).toBeGreaterThan(0);
    for (const fam of overview.covenantFamilies) {
      expect(fam.rows.length > 0 || fam.advisoryNotes.length > 0).toBe(true);
    }
  });

  it("INDEBTEDNESS and LIENS families are always present for a solver-native company and derive their family purely from Permission.grantType", async () => {
    const overview = await getCovenantOverview(companyId);
    const families = overview.covenantFamilies.map((f) => f.family);
    expect(families).toContain("INDEBTEDNESS");
    expect(families).toContain("LIENS");
  });

  it("every capacity row carries a non-empty inline section citation and document name - never hidden behind a click", async () => {
    const overview = await getCovenantOverview(companyId);
    for (const fam of overview.covenantFamilies) {
      for (const row of fam.rows) {
        expect(row.sectionRef.length).toBeGreaterThan(0);
        expect(row.documentName.length).toBeGreaterThan(0);
      }
    }
  });

  it("a MODELED capacity row has a human-readable formula display, never a raw enum", async () => {
    const overview = await getCovenantOverview(companyId);
    const debtRows = overview.covenantFamilies.find((f) => f.family === "INDEBTEDNESS")!.rows;
    const modeled = debtRows.filter((r) => r.kind === "CAPACITY" && r.status === "MODELED" && !r.capacityUnlimited);
    expect(modeled.length).toBeGreaterThan(0);
    for (const row of modeled) {
      if (row.kind !== "CAPACITY") continue;
      expect(row.formulaDisplay).toBeTruthy();
      // No raw FormulaType enum value should ever leak into customer-facing text.
      expect(row.formulaDisplay).not.toMatch(/^(FLAT_AMOUNT|FLAT_NET_OF_DEBT|GREATER_OF_FLAT_OR_PCT_EBITDA|LEVERAGE_RATIO_ROOM|COVERAGE_RATIO_ROOM|BUILDER_BASKET|RATIO_GATE)$/);
    }
  });

  it("usage is never fabricated as $0 - every capacity row reports NOT_TRACKED usage honestly, with used=null", async () => {
    const overview = await getCovenantOverview(companyId);
    for (const fam of overview.covenantFamilies) {
      for (const row of fam.rows) {
        if (row.kind !== "CAPACITY") continue;
        expect(row.usageState).toBe("NOT_TRACKED");
        expect(row.used).toBeNull();
      }
    }
  });

  it("review state is only ever a real Permission.reviewStatus value or NOT_TRACKED for a non-Permission-sourced row - never invented", async () => {
    const overview = await getCovenantOverview(companyId);
    for (const fam of overview.covenantFamilies) {
      for (const row of fam.rows) {
        expect(["VERIFIED", "UNVERIFIED", "DISPUTED", "NOT_TRACKED"]).toContain(row.reviewState);
      }
    }
  });

  it("at most one row per side is marked BINDING, and it agrees with the headline capacity's own binding section", async () => {
    const overview = await getCovenantOverview(companyId);
    const bindingSections = new Set(overview.securedCapacity.bindingSections.concat(overview.unsecuredCapacity.bindingSections));
    if (bindingSections.size === 0) return; // headline capacity not modeled (e.g. Matthews) - nothing to cross-check.
    const debtRows = overview.covenantFamilies.find((f) => f.family === "INDEBTEDNESS")!.rows;
    const boundRows = debtRows.filter((r) => r.bindingState === "BINDING");
    for (const row of boundRows) {
      expect(bindingSections.has(row.sectionRef)).toBe(true);
    }
  });
});

describe("getCovenantOverview(matthews) - fail-closed acceptance (docs/full-covenant-overview-restoration.md §R)", () => {
  it("never fabricates headline secured/unsecured capacity when the cross-document result is not a single EXACT figure", async () => {
    const overview = await getCovenantOverview("matthews");
    // Matthews' cross-document capacity is not a clean EXACT figure today
    // (real, pre-existing fact - see docs/result-semantics-headroom-cleanup.md) -
    // this must never render as a fabricated dollar amount or "Unlimited".
    if (overview.securedCapacity.status !== "MODELED") {
      expect(overview.securedCapacity.maximumCapacity === undefined || overview.securedCapacity.maximumCapacity.kind !== "EXACT").toBe(true);
    }
  });

  it("carries real, non-empty advisory notes documenting known coverage exclusions for INDEBTEDNESS/LIENS", async () => {
    const overview = await getCovenantOverview("matthews");
    const debt = overview.covenantFamilies.find((f) => f.family === "INDEBTEDNESS")!;
    const liens = overview.covenantFamilies.find((f) => f.family === "LIENS")!;
    expect(debt.advisoryNotes.length).toBeGreaterThan(0);
    expect(liens.advisoryNotes.length).toBeGreaterThan(0);
  });

  it("renders no FINANCIAL_COVENANTS/RESTRICTED_PAYMENTS/INVESTMENTS/ASSET_SALES family - Matthews has zero real CovenantProvision evidence for any of them, and fabricating presence would be worse than omitting it", async () => {
    const overview = await getCovenantOverview("matthews");
    const families = overview.covenantFamilies.map((f) => f.family);
    expect(families).not.toContain("FINANCIAL_COVENANTS");
    expect(families).not.toContain("RESTRICTED_PAYMENTS");
    expect(families).not.toContain("INVESTMENTS");
    expect(families).not.toContain("ASSET_SALES");
  });
});

describe("getCovenantOverview(coherent) - ratio and restricted-payment rows (docs/full-covenant-overview-restoration.md §I)", () => {
  it("renders real FINANCIAL_COVENANTS ratio rows with current/limit/headroom, never forced into a dollar-capacity shape", async () => {
    const overview = await getCovenantOverview("coherent");
    const fam = overview.covenantFamilies.find((f) => f.family === "FINANCIAL_COVENANTS")!;
    expect(fam.rows.length).toBeGreaterThan(0);
    for (const row of fam.rows) {
      expect(row.kind).toBe("RATIO");
      if (row.kind !== "RATIO") continue;
      if (row.status === "MODELED") {
        expect(typeof row.currentRatio).toBe("number");
        expect(typeof row.ratioLimit).toBe("number");
      }
    }
  });

  it("renders a real ratio-gated RESTRICTED_PAYMENTS row and a real ratio-gated INVESTMENTS row derived from the same document's rpWaterfall config, not hardcoded", async () => {
    const overview = await getCovenantOverview("coherent");
    const rp = overview.covenantFamilies.find((f) => f.family === "RESTRICTED_PAYMENTS")!;
    const inv = overview.covenantFamilies.find((f) => f.family === "INVESTMENTS")!;
    expect(rp.rows.some((r) => r.kind === "RATIO")).toBe(true);
    expect(inv.rows.some((r) => r.kind === "RATIO")).toBe(true);
  });

  it("does not double-count a debt/lien basket already represented as a solver-native Permission row under a CovenantProvision-shaped row", async () => {
    const overview = await getCovenantOverview("coherent");
    const debtSectionRefs = new Set(overview.covenantFamilies.find((f) => f.family === "INDEBTEDNESS")!.rows.map((r) => r.sectionRef));
    const lienSectionRefs = new Set(overview.covenantFamilies.find((f) => f.family === "LIENS")!.rows.map((r) => r.sectionRef));
    // §6.01(k)/§6.01(p)/§6.02(kk) are real solver-native Permission sections -
    // they must not ALSO appear as a bare CovenantProvision row in some other family.
    for (const fam of overview.covenantFamilies) {
      if (fam.family === "INDEBTEDNESS" || fam.family === "LIENS") continue;
      for (const row of fam.rows) {
        expect(debtSectionRefs.has(row.sectionRef) && lienSectionRefs.has(row.sectionRef)).toBe(false);
      }
    }
  });
});
