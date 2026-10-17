/**
 * ERP ingestion foundation (ERP-1) - the normalized contract.
 *
 * Egzon directive (2026-10-17): Headroom connects to a company's ERP and is
 * fed financial information in real time - EBITDA add-back evidence and
 * basket usage, not just balances. THIS module is the provider-agnostic
 * core every later stream programs against:
 *
 *   - ERP-2 (application) reads ErpFinancialFact rows + the staged/applied
 *     statuses defined here to drive basket usage and UNCONFIRMED add-back
 *     evidence. It never re-parses raw payloads.
 *   - ERP-3 (first provider adapter) translates ONE provider's API/webhook
 *     payloads into ErpFinancialFactsPayload below and POSTs them to the
 *     push endpoint (or, for a pull adapter, returns them from a sync that
 *     calls lib/erp/ingest.ts's ingestErpFinancialFacts directly). It never
 *     writes canonical financial state itself.
 *
 * Guardrails inherited from the rest of this codebase, enforced in
 * lib/erp/ingest.ts (not by convention):
 *   - ERP data is SOURCED EVIDENCE, never auto-verified: every promoted fact
 *     lands in canonical state through lib/onboarding/financial.ts's writer
 *     with the same UNVERIFIED wrappers a connector-discovered fact gets,
 *     and its full provenance lives on the ErpFinancialFact row.
 *   - Unmapped/unmatched data SURFACES (ErpFactStatus UNMAPPED /
 *     NOT_PROMOTABLE / REFUSED, needsAttention on the event) - it is never
 *     force-matched into a canonical field and never silently dropped.
 *   - Conflicts FAIL CLOSED (lib/onboarding/financial.ts's
 *     CONFLICTING_FINANCIAL_FACTS rule): no winner, no majority, no
 *     last-write-wins. A conflicting restatement is refused and flagged.
 *   - Nothing is invented: no default mappings, no inferred units, no
 *     fabricated reviewer/creator identities.
 */

import type { FinancialUnit } from "../connectors/units";

/**
 * Provider kinds, as DATA (stored on CompanySourceConnection.provider and
 * validated at connection creation in lib/erp/connections.ts) - deliberately
 * NOT a Prisma enum per vendor: adding a provider must never need a schema
 * migration. GENERIC is the middleware/unknown-provider kind (an integration
 * platform posting on the ERP's behalf).
 */
export const ERP_PROVIDER_KINDS = ["NETSUITE", "SAP", "ORACLE", "DYNAMICS", "GENERIC"] as const;
export type ErpProviderKind = (typeof ERP_PROVIDER_KINDS)[number];

export function isErpProviderKind(value: unknown): value is ErpProviderKind {
  return typeof value === "string" && (ERP_PROVIDER_KINDS as readonly string[]).includes(value);
}

/**
 * Capabilities every ERP connection declares at creation (ConnectorCapability
 * vocabulary from lib/connectors/types.ts, stored as data on the connection
 * row): an ERP feeds period financial facts (the push path in this module),
 * the balances those facts compose, and - for ERP-2 - transaction-level
 * detail. TRANSACTIONS is declared now so ERP-2's basket-usage feed needs no
 * connection-model change; ERP-1's endpoint accepts financial facts only.
 */
export const ERP_DEFAULT_CAPABILITIES = ["FINANCIAL_FACTS", "DEBT_BALANCES", "CASH_BALANCES", "TRANSACTIONS"] as const;

/**
 * THE normalized fact shape (ERP-2 builds against exactly this).
 *
 * One fact = one line item for the delivery's single asOfDate. `key` is the
 * ERP-side account/line-item key VERBATIM (e.g. a NetSuite account id, an
 * SAP GL account, a middleware field name) - Headroom never renames it and
 * never guesses what it means. Resolution to a canonical metric happens ONLY
 * via (a) the key already BEING a canonical metric name from
 * lib/onboarding/financial.ts's FINANCIAL_METRIC_FIELD_MAP /
 * lib/connectors/units.ts's CANONICAL_UNIT_BY_METRIC vocabulary, or (b) the
 * connection's explicit config.metricKeyMap entry (provisioned by a human in
 * lib/erp/connections.ts). Anything else is UNMAPPED.
 *
 * `unit` is REQUIRED and declared per fact (lib/connectors/units.ts's
 * FINANCIAL_UNITS) - never inferred from magnitude, never defaulted from the
 * connection. `value` is the value AS DECLARED in that unit; the normalized
 * canonical value is computed at ingestion and stored alongside, never
 * instead of, the declared pair.
 */
