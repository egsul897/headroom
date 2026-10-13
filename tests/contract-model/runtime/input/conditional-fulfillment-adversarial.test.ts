/**
 * Adversarial: PATH_IRRELEVANT requires sealed selected-path authority;
 * fabricated branchLabel/proof cannot clear; SAFE_BOUND never becomes EXACT;
 * REQUIRED missing always blocks without safe-bound policy.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildFinancialInformationRequest,
  fulfillFinancialDependencyManifest,
  selectConditionalPaths,
} from "@/lib/contract-model/runtime/input/information-request";
import { buildFinancialDependencyManifest } from "@/lib/contract-model/runtime/input/manifest";
import { withExpressionId } from "@/lib/contract-model/ir/identity";
import {
  BOOL,
  CMP,
  IF,
  MAX,
  METRIC,
  MONEY,
  MUL,
  PCT,
  RATIO,
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

function ifWithIds(condition: ReturnType<typeof BOOL>, thenM: string, elseM: string) {
  return withExpressionId({
    kind: "IF",
    type: "MONEY",
    condition: withExpressionId(condition),
    then: withExpressionId({
      kind: "METRIC_REFERENCE",
      type: "MONEY",
      metricName: thenM,
      companyId: "co",
      instrumentKey: "inst",
      resolvedDefinitionId: null,
    }),
    else: withExpressionId({
      kind: "METRIC_REFERENCE",
      type: "MONEY",
      metricName: elseM,
      companyId: "co",
      instrumentKey: "inst",
      resolvedDefinitionId: null,
    }),
  });
}

describe("CONDITIONAL fulfillment — adversarial fail-closed", () => {
  it("fabricated branchLabel + proof cannot clear unresolved conditional", () => {
    const expr = ifWithIds(BOOL(true), "metric-then", "metric-else");
    const snap = snapshot({
      snapshotId: "s-fab",
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
            proof: "I pinky-swear the else branch is inactive.",
          },
        ],
        // no selectedPathAuthority
      },
    });
    expect(info.executable).toBe(false);
    expect(info.executionMode).toBe("NOT_EXECUTABLE");
    expect(info.items.find((i) => i.dependency.key === "metric-else")?.usableForExecution).toBe(false);
  });

  it("verified inactive branch (sealed selectConditionalPaths) can clear", () => {
    const expr = ifWithIds(BOOL(true), "metric-then", "metric-else");
    const snap = snapshot({
      snapshotId: "s-auth",
      companyId: "co",
      inputs: [approvedMetric("metric-then", "50")],
    });
    const selected = selectConditionalPaths({
      expression: expr,
      snapshots: [snap],
      companyId: "co",
      instrumentKey: "inst",
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(selected.authority.selections[0]?.selectedBranch).toBe("then-branch");

    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      ...ctx,
      policy: {
        selectedPathAuthority: selected.authority,
        conditionalDispositions: [
          {
            dependencyKey: "metric-else",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "Condition evaluated true; else-branch inactive per sealed authority.",
          },
        ],
      },
    });
    expect(info.executable).toBe(true);
    expect(info.executionMode).toBe("EXACT");
    expect(info.items.find((i) => i.dependency.key === "metric-else")?.usableForExecution).toBe(true);
  });

  it("active branch with missing input blocks", () => {
    const expr = ifWithIds(BOOL(true), "metric-then", "metric-else");
    const snap = snapshot({
      snapshotId: "s-active-miss",
      companyId: "co",
      inputs: [], // then-branch active but missing
    });
    // Condition is BOOL literal — still selectable
    const selected = selectConditionalPaths({
      expression: expr,
      snapshots: [
        snapshot({
          snapshotId: "s-empty-approved",
          companyId: "co",
          inputs: [approvedMetric("pad", "1")],
        }),
      ],
      companyId: "co",
      instrumentKey: "inst",
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;

    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      ...ctx,
      policy: {
        selectedPathAuthority: selected.authority,
        conditionalDispositions: [
          {
            dependencyKey: "metric-else",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "else inactive",
          },
        ],
      },
    });
    // then-branch metric still missing and REQUIRED on selected path → blocks
    // Actually then is CONDITIONAL not REQUIRED - wait, IF marks then as CONDITIONAL.
    // Active branch CONDITIONAL that is missing still blocks without disposition clearing it.
    expect(info.executable).toBe(false);
    expect(info.items.find((i) => i.dependency.key === "metric-then")?.fulfillmentState).toBe("MISSING");
    expect(info.items.find((i) => i.dependency.key === "metric-then")?.usableForExecution).toBe(false);
  });

  it("SAFE_BOUND cannot become EXACT", () => {
    const expr = MAX(MONEY(75_000_000), METRIC("metric-optional"));
    const manifest = buildFinancialDependencyManifest({ expression: expr, ...ctx });
    const dep = manifest.dependencies.find((d) => d.key === "metric-optional")!;
    expect(dep.safeBoundAvailableWithoutThis).toBe(true);
    expect(dep.status).toBe("REQUIRED");

    const bound = fulfillFinancialDependencyManifest({
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
    expect(bound.executable).toBe(true);
    expect(bound.executionMode).toBe("SAFE_BOUND");
    expect(bound.executionMode).not.toBe("EXACT");
  });

  it("REQUIRED missing input always blocks without safe-bound policy", () => {
    const expr = MAX(MONEY(75_000_000), METRIC("metric-optional"));
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [],
      ...ctx,
      // no allowSafeBoundWithoutUnresolvedConditional
      policy: {
        conditionalDispositions: [
          {
            dependencyKey: "metric-optional",
            kind: "SAFE_BOUND",
            proof: "attempted bound without policy",
          },
        ],
      },
    });
    expect(info.executable).toBe(false);
    expect(info.executionMode).toBe("NOT_EXECUTABLE");
    expect(info.blocking.some((b) => b.dependency.key === "metric-optional")).toBe(true);
  });

  it("tampered selectedPathAuthority seal is refused", () => {
    const expr = ifWithIds(BOOL(true), "metric-then", "metric-else");
    const snap = snapshot({
      snapshotId: "s-tamper",
      companyId: "co",
      inputs: [approvedMetric("metric-then", "50")],
    });
    const selected = selectConditionalPaths({
      expression: expr,
      snapshots: [snap],
      companyId: "co",
      instrumentKey: "inst",
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    const tampered = {
      ...selected.authority,
      selections: selected.authority.selections.map((s) => ({
        ...s,
        selectedBranch: "else-branch" as const, // lie about selection
        conditionEvaluatedTo: false,
      })),
      // keep old seal — detect tamper
    };
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      ...ctx,
      policy: {
        selectedPathAuthority: tampered,
        conditionalDispositions: [
          {
            dependencyKey: "metric-else",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "forged",
          },
        ],
      },
    });
    expect(info.executable).toBe(false);
  });

  it("condition needing missing metric cannot mint path authority", () => {
    const expr = withExpressionId({
      kind: "IF",
      type: "MONEY",
      condition: withExpressionId({
        kind: "COMPARE",
        type: "BOOLEAN",
        left: withExpressionId({
          kind: "METRIC_REFERENCE",
          type: "RATIO",
          metricName: "metric-cond",
          companyId: "co",
          instrumentKey: "inst",
          resolvedDefinitionId: null,
        }),
        operator: "LTE",
        right: withExpressionId({ kind: "RATIO", type: "RATIO", value: 4 }),
      }),
      then: METRIC("metric-then"),
      else: METRIC("metric-else"),
    });
    const selected = selectConditionalPaths({
      expression: expr,
      snapshots: [snapshot({ snapshotId: "s-nocond", companyId: "co", inputs: [] })],
      companyId: "co",
      instrumentKey: "inst",
    });
    expect(selected.ok).toBe(false);
  });
});

void CMP;
void MUL;
void PCT;
void RATIO;
void IF;
void BOOL;
