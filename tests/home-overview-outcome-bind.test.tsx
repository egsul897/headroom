/**
 * R1 outcome-bind probes. A token minted for populated / nonzero / needs-review
 * is not authority for VERIFIED_EMPTY. Relabel must fail closed (UNKNOWN).
 * IMPLEMENTED ≠ CERTIFIED.
 *
 * Plan sha256: 4f55139dc08e395defba2d8eefc98bf62a861ae88896182512137575a3aeed75
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanyOverview } from "../components/home/Overview";
import { HOME_SLOTS, HOME_VERIFIED_EMPTY, resolveBuyerCopy } from "../lib/home/copy";
import {
  UNWIRED_OVERVIEW_LOAD,
  alertStateFromQuery,
  covenantsAtRiskStateFromQuery,
  nextTestStateFromQuery,
  presentAlerts,
  presentList,
  presentRisk,
  type AlertLoadState,
  type ListLoadState,
  type QueryAuthority,
  type RiskLoadState,
} from "../lib/home/load-state";

const NEXT_ROW = "PROBE-NEXT-TEST-ROW";
const LIST_ITEM = "PROBE-COVENANT-AT-RISK";

function overviewHtml(load: Parameters<typeof CompanyOverview>[0]["load"]) {
  return renderToStaticMarkup(<CompanyOverview companyId="co" identityName={null} load={load} />);
}

function relabelEmpty<T>(authority: unknown): T {
  return { kind: "VERIFIED_EMPTY", authority } as unknown as T;
}

/** Type-level guard. Outcome-mismatched authority must not satisfy the other arm. */
function outcomeTransplantDoesNotCompile(): void {
  const next = nextTestStateFromQuery({ outcome: "populated", rows: [NEXT_ROW] });
  if (next.kind !== "VERIFIED_POPULATED") return;
  // @ts-expect-error populated nextTest authority is not an EMPTY token
  const nextEmpty: ListLoadState<"nextTest"> = { kind: "VERIFIED_EMPTY", authority: next.authority };
  void nextEmpty;

  const alerts = alertStateFromQuery({ queried: true, outcome: "nonzero", count: 3 });
  if (alerts.kind !== "VERIFIED_POPULATED") return;
  // @ts-expect-error nonzero alerts authority is not an EMPTY token
  const alertsEmpty: AlertLoadState = { kind: "VERIFIED_EMPTY", authority: alerts.authority };
  void alertsEmpty;

  const review = covenantsAtRiskStateFromQuery({ outcome: "needs_review" });
  if (review.kind !== "VERIFIED_POPULATED") return;
  // @ts-expect-error needs_review authority is not an EMPTY token
  const reviewEmpty: RiskLoadState = { kind: "VERIFIED_EMPTY", authority: review.authority };
  void reviewEmpty;

  const listed = covenantsAtRiskStateFromQuery({ outcome: "list", items: [LIST_ITEM] });
  if (listed.kind !== "VERIFIED_POPULATED") return;
  // @ts-expect-error list authority is not an EMPTY token
  const listedEmpty: RiskLoadState = { kind: "VERIFIED_EMPTY", authority: listed.authority };
  void listedEmpty;

  const emptyNext = nextTestStateFromQuery({ outcome: "empty" });
  if (emptyNext.kind !== "VERIFIED_EMPTY") return;
  const nextPopulated: ListLoadState<"nextTest"> = {
    kind: "VERIFIED_POPULATED",
    // @ts-expect-error EMPTY nextTest authority is not a POPULATED token
    authority: emptyNext.authority,
    rows: ["forged"],
  };
  void nextPopulated;

  // @ts-expect-error alerts POPULATED authority is not a nextTest EMPTY token
  const crossSlot: ListLoadState<"nextTest"> = { kind: "VERIFIED_EMPTY", authority: alerts.authority };
  void crossSlot;

  // @ts-expect-error POPULATED token is not assignable to an EMPTY authority
  const emptyBrand: QueryAuthority<"nextTest", "EMPTY"> = next.authority;
  void emptyBrand;
}

