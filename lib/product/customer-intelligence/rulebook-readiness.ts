/**
 * Rulebook readiness — DISCOVERED / INTERPRETED / REVIEWED / EXECUTABLE ladder.
 * Never promotes discovery to executable without review evidence.
 */

import { prisma } from "@/lib/prisma";
import { listCustomerDocumentIntelligence, getLatestAmendmentPackage } from "./load";
import { loadCapacityReadiness } from "./capacity-readiness";
import { listReviewerApprovals } from "./reviewer-approvals";
import { verifiedPermissionCount } from "./rulebook-permission-counts";
import { isRoutineItem } from "./routine-review";

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
  /** Exception-based review: summary units needing a counsel decision (non-routine). */
  exceptionItems: number;
  /** Exception units with a counsel decision. */
  exceptionDecisions: number;
  /** True when every discovered unit is decided (routine via system, exceptions via counsel). */
  reviewComplete: boolean;
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

  // Fix 6: count unique reviewable units (sourceId, sectionRef,
  // category), not raw items — the summary may carry two items
  // with the same (ref, category) (parser duplicates); decisions,
  // the Rulebook queue, and coverage all key on (sourceId, ref,
  // category), so the ladder must count the same units or it can
  // never clear. The sourceId is load-bearing: two documents with
  // the same section reference (e.g. §6.01 in a base agreement and
  // §6.01 in its amendment) are DIFFERENT units — a decision on one
  // document's §6.01 must not satisfy the other's. Without the
  // sourceId, the second document's review was silently satisfied
  // by the first's decisions.
  // Phase C (D11): a review unit is (sourceId, ref, category,
  // nodeId). Two items sharing (ref, category) are distinct
  // occurrences (CA §5.01 vs Guaranty §5.01; definition
  // fragments sharing a ref) with distinct decisions.
  const unitKey = (sourceId: string, i: { sectionRef: string; category: string; nodeId?: string }) =>
    `${sourceId}::${i.sectionRef}::${i.category}::${i.nodeId ?? ""}`;
  const uniqueUnits = (sourceId: string, items: { sectionRef: string; category: string; nodeId?: string }[]) =>
    new Set(items.map((i) => unitKey(sourceId, i))).size;
  const discoveredSummaries = docs.reduce((n, d) => n + uniqueUnits(d.sourceId, d.summary?.items ?? []), 0);
  // Rule 162: stale items count toward the ladder unless disclosed.
  const staleDiscoveredSummaries = docs
    .filter((d) => d.analysisStale)
    .reduce((n, d) => n + uniqueUnits(d.sourceId, d.summary?.items ?? []), 0);
  const interpretedProvisions = new Set(
    docs.flatMap((d) =>
      (d.summary?.items ?? [])
        .filter((i) => i.plainEnglish && !/appears to address/i.test(i.plainEnglish))
        .map((i) => unitKey(d.sourceId, i)),
    ),
  ).size;

  // Exception-based review: dedup units by (sourceId, ref, category)
  // keeping the first item per key (same unit the Rulebook queue
  // uses), classify each unit, and count decisions on exception units.
  const unitMap = new Map<string, unknown>();
  for (const d of docs) {
    for (const item of d.summary?.items ?? []) {
      const key = unitKey(d.sourceId, item);
      if (!unitMap.has(key)) unitMap.set(key, item);
    }
  }
  const exceptionKeys = new Set(
    [...unitMap.entries()].filter(([, item]) => !isRoutineItem(item as never)).map(([key]) => key),
  );
  const exceptionItems = exceptionKeys.size;
  const decisionKeys = new Set(
    counselApprovals
      .map((a) => `${a.sourceId ?? ""}::${a.sectionRef}::${a.category}::${(a as { nodeId?: string }).nodeId ?? ""}`)
      .filter((k) => unitMap.has(k)),
  );
  const exceptionDecisions = [...decisionKeys].filter((k) => exceptionKeys.has(k)).length;
  const reviewComplete = unitMap.size > 0 && decisionKeys.size >= unitMap.size;

  // Counsel decisions only: SYSTEM auto-accepts (decision ACCEPTED,
  // reviewerKind SYSTEM) are not counsel review evidence.
  const counselReviewed = counselApprovals.filter(
    (a) => (a.decision === "ACCEPTED" || a.decision === "EDITED") && a.reviewerKind !== "SYSTEM",
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
      "No counsel decisions and no compiled permissions yet — exception items are available for review on /rulebook (routine interpretations auto-accept).",
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
  // Exception-based review: REVIEWED = every unit decided (routine
  // via system auto-accept, exceptions via counsel). EXECUTABLE no
  // longer requires reviewedPermissions > 0 — that was the
  // mandatory-approval bottleneck (routine items needed no counsel
  // decision but the gate demanded one anyway).
  if (reviewComplete) stage = "REVIEWED";
  if (capacity.canEvaluateExecutableCapacity && executablePermissions > 0 && reviewComplete && !precedenceUnresolved) {
    stage = "EXECUTABLE";
  }

  const headlineBase =
    stage === "EXECUTABLE"
      ? "Executable rulebook path available for supported permissions only."
      : stage === "REVIEWED"
        ? "All interpretations decided — routine items system-accepted, exception items counsel-decided; compiler Permission rows may still be needed for capacity."
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
    exceptionItems,
    exceptionDecisions,
    reviewComplete,
    blockers,
    headline,
    note: "DISCOVERED → INTERPRETED → REVIEWED → EXECUTABLE. Routine supported interpretations auto-compile as system-accepted (never labeled counsel-verified); exception items require a counsel decision.",
  };
}
