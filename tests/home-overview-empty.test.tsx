/**
 * Chunk A′ overview skeleton: Product LOCK empties, Ask refuses, no mock figures.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AskShell } from "../components/ask/AskShell";
import { CompanyOverview } from "../components/home/Overview";
import { CompanyIdentityCard } from "../components/home/CompanyIdentityCard";
import { ToolsIndex } from "../components/home/ToolsIndex";
import { HOME_GREETING_NAMED_TAIL, HOME_GREETING_NO_NAME, HOME_SLOTS, overviewGreeting } from "../lib/home/copy";
import { companyNavItems, companyOpenHref, isCompanyNavItemActive } from "../lib/home/nav";
import { ASK_CASES } from "../lib/ask/copy";
import * as askRunner from "../lib/ask/shell-runner";

const REGIONS = [
  "total-headroom",
  "utilization",
  "covenants-at-risk",
  "next-test",
  "headroom-over-time",
  "capacity-summary",
  "headroom-status",
  "drivers",
  "alerts",
  "transactions",
] as const;

describe("Product LOCK empty overview", () => {
  it("renders every region with the locked headline and detail, and no bell badge", () => {
    const html = renderToStaticMarkup(<CompanyOverview companyId="co" identityName={null} alertCount={0} />);
    expect(html).toContain(HOME_GREETING_NO_NAME);
    expect(html).not.toContain("Good morning");
    for (const region of REGIONS) {
      expect(html).toContain(`data-region="${region}"`);
    }
    for (const slot of Object.values(HOME_SLOTS)) {
      expect(html).toContain(slot.headline);
      expect(html).toContain(slot.detail);
    }
    expect(html).toContain('href="/co/ask"');
    expect(html).toContain(ASK_CASES.NOT_AVAILABLE_ON_DEAL.headline);
    expect(html).not.toContain("data-alert-badge");
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain("$");
    expect(html).not.toContain("%");
    expect(html).not.toMatch(/\d+\.\d+x/);
    expect(html).toContain('title="Nothing to export yet"');
    expect(html).toContain("disabled");
  });

  it("paints buyer details only and keeps implementer rules off the cards", () => {
    expect(HOME_SLOTS.covenantsAtRisk.detail).toBe("None to show yet.");
    expect(HOME_SLOTS.statusTable.detail).toBe("Status stays blank until we have real rows.");
    expect(HOME_SLOTS.alerts.detail).toBe("Nothing to flag yet.");
    expect(HOME_SLOTS.capacitySummary.detail).toBe("No facility split until figures are tied to sources.");
    expect(HOME_SLOTS.transactions.detail).toBe("Nothing on the ledger yet.");
    expect(HOME_SLOTS.drivers.detail).toBe("Drivers need explained capacity changes — not guesses.");

    const html = renderToStaticMarkup(<CompanyOverview companyId="co" identityName={null} alertCount={0} />);
    // Implementer rules stay here, not in buyer details: never seed a count; do not invent a
    // review count; never default a Healthy/green row; hide the bell badge when the count is 0;
    // capacity figures stay tied to sources in the data path, not in the card sentence.
    const implementerPhrases = [
      "Never seed a count",
      "REVIEW_REQUIRED",
      "Never default Healthy",
      "hide bell badge",
      "provenance-bound",
      "Ledger-backed only",
      "fail-closed",
      "If REVIEW_REQUIRED",
    ];
    const buyerDetails = Object.values(HOME_SLOTS).map((slot) => slot.detail).join("\n");
    for (const phrase of implementerPhrases) {
      expect(buyerDetails, phrase).not.toContain(phrase);
      expect(html, phrase).not.toContain(phrase);
    }
    expect(html).not.toContain("data-alert-badge");
  });

  it("names a real identity and refuses the mockup person and company", () => {
    expect(overviewGreeting(null)).toEqual({ heading: HOME_GREETING_NO_NAME, subheading: null });
    expect(overviewGreeting("Ada Lovelace")).toEqual({
      heading: "Good morning, Ada Lovelace.",
      subheading: HOME_GREETING_NAMED_TAIL,
    });
    const fictionalPerson = ["John", " Davis"].join("");
    const fictionalCompany = ["Apex", " Manufacturing"].join("");
    expect(overviewGreeting(fictionalPerson).heading).toBe(HOME_GREETING_NO_NAME);
    expect(overviewGreeting(fictionalCompany).heading).toBe(HOME_GREETING_NO_NAME);
    const html = renderToStaticMarkup(<CompanyOverview companyId="co" identityName={fictionalPerson} />);
    expect(html).not.toContain(fictionalPerson);
    expect(html).toContain(HOME_GREETING_NO_NAME);
  });

  it("shows the database company name on the identity card", () => {
    const html = renderToStaticMarkup(<CompanyIdentityCard name="Example Holdings" ticker="EXH" />);
    expect(html).toContain("Example Holdings");
    expect(html).toContain("EXH");
    expect(html).toContain('data-company-card');
  });
});

describe("routes", () => {
  it("opens an ACTIVE company on the overview and keeps onboarding on the wizard", () => {
    expect(companyOpenHref({ id: "co", onboardingStatus: "ACTIVE" })).toBe("/co");
    expect(companyOpenHref({ id: "co", onboardingStatus: "ACTIVE_WITH_LIMITATIONS" })).toBe("/co");
    expect(companyOpenHref({ id: "co", onboardingStatus: "ONBOARDING" })).toBe("/co/onboarding");
  });

  it("nav is Home, Ask, and Deal setup & tools, with onboarding only while setup remains", () => {
    expect(companyNavItems("co", "ACTIVE").map((item) => item.label)).toEqual(["Home", "Ask", "Deal setup & tools"]);
    expect(companyNavItems("co", "ONBOARDING").map((item) => item.label)).toContain("Onboarding");
    const tools = companyNavItems("co", "ACTIVE").find((item) => item.key === "tools")!;
    expect(isCompanyNavItemActive("/co", companyNavItems("co", "ACTIVE")[0]!, "co")).toBe(true);
    expect(isCompanyNavItemActive("/co/dashboard", tools, "co")).toBe(true);
    expect(isCompanyNavItemActive("/co/ask", tools, "co")).toBe(false);
    expect(isCompanyNavItemActive("/co/dashboard", companyNavItems("co", "ACTIVE")[0]!, "co")).toBe(false);
  });

  it("links legacy pages from Deal setup & tools", () => {
    const html = renderToStaticMarkup(<ToolsIndex companyId="co" onboardingStatus="ACTIVE" />);
    expect(html).toContain("Deal setup &amp; tools");
    for (const segment of ["dashboard", "simulate", "feeds", "docs", "ledger"]) {
      expect(html).toContain(`href="/co/${segment}"`);
    }
    expect(html).not.toContain("/co/onboarding");
    const onboarding = renderToStaticMarkup(<ToolsIndex companyId="co" onboardingStatus="ONBOARDING" />);
    expect(onboarding).toContain('href="/co/onboarding"');
  });
});

describe("Ask shell", () => {
  it("has no answer export, and a question is refused rather than classified unsupported", () => {
    expect(Object.keys(askRunner).sort()).toEqual(["askEmpty", "refuseAsk", "resolveAskShell"]);
    expect(askRunner.resolveAskShell({ companyId: "co" }).caseId).toBe("NOT_AVAILABLE_ON_DEAL");
    expect(askRunner.resolveAskShell({ companyId: "  " }).caseId).toBe("NO_COMPANY");
    expect(askRunner.resolveAskShell({ companyId: null }).caseId).toBe("NO_COMPANY");

    const first = askRunner.refuseAsk({ companyId: "co", question: "How much can we incur?" });
    const second = askRunner.refuseAsk({ companyId: "co", question: "anything else" });
    expect(first).toEqual(second);
    expect(first.kind).toBe("empty");
    expect(first.caseId).toBe("REFUSE_NOT_INVENT");
    expect(first.headline).toBe(ASK_CASES.REFUSE_NOT_INVENT.headline);
    expect(JSON.stringify(first)).not.toContain("How much");
    expect(askRunner.refuseAsk({ companyId: "", question: "hello" }).caseId).toBe("NO_COMPANY");

    const askHtml = renderToStaticMarkup(<AskShell companyId="co" initial={askRunner.resolveAskShell({ companyId: "co" })} />);
    expect(askHtml).toContain("Ask isn’t available on this deal yet");
    expect(askHtml).not.toContain("Interrogation");
    expect(askHtml).not.toContain("Secondary to the overview");
    expect(askHtml).toContain("<button");
    expect(askHtml).toMatch(/<button[^>]*disabled[^>]*>Submit question<\/button>/);

    for (const caseId of Object.keys(ASK_CASES) as (keyof typeof ASK_CASES)[]) {
      const view = askRunner.askEmpty(caseId);
      expect(view.headline).toBe(ASK_CASES[caseId].headline);
      expect(view.detail).toBe(ASK_CASES[caseId].detail);
      expect(view.kind).toBe("empty");
    }
  });
});

describe("banned mockup fiction", () => {
  it("is absent from the Chunk A′ sources", () => {
    const banned = [
      "$" + "245.6M",
      "75.4" + "%",
      "$" + "754.4M",
      "$" + "1.0B",
      "+$" + "68.7M",
      "+$" + "42.3M",
      "+$" + "31.2M",
      "Jun 30, " + "2025",
      "Jun 30 " + "2025",
      ["Apex", " Manufacturing"].join(""),
      ["John", " Davis"].join(""),
      "Good morning, " + "John",
      ["Ask", " ready"].join(""),
      "demoable",
      ["CFO-", "ready"].join(""),
      ["never-", "breach"].join(""),
      "Revolving Credit Facility",
      "Term Loan A",
      "Term Loan B",
    ];
    const files = sourceFiles([
      "lib/home",
      "lib/ask",
      "components/home",
      "components/ask",
      "components/CompanyNav.tsx",
      "app/[companyId]/page.tsx",
      "app/[companyId]/layout.tsx",
      "app/[companyId]/ask",
      "app/[companyId]/tools",
      "app/home-shell.css",
      "app/page.tsx",
      "docs/architecture/APPLE-SEAMLESSNESS-CUT.md",
    ]);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const phrase of banned) {
        expect(text, `${file} contains ${phrase}`).not.toContain(phrase);
      }
    }
  });
});

function sourceFiles(entries: string[]): string[] {
  const root = path.resolve(__dirname, "..");
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(root, entry);
    collect(full, out);
  }
  return out;
}

function collect(full: string, out: string[]) {
  const stat = statSync(full);
  if (stat.isDirectory()) {
    for (const name of readdirSync(full)) collect(path.join(full, name), out);
    return;
  }
  out.push(full);
}
