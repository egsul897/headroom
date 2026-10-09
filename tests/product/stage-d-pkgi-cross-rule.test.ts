/**
 * Stage D Cycle 5 — companion-REQUIRES discharge:
 * finite MONEY + SOURCE_REFERENCE_RESOLVED REQUIRES → package executes;
 * UNLIMITED behind gates still refuses; debt-side sim SATISFIED; lien stays
 * REVIEW_REQUIRED on ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  isCompanionRequiresDischargeable,
  type VerifiedExecutionPackage,
} from "../../lib/contract-model/verified-execution";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";

const VEP_PATH = "docs/product/customer-workflow/stage-d-pkgi-entity-scope/verified-execution-package.json";
const ARTIFACTS = "docs/product/customer-workflow/stage-d-pkgi-cross-rule";
const AS_OF = "2026-12-31";

function loadPkg(): VerifiedExecutionPackage {
  return JSON.parse(fs.readFileSync(VEP_PATH, "utf8")) as VerifiedExecutionPackage;
}

describe("Stage D companion-REQUIRES discharge", () => {
  it("discharges §7.02(b) REQUIRES §7.01(b) when finite MONEY and target permission present", () => {
    const pkg = loadPkg();
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    expect(isCompanionRequiresDischargeable(lien, pkg.rules)).toBe(true);
    expect(lien.capacityExpression?.kind).not.toBe("UNLIMITED_CAPACITY");
  });

  it("does not discharge UNLIMITED capacity behind REQUIRES", () => {
    const pkg = loadPkg();
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    const unlimited = {
      ...lien,
      capacityExpression: {
        kind: "UNLIMITED_CAPACITY" as const,
        type: "CAPACITY" as const,
        gatedBy: null,
        inventoryItemIds: [] as string[],
      },
    };
    expect(isCompanionRequiresDischargeable(unlimited, pkg.rules)).toBe(false);
  });

  it("evaluates §7.01(b) AVAILABLE and keeps §7.02(b) REVIEW_REQUIRED; debt sim SATISFIED", () => {
    const pkg = loadPkg();
    const debt = pkg.rules.find((r) => r.sourceSectionRef === "7.01(b)")!;
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    const inputs = snapshotInputResolver({
      snapshots: [],
      definitions: [...(pkg.definitions ?? [])],
      rules: [...pkg.rules],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
    });
    const capacity = evaluateVerifiedCapacity({ package: pkg, inputs, ledger: [], asOf: AS_OF });
    expect(capacity.outcome).toBe("EXECUTED");
    if (capacity.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const debtCap = capacity.state.capacities.find((c) => c.ruleId === debt.ruleId)!;
    const lienCap = capacity.state.capacities.find((c) => c.ruleId === lien.ruleId)!;
    expect(debtCap.status).toBe("AVAILABLE");
    expect(lienCap.status).toBe("REVIEW_REQUIRED");
    expect(lienCap.limitations.some((l) => l.code === "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON")).toBe(true);

    const sim = simulateVerifiedTransaction({
      package: pkg,
      inputs,
      ledger: [],
      asOf: AS_OF,
      transaction: {
        transactionId: "test-stage-d-15m",
        companyId: pkg.companyId,
        instrumentKey: pkg.instrumentKey,
        effectiveAsOf: AS_OF,
        category: "INCUR_DEBT",
        label: "test",
        effects: [
          {
            effectId: "e1",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: debtCap.capacityNodeId,
            amount: { type: "MONEY", amount: "15000000", currency: "USD" },
          },
        ],
        intendedAmount: { type: "MONEY", amount: "15000000", currency: "USD" },
        unallocatedAmount: null,
        provenance: {
          source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
          sourceVersion: "test",
          approvalRef: "SYNTHETIC_NOT_CUSTOMER",
        },
      },
      selectedPath: {
        capacityNodeIds: [debtCap.capacityNodeId],
        ruleIds: [debt.ruleId],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
    });
    expect(sim.outcome).toBe("EXECUTED");
    if (sim.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    expect(sim.simulation.selectedPathResult).toBe("SATISFIED");
  });

  it("execution artifacts record debt AVAILABLE/SATISFIED and lien REVIEW_REQUIRED", () => {
    expect(fs.existsSync(`${ARTIFACTS}/04-capacity-require.json`)).toBe(true);
    expect(fs.existsSync(`${ARTIFACTS}/05-phase4d-simulation.json`)).toBe(true);
    const capacity = JSON.parse(fs.readFileSync(`${ARTIFACTS}/04-capacity-require.json`, "utf8")) as {
      debt701b: { status: string };
      lien702b: { status: string; limitations: Array<{ code: string }> };
    };
    expect(capacity.debt701b.status).toBe("AVAILABLE");
    expect(capacity.lien702b.status).toBe("REVIEW_REQUIRED");
    const sim = JSON.parse(fs.readFileSync(`${ARTIFACTS}/05-phase4d-simulation.json`, "utf8")) as {
      simulation: { selectedPathResult: string };
    };
    expect(sim.simulation.selectedPathResult).toBe("SATISFIED");
  });
});
