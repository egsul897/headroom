/**
 * ERP application layer — types (ERP-2).
 *
 * This layer starts where ERP-1 (ingestion) ends: a NORMALIZED financial
 * fact carrying full provenance, delivered for one company over one
 * registered CompanySourceConnection. Ingestion (connection model,
 * inbound endpoint, sync) is ERP-1's; this module owns what a fact DOES
 * to product state:
 *
 *  - basket transactions -> LedgerEntry usage, so remaining basket
 *    capacity reflects actual usage (lib/covenant-engine.ts reads ACTIVE
 *    LedgerEntry rows in loadCompanyCovenantData), and
 *  - EBITDA add-back amounts -> UNVERIFIED evidence items for the CFO
 *    confirmation flow. Evidence is never confirmed here and is never an
 *    input to any computed total.
 *
 * Everything ERP-sourced is labeled by source (`erp:<connectionId>` on
 * ledger rows, source "ERP" on the audit record) and is never presented
 * as counsel- or CFO-verified.
 *
 * Deterministic only: matching is exact, fail-closed, and explained on
 * every row. No fuzzy matching, no force-matching, no silent drops.
 */

export type ErpTransactionKind =
  | "DEBT_INCURRENCE"
  | "DEBT_REPAYMENT"
  | "DIVIDEND"
  | "INVESTMENT"
  | "ASSET_SALE"
  | "EQUITY_ISSUANCE";

/**
 * The normalized fact shape ERP-1 must deliver to this layer.
 *
 * `amount` is in the repository's covenant convention: MILLIONS of
 * `currency` (the same convention LedgerEntry amounts and
 * FinancialSnapshot columns use — commitRestrictedPayment renders
 * "$<amount>M"). ERP-1 owns unit normalization (see
 * lib/connectors/units.ts) BEFORE calling this layer; a raw-units amount
 * delivered here would be applied as millions, so this contract is the
 * one place that must not drift.
 *
 * `factKey` is ERP-1's taxonomy key. It is carried through as provenance
 * and stored verbatim; the application layer interprets only the
 * explicit fields below (transactionKind / addbackCategory / basketHint).
 */
export interface ErpNormalizedFact {
  source: "ERP";
  /** The company the fact claims to belong to. Must equal the company the application call is scoped to, and the connection's company. */
  companyId: string;
  /** CompanySourceConnection.id of the ERP connection that produced this fact. Must belong to `companyId`. */
  connectionId: string;
  /** Stable id of this fact in the source ERP. The idempotency key, scoped by (companyId, connectionId). */
  externalId: string;
  factKey: string;
  /** ISO date: transaction date for basket facts, period end for add-back evidence. */
  asOf: string;
  periodStart?: string;
  periodEnd?: string;
  /** Millions of `currency` — see the convention note above. Must be finite and > 0. */
  amount: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** Basket facts only: what happened in the ERP. Required by applyErpBasketTransaction. */
  transactionKind?: ErpTransactionKind;
  /**
   * Basket facts only: the ERP's own pointer at the basket it believes
   * this transaction used. Matched EXACTLY (per-field, normalized) —
   * a hint that matches nothing, or matches a permission of a different
   * family, leaves the transaction UNMATCHED. Never fuzzy-matched.
   */
  basketHint?: {
    basketName?: string;
    sectionRef?: string;
    provisionCode?: string;
    permissionCode?: string;
  };
  /** Add-back evidence only: the agreement EBITDA-definition category this amount is tagged to. Required by recordErpAddbackEvidence. */
  addbackCategory?: string;
  /** Free-text description from the ERP, carried into the ledger/audit record. */
  description?: string;
}

export type ErpFactKind = "BASKET_TRANSACTION" | "EBITDA_ADDBACK_EVIDENCE";

export type ErpDisposition =
  | "APPLIED"
  | "EVIDENCE_RECORDED"
  | "UNMATCHED"
  | "CONFLICT"
  | "REJECTED";

export interface ErpApplicationResult {
  disposition: ErpDisposition;
  /** ErpFactApplication row id, when a row could be keyed and written. */
  applicationId: string | null;
  /** The LedgerEntry the application wrote. Set only on a fresh APPLIED (and echoed on an identical re-delivery of one). */
  ledgerEntryId: string | null;
  /** True when this delivery was an identical re-delivery of an already-recorded fact: no state was written twice. */
  duplicate: boolean;
  /** Human-readable explanation of the outcome. Always non-empty on UNMATCHED / CONFLICT / REJECTED. */
  reasons: string[];
}

