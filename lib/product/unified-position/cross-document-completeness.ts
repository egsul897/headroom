/**
 * Cross-document completeness for modeled transactions.
 *
 * Never report overall permission from only the subset of documents currently
 * configured/tested. Distinguishes permitted / prohibited / conditional /
 * not fully evaluated / insufficient evidence.
 */

import type { TransactionStatus } from "@/lib/covenant-engine";

export type CompletenessVerdict =
  | "PERMITTED_BY_ALL_APPLICABLE"
  | "PROHIBITED_BY_ONE_OR_MORE"
  | "CONDITIONALLY_PERMITTED"
  | "NOT_FULLY_EVALUATED"
  | "INSUFFICIENT_EVIDENCE";

export interface DocumentRestrictionOutcome {
  documentId: string;
  documentName: string;
  status: TransactionStatus | "not_configured";
  reason?: string;
  sectionRef?: string | null;
  binding?: boolean;
}

export interface CrossDocumentCompleteness {
  verdict: CompletenessVerdict;
  summary: string;
  documentsOnFile: number;
  documentsEvaluated: number;
  documentsNotTested: number;
  prohibited: DocumentRestrictionOutcome[];
  conditional: DocumentRestrictionOutcome[];
  permitted: DocumentRestrictionOutcome[];
  notTested: DocumentRestrictionOutcome[];
  /** True only when every on-file document was evaluated and none prohibit. */
  overallPermissionSupportable: boolean;
}

export function classifyCrossDocumentCompleteness(args: {
  documentsOnFile: Array<{ id: string; name: string }>;
  evaluated: Array<{
    documentId: string;
    documentName: string;
    status: TransactionStatus;
    reason?: string;
    sectionRef?: string | null;
    binding?: boolean;
  }>;
}): CrossDocumentCompleteness {
  const onFile = args.documentsOnFile;
  const onFileIds = new Set(onFile.map((d) => d.id));
  // Rule 63: count DISTINCT documents, not entries. A document
  // evaluated twice (e.g. debt + lien regimes) used to inflate
  // documentsEvaluated and the "permitted by all N" summary, and
  // an evaluated entry for a document NOT on file counted
  // toward permission. Per document, the worst status wins
  // (blocked > review_required > not_tested > clear); foreign
  // entries cannot support this package.
  const rank: Record<TransactionStatus, number> = {
    blocked: 0,
    review_required: 1,
    not_tested: 2,
    clear: 3,
  };
  const byDoc = new Map<string, (typeof args.evaluated)[number]>();
  for (const e of args.evaluated) {
    if (!onFileIds.has(e.documentId)) continue;
    const prev = byDoc.get(e.documentId);
    if (!prev || rank[e.status] < rank[prev.status]) byDoc.set(e.documentId, e);
  }
  const evaluated = [...byDoc.values()];
  const evaluatedIds = new Set(evaluated.map((e) => e.documentId));
  const notTested: DocumentRestrictionOutcome[] = onFile
    .filter((d) => !evaluatedIds.has(d.id))
    .map((d) => ({
      documentId: d.id,
      documentName: d.name,
      status: "not_configured" as const,
      reason: "Basket / restriction for this transaction type not configured on this document.",
    }));

  const prohibited = evaluated
    .filter((e) => e.status === "blocked")
    .map((e) => ({ ...e }));
  const conditional = evaluated
    .filter((e) => e.status === "review_required")
    .map((e) => ({ ...e }));
  const permitted = evaluated
    .filter((e) => e.status === "clear")
    .map((e) => ({ ...e }));
  const notDeterminable = evaluated
    .filter((e) => e.status === "not_tested")
    .map((e) => ({ ...e }));

  const documentsEvaluated = evaluated.length;
  const documentsNotTested = notTested.length + notDeterminable.length;
  const documentsOnFile = onFile.length;

  let verdict: CompletenessVerdict;
  let summary: string;

  if (documentsOnFile === 0 || (documentsEvaluated === 0 && documentsNotTested === 0)) {
    verdict = "INSUFFICIENT_EVIDENCE";
    summary = "No governing documents on file — cannot evaluate restrictions.";
  } else if (prohibited.length > 0) {
    verdict = "PROHIBITED_BY_ONE_OR_MORE";
    const src = prohibited[0]!;
    summary = `Prohibited by ${src.documentName}${src.sectionRef ? ` (${src.sectionRef})` : ""}${
      prohibited.length > 1 ? ` and ${prohibited.length - 1} other restriction(s)` : ""
    }. Permission under another agreement does not override.`;
  } else if (conditional.length > 0) {
    verdict = "CONDITIONALLY_PERMITTED";
    summary = `Conditionally permitted — ${conditional.length} document(s) require review before a clear path.`;
  } else if (documentsNotTested > 0 || notDeterminable.length > 0) {
    verdict = "NOT_FULLY_EVALUATED";
    summary = `Not fully evaluated — ${documentsEvaluated} document(s) tested; ${documentsNotTested} on-file document(s) lack a configured test for this transaction. Overall permission is not supportable from the tested subset alone.`;
  } else if (permitted.length > 0 && permitted.length === documentsEvaluated) {
    verdict = "PERMITTED_BY_ALL_APPLICABLE";
    summary = `Permitted by all ${permitted.length} applicable configured restriction(s).`;
  } else {
    verdict = "INSUFFICIENT_EVIDENCE";
    summary = "Insufficient evidence to determine overall permission.";
  }

  const overallPermissionSupportable =
    verdict === "PERMITTED_BY_ALL_APPLICABLE" && documentsNotTested === 0 && notDeterminable.length === 0;

  return {
    verdict,
    summary,
    documentsOnFile,
    documentsEvaluated,
    documentsNotTested,
    prohibited,
    conditional,
    permitted,
    notTested: [...notTested, ...notDeterminable],
    overallPermissionSupportable,
  };
}
