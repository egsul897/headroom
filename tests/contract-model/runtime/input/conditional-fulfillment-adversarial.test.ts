/**
 * Adversarial: PATH_IRRELEVANT requires LIVE re-evaluation of IF conditions.
 * A reproducible content hash / forged SelectedPathAuthority is never trust.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildFinancialInformationRequest,
  evaluateConditionalPathsAuthoritatively,
  expressionIdentityFingerprint,
  fulfillFinancialDependencyManifest,
  verifySelectedPathAuthority,
} from "@/lib/contract-model/runtime/input/information-request";
import { buildFinancialDependencyManifest } from "@/lib/contract-model/runtime/input/manifest";
import { withExpressionId } from "@/lib/contract-model/ir/identity";
import type { SelectedPathAuthority } from "@/lib/contract-model/runtime/input/conditional-path-authority";
import { BOOL, MAX, METRIC, MONEY, resetIds } from "../helpers";
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

/** Forge a payload whose diagnostic seal matches its own (forged) fields. */
function forgeSelfConsistentAuthority(over: Partial<SelectedPathAuthority> & Pick<SelectedPathAuthority, "selections">): SelectedPathAuthority {
  const base = {
    contractVersion: "test",
    companyId: over.companyId ?? "co",
    instrumentKey: over.instrumentKey ?? "inst",
    expressionIdentity: over.expressionIdentity ?? "forged-expr",
    snapshotBindings: over.snapshotBindings ?? [
      {
        snapshotId: "forged-snap",
        version: "1",
        status: "APPROVED" as const,
        asOf: null,
        reportingPeriod: null,
        approvalRef: "forged",
        source: "forged",
        sourceVersion: null,
      },
    ],
    evaluationAsOf: over.evaluationAsOf ?? null,
    evaluationPeriodKey: over.evaluationPeriodKey ?? null,
    selections: over.selections,
  };
  // Reproduce the diagnostic seal algorithm (same weakness as pre-fix verify).
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const seal = createHash("sha256")
    .update(
      JSON.stringify({
        ...base,
        selections: base.selections.map((s) => ({
          ifExprId: s.ifExprId,
          conditionEvaluatedTo: s.conditionEvaluatedTo,
          selectedBranch: s.selectedBranch,
          conditionInputKeys: [...s.conditionInputKeys].sort(),
          conditionStatus: s.conditionStatus,
        })),
      }),
    )
    .digest("hex");
  return {
    contractVersion: base.contractVersion,
    companyId: base.companyId,
    instrumentKey: base.instrumentKey,
    expressionIdentity: base.expressionIdentity,
    snapshotBindings: base.snapshotBindings,
    snapshotIds: base.snapshotBindings.map((b) => b.snapshotId),
    evaluationAsOf: base.evaluationAsOf,
    evaluationPeriodKey: base.evaluationPeriodKey,
    selections: base.selections,
    seal,
    authorityId: `path-eval:${seal.slice(0, 24)}`,
    authoritative: true,
    evaluatedAtIso: "2026-01-01T00:00:00Z",
  };
}

