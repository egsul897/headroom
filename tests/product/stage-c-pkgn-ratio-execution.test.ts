/**
 * Stage C — pkg-n-clean-ratio §7.01(c) ratio basket:
 * DERIVED VEP → 4E CANDIDATE → REQUIRE capacity with labeled synthetic TNLR →
 * 4D SATISFIED. Also pins correct refusals and the pro-forma manner discharge.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateVerifiedCapacity, simulateVerifiedTransaction } from "../../lib/contract-model/verified-execution";
import type { VerifiedExecutionPackage } from "../../lib/contract-model/verified-execution";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";
import { buildCapacityGraph } from "../../lib/contract-model/runtime/capacity/graph";
import { rationalFromString } from "../../lib/contract-model/runtime/decimal";
import type { FinancialSnapshot } from "../../lib/contract-model/runtime/input/types";

const VEP_PATH = "docs/product/customer-workflow/acceptance-certified-vep/pkg-n-clean-ratio/verified-execution-package.json";
const ARTIFACTS = "docs/product/customer-workflow/stage-c-pkgn-ratio-execution";
const RATIO_RULE_ID = "ir-rule:482a6fb7f6984ae5932dec28";
const AS_OF = "2026-12-31";

function loadPkg(): VerifiedExecutionPackage {
  return JSON.parse(fs.readFileSync(VEP_PATH, "utf8")) as VerifiedExecutionPackage;
}

function ratioSnapshot(pkg: VerifiedExecutionPackage, ratio: string): FinancialSnapshot {
  const graph = buildCapacityGraph({
    rules: pkg.rules,
    definitions: pkg.definitions ?? [],
    sharedCapacities: pkg.sharedCapacities ?? [],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
    asOf: AS_OF,
  });
  const dep = graph.dependencyManifest.dependencies.find((d) => d.key === "Total Net Leverage Ratio");
  if (!dep) throw new Error("missing TNLR dependency");
  const lineage = { exprId: null, inputKeys: [] as string[] };
  return {
    snapshotId: `test-tnlr-${ratio}`,
    version: "1",
    companyId: pkg.companyId,
    asOf: AS_OF,
    reportingPeriod: "test",
    status: "APPROVED",
    supersedesSnapshotId: null,
    provenance: {
      source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
      sourceVersion: "test",
      note: "labeled synthetic — not a certified customer result",
    },
    review: { reviewedBy: "test", reviewedAt: "2026-10-09T00:00:00Z", approvalRef: "SYNTHETIC_NOT_CUSTOMER" },
    inputs: [
      {
        identity: {
          companyId: dep.companyId ?? pkg.companyId,
          scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: dep.instrumentKey! },
          inputKind: dep.inputKind,
          key: dep.key,
          identityStrength: dep.identityStrength,
          period: dep.period,
          asOf: dep.asOf ?? AS_OF,
          valueType: "RATIO",
          currency: null,
        },
        value: { type: "RATIO", value: rationalFromString(ratio), lineage },
        sourceVersion: "test",
        note: `SYNTHETIC TNLR=${ratio}`,
      },
    ],
  };
}

describe("Stage C pkg-n §7.01(c) ratio debt execution", () => {
  it("enumerates a CERTIFIED_4E CANDIDATE path for the ratio basket", () => {
    const pkg = loadPkg();
    const enumeration = enumerateCertifiedPaths({
      verifiedPackage: pkg,
      transactionKind: "UNSECURED_DEBT",
      secured: false,
    });
    expect(enumeration.authority).toBe("CERTIFIED_4E");
    const ratioPath = enumeration.paths.find((p) => p.ruleId === RATIO_RULE_ID);
    expect(ratioPath?.status).toBe("CANDIDATE");
    expect(ratioPath?.sourceSectionRef).toBe("7.01(c)");
    expect(ratioPath?.financialTests.some((t) => /Total Net Leverage/i.test(t))).toBe(true);
  });

  it("refuses capacity without TNLR and when the ratio gate fails", () => {
    const pkg = loadPkg();
    const empty = snapshotInputResolver({
      snapshots: [],
      definitions: [...(pkg.definitions ?? [])],
      rules: [...pkg.rules],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
    });
    const capEmpty = evaluateVerifiedCapacity({ package: pkg, inputs: empty, ledger: [], asOf: AS_OF });
    expect(capEmpty.outcome).toBe("EXECUTED");
    if (capEmpty.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const missing = capEmpty.state.capacities.find((c) => c.ruleId === RATIO_RULE_ID)!;
    expect(missing.status).toBe("NEEDS_INPUT");

    const failInputs = snapshotInputResolver({
      snapshots: [ratioSnapshot(pkg, "4.0")],
      definitions: [...(pkg.definitions ?? [])],
      rules: [...pkg.rules],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
    });
    const capFail = evaluateVerifiedCapacity({ package: pkg, inputs: failInputs, ledger: [], asOf: AS_OF });
    expect(capFail.outcome).toBe("EXECUTED");
    if (capFail.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const gated = capFail.state.capacities.find((c) => c.ruleId === RATIO_RULE_ID)!;
    expect(gated.effectiveRemaining).toEqual({ kind: "GATE_NOT_SATISFIED" });
  });

  it("executes AVAILABLE unlimited capacity and SATISFIED simulation under synthetic TNLR 2.5", () => {
    const pkg = loadPkg();
    const inputs = snapshotInputResolver({
      snapshots: [ratioSnapshot(pkg, "2.5")],
      definitions: [...(pkg.definitions ?? [])],
      rules: [...pkg.rules],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
    });
    expect(inputs).toBeTruthy();
    const capacity = evaluateVerifiedCapacity({ package: pkg, inputs, ledger: [], asOf: AS_OF });
    expect(capacity.outcome).toBe("EXECUTED");
    if (capacity.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const entry = capacity.state.capacities.find((c) => c.ruleId === RATIO_RULE_ID)!;
    expect(entry.status).toBe("AVAILABLE");
    expect(entry.effectiveRemaining).toEqual({ kind: "UNLIMITED", gate: "SATISFIED" });

    const sim = simulateVerifiedTransaction({
      package: pkg,
      inputs,
      ledger: [],
      asOf: AS_OF,
      transaction: {
        transactionId: "test-stage-c-10m",
        companyId: pkg.companyId,
        instrumentKey: pkg.instrumentKey,
        effectiveAsOf: AS_OF,
        category: "INCUR_DEBT",
        label: "SYNTHETIC $10M ratio debt",
        effects: [
          {
            effectId: "e1",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: entry.capacityNodeId,
            amount: { type: "MONEY", amount: "10000000", currency: "USD" },
          },
        ],
        intendedAmount: { type: "MONEY", amount: "10000000", currency: "USD" },
        unallocatedAmount: null,
        provenance: {
          source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
          sourceVersion: "test",
          approvalRef: "SYNTHETIC_NOT_CUSTOMER",
        },
      },
      selectedPath: {
        capacityNodeIds: [entry.capacityNodeId],
        ruleIds: [entry.ruleId],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
    });
    expect(sim.outcome).toBe("EXECUTED");
    if (sim.outcome !== "EXECUTED") throw new Error("expected sim EXECUTED");
    expect(sim.simulation.selectedPathResult).toBe("SATISFIED");
    expect(sim.simulation.capacityEffects[0]?.outcome).toBe("SATISFIED");
    expect(sim.simulation.commitPlan.committable).toBe(true);
    // Expressionless PRO_FORMA manner condition is discharged, not left UNSUPPORTED.
    const proForma = sim.simulation.conditions.find((c) => /pro forma/i.test(c.description));
    expect(proForma?.result).toBe("SATISFIED");
    expect(proForma?.reason).toMatch(/discharged|evaluated true/i);
  });

  it("persisted Stage C artifacts stay labeled synthetic and report SATISFIED", () => {
    const report = fs.readFileSync(path.join(ARTIFACTS, "00-execution-report.md"), "utf8");
    expect(report).toContain("SYNTHETIC_LABELED_TECHNICAL_DEMO");
    expect(report).toContain("selectedPathResult=SATISFIED");
    expect(report).not.toMatch(/customer-certified execution|authentic EDGAR CERTIFIED/i);
    const sim = JSON.parse(fs.readFileSync(path.join(ARTIFACTS, "05-phase4d-simulation.json"), "utf8")) as {
      certifiedCustomerResult: boolean;
      simulation: { selectedPathResult: string };
    };
    expect(sim.certifiedCustomerResult).toBe(false);
    expect(sim.simulation.selectedPathResult).toBe("SATISFIED");
  });
});
