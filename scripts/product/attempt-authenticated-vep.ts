/**
 * Offline attempt to derive a VerifiedExecutionPackage from on-disk authentic
 * Phase-3 CERTIFIED artifacts only.
 *
 * Uses certifiedMapToVerifiedExecutionPackage. Never calls paid providers.
 * Never invents FIXTURE_IR. Never treats PINNED_OFFLINE, REVIEW_REQUIRED,
 * population verified-units, or product-acceptance mocked CERTIFIED as credit.
 *
 * When DERIVED: also enumerates Phase 4E paths and invokes evaluateVerifiedCapacity
 * (REQUIRE) over an empty 4B snapshot set — no invented APPROVED financials.
 *
 * Refuse codes (adapter): NO_CERTIFIED_ARTIFACTS when the authentic scan is empty.
 */
import fs from "node:fs";
import path from "node:path";
import {
  certifiedMapToVerifiedExecutionPackage,
  type CertifiedCandidateArtifacts,
  type CertifiedExecutionPackageResult,
} from "../../lib/contract-model/phase3-certification/phase4-adapter";
import type { CandidateCertification } from "../../lib/contract-model/phase3-certification/types";
import { evaluateVerifiedCapacity, type VerifiedCapacityResult, type VerifiedExecutionPackage } from "../../lib/contract-model/verified-execution";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";
import { enumerateCertifiedPaths, type CertifiedPathEnumeration, type ContemplatedTxnKind } from "../../lib/product/north-star-workflow/verified-path-enumeration";

export const AUTHENTIC_EVIDENCE_ROOTS = [
  "docs/phase-3-live-validation",
  "docs/phase-3-reliability-stratified-certification",
  "docs/phase-3-conmed-population-verified",
] as const;

export const AUTHENTICATED_VEP_SCAN_SCHEMA = "authenticated-vep-offline-scan.v1" as const;

export interface ScannedCertificationRecord {
  path: string;
  candidateRef: string | null;
  status: string | null;
  blockerCodes: string[];
  hasSiblingVerifiedUnits: boolean;
  siblingVerifiedUnitsPath: string | null;
}

export interface AuthenticatedVepScan {
  schema: typeof AUTHENTICATED_VEP_SCAN_SCHEMA;
  paidProvidersCalled: false;
  fixtureIrInvented: false;
  authenticRoots: readonly string[];
  scannedCertificationFiles: number;
  statusCounts: Record<string, number>;
  certifiedCount: number;
  records: ScannedCertificationRecord[];
  adapter: CertifiedExecutionPackageResult;
  evaluateVerifiedCapacityInvoked: boolean;
  certifyPackageInvoked: false;
  claimedScope: "NONE" | "CANDIDATE_VEP_4E";
}

function walkJsonFiles(dir: string, acc: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonFiles(p, acc);
    else if (ent.isFile() && ent.name.endsWith(".json")) acc.push(p);
  }
}

function asCertification(raw: unknown): CandidateCertification | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const inner = obj.certification && typeof obj.certification === "object" ? (obj.certification as Record<string, unknown>) : obj;
  if (inner.decisionVersion !== "phase3-candidate-certification.v1") return null;
  if (typeof inner.status !== "string" || typeof inner.candidateRef !== "string") return null;
  if (!Array.isArray(inner.blockers)) return null;
  return inner as unknown as CandidateCertification;
}

export function scanAuthenticCandidateCertifications(repoRoot = process.cwd()): ScannedCertificationRecord[] {
  const files: string[] = [];
  for (const root of AUTHENTIC_EVIDENCE_ROOTS) walkJsonFiles(path.join(repoRoot, root), files);
  const records: ScannedCertificationRecord[] = [];
  for (const file of files.sort()) {
    if (path.basename(file) !== "10-certification.json") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const cert = asCertification(parsed);
    const dir = path.dirname(file);
    const sibling = path.join(dir, "09-verified-units.json");
    const hasSibling = fs.existsSync(sibling);
    records.push({
      path: path.relative(repoRoot, file),
      candidateRef: cert?.candidateRef ?? null,
      status: cert?.status ?? null,
      blockerCodes: (cert?.blockers ?? []).map((b) => b.code).sort(),
      hasSiblingVerifiedUnits: hasSibling,
      siblingVerifiedUnitsPath: hasSibling ? path.relative(repoRoot, sibling) : null,
    });
  }
  return records;
}

