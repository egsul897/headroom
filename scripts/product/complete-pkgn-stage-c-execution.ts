/**
 * Stage C — ratio-dependent basket execution over acceptance pkg-n-clean-ratio.
 *
 * Loads the existing DERIVED VEP (mocked Layer-2; zero paid inference; no FIXTURE_IR
 * invention in this script). Supplies labeled SYNTHETIC Total Net Leverage Ratio,
 * evaluates REQUIRE capacity, and simulates a $10M INCUR_DEBT under §7.01(c).
 *
 * Also records correct refusals: missing ratio → NEEDS_INPUT; ratio above 3.00 →
 * GATE_NOT_SATISFIED. Not a customer-certified financial result.
 */
import fs from "node:fs";
import path from "node:path";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  type VerifiedExecutionPackage,
} from "../../lib/contract-model/verified-execution";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";
import { buildCapacityGraph } from "../../lib/contract-model/runtime/capacity/graph";
import { rationalFromString } from "../../lib/contract-model/runtime/decimal";
import type { DependencyRecord, FinancialSnapshot } from "../../lib/contract-model/runtime/input/types";

const OUT = "docs/product/customer-workflow/stage-c-pkgn-ratio-execution";
const VEP_PATH = "docs/product/customer-workflow/acceptance-certified-vep/pkg-n-clean-ratio/verified-execution-package.json";
const RATIO_RULE_ID = "ir-rule:482a6fb7f6984ae5932dec28";
const AS_OF = "2026-12-31";
const SYNTHETIC_TNLR = "2.5";
const SYNTHETIC_TXN_USD = "10000000";

function write(name: string, value: unknown): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function loadPkg(): VerifiedExecutionPackage {
  const pkg = JSON.parse(fs.readFileSync(VEP_PATH, "utf8")) as VerifiedExecutionPackage;
  if (!pkg.rules.some((r) => r.ruleId === RATIO_RULE_ID && r.sourceSectionRef === "7.01(c)")) {
    throw new Error("pkg-n VEP missing CERTIFIED §7.01(c) ratio rule");
  }
  return pkg;
}

function tnlrDep(pkg: VerifiedExecutionPackage): DependencyRecord {
  const graph = buildCapacityGraph({
    rules: pkg.rules,
    definitions: pkg.definitions ?? [],
    sharedCapacities: pkg.sharedCapacities ?? [],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
    asOf: AS_OF,
  });
  const dep = graph.dependencyManifest.dependencies.find((d) => d.key === "Total Net Leverage Ratio");
  if (!dep) throw new Error("expected Total Net Leverage Ratio dependency on §7.01(c)");
  return dep;
}

function syntheticRatioSnapshot(pkg: VerifiedExecutionPackage, dep: DependencyRecord, ratio: string): FinancialSnapshot {
  const lineage = { exprId: null, inputKeys: [] as string[] };
  return {
    snapshotId: `synthetic-tnlr-pkgn-${ratio}`,
    version: "1",
    companyId: pkg.companyId,
    asOf: AS_OF,
    reportingPeriod: "FY2026-SYNTHETIC",
    status: "APPROVED",
    supersedesSnapshotId: null,
    provenance: {
      source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
      sourceVersion: "stage-c-demo-1",
      note: "Labeled synthetic Total Net Leverage Ratio for Stage C technical demonstration — NEVER a certified customer financial result",
    },
    review: {
      reviewedBy: "technical-demo-script",
      reviewedAt: "2026-10-09T00:00:00Z",
      approvalRef: "SYNTHETIC_NOT_CUSTOMER",
    },
    inputs: [
      {
        identity: {
          companyId: dep.companyId ?? pkg.companyId,
          scope: dep.instrumentKey
            ? { kind: "INSTRUMENT_LEVEL" as const, instrumentKey: dep.instrumentKey }
            : { kind: "COMPANY_LEVEL" as const, instrumentApplicability: { kind: "ALL_INSTRUMENTS" as const } },
          inputKind: dep.inputKind,
          key: dep.key,
          identityStrength: dep.identityStrength,
          period: dep.period,
          asOf: dep.asOf ?? AS_OF,
          valueType: "RATIO",
          currency: null,
        },
        value: { type: "RATIO", value: rationalFromString(ratio), lineage },
        sourceVersion: "synthetic-demo",
        note: `SYNTHETIC: Total Net Leverage Ratio = ${ratio} (pro forma); §7.01(c) gate is ≤ 3.00`,
      },
    ],
  };
}

