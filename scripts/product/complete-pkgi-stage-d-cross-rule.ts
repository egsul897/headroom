/**
 * Stage D Cycle 5 — companion-REQUIRES discharge + debt-side execution on pkg-i.
 *
 * After entity-scope v5 (Cycle 4) CERTIFIES §7.01+§7.02 and enumerates SECURED_DEBT
 * CERTIFIED_4E, REQUIRE capacity was package-refused on §7.02(b) REQUIRES §7.01(b).
 *
 * This script applies companion-REQUIRES discharge (finite MONEY + SOURCE_REFERENCE_RESOLVED
 * REQUIRES + COMPLETE target permission in-package), evaluates capacity, and simulates a
 * labeled synthetic $15M INCUR_DEBT under §7.01(b). Lien §7.02(b) remains REVIEW_REQUIRED
 * (ENTITY_SCOPE_UNWITNESSED — clause fragment lacks governing parent scope in this package).
 *
 * Zero paid providers. SYNTHETIC_LABELED_TECHNICAL_DEMO — not a customer-certified result.
 * UNLIMITED capacity behind gates remains fail-closed (xref §40/§54).
 */
import fs from "node:fs";
import path from "node:path";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  isCompanionRequiresDischargeable,
  type VerifiedExecutionPackage,
} from "../../lib/contract-model/verified-execution";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";

const OUT = "docs/product/customer-workflow/stage-d-pkgi-cross-rule";
const VEP_PATH = "docs/product/customer-workflow/stage-d-pkgi-entity-scope/verified-execution-package.json";
const AS_OF = "2026-12-31";
const SYNTHETIC_TXN_USD = "15000000";

