import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SAMPLE_ADD_BACKS, SAMPLE_EBITDA_BASE } from "@/app/dev/sample/ebitda";
import { EbitdaTile } from "@/components/home/EbitdaTile";

const root = path.resolve(__dirname, "../..");

describe("Adjusted EBITDA box", () => {
  it("is one KPI box, with the add-backs kept off the board", () => {
    const html = renderToStaticMarkup(<EbitdaTile base={SAMPLE_EBITDA_BASE} items={SAMPLE_ADD_BACKS} sample />);
    expect(html).toContain("Adjusted EBITDA");
    expect(html).toContain("$150 million");
    expect(html).toContain("4 need you");
    expect(html).toContain('data-region="ebitda"');
    expect(html).not.toContain("ebitda-summary");
    expect(html).not.toContain("ebitda-cards");
    expect(html).not.toContain("Restructuring charges");
  });

  it("lists add-backs in the slide-over, with source, amount, and a need mark", () => {
    const html = renderToStaticMarkup(
      <EbitdaTile base={SAMPLE_EBITDA_BASE} items={SAMPLE_ADD_BACKS} sample initialView="list" />,
    );
    expect(html).toContain("Restructuring charges");
    expect(html).toContain("RestructuringCharges");
    expect(html).toContain("$18,000,000");
    expect(html).toContain("need-dot");
    expect(html).toContain(">Base<");
    expect(html).toContain(">Confirmed<");
    expect(html).toContain(">Available<");
    expect(html).toContain("$150,000,000");
  });

  it("shows Couldn't compute and the last-updated date inside the open slide-over", () => {
    const html = renderToStaticMarkup(
      <EbitdaTile
        base={SAMPLE_EBITDA_BASE}
        items={SAMPLE_ADD_BACKS}
        sample
        initialView="list"
        failedReason="SEC companyfacts 503"
        staleSince="2026-10-16T18:00:00.000Z"
      />,
    );
    expect(html).toMatch(/Couldn(?:'|&#x27;)t compute/);
    expect(html).toContain("SEC companyfacts 503");
    expect(html).toContain("Last updated Oct 16, 2026");
    expect(html).toContain("Retry");
    expect(html).toContain("$150 million");
  });
});

describe("sign in to confirm", () => {
  it("keeps the figure readable and disables confirm when no session handle is present", () => {
    const html = renderToStaticMarkup(
      <EbitdaTile base={SAMPLE_EBITDA_BASE} items={SAMPLE_ADD_BACKS} sample initialView="a" />,
    );
    expect(html).toContain("$18,000,000");
    expect(html).toContain("Sign in to confirm");
    expect(html).toContain("ebitda-signin-button");
    expect(html).toContain("disabled");
    expect(html).not.toContain("ebitda-inline-error");
    expect(html).not.toContain(">Confirm<");
  });
});

describe("dashboard arrangement", () => {
  it("puts Adjusted EBITDA in the KPI row and the reference widgets under it", () => {
    const overview = readFileSync(path.join(root, "components/home/Overview.tsx"), "utf8");
    const sample = readFileSync(path.join(root, "app/dev/sample/dashboard.tsx"), "utf8");
    for (const src of [overview, sample]) {
      const kpis = src.indexOf('className="home-kpis"');
      const split = src.indexOf('className="home-split"', kpis);
      const pair = src.indexOf('className="home-pair"', split);
      expect(kpis).toBeGreaterThan(-1);
      expect(src.slice(kpis, split)).toContain("<EbitdaTile");
      expect(src.slice(split, pair)).not.toContain("<EbitdaTile");
    }
    const board = overview.slice(overview.indexOf('className="home-split"'));
    const order = ["HeadroomOverTimeCard", "CapacitySummaryCard", "StatusTable", "DriversCard", "AlertsCard", "TransactionsCard"];
    let at = -1;
    for (const name of order) {
      const next = board.indexOf(name);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    const sampleBoard = sample.slice(sample.indexOf('className="home-split"'));
    const sampleOrder = ["Headroom over time", "Capacity summary", "Headroom status", "Top headroom drivers", "Recent alerts", "Recent transactions"];
    at = -1;
    for (const name of sampleOrder) {
      const next = sampleBoard.indexOf(name);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
  });
});
