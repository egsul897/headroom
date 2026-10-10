/**
 * Adversarial semantic safety for attemptVerifiedSimulate / EXECUTABLE badge.
 *
 * Asserts legal + computational semantics — never capacity-EXECUTED alone,
 * never silent path substitution, never rounded amount drift.
 * Provider-free / no Neon.
 */
import { describe, expect, it } from "vitest";
import {
  buildConsumeTransaction,
  isAffirmativelyExecutable,
  selectEnumeratedPath,
  summarizeVerifiedSimulate,
  validateVerifiedSimulateInputs,
  attemptVerifiedSimulate,
  type VerifiedSimulateResult,
} from "@/lib/product/unified-position/certified-simulate-bridge";
import type { CertifiedTransactionAttempt } from "@/lib/product/north-star-workflow/certified-transaction";
import type { EnumeratedCertifiedPath } from "@/lib/product/north-star-workflow/verified-path-enumeration";
import type { VerifiedExecutionPackage } from "@/lib/contract-model/verified-execution";
import { DEMO_EXERCISES } from "@/lib/product/north-star-workflow/demo-exercises";
import {
  buildFixtureVerifiedPackage,
  runFixtureCertifiedPath,
} from "@/lib/product/north-star-workflow/fixture-verified-package";

function candidate(pathId: string, ruleId = pathId.replace(/^path:/, "")): EnumeratedCertifiedPath {
  return {
    pathId,
    label: ruleId,
    status: "CANDIDATE",
    ruleId,
    sourceSectionRef: "§1",
    action: "INCUR_DEBT",
    covenantFamily: "DEBT",
    permission: {
      posture: "PERMISSION",
      ruleType: "CAPACITY",
      hasCapacityExpression: true,
      sufficiency: "COMPLETE",
    },
    conditions: [],
    financialTests: [],
    sharedCapacityInteractions: [],
    companionRestrictions: [],
    note: "test",
  };
}

function stubCertified(over: Partial<CertifiedTransactionAttempt> = {}): CertifiedTransactionAttempt {
  return {
    companyId: "co",
    evaluationDate: "2026-06-30",
    cutoffState: "RESOLVED",
    reportingPeriodKey: "2026Q2",
    approvedSnapshotId: "snap-1",
    ledgerUsageCount: 0,
    verifiedPackagePresent: true,
    capacity: { outcome: "EXECUTED" } as CertifiedTransactionAttempt["capacity"],
    simulation: null,
    blockers: [],
    authorityNote: "test",
    ...over,
  };
}

const stubPkg = { companyId: "co", instrumentKey: "inst" } as VerifiedExecutionPackage;

describe("selectEnumeratedPath — exact path identity", () => {
  it("fails closed on unknown explicit pathId (does not fall back to sole candidate)", () => {
    const only = candidate("path:rule-a", "rule-a");
    const r = selectEnumeratedPath([only], "path:stale-or-unknown");
    expect(r.chosen).toBeNull();
    expect(r.error).toBe("PATH_NOT_FOUND:path:stale-or-unknown");
    expect(r.autoSelected).toBe(false);
  });

  it("matches exact pathId when supplied among multiple candidates", () => {
    const a = candidate("path:a", "a");
    const b = candidate("path:b", "b");
    const r = selectEnumeratedPath([a, b], "path:b");
    expect(r.chosen?.pathId).toBe("path:b");
    expect(r.error).toBeNull();
    expect(r.autoSelected).toBe(false);
  });

  it("auto-selects only when no pathId and exactly one eligible candidate", () => {
    const only = candidate("path:solo", "solo");
    const r = selectEnumeratedPath([only], null);
    expect(r.chosen?.pathId).toBe("path:solo");
    expect(r.autoSelected).toBe(true);
    expect(r.error).toBeNull();
  });

  it("requires explicit selection when multiple candidates and no pathId", () => {
    const r = selectEnumeratedPath([candidate("path:a"), candidate("path:b")], undefined);
    expect(r.chosen).toBeNull();
    expect(r.error).toBe("PATH_SELECTION_REQUIRED:2_candidates");
    expect(r.autoSelected).toBe(false);
  });

  it("zero candidate paths → NO_CANDIDATE_PATHS", () => {
    const r = selectEnumeratedPath([], null);
    expect(r.error).toBe("NO_CANDIDATE_PATHS");
    expect(r.chosen).toBeNull();
  });

  it("empty-string pathId is treated as omitted (auto-select unique)", () => {
    const r = selectEnumeratedPath([candidate("path:solo")], "  ");
    expect(r.autoSelected).toBe(true);
    expect(r.chosen?.pathId).toBe("path:solo");
  });
});

