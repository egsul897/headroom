/**
 * Offline attempt to derive a VerifiedExecutionPackage from on-disk authentic
 * Phase-3 CERTIFIED artifacts only.
 *
 * Uses certifiedMapToVerifiedExecutionPackage. Never calls paid providers.
 * Never invents FIXTURE_IR. Never treats PINNED_OFFLINE, REVIEW_REQUIRED,
 * population verified-units, or product-acceptance mocked CERTIFIED as credit.
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
  evaluateVerifiedCapacityInvoked: false;
  certifyPackageInvoked: false;
  claimedScope: "NONE";
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
    evaluateVerifiedCapacityInvoked: false,
    certifyPackageInvoked: false,
    claimedScope: "NONE",
  };
}

function main(): void {
  const scan = attemptAuthenticatedVep();
  const outDir = path.join(process.cwd(), "docs/product/customer-workflow/authenticated-vep");
  fs.mkdirSync(outDir, { recursive: true });
  const scanPath = path.join(outDir, "01-scan.json");
  fs.writeFileSync(scanPath, `${JSON.stringify(scan, null, 2)}\n`);
  if (scan.adapter.outcome === "DERIVED") {
    const vepPath = path.join(outDir, "verified-execution-package.json");
    fs.writeFileSync(vepPath, `${JSON.stringify(scan.adapter.package, null, 2)}\n`);
    console.log(`DERIVED VerifiedExecutionPackage → ${path.relative(process.cwd(), vepPath)}`);
    process.exit(0);
  }
  const codes = scan.adapter.outcome === "REFUSED" ? scan.adapter.refusals.map((r) => r.code).join(",") : "UNKNOWN";
  console.log(`REFUSED certifiedMapToVerifiedExecutionPackage (${codes}); authentic CERTIFIED count=${scan.certifiedCount}; wrote ${path.relative(process.cwd(), scanPath)}`);
  process.exit(2);
}

if (process.argv[1]?.includes("attempt-authenticated-vep")) {
  main();
}
