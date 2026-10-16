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
    expect(source("app/globals.css")).toContain("--paper: #f6f3ec");
    expect(source("app/globals.css")).not.toContain("sample-brand");
    expect(source("app/home-shell.css")).toContain("--shell-sidebar: #1c2838");
    expect(source("app/globals.css")).toContain("--accent: #1c2838");
    expect(source("app/globals.css")).toContain("--green: #0e6b43");
    expect(source("app/home-shell.css")).not.toContain("sample-brand");
    for (const rel of ["app/page.tsx", "app/[companyId]/page.tsx", "app/[companyId]/covenants/page.tsx", "app/[companyId]/capacity/page.tsx"]) {
      expect(source(rel)).not.toContain("dev/sample");
      expect(source(rel)).not.toContain("SAMPLE DATA");
    }
  });
});
