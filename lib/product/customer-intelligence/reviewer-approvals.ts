/**
 * AI-first lawyer review: customer counsel can accept / edit / reject AI interpretations.
 * Approvals live in KnowledgeSource.metadata.reviewerApprovals — workspace-scoped.
 * Does NOT mint executable Permission rows; EXECUTABLE still requires compiler promotion.
 */

import { prisma } from "@/lib/prisma";
import { summarizeFromStoredMetadata } from "../covenant-intelligence/summarize";

export type ReviewDecision = "ACCEPTED" | "EDITED" | "REJECTED";

export interface ReviewerApproval {
  sourceId: string;
  sectionRef: string;
  category: string;
  decision: ReviewDecision;
  editedPlainEnglish?: string;
  note?: string;
  reviewedAt: string;
  reviewerLabel: string;
}

export async function listReviewerApprovals(companyId: string): Promise<ReviewerApproval[]> {
  const rows = await prisma.knowledgeSource.findMany({
    where: { companyId },
    select: { sourceId: true, metadata: true },
  });
  const out: ReviewerApproval[] = [];
  for (const row of rows) {
    const meta = row.metadata as Record<string, unknown> | null;
    const list = meta?.reviewerApprovals;
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      if (a && typeof a === "object") out.push(a as ReviewerApproval);
    }
  }
  return out;
}

export async function recordReviewerDecision(params: {
  companyId: string;
  sourceId: string;
  sectionRef: string;
  category: string;
  decision: ReviewDecision;
  editedPlainEnglish?: string;
  note?: string;
  reviewerLabel?: string;
}): Promise<{ ok: boolean; error?: string; approvalCount: number }> {
  const row = await prisma.knowledgeSource.findFirst({
    where: { companyId: params.companyId, sourceId: params.sourceId },
  });
  if (!row) return { ok: false, error: "Source not found in workspace", approvalCount: 0 };

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? ({ ...(row.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const prior = Array.isArray(meta.reviewerApprovals)
    ? ([...meta.reviewerApprovals] as ReviewerApproval[])
    : [];
  const next: ReviewerApproval = {
    sourceId: params.sourceId,
    sectionRef: params.sectionRef,
    category: params.category,
    decision: params.decision,
    editedPlainEnglish: params.editedPlainEnglish?.trim() || undefined,
    note: params.note?.trim() || undefined,
    reviewedAt: new Date().toISOString(),
    reviewerLabel: params.reviewerLabel?.trim() || "workspace-counsel",
  };
  const filtered = prior.filter(
    (a) => !(a.sectionRef === next.sectionRef && a.sourceId === next.sourceId),
  );
  filtered.push(next);

  // When counsel edits plain English, patch the shared summary item in place.
  if (params.decision === "EDITED" && params.editedPlainEnglish?.trim()) {
    const summary = summarizeFromStoredMetadata(meta);
    if (summary) {
      const items = summary.items.map((item) => {
        if (item.sectionRef !== params.sectionRef) return item;
        return {
          ...item,
          plainEnglish: params.editedPlainEnglish!.trim(),
          interpretationNote: `${item.interpretationNote ?? ""} [Edited by workspace counsel ${next.reviewedAt}]`.trim(),
        };
      });
      meta.covenantSummary = { ...summary, items };
    }
  }

  meta.reviewerApprovals = filtered;
  await prisma.knowledgeSource.update({
    where: { sourceId: params.sourceId },
    data: { metadata: JSON.parse(JSON.stringify(meta)) },
  });

  return { ok: true, approvalCount: filtered.filter((a) => a.decision !== "REJECTED").length };
}