describe("validateVerifiedSimulateInputs", () => {
  it("rejects nonfinite and negative amounts", () => {
    expect(validateVerifiedSimulateInputs({ amountMillions: NaN, evaluationDate: "2026-06-30" }).ok).toBe(false);
    expect(validateVerifiedSimulateInputs({ amountMillions: Infinity, evaluationDate: "2026-06-30" }).ok).toBe(false);
    const neg = validateVerifiedSimulateInputs({ amountMillions: -1, evaluationDate: "2026-06-30" });
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.blockers).toContain("INVALID_AMOUNT_NEGATIVE");
  });

  it("rejects malformed / non-calendar dates", () => {
    expect(validateVerifiedSimulateInputs({ amountMillions: 10, evaluationDate: "not-a-date" }).ok).toBe(false);
    expect(validateVerifiedSimulateInputs({ amountMillions: 10, evaluationDate: "2026-13-40" }).ok).toBe(false);
    expect(validateVerifiedSimulateInputs({ amountMillions: 10, evaluationDate: "2026-02-30" }).ok).toBe(false);
  });

  it("accepts whole-dollar convertible amounts without silent drift", () => {
    const ok = validateVerifiedSimulateInputs({ amountMillions: 100, evaluationDate: "2026-06-30" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.amountDollars).toBe("100000000");
      expect(ok.evaluationDate).toBe("2026-06-30");
    }
    // 0.000001M = $1 exactly
    const one = validateVerifiedSimulateInputs({ amountMillions: 0.000001, evaluationDate: "2026-01-01" });
    expect(one.ok).toBe(true);
    if (one.ok) expect(one.amountDollars).toBe("1");
  });

  it("rejects amounts that cannot convert to whole USD without rounding", () => {
    // 1e-10 millions → 0.0001 dollars — not a whole dollar
    const r = validateVerifiedSimulateInputs({
      amountMillions: 1e-10,
      evaluationDate: "2026-06-30",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockers).toContain("INVALID_AMOUNT_PRECISION");
  });
});

