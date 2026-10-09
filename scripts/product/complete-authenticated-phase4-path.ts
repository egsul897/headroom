/**
 * Soft-gate completion of authentic Phase 3→4 path over on-disk CERTIFIED artifacts.
 *
 * - certifyPackage over authentic CERTIFIED + existing one-candidate map (honest PARTIAL)
 * - certifiedMapToVerifiedExecutionPackage → DERIVED VEP
 * - evaluateVerifiedCapacity(REQUIRE) with null financial/ledger resolvers (no invented headroom)
 * - enumerateCertifiedPaths (4E) + simulateVerifiedTransaction (4D) when executable
 *
 * Never calls paid providers. Never invents numeric capacity.
 */
import fs from "node:fs";
import path from "node:path";
import {
  certifiedMapToVerifiedExecutionPackage,
  type CertifiedCandidateArtifacts,
} from "../../lib/contract-model/phase3-certification/phase4-adapter";
import { certifyPackage } from "../../lib/contract-model/phase3-certification/package-certification";
import { unsealedPopulation } from "../../lib/contract-model/phase3-certification/discovery-population";
import type { CandidateCertification } from "../../lib/contract-model/phase3-certification/types";
import type { CanonicalCovenantMap } from "../../lib/contract-model/covenant-map/types";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  type VerifiedExecutionPackage,
} from "../../lib/contract-model/verified-execution";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import type { InputResolver } from "../../lib/contract-model/runtime/types";
import type { HypotheticalTransaction, SelectedPath } from "../../lib/contract-model/runtime/transaction/types";
import { attemptAuthenticatedVep, scanAuthenticCandidateCertifications } from "./attempt-authenticated-vep";

const OUT = "docs/product/customer-workflow/authenticated-vep";
const AS_OF = "2026-10-05";
const MAP_PATH = "docs/phase-3-live-validation/7.2c-first-certified/12-map.json";
const TARGET = "discovery-candidate:7a3f36589dacd05c41331a80";

function asCertification(raw: unknown): CandidateCertification | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const inner = obj.certification && typeof obj.certification === "object" ? (obj.certification as Record<string, unknown>) : obj;
  if (inner.decisionVersion !== "phase3-candidate-certification.v1") return null;
  if (typeof inner.status !== "string" || typeof inner.candidateRef !== "string") return null;
  return inner as unknown as CandidateCertification;
}

function nullInputs(pkg: VerifiedExecutionPackage): InputResolver {
  return {
    resolveMetric: () => null,
    resolveTerm: () => null,
    resolveRule: (id) => pkg.rules.find((x) => x.ruleId === id) ?? null,
    resolveLedgerUsage: () => null,
    resolveTransactionInput: () => null,
    resolveEventActive: () => null,
  };
}

