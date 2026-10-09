/**
 * Rulebook readiness — DISCOVERED / INTERPRETED / REVIEWED / EXECUTABLE ladder.
 * Never promotes discovery to executable without review evidence.
 */

import { prisma } from "@/lib/prisma";
import { listCustomerDocumentIntelligence } from "./load";
import { loadCapacityReadiness } from "./capacity-readiness";
import { listReviewerApprovals } from "./reviewer-approvals";

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
  const [docs, capacity, permissions, provisions, goldenVerified, counselApprovals] = await Promise.all([
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
    listReviewerApprovals(companyId),
  ]);

  const discoveredSummaries = docs.reduce((n, d) => n + (d.summary?.items.length ?? 0), 0);
  const interpretedProvisions = docs
    .flatMap((d) => d.summary?.items ?? [])
    .filter((i) => i.plainEnglish && !/appears to address/i.test(i.plainEnglish)).length;

  const counselReviewed = counselApprovals.filter(
    (a) => a.decision === "ACCEPTED" || a.decision === "EDITED",
  ).length;
  const reviewedPermissions =
    permissions.filter((p) => /VERIFIED|REVIEWED|APPROVED/i.test(String(p.reviewStatus))).length +
    counselReviewed;
  const executablePermissions = permissions.length;

  const blockers: string[] = [];
  if (discoveredSummaries === 0) blockers.push("No discovered covenant summaries yet.");
  if (interpretedProvisions === 0) blockers.push("No substantive interpretations persisted.");
  if (counselReviewed === 0 && executablePermissions === 0) {
    blockers.push(
      "No workspace counsel accept/edit decisions yet — AI interpretations are available for review on /rulebook.",
    );
  }
  if (executablePermissions === 0) {
    blockers.push(
      "No Permission / executable compiler rows yet — capacity numbers stay fail-closed even after counsel review.",
    );
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
  if (capacity.canEvaluateExecutableCapacity && executablePermissions > 0 && reviewedPermissions > 0) {
    stage = "EXECUTABLE";
  }

  const headline =
    stage === "EXECUTABLE"
      ? "Executable rulebook path available for supported permissions only."
      : stage === "REVIEWED"
        ? "Workspace counsel has accepted/edited AI interpretations; compiler Permission rows may still be needed for capacity."
        : stage === "INTERPRETED"
          ? "AI interpretations ready for customer counsel review — not blocked on external legal verification."
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
