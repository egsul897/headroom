/**
 * Capacity surface readiness — distinguishes discovery analysis from executable capacity.
 * Never invents headroom figures; overview/capacity pages fail closed when unsupported.
 *
 * Authority note: figures from the legacy covenant engine are LEGACY_ENGINE /
 * NOT_CERTIFIED_4E until Phase 4A–4E + APPROVED snapshots replace them on product paths.
 */

import { prisma } from "@/lib/prisma";
import { resolveCanonicalFinancialIdentity } from "@/lib/financial-identity";
import { loadApprovedSnapshotsFromPrisma, loadLedgerUsagesFromPrisma } from "@/lib/contract-model/north-star-bridge";
import { listCustomerDocumentIntelligence } from "./load";
import { loadPhase3TrustedRulebookStatus } from "./phase3-trusted-rulebook";

export type CapacityReadinessStatus =
  | "EXECUTABLE_PATH_AVAILABLE"
  | "DISCOVERY_ONLY"
  | "NO_FINANCIAL_SNAPSHOT"
  | "NO_DOCUMENTS";

/**
 * Provenance of numerical capacity figures — never upgraded by trusted semantic units alone.
 * LEGACY_ENGINE / NOT_CERTIFIED_4E: counsel-compiled Prisma Permissions + covenant-engine
 * against dated FinancialState — not Phase 4B APPROVED snapshots or Phase 4E paths.
 */
export type CapacityAuthority = "LEGACY_ENGINE" | "NOT_CERTIFIED_4E" | "DISCOVERY_ONLY" | "NONE";

export interface CapacityReadiness {
  companyId: string;
  status: CapacityReadinessStatus;
  /** True only when the legacy/engine capacity path can run without inventing inputs. */
  canEvaluateExecutableCapacity: boolean;
  /** Explicit label for any capacity numbers this surface may show. */
  capacityAuthority: CapacityAuthority;
  analyzedDocumentCount: number;
  summaryCount: number;
  permissionCount: number;
  /** Permissions with reviewStatus UNVERIFIED (promoted but not counsel-verified). */
  unverifiedPermissionCount: number;
  provisionCount: number;
  hasFinancialSnapshot: boolean;
  /** NS-4 APPROVED ContractInput snapshots (0 when table empty / unavailable). */
  ns4ApprovedSnapshotCount: number;
  /** North-Star Phase 4B APPROVED snapshot count (via bridge; may equal ns4 when wired). */
  approvedNorthStarSnapshotCount: number;
  /** Active (non-SUPERSEDED) Phase 4C contract ledger usages. */
  contractLedgerActiveCount: number;
  /**
   * Phase 3 VERIFIED SemanticTruthRecord count (getTrustedSemanticTruth gate).
   * Present when eligible trusted outputs exist — not package CERTIFIED / not 4E.
   */
  phase3TrustedUnitCount: number;
  phase3TrustedRuleCount: number;
  headline: string;
  blockers: string[];
  guidance: string;
}