describe("isAffirmativelyExecutable — capacity EXECUTED ≠ permission", () => {
  const built = buildConsumeTransaction({
    companyId: "co",
    instrumentKey: "inst",
    evaluationDate: "2026-06-30",
    amountDollars: "100000000",
    ruleId: "rule-a",
    label: "test",
  });

  it("capacity EXECUTED alone (no transaction / simulation) is NOT executable", () => {
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: stubPkg,
        selectedPathId: null,
        selectedPath: null,
        transaction: null,
        certified: stubCertified({ simulation: null }),
        pathSelectionError: null,
      }),
    ).toBe(false);
  });

  it("wrapper simulation EXECUTED with NOT_SATISFIED path is NOT executable", () => {
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: stubPkg,
        selectedPathId: "path:rule-a",
        selectedPath: built.selectedPath,
        transaction: built.transaction,
        certified: stubCertified({
          simulation: {
            outcome: "EXECUTED",
            policy: "REQUIRE",
            packageHash: "h",
            envelope: {} as never,
            coverage: {} as never,
            capacity: {} as never,
            simulation: {
              simulationStatus: "SIMULATED",
              selectedPathResult: "NOT_SATISFIED",
              commitPlan: { committable: false },
            } as never,
          },
        }),
        pathSelectionError: null,
      }),
    ).toBe(false);
  });

  it("INSUFFICIENT_CAPACITY selected path is NOT executable", () => {
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: stubPkg,
        selectedPathId: "path:rule-a",
        selectedPath: built.selectedPath,
        transaction: built.transaction,
        certified: stubCertified({
          simulation: {
            outcome: "EXECUTED",
            policy: "REQUIRE",
            packageHash: "h",
            envelope: {} as never,
            coverage: {} as never,
            capacity: {} as never,
            simulation: {
              simulationStatus: "SIMULATED",
              selectedPathResult: "INSUFFICIENT_CAPACITY",
              commitPlan: { committable: false },
            } as never,
          },
        }),
        pathSelectionError: null,
      }),
    ).toBe(false);
  });

  it("REVIEW_REQUIRED selected path is NOT executable", () => {
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: stubPkg,
        selectedPathId: "path:rule-a",
        selectedPath: built.selectedPath,
        transaction: built.transaction,
        certified: stubCertified({
          simulation: {
            outcome: "EXECUTED",
            policy: "REQUIRE",
            packageHash: "h",
            envelope: {} as never,
            coverage: {} as never,
            capacity: {} as never,
            simulation: {
              simulationStatus: "SIMULATED",
              selectedPathResult: "REVIEW_REQUIRED",
              commitPlan: { committable: false },
            } as never,
          },
        }),
        pathSelectionError: null,
      }),
    ).toBe(false);
  });

  it("simulationStatus NEEDS_INPUT is NOT executable even if path SATISFIED", () => {
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: stubPkg,
        selectedPathId: "path:rule-a",
        selectedPath: built.selectedPath,
        transaction: built.transaction,
        certified: stubCertified({
          simulation: {
            outcome: "EXECUTED",
            policy: "REQUIRE",
            packageHash: "h",
            envelope: {} as never,
            coverage: {} as never,
            capacity: {} as never,
            simulation: {
              simulationStatus: "NEEDS_INPUT",
              selectedPathResult: "SATISFIED",
              commitPlan: { committable: false },
            } as never,
          },
        }),
        pathSelectionError: null,
      }),
    ).toBe(false);
  });

  it("outstanding blockers prevent EXECUTABLE", () => {
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: stubPkg,
        selectedPathId: "path:rule-a",
        selectedPath: built.selectedPath,
        transaction: built.transaction,
        certified: stubCertified({
          blockers: ["CUTOFF_UNRESOLVED"],
          simulation: {
            outcome: "EXECUTED",
            policy: "REQUIRE",
            packageHash: "h",
            envelope: {} as never,
            coverage: {} as never,
            capacity: {} as never,
            simulation: {
              simulationStatus: "SIMULATED",
              selectedPathResult: "SATISFIED",
              commitPlan: { committable: true },
            } as never,
          },
        }),
        pathSelectionError: null,
      }),
    ).toBe(false);
  });

  it("path selection error prevents EXECUTABLE", () => {
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: stubPkg,
        selectedPathId: "path:rule-a",
        selectedPath: built.selectedPath,
        transaction: built.transaction,
        certified: stubCertified({
          simulation: {
            outcome: "EXECUTED",
            policy: "REQUIRE",
            packageHash: "h",
            envelope: {} as never,
            coverage: {} as never,
            capacity: {} as never,
            simulation: {
              simulationStatus: "SIMULATED",
              selectedPathResult: "SATISFIED",
              commitPlan: { committable: true },
            } as never,
          },
        }),
        pathSelectionError: "PATH_NOT_FOUND:x",
      }),
    ).toBe(false);
  });

  it("affirmative: VEP + path + transaction + SIMULATED + SATISFIED + no blockers", () => {
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: stubPkg,
        selectedPathId: "path:rule-a",
        selectedPath: built.selectedPath,
        transaction: built.transaction,
        certified: stubCertified({
          simulation: {
            outcome: "EXECUTED",
            policy: "REQUIRE",
            packageHash: "h",
            envelope: {} as never,
            coverage: {} as never,
            capacity: {} as never,
            simulation: {
              simulationStatus: "SIMULATED",
              selectedPathResult: "SATISFIED",
              commitPlan: { committable: true },
            } as never,
          },
        }),
        pathSelectionError: null,
      }),
    ).toBe(true);
  });

  it("missing VEP is never executable", () => {
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: null,
        selectedPathId: "path:rule-a",
        selectedPath: built.selectedPath,
        transaction: built.transaction,
        certified: stubCertified(),
        pathSelectionError: null,
      }),
    ).toBe(false);
  });
});

describe("summarizeVerifiedSimulate — panel never upgrades capacity to EXECUTABLE", () => {
  it("capacityExecutedWithoutPermission when capacity ran but executable false", () => {
    const result: VerifiedSimulateResult = {
      certified: stubCertified({ simulation: null }),
      pathEnumeration: {
        authority: "NOT_CERTIFIED_4E",
        transactionKind: "SECURED_DEBT",
        secured: true,
        paths: [],
        stackingAssumed: false,
        incompleteReasons: [],
        unsupportedReasons: [],
        note: "",
      },
      selectedPathId: null,
      selectedPath: null,
      transaction: null,
      executable: false,
      refusalSummary: ["NO_TRANSACTION"],
      pathAutoSelected: false,
    };
    const s = summarizeVerifiedSimulate(result);
    expect(s.executable).toBe(false);
    expect(s.capacityExecutedWithoutPermission).toBe(true);
  });
});