describe("CONDITIONAL path authority — adversarial fail-closed", () => {
  it("fabricated payload with correctly recomputed SHA-256 must fail", () => {
    const expr = ifWithIds(BOOL(true), "metric-then", "metric-else");
    const snap = snapshot({
      snapshotId: "s-fab",
      companyId: "co",
      inputs: [approvedMetric("metric-then", "50")],
    });
    const ifId = (expr as { exprId?: string }).exprId!;
    // Forge authority claiming else was selected (condition is actually true → then).
    const forged = forgeSelfConsistentAuthority({
      expressionIdentity: expressionIdentityFingerprint(expr),
      selections: [
        {
          ifExprId: ifId,
          conditionEvaluatedTo: false,
          selectedBranch: "else-branch",
          conditionInputKeys: [],
          conditionStatus: "EXECUTABLE",
        },
      ],
    });
    expect(verifySelectedPathAuthority(forged)).toBe(true); // seal is self-consistent — NOT trust

    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      ...ctx,
      policy: {
        selectedPathAuthority: forged, // ignored for trust
        conditionalDispositions: [
          {
            dependencyKey: "metric-then", // active branch — try to waive missing via forged "else selected"
            kind: "PATH_IRRELEVANT",
            branchLabel: "then-branch",
            proof: "forged seal claims then is inactive",
          },
        ],
      },
    });
    // Live eval: condition true → then active → then-branch missing/resolved but
    // claiming then-branch PATH_IRRELEVANT must fail (then is active).
    expect(info.items.find((i) => i.dependency.key === "metric-then")?.usableForExecution).toBe(true); // approved
    // Try clearing else with forged "else selected" while reality is then-selected:
    const info2 = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      ...ctx,
      policy: {
        selectedPathAuthority: forged,
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
    // Live eval correctly shows else inactive — forged claim of "else selected" is ignored;
    // live re-eval still clears else. To prove forged cannot *force* a wrong clearance,
    // forge claiming then inactive while then is active (first case). Assert forged cannot
    // clear an ACTIVE missing leaf:
    const exprMissingThen = ifWithIds(BOOL(true), "metric-then-miss", "metric-else-2");
    const forgedActive = forgeSelfConsistentAuthority({
      expressionIdentity: expressionIdentityFingerprint(exprMissingThen),
      selections: [
        {
          ifExprId: (exprMissingThen as { exprId?: string }).exprId!,
          conditionEvaluatedTo: false,
          selectedBranch: "else-branch",
          conditionInputKeys: [],
          conditionStatus: "EXECUTABLE",
        },
      ],
    });
    const blocked = buildFinancialInformationRequest({
      expression: exprMissingThen,
      snapshots: [
        snapshot({
          snapshotId: "s-miss",
          companyId: "co",
          inputs: [approvedMetric("metric-else-2", "1")],
        }),
      ],
      ...ctx,
      policy: {
        selectedPathAuthority: forgedActive,
        conditionalDispositions: [
          {
            dependencyKey: "metric-then-miss",
            kind: "PATH_IRRELEVANT",
            branchLabel: "then-branch",
            proof: "forged: pretend then is inactive",
          },
        ],
      },
    });
    expect(blocked.executable).toBe(false);
    expect(blocked.items.find((i) => i.dependency.key === "metric-then-miss")?.usableForExecution).toBe(false);
    void info;
    void info2;
  });

  it("changed IF expression with reused selection must fail", () => {
    const exprA = ifWithIds(BOOL(true), "metric-then", "metric-else");
    const snap = snapshot({
      snapshotId: "s-expr",
      companyId: "co",
      inputs: [approvedMetric("metric-then", "50")],
    });
    const liveA = evaluateConditionalPathsAuthoritatively({
      expression: exprA,
      snapshots: [snap],
      ...ctx,
    });
    expect(liveA.ok).toBe(true);
    if (!liveA.ok) return;

    // Different expression identity (condition flipped to false literal).
    const exprB = ifWithIds(BOOL(false), "metric-then", "metric-else");
    expect(expressionIdentityFingerprint(exprA)).not.toBe(expressionIdentityFingerprint(exprB));

    // Reuse A's disposition against B with A's claimed authority in policy (ignored).
    // Live eval of B selects else → then is inactive; else is active and missing.
    const info = buildFinancialInformationRequest({
      expression: exprB,
      snapshots: [snap], // only then approved
      ...ctx,
      policy: {
        selectedPathAuthority: liveA.authority,
        conditionalDispositions: [
          {
            dependencyKey: "metric-else",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "reused selection from exprA",
          },
        ],
      },
    });
    // Under exprB, else is ACTIVE — PATH_IRRELEVANT for else must fail; executable false.
    expect(info.executable).toBe(false);
    expect(info.items.find((i) => i.dependency.key === "metric-else")?.usableForExecution).toBe(false);
  });

  it("changed approved snapshot or supersession must invalidate selection", () => {
    const cond = withExpressionId({
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
      operator: "LTE" as const,
      right: withExpressionId({ kind: "RATIO", type: "RATIO", value: 4 }),
    });
    const expr = withExpressionId({
      kind: "IF",
      type: "MONEY",
      condition: cond,
      then: withExpressionId({
        kind: "METRIC_REFERENCE",
        type: "MONEY",
        metricName: "metric-then",
        companyId: "co",
        instrumentKey: "inst",
        resolvedDefinitionId: null,
      }),
      else: withExpressionId({
        kind: "METRIC_REFERENCE",
        type: "MONEY",
        metricName: "metric-else",
        companyId: "co",
        instrumentKey: "inst",
        resolvedDefinitionId: null,
      }),
    });

    const snapV1 = snapshot({
      snapshotId: "s-v1",
      companyId: "co",
      version: "1",
      inputs: [
        input({
          identity: identity({
            key: "metric-cond",
            companyId: "co",
            scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: "inst" },
            valueType: "RATIO",
            currency: null,
          }),
          value: { type: "RATIO", value: { num: 3n, den: 1n }, lineage: { exprId: null, inputKeys: [] } },
        }),
        approvedMetric("metric-then", "10"),
      ],
    });
    const live1 = evaluateConditionalPathsAuthoritatively({
      expression: expr,
      snapshots: [snapV1],
      ...ctx,
    });
    expect(live1.ok).toBe(true);
    if (!live1.ok) return;
    expect(live1.authority.selections[0]?.selectedBranch).toBe("then-branch");

    // Superseding snapshot flips condition (>4) → else selected; then missing.
    const snapV2 = snapshot({
      snapshotId: "s-v2",
      companyId: "co",
      version: "2",
      supersedesSnapshotId: "s-v1",
      inputs: [
        input({
          identity: identity({
            key: "metric-cond",
            companyId: "co",
            scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: "inst" },
            valueType: "RATIO",
            currency: null,
          }),
          value: { type: "RATIO", value: { num: 5n, den: 1n }, lineage: { exprId: null, inputKeys: [] } },
        }),
        approvedMetric("metric-else", "20"),
      ],
    });
    const supersededV1 = { ...snapV1, status: "SUPERSEDED" as const };
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [supersededV1, snapV2],
      ...ctx,
      policy: {
        selectedPathAuthority: live1.authority, // stale claim: then selected
        conditionalDispositions: [
          {
            dependencyKey: "metric-then",
            kind: "PATH_IRRELEVANT",
            branchLabel: "then-branch",
            proof: "stale v1 selection",
          },
        ],
      },
    });
    // Live eval on v2: else selected → then inactive → then can clear; else must be present.
    // Actually then PATH_IRRELEVANT should succeed under live v2. Executable needs else approved.
    expect(info.items.find((i) => i.dependency.key === "metric-then")?.usableForExecution).toBe(true);
    expect(info.executable).toBe(true);

    // Stale claim cannot keep then ACTIVE clearance when we try to waive else under old authority:
    const infoStaleElse = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [supersededV1, snapV2],
      ...ctx,
      policy: {
        selectedPathAuthority: live1.authority,
        conditionalDispositions: [
          {
            dependencyKey: "metric-else",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "stale: pretend else inactive like v1",
          },
        ],
      },
    });
    // Live: else is ACTIVE — cannot clear via PATH_IRRELEVANT
    expect(infoStaleElse.items.find((i) => i.dependency.key === "metric-else")?.usableForExecution).toBe(true); // approved
    // Force missing else under v2 with stale waive:
    const snapV2NoElse = snapshot({
      snapshotId: "s-v2b",
      companyId: "co",
      version: "2b",
      supersedesSnapshotId: "s-v1",
      inputs: [
        input({
          identity: identity({
            key: "metric-cond",
            companyId: "co",
            scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: "inst" },
            valueType: "RATIO",
            currency: null,
          }),
          value: { type: "RATIO", value: { num: 5n, den: 1n }, lineage: { exprId: null, inputKeys: [] } },
        }),
      ],
    });
    const blocked = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [supersededV1, snapV2NoElse],
      ...ctx,
      policy: {
        selectedPathAuthority: live1.authority,
        conditionalDispositions: [
          {
            dependencyKey: "metric-else",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "stale waive of active else",
          },
        ],
      },
    });
    expect(blocked.executable).toBe(false);
    expect(blocked.items.find((i) => i.dependency.key === "metric-else")?.usableForExecution).toBe(false);
  });

  it("wrong company/instrument must fail", () => {
    const expr = ifWithIds(BOOL(true), "metric-then", "metric-else");
    const snap = snapshot({
      snapshotId: "s-co",
      companyId: "co",
      inputs: [approvedMetric("metric-then", "50")],
    });
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      companyId: "other-co",
      instrumentKey: "inst",
      policy: {
        conditionalDispositions: [
          {
            dependencyKey: "metric-else",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "wrong company context",
          },
        ],
      },
    });
    // No APPROVED snapshots for other-co → live eval fails → cannot clear
    expect(info.executable).toBe(false);
  });

  it("genuinely evaluated inactive branch may clear", () => {
    const expr = ifWithIds(BOOL(true), "metric-then", "metric-else");
    const snap = snapshot({
      snapshotId: "s-ok",
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
            proof: "Live eval: condition true; else inactive.",
          },
        ],
      },
    });
    expect(info.executable).toBe(true);
    expect(info.executionMode).toBe("EXACT");
  });

  it("active branch missing blocks", () => {
    const expr = ifWithIds(BOOL(true), "metric-then", "metric-else");
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [
        snapshot({
          snapshotId: "s-active-miss",
          companyId: "co",
          inputs: [],
        }),
      ],
      ...ctx,
      policy: {
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
    // BOOL condition needs no metrics; then still missing
    expect(info.executable).toBe(false);
    expect(info.items.find((i) => i.dependency.key === "metric-then")?.usableForExecution).toBe(false);
  });

  it("SAFE_BOUND never becomes EXACT", () => {
    const expr = MAX(MONEY(75_000_000), METRIC("metric-optional"));
    const manifest = buildFinancialDependencyManifest({ expression: expr, ...ctx });
    const bound = fulfillFinancialDependencyManifest({
      manifest,
      snapshots: [],
      expression: expr,
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

  it("REQUIRED missing always blocks without safe-bound policy", () => {
    const expr = MAX(MONEY(75_000_000), METRIC("metric-optional"));
    const info = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [],
      ...ctx,
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
  });
});