describe("outcome-mismatched authority fails closed", () => {
  it("type guard is part of the suite", () => {
    outcomeTransplantDoesNotCompile();
  });

  it("nextTest populated relabelled VERIFIED_EMPTY does not invent absence", () => {
    const populated = nextTestStateFromQuery({ outcome: "populated", rows: [NEXT_ROW] });
    expect(populated.kind).toBe("VERIFIED_POPULATED");
    if (populated.kind !== "VERIFIED_POPULATED") return;
    const transplanted = relabelEmpty<ListLoadState<"nextTest">>(populated.authority);
    expect(presentList(transplanted, "nextTest").kind).toBe("UNKNOWN");
    expect(resolveBuyerCopy("nextTest", transplanted)).toEqual(HOME_SLOTS.nextTest);
    const html = overviewHtml({ nextTest: transplanted });
    expect(html).not.toContain("No upcoming test on file.");
    expect(html).not.toContain(NEXT_ROW);
    expect(html).toContain("Next test not available yet.");
    expect(html).toContain('data-load-kind="UNKNOWN" data-slot="nextTest"');
    expect(html).not.toContain('data-load-kind="VERIFIED_EMPTY" data-slot="nextTest"');
  });

  it("alerts nonzero count 3 relabelled VERIFIED_EMPTY does not invent zero", () => {
    const nonzero = alertStateFromQuery({ queried: true, outcome: "nonzero", count: 3 });
    expect(nonzero.kind).toBe("VERIFIED_POPULATED");
    if (nonzero.kind !== "VERIFIED_POPULATED") return;
    expect(nonzero.count).toBe(3);
    const transplanted = relabelEmpty<AlertLoadState>(nonzero.authority);
    expect(presentAlerts(transplanted).kind).toBe("UNKNOWN");
    expect(resolveBuyerCopy("alerts", transplanted)).toEqual(HOME_SLOTS.alerts);
    const html = overviewHtml({ alerts: transplanted });
    expect(html).not.toContain("No alerts");
    expect(html).not.toContain("Nothing to flag on the latest load.");
    expect(html).not.toContain("data-alert-badge");
    expect(html).not.toContain('data-alert-count="3"');
    expect(html).not.toContain(">3<");
    expect(html).toContain("Alerts not available yet");
    expect(html).toContain("Alert status has not been loaded.");
    expect(html).toContain('data-load-kind="UNKNOWN" data-slot="alerts"');
    expect(html).not.toContain('data-load-kind="VERIFIED_EMPTY" data-slot="alerts"');
  });

  it("covenantsAtRisk needs_review relabelled VERIFIED_EMPTY does not invent absence", () => {
    const review = covenantsAtRiskStateFromQuery({ outcome: "needs_review" });
    expect(review.kind).toBe("VERIFIED_POPULATED");
    if (review.kind !== "VERIFIED_POPULATED") return;
    const transplanted = relabelEmpty<RiskLoadState>(review.authority);
    expect(presentRisk(transplanted).kind).toBe("UNKNOWN");
    expect(resolveBuyerCopy("covenantsAtRisk", transplanted)).toEqual(HOME_SLOTS.covenantsAtRisk);
    const html = overviewHtml({ covenantsAtRisk: transplanted });
    expect(html).not.toContain("None at risk on the latest assessment.");
    expect(html).not.toContain("Needs review.");
    expect(html).toContain("Risk assessment not available yet.");
    expect(html).toContain('data-load-kind="UNKNOWN" data-slot="covenantsAtRisk"');
    expect(html).not.toContain('data-load-kind="VERIFIED_EMPTY" data-slot="covenantsAtRisk"');
  });

  it("covenantsAtRisk list relabelled VERIFIED_EMPTY does not invent absence", () => {
    const listed = covenantsAtRiskStateFromQuery({ outcome: "list", items: [LIST_ITEM] });
    expect(listed.kind).toBe("VERIFIED_POPULATED");
    if (listed.kind !== "VERIFIED_POPULATED") return;
    const transplanted = relabelEmpty<RiskLoadState>(listed.authority);
    expect(presentRisk(transplanted).kind).toBe("UNKNOWN");
    const html = overviewHtml({ covenantsAtRisk: transplanted });
    expect(html).not.toContain("None at risk on the latest assessment.");
    expect(html).not.toContain(LIST_ITEM);
    expect(html).toContain("Risk assessment not available yet.");
  });

  it("EMPTY token relabelled VERIFIED_POPULATED does not render the forged row", () => {
    const empty = nextTestStateFromQuery({ outcome: "empty" });
    expect(empty.kind).toBe("VERIFIED_EMPTY");
    if (empty.kind !== "VERIFIED_EMPTY") return;
    const transplanted = {
      kind: "VERIFIED_POPULATED" as const,
      authority: empty.authority,
      rows: ["forged-populated-row"],
    } as unknown as ListLoadState<"nextTest">;
    expect(presentList(transplanted, "nextTest").kind).toBe("UNKNOWN");
    const html = overviewHtml({ nextTest: transplanted });
    expect(html).not.toContain("forged-populated-row");
    expect(html).not.toContain("No upcoming test on file.");
    expect(html).toContain("Next test not available yet.");
  });

  it("alerts token does not authorize nextTest VERIFIED_EMPTY", () => {
    const nonzero = alertStateFromQuery({ queried: true, outcome: "nonzero", count: 3 });
    if (nonzero.kind !== "VERIFIED_POPULATED") return;
    const transplanted = relabelEmpty<ListLoadState<"nextTest">>(nonzero.authority);
    expect(presentList(transplanted, "nextTest").kind).toBe("UNKNOWN");
    const html = overviewHtml({ nextTest: transplanted });
    expect(html).not.toContain("No upcoming test on file.");
    expect(html).toContain("Next test not available yet.");
  });
});

