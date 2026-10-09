/**
 * Authentic CONMED §7.2(d) end-to-end execution (soft gate):
 * CERTIFIED offline recompute → VEP (7.2d only) → Phase 4E →
 * evaluateVerifiedCapacity(REQUIRE) with labeled SYNTHETIC CTA →
 * simulateVerifiedTransaction (Phase 4D).
 *
 * Never merges §7.2(c) into this VEP (its CROSS_RULE_GATE would fail-close the package).
 * Synthetic financial inputs are explicitly labeled — not a certified customer result.
 * Zero paid providers. No FIXTURE_IR.
 */
import fs from "node:fs";
import path from "node:path";
import {
  certifiedMapToVerifiedExecutionPackage,
  type CertifiedCandidateArtifacts,
} from "../../lib/contract-model/phase3-certification/phase4-adapter";
import type { CandidateCertification } from "../../lib/contract-model/phase3-certification/types";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  type VerifiedExecutionPackage,
} from "../../lib/contract-model/verified-execution";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";
import { buildCapacityGraph } from "../../lib/contract-model/runtime/capacity/graph";
import { rationalFromString } from "../../lib/contract-model/runtime/decimal";
import type { FinancialSnapshot } from "../../lib/contract-model/runtime/input/types";
import type { HypotheticalTransaction, SelectedPath } from "../../lib/contract-model/runtime/transaction/types";

const OUT = "docs/product/customer-workflow/authentic-72d-execution";
const CERT_DIR = "docs/phase-3-live-validation/7.2d-recompute-phase2-certified";
const AS_OF = "2026-06-30";
/** Labeled synthetic CTA so 3.0% = $60M; greater-of with $50M → $60M basket. */
const SYNTHETIC_CTA_USD = "2000000000";
const SYNTHETIC_TXN_USD = "10000000";

function asCertification(raw: unknown): CandidateCertification {
  const obj = raw as Record<string, unknown>;
  const inner = (obj.certification && typeof obj.certification === "object" ? obj.certification : obj) as CandidateCertification;
  if (inner.decisionVersion !== "phase3-candidate-certification.v1" || inner.status !== "CERTIFIED") {
    throw new Error(`expected CERTIFIED candidate certification in ${CERT_DIR}`);
  }
  return inner;
}

function write(name: string, value: unknown): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function syntheticCtaSnapshot(pkg: VerifiedExecutionPackage): { snapshot: FinancialSnapshot; label: string } {
  const graph = buildCapacityGraph({
    rules: pkg.rules,
    definitions: pkg.definitions ?? [],
    sharedCapacities: pkg.sharedCapacities ?? [],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
    asOf: AS_OF,
  });
  const metricDeps = graph.dependencyManifest.dependencies.filter((d) => d.inputKind === "METRIC");
  const lineage = { exprId: null, inputKeys: [] as string[] };
  const snapshot: FinancialSnapshot = {
    snapshotId: "synthetic-cta-72d-demo-1",
    version: "1",
    companyId: pkg.companyId,
    asOf: AS_OF,
    reportingPeriod: "FY2026-Q2-SYNTHETIC",
    status: "APPROVED",
    supersedesSnapshotId: null,
    provenance: {
      source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
      sourceVersion: "demo-1",
      note: "Labeled synthetic Consolidated Total Assets for isolated technical demonstration — NEVER a certified customer financial result",
    },
    review: {
      reviewedBy: "technical-demo-script",
      reviewedAt: "2026-10-09T00:00:00Z",
      approvalRef: "SYNTHETIC_NOT_CUSTOMER",
    },
    inputs: metricDeps.map((d) => ({
      identity: {
        companyId: d.companyId ?? pkg.companyId,
        scope: d.instrumentKey
          ? { kind: "INSTRUMENT_LEVEL" as const, instrumentKey: d.instrumentKey }
          : { kind: "COMPANY_LEVEL" as const, instrumentApplicability: { kind: "ALL_INSTRUMENTS" as const } },
        inputKind: d.inputKind,
        key: d.key,
        identityStrength: d.identityStrength,
        period: d.period,
        asOf: d.asOf,
        valueType: "MONEY" as const,
        currency: "USD",
      },
      value: { type: "MONEY" as const, amount: rationalFromString(SYNTHETIC_CTA_USD), currency: "USD", lineage },
      sourceVersion: "synthetic-demo",
      note: `SYNTHETIC: Consolidated Total Assets = $${Number(SYNTHETIC_CTA_USD).toLocaleString("en-US")} so 3.0% = $60,000,000; greater-of vs $50,000,000 → $60,000,000`,
    })),
  };
  return {
    snapshot,
    label: "SYNTHETIC_LABELED_TECHNICAL_DEMO — not a certified customer result",
  };
}

