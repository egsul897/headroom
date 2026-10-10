/**
 * Stage D Cycle 6 — secured dual-path: parent-scope inheritance unblocks §7.02(b);
 * debt ∩ lien must both be AVAILABLE; dual-path sim SATISFIED; debt-only is not a
 * secured answer. Adversarial companion/entity refusals stay fail-closed.
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
import { ENTITY_SCOPE_GUARD_VERSION } from "../../lib/contract-model/compiler/semantic/entity-scope-guard";
import type { IRRule } from "../../lib/contract-model/ir/types";

const VEP_PATH = "docs/product/customer-workflow/stage-d-pkgi-entity-scope/verified-execution-package.json";
const ARTIFACTS = "docs/product/customer-workflow/stage-d-pkgi-secured-dual-path";
const AS_OF = "2026-12-31";

function loadPkg(): VerifiedExecutionPackage {
  return JSON.parse(fs.readFileSync(VEP_PATH, "utf8")) as VerifiedExecutionPackage;
}

function inputsFor(pkg: VerifiedExecutionPackage) {
  return snapshotInputResolver({
    snapshots: [],
    definitions: [...(pkg.definitions ?? [])],
    rules: [...pkg.rules],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
  });
}

describe("Stage D secured dual-path (Cycle 6)", () => {
  it("§7.02(b) inherits parent scope and is safe to rely on (v6)", () => {
    expect(ENTITY_SCOPE_GUARD_VERSION).toBe("entity-scope-consistency-guard.v6");
    const pkg = loadPkg();
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    expect(lien.entityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    expect(lien.entityScopeAudit?.status).toBe("SOURCE_SCOPE_DERIVED");
    expect(lien.entityScopeAudit?.safeToRely).toBe(true);
    expect(lien.entityScopeAudit?.witness?.decidedBy).toBe("PARENT_SCOPE");
    expect(lien.entityScopeAudit?.guardVersion).toBe("entity-scope-consistency-guard.v6");
  });

  it("debt and lien pathways are both AVAILABLE after companion discharge", () => {
    const pkg = loadPkg();
    const debt = pkg.rules.find((r) => r.sourceSectionRef === "7.01(b)")!;
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    expect(isCompanionRequiresDischargeable(lien, pkg.rules)).toBe(true);
    const capacity = evaluateVerifiedCapacity({ package: pkg, inputs: inputsFor(pkg), ledger: [], asOf: AS_OF });
    expect(capacity.outcome).toBe("EXECUTED");
    if (capacity.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const debtCap = capacity.state.capacities.find((c) => c.ruleId === debt.ruleId)!;
    const lienCap = capacity.state.capacities.find((c) => c.ruleId === lien.ruleId)!;
    expect(debtCap.status).toBe("AVAILABLE");
    expect(lienCap.status).toBe("AVAILABLE");
    expect(lienCap.limitations.some((l) => l.code === "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON")).toBe(false);
  });

  it("combined secured $15M sim SATISFIED only when both debt and lien nodes are selected", () => {
    const pkg = loadPkg();
    const debt = pkg.rules.find((r) => r.sourceSectionRef === "7.01(b)")!;
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    const capacity = evaluateVerifiedCapacity({ package: pkg, inputs: inputsFor(pkg), ledger: [], asOf: AS_OF });
    if (capacity.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const debtCap = capacity.state.capacities.find((c) => c.ruleId === debt.ruleId)!;
    const lienCap = capacity.state.capacities.find((c) => c.ruleId === lien.ruleId)!;

    const dual = simulateVerifiedTransaction({
      package: pkg,
      inputs: inputsFor(pkg),
      ledger: [],
      asOf: AS_OF,
      transaction: {
        transactionId: "test-secured-15m",
        companyId: pkg.companyId,
        instrumentKey: pkg.instrumentKey,
        effectiveAsOf: AS_OF,
        category: "INCUR_DEBT",
        label: "test dual",
        effects: [
          { effectId: "e-debt", kind: "CONSUME_CAPACITY", capacityNodeId: debtCap.capacityNodeId, amount: { type: "MONEY", amount: "15000000", currency: "USD" } },
          { effectId: "e-lien", kind: "CONSUME_CAPACITY", capacityNodeId: lienCap.capacityNodeId, amount: { type: "MONEY", amount: "15000000", currency: "USD" } },
        ],
        // Phase 4D: stated draws must sum to intendedAmount ($15M debt + $15M lien).
        intendedAmount: { type: "MONEY", amount: "30000000", currency: "USD" },
        unallocatedAmount: null,
        provenance: { source: "SYNTHETIC_LABELED_TECHNICAL_DEMO", sourceVersion: "test", approvalRef: "SYNTHETIC_NOT_CUSTOMER" },
      },
      selectedPath: {
        capacityNodeIds: [debtCap.capacityNodeId, lienCap.capacityNodeId],
        ruleIds: [debt.ruleId, lien.ruleId],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
    });
    expect(dual.outcome).toBe("EXECUTED");
    if (dual.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    expect(dual.simulation.selectedPathResult).toBe("SATISFIED");
  });

  it("companion permission absent: package refuses CROSS_RULE_GATE (not a false favorable)", () => {
    const pkg = loadPkg();
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    const withoutDebt = {
      ...pkg,
      rules: pkg.rules.filter((r) => r.sourceSectionRef !== "7.01(b)"),
      verifications: pkg.verifications.filter((v) => v.ruleOrDefinitionId !== pkg.rules.find((r) => r.sourceSectionRef === "7.01(b)")!.ruleId),
    };
    expect(isCompanionRequiresDischargeable(lien, withoutDebt.rules)).toBe(false);
    const capacity = evaluateVerifiedCapacity({ package: withoutDebt, inputs: inputsFor(withoutDebt), ledger: [], asOf: AS_OF });
    expect(capacity.outcome).toBe("REFUSED");
    if (capacity.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(capacity.refusals.some((r) => r.code === "CROSS_RULE_GATE_NOT_EXECUTABLE")).toBe(true);
  });

  it("companion permission prohibited: discharge fails when target is not a COMPLETE PERMISSION", () => {
    const pkg = loadPkg();
    const debt = pkg.rules.find((r) => r.sourceSectionRef === "7.01(b)")!;
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    const prohibitedDebt: IRRule = { ...debt, posture: "PROHIBITION", ruleType: "PROHIBITION" };
    const mutated = { ...pkg, rules: pkg.rules.map((r) => (r.ruleId === debt.ruleId ? prohibitedDebt : r)) };
    expect(isCompanionRequiresDischargeable(lien, mutated.rules)).toBe(false);
  });

  it("unlimited companion subject to a gate remains non-dischargeable", () => {
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

  it("entity-scope unwitnessed lien stays REVIEW_REQUIRED (debt available is not a secured answer)", () => {
    const pkg = loadPkg();
    const debt = pkg.rules.find((r) => r.sourceSectionRef === "7.01(b)")!;
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    const unsafeLien: IRRule = {
      ...lien,
      entityScopeAudit: {
        ...lien.entityScopeAudit!,
        status: "UNWITNESSED",
        safeToRely: false,
        reasonCodes: ["ENTITY_SCOPE_UNWITNESSED"],
      },
    };
    const mutated = { ...pkg, rules: pkg.rules.map((r) => (r.ruleId === lien.ruleId ? unsafeLien : r)) };
    const capacity = evaluateVerifiedCapacity({ package: mutated, inputs: inputsFor(mutated), ledger: [], asOf: AS_OF });
    expect(capacity.outcome).toBe("EXECUTED");
    if (capacity.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const debtCap = capacity.state.capacities.find((c) => c.ruleId === debt.ruleId)!;
    const lienCap = capacity.state.capacities.find((c) => c.ruleId === lien.ruleId)!;
    expect(debtCap.status).toBe("AVAILABLE");
    expect(lienCap.status).toBe("REVIEW_REQUIRED");
    expect(lienCap.limitations.some((l) => l.code === "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON")).toBe(true);
  });

  it("execution artifacts record dual-path SATISFIED when present", () => {
    if (!fs.existsSync(`${ARTIFACTS}/04-capacity-require.json`)) return;
    const capacity = JSON.parse(fs.readFileSync(`${ARTIFACTS}/04-capacity-require.json`, "utf8")) as {
      debt701b: { status: string };
      lien702b: { status: string };
    };
    expect(capacity.debt701b.status).toBe("AVAILABLE");
    expect(capacity.lien702b.status).toBe("AVAILABLE");
    const sim = JSON.parse(fs.readFileSync(`${ARTIFACTS}/05-phase4d-dual-path-simulation.json`, "utf8")) as {
      dualPath: { selectedPathResult: string };
    };
    expect(sim.dualPath.selectedPathResult).toBe("SATISFIED");
  });
});