function main(): void {
  const pkg = loadPkg();
  const dep = tnlrDep(pkg);

  const enumDebt = enumerateCertifiedPaths({ verifiedPackage: pkg, transactionKind: "UNSECURED_DEBT", secured: false });
  write("02-phase4e-enumeration.json", {
    schema: "stage-c-pkgn-phase4e.v1",
    paidProvidersCalled: false,
    packageId: "pkg-n-clean-ratio",
    authority: enumDebt.authority,
    pathCount: enumDebt.paths.length,
    paths: enumDebt.paths.map((p) => ({
      pathId: p.pathId,
      status: p.status,
      action: p.action,
      ruleId: p.ruleId,
      sourceSectionRef: p.sourceSectionRef,
      financialTests: p.financialTests,
    })),
    note: "Acceptance DERIVED VEP — synthetic issuer Oakhurst; not authentic EDGAR CERTIFIED.",
  });

  // Missing input refusal
  const emptyInputs = snapshotInputResolver({
    snapshots: [],
    definitions: [...(pkg.definitions ?? [])],
    rules: [...pkg.rules],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
  });
  const capEmpty = evaluateVerifiedCapacity({ package: pkg, inputs: emptyInputs, ledger: [], asOf: AS_OF });
  const emptyRatio =
    capEmpty.outcome === "EXECUTED"
      ? capEmpty.state.capacities.find((c) => c.ruleId === RATIO_RULE_ID)
      : null;

  // Gate-fail refusal
  const failSnap = syntheticRatioSnapshot(pkg, dep, "4.0");
  const failInputs = snapshotInputResolver({
    snapshots: [failSnap],
    definitions: [...(pkg.definitions ?? [])],
    rules: [...pkg.rules],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
  });
  const capFail = evaluateVerifiedCapacity({ package: pkg, inputs: failInputs, ledger: [], asOf: AS_OF });
  const failRatio =
    capFail.outcome === "EXECUTED"
      ? capFail.state.capacities.find((c) => c.ruleId === RATIO_RULE_ID)
      : null;

  // Success path
  const snapshot = syntheticRatioSnapshot(pkg, dep, SYNTHETIC_TNLR);
  write("01-synthetic-inputs.json", {
    schema: "stage-c-pkgn-synthetic-inputs.v1",
    label: "SYNTHETIC_LABELED_TECHNICAL_DEMO — not a certified customer result",
    certifiedCustomerResult: false,
    asOf: AS_OF,
    totalNetLeverageRatio: SYNTHETIC_TNLR,
    snapshot: {
      snapshotId: snapshot.snapshotId,
      provenance: snapshot.provenance,
      inputs: snapshot.inputs.map((i) => ({ key: i.identity.key, note: i.note, value: SYNTHETIC_TNLR })),
    },
  });

  const inputs = snapshotInputResolver({
    snapshots: [snapshot],
    definitions: [...(pkg.definitions ?? [])],
    rules: [...pkg.rules],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
  });
  const capacity = evaluateVerifiedCapacity({ package: pkg, inputs, ledger: [], asOf: AS_OF });
  write("04-capacity-require.json", {
    schema: "stage-c-pkgn-capacity-require.v1",
    paidProvidersCalled: false,
    financialInputs: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
    certifiedCustomerResult: false,
    asOf: AS_OF,
    success:
      capacity.outcome === "EXECUTED"
        ? capacity.state.capacities
            .filter((c) => c.ruleId === RATIO_RULE_ID)
            .map((c) => ({
              capacityNodeId: c.capacityNodeId,
              ruleId: c.ruleId,
              status: c.status,
              effectiveRemaining: c.effectiveRemaining,
            }))
        : capacity,
    refusals: {
      missingInput: emptyRatio
        ? { status: emptyRatio.status, remaining: emptyRatio.effectiveRemaining, limitations: emptyRatio.limitations }
        : capEmpty,
      ratioAboveCap: failRatio
        ? { status: failRatio.status, remaining: failRatio.effectiveRemaining, limitations: failRatio.limitations }
        : capFail,
    },
  });

  if (capacity.outcome !== "EXECUTED") {
    write("00-blocker-report.md", `# Stage C blocked\n\n${JSON.stringify(capacity, null, 2)}\n`);
    console.error("capacity not EXECUTED");
    process.exit(2);
  }
  const entry = capacity.state.capacities.find((c) => c.ruleId === RATIO_RULE_ID);
  if (!entry || entry.status !== "AVAILABLE" || entry.effectiveRemaining.kind !== "UNLIMITED") {
    console.error("unexpected §7.01(c) capacity", entry);
    process.exit(2);
  }

  const sim = simulateVerifiedTransaction({
    package: pkg,
    inputs,
    ledger: [],
    asOf: AS_OF,
    transaction: {
      transactionId: "stage-c-ratio-debt-10m",
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
      effectiveAsOf: AS_OF,
      category: "INCUR_DEBT",
      label: "SYNTHETIC $10M ratio debt under §7.01(c)",
      effects: [
        {
          effectId: "e1",
          kind: "CONSUME_CAPACITY",
          capacityNodeId: entry.capacityNodeId,
          amount: { type: "MONEY", amount: SYNTHETIC_TXN_USD, currency: "USD" },
        },
      ],
      intendedAmount: { type: "MONEY", amount: SYNTHETIC_TXN_USD, currency: "USD" },
      unallocatedAmount: null,
      provenance: {
        source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
        sourceVersion: "stage-c-demo-1",
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

  write("05-phase4d-simulation.json", {
    schema: "stage-c-pkgn-phase4d.v1",
    paidProvidersCalled: false,
    certifiedCustomerResult: false,
    simulation:
      sim.outcome === "EXECUTED"
        ? {
            simulationStatus: sim.simulation.simulationStatus,
            selectedPathResult: sim.simulation.selectedPathResult,
            capacityEffects: sim.simulation.capacityEffects,
            effects: sim.simulation.effects,
            conditions: sim.simulation.conditions.map((c) => ({
              conditionId: c.conditionId,
              result: c.result,
              reason: c.reason,
              description: c.description,
            })),
            limitations: sim.simulation.limitations,
            committable: sim.simulation.commitPlan.committable,
          }
        : sim,
  });

  if (sim.outcome !== "EXECUTED" || sim.simulation.selectedPathResult !== "SATISFIED") {
    console.error("unexpected simulation", sim.outcome === "EXECUTED" ? sim.simulation.selectedPathResult : sim);
    process.exit(2);
  }
  if (emptyRatio?.status !== "NEEDS_INPUT") {
    console.error("expected NEEDS_INPUT without ratio", emptyRatio?.status);
    process.exit(2);
  }
  if (failRatio?.effectiveRemaining.kind !== "GATE_NOT_SATISFIED") {
    console.error("expected GATE_NOT_SATISFIED at 4.0", failRatio?.effectiveRemaining);
    process.exit(2);
  }

  const report = [
    "# Stage C execution — pkg-n-clean-ratio §7.01(c)",
    "",
    "**Verdict:** ratio-dependent path **EXECUTED** (technical demonstration with labeled synthetic TNLR).",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Package | `pkg-n-clean-ratio` (synthetic Oakhurst; acceptance DERIVED VEP) |",
    "| Transaction | Incur Indebtedness (INCUR_DEBT) |",
    "| Contractual path | §7.01(c) unlimited capacity gated by Total Net Leverage Ratio ≤ 3.00× (pro forma) |",
    "| Phase 4E | " + enumDebt.authority + " / " + (enumDebt.paths.find((p) => p.ruleId === RATIO_RULE_ID)?.status ?? "n/a") + " |",
    "| Capacity (REQUIRE) | AVAILABLE / UNLIMITED gate=SATISFIED at TNLR " + SYNTHETIC_TNLR + " |",
    "| Simulation (4D) | selectedPathResult=SATISFIED; consume $" + Number(SYNTHETIC_TXN_USD).toLocaleString("en-US") + " |",
    "| Financial inputs | **SYNTHETIC_LABELED_TECHNICAL_DEMO** (not customer-certified) |",
    "",
    "## Operative check",
    "",
    "- Source: Indebtedness of the Borrower so long as, after giving pro forma effect thereto, Total Net Leverage Ratio does not exceed 3.00 to 1.00.",
    "- Synthetic TNLR " + SYNTHETIC_TNLR + " ≤ 3.00 → gate SATISFIED → unlimited capacity.",
    "",
    "## Correct refusals (not counted as executable successes)",
    "",
    "- Missing TNLR → §7.01(c) **NEEDS_INPUT**.",
    "- Synthetic TNLR 4.0 → remaining **GATE_NOT_SATISFIED** (path does not yield headroom).",
    "",
    "## Defect closed this cycle",
    "",
    "Expressionless `PRO_FORMA: after giving pro forma effect thereto` sibling conditions no longer force `selectedPathResult=INDETERMINATE` when a sibling ratio condition already carries `evaluationBasis.proForma` and evaluated SATISFIED.",
    "",
    "## Safety",
    "",
    "- Gates not weakened; CFP target 0; synthetic inputs labeled; no paid inference; no authentic EDGAR certification claimed.",
    "",
  ].join("\n");
  write("00-execution-report.md", report);
  console.log(report);
  console.log("Wrote artifacts to", OUT);
}

main();
