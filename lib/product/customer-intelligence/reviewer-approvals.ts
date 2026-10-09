/**
 * AI-first lawyer review: customer counsel can accept / edit / reject AI interpretations.
 * Approvals live in KnowledgeSource.metadata.reviewerApprovals — workspace-scoped.
 * History is preserved in reviewerDecisionHistory.
 * ACCEPT/EDIT triggers compileAcceptedInterpretation → executable Permission rows when
 * formula/threshold can be parsed without inventing values (fail-closed otherwise).
 */

import { prisma } from "@/lib/prisma";
import {
  summarizeFromStoredMetadata,
  type CovenantSummaryItem,
  type DocumentCovenantSummary,
} from "../covenant-intelligence/summarize";

export type ReviewDecision = "ACCEPTED" | "EDITED" | "REJECTED";

export interface ReviewerApproval {
  sourceId: string;
  sectionRef: string;
  category: string;
  decision: ReviewDecision;
  editedPlainEnglish?: string;
  /** Prior AI plain English when counsel edits/replaces. */
  priorPlainEnglish?: string;
  note?: string;
  reviewedAt: string;
  reviewerLabel: string;
  /** Monotonic version within (sourceId, sectionRef). */
  version: number;
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

/** Overlay counsel decisions onto summary items for Ask / display. */
export function applyReviewerOverlayToItems(
  items: Array<CovenantSummaryItem & { sourceId?: string }>,
  approvals: ReviewerApproval[],
): Array<CovenantSummaryItem & { sourceId?: string }> {
  return items
    .map((item) => {
      const approval =
        approvals.find(
          (a) =>
            a.sectionRef === item.sectionRef &&
            (!item.sourceId || a.sourceId === item.sourceId),
        ) ??
        (approvals.filter((a) => a.sectionRef === item.sectionRef).length === 1
          ? approvals.find((a) => a.sectionRef === item.sectionRef)
          : undefined);
      if (!approval) return item;
      if (approval.decision === "REJECTED") {
        return { ...item, reviewerDecision: "REJECTED" as const };
      }
      const plain =
        approval.decision === "EDITED" && approval.editedPlainEnglish?.trim()
          ? approval.editedPlainEnglish.trim()
          : item.plainEnglish;
      return {
        ...item,
        plainEnglish: plain,
        reviewerDecision: approval.decision,
        interpretationNote: `${item.interpretationNote ?? ""} [Workspace counsel ${approval.decision.toLowerCase()} ${approval.reviewedAt}]`.trim(),
      };
    })
    .filter((item) => item.reviewerDecision !== "REJECTED");
}

/**
 * After AI reanalysis, re-apply counsel edits/accepts onto the new summary and
 * flag conflicts when the AI plain English materially changed under an ACCEPTED item.
 */
export function mergePreservedReviewerDecisions(params: {
  summary: DocumentCovenantSummary;
  priorApprovals: ReviewerApproval[];
}): { summary: DocumentCovenantSummary; conflicts: string[] } {
  const conflicts: string[] = [];
  if (!params.priorApprovals.length) return { summary: params.summary, conflicts };

  const items = params.summary.items.map((item) => {
    const approval = params.priorApprovals.find((a) => a.sectionRef === item.sectionRef);
    if (!approval || approval.decision === "REJECTED") return item;
    if (approval.decision === "EDITED" && approval.editedPlainEnglish?.trim()) {
      return {
        ...item,
        plainEnglish: approval.editedPlainEnglish.trim(),
        reviewerDecision: "EDITED" as const,
        interpretationNote: `${item.interpretationNote ?? ""} [Counsel edit preserved after reanalysis ${approval.reviewedAt}]`.trim(),
      };
    }
    if (approval.decision === "ACCEPTED") {
      const prior = approval.priorPlainEnglish ?? approval.editedPlainEnglish;
      if (prior && normalize(prior) !== normalize(item.plainEnglish)) {
        conflicts.push(
          `§${item.sectionRef}: AI text changed after counsel acceptance — review again (prior acceptance retained as flag).`,
        );
      }
      return {
        ...item,
        reviewerDecision: "ACCEPTED" as const,
        interpretationNote: `${item.interpretationNote ?? ""} [Prior counsel acceptance ${approval.reviewedAt}${conflicts.length ? "; AI text may have changed — conflict flagged" : ""}]`.trim(),
      };
    }
    return item;
  });

  return {
    summary: { ...params.summary, items },
    conflicts,
  };
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
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
}): Promise<{
  ok: boolean;
  error?: string;
  approvalCount: number;
  compileResults?: import("./compile-accepted").CompileAcceptedResult[];
}> {
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
  const history = Array.isArray(meta.reviewerDecisionHistory)
    ? ([...meta.reviewerDecisionHistory] as ReviewerApproval[])
    : [];

  const existing = prior.find(
    (a) => a.sectionRef === params.sectionRef && a.sourceId === params.sourceId,
  );
  const summary = summarizeFromStoredMetadata(meta);
  const currentItem = summary?.items.find((i) => i.sectionRef === params.sectionRef);

  const next: ReviewerApproval = {
    sourceId: params.sourceId,
    sectionRef: params.sectionRef,
    category: params.category,
    decision: params.decision,
    editedPlainEnglish: params.editedPlainEnglish?.trim() || undefined,
    priorPlainEnglish: currentItem?.plainEnglish,
    note: params.note?.trim() || undefined,
    reviewedAt: new Date().toISOString(),
    reviewerLabel: params.reviewerLabel?.trim() || "workspace-counsel",
    version: (existing?.version ?? 0) + 1,
  };

  if (existing) history.push(existing);
  const filtered = prior.filter(
    (a) => !(a.sectionRef === next.sectionRef && a.sourceId === next.sourceId),
  );
  filtered.push(next);

  // Controlling workspace text: edit/replace patches the shared summary item.
  if (
    (params.decision === "EDITED" || params.decision === "ACCEPTED") &&
    summary
  ) {
    const items = summary.items.map((item) => {
      if (item.sectionRef !== params.sectionRef) return item;
      const plain =
        params.decision === "EDITED" && params.editedPlainEnglish?.trim()
          ? params.editedPlainEnglish.trim()
          : item.plainEnglish;
      return {
        ...item,
        plainEnglish: plain,
        reviewerDecision: params.decision,
        interpretationNote: `${item.interpretationNote ?? ""} [Workspace counsel ${params.decision.toLowerCase()} ${next.reviewedAt}]`.trim(),
      };
    });
    meta.covenantSummary = { ...summary, items };
  }

  if (params.decision === "REJECTED" && summary) {
    const items = summary.items.map((item) => {
      if (item.sectionRef !== params.sectionRef) return item;
      return { ...item, reviewerDecision: "REJECTED" as const };
    });
    meta.covenantSummary = { ...summary, items };
  }

  meta.reviewerApprovals = filtered;
  meta.reviewerDecisionHistory = history.slice(-200);
  meta.controllingInterpretationsUpdatedAt = next.reviewedAt;

  await prisma.knowledgeSource.update({
    where: { sourceId: params.sourceId },
    data: { metadata: JSON.parse(JSON.stringify(meta)) },
  });

  // Compile / supersede executable Permissions from counsel decision (fail-closed).
  const { compileAcceptedInterpretation } = await import("./compile-accepted");
  const compileResults = await compileAcceptedInterpretation({
    companyId: params.companyId,
    sourceId: params.sourceId,
    sectionRef: params.sectionRef,
    category: params.category,
    decision: params.decision,
    approvalNote: params.note,
  });
  meta.counselCompileResults = [
    ...(Array.isArray(meta.counselCompileResults) ? (meta.counselCompileResults as unknown[]) : []),
    { at: next.reviewedAt, sectionRef: params.sectionRef, decision: params.decision, results: compileResults },
  ].slice(-100);
  await prisma.knowledgeSource.update({
    where: { sourceId: params.sourceId },
    data: { metadata: JSON.parse(JSON.stringify(meta)) },
  });

  return {
    ok: true,
    approvalCount: filtered.filter((a) => a.decision !== "REJECTED").length,
    compileResults,
  };
}
