/**
 * Home financial dashboard — mockup overview layout + real engine figures.
 *
 * Verifies app/[companyId]/page.tsx loads CompanyOverview via loadCompanyOverview,
 * and that the loader surfaces contractual ratios / capacity from uploaded data.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { computeLeverageMetrics } from "../lib/covenant-engine";
import { getCovenantOverview, loadCovenantOverviewInputs } from "../lib/covenant-overview-service";
import { loadCompanyOverview } from "../lib/home/load-overview";
import { presentFigure, presentRisk, presentStatus } from "../lib/home/load-state";

const ROOT = path.resolve(__dirname, "..");

describe("company home page uses mockup overview shell", () => {
  it("page.tsx loads CompanyOverview via loadCompanyOverview (no demo hardcodes)", () => {
    const page = readFileSync(path.join(ROOT, "app/[companyId]/page.tsx"), "utf8");
    expect(page).toContain("loadCompanyOverview");
    expect(page).toContain("CompanyOverview");
    expect(page).not.toContain("DashboardClient");
    expect(page).not.toMatch(/\$245\.6M|75\.4%|Apex Manufacturing|Good morning, John/i);
  });
});

describe.each(["coherent", "matthews"] as const)("home overview figures — %s", (companyId) => {
  it("populates total headroom and status from covenant engines", async () => {
    const bundle = await loadCompanyOverview(companyId);
    const inputs = await loadCovenantOverviewInputs(companyId);
    const metrics = computeLeverageMetrics(inputs.covenantData.financials);

    expect(inputs.covenantData.financials.ebitda).toBeGreaterThan(0);
    expect(metrics.totalNetLeverage).toBeGreaterThan(0);

    const headroom = presentFigure(bundle.load.totalHeadroom, "totalHeadroom");
    // Coherent has modeled secured capacity; Matthews may not — never invent $0.
    if (headroom.kind === "VERIFIED_POPULATED") {
      expect(headroom.display).toMatch(/^\$[\d,]+M$/);
      expect(headroom.display).not.toMatch(/^\$0/);
    }

    const status = presentStatus(bundle.load.statusTable);
    if (status.kind === "VERIFIED_POPULATED") {
      expect(status.rows.length).toBeGreaterThan(0);
      for (const row of status.rows) {
        expect(row.covenant.length).toBeGreaterThan(0);
        expect(row.facility.length).toBeGreaterThan(0);
        expect(["Healthy", "Moderate", "At Risk", "Needs review", "Not determinable"]).toContain(row.status);
      }
    }
  });
});

describe("home overview — coherent contractual ratios in status", () => {
  it("surfaces TNL current/limit/headroom in the status table", async () => {
    const overview = await getCovenantOverview("coherent");
    const bundle = await loadCompanyOverview("coherent");
    const status = presentStatus(bundle.load.statusTable);
    expect(status.kind).toBe("VERIFIED_POPULATED");
    if (status.kind !== "VERIFIED_POPULATED") throw new Error("expected status rows");

    const tnl = status.rows.find((r) => /total net leverage/i.test(r.covenant));
    expect(tnl).toBeDefined();
    expect(tnl!.status).toBe("Healthy");
    expect(tnl!.headroom).toMatch(/1\.23x/);
    expect(tnl!.headroom).toMatch(/4\.25x/);
    expect(tnl!.headroom).toMatch(/3\.02x/);

    const headroom = presentFigure(bundle.load.totalHeadroom, "totalHeadroom");
    expect(headroom.kind).toBe("VERIFIED_POPULATED");
    if (headroom.kind === "VERIFIED_POPULATED") {
      expect(headroom.display).toBe("$5,129M");
    }

    expect(overview.securedCapacity.remainingCapacity).toBe(5129);

    const risk = presentRisk(bundle.load.covenantsAtRisk);
    // Coherent maintenance covenants are healthy; risk slot may be empty or list locked baskets.
    expect(["VERIFIED_EMPTY", "VERIFIED_POPULATED"]).toContain(risk.kind);
  });
});
