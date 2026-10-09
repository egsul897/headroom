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
    blockers.push("No approved FinancialState snapshot — ratio/grower tests and engine capacity cannot be evaluated.");
  }

  let status: CapacityReadinessStatus;
  if (documents.length === 0 && !hasExecutableModel) status = "NO_DOCUMENTS";
  else if (!hasFinancialSnapshot && hasExecutableModel) status = "NO_FINANCIAL_SNAPSHOT";
  else if (!hasExecutableModel) status = "DISCOVERY_ONLY";
  else if (!hasFinancialSnapshot) status = "NO_FINANCIAL_SNAPSHOT";
  else status = "EXECUTABLE_PATH_AVAILABLE";

  // Engine capacity requires both an executable model and a financial snapshot.
  const canEvaluateExecutableCapacity = hasExecutableModel && hasFinancialSnapshot;

  const headline = canEvaluateExecutableCapacity
    ? "Executable capacity path available — figures below come from the covenant engine, not discovery summaries alone."
    : status === "DISCOVERY_ONLY"
      ? "Covenant discovery is available; contractual capacity is NOT DETERMINABLE until an executable rulebook and financial inputs exist."
      : status === "NO_FINANCIAL_SNAPSHOT"
        ? "Financial snapshot missing — capacity cannot be evaluated without inventing inputs."
        : "No capacity evaluation yet — upload financing documents and complete analysis first.";

  const guidance =
    "DISCOVERED ≠ VERIFIED. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE. Headroom will not display fabricated remaining capacity. Use Covenants and Ask Headroom for source-backed provision analysis; use Simulate only when the engine has governing configuration.";

  return {
    companyId,
    status,
    canEvaluateExecutableCapacity,
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
