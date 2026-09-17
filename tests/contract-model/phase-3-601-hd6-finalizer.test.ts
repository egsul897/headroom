/**
 * PHASE 3 / 6.01 remediation §20 - HD-6 finalizer read-shape regression, from the ACTUAL frozen artifacts. Zero model
 * calls. The canonical reader must read the production shape as produced, name every mismatch, and never default a
 * missing counter to zero.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readShardTrust } from "../../scripts/phase-3-601-trust-read";

const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-paid";
const frozen = JSON.parse(readFileSync(`${RAW}/compile-result.json`, "utf8"));

describe("HD-6 - the frozen paid compile-result.json", () => {
  it("exposes execution.sharded.contextualEmissions as a COUNT (2), which the pinned finalizer read as a list", () => {
    expect(typeof frozen.execution.sharded.contextualEmissions).toBe("number");
    expect(frozen.execution.sharded.contextualEmissions).toBe(2);
    expect(Array.isArray(frozen.execution.sharded.contextualEmissions)).toBe(false);
    // the pinned finalizer's exact failure mode, reproduced
    expect(() => (frozen.execution.sharded.contextualEmissions as unknown as { filter: (f: unknown) => unknown }).filter(() => true)).toThrow(/filter is not a function/);
  });

  it("the canonical reader reads the frozen shape as produced and reports the §18 counter NOT_MEASURABLE (the artifact predates it) instead of a silent zero or the detection count", () => {
    const r = readShardTrust(frozen);
    expect(r.executionMode).toBe("SHARDED");
    expect(r.sharded).not.toBeNull();
    expect(r.sharded!.contextualEmissionsDetected).toBe(2);
    expect(r.sharded!.collisionsByKind).toEqual({ CONTEXTUAL_UNOWNED_DEFINITION: 2, RULE_POSSIBLE_DUPLICATE: 1 });
    expect(r.sharded!.unresolvedOwnedItems).toBe(317);
    expect(r.sharded!.attributionProofCounts!.NONE).toBe(0);
    expect(r.sharded!.statusCounts).toEqual({ SHARD_MISSING_CONTEXT: 2, SHARD_COMPLETE: 1 });
    expect(r.counters.contextualOwnershipCreditViolations).toMatchObject({ value: null, state: "NOT_MEASURABLE" });
    expect(r.counters.distinctOwnedLineageLost).toMatchObject({ value: 317, state: "MEASURED" });
    expect(r.counters.sourceUnverifiableAuthoritativeIr).toMatchObject({ value: 0, state: "MEASURED" });
    expect(r.counters.silentIncompatibleMerges).toMatchObject({ value: 0, state: "MEASURED" });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.stringMatching(/contextualEmissionsCredited absent/)]);
  });

  it("with the canonical §18 field present the same artifact reads MEASURED (credited = 0, detected = 2) - detection is not credit", () => {
    const withField = { ...frozen, execution: { ...frozen.execution, sharded: { ...frozen.execution.sharded, contextualEmissionsCredited: 0 } } };
    const r = readShardTrust(withField);
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.counters.contextualOwnershipCreditViolations).toMatchObject({ value: 0, state: "MEASURED" });
    expect(r.sharded!.contextualEmissionsDetected).toBe(2);
  });

  it("never guesses: a list-shaped field, a missing block or a non-sharded execution is named explicitly and reads NOT_MEASURABLE", () => {
    const listShaped = { ...frozen, execution: { ...frozen.execution, sharded: { ...frozen.execution.sharded, contextualEmissions: [{ ownerShardId: null }, { ownerShardId: null }] } } };
    const r1 = readShardTrust(listShaped);
    expect(r1.ok).toBe(false);
    expect(r1.problems.join(" ")).toMatch(/is a list/);
    const r2 = readShardTrust({ status: "PARTIAL" });
    expect(r2.sharded).toBeNull();
    expect(r2.counters.distinctOwnedLineageLost.state).toBe("NOT_MEASURABLE");
    const r3 = readShardTrust({ execution: { mode: "SINGLE" } });
    expect(r3.executionMode).toBe("SINGLE");
    expect(r3.counters.contextualOwnershipCreditViolations.state).toBe("NOT_MEASURABLE");
  });
});
