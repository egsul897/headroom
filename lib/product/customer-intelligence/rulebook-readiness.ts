/**
 * Rulebook readiness — DISCOVERED / INTERPRETED / REVIEWED / EXECUTABLE ladder.
 * Never promotes discovery to executable without review evidence.
 */

import { prisma } from "@/lib/prisma";
import { listCustomerDocumentIntelligence, getLatestAmendmentPackage } from "./load";
import { loadCapacityReadiness } from "./capacity-readiness";
import { listReviewerApprovals } from "./reviewer-approvals";
import { verifiedPermissionCount } from "./rulebook-permission-counts";

export type RulebookStage = "DISCOVERED" | "INTERPRETED" | "REVIEWED" | "EXECUTABLE";

export interface RulebookReadiness {
  companyId: string;
  stage: RulebookStage;
  discoveredSummaries: number;
  /** Discovered summary items from analyses predating the current analyzer build (rule 162). */
  staleDiscoveredSummaries: number;
  interpretedProvisions: number;
  reviewedPermissions: number;
  executablePermissions: number;
  provisionRows: number;
  blockers: string[];
  headline: string;
  note: string;
}

/**
 * Rule 162: headline note for stale summaries feeding the rulebook
 * ladder. Same gap as capacity (rule 161): discoveredSummaries and
 * interpretedProvisions counted stale items with no disclosure.
 * Disclosure, not a blocker — the old analyses still exist.
 */
export function rulebookStaleNote(staleDiscoveredSummaries: number): string {
  if (staleDiscoveredSummaries <= 0) return "";
  return ` ${staleDiscoveredSummaries} discovered summary items come from analyses predating the current analyzer build — re-analyze for current results.`;
}

export async function loadRulebookReadiness(companyId: string): Promise<RulebookReadiness> {
  const [docs, capacity, permissions, provisions, goldenVerified, counselApprovals, amendment] = await Promise.all([
    listCustomerDocumentIntelligence(companyId),
    loadCapacityReadiness(companyId),
    prisma.permission.findMany({
      where: { companyId },
      select: { id: true, reviewStatus: true, modelingStatus: true },
    }),
    prisma.covenantProvision.count({ where: { companyId } }),
    prisma.goldenTest.count({
      where: { companyId, status: "VERIFIED" },
    }),
    listReviewerApprovals(companyId),
    getLatestAmendmentPackage(companyId),
  ]);

  const discoveredSummaries = docs.reduce((n, d) => n + (d.summary?.items.length ?? 0), 0);
  // Rule 162: stale items count toward the ladder unless disclosed.
  const staleDiscoveredSummaries = docs
    .filter((d) => d.analysisStale)
    .reduce((n, d) => n + (d.summary?.items.length ?? 0), 0);
  const interpretedProvisions = docs
    .flatMap((d) => d.summary?.items ?? [])
    .filter((i) => i.plainEnglish && !/appears to address/i.test(i.plainEnglish)).length;

  const counselReviewed = counselApprovals.filter(
    (a) => a.decision === "ACCEPTED" || a.decision === "EDITED",
  ).length;
  // Rule 47: only VERIFIED Permission rows count as reviewed /
  // executable. The old /VERIFIED|REVIEWED|APPROVED/i regex
  // matched "UNVERIFIED" as a substring, so every
  // compiler-minted (default UNVERIFIED) row counted.
  const verifiedPermissions = verifiedPermissionCount(permissions.map((p) => String(p.reviewStatus)));
  const reviewedPermissions = verifiedPermissions + counselReviewed;
  // Integration fix: executable = MODELED (the engine executes
  // MODELED Permissions compiled from counsel decisions), not
  // VERIFIED — no code path ever sets a Permission to VERIFIED,
  // so the old count was always 0 and EXECUTABLE unreachable.
  const executablePermissions = permissions.filter((p) => p.modelingStatus === "MODELED").length;

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
  // Rule 67: unresolved amendment precedence caps the ladder at
  // REVIEWED. VERIFIED Permissions + capacity are not enough
  // when the operative text itself is uncertain — the live
  // Permissions may be compiled from a superseded document's
  // sections. Same package source the monitoring feed uses.
  const precedenceUnresolved = amendment?.operativeResolution === "UNRESOLVED_PRECEDENCE";
  if (precedenceUnresolved) {
    blockers.push(
      "Amendment precedence unresolved — the operative rulebook is uncertain; EXECUTABLE withheld until precedence resolves.",
    );
  }

  let stage: RulebookStage = "DISCOVERED";
  if (interpretedProvisions > 0) stage = "INTERPRETED";
  if (reviewedPermissions > 0) stage = "REVIEWED";
  if (capacity.canEvaluateExecutableCapacity && executablePermissions > 0 && reviewedPermissions > 0 && !precedenceUnresolved) {
    stage = "EXECUTABLE";
  }

  const headlineBase =
    stage === "EXECUTABLE"
      ? "Executable rulebook path available for supported permissions only."
      : stage === "REVIEWED"
        ? "Workspace counsel has accepted/edited AI interpretations; compiler Permission rows may still be needed for capacity."
        : stage === "INTERPRETED"
          ? "AI interpretations ready for customer counsel review — not blocked on external legal verification."
          : "Only discovery (or empty) state — no interpreted rulebook yet.";
  const headline = headlineBase + rulebookStaleNote(staleDiscoveredSummaries);

  return {
    companyId,
    stage,
    discoveredSummaries,
    staleDiscoveredSummaries,
    interpretedProvisions,
    reviewedPermissions,
    executablePermissions,
    provisionRows: provisions,
    blockers,
    headline,
    note: "DISCOVERED → INTERPRETED → REVIEWED → EXECUTABLE. Headroom never auto-promotes discovery text into executable permissions.",
  };
}
