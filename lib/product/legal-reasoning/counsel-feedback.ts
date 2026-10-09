/**
 * Capture counsel Accept/Edit/Reject as reusable analytical intelligence.
 *
 * Workspace-scoped: never auto-transfers a customer-specific legal interpretation
 * into another customer's certified rulebook. Pattern observations may record
 * structural sourceIds only; executable authority stays behind Phase 3 certification.
 */

import { detectPatternsInText } from "../../knowledge-factory/patterns/library";
import type { ReviewDecision, ReviewerApproval } from "../customer-intelligence/reviewer-approvals";
import { readWorkspaceMetaSource, upsertWorkspaceMetaSource } from "./workspace-meta-source";

export type CounselErrorCategory =
  | "MISSED_RESTRICTION"
  | "MISSED_EXCEPTION"
  | "WRONG_DEFINITION"
  | "WRONG_AMENDMENT_VERSION"
  | "WRONG_ENTITY_SCOPE"
  | "UNSUPPORTED_STACKING"
  | "DOUBLE_COUNTED_CAPACITY"
  | "MISSING_CONDITION"
  | "UNSUPPORTED_CONCLUSION"
  | "FORMULA_CORRECTION"
  | "OTHER";

export interface CounselFeedbackRecord {
  id: string;
  companyId: string;
  sourceId: string;
  sectionRef: string;
  category: string;
  decision: ReviewDecision;
  originalInterpretation: string;
  correctedInterpretation: string | null;
  sourceExcerpt: string | null;
  errorCategory: CounselErrorCategory;
  draftingPatternIds: string[];
  correctedFormulaOrCondition: string | null;
  /** Always WORKSPACE — never CROSS_CUSTOMER_AUTO. */
  applicabilityScope: "WORKSPACE";
  createdAt: string;
  reviewerLabel: string;
}

const META_KEY = "counselFeedbackIntelligence";

function asList(meta: Record<string, unknown> | null): CounselFeedbackRecord[] {
  const list = meta?.[META_KEY];
  return Array.isArray(list) ? (list as CounselFeedbackRecord[]) : [];
}

function classifyError(params: {
  decision: ReviewDecision;
  original: string;
  corrected: string | null;
  note?: string;
}): CounselErrorCategory {
  const blob = `${params.note ?? ""} ${params.corrected ?? ""}`.toLowerCase();
  if (/stack|aggregat/.test(blob)) return "UNSUPPORTED_STACKING";
  if (/double.?count|shared.?cap/.test(blob)) return "DOUBLE_COUNTED_CAPACITY";
  if (/amendment|operative|supersed/.test(blob)) return "WRONG_AMENDMENT_VERSION";
  if (/definition|defined term|means/.test(blob)) return "WRONG_DEFINITION";
  if (/guarantor|subsidiar|entity|restricted group/.test(blob)) return "WRONG_ENTITY_SCOPE";
  if (/proviso|provided that|condition|so long as/.test(blob)) return "MISSING_CONDITION";
  if (/exception|carve.?out|permitted/.test(blob)) return "MISSED_EXCEPTION";
  if (/shall not|restriction|prohibit/.test(blob)) return "MISSED_RESTRICTION";
  if (/formula|threshold|%|ratio|basket/.test(blob)) return "FORMULA_CORRECTION";
  if (params.decision === "REJECTED") return "UNSUPPORTED_CONCLUSION";
  return "OTHER";
}

/**
 * Persist a reusable feedback record after counsel review.
 * Does not mutate other companies' data or certified IR.
 */
export async function captureCounselFeedback(params: {
  companyId: string;
  approval: ReviewerApproval;
  sourceExcerpt?: string | null;
}): Promise<CounselFeedbackRecord> {
  const a = params.approval;
  const original = a.priorPlainEnglish ?? "";
  const corrected =
    a.decision === "EDITED" && a.editedPlainEnglish?.trim()
      ? a.editedPlainEnglish.trim()
      : a.decision === "ACCEPTED"
        ? original || a.editedPlainEnglish?.trim() || null
        : null;
  const textForPatterns = [original, corrected ?? "", a.note ?? "", params.sourceExcerpt ?? ""].join(" ");
  const record: CounselFeedbackRecord = {
    id: `${a.sourceId}:${a.sectionRef}:v${a.version}`,
    companyId: params.companyId,
    sourceId: a.sourceId,
    sectionRef: a.sectionRef,
    category: a.category,
    decision: a.decision,
    originalInterpretation: original,
    correctedInterpretation: corrected,
    sourceExcerpt: params.sourceExcerpt?.slice(0, 800) ?? null,
    errorCategory: classifyError({
      decision: a.decision,
      original,
      corrected,
      note: a.note,
    }),
    draftingPatternIds: detectPatternsInText(textForPatterns),
    correctedFormulaOrCondition:
      a.decision === "EDITED" && a.editedPlainEnglish?.trim()
        ? a.editedPlainEnglish.trim().slice(0, 500)
        : a.note?.trim()?.slice(0, 500) ?? null,
    applicabilityScope: "WORKSPACE",
    createdAt: a.reviewedAt,
    reviewerLabel: a.reviewerLabel,
  };

  const sourceId = `counsel-feedback:${params.companyId}`;
  const meta = (await readWorkspaceMetaSource(sourceId)) ?? {};
  const prior = asList(meta);
  const next = [...prior.filter((r) => r.id !== record.id), record].slice(-300);

  await upsertWorkspaceMetaSource({
    sourceId,
    companyId: params.companyId,
    title: `Counsel feedback intelligence — ${params.companyId}`,
    metadata: {
      ...meta,
      [META_KEY]: next,
      note: "Workspace-scoped counsel corrections. Never auto-authoritative for another customer.",
    },
  });

  return record;
}

export async function listCounselFeedback(companyId: string): Promise<CounselFeedbackRecord[]> {
  const meta = await readWorkspaceMetaSource(`counsel-feedback:${companyId}`);
  return asList(meta).filter((r) => r.companyId === companyId);
}

/** Aggregate error categories for improve-queue / diagnostics (same workspace only). */
export function summarizeCounselFeedback(records: CounselFeedbackRecord[]): {
  byErrorCategory: Record<string, number>;
  byPatternId: Record<string, number>;
  acceptEditReject: Record<ReviewDecision, number>;
} {
  const byErrorCategory: Record<string, number> = {};
  const byPatternId: Record<string, number> = {};
  const acceptEditReject: Record<ReviewDecision, number> = {
    ACCEPTED: 0,
    EDITED: 0,
    REJECTED: 0,
  };
  for (const r of records) {
    byErrorCategory[r.errorCategory] = (byErrorCategory[r.errorCategory] ?? 0) + 1;
    acceptEditReject[r.decision] += 1;
    for (const p of r.draftingPatternIds) {
      byPatternId[p] = (byPatternId[p] ?? 0) + 1;
    }
  }
  return { byErrorCategory, byPatternId, acceptEditReject };
}
