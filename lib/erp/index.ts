/**
 * ERP application layer (ERP-2): applies ERP-1's normalized,
 * provenance-carrying financial facts to product state.
 *
 *  - applyErpBasketTransaction: ERP transactions -> basket usage
 *    (LedgerEntry), idempotent by (companyId, connectionId, externalId),
 *    fail-closed on unmatched/conflicting facts.
 *  - recordErpAddbackEvidence / listErpAddbackEvidence: ERP amounts
 *    tagged to add-back categories -> UNCONFIRMED evidence items for
 *    the CFO confirmation flow. Never confirmed here, never computed.
 *  - listErpFactApplications: the audit/surfacing read (UNMATCHED and
 *    CONFLICT queues live here).
 */

export * from "./types";
export { applyErpBasketTransaction } from "./apply-basket-transaction";
export { recordErpAddbackEvidence, listErpAddbackEvidence, type ErpAddbackEvidenceItem } from "./record-addback-evidence";
export { listErpFactApplications } from "./shared";