describe("genuine empty outcomes still verify", () => {
  it("authoritative empty / zero still reaches VERIFIED_EMPTY copy", () => {
    const next = nextTestStateFromQuery({ outcome: "empty" });
    const alerts = alertStateFromQuery({ queried: true, outcome: "zero" });
    const risk = covenantsAtRiskStateFromQuery({ outcome: "empty" });
    expect(presentList(next, "nextTest").kind).toBe("VERIFIED_EMPTY");
    expect(presentAlerts(alerts).kind).toBe("VERIFIED_EMPTY");
    expect(presentRisk(risk).kind).toBe("VERIFIED_EMPTY");
    expect(resolveBuyerCopy("nextTest", next)).toEqual(HOME_VERIFIED_EMPTY.nextTest);
    expect(resolveBuyerCopy("alerts", alerts)).toEqual(HOME_VERIFIED_EMPTY.alerts);
    expect(resolveBuyerCopy("covenantsAtRisk", risk)).toEqual(HOME_VERIFIED_EMPTY.covenantsAtRisk);

    const html = overviewHtml({ nextTest: next, alerts, covenantsAtRisk: risk });
    expect(html).toContain("No upcoming test on file.");
    expect(html).toContain("No alerts");
    expect(html).toContain("Nothing to flag on the latest load.");
    expect(html).not.toContain("data-alert-badge");
    expect(html).toContain("None at risk on the latest assessment.");
    expect(html).toContain('data-load-kind="VERIFIED_EMPTY" data-slot="nextTest"');
    expect(html).toContain('data-load-kind="VERIFIED_EMPTY" data-slot="alerts"');
    expect(html).toContain('data-load-kind="VERIFIED_EMPTY" data-slot="covenantsAtRisk"');
  });

  it("unwired overview stays UNKNOWN", () => {
    const html = overviewHtml(UNWIRED_OVERVIEW_LOAD);
    expect(html).toContain("Next test not available yet.");
    expect(html).toContain("Alerts not available yet");
    expect(html).toContain("Risk assessment not available yet.");
    expect(html).not.toContain("No upcoming test on file.");
    expect(html).not.toContain("No alerts");
    expect(html).not.toContain("None at risk on the latest assessment.");
    expect(html).not.toContain("data-alert-badge");
  });
});
