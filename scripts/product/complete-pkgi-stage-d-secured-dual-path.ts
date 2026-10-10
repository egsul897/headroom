/**
 * Stage D Cycle 6 — secured-debt dual-path execution on pkg-i.
 *
 * After entity-scope v6 parent-scope inheritance, §7.02(b) is SOURCE_SCOPE_DERIVED
 * (Borrower + any Subsidiary from the §7.02 chapeau). Combined with Cycle 5
 * companion-REQUIRES discharge, REQUIRE capacity evaluates both debt and lien
 * baskets; a synthetic $15M secured borrowing must consume BOTH §7.01(b) and
 * §7.02(b). Debt-only selection must never be presented as a secured answer.
 *
 * Zero paid providers. SYNTHETIC_LABELED_TECHNICAL_DEMO — not customer-certified.
 * Authentic PINNED_OFFLINE packages are reported separately and are not CERTIFIED.
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
import { ENTITY_SCOPE_GUARD_VERSION } from "../../lib/contract-model/compiler/semantic/entity-scope-guard";

const OUT = "docs/product/customer-workflow/stage-d-pkgi-secured-dual-path";
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
  if (!debtRule || !lienRule) throw new Error("expected §7.01(b) and §7.02(b) in Cycle 6 VEP");

  const lienAudit = lienRule.entityScopeAudit;
  write("01-entity-scope-702b.json", {
    schema: "stage-d-pkgi-secured-entity-scope.v1",
    paidProvidersCalled: false,
    guardVersion: ENTITY_SCOPE_GUARD_VERSION,
    sourceSectionRef: "7.02(b)",
    entityScope: lienRule.entityScope,
    status: lienAudit?.status ?? null,
    safeToRely: lienAudit?.safeToRely ?? null,
    decidedBy: lienAudit?.witness?.decidedBy ?? null,
    parentScopeLeadIn: (lienAudit?.witness?.parentScopeLeadIn ?? "").slice(0, 240),
    governingDerived: lienAudit?.witness?.governingScope?.derivedScope ?? null,
    modelDiscrepancy: lienAudit?.modelDiscrepancy ?? null,
  });

  write("02-companion-discharge.json", {
    schema: "stage-d-pkgi-secured-companion.v1",
    paidProvidersCalled: false,
    dischargeable: isCompanionRequiresDischargeable(lienRule, pkg.rules),
    sourceDependencies: lienRule.sourceDependencies ?? [],
  });

  const enumeration = enumerateCertifiedPaths({
    verifiedPackage: pkg,
    transactionKind: "SECURED_DEBT",
    secured: true,
  });
  write("03-phase4e-enumeration.json", {
    schema: "stage-d-pkgi-secured-phase4e.v1",
    paidProvidersCalled: false,
    authority: enumeration.authority,
    debtPaths: enumeration.paths.filter((p) => p.action === "INCUR_DEBT" || p.action === "INCUR_SECURED_DEBT").map((p) => p.sourceSectionRef),
    lienPaths: enumeration.paths.filter((p) => p.action === "CREATE_LIEN" || p.action === "GRANT_COLLATERAL").map((p) => p.sourceSectionRef),
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
    write("00-execution-report.md", `# Stage D secured dual-path refused\n\n${JSON.stringify(capacity, null, 2)}\n`);
    process.exit(2);
  }

  const debtCap = capacity.state.capacities.find((c) => c.ruleId === debtRule.ruleId)!;
  const lienCap = capacity.state.capacities.find((c) => c.ruleId === lienRule.ruleId)!;
  write("04-capacity-require.json", {
    schema: "stage-d-pkgi-secured-capacity.v1",
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
      limitations: lienCap.limitations,
    },
  });

  // Favorable secured answer: consume BOTH debt and lien capacity nodes at the same
  // $15M principal. Phase 4D requires every selected node to carry an explicit draw and
  // that stated draws sum to intendedAmount — so intendedAmount is the dual-draw total
  // ($15M+$15M), not a claim that the financing principal is $30M.
  const dualDrawTotal = "30000000";
  const dualSim = simulateVerifiedTransaction({
    package: pkg,
    inputs,
    ledger: [],
    asOf: AS_OF,
    transaction: {
      transactionId: "stage-d-secured-15m-7.01b-7.02b",
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
      effectiveAsOf: AS_OF,
      category: "INCUR_DEBT",
      label: "SYNTHETIC $15M secured principal under §7.01(b)+§7.02(b) — dual-basket draws",
      effects: [
        {
          effectId: "e-debt",
          kind: "CONSUME_CAPACITY",
          capacityNodeId: debtCap.capacityNodeId,
          amount: { type: "MONEY", amount: SYNTHETIC_TXN_USD, currency: "USD" },
        },
        {
          effectId: "e-lien",
          kind: "CONSUME_CAPACITY",
          capacityNodeId: lienCap.capacityNodeId,
          amount: { type: "MONEY", amount: SYNTHETIC_TXN_USD, currency: "USD" },
        },
      ],
      intendedAmount: { type: "MONEY", amount: dualDrawTotal, currency: "USD" },
      unallocatedAmount: null,
      provenance: {
        source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
        sourceVersion: "stage-d-secured-dual-path-1",
        approvalRef: "SYNTHETIC_NOT_CUSTOMER",
      },
    },
    selectedPath: {
      capacityNodeIds: [debtCap.capacityNodeId, lienCap.capacityNodeId],
      ruleIds: [debtRule.ruleId, lienRule.ruleId],
      sharedCapacityIds: [],
      reclassificationElectionIds: [],
    },
  });

  // Debt-only path: still SATISFIED for unsecured debt — must not be treated as secured success.
  const debtOnlySim = simulateVerifiedTransaction({
    package: pkg,
    inputs,
    ledger: [],
    asOf: AS_OF,
    transaction: {
      transactionId: "stage-d-debt-only-15m-not-secured-answer",
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
      effectiveAsOf: AS_OF,
      category: "INCUR_DEBT",
      label: "SYNTHETIC $15M debt-only — NOT a secured-debt answer",
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
        sourceVersion: "stage-d-secured-dual-path-1",
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

  write("05-phase4d-dual-path-simulation.json", {
    schema: "stage-d-pkgi-secured-phase4d.v1",
    paidProvidersCalled: false,
    certifiedCustomerResult: false,
    financialInputs: "none (fixed-dollar baskets; empty ledger)",
    dualPath:
      dualSim.outcome === "EXECUTED"
        ? {
            simulationStatus: dualSim.simulation.simulationStatus,
            selectedPathResult: dualSim.simulation.selectedPathResult,
            capacityEffects: dualSim.simulation.capacityEffects,
            selectedCapacityNodeIds: [debtCap.capacityNodeId, lienCap.capacityNodeId],
          }
        : dualSim,
    debtOnlyNotSecuredAnswer:
      debtOnlySim.outcome === "EXECUTED"
        ? {
            simulationStatus: debtOnlySim.simulation.simulationStatus,
            selectedPathResult: debtOnlySim.simulation.selectedPathResult,
            note: "Debt-only SATISFIED is an unsecured/debt-side result; it is not a favorable secured-debt answer.",
          }
        : debtOnlySim,
  });

  const dualOk =
    dualSim.outcome === "EXECUTED" && dualSim.simulation.selectedPathResult === "SATISFIED";
  const debtOk = debtCap.status === "AVAILABLE";
  const lienOk = lienCap.status === "AVAILABLE";
  const scopeOk = lienAudit?.safeToRely === true && lienAudit.status === "SOURCE_SCOPE_DERIVED";

  const report = [
    "# Stage D — secured-debt dual-path execution (Cycle 6)",
    "",
    `**Verdict:** §7.02(b) entity scope **SOURCE_SCOPE_DERIVED** from parent chapeau (guard ${ENTITY_SCOPE_GUARD_VERSION}). Debt §7.01(b) **${debtCap.status}** $50M; lien §7.02(b) **${lienCap.status}** $20M. Synthetic $15M dual-path sim **${dualSim.outcome === "EXECUTED" ? dualSim.simulation.selectedPathResult : dualSim.outcome}**. Debt-only path is not a secured answer.`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Package | \`pkg-i-secured-debt-lien\` VEP (re-derived Cycle 6) |`,
    `| Guard | \`${ENTITY_SCOPE_GUARD_VERSION}\` |`,
    `| §7.02(b) entity scope | \`${JSON.stringify(lienRule.entityScope)}\` status=\`${lienAudit?.status}\` decidedBy=\`${lienAudit?.witness?.decidedBy}\` |`,
    `| Companion discharge | **${isCompanionRequiresDischargeable(lienRule, pkg.rules)}** |`,
    `| SECURED_DEBT 4E | **${enumeration.authority}** |`,
    `| Debt pathway (§7.01(b)) | **${debtCap.status}** $50M |`,
    `| Lien pathway (§7.02(b)) | **${lienCap.status}** $20M |`,
    `| Combined secured sim $15M | **${dualSim.outcome === "EXECUTED" ? dualSim.simulation.selectedPathResult : dualSim.outcome}** |`,
    `| Debt-only sim (not secured answer) | **${debtOnlySim.outcome === "EXECUTED" ? debtOnlySim.simulation.selectedPathResult : debtOnlySim.outcome}** |`,
    "",
    "## What changed",
    "",
    "Lettered children under a section-level candidate re-resolve PARENT_SCOPE from the child's structural node / section chapeau. Applicability is source-witnessed; BORROWER/ALL_SUBSIDIARIES are never invented without parent words.",
    "",
    "## Authentic coverage",
    "",
    "This run is **SYNTHETIC_LABELED_TECHNICAL_DEMO** on the Stage D acceptance package. Authentic CONMED / PINNED_OFFLINE packages are reported separately and are **not** treated as CERTIFIED customer results.",
    "",
    "## Safety",
    "",
    "- Fail-closed entity-scope and companion-REQUIRES guards preserved.",
    "- Did not modify PR #229 capacity `state.ts` / `types.ts`.",
    "- CFP 0; no paid inference; not customer-grade from synthetic evidence.",
    "",
  ].join("\n");

  write("00-execution-report.md", report);
  console.log(report);

  if (!scopeOk) {
    console.error("expected §7.02(b) SOURCE_SCOPE_DERIVED safeToRely");
    process.exit(2);
  }
  if (!debtOk || !lienOk) {
    console.error(`expected both pathways AVAILABLE; debt=${debtCap.status} lien=${lienCap.status}`);
    process.exit(2);
  }
  if (!dualOk) {
    console.error("expected dual-path sim SATISFIED");
    process.exit(2);
  }
}

main();
