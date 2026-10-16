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