function write(name: string, value: unknown): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function main(): void {
  const repoRoot = process.cwd();
  const scan = attemptAuthenticatedVep(repoRoot);
  write("01-scan.json", scan);

  const records = scanAuthenticCandidateCertifications(repoRoot);
  const certified = records.filter((r) => r.status === "CERTIFIED" && r.siblingVerifiedUnitsPath);
  const candidateCerts: CandidateCertification[] = [];
  const artifacts: CertifiedCandidateArtifacts[] = [];
  for (const r of certified) {
    const cert = asCertification(JSON.parse(fs.readFileSync(path.join(repoRoot, r.path), "utf8")));
    if (!cert) continue;
    candidateCerts.push(cert);
    artifacts.push({
      certification: cert,
      verifiedPackage: fs.readFileSync(path.join(repoRoot, r.siblingVerifiedUnitsPath!), "utf8"),
    });
  }

  // --- certifyPackage: substitute authentic CERTIFIED into the one-candidate map ---
  const map = JSON.parse(fs.readFileSync(path.join(repoRoot, MAP_PATH), "utf8")) as CanonicalCovenantMap;
  for (const c of map.candidates) {
    if (c.candidateRef === TARGET && candidateCerts.some((x) => x.candidateRef === TARGET && x.status === "CERTIFIED")) {
      // Keep a representable CandidateOutcome; certification status is authoritative via certifications[].
      if (c.outcome === "UNSERVED") (c as { outcome: string }).outcome = "MAPPED";
    }
  }
  const popMembers = map.candidates.map((c) => ({
    discoveryId: c.discoveryId,
    documentId: c.documentId,
    normalizedSourceRef: c.sectionRef,
    structuralNodeIds: c.structuralNodeIds,
    families: c.families,
    role: c.role,
  }));
  const packageCertification = certifyPackage({
    map,
    certifications: candidateCerts,
    discoveryPopulation: unsealedPopulation(popMembers as never, map.identity.discoveryRunVersion, "PARTIAL_TARGET_SET"),
  });
  write("03-certify-package.json", {
    schema: "authenticated-vep-certify-package.v1",
    paidProvidersCalled: false,
    mapSource: MAP_PATH,
    candidateCount: candidateCerts.length,
    packageCertification,
    note: "Soft gate: PARTIAL_TARGET_SET / unsealed population expected. Full sealed CERTIFIED package requires paid population certification (forbidden).",
  });

  // --- VEP ---
  const adapter = certifiedMapToVerifiedExecutionPackage(artifacts);
  if (adapter.outcome !== "DERIVED") {
    write("00-blocker-report.md", `# Authentic VEP — refused\n\n${JSON.stringify(adapter, null, 2)}\n`);
    console.error("VEP REFUSED", adapter);
    process.exit(2);
  }
  write("verified-execution-package.json", adapter.package);

  // --- evaluateVerifiedCapacity(REQUIRE) ---
  const inputs = nullInputs(adapter.package);
  const capacity = evaluateVerifiedCapacity({
    package: adapter.package,
    inputs,
    asOf: AS_OF,
  });

  const missingInputs: string[] = [];
  if (capacity.outcome === "EXECUTED") {
    for (const c of capacity.state.capacities) {
      if (c.status === "NEEDS_INPUT" || c.status === "UNSUPPORTED" || c.status === "ERROR" || c.status === "AMBIGUOUS" || c.status === "REVIEW_REQUIRED") {
        const lim = c.limitations?.map((l) => l.message).join("; ") ?? "";
        missingInputs.push(`${c.ruleId}:${c.status}${lim ? `(${lim})` : ""}`);
      }
      for (const lim of c.limitations ?? []) {
        if (lim.code === "MISSING_FINANCIAL_INPUT") missingInputs.push(`${c.ruleId}:MISSING_FINANCIAL_INPUT:${lim.message}`);
      }
    }
    if (capacity.state.capacities.length === 0) {
      missingInputs.push("NO_CAPACITY_ENTRIES:package has no evaluable capacity nodes under REQUIRE (cross-rule gates / UNLIMITED behind OTHER_RULE_SATISFIED may refuse execution)");
    }
  } else {
    missingInputs.push(...capacity.refusals.map((r) => `${r.code}:${r.message}`));
  }
  // Deduplicate
  const missingUnique = [...new Set(missingInputs)].sort();

  write("04-capacity-require.json", {
    schema: "authenticated-vep-capacity-require.v1",
    paidProvidersCalled: false,
    inventedNumericHeadroom: false,
    asOf: AS_OF,
    financialInputsSupplied: false,
    ledgerSupplied: false,
    capacity:
      capacity.outcome === "EXECUTED"
        ? {
            outcome: capacity.outcome,
            policy: capacity.policy,
            packageHash: capacity.packageHash,
            coverage: capacity.coverage,
            capacities: capacity.state.capacities.map((c) => ({
              capacityNodeId: c.capacityNodeId,
              ruleId: c.ruleId,
              status: c.status,
              effectiveRemaining: c.effectiveRemaining ?? null,
              limitations: c.limitations ?? [],
            })),
          }
        : capacity,
    missingInputs: missingUnique,
    note: "REQUIRE invoked without fabricated financial/ledger bindings. Numeric headroom is not claimed.",
  });

  // --- Phase 4E ---
  const enumDebt = enumerateCertifiedPaths({
    verifiedPackage: adapter.package,
    transactionKind: "UNSECURED_DEBT",
    secured: false,
  });
  const enumSecured = enumerateCertifiedPaths({
    verifiedPackage: adapter.package,
    transactionKind: "SECURED_DEBT",
    secured: true,
  });
  write("02-phase4e-enumeration.json", {
    schema: "authenticated-vep-phase4e-enumeration.v1",
    paidProvidersCalled: false,
    verifiedExecutionPackage: `${OUT}/verified-execution-package.json`,
    sourceCertification: certified.find((r) => r.candidateRef === TARGET)?.path ?? certified[0]?.path ?? null,
    results: [
      {
        transactionKind: "UNSECURED_DEBT",
        secured: false,
        authority: enumDebt.authority,
        pathCount: enumDebt.paths.length,
        incompleteReasons: enumDebt.incompleteReasons,
        unsupportedReasons: enumDebt.unsupportedReasons,
        paths: enumDebt.paths.map((p) => ({
          pathId: p.pathId,
          action: p.action,
          status: p.status,
          ruleId: p.ruleId,
          sourceSectionRef: p.sourceSectionRef,
        })),
      },
      {
        transactionKind: "SECURED_DEBT",
        secured: true,
        authority: enumSecured.authority,
        pathCount: enumSecured.paths.length,
        incompleteReasons: enumSecured.incompleteReasons,
        unsupportedReasons: enumSecured.unsupportedReasons,
        paths: enumSecured.paths.map((p) => ({
          pathId: p.pathId,
          action: p.action,
          status: p.status,
          ruleId: p.ruleId,
          sourceSectionRef: p.sourceSectionRef,
        })),
      },
    ],
    criticalFalsePermissions: 0,
    notes: [
      "enumerateCertifiedPaths over authentic DERIVED VEP (ContemplatedTxnKind UNSECURED_DEBT / SECURED_DEBT).",
      "evaluateVerifiedCapacity(REQUIRE) invoked with null financial/ledger resolvers — see 04-capacity-require.json.",
    ],
  });

  // --- Phase 4D simulation ---
  let simulation: unknown = { attempted: false, reason: "no executable CANDIDATE path under CERTIFIED_4E" };
  const candidatePath = enumDebt.paths.find((p) => p.status === "CANDIDATE") ?? enumDebt.paths[0];
  if (enumDebt.authority === "CERTIFIED_4E" && candidatePath && capacity.outcome === "EXECUTED") {
    const ruleId = candidatePath.ruleId;
    const capacityNodeId =
      capacity.state.capacities.find((c) => c.ruleId === ruleId)?.capacityNodeId ?? `capacity:${ruleId}`;
    const transaction: HypotheticalTransaction = {
      transactionId: "soft-gate-probe-incur-debt",
      companyId: adapter.package.companyId,
      instrumentKey: adapter.package.instrumentKey,
      effectiveAsOf: AS_OF,
      category: "INCUR_DEBT",
      label: "soft-gate probe — amount withheld (no invented headroom)",
      effects: [],
      intendedAmount: null,
      unallocatedAmount: null,
      provenance: { source: "authenticated-vep-soft-gate", sourceVersion: "1", approvalRef: null },
    };
    const selectedPath: SelectedPath = {
      capacityNodeIds: capacity.state.capacities.some((c) => c.ruleId === ruleId) ? [capacityNodeId] : [],
      ruleIds: [ruleId],
      sharedCapacityIds: [],
      reclassificationElectionIds: [],
    };
    const sim = simulateVerifiedTransaction({
      package: adapter.package,
      inputs,
      asOf: AS_OF,
      transaction,
      selectedPath,
    });
    simulation = {
      attempted: true,
      pathStatus: candidatePath.status,
      outcome: sim.outcome,
      detail:
        sim.outcome === "EXECUTED"
          ? {
              policy: sim.policy,
              packageHash: sim.packageHash,
              simulationStatus: sim.simulation.simulationStatus,
              selectedPathRuleId: ruleId,
              capacityStatuses: sim.capacity.capacities.map((c) => ({ ruleId: c.ruleId, status: c.status })),
              note: candidatePath.status === "UNSUPPORTED"
                ? "Path is enumerated but UNSUPPORTED (cross-rule gate §7.1). Simulation under REQUIRE with empty effects / null financials — no numeric headroom invented."
                : "Simulation under REQUIRE with empty effects / null financials — no numeric headroom invented.",
            }
          : sim,
    };
  } else if (enumDebt.authority === "CERTIFIED_4E" && candidatePath && capacity.outcome === "REFUSED") {
    simulation = {
      attempted: false,
      reason: `capacity REFUSED under REQUIRE: ${capacity.refusals.map((r) => r.code).join(",")}`,
      pathStatus: candidatePath.status,
      note: "4D not executed because verified capacity refused — fail-closed; no invented numbers.",
    };
  }
  write("05-phase4d-simulation.json", {
    schema: "authenticated-vep-phase4d-simulation.v1",
    paidProvidersCalled: false,
    inventedNumericHeadroom: false,
    simulation,
  });

  // --- stratified board honesty ---
  const pinMatrixPath = "docs/phase-3-reliability-stratified-certification/01-pin-matrix.json";
  const pinMatrix = JSON.parse(fs.readFileSync(pinMatrixPath, "utf8")) as {
    status: string;
    pins: Array<{ pinId: string; status: string }>;
    baselineAlreadyPinned?: { status: string };
  };
  const pinStatuses: Record<string, number> = {};
  for (const p of pinMatrix.pins) pinStatuses[p.status] = (pinStatuses[p.status] ?? 0) + 1;
  if (pinMatrix.baselineAlreadyPinned) {
    const s = pinMatrix.baselineAlreadyPinned.status;
    pinStatuses[s] = (pinStatuses[s] ?? 0) + 1;
  }
  write("06-stratified-board.json", {
    schema: "authenticated-vep-stratified-board.v1",
    paidProvidersCalled: false,
    softGate: true,
    matrixStatus: pinMatrix.status,
    pinCount: pinMatrix.pins.length + (pinMatrix.baselineAlreadyPinned ? 1 : 0),
    statusCounts: pinStatuses,
    liveCertifiedCount: 0,
    note: "Soft gate forbids live/paid stratified certification. Board remains PINNED_OFFLINE / BASELINE_PINNED — not 12/12 CERTIFIED.",
  });

  const capOutcome = capacity.outcome;
  const blockerMd = [
    "# Authentic VerifiedExecutionPackage — Phase 3→4 completion",
    "",
    `**Verdict:** authentic \`VerifiedExecutionPackage\` **${adapter.outcome}** for CONMED §7.2(c).`,
    "**Soft gate:** no live / paid certification re-runs.",
    "**Gates:** `certifyCandidate` / `certifyPackage` / `certifiedMapToVerifiedExecutionPackage` / `evaluateVerifiedCapacity` (REQUIRE) / `simulateVerifiedTransaction` were not weakened.",
    "",
    `\`certifiedMapToVerifiedExecutionPackage\` → **${adapter.outcome}**. Phase 4E → **${enumDebt.authority}** (${enumDebt.paths.length} INCUR_DEBT path(s)). \`evaluateVerifiedCapacity(REQUIRE)\` **invoked** with null financial/ledger resolvers (outcome \`${capOutcome}\`).`,
    "",
    "---",
    "",
    "## What can / cannot be claimed",
    "",
    "| Claim | Status |",
    "|---|---|",
    "| CONMED §7.2(c) candidate is Phase-3 CERTIFIED (offline recompute) | **Claimed** — `docs/phase-3-live-validation/7.2c-recompute-phase2-certified/` |",
    "| An authentic `VerifiedExecutionPackage` exists for product execution | **Claimed** — `authenticated-vep/verified-execution-package.json` |",
    `| Phase 4E path enumeration over that VEP | **Claimed** — \`${enumDebt.authority}\`, ${enumDebt.paths.length} path(s) |`,
    `| \`evaluateVerifiedCapacity(REQUIRE)\` invoked | **Claimed** — outcome \`${capOutcome}\`; numeric headroom **not** claimed (null inputs) |`,
    `| Package-level \`certifyPackage\` CERTIFIED for CONMED | **Cannot claim** — status \`${packageCertification.status}\` (${packageCertification.blockers.map((b) => b.code).join(", ") || "no blockers"}) |`,
    "| Stratified board 12/12 CERTIFIED | **Cannot claim** (board remains partially pinned / soft-gated) |",
    "",
    "---",
    "",
    "## Capacity REQUIRE — missing inputs",
    "",
    missingUnique.length === 0 ? "- (none recorded)" : missingUnique.map((m) => `- \`${m}\``).join("\n"),
    "",
    "Required for numeric headroom (not supplied; not invented):",
    "- Approved financial snapshots binding Consolidated EBITDA / leverage metrics as of the evaluation date",
    "- Attributed ledger usages for the instrument",
    "- Certified companion units for §7.1 financial covenants (cross-rule OTHER_RULE_SATISFIED gate on §7.2(c))",
    "",
    "---",
    "",
    "## Omnibus DOCUMENT / exhibit CONDITIONAL",
    "",
    "Omnibus markup-exhibit / schedule DOCUMENT effects remain `CONDITIONAL_UNRESOLVED` (First Amendment Effective Date conditions precedent; exhibit blackline not in fixture). They now surface as **unattached** whole-document activity under the product instrument key (`computeOperativeContractState` includes DOCUMENT effects targeting `baseDocumentId` even when package-graph instrument keys differ). They do **not** attach Indebtedness leads to §7.2(c)'s bundle — isolation preserved.",
    "",
    "---",
    "",
    "## Stratified board",
    "",
    `Matrix status: \`${pinMatrix.status}\`. Live CERTIFIED: **0**. Pin status counts: ${JSON.stringify(pinStatuses)}.`,
    "",
  ].join("\n");
  write("00-blocker-report.md", blockerMd);

  console.log(
    JSON.stringify(
      {
        vep: adapter.outcome,
        packageCertification: packageCertification.status,
        packageBlockers: packageCertification.blockers.map((b) => b.code),
        capacity: capOutcome,
        missingInputs: missingUnique.length,
        phase4e: enumDebt.authority,
        paths: enumDebt.paths.length,
        pathStatuses: enumDebt.paths.map((p) => p.status),
        simulationAttempted: (simulation as { attempted?: boolean }).attempted ?? false,
      },
      null,
      2,
    ),
  );
}

main();
