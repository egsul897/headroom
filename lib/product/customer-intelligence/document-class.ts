/**
 * Map a human-confirmed Document type (DOCUMENT_TYPES vocabulary)
 * onto the analysis class vocabulary (DebtDocumentClass).
 *
 * Shared by promotion (rule 127: the confirmed type becomes the
 * analysis class) and re-analysis (rule 128: a confirmed type
 * survives re-analysis). The four financing-agreement types map
 * 1:1; OTHER and COMPLIANCE_CERTIFICATE have no class-vocabulary
 * counterpart and map to the catch-all OTHER_DEBT_RELATED.
 * Kept free of prisma imports so it is unit-testable in isolation.
 */
export function documentClassFromConfirmedType(
  documentType: string,
): "CREDIT_AGREEMENT" | "INDENTURE" | "AMENDMENT" | "INTERCREDITOR_AGREEMENT" | "OTHER_DEBT_RELATED" {
  if (
    documentType === "CREDIT_AGREEMENT" ||
    documentType === "INDENTURE" ||
    documentType === "AMENDMENT" ||
    documentType === "INTERCREDITOR_AGREEMENT"
  ) {
    return documentType;
  }
  return "OTHER_DEBT_RELATED";
}

/**
 * Rule 160: an unclassified document must say so. The classifier
 * returns UNKNOWN for 28% of precedent sources (phase-2 aggregates),
 * and the upload path maps a declared type onto UNKNOWN — but when
 * the user declared nothing either, the document stays UNKNOWN and
 * no page disclosed it: the mismatch note fires only when a declared
 * type disagrees with the classified type, so an untyped document
 * sailed through with no warning while covenant summaries were still
 * produced from it. UNKNOWN with no declared type is the unclassified
 * state; a declared type that still leaves UNKNOWN is already covered
 * by the mismatch note.
 */
export function isUnclassifiedDocument(args: {
  documentClass: string | null | undefined;
  declaredType: string | null | undefined;
}): boolean {
  return args.documentClass === "UNKNOWN" && !args.declaredType;
}

/** User-facing note for an unclassified document. */
export function unclassifiedDocumentNote(): string {
  return (
    "Document type unclassified — analysis could not identify this document's debt-document type. " +
    "Confirm the type in the review queue; covenant summaries were still produced but treat them with extra care."
  );
}