export async function loadCapacityReadiness(companyId: string): Promise<CapacityReadiness> {
  const [
    documents,
    permissionCount,
    unverifiedPermissionCount,
    provisionCount,
    financialResolution,
    ns4ApprovedSnapshotCount,
    approvedSnaps,
    contractLedger,
    phase3,
  ] = await Promise.all([
    listCustomerDocumentIntelligence(companyId),
    prisma.permission.count({ where: { companyId } }),
    prisma.permission.count({ where: { companyId, reviewStatus: "UNVERIFIED" } }),
    prisma.covenantProvision.count({ where: { companyId } }),
    resolveCanonicalFinancialIdentity((args) => prisma.financialState.findMany(args), {
      where: { companyId },
      selection: "latest-cohort",
    }),
    prisma.contractInputSnapshot
      .count({ where: { companyId, status: "APPROVED" } })
      .catch(() => 0),
    loadApprovedSnapshotsFromPrisma(prisma, companyId).catch(() => []),
    loadLedgerUsagesFromPrisma(prisma, companyId).catch(() => []),
    loadPhase3TrustedRulebookStatus(companyId).catch(() => null),
  ]);

  const analyzedDocumentCount = documents.filter((d) => d.analysisOk).length;
  const summaryCount = documents.reduce((n, d) => n + (d.summary?.items.length ?? 0), 0);
  const hasFinancialSnapshot = financialResolution.status === "UNIQUE";
  const hasExecutableModel = permissionCount > 0 || provisionCount > 0;
  const phase3TrustedUnitCount = phase3?.trustedUnitCount ?? 0;
  const phase3TrustedRuleCount = phase3?.trustedRuleCount ?? 0;
  const approvedNorthStarSnapshotCount = approvedSnaps.length;
  const contractLedgerActiveCount = contractLedger.filter((u) => u.status !== "SUPERSEDED").length;

  const blockers: string[] = [];
  if (documents.length === 0) blockers.push("No financing documents uploaded in this workspace.");
  else if (analyzedDocumentCount === 0) {
    blockers.push("Uploaded documents have not produced successful covenant analyses yet.");
  }
  if (!hasExecutableModel) {
    blockers.push(
      "No executable legal rulebook (Permission / CovenantProvision rows) is approved for this workspace — discovery summaries are not capacity.",
    );
  }
  if (!hasFinancialSnapshot) {
    blockers.push(
      "No dated FinancialState on the legacy path — ratio/grower tests and engine capacity cannot be evaluated (Phase 4B APPROVED snapshots are a separate North-Star store).",
    );
  }
  // Missing Phase 3 VERIFIED units / NS-4 APPROVED snapshots are reported in the
  // headline note, not as capacity blockers — the legacy executable path may still run honestly.

  let status: CapacityReadinessStatus;
  if (documents.length === 0 && !hasExecutableModel) status = "NO_DOCUMENTS";
  else if (!hasFinancialSnapshot && hasExecutableModel) status = "NO_FINANCIAL_SNAPSHOT";
  else if (!hasExecutableModel) status = "DISCOVERY_ONLY";
  else if (!hasFinancialSnapshot) status = "NO_FINANCIAL_SNAPSHOT";
  else status = "EXECUTABLE_PATH_AVAILABLE";

  // Engine capacity requires both an executable model and a financial snapshot.
  const canEvaluateExecutableCapacity = hasExecutableModel && hasFinancialSnapshot;
  const capacityAuthority: CapacityAuthority = canEvaluateExecutableCapacity
    ? "LEGACY_ENGINE"
    : hasExecutableModel
      ? "NOT_CERTIFIED_4E"
      : analyzedDocumentCount > 0
        ? "DISCOVERY_ONLY"
        : "NONE";

  const ns4Note =
    ns4ApprovedSnapshotCount > 0 || approvedNorthStarSnapshotCount > 0
      ? ` NS-4 / North-Star APPROVED financial snapshots on file: ${Math.max(ns4ApprovedSnapshotCount, approvedNorthStarSnapshotCount)}.`
      : " No NS-4 APPROVED financial snapshot yet.";
  const phase3Note =
    phase3TrustedUnitCount > 0
      ? ` Phase 3 trusted semantic units on file: ${phase3TrustedUnitCount} VERIFIED (${phase3TrustedRuleCount} rules) — not package CERTIFIED · not Phase 4E capacity.`
      : " No Phase 3 VERIFIED semantic units yet.";
  const unverifiedNote =
    unverifiedPermissionCount > 0
      ? ` Promoted Permissions include ${unverifiedPermissionCount} UNVERIFIED row(s) (legacy path · not Phase 3 CERTIFIED).`
      : "";
  const ledgerNote =
    contractLedgerActiveCount > 0
      ? ` Active contract-ledger usages: ${contractLedgerActiveCount}.`
      : "";

  const headline = canEvaluateExecutableCapacity
    ? `Executable capacity path available — covenant-engine figures over uploaded documents and financials (LEGACY_ENGINE · capacityAuthority=${capacityAuthority} · not Phase 3 package CERTIFIED · not certified Phase 4E).${ns4Note}${phase3Note}${unverifiedNote}${ledgerNote}`
    : status === "DISCOVERY_ONLY"
      ? `AI covenant interpretations are available for counsel review. Numerical capacity stays blank until an executable rulebook and financial inputs exist.${phase3Note}`
      : status === "NO_FINANCIAL_SNAPSHOT"
        ? `AI interpretations are available; financial snapshot missing — numerical capacity cannot be evaluated without inventing inputs.${phase3Note}`
        : phase3TrustedUnitCount > 0
          ? `Phase 3 trusted semantic units on file (${phase3TrustedUnitCount} VERIFIED) without an executable Permission/financial path yet — not package CERTIFIED · not Phase 4E capacity.`
          : "Upload financing documents and financials to begin. Headroom will not invent headroom figures.";

  const guidance =
    "AI-first: analysis appears for counsel review without waiting for outside counsel. DISCOVERED ≠ counsel-approved. Promoted Permission rows are UNVERIFIED and are not the Phase 3 certified rulebook. Phase 3 VERIFIED SemanticTruthRecord units are trusted semantic outputs when present — they do not alone certify package-level or Phase 4E capacity. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE capacity. LEGACY_ENGINE ≠ certified Phase 4A–4E. Missing inputs stay blank — never fabricated remaining capacity.";

  return {
    companyId,
    status,
    canEvaluateExecutableCapacity,
    capacityAuthority,
    analyzedDocumentCount,
    summaryCount,
    permissionCount,
    unverifiedPermissionCount,
    provisionCount,
    hasFinancialSnapshot,
    ns4ApprovedSnapshotCount,
    approvedNorthStarSnapshotCount,
    contractLedgerActiveCount,
    phase3TrustedUnitCount,
    phase3TrustedRuleCount,
    headline,
    blockers,
    guidance,
  };
}
