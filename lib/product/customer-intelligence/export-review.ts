/**
 * Export covenant review workspace as markdown (shared persisted analyses).
 * Not a second interpretation engine.
 */

import type { CovenantReviewWorkspace } from "./covenant-review";

export function renderCovenantReviewMarkdown(review: CovenantReviewWorkspace): string {
  const lines: string[] = [];
  lines.push(`# Covenant review — ${review.companyId}`);
  lines.push("");
  lines.push(`Generated from persisted discovery analyses (DISCOVERED ≠ VERIFIED).`);
  lines.push(`SOURCE_BACKED ≠ LEGALLY_EXECUTABLE. Capacity is not computed from this export.`);
  lines.push("");
  lines.push(`## Executive summary`);
  lines.push("");
  lines.push(review.executive.headline);
  lines.push("");
  lines.push(`Documents: ${review.documentCount} · Analyzed OK: ${review.analyzedOkCount} · Failed: ${review.failedCount} · Summaries: ${review.totalSummaries}`);
  lines.push("");

  if (review.amendmentPackage) {
    lines.push(`## Operative amendment status`);
    lines.push("");
    lines.push(`Resolution: **${review.amendmentPackage.operativeResolution}**`);
    for (const r of review.amendmentPackage.unresolvedReasons) lines.push(`- ${r}`);
    lines.push("");
    lines.push(review.amendmentPackage.askGuidance);
    lines.push("");
  }

  lines.push(`## Material restrictions`);
  lines.push("");
  if (review.executive.materialRestrictions.length === 0) lines.push(`_None clearly segmented._`);
  else for (const r of review.executive.materialRestrictions) lines.push(`- ${r}`);
  lines.push("");

  lines.push(`## Material permissions / baskets (not capacity)`);
  lines.push("");
  if (review.executive.materialPermissions.length === 0) lines.push(`_None clearly segmented._`);
  else for (const p of review.executive.materialPermissions) lines.push(`- ${p}`);
  lines.push("");

  lines.push(`## Unresolved`);
  lines.push("");
  if (review.executive.unresolved.length === 0) lines.push(`_None flagged beyond general discovery limits._`);
  else for (const u of review.executive.unresolved) lines.push(`- ${u}`);
  lines.push("");

  for (const block of review.categories) {
    lines.push(`## ${block.categoryLabel}`);
    lines.push("");
    for (const item of block.items) {
      lines.push(`### §${item.sectionRef} — ${item.heading}`);
      lines.push("");
      lines.push(`- Document: ${item.documentTitle}`);
      lines.push(`- Posture: ${item.posture ?? "n/a"}`);
      lines.push(`- Epistemic: ${item.epistemicStatus}`);
      lines.push(`- Citation: ${item.sourceCitation}`);
      lines.push("");
      lines.push(item.plainEnglish);
      lines.push("");
      if (item.restriction) {
        lines.push(`**Restriction:** ${item.restriction}`);
        lines.push("");
      }
      if ((item.permissions?.length ?? 0) > 0) {
        lines.push(`**Permissions:**`);
        for (const p of item.permissions!) lines.push(`- ${p}`);
        lines.push("");
      }
      if ((item.materialBasketsThresholds?.length ?? 0) > 0) {
        lines.push(`**Baskets / thresholds:**`);
        for (const b of item.materialBasketsThresholds!) lines.push(`- ${b}`);
        lines.push("");
      }
      if ((item.coveredEntities?.length ?? 0) > 0) {
        lines.push(`**Entities:** ${item.coveredEntities!.join(", ")}`);
        lines.push("");
      }
      if ((item.dependencies?.length ?? 0) > 0) {
        lines.push(`**Dependencies:** ${item.dependencies!.slice(0, 6).join("; ")}`);
        lines.push("");
      }
      if ((item.unresolvedQuestions?.length ?? 0) > 0) {
        lines.push(`**Unresolved:**`);
        for (const u of item.unresolvedQuestions!.slice(0, 4)) lines.push(`- ${u}`);
        lines.push("");
      }
    }
  }

  lines.push(`---`);
  lines.push(`End of report. This export is not legal advice and does not establish contractual capacity.`);
  lines.push("");
  return lines.join("\n");
}
