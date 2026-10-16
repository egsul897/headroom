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

/** Overlay lives in a prisma-free module so it is unit-testable. */
/** Merge lives in a prisma-free module so it is unit-testable. */
export { mergePreservedReviewerDecisions } from "./reviewer-merge";
export { applyReviewerOverlayToItems } from "./reviewer-overlay";

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

  // Integration fix (Fix 6): decisions key on (sourceId, sectionRef,
  // CATEGORY). The old key ignored category, so two summary items
  // sharing a sectionRef (e.g. 1.01(g)(c)(c) as EVENTS_OF_DEFAULT and
  // as OTHER) overwrote each other's decisions — counsel could never
  // complete review of a doc with duplicate refs, and the wizard's
  // decisions < items gate never cleared.
  const existing = prior.find(
    (a) => a.sectionRef === params.sectionRef && a.sourceId === params.sourceId && a.category === params.category,
  );
  const summary = summarizeFromStoredMetadata(meta);
  const currentItem = summary?.items.find(
    (i) => i.sectionRef === params.sectionRef && i.category === params.category,
  );
  // Rule 112: compile already refuses a section with no summary
  // item — but the decision row was still recorded, leaving a
  // phantom approval that matches nothing. Refuse up front so no
  // decision is ever recorded for a section this document's
  // analysis does not contain.
  if (!currentItem) {
    return {
      ok: false,
      error: `Section ${params.sectionRef} not found in this document's analysis — no decision recorded`,
      approvalCount: prior.length,
    };
  }

  // Rule 143: the reviewer label previously defaulted to the
  // generic "workspace-counsel" when missing — fabricated
  // attribution (rules 113–115/142 class). A decision without
  // a real reviewer is refused; the one remaining caller that
  // relied on the fallback (the workflow demo script) now passes
  // an explicit demo label.
  if (!params.reviewerLabel?.trim()) {
    return {
      ok: false,
      error: "A reviewer name/email is required — no decision recorded",
      approvalCount: prior.length,
    };
  }

  const next: ReviewerApproval = {
    sourceId: params.sourceId,
    sectionRef: params.sectionRef,
    category: params.category,
    decision: params.decision,
    editedPlainEnglish: params.editedPlainEnglish?.trim() || undefined,
    priorPlainEnglish: currentItem?.plainEnglish,
    note: params.note?.trim() || undefined,
    reviewedAt: new Date().toISOString(),
    reviewerLabel: params.reviewerLabel.trim(),
    version: (existing?.version ?? 0) + 1,
  };

  if (existing) history.push(existing);
  const filtered = prior.filter(
    (a) => !(a.sectionRef === next.sectionRef && a.sourceId === next.sourceId && a.category === next.category),
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
        // Rule 144: the note previously stamped the generic
        // "Workspace counsel" — the same fabricated-attribution
        // class as rule 143's fallback. The decision now carries
        // a real reviewer (rule 143 refuses without one), so the
        // note names that reviewer.
        interpretationNote: `${item.interpretationNote ?? ""} [${next.reviewerLabel} ${params.decision.toLowerCase()} ${next.reviewedAt}]`.trim(),
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

  // Rule 171: counsel-review completion attests coverage. Runs after
  // compile so scopes reflect the post-decision Permission set. Must
  // never block counsel Persist / compile (same pattern as feedback).
  try {
    const { evaluateCounselCoverage } = await import("./counsel-coverage");
    await evaluateCounselCoverage(prisma, { companyId: params.companyId, sourceId: params.sourceId });
  } catch {
    // Coverage evaluation must not block counsel Persist / compile.
  }

  // Workspace-scoped reusable feedback (never cross-customer auto-transfer).
  try {
    const { captureCounselFeedback } = await import("../legal-reasoning/counsel-feedback");
    await captureCounselFeedback({
      companyId: params.companyId,
      approval: next,
      sourceExcerpt: currentItem?.operativeLanguageExcerpt ?? currentItem?.plainEnglish ?? null,
    });
  } catch {
    // Feedback capture must not block counsel Persist / compile.
  }

  return {
    ok: true,
    approvalCount: filtered.filter((a) => a.decision !== "REJECTED").length,
    compileResults,
  };
}
