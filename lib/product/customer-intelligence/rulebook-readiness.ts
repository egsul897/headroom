/**
 * Rulebook readiness — DISCOVERED / INTERPRETED / REVIEWED / EXECUTABLE ladder.
 * Never promotes discovery to executable without review evidence.
 */

import { prisma } from "@/lib/prisma";
import { listCustomerDocumentIntelligence } from "./load";
import { loadCapacityReadiness } from "./capacity-readiness";

export type RulebookStage = "DISCOVERED" | "INTERPRETED" | "REVIEWED" | "EXECUTABLE";

export interface RulebookReadiness {
  companyId: string;
  stage: RulebookStage;
  discoveredSummaries: number;
  interpretedProvisions: number;
  reviewedPermissions: number;
  executablePermissions: number;
  provisionRows: number;
  blockers: string[];
  headline: string;
  note: string;
}

export async function loadRulebookReadiness(companyId: string): Promise<RulebookReadiness> {
  const [docs, capacity, permissions, provisions, goldenVerified] = await Promise.all([
    listCustomerDocumentIntelligence(companyId),
    loadCapacityReadiness(companyId),
    prisma.permission.findMany({
      where: { companyId },
      select: { id: true, reviewStatus: true },
    }),
    prisma.covenantProvision.count({ where: { companyId } }),
    prisma.goldenTest.count({
      where: { companyId, status: "VERIFIED" },
    }),
  ]);

  const discoveredSummaries = docs.reduce((n, d) => n + (d.summary?.items.length ?? 0), 0);
  const interpretedProvisions = docs
    .flatMap((d) => d.summary?.items ?? [])
    .filter((i) => i.plainEnglish && !/appears to address/i.test(i.plainEnglish)).length;

  const reviewedPermissions = permissions.filter((p) =>
    /VERIFIED|REVIEWED|APPROVED/i.test(String(p.reviewStatus)),
  ).length;
  const executablePermissions = permissions.length;

  const blockers: string[] = [];
  if (discoveredSummaries === 0) blockers.push("No discovered covenant summaries yet.");
  if (interpretedProvisions === 0) blockers.push("No substantive interpretations persisted.");
  if (executablePermissions === 0) {
    blockers.push("No Permission / executable rulebook rows — discovery cannot authorize capacity.");
  } else if (reviewedPermissions === 0) {
    blockers.push("Permissions exist but none have completed qualified legal review.");
  }
  if (!capacity.hasFinancialSnapshot) {
    blockers.push("No financial snapshot — ratio/grower executable tests cannot run.");
  }
  if (goldenVerified === 0 && executablePermissions > 0) {
    blockers.push("No verified golden tests for this workspace (optional confidence signal).");
  }

  let stage: RulebookStage = "DISCOVERED";
  if (interpretedProvisions > 0) stage = "INTERPRETED";
  if (reviewedPermissions > 0) stage = "REVIEWED";
  if (capacity.canEvaluateExecutableCapacity && reviewedPermissions > 0) stage = "EXECUTABLE";

  const headline =
    stage === "EXECUTABLE"
      ? "Executable rulebook path available for supported permissions only."
      : stage === "REVIEWED"
        ? "Some permissions are reviewed; financial/capacity path may still be incomplete."
        : stage === "INTERPRETED"
          ? "Substantive interpretations exist; nothing has been promoted to REVIEWED/EXECUTABLE."
          : "Only discovery (or empty) state — no interpreted rulebook yet.";

  return {
    companyId,
    stage,
    discoveredSummaries,
    interpretedProvisions,
    reviewedPermissions,
    executablePermissions,
    provisionRows: provisions,
    blockers,
    headline,
    note: "DISCOVERED → INTERPRETED → REVIEWED → EXECUTABLE. Headroom never auto-promotes discovery text into executable permissions.",
  };
}