function write(name: string, value: unknown): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function main(): void {
  const pkg = JSON.parse(fs.readFileSync(VEP_PATH, "utf8")) as VerifiedExecutionPackage;
  const debtRule = pkg.rules.find((r) => r.sourceSectionRef === "7.01(b)");
  const lienRule = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)");
  if (!debtRule || !lienRule) throw new Error("expected §7.01(b) and §7.02(b) in Cycle 4 VEP");

  write("01-companion-discharge.json", {
    schema: "stage-d-pkgi-companion-discharge.v1",
    paidProvidersCalled: false,
    lienRuleId: lienRule.ruleId,
    dischargeable: isCompanionRequiresDischargeable(lienRule, pkg.rules),
    sourceDependencies: lienRule.sourceDependencies ?? [],
    capacityKind: lienRule.capacityExpression?.kind ?? null,
    note: "UNLIMITED + referencesRuleTargets compliance gates remain non-dischargeable.",
  });

  const enumeration = enumerateCertifiedPaths({
    verifiedPackage: pkg,
    transactionKind: "SECURED_DEBT",
    secured: true,
  });
  write("02-phase4e-enumeration.json", {
    schema: "stage-d-pkgi-cross-rule-phase4e.v1",
    paidProvidersCalled: false,
    authority: enumeration.authority,
    debtPaths: enumeration.paths.filter((p) => p.action === "INCUR_DEBT").map((p) => p.sourceSectionRef),
    lienPaths: enumeration.paths.filter((p) => p.action === "CREATE_LIEN").map((p) => p.sourceSectionRef),
  });

  const inputs = snapshotInputResolver({
    snapshots: [],
    definitions: [...(pkg.definitions ?? [])],
    rules: [...pkg.rules],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
  });
  const capacity = evaluateVerifiedCapacity({ package: pkg, inputs, ledger: [], asOf: AS_OF });
  if (capacity.outcome !== "EXECUTED") {
    write("00-execution-report.md", `# Stage D cross-rule refused\n\n${JSON.stringify(capacity, null, 2)}\n`);
    process.exit(2);
  }

  const debtCap = capacity.state.capacities.find((c) => c.ruleId === debtRule.ruleId)!;
  const lienCap = capacity.state.capacities.find((c) => c.ruleId === lienRule.ruleId)!;
  write("04-capacity-require.json", {
    schema: "stage-d-pkgi-cross-rule-capacity.v1",
    paidProvidersCalled: false,
    certifiedCustomerResult: false,
    asOf: AS_OF,
    outcome: capacity.outcome,
    debt701b: {
      status: debtCap.status,
      effectiveRemaining: debtCap.effectiveRemaining,
      limitations: debtCap.limitations,
    },
    lien702b: {
      status: lienCap.status,
      effectiveRemaining: lienCap.effectiveRemaining,
      provisional: (lienCap as { provisional?: unknown }).provisional ?? null,
      limitations: lienCap.limitations,
    },
  });

  const sim = simulateVerifiedTransaction({
    package: pkg,
    inputs,
    ledger: [],
    asOf: AS_OF,
    transaction: {
      transactionId: "stage-d-debt-15m-7.01b",
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
      effectiveAsOf: AS_OF,
      category: "INCUR_DEBT",
      label: "SYNTHETIC $15M under §7.01(b) — Stage D debt side (dual-path package)",
      effects: [
        {
          effectId: "e1",
          kind: "CONSUME_CAPACITY",
          capacityNodeId: debtCap.capacityNodeId,
          amount: { type: "MONEY", amount: SYNTHETIC_TXN_USD, currency: "USD" },
        },
      ],
      intendedAmount: { type: "MONEY", amount: SYNTHETIC_TXN_USD, currency: "USD" },
      unallocatedAmount: null,
      provenance: {
        source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
        sourceVersion: "stage-d-cross-rule-1",
        approvalRef: "SYNTHETIC_NOT_CUSTOMER",
      },
    },
    selectedPath: {
      capacityNodeIds: [debtCap.capacityNodeId],
      ruleIds: [debtRule.ruleId],
      sharedCapacityIds: [],
      reclassificationElectionIds: [],
    },
  });

  write("05-phase4d-simulation.json", {
    schema: "stage-d-pkgi-cross-rule-phase4d.v1",
    paidProvidersCalled: false,
    certifiedCustomerResult: false,
    financialInputs: "none (fixed-dollar basket; empty ledger)",
    simulation:
      sim.outcome === "EXECUTED"
        ? {
            simulationStatus: sim.simulation.simulationStatus,
            selectedPathResult: sim.simulation.selectedPathResult,
            capacityEffects: sim.simulation.capacityEffects,
          }
        : sim,
  });

  const report = [
    "# Stage D — companion-REQUIRES discharge + debt-side execution (Cycle 5)",
    "",
    `**Verdict:** REQUIRE capacity **EXECUTED** after companion-REQUIRES discharge. §7.01(b) **AVAILABLE $50M**; synthetic $15M debt sim **SATISFIED**. §7.02(b) lien **${lienCap.status}** (Cycle 6 parent-scope inheritance; dual-path secured sim is Cycle 6).`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Package | \`pkg-i-secured-debt-lien\` VEP (Cycle 4/6 re-derive) |`,
    `| Companion discharge (§7.02(b)) | **${isCompanionRequiresDischargeable(lienRule, pkg.rules)}** |`,
    `| SECURED_DEBT 4E | **${enumeration.authority}** |`,
    `| §7.01(b) capacity | **${debtCap.status}** $50M |`,
    `| §7.02(b) capacity | **${lienCap.status}** [${(lienCap.limitations ?? []).map((l) => l.code).join(", ")}] |`,
    `| Debt sim $15M | **${sim.outcome === "EXECUTED" ? sim.simulation.selectedPathResult : sim.outcome}** |`,
    "",
    "## What changed",
    "",
    "Finite MONEY permissions whose only cross-rule gates are `SOURCE_REFERENCE_RESOLVED` `REQUIRES` dependencies with a COMPLETE target permission in-package no longer refuse the whole VEP. UNLIMITED capacity and `referencesRuleTargets` compliance gates stay fail-closed (xref §40/§54).",
    "",
    "## Cycle 6 follow-on",
    "",
    "Parent-scope inheritance for lettered children (entity-scope guard v6) makes §7.02(b) safe to rely on. Secured dual-path capacity/sim is demonstrated in `stage-d-pkgi-secured-dual-path/`.",
    "",
    "## Safety",
    "",
    "- SYNTHETIC_LABELED_TECHNICAL_DEMO; not customer-certified; CFP 0; no paid inference.",
    "",
  ].join("\n");

  write("00-execution-report.md", report);
  console.log(report);

  if (capacity.outcome !== "EXECUTED" || debtCap.status !== "AVAILABLE") process.exit(2);
  if (sim.outcome !== "EXECUTED" || sim.simulation.selectedPathResult !== "SATISFIED") process.exit(2);
  if (lienCap.status !== "AVAILABLE") process.exit(2);
}

main();