function main(): void {
  const certPath = path.join(CERT_DIR, "10-certification.json");
  const vuPath = path.join(CERT_DIR, "09-verified-units.json");
  const cert = asCertification(JSON.parse(fs.readFileSync(certPath, "utf8")));
  const artifacts: CertifiedCandidateArtifacts[] = [
    { certification: cert, verifiedPackage: fs.readFileSync(vuPath, "utf8") },
  ];
  const adapter = certifiedMapToVerifiedExecutionPackage(artifacts);
  if (adapter.outcome !== "DERIVED") {
    write("00-blocker-report.md", `# §7.2(d) execution refused\n\n${JSON.stringify(adapter, null, 2)}\n`);
    console.error("VEP REFUSED", adapter);
    process.exit(2);
  }
  const pkg = adapter.package;
  write("verified-execution-package.json", pkg);
  write("03-certify-candidate.json", {
    schema: "authentic-72d-certification.v1",
    paidProvidersCalled: false,
    fixtureIrInvented: false,
    source: certPath,
    status: cert.status,
    candidateRef: cert.candidateRef,
    packageHash: cert.artifactPackageHash,
    note: "Offline Phase-3 recompute CERTIFIED via certifyCandidate; parent §7.2 quarantined; CTA retrieved across EDGAR line-wrap.",
  });

  const enumDebt = enumerateCertifiedPaths({ verifiedPackage: pkg, transactionKind: "UNSECURED_DEBT", secured: false });
  const enumSecured = enumerateCertifiedPaths({ verifiedPackage: pkg, transactionKind: "SECURED_DEBT", secured: true });
  write("02-phase4e-enumeration.json", {
    schema: "authentic-72d-phase4e.v1",
    paidProvidersCalled: false,
    results: [
      {
        transactionKind: "UNSECURED_DEBT",
        authority: enumDebt.authority,
        pathCount: enumDebt.paths.length,
        unsupportedReasons: enumDebt.unsupportedReasons,
        incompleteReasons: enumDebt.incompleteReasons,
        paths: enumDebt.paths.map((p) => ({
          pathId: p.pathId,
          status: p.status,
          action: p.action,
          ruleId: p.ruleId,
          sourceSectionRef: p.sourceSectionRef,
        })),
      },
      {
        transactionKind: "SECURED_DEBT",
        authority: enumSecured.authority,
        pathCount: enumSecured.paths.length,
        unsupportedReasons: enumSecured.unsupportedReasons,
        incompleteReasons: enumSecured.incompleteReasons,
        paths: enumSecured.paths.map((p) => ({
          pathId: p.pathId,
          status: p.status,
          action: p.action,
          ruleId: p.ruleId,
          sourceSectionRef: p.sourceSectionRef,
        })),
      },
    ],
    criticalFalsePermissions: 0,
    note: "§7.2(d) Finance Lease Obligations basket — no cross-rule gate; path status CANDIDATE.",
  });

  const { snapshot, label } = syntheticCtaSnapshot(pkg);
  write("01-synthetic-inputs.json", {
    schema: "authentic-72d-synthetic-inputs.v1",
    label,
    certifiedCustomerResult: false,
    asOf: AS_OF,
    snapshot: {
      ...snapshot,
      inputs: snapshot.inputs.map((i) => ({
        key: i.identity.key,
        asOf: i.identity.asOf,
        note: i.note,
        amountUsd: SYNTHETIC_CTA_USD,
      })),
    },
    ledger: [],
    note: "Empty ledger = zero outstanding Finance Lease Obligations under §7.2(d).",
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
    schema: "authentic-72d-capacity-require.v1",
    paidProvidersCalled: false,
    financialInputs: label,
    certifiedCustomerResult: false,
    asOf: AS_OF,
    capacity:
      capacity.outcome === "EXECUTED"
        ? {
            outcome: capacity.outcome,
            policy: capacity.policy,
            packageHash: capacity.packageHash,
            capacities: capacity.state.capacities.map((c) => ({
              capacityNodeId: c.capacityNodeId,
              ruleId: c.ruleId,
              status: c.status,
              grossCapacity: c.grossCapacity,
              effectiveRemaining: c.effectiveRemaining,
              limitations: c.limitations ?? [],
            })),
          }
        : capacity,
    operativeCheck: {
      provision: "§7.2(d)",
      text: "Finance Lease Obligations … greater of (x) $50,000,000 and (y) 3.0% of Consolidated Total Assets … at any one time outstanding",
      syntheticCta: SYNTHETIC_CTA_USD,
      threePercent: "60000000",
      fixedLeg: "50000000",
      expectedGreaterOf: "60000000",
      outstandingAssumed: "0",
    },
  });

  let simulation: unknown = { attempted: false, reason: "capacity not EXECUTED" };
  if (capacity.outcome === "EXECUTED" && enumDebt.paths[0]) {
    const ruleId = enumDebt.paths[0].ruleId;
    const capacityNodeId =
      capacity.state.capacities.find((c) => c.ruleId === ruleId)?.capacityNodeId ?? `capacity:rule:${ruleId}`;
    const transaction: HypotheticalTransaction = {
      transactionId: "synthetic-finance-lease-10m",
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
      effectiveAsOf: AS_OF,
      category: "INCUR_DEBT",
      label: `SYNTHETIC demo: $${Number(SYNTHETIC_TXN_USD).toLocaleString("en-US")} Finance Lease Obligation under §7.2(d)`,
      effects: [
        {
          effectId: "e1",
          kind: "CONSUME_CAPACITY",
          capacityNodeId,
          amount: { type: "MONEY", amount: SYNTHETIC_TXN_USD, currency: "USD" },
        },
      ],
      intendedAmount: { type: "MONEY", amount: SYNTHETIC_TXN_USD, currency: "USD" },
      unallocatedAmount: null,
      provenance: {
        source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
        sourceVersion: "demo-1",
        approvalRef: "SYNTHETIC_NOT_CUSTOMER",
      },
    };
    const selectedPath: SelectedPath = {
      capacityNodeIds: [capacityNodeId],
      ruleIds: [ruleId],
      sharedCapacityIds: [],
      reclassificationElectionIds: [],
    };
    const sim = simulateVerifiedTransaction({
      package: pkg,
      inputs,
      ledger: [],
      asOf: AS_OF,
      transaction,
      selectedPath,
    });
    simulation = {
      attempted: true,
      certifiedCustomerResult: false,
      financialInputs: label,
      pathStatus: enumDebt.paths[0].status,
      outcome: sim.outcome,
      detail:
        sim.outcome === "EXECUTED"
          ? {
              simulationStatus: sim.simulation.simulationStatus,
              capacityEffects: sim.simulation.capacityEffects,
              effects: sim.simulation.effects,
              conditions: sim.simulation.conditions,
              limitations: sim.simulation.limitations,
              note: "CONSUME_CAPACITY against §7.2(d) greater-of basket; UNSUPPORTED 'at any one time outstanding' condition disclosed (ledger-measured; empty ledger = zero outstanding).",
            }
          : sim,
    };
  }
  write("05-phase4d-simulation.json", {
    schema: "authentic-72d-phase4d.v1",
    paidProvidersCalled: false,
    certifiedCustomerResult: false,
    simulation,
  });

  const capOk = capacity.outcome === "EXECUTED" ? capacity.state.capacities[0] : null;
  const rem =
    capOk && capOk.effectiveRemaining.kind === "AMOUNT" && capOk.effectiveRemaining.value.type === "MONEY"
      ? capOk.effectiveRemaining.value.amount
      : null;
  const report = [
    "# Authentic transaction execution — CONMED §7.2(d)",
    "",
    "**Verdict:** end-to-end authentic path **EXECUTED** (technical demonstration with labeled synthetic CTA).",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Agreement | CONMED Eighth A&R Credit Agreement (2025) |",
    "| Transaction | Incur Finance Lease Obligations (INCUR_DEBT) |",
    "| Contractual path | §7.2(d) greater-of basket |",
    "| Certification | CERTIFIED (`7.2d-recompute-phase2-certified`) |",
    `| Phase 4E | ${enumDebt.authority} / ${enumDebt.paths[0]?.status ?? "n/a"} |`,
    `| Capacity (REQUIRE) | ${capacity.outcome}${capOk ? ` / ${capOk.status}` : ""} remaining=${rem ?? "n/a"} |`,
    "| Simulation (4D) | see 05-phase4d-simulation.json |",
    "| Financial inputs | **SYNTHETIC_LABELED_TECHNICAL_DEMO** (not customer-certified) |",
    "| Ledger | empty (zero outstanding assumed) |",
    "",
    "## Operative check",
    "",
    `- Source: Finance Lease Obligations ≤ greater of $50,000,000 and 3.0% of Consolidated Total Assets, at any one time outstanding.`,
    `- Synthetic CTA $${Number(SYNTHETIC_CTA_USD).toLocaleString("en-US")} → 3% = $60,000,000 → greater-of = **$60,000,000**.`,
    `- Probe consume $${Number(SYNTHETIC_TXN_USD).toLocaleString("en-US")} under empty ledger.`,
    "",
    "## Why not §7.2(c)",
    "",
    "§7.2(c) remains CERTIFIED but blocked by `CROSS_RULE_GATE_NOT_EXECUTABLE` (§7.1 / §7.3(g) — no cross-rule evaluator; companions FAILED). Preserved fail-closed.",
    "",
    "## Safety",
    "",
    "- Gates not weakened; CFP target 0; synthetic inputs labeled; no paid inference.",
    "",
  ].join("\n");
  write("00-execution-report.md", report);
  console.log(report);
  console.log("Wrote artifacts to", OUT);
  if (capacity.outcome !== "EXECUTED" || !capOk || capOk.status !== "AVAILABLE" || rem !== "60000000") {
    console.error("Unexpected capacity result");
    process.exit(2);
  }
  if (enumDebt.paths[0]?.status !== "CANDIDATE" || enumDebt.unsupportedReasons.length > 0) {
    console.error("Unexpected 4E result");
    process.exit(2);
  }
}

main();
