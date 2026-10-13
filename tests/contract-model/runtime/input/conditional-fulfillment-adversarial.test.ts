/**
 * Adversarial: unresolved CONDITIONAL leaves must not become executable
 * merely because dependency status is CONDITIONAL.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildFinancialInformationRequest,
  fulfillFinancialDependencyManifest,
} from "@/lib/contract-model/runtime/input/information-request";
import { buildFinancialDependencyManifest } from "@/lib/contract-model/runtime/input/manifest";
import {
  BOOL,
  IF,
  MAX,
  METRIC,
  MONEY,
  MUL,
  PCT,
  resetIds,
} from "../helpers";
import { identity, input, money, snapshot } from "./helpers";

beforeEach(resetIds);

const ctx = { companyId: "co", instrumentKey: "inst" };

function approvedMetric(key: string, amount: string) {
  return input({
    identity: identity({ key, companyId: "co", scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: "inst" } }),
    value: money(amount),
  });
}

describe("CONDITIONAL fulfillment — adversarial fail-closed", () => {
  it("missing CONDITIONAL then-branch blocks executable (no silent waive)", () => {
    const expr = IF(BOOL(true), MUL(PCT(0.1), METRIC("metric-then")), MUL(PCT(0.2), METRIC("metric-else")));
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [],
      ...ctx,
    });
    expect(info.manifest.counts.conditional).toBe(2);
    expect(info.executable).toBe(false);
    expect(info.executionMode).toBe("NOT_EXECUTABLE");
    const thenItem = info.items.find((i) => i.dependency.key === "metric-then");
    expect(thenItem?.dependency.status).toBe("CONDITIONAL");
    expect(thenItem?.fulfillmentState).toBe("MISSING");
    expect(thenItem?.usableForExecution).toBe(false);
    expect(info.blocking.some((b) => b.dependency.key === "metric-then")).toBe(true);
  });

  it("stale CONDITIONAL does not become usable without disposition", () => {
    const expr = IF(BOOL(true), METRIC("metric-then"), METRIC("metric-else"));
    const snap = snapshot({
      snapshotId: "s-stale",
      companyId: "co",
      asOf: "2020-01-01",
      inputs: [
        input({
          identity: identity({
            key: "metric-then",
            companyId: "co",
            scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: "inst" },
            asOf: { kind: "EXACT_DATE", isoDate: "2020-01-01" },
          }),
          value: money("100"),
        }),
        input({
          identity: identity({
            key: "metric-else",
            companyId: "co",
            scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: "inst" },
            asOf: { kind: "EXACT_DATE", isoDate: "2020-01-01" },
          }),
          value: money("200"),
        }),
      ],
    });
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      companyId: "co",
      instrumentKey: "inst",
      asOf: "2020-01-01",
      policy: { staleBeforeIsoDate: "2025-01-01" },
    });
    const thenItem = info.items.find((i) => i.dependency.key === "metric-then");
    expect(thenItem?.fulfillmentState).toBe("STALE");
    expect(thenItem?.usableForExecution).toBe(false);
    expect(info.executable).toBe(false);
  });

  it("PATH_IRRELEVANT disposition clears off-path CONDITIONAL when branchLabel matches conditionalOn", () => {
    const expr = IF(BOOL(true), METRIC("metric-then"), METRIC("metric-else"));
    const snap = snapshot({
      snapshotId: "s-path",
      companyId: "co",
      inputs: [approvedMetric("metric-then", "50")],
    });
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      ...ctx,
      policy: {
        conditionalDispositions: [
          {
            dependencyKey: "metric-else",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "Condition BOOL(true) selects then-branch; else-branch metric-else is off-path.",
          },
        ],
      },
    });
    expect(info.executable).toBe(true);
    expect(info.executionMode).toBe("EXACT");
    const elseItem = info.items.find((i) => i.dependency.key === "metric-else");
    expect(elseItem?.usableForExecution).toBe(true);
    expect(elseItem?.conditionalDispositionApplied?.kind).toBe("PATH_IRRELEVANT");
  });

  it("PATH_IRRELEVANT with wrong branchLabel is refused (no free-form waiver)", () => {
    const expr = IF(BOOL(true), METRIC("metric-then"), METRIC("metric-else"));
    const snap = snapshot({
      snapshotId: "s-bad",
      companyId: "co",
      inputs: [approvedMetric("metric-then", "50")],
    });
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      ...ctx,
      policy: {
        conditionalDispositions: [
          {
            dependencyKey: "metric-else",
            kind: "PATH_IRRELEVANT",
            branchLabel: "then-branch",
            proof: "attempted waiver",
          },
        ],
      },
    });
    expect(info.executable).toBe(false);
    expect(info.items.find((i) => i.dependency.key === "metric-else")?.usableForExecution).toBe(false);
  });

  it("SAFE_BOUND does not clear REQUIRED leaves even with literal sibling", () => {
    const expr = MAX(MONEY(75_000_000), METRIC("metric-optional"));
    const manifest = buildFinancialDependencyManifest({ expression: expr, ...ctx });
    const dep = manifest.dependencies.find((d) => d.key === "metric-optional")!;
    expect(dep.safeBoundAvailableWithoutThis).toBe(true);
    expect(dep.status).toBe("REQUIRED");

    const blocked = fulfillFinancialDependencyManifest({
      manifest,
      snapshots: [],
      policy: {
        allowSafeBoundWithoutUnresolvedConditional: true,
        conditionalDispositions: [
          {
            dependencyKey: "metric-optional",
            kind: "SAFE_BOUND",
            proof: "Literal sibling $75M supplies safe lower bound.",
          },
        ],
      },
    });
    expect(blocked.executable).toBe(false);
    expect(blocked.blocking.some((b) => b.dependency.key === "metric-optional")).toBe(true);
  });

  it("NOT_APPROVED CONDITIONAL blocks without disposition", () => {
    const expr = IF(BOOL(true), METRIC("metric-then"), METRIC("metric-else"));
    const draft = snapshot({
      snapshotId: "s-draft",
      companyId: "co",
      status: "DRAFT",
      review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
      inputs: [approvedMetric("metric-then", "10"), approvedMetric("metric-else", "20")],
    });
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [draft],
      ...ctx,
    });
    expect(info.executable).toBe(false);
    expect(
      info.items
        .filter((i) => i.dependency.status === "CONDITIONAL")
        .every((i) => i.fulfillmentState === "NOT_APPROVED" && !i.usableForExecution),
    ).toBe(true);
  });

  it("AMBIGUOUS CONDITIONAL blocks (never picks)", () => {
    const expr = IF(BOOL(true), METRIC("metric-then"), MONEY(0));
    const snaps = [
      snapshot({ snapshotId: "s1", companyId: "co", inputs: [approvedMetric("metric-then", "1")] }),
      snapshot({ snapshotId: "s2", companyId: "co", inputs: [approvedMetric("metric-then", "2")] }),
    ];
    const info = buildFinancialInformationRequest({ expression: expr, snapshots: snaps, ...ctx });
    const thenItem = info.items.find((i) => i.dependency.key === "metric-then");
    expect(thenItem?.fulfillmentState).toBe("AMBIGUOUS");
    expect(info.executable).toBe(false);
  });
});
