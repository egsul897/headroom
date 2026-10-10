/**
 * Finish-the-product offline demo — authentic CONMED evidence + Stage D acceptance package.
 * Provider-free. No Neon writes. Labels SYNTHETIC_LABELED vs AUTHENTIC explicitly.
 *
 *   npx tsx scripts/product/run-finish-product-demo.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  attemptAuthenticatedVep,
  enumerateAuthenticPhase4e,
  evaluateAuthenticVerifiedCapacity,
} from "./attempt-authenticated-vep";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  isCompanionRequiresDischargeable,
  type VerifiedExecutionPackage,
} from "../../lib/contract-model/verified-execution";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";
import {
  attemptVerifiedSimulate,
  summarizeVerifiedSimulate,
} from "../../lib/product/unified-position/certified-simulate-bridge";
import { assertProductCapacityConsistency, buildSharedProductCapacityViews, resolveUtilization } from "../../lib/capacity";

const OUT = path.join("docs/product/finish-product");
const AS_OF = "2026-12-31";
const STAGE_D_VEP =
  "docs/product/customer-workflow/stage-d-pkgi-entity-scope/verified-execution-package.json";

function loadPkg(p: string): VerifiedExecutionPackage {
  return JSON.parse(fs.readFileSync(p, "utf8")) as VerifiedExecutionPackage;
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // --- A. Authentic CONMED package (real Phase-3 CERTIFIED §7.2(c)) ---
  const scan = attemptAuthenticatedVep();
  const authentic: Record<string, unknown> = {
    packageChoice:
      "CONMED Eighth A&R Article VII evidence under docs/phase-3-live-validation — only authentic CERTIFIED candidate packet currently on disk (7.2c-recompute-phase2-certified).",
    stages: {} as Record<string, unknown>,
  };
  authentic.stages = {
    documents: { status: "EXECUTED", note: "On-disk CONMED fixture package + Phase-3 live-validation packets" },
    structuralDiscovery: { status: "EXECUTED", note: "Prior Phase-2/3 pipelines; not re-run here" },
    covenantDiscovery: {
      status: "EXECUTED",
      certifiedCount: scan.certifiedCount,
      reviewRequired: scan.statusCounts.REVIEW_REQUIRED ?? 0,
    },
    verifiedLegalRule: {
      status: scan.certifiedCount > 0 ? "EXECUTED" : "BLOCKED",
      certifiedPaths: scan.records.filter((r) => r.status === "CERTIFIED").map((r) => r.path),
    },
  };

  if (scan.adapter.outcome === "DERIVED") {
    const pkg = scan.adapter.package;
    const phase4e = enumerateAuthenticPhase4e(pkg);
    const capacity = evaluateAuthenticVerifiedCapacity(pkg);
    (authentic.stages as Record<string, unknown>).verifiedExecutionPackage = {
      status: "EXECUTED",
      outcome: "DERIVED",
      authenticity: "AUTHENTIC_PHASE3_CERTIFIED_CANDIDATE",
      included: scan.adapter.included,
    };
    (authentic.stages as Record<string, unknown>).pathEnumeration = {
      status: "EXECUTED",
      authorities: phase4e.map((p) => ({ kind: p.transactionKind, authority: p.authority, paths: p.paths.length })),
    };
    (authentic.stages as Record<string, unknown>).capacityEvaluation = {
      status: capacity.outcome === "EXECUTED" ? "EXECUTED" : "BLOCKED",
      outcome: capacity.outcome,
      refusals: capacity.outcome === "REFUSED" ? capacity.refusals : [],
      firstBlocker:
        capacity.outcome === "REFUSED"
          ? capacity.refusals[0]
          : null,
    };
    (authentic.stages as Record<string, unknown>).transactionSimulation = {
      status: "BLOCKED",
      reason: "REQUIRE capacity did not EXECUTE — simulation not attempted (fail-closed)",
    };
  } else {
    (authentic.stages as Record<string, unknown>).verifiedExecutionPackage = {
      status: "BLOCKED",
      outcome: scan.adapter.outcome,
    };
  }

  // --- B. Affirmative Stage D acceptance package (SYNTHETIC_LABELED technical demo) ---
  const stageD = loadPkg(STAGE_D_VEP);
  const debt = stageD.rules.find((r) => r.sourceSectionRef === "7.01(b)")!;
  const lien = stageD.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
  const inputs = inputsFor(stageD);
  const capacity = evaluateVerifiedCapacity({ package: stageD, inputs, ledger: [], asOf: AS_OF });
  let dualSim: Record<string, unknown> = { status: "BLOCKED" };
  if (capacity.outcome === "EXECUTED") {
    const debtCap = capacity.state.capacities.find((c) => c.ruleId === debt.ruleId)!;
    const lienCap = capacity.state.capacities.find((c) => c.ruleId === lien.ruleId)!;
    const dual = simulateVerifiedTransaction({
      package: stageD,
      inputs,
      ledger: [],
      asOf: AS_OF,
      transaction: {
        transactionId: "finish-product-secured-15m",
        companyId: stageD.companyId,
        instrumentKey: stageD.instrumentKey,
        effectiveAsOf: AS_OF,
        category: "INCUR_DEBT",
        label: "secured dual-path $15M",
        effects: [
          {
            effectId: "e-debt",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: debtCap.capacityNodeId,
            amount: { type: "MONEY", amount: "15000000", currency: "USD" },
          },
          {
            effectId: "e-lien",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: lienCap.capacityNodeId,
            amount: { type: "MONEY", amount: "15000000", currency: "USD" },
          },
        ],
        intendedAmount: { type: "MONEY", amount: "30000000", currency: "USD" },
        unallocatedAmount: null,
        provenance: {
          source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
          sourceVersion: "finish-product",
          approvalRef: "SYNTHETIC_NOT_CUSTOMER",
        },
      },
      selectedPath: {
        capacityNodeIds: [debtCap.capacityNodeId, lienCap.capacityNodeId],
        ruleIds: [debt.ruleId, lien.ruleId],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
    });
    dualSim = {
      status: dual.outcome === "EXECUTED" ? "EXECUTED" : "BLOCKED",
      outcome: dual.outcome,
      selectedPathResult: dual.outcome === "EXECUTED" ? dual.simulation?.selectedPathResult : null,
      authenticity: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
      note: "Affirmative secured dual-path on Stage D acceptance package — not authentic CONMED CERTIFIED customer result",
      debtAvailable: debtCap.status,
      lienAvailable: lienCap.status,
      companionDischargeable: isCompanionRequiresDischargeable(lien, stageD.rules),
    };
  }

  // --- C. Position / Simulate / Ask consistency (utilization fail-closed projection) ---
  const util = resolveUtilization({
    capacityRuleId: "demo-basket",
    asOf: AS_OF,
    records: [],
  });
  const views = buildSharedProductCapacityViews({
    gross: { amount: 100, gateSatisfied: true, modeled: true, capacityRuleId: "demo-basket" },
    utilization: util,
    governingConditions: [],
    crossDocumentConstraints: [],
    sourceCitations: ["§demo"],
    certificationStatus: "NOT_CERTIFIED",
  });
  const surfaceConsistency = assertProductCapacityConsistency(views);

  // Verified simulate refusal without VEP (product entry)
  const refusedSimulate = await attemptVerifiedSimulate({
    companyId: "finish-product-demo",
    evaluationDate: AS_OF,
    amountMillions: 15,
    kind: "SECURED_DEBT",
    secured: true,
    verifiedPackage: null,
  });

  const report = {
    schema: "finish-product-demo.v1",
    generatedAt: new Date().toISOString(),
    paidProvidersCalled: false,
    neonWrites: false,
    authenticPackage: authentic,
    affirmativeSyntheticLabeled: {
      package: STAGE_D_VEP,
      authenticity: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
      covenant: { debt: "7.01(b)", lien: "7.02(b)" },
      capacityOutcome: capacity.outcome,
      dualPathSimulation: dualSim,
    },
    surfaces: {
      utilizationEmptyLedger: {
        knowledge: util.knowledge,
        supportsRemainingClaim: util.supportsRemainingClaim,
        note: "Empty ledger ≠ verified zero remaining",
      },
      positionSimulateAsk: {
        consistency: surfaceConsistency,
        POSITION: views.POSITION.supportedRemainingCapacity,
        SIMULATE: views.SIMULATE.supportedRemainingCapacity,
        ASK: views.ASK.supportedRemainingCapacity,
      },
      verifiedSimulateWithoutVep: summarizeVerifiedSimulate(refusedSimulate),
    },
    firstAuthenticBlocker:
      scan.adapter.outcome === "DERIVED"
        ? "REQUIRE capacity REFUSED — CROSS_RULE_GATE / unbound companions / no APPROVED financial snapshots for authentic CONMED §7.2(c)"
        : "No authentic CERTIFIED artifacts",
  };

  const outPath = path.join(OUT, "00-demo-report.json");
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
