import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function source(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("dev sample route", () => {
  it("stays out of production and out of the database", () => {
    const page = source("app/dev/sample/page.tsx");
    const fixture = source("app/dev/sample/fixture.ts");
    expect(page).toContain("SAMPLE DATA");
    expect(page).toContain("notFound()");
    expect(page).toMatch(/NODE_ENV === "production"/);
    expect(page + fixture).not.toMatch(/prisma|listCompanies|getCompanyDashboard|@\/lib\/dashboard-service/);
    expect(page).toContain('searchParams.brand === "navy"');
    expect(source("app/dev/sample/brands.css")).toContain('data-brand="olive"');
    expect(source("app/globals.css")).toContain("--paper: #f3f0eb");
    expect(source("app/globals.css")).not.toContain("sample-brand");
    expect(source("app/home-shell.css")).toContain("--shell-sidebar: #2a2c2e");
    expect(source("app/globals.css")).toContain("--accent: #54243c");
    expect(source("app/globals.css")).toMatch(/--viz-1:\s*#2a2c2e/);
    expect(source("app/globals.css")).toMatch(/--viz-5:\s*#54243c/);
    expect(source("app/globals.css")).toContain("--chart-1: var(--viz-1)");
    expect(page).toContain('searchParams.viz === "A"');
    const vizCss = source("app/dev/sample/viz.css");
    const vizTs = source("app/dev/sample/viz.ts");
    for (const id of ["A", "B", "C"]) {
      expect(vizCss).toContain(`[data-viz="${id}"]`);
    }
    for (const hex of ["#588cad", "#9a835d", "#918a85", "#886f89", "#9d7267", "#497e91", "#978d7d", "#608e91", "#926c7d", "#7f766c", "#4e7e8d", "#ae7a67", "#73787c", "#75939e", "#778b7c"]) {
      expect(vizCss).toContain(hex);
      expect(vizTs).toContain(hex);
    }
    expect(source("app/globals.css")).toContain("--green: #0e6b43");
    expect(source("app/home-shell.css")).not.toContain("sample-brand");
    for (const rel of ["app/page.tsx", "app/[companyId]/page.tsx", "app/[companyId]/covenants/page.tsx", "app/[companyId]/capacity/page.tsx"]) {
      expect(source(rel)).not.toContain("dev/sample");
      expect(source(rel)).not.toContain("SAMPLE DATA");
    }
  });
});
