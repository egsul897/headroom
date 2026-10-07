/**
 * IA-1 adversarial suite. Unwired / NOT_LOADED overview must render UNKNOWN copy.
 * Verified-empty copy is reachable only from an authoritative query result.
 * IMPLEMENTED ≠ CERTIFIED.
 *
 * Product LOCK sha256: 9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanyOverview } from "../components/home/Overview";
import { AlertsCard } from "../components/home/AlertsCard";
import { TransactionsCard } from "../components/home/TransactionsCard";
import {
  HOME_SLOTS,
  HOME_VERIFIED_EMPTY,
  OVERVIEW_SLOT_MATRIX,
  resolveBuyerCopy,
} from "../lib/home/copy";
import {
  NOT_LOADED_STATE,
  UNKNOWN_STATE,
  UNWIRED_OVERVIEW_LOAD,
  alertBadgeCount,
  alertStateFromQuery,
  countSlotAlias,
  transactionsStateFromLedger,
  verifiedEmptyList,
  verifiedEmptyRisk,
  verifiedEmptyStatus,
  verifiedNonzeroAlerts,
  verifiedZeroAlerts,
} from "../lib/home/load-state";

const ROOT = path.resolve(__dirname, "..");

const INVENT_ABSENCE = [
  "No alerts",
  "Nothing to flag yet",
  "None to show yet",
  "No upcoming test on file",
  "Nothing on the ledger yet",
  "No covenant rows to show yet",
  "No drivers to show yet",
  "No history to chart yet",
  "Nothing to export yet",
  "None at risk",
  "Healthy",
] as const;

const SUPERSEDED_IN_SOURCE = [
  "Nothing to flag yet",
  "None to show yet",
  "Nothing on the ledger yet",
  "No covenant rows to show yet",
  "No drivers to show yet",
  "No history to chart yet",
  "Nothing to export yet",
] as const;

function overviewHtml(load?: Parameters<typeof CompanyOverview>[0]["load"]) {
  return renderToStaticMarkup(<CompanyOverview companyId="co" identityName={null} load={load} />);
}

function expectUnknown(html: string) {
  for (const phrase of INVENT_ABSENCE) {
    expect(html, phrase).not.toContain(phrase);
  }
  expect(html).not.toContain("data-alert-badge");
  expect(html).not.toContain(">0<");
  expect(html).toContain('title="Export not available yet"');
  expect(html).toContain(HOME_SLOTS.alerts.headline);
  expect(html).toContain(HOME_SLOTS.alerts.detail);
  expect(html).toContain(HOME_SLOTS.transactions.headline);
  expect(html).toContain(HOME_SLOTS.transactions.detail);
  expect(html).toContain(HOME_SLOTS.covenantsAtRisk.detail);
  expect(html).toContain(HOME_SLOTS.nextTest.detail);
  expect(html).toContain(HOME_SLOTS.statusTable.headline);
  expect(html).toContain(HOME_SLOTS.drivers.headline);
  expect(html).toContain(HOME_SLOTS.headroomOverTime.headline);
  expect(html).toContain(HOME_SLOTS.headroomOverTime.detail);
  expect(html).toContain(HOME_SLOTS.capacitySummary.headline);
  expect(html).toContain(HOME_SLOTS.capacitySummary.detail);
  expect(html).toContain(HOME_SLOTS.totalHeadroom.detail);
  expect(html).toContain(HOME_SLOTS.utilization.detail);
  expect(html).not.toContain("$");
  expect(html).not.toContain("%");
}

describe("unwired overview stays UNKNOWN", () => {
  it("T-IA-01..11 UNKNOWN load does not invent absence", () => {
    expectUnknown(overviewHtml(UNWIRED_OVERVIEW_LOAD));
    expectUnknown(overviewHtml());
  });

  it("T-IA-01 alerts card UNKNOWN and NOT_LOADED", () => {
    for (const state of [UNKNOWN_STATE, NOT_LOADED_STATE]) {
      const html = renderToStaticMarkup(<AlertsCard state={state} />);
      expect(html).toContain("Alerts not available yet");
      expect(html).toContain("Alert status has not been loaded.");
      expect(html).not.toContain("No alerts");
      expect(html).not.toContain("Nothing to flag yet");
      expect(html).toContain(`data-load-kind="${state.kind}"`);
    }
  });

  it("T-IA-02 page and overview do not pass alertCount zero", () => {
    const page = readFileSync(path.join(ROOT, "app/[companyId]/page.tsx"), "utf8");
    const overview = readFileSync(path.join(ROOT, "components/home/Overview.tsx"), "utf8");
    expect(page).not.toContain("alertCount");
    expect(overview).not.toContain("alertCount");
    expect(page).toContain("UNWIRED_OVERVIEW_LOAD");
    expect(alertBadgeCount(UNKNOWN_STATE)).toBeNull();
    expect(alertBadgeCount(NOT_LOADED_STATE)).toBeNull();
    expect(alertBadgeCount(verifiedZeroAlerts())).toBeNull();
    expect(alertStateFromQuery({ queried: false })).toEqual(NOT_LOADED_STATE);
    expect(alertStateFromQuery({ queried: true, outcome: "failed" })).toEqual(UNKNOWN_STATE);
    expect(alertStateFromQuery({ queried: true, outcome: "nonzero", count: 0 })).toEqual(UNKNOWN_STATE);
    const html = overviewHtml({ alerts: alertStateFromQuery({ queried: true, outcome: "failed" }) });
    expect(html).toContain("Alerts not available yet");
    expect(html).not.toContain("No alerts");
    expect(html).not.toContain("data-alert-badge");
  });

  it("T-IA-03 transactions stay UNKNOWN unless the ledger was read", () => {
    const unavailable = transactionsStateFromLedger({ sourceAvailable: false });
    const unread = transactionsStateFromLedger({ sourceAvailable: true, ledgerRead: false });
    const failed = transactionsStateFromLedger({ sourceAvailable: true, ledgerRead: true, outcome: "failed" });
    for (const state of [unavailable, unread, failed, NOT_LOADED_STATE]) {
      const html = renderToStaticMarkup(<TransactionsCard state={state} />);
      expect(html).toContain("Transaction history not available yet");
      expect(html).toContain("Ledger activity has not been loaded.");
      expect(html).not.toContain("No transactions on file");
      expect(html).not.toContain("Nothing on the ledger yet");
    }
    const copy = resolveBuyerCopy("transactions", { kind: "VERIFIED_EMPTY", ledgerRead: false, sourceAvailable: false });
    expect(copy).toEqual(HOME_SLOTS.transactions);
  });

  it("T-IA-09 export title while UNKNOWN", () => {
    const html = overviewHtml({ exportState: UNKNOWN_STATE });
    expect(html).toContain('title="Export not available yet"');
    expect(html).not.toContain("Nothing to export yet");
    expect(html).toContain('aria-disabled="true"');
  });

  it("T-IA-10 capacity does not assert a missing facility split as verified fact", () => {
    expect(HOME_SLOTS.capacitySummary.detail).toBe("Facility split stays blank until figures are tied to sources.");
    expect(OVERVIEW_SLOT_MATRIX.capacitySummary.verifiedEmpty).toBeNull();
    const html = overviewHtml({
      capacitySummary: { kind: "VERIFIED_EMPTY", authoritativeEmpty: true },
    });
    expect(html).toContain(HOME_SLOTS.capacitySummary.headline);
    expect(html).toContain(HOME_SLOTS.capacitySummary.detail);
    expect(html).toContain('data-slot="capacitySummary"');
    expect(html).toContain('data-load-kind="VERIFIED_EMPTY"');
  });

  it("T-IA-11 total headroom and utilization do not invent zero figures", () => {
    const html = overviewHtml({
      totalHeadroom: { kind: "VERIFIED_EMPTY", authoritativeEmpty: true },
      utilization: { kind: "VERIFIED_POPULATED", certified: true, display: "0%" },
    });
    expect(html).toContain("Not available yet — we won’t invent a total.");
    expect(html).toContain("Not available yet. Used and capacity stay blank until certified figures exist.");
    expect(html).not.toContain("$0");
    expect(html).not.toContain("0%");
    expect(resolveBuyerCopy("totalHeadroom", { kind: "VERIFIED_EMPTY", authoritativeEmpty: true })).toEqual(HOME_SLOTS.totalHeadroom);
  });
});

describe("verified empty is a separate state", () => {
  it("T-IA-12 kinds stay distinct and verified-empty copy requires authority", () => {
    expect(UNKNOWN_STATE.kind).toBe("UNKNOWN");
    expect(NOT_LOADED_STATE.kind).toBe("NOT_LOADED");
    expect(verifiedZeroAlerts().kind).toBe("VERIFIED_EMPTY");
    expect(countSlotAlias("VERIFIED_EMPTY")).toBe("VERIFIED_ZERO");
    expect(countSlotAlias("VERIFIED_POPULATED")).toBe("VERIFIED_NONZERO");
    expect(verifiedNonzeroAlerts(2).kind).toBe("VERIFIED_POPULATED");
    expect(resolveBuyerCopy("alerts", { kind: "VERIFIED_EMPTY" })).toEqual(HOME_SLOTS.alerts);
    expect(resolveBuyerCopy("alerts", verifiedZeroAlerts())).toEqual(HOME_VERIFIED_EMPTY.alerts);
    expect(resolveBuyerCopy("covenantsAtRisk", { kind: "VERIFIED_EMPTY" })).toEqual(HOME_SLOTS.covenantsAtRisk);
    expect(resolveBuyerCopy("covenantsAtRisk", verifiedEmptyRisk())).toEqual(HOME_VERIFIED_EMPTY.covenantsAtRisk);
    for (const slot of Object.values(OVERVIEW_SLOT_MATRIX)) {
      expect(slot.wired).toBe(false);
    }
  });

  it("T-IA-20 alerts verified zero shows empty copy and hides the badge", () => {
    const html = overviewHtml({ alerts: verifiedZeroAlerts() });
    expect(html).toContain("No alerts");
    expect(html).toContain("Nothing to flag on the latest load.");
    expect(html).not.toContain("Alerts not available yet");
    expect(html).not.toContain("data-alert-badge");
    expect(html).not.toContain(">0<");
    const badge = overviewHtml({ alerts: verifiedNonzeroAlerts(3) });
    expect(badge).toContain("data-alert-badge");
    expect(badge).toContain(">3<");
    expect(badge).toContain('data-alert-count="3"');
    expect(badge).not.toContain("No alerts");
  });

  it("T-IA-21 transactions verified empty only after a ledger read", () => {
    const state = transactionsStateFromLedger({ sourceAvailable: true, ledgerRead: true, outcome: "empty" });
    expect(state).toEqual({ kind: "VERIFIED_EMPTY", ledgerRead: true, sourceAvailable: true });
    const html = renderToStaticMarkup(<TransactionsCard state={state} />);
    expect(html).toContain("No transactions on file");
    expect(html).toContain("Nothing on the ledger for the loaded window.");
    expect(html).not.toContain("Transaction history not available yet");
    const blankRows = transactionsStateFromLedger({
      sourceAvailable: true,
      ledgerRead: true,
      outcome: "populated",
      rows: [],
    });
    expect(blankRows).toEqual(UNKNOWN_STATE);
  });

  it("T-IA-22 covenants at risk verified empty and needs review", () => {
    const empty = overviewHtml({ covenantsAtRisk: verifiedEmptyRisk() });
    expect(empty).toContain("None at risk on the latest assessment.");
    expect(empty).not.toContain("Risk assessment not available yet.");
    expect(empty).not.toContain("data-alert-count");
    const review = overviewHtml({ covenantsAtRisk: { kind: "VERIFIED_POPULATED", disposition: "NEEDS_REVIEW" } });
    expect(review).toContain("Needs review.");
    expect(review).not.toContain("None at risk");
    expect(review).not.toContain("Risk assessment not available yet.");
    expect(review).not.toContain("data-alert-count");
  });

  it("T-IA-04..08 verified empty copy is slot-local", () => {
    const html = overviewHtml({
      nextTest: verifiedEmptyList(),
      statusTable: verifiedEmptyStatus(),
      drivers: verifiedEmptyList(),
      headroomOverTime: verifiedEmptyList(),
    });
    expect(html).toContain("No upcoming test on file.");
    expect(html).toContain("No covenant rows");
    expect(html).toContain("Latest load returned no rows.");
    expect(html).toContain("No drivers");
    expect(html).toContain("No explained capacity changes on the latest load.");
    expect(html).toContain("No history to chart");
    expect(html).toContain("No sourced history points for this window.");
    expect(html).not.toContain("Next test not available yet.");
    expect(html).not.toContain("Status not available yet");
    expect(html).not.toContain("Drivers not available yet");
    expect(html).not.toContain("Chart not available yet");
    expect(html).not.toContain("Healthy");
    expect(html).toContain("Alerts not available yet");
    expect(html).toContain("Transaction history not available yet");
  });

  it("T-IA-23 mixed states do not collapse into one absence claim", () => {
    const html = overviewHtml({
      alerts: verifiedZeroAlerts(),
      transactions: NOT_LOADED_STATE,
    });
    expect(html).toContain("No alerts");
    expect(html).toContain("Nothing to flag on the latest load.");
    expect(html).toContain("Transaction history not available yet");
    expect(html).toContain("Ledger activity has not been loaded.");
    expect(html).not.toContain("No transactions on file");
    expect(html).not.toContain("Nothing on the ledger yet");
    expect(html).toContain('data-slot="alerts"');
    expect(html).toContain('data-load-kind="VERIFIED_EMPTY"');
    expect(html).toContain('data-load-kind="NOT_LOADED"');
  });
});

describe("defaults and bind", () => {
  it("T-IA-33 superseded invent-absence strings are not overview defaults", () => {
    const files = [
      "lib/home/copy.ts",
      "lib/home/load-state.ts",
      "components/home/Overview.tsx",
      "components/home/RegionCard.tsx",
      "components/home/AlertsCard.tsx",
      "components/home/TransactionsCard.tsx",
      "components/home/CovenantsAtRiskCard.tsx",
      "components/home/NextTestCard.tsx",
      "components/home/StatusTable.tsx",
      "components/home/DriversCard.tsx",
      "components/home/HeadroomOverTimeCard.tsx",
      "components/home/CapacitySummaryCard.tsx",
      "components/home/TotalHeadroomCard.tsx",
      "components/home/UtilizationCard.tsx",
      "app/[companyId]/page.tsx",
    ];
    for (const file of files) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      for (const phrase of SUPERSEDED_IN_SOURCE) {
        expect(text, `${file} contains ${phrase}`).not.toContain(phrase);
      }
    }
    const unknown = Object.values(HOME_SLOTS)
      .map((slot) => `${slot.headline}\n${slot.detail}`)
      .join("\n");
    expect(unknown).not.toContain("No alerts");
    expect(unknown).not.toContain("No upcoming test on file");
    expect(unknown).not.toContain("No transactions on file");
    expect(unknown).not.toContain("No history to chart");
    expect(HOME_VERIFIED_EMPTY.alerts.headline).toBe("No alerts");
    expect(HOME_VERIFIED_EMPTY.alerts.detail).toBe("Nothing to flag on the latest load.");
  });

  it("T-IA-40 empty-overview tests do not pin invent-absence as the only UI", () => {
    const text = readFileSync(path.join(ROOT, "tests/home-overview-empty.test.tsx"), "utf8");
    expect(text).not.toContain('toBe("None to show yet.")');
    expect(text).not.toContain("Nothing to flag yet");
    expect(text).not.toContain("alertCount={0}");
    expect(text).not.toContain("Nothing to export yet");
    expect(text).toContain("Alert status has not been loaded.");
    expect(text).toContain("Export not available yet");
  });

  it("T-IA-41 copy header cites the UNKNOWN lock", () => {
    const text = readFileSync(path.join(ROOT, "lib/home/copy.ts"), "utf8");
    expect(text).toContain("9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04");
    expect(text).toContain("UNKNOWN ≠ VERIFIED_EMPTY");
    expect(text.indexOf("9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04")).toBeLessThan(
      text.indexOf("7f68ced002e91cb4750f4a8680462f840a2bf54ae92bfb4a423af6d8c2b7d0a4"),
    );
  });
});