/** One stored application row, as the structural DB layer returns it. */
export interface ErpFactApplicationRow {
  id: string;
  companyId: string;
  connectionId: string;
  externalId: string;
  kind: ErpFactKind;
  disposition: ErpDisposition;
  factKey: string;
  payload: unknown;
  payloadHash: string;
  amount: number | null;
  currency: string | null;
  asOf: Date | null;
  ledgerEntryId: string | null;
  matchedProvisionId: string | null;
  matchedPermissionId: string | null;
  matchedDocumentId: string | null;
  reviewStatus: string | null;
  detail: string | null;
  conflictPayload: unknown;
  deliveryCount: number;
  lastDeliveredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Minimal structural shape of the Prisma client this layer needs —
 * the same pattern as lib/covenant-engine.ts's CovenantEnginePrismaClient:
 * method-shorthand signatures so a real PrismaClient satisfies it without
 * this module importing generated types (the erpFactApplication delegate
 * exists only after `prisma generate` runs against the schema that
 * carries the model).
 */
export interface ErpApplicationDb {
  companySourceConnection: {
    findUnique(args: any): Promise<{ id: string; companyId: string } | null>;
  };
  erpFactApplication: {
    findUnique(args: any): Promise<ErpFactApplicationRow | null>;
    create(args: any): Promise<ErpFactApplicationRow>;
    update(args: any): Promise<ErpFactApplicationRow>;
    findMany(args: any): Promise<ErpFactApplicationRow[]>;
  };
  ledgerEntry: {
    create(args: any): Promise<{ id: string }>;
  };
  covenantProvision: {
    findMany(args: any): Promise<
      Array<{
        id: string;
        documentId: string;
        code: string;
        basketName: string;
        sectionRef: string;
        effectiveFrom?: Date | null;
        effectiveTo?: Date | null;
      }>
    >;
  };
  permission: {
    findMany(args: any): Promise<
      Array<{
        id: string;
        documentId: string;
        code: string | null;
        grantType: string;
        sectionRef: string;
        effectiveFrom?: Date | null;
        effectiveTo?: Date | null;
      }>
    >;
  };
  document: {
    findMany(args: any): Promise<
      Array<{
        id: string;
        capacityFormulas?: unknown;
        rpWaterfall?: unknown;
        assetSale?: unknown;
        effectiveFrom?: Date | null;
        effectiveTo?: Date | null;
      }>
    >;
  };
  $transaction?: <T>(fn: (tx: ErpApplicationDb) => Promise<T>) => Promise<T>;
}

/**
 * Transaction kind -> the LedgerEntry it writes when applied.
 *
 * Direction convention (the ledger's own): DEBIT consumes — the engine
 * sums DIVIDEND + INVESTMENT DEBIT rows into the restricted-payment
 * pool already used (lib/covenant-engine.ts restrictedPaymentPoolUsed),
 * and a debt incurrence is a use of debt capacity. CREDIT is proceeds /
 * replenishment: an asset sale brings proceeds in, an equity issuance
 * brings proceeds in, a repayment restores debt headroom.
 */
export const ERP_TRANSACTION_LEDGER_MAP: Record<
  ErpTransactionKind,
  { basket: "EQUITY" | "DEBT_INCUR" | "DEBT_REPAY" | "ASSET_SALE" | "DIVIDEND" | "INVESTMENT"; direction: "CREDIT" | "DEBIT" }
> = {
  DEBT_INCURRENCE: { basket: "DEBT_INCUR", direction: "DEBIT" },
  DEBT_REPAYMENT: { basket: "DEBT_REPAY", direction: "CREDIT" },
  DIVIDEND: { basket: "DIVIDEND", direction: "DEBIT" },
  INVESTMENT: { basket: "INVESTMENT", direction: "DEBIT" },
  ASSET_SALE: { basket: "ASSET_SALE", direction: "CREDIT" },
  EQUITY_ISSUANCE: { basket: "EQUITY", direction: "CREDIT" },
};

/**
 * Transaction kind -> the Permission GrantType of the same family, for
 * the families that have one. DEBT_REPAYMENT / ASSET_SALE /
 * EQUITY_ISSUANCE have no grant type: nothing "grants" a repayment —
 * those are recorded against the company's documents of record instead
 * (see apply-basket-transaction.ts's family-known rules).
 */
export const ERP_TRANSACTION_GRANT_FAMILY: Record<ErpTransactionKind, string | null> = {
  DEBT_INCURRENCE: "DEBT_INCURRENCE",
  DEBT_REPAYMENT: null,
  DIVIDEND: "RESTRICTED_PAYMENT",
  INVESTMENT: "INVESTMENT",
  ASSET_SALE: null,
  EQUITY_ISSUANCE: null,
};

export const ERP_TRANSACTION_KINDS: readonly ErpTransactionKind[] = [
  "DEBT_INCURRENCE",
  "DEBT_REPAYMENT",
  "DIVIDEND",
  "INVESTMENT",
  "ASSET_SALE",
  "EQUITY_ISSUANCE",
];