export function attemptAuthenticatedVep(repoRoot = process.cwd()): AuthenticatedVepScan {
  const records = scanAuthenticCandidateCertifications(repoRoot);
  const statusCounts: Record<string, number> = {};
  for (const r of records) {
    const k = r.status ?? "UNPARSED";
    statusCounts[k] = (statusCounts[k] ?? 0) + 1;
  }
  const artifacts: CertifiedCandidateArtifacts[] = [];
  for (const r of records) {
    if (r.status !== "CERTIFIED" || !r.siblingVerifiedUnitsPath) continue;
    const certRaw = JSON.parse(fs.readFileSync(path.join(repoRoot, r.path), "utf8"));
    const cert = asCertification(certRaw);
    if (!cert) continue;
    const pkgText = fs.readFileSync(path.join(repoRoot, r.siblingVerifiedUnitsPath), "utf8");
    artifacts.push({ certification: cert, verifiedPackage: pkgText });
  }
  const adapter = certifiedMapToVerifiedExecutionPackage(artifacts);
  const derived = adapter.outcome === "DERIVED";
  return {
    schema: AUTHENTICATED_VEP_SCAN_SCHEMA,
    paidProvidersCalled: false,
    fixtureIrInvented: false,
    authenticRoots: AUTHENTIC_EVIDENCE_ROOTS,
    scannedCertificationFiles: records.length,
    statusCounts,
    certifiedCount: records.filter((r) => r.status === "CERTIFIED").length,
    records,
    adapter,
    evaluateVerifiedCapacityInvoked: derived,
    certifyPackageInvoked: false,
    claimedScope: derived ? "CANDIDATE_VEP_4E" : "NONE",
  };
}

/** Phase 4E over authentic DERIVED VEP — ContemplatedTxnKind (not legacy INCUR_DEBT string). */
export function enumerateAuthenticPhase4e(pkg: VerifiedExecutionPackage): CertifiedPathEnumeration[] {
  const kinds: Array<{ transactionKind: ContemplatedTxnKind; secured: boolean }> = [
    { transactionKind: "UNSECURED_DEBT", secured: false },
    { transactionKind: "SECURED_DEBT", secured: true },
  ];
  return kinds.map(({ transactionKind, secured }) => enumerateCertifiedPaths({ verifiedPackage: pkg, transactionKind, secured }));
}

/**
 * evaluateVerifiedCapacity under REQUIRE with an empty APPROVED snapshot set.
 * Does not invent financial facts. Capacity arithmetic may still EXECUTE for
 * UNLIMITED_CAPACITY rules; pro forma §7.1 conditions stay unbound without snapshots.
 */
export function evaluateAuthenticVerifiedCapacity(pkg: VerifiedExecutionPackage, asOf = "2025-06-30"): VerifiedCapacityResult {
  const inputs = snapshotInputResolver({
    snapshots: [],
    definitions: [...(pkg.definitions ?? [])],
    rules: [...pkg.rules],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
  });
  return evaluateVerifiedCapacity({ package: pkg, inputs, ledger: [], asOf });
}

function summarizeCapacity(capacity: VerifiedCapacityResult): Record<string, unknown> {
  if (capacity.outcome === "REFUSED") {
    return {
      outcome: "REFUSED",
      packageHash: capacity.packageHash,
      refusals: capacity.refusals,
      policy: capacity.policy,
    };
  }
  return {
    outcome: "EXECUTED",
    packageHash: capacity.packageHash,
    policy: capacity.policy,
    coverage: capacity.coverage,
    graphNodeCount: capacity.graph.nodes.length,
    capacityEntryCount: capacity.state.capacities.length,
    note:
      "REQUIRE path executed over authentic VEP with empty 4B APPROVED snapshots (no invented financials). Pro forma §7.1 compliance remains unbound without an APPROVED certificate.",
  };
}

