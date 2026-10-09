/**
 * Capacity surface readiness — distinguishes discovery analysis from executable capacity.
 * Never invents headroom figures; pages use this to fail closed when unsupported.
 */

import { prisma } from "@/lib/prisma";
import { resolveCanonicalFinancialIdentity } from "@/lib/financial-identity";
import { listCustomerDocumentIntelligence } from "./load";

export type CapacityReadinessStatus =
  | "EXECUTABLE_PATH_AVAILABLE"
  | "DISCOVERY_ONLY"
  | "NO_FINANCIAL_SNAPSHOT"
  | "NO_DOCUMENTS";

/** Authority of capacity figures — North Star forbids presenting legacy engine results as certified 4A–4E. */
export type CapacityAuthority =
  | "LEGACY_ENGINE"
  | "NOT_CERTIFIED_4E"
  | "DISCOVERY_ONLY"
  | "NONE";

export interface CapacityReadiness {
  companyId: string;
  status: CapacityReadinessStatus;
  /** True only when the legacy/engine capacity path can run without inventing inputs. */
  canEvaluateExecutableCapacity: boolean;
  /**
   * Provenance label for any numerical capacity this surface may show.
   * LEGACY_ENGINE / NOT_CERTIFIED_4E: counsel-compiled Prisma Permissions + covenant-engine
   * against dated FinancialState — not Phase 4B APPROVED snapshots or Phase 4E paths.
   */
  capacityAuthority: CapacityAuthority;
  analyzedDocumentCount: number;
  summaryCount: number;
  permissionCount: number;
  provisionCount: number;
  hasFinancialSnapshot: boolean;
  headline: string;
  blockers: string[];
  guidance: string;
}

export async function loadCapacityReadiness(companyId: string): Promise<CapacityReadiness> {
  const [documents, permissionCount, provisionCount, financialResolution] = await Promise.all([
    listCustomerDocumentIntelligence(companyId),
    prisma.permission.count({ where: { companyId } }),
    prisma.covenantProvision.count({ where: { companyId } }),
    resolveCanonicalFinancialIdentity((args) => prisma.financialState.findMany(args), {
      where: { companyId },
      selection: "latest-cohort",
    }),
  ]);

  const analyzedDocumentCount = documents.filter((d) => d.analysisOk).length;
  const summaryCount = documents.reduce((n, d) => n + (d.summary?.items.length ?? 0), 0);
  const hasFinancialSnapshot = financialResolution.status === "UNIQUE";
  const hasExecutableModel = permissionCount > 0 || provisionCount > 0;

  const blockers: string[] = [];
  if (documents.length === 0) blockers.push("No financing documents uploaded in this workspace.");
  else if (analyzedDocumentCount === 0) blockers.push("Uploaded documents have not produced successful covenant analyses yet.");
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

  const headline = canEvaluateExecutableCapacity
    ? "Legacy executable capacity path available — figures use counsel-compiled Permissions + covenant-engine against dated FinancialState (LEGACY_ENGINE · NOT Phase 4E / NOT Phase 4B APPROVED)."
    : status === "DISCOVERY_ONLY"
      ? "AI covenant interpretations are available for counsel review now. Numerical capacity remains conditional until a counsel-reviewed executable rulebook and financial inputs exist — Headroom will not invent figures."
      : status === "NO_FINANCIAL_SNAPSHOT"
        ? "AI interpretations and baskets are available; dated financial snapshot missing — numerical capacity cannot be evaluated without inventing inputs. Supply financials or use conditional Ask analysis."
        : "No capacity evaluation yet — upload financing documents and run AI analysis first (external legal verification is not required to start).";

  const guidance =
    "AI-first: Headroom generates substantive interpretations for customer counsel review without waiting for external legal verification. DISCOVERED ≠ counsel-approved. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE capacity. LEGACY_ENGINE capacity ≠ certified Phase 4A–4E North-Star capacity. Missing inputs produce conditional analysis — never fabricated remaining capacity. Use Covenants / Rulebook / Ask for AI analysis; use Simulate when the engine has governing configuration.";

  return {
    companyId,
    status,
    canEvaluateExecutableCapacity,
    capacityAuthority,
    analyzedDocumentCount,
    summaryCount,
    permissionCount,
    provisionCount,
    hasFinancialSnapshot,
    headline,
    blockers,
    guidance,
  };
}
