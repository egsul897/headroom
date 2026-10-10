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
  const evaluatedIds = new Set(args.evaluated.map((e) => e.documentId));
  const notTested: DocumentRestrictionOutcome[] = onFile
    .filter((d) => !evaluatedIds.has(d.id))
    .map((d) => ({
      documentId: d.id,
      documentName: d.name,
      status: "not_configured" as const,
      reason: "Basket / restriction for this transaction type not configured on this document.",
    }));

  const prohibited = args.evaluated
    .filter((e) => e.status === "blocked")
    .map((e) => ({ ...e }));
  const conditional = args.evaluated
    .filter((e) => e.status === "review_required")
    .map((e) => ({ ...e }));
  const permitted = args.evaluated
    .filter((e) => e.status === "clear")
    .map((e) => ({ ...e }));
  const notDeterminable = args.evaluated
    .filter((e) => e.status === "not_tested")
    .map((e) => ({ ...e }));

  const documentsEvaluated = args.evaluated.length;
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