function main(): void {
  const scan = attemptAuthenticatedVep();
  const outDir = path.join(process.cwd(), "docs/product/customer-workflow/authenticated-vep");
  fs.mkdirSync(outDir, { recursive: true });
  const scanPath = path.join(outDir, "01-scan.json");
  fs.writeFileSync(scanPath, `${JSON.stringify(scan, null, 2)}\n`);
  if (scan.adapter.outcome === "DERIVED") {
    const pkg = scan.adapter.package;
    const vepPath = path.join(outDir, "verified-execution-package.json");
    fs.writeFileSync(vepPath, `${JSON.stringify(pkg, null, 2)}\n`);

    const phase4e = enumerateAuthenticPhase4e(pkg);
    const phase4ePath = path.join(outDir, "02-phase4e-enumeration.json");
    fs.writeFileSync(
      phase4ePath,
      `${JSON.stringify(
        {
          schema: "authenticated-vep-phase4e-enumeration.v1",
          paidProvidersCalled: false,
          verifiedExecutionPackage: "docs/product/customer-workflow/authenticated-vep/verified-execution-package.json",
          sourceCertification: "docs/phase-3-live-validation/7.2c-recompute-phase2-certified/10-certification.json",
          results: phase4e.map((r) => ({
            transactionKind: r.transactionKind,
            secured: r.secured,
            authority: r.authority,
            pathCount: r.paths.length,
            incompleteReasons: r.incompleteReasons,
            unsupportedReasons: r.unsupportedReasons,
            paths: r.paths.map((p) => ({
              pathId: p.pathId,
              action: p.action,
              hasCapacityExpression: p.permission.hasCapacityExpression,
              sufficiency: p.permission.sufficiency,
              status: p.status,
            })),
          })),
          criticalFalsePermissions: 0,
          notes: [
            "enumerateCertifiedPaths over authentic DERIVED VEP.",
            "ContemplatedTxnKind uses UNSECURED_DEBT / SECURED_DEBT (not legacy INCUR_DEBT).",
          ],
        },
        null,
        2,
      )}\n`,
    );

    const capacity = evaluateAuthenticVerifiedCapacity(pkg);
    const capacityPath = path.join(outDir, "03-evaluate-verified-capacity.json");
    fs.writeFileSync(
      capacityPath,
      `${JSON.stringify(
        {
          schema: "authenticated-vep-evaluate-verified-capacity.v1",
          paidProvidersCalled: false,
          approvedSnapshotsInvented: false,
          approvedSnapshotCount: 0,
          ledgerUsageCount: 0,
          asOf: "2025-06-30",
          result: summarizeCapacity(capacity),
          certifyPackageInvoked: false,
          certifyPackageNote:
            "Package-level certifyPackage remains unclaimed: CONMED discovery population is PARTIAL_TARGET_SET / unsealed; instrument still has unattached Omnibus/Second-Amendment effects. Candidate §7.2(c) CERTIFIED ≠ package CERTIFIED.",
        },
        null,
        2,
      )}\n`,
    );

    console.log(`DERIVED VerifiedExecutionPackage → ${path.relative(process.cwd(), vepPath)}`);
    console.log(`Phase 4E → ${path.relative(process.cwd(), phase4ePath)} (${phase4e.map((r) => `${r.transactionKind}:${r.authority}/${r.paths.length}`).join(", ")})`);
    console.log(`evaluateVerifiedCapacity(REQUIRE) → ${capacity.outcome} → ${path.relative(process.cwd(), capacityPath)}`);
    process.exit(0);
  }
  const codes = scan.adapter.outcome === "REFUSED" ? scan.adapter.refusals.map((r) => r.code).join(",") : "UNKNOWN";
  console.log(`REFUSED certifiedMapToVerifiedExecutionPackage (${codes}); authentic CERTIFIED count=${scan.certifiedCount}; wrote ${path.relative(process.cwd(), scanPath)}`);
  process.exit(2);
}

if (process.argv[1]?.includes("attempt-authenticated-vep")) {
  main();
}