describe("attemptVerifiedSimulate integration (provider-free refusals)", () => {
  it("missing VEP → not executable with NO_VERIFIED_EXECUTION_PACKAGE", async () => {
    const r = await attemptVerifiedSimulate({
      companyId: "no-vep",
      evaluationDate: "2026-06-30",
      amountMillions: 50,
      kind: "SECURED_DEBT",
      secured: true,
      verifiedPackage: null,
    });
    expect(r.executable).toBe(false);
    expect(r.refusalSummary).toContain("NO_VERIFIED_EXECUTION_PACKAGE");
    expect(r.transaction).toBeNull();
  });

  it("invalid amount refuses before constructing a transaction", async () => {
    const r = await attemptVerifiedSimulate({
      companyId: "co",
      evaluationDate: "2026-06-30",
      amountMillions: NaN,
      kind: "UNSECURED_DEBT",
      verifiedPackage: stubPkg,
      pathId: "path:x",
    });
    expect(r.executable).toBe(false);
    expect(r.refusalSummary).toContain("INVALID_AMOUNT_NONFINITE");
    expect(r.transaction).toBeNull();
  });

  it("explicit unmatched pathId fails closed even with VEP present", async () => {
    const exercise = DEMO_EXERCISES.find((e) => !e.fixtureIr.blockVerifiedPackage && e.fixtureIr.rules.length >= 1);
    expect(exercise).toBeDefined();
    const pkg = buildFixtureVerifiedPackage(exercise!);
    expect("blocked" in pkg && pkg.blocked).toBeFalsy();
    if ("blocked" in pkg) return;
    const r = await attemptVerifiedSimulate({
      companyId: pkg.companyId,
      evaluationDate: "2026-06-30",
      amountMillions: 10,
      kind: "SECURED_DEBT",
      secured: true,
      verifiedPackage: pkg,
      pathId: "path:definitely-not-a-real-path",
    });
    expect(r.executable).toBe(false);
    expect(r.refusalSummary.some((b) => b.startsWith("PATH_NOT_FOUND:"))).toBe(true);
    expect(r.selectedPathId).toBeNull();
    expect(r.transaction).toBeNull();
  });
});

describe("fixture path: SATISFIED simulation feeds affirmative gate", () => {
  it("runFixtureCertifiedPath with simulateConsumeUsd feeds SATISFIED → executable", () => {
    const exercise = DEMO_EXERCISES.find(
      (e) =>
        !e.fixtureIr.blockVerifiedPackage &&
        e.fixtureIr.simulateConsumeUsd &&
        e.fixtureIr.rules.length >= 1,
    );
    expect(exercise).toBeDefined();
    const run = runFixtureCertifiedPath(exercise!);
    expect(run.blocked).toBeFalsy();
    if (run.blocked || !run.capacity || run.capacity.outcome !== "EXECUTED") {
      throw new Error("expected EXECUTED capacity on fixture with simulateConsumeUsd");
    }
    expect(run.simulation?.outcome).toBe("EXECUTED");
    if (!run.simulation || run.simulation.outcome !== "EXECUTED") return;
    const sim = run.simulation.simulation;
    const built = buildConsumeTransaction({
      companyId: "co",
      instrumentKey: "inst",
      evaluationDate: "2026-06-30",
      amountDollars: exercise!.fixtureIr.simulateConsumeUsd!,
      ruleId: exercise!.fixtureIr.rules[0]!.ruleId,
      label: "fixture",
    });
    const ok = isAffirmativelyExecutable({
      verifiedPackage: stubPkg,
      selectedPathId: `path:${exercise!.fixtureIr.rules[0]!.ruleId}`,
      selectedPath: built.selectedPath,
      transaction: built.transaction,
      certified: stubCertified({
        capacity: run.capacity,
        simulation: run.simulation,
      }),
      pathSelectionError: null,
    });
    expect(sim.simulationStatus).toBe("SIMULATED");
    expect(sim.selectedPathResult).toBe("SATISFIED");
    expect(ok).toBe(true);
  });
});

describe("buildConsumeTransaction identity + amount fidelity", () => {
  it("embeds exact dollar string and stable transaction id including amount", () => {
    const a = buildConsumeTransaction({
      companyId: "co",
      instrumentKey: "inst",
      evaluationDate: "2026-06-30",
      amountDollars: "123456789",
      ruleId: "r1",
      label: "t",
    });
    expect(a.transaction.intendedAmount).toEqual({
      type: "MONEY",
      amount: "123456789",
      currency: "USD",
    });
    const effect = a.transaction.effects[0]!;
    expect(effect.kind).toBe("CONSUME_CAPACITY");
    if (effect.kind === "CONSUME_CAPACITY") {
      expect(effect.amount).toEqual({ type: "MONEY", amount: "123456789", currency: "USD" });
    }
    expect(a.transaction.transactionId).toContain("123456789");
  });
});