export interface ErpFinancialFactInput {
  key: string;
  value: number;
  unit: FinancialUnit;
  /** ERP-side stable identifier for this fact (journal entry / line id) when the source provides one - provenance, recorded verbatim. */
  externalId?: string;
  /** Human-readable source label (account name) - display/provenance only, never used for mapping. */
  label?: string;
}

/**
 * One inbound delivery: a set of financial facts for ONE period/as-of date
 * from ONE connection. (A multi-period backfill is multiple deliveries -
 * keeps idempotency, identity resolution, and the canonical writer's
 * per-(company, asOfDate) batch semantics aligned.)
 */
export interface ErpFinancialFactsPayload {
  /** Period/as-of date every fact in this delivery describes - ISO date ("2026-06-30") or full ISO timestamp. Parsed as UTC midnight for a bare date, matching the manual path's date handling. */
  asOfDate: string;
  /** The ERP-side identifier for this posting event/batch/close, when the source provides one - provenance + the push-path cursor value. */
  externalEventId?: string;
  facts: ErpFinancialFactInput[];
}

/**
 * Result of one ingestion attempt (lib/erp/ingest.ts) - also the push
 * endpoint's response body. `eventId` is the ErpSyncEvent audit row for THIS
 * attempt (a duplicate delivery gets its OWN audit row; its `eventId`
 * differs from `originalEventId`, which points at the processed original).
 */
export interface ErpIngestionResult {
  ok: boolean;
  /** HTTP-style status the route returns: 200 applied/withheld/duplicate, 400 validation, 401 auth, 409 idempotency mismatch/conflict, 404 unknown connection. */
  status: number;
  eventId: string | null;
  originalEventId?: string;
  outcome:
    | "APPLIED"
    | "PARTIALLY_APPLIED"
    | "NEEDS_ATTENTION"
    | "WITHHELD"
    | "DUPLICATE"
    | "REFUSED_AUTH"
    | "REFUSED_VALIDATION"
    | "REFUSED_IDEMPOTENCY_MISMATCH"
    | "NOT_FOUND";
  detail: string;
  counts: { applied: number; conflicted: number; unmapped: number; withheld: number };
}

/**
 * SYNC CURSOR CONTRACT (the pull half ERP-3 implements against).
 *
 * CompanySourceConnection.cursor is an OPAQUE string owned by the provider
 * adapter: Headroom core never parses, formats, or compares cursors - it
 * only stores the value an adapter reports and hands it back on the next
 * sync (SourceConnector.syncSince(cursor) in lib/connectors/types.ts).
 * Rules for adapters:
 *   - null cursor = "sync from the beginning of available history".
 *   - An adapter advances the cursor ONLY past items it has fully handed to
 *     ingestion (never past items merely seen), and returns the new cursor
 *     with its sync result; the caller persists it verbatim.
 *   - A cursor must be resumable after a crash: re-syncing FROM a stored
 *     cursor may re-deliver items (ingestion is idempotent, so re-delivery
 *     is safe), but must never SKIP items the cursor claims are done.
 * Push-path convention (lib/erp/ingest.ts): after a delivery whose facts
 * were applied or withheld (i.e. accepted into the pipeline), the cursor is
 * set to that delivery's externalEventId when one was provided - refused
 * deliveries never advance it.
 */
export const ERP_CURSOR_CONTRACT = "opaque-adapter-owned; null = from beginning; advance only past fully-ingested items; resumable, re-delivery safe, never skip";
