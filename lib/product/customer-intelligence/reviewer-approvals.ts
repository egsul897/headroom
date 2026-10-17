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
  /**
   * Who made the decision. COUNSEL = a human reviewer (recordReviewerDecision).
   * SYSTEM = exception-based auto-accept of a routine supported interpretation
   * (autoAcceptRoutineInterpretations). Absent = COUNSEL (legacy rows).
   * SYSTEM decisions are NEVER labeled counsel-verified anywhere.
   */
  reviewerKind?: "SYSTEM" | "COUNSEL";
  editedPlainEnglish?: string;
  /** Prior AI plain English when counsel edits/replaces. */
  priorPlainEnglish?: string;
  note?: string;
  reviewedAt: string;
  reviewerLabel: string;
  /** Monotonic version within (sourceId, sectionRef, category). */
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
      // Category isolation: an edit/accept on one reading of a
      // section must not patch the other reading's plainEnglish /
      // reviewerDecision (two items can share a sectionRef with
      // different categories).
      if (item.sectionRef !== params.sectionRef || item.category !== params.category) return item;
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
      // Category isolation (same as the accept/edit patch above):
      // a rejection of one reading must not reject the other.
      if (item.sectionRef !== params.sectionRef || item.category !== params.category) return item;
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
    { at: next.reviewedAt, sectionRef: params.sectionRef, category: params.category, decision: params.decision, results: compileResults },
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


/**
 * Exception-based review: auto-accept every routine supported
 * interpretation in a document's summary as a SYSTEM decision and
 * compile it (creating its Permission / ratio provision). Counsel
 * decisions are required only for EXCEPTIONS; counsel can still
 * inspect, edit, or reject any item — a later counsel decision
 * supersedes the system acceptance (recordReviewerDecision
 * overwrites the approval row and re-compiles).
 *
 * Idempotent: items with an existing decision (SYSTEM or COUNSEL)
 * are skipped. Never throws: a per-item failure is skipped and
 * the item stays an exception for counsel. Callers wrap in
 * try/catch too — auto-accept must never fail an upload.
 */
export async function autoAcceptRoutineInterpretations(params: {
  companyId: string;
  sourceId: string;
}): Promise<{ accepted: number; skipped: number }> {
  const { isRoutineItem } = await import("./routine-review");
  const { compileAcceptedInterpretation } = await import("./compile-accepted");
  const { grantTypesForItem } = await import("./grant-types");
  const row = await prisma.knowledgeSource.findFirst({
    where: { companyId: params.companyId, sourceId: params.sourceId },
  });
  if (!row) return { accepted: 0, skipped: 0 };
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? ({ ...(row.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const summary = summarizeFromStoredMetadata(meta);
  if (!summary) return { accepted: 0, skipped: 0 };
  const prior = Array.isArray(meta.reviewerApprovals)
    ? ([...meta.reviewerApprovals] as ReviewerApproval[])
    : [];
  const decided = new Set(prior.map((a) => `${a.sectionRef}::${a.category}`));
  let accepted = 0;
  let skipped = 0;
  const approvals = [...prior];
  for (const item of summary.items) {
    if (!isRoutineItem(item)) {
      skipped += 1;
      continue;
    }
    // True duplicates (same ref + category, two items) share one
    // decision key — the second unit is already decided. Count it
    // as skipped so accepted + skipped === items.length.
    if (decided.has(`${item.sectionRef}::${item.category}`)) {
      skipped += 1;
      continue;
    }
    const next: ReviewerApproval = {
      sourceId: params.sourceId,
      sectionRef: item.sectionRef,
      category: item.category,
      decision: "ACCEPTED",
      reviewerKind: "SYSTEM",
      note: "System auto-accepted — routine supported interpretation, not counsel-verified.",
      reviewedAt: new Date().toISOString(),
      reviewerLabel: "system:auto-accept",
      version: 1,
    };
    approvals.push(next);
    decided.add(`${item.sectionRef}::${item.category}`);
    // Persist the approval row BEFORE compiling so the compile
    // reads a summary whose decisions include this acceptance.
    meta.reviewerApprovals = approvals;
    await prisma.knowledgeSource.update({
      where: { sourceId: params.sourceId },
      data: { metadata: JSON.parse(JSON.stringify(meta)) },
    });
    try {
      const results = await compileAcceptedInterpretation({
        companyId: params.companyId,
        sourceId: params.sourceId,
        sectionRef: item.sectionRef,
        category: item.category,
        decision: "ACCEPTED",
        reviewerKind: "SYSTEM",
      });
      // Non-throwing failures are still failures: a routine item
      // whose compile returns INCOMPLETE/FAILED (classification
      // and compile disagree, or a transient fault) is NOT
      // successfully auto-compiled — it stays unresolved for
      // counsel. Grant items need a COMPILED/UPDATED Permission per
      // grant. No-grant items (boilerplate: nothing to mint;
      // ratio: a provision) succeed on any non-FAILED result —
      // INCOMPLETE there means "nothing to compile", not a miss.
      const grants = grantTypesForItem(item);
      const compiled =
        results.length > 0 &&
        results.every((r) =>
          grants.length > 0
            ? r.status === "COMPILED" || r.status === "UPDATED"
            : r.status !== "FAILED",
        );
      if (!compiled) throw new Error(`Auto-accept compile did not produce an executable artifact for ${item.sectionRef} (${item.category}): ${results.map((r) => r.status).join(",")}`);
      accepted += 1;
    } catch {
      // Per-item failure stays an exception for counsel (the
      // approval row already exists — it is removed so the item
      // is not wrongly marked decided).
      const idx = approvals.findIndex(
        (a) => a.sectionRef === item.sectionRef && a.category === item.category && a.reviewerKind === "SYSTEM",
      );
      if (idx >= 0) approvals.splice(idx, 1);
      decided.delete(`${item.sectionRef}::${item.category}`);
      meta.reviewerApprovals = approvals;
      try {
        await prisma.knowledgeSource.update({
          where: { sourceId: params.sourceId },
          data: { metadata: JSON.parse(JSON.stringify(meta)) },
        });
      } catch {
        // Best effort — the row will be overwritten on the next run.
      }
      skipped += 1;
    }
  }
  return { accepted, skipped };
}
