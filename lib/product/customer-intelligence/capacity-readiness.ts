/**
 * Capacity surface readiness — distinguishes discovery analysis from executable capacity.
 * Never invents headroom figures; overview/capacity pages fail closed when unsupported.
 *
 * Authority note: figures from the legacy covenant engine are LEGACY_ENGINE /
 * NOT_CERTIFIED_4E until Phase 4A–4E + APPROVED snapshots replace them on product paths.
 */

import { prisma } from "@/lib/prisma";
import { resolveCanonicalFinancialIdentity } from "@/lib/financial-identity";
import { listCustomerDocumentIntelligence } from "./load";

export type CapacityReadinessStatus =
  | "EXECUTABLE_PATH_AVAILABLE"
  | "DISCOVERY_ONLY"
  | "NO_FINANCIAL_SNAPSHOT"
  | "NO_DOCUMENTS";

export interface CapacityReadiness {
  companyId: string;
  status: CapacityReadinessStatus;
  /** True only when the legacy/engine capacity path can run without inventing inputs. */
  canEvaluateExecutableCapacity: boolean;
  analyzedDocumentCount: number;
  summaryCount: number;
  permissionCount: number;
  provisionCount: number;
  hasFinancialSnapshot: boolean;
  /** NS-4 APPROVED ContractInput snapshots (0 when table empty / unavailable). */
  ns4ApprovedSnapshotCount: number;
  headline: string;
  blockers: string[];
  guidance: string;
}

export async function loadCapacityReadiness(companyId: string): Promise<CapacityReadiness> {
  const [documents, permissionCount, provisionCount, financialResolution, ns4ApprovedSnapshotCount] =
    await Promise.all([
      listCustomerDocumentIntelligence(companyId),
      prisma.permission.count({ where: { companyId } }),
      prisma.covenantProvision.count({ where: { companyId } }),
      resolveCanonicalFinancialIdentity((args) => prisma.financialState.findMany(args), {
        where: { companyId },
        selection: "latest-cohort",
      }),
      prisma.contractInputSnapshot
        .count({ where: { companyId, status: "APPROVED" } })
        .catch(() => 0),
    ]);

  const analyzedDocumentCount = documents.filter((d) => d.analysisOk).length;
  const summaryCount = documents.reduce((n, d) => n + (d.summary?.items.length ?? 0), 0);
  const hasFinancialSnapshot = financialResolution.status === "UNIQUE";
  const hasExecutableModel = permissionCount > 0 || provisionCount > 0;

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
      "No approved FinancialState snapshot — ratio/grower tests and engine capacity cannot be evaluated.",
    );
  }

  let status: CapacityReadinessStatus;
  if (documents.length === 0 && !hasExecutableModel) status = "NO_DOCUMENTS";
  else if (!hasFinancialSnapshot && hasExecutableModel) status = "NO_FINANCIAL_SNAPSHOT";
  else if (!hasExecutableModel) status = "DISCOVERY_ONLY";
  else if (!hasFinancialSnapshot) status = "NO_FINANCIAL_SNAPSHOT";
  else status = "EXECUTABLE_PATH_AVAILABLE";

  const canEvaluateExecutableCapacity = hasExecutableModel && hasFinancialSnapshot;

  const ns4Note =
    ns4ApprovedSnapshotCount > 0
      ? ` NS-4 APPROVED financial snapshots on file: ${ns4ApprovedSnapshotCount}.`
      : " No NS-4 APPROVED financial snapshot yet.";

  const headline = canEvaluateExecutableCapacity
    ? `Executable capacity path available — covenant-engine figures over uploaded documents and financials (LEGACY_ENGINE · not Phase 3 CERTIFIED rulebook · not certified Phase 4E).${ns4Note}`
    : status === "DISCOVERY_ONLY"
      ? "AI covenant interpretations are available for counsel review. Numerical capacity stays blank until an executable rulebook and financial inputs exist."
      : status === "NO_FINANCIAL_SNAPSHOT"
        ? "AI interpretations are available; financial snapshot missing — numerical capacity cannot be evaluated without inventing inputs."
        : "Upload financing documents and financials to begin. Headroom will not invent headroom figures.";

  const guidance =
    "AI-first: analysis appears for counsel review without waiting for outside counsel. DISCOVERED ≠ counsel-approved. Promoted Permission rows are UNVERIFIED and are not the Phase 3 certified rulebook. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE capacity. LEGACY_ENGINE ≠ certified Phase 4A–4E. Missing inputs stay blank — never fabricated remaining capacity.";

  return {
    companyId,
    status,
    canEvaluateExecutableCapacity,
    analyzedDocumentCount,
    summaryCount,
    permissionCount,
    provisionCount,
    hasFinancialSnapshot,
    ns4ApprovedSnapshotCount,
    headline,
    blockers,
    guidance,
  };
}
