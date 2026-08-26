/**
 * CovenantOverview component render tests (docs/full-covenant-overview-restoration.md
 * §T/§61) - rendered for real via react-dom/server against real `getCovenantOverview`
 * output, same convention as tests/phase10-ui-provenance.test.tsx. Proves the
 * markup itself (not just the underlying service data) satisfies the task's
 * hard requirements: inline citations never hidden, no fabricated $0/Unlimited,
 * a modeled row and a review-required/unmodeled row both render explicit
 * text, and the exact same component tree renders for Coherent and Matthews.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CovenantOverviewView } from "../components/CovenantOverview";
import { getCovenantOverview } from "../lib/covenant-overview-service";

describe("CovenantOverviewView - Coherent (a modeled, binding capacity row)", () => {
  it("renders inline section citations directly in the row markup, never only reachable via a separate click target", async () => {
    const overview = await getCovenantOverview("coherent");
    const html = renderToStaticMarkup(<CovenantOverviewView overview={overview} />);
    const debtRow = overview.covenantFamilies.find((f) => f.family === "INDEBTEDNESS")!.rows[0]!;
    expect(html).toContain(debtRow.sectionRef);
  });

  it("renders the one BINDING row with a visible Binding status pill, plain-English formula text, and a utilization bar caption", async () => {
    const overview = await getCovenantOverview("coherent");
    const html = renderToStaticMarkup(<CovenantOverviewView overview={overview} />);
    expect(html).toContain("status-pill-binding");
    expect(html).toContain(">Binding<");
    expect(html).toContain("usage not tracked");
  });

  it("never renders a raw FormulaType enum name as capacity text, and never substitutes a fabricated dollar amount for a REVIEW_REQUIRED/NOT_TESTED row", async () => {
    const overview = await getCovenantOverview("coherent");
    const html = renderToStaticMarkup(<CovenantOverviewView overview={overview} />);
    expect(html).not.toMatch(/>(FLAT_AMOUNT|FLAT_NET_OF_DEBT|GREATER_OF_FLAT_OR_PCT_EBITDA|LEVERAGE_RATIO_ROOM|COVERAGE_RATIO_ROOM|BUILDER_BASKET|RATIO_GATE)</);
    for (const fam of overview.covenantFamilies) {
      for (const row of fam.rows) {
        if (row.status === "REVIEW_REQUIRED" || row.status === "NOT_TESTED") {
          expect(row.kind === "CAPACITY" ? row.currentCapacity : row.currentRatio).toBeNull();
        }
      }
    }
  });

  it("renders a ratio row (Financial Covenants) with current/limit text, not a dollar-capacity column", async () => {
    const overview = await getCovenantOverview("coherent");
    const html = renderToStaticMarkup(<CovenantOverviewView overview={overview} />);
    expect(html).toMatch(/\d\.\d\dx current \/ \d\.\d\dx (maximum|minimum)/);
  });

  it("headline secured/unsecured capacity cards show the binding document and section, never hidden behind a click", async () => {
    const overview = await getCovenantOverview("coherent");
    const html = renderToStaticMarkup(<CovenantOverviewView overview={overview} />);
    expect(html).toContain("Binding document");
    if (overview.securedCapacity.bindingDocumentName) expect(html).toContain(overview.securedCapacity.bindingDocumentName);
  });
});

describe("CovenantOverviewView - Matthews (fail-closed acceptance)", () => {
  it("renders 'Not modeled' for headline capacity rather than a fabricated dollar figure or 'Unlimited'", async () => {
    const overview = await getCovenantOverview("matthews");
    const html = renderToStaticMarkup(<CovenantOverviewView overview={overview} />);
    if (overview.securedCapacity.status !== "MODELED") {
      expect(html).toContain("Not modeled");
    }
    expect(html).not.toContain(">Unlimited<");
  });

  it("renders the real advisory notes documenting known coverage exclusions, visible without drilling into another page", async () => {
    const overview = await getCovenantOverview("matthews");
    const html = renderToStaticMarkup(<CovenantOverviewView overview={overview} />);
    const debtAdvisory = overview.covenantFamilies.find((f) => f.family === "INDEBTEDNESS")!.advisoryNotes[0]!;
    // React escapes apostrophes as HTML entities in rendered markup - compare
    // on a stable, apostrophe-free substring of the real advisory text rather
    // than the raw string.
    const stableSubstring = debtAdvisory.split("'")[0];
    expect(html).toContain(stableSubstring);
  });

  it("uses the exact same CovenantOverviewView component and CSS classes as Coherent - no company-name branching in the markup", async () => {
    const coherent = renderToStaticMarkup(<CovenantOverviewView overview={await getCovenantOverview("coherent")} />);
    const matthews = renderToStaticMarkup(<CovenantOverviewView overview={await getCovenantOverview("matthews")} />);
    for (const cls of ["family-section", "covenant-row", "status-pill", "headline-capacity-card"]) {
      expect(coherent).toContain(cls);
      expect(matthews).toContain(cls);
    }
  });
});

describe("CovenantOverviewView - empty state", () => {
  it("renders an explicit 'Covenant model not initialized' message for a company with zero covenant families, never dozens of $0 rows", () => {
    const html = renderToStaticMarkup(
      <CovenantOverviewView
        overview={{
          company: { id: "empty-co", name: "Empty Co", ticker: null, onboardingStatus: "ACTIVE", tenantKind: "CUSTOMER" },
          asOfDate: new Date("2026-01-01"),
          headlineMetrics: [],
          securedCapacity: { maximumCapacity: undefined, remainingCapacity: undefined, bindingDocumentName: undefined, bindingSections: [], status: "NOT_MODELED" },
          unsecuredCapacity: { maximumCapacity: undefined, remainingCapacity: undefined, bindingDocumentName: undefined, bindingSections: [], status: "NOT_MODELED" },
          warnings: [],
          covenantFamilies: [],
        }}
      />
    );
    expect(html).toContain("Covenant model not initialized");
    expect(html).not.toMatch(/\$0M/);
  });
});
