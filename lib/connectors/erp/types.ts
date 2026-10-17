/**
 * ERP provider-adapter contract (ERP-3: first concrete ERP provider
 * connector - route selection, auth/security design, adapter scaffold).
 *
 * WHY THIS EXISTS SEPARATELY FROM lib/connectors/types.ts's SourceConnector:
 * SourceConnector is an artifact pipeline contract (discover/fetch bytes,
 * dedup by content hash). An ERP feed is not an artifact pipeline - it is a
 * long-lived, authenticated, cursor-paginated stream of financial facts and
 * transactions whose consumers are ERP-1's ingestion (facts into canonical
 * financial state) and ERP-2's application layer (transactions -> basket
 * usage; amounts -> UNCONFIRMED add-back evidence). This file defines the
 * provider-facing half of that world: how Headroom authenticates to one
 * ERP, pulls deltas since a cursor, and verifies push notifications. The
 * ingestion-facing half (persistence, idempotency, identity resolution)
 * belongs to ERP-1 and consumes ONLY the normalized shapes below - it never
 * sees a provider payload.
 *
 * SECURITY INVARIANT (repo-wide, mirrors CompanySourceConnection's own
 * schema comment): an adapter NEVER receives, returns, or logs a raw
 * credential value through its config. Non-secret provider config (e.g. a
 * NetSuite account id) travels in ErpConnectionContext.config; secrets are
 * resolved at call time from an opaque credentialRef (an env-var name /
 * secret-store key) via the injected secret resolver - the same
 * "credentialRef, never a credential" discipline
 * prisma/schema.prisma's CompanySourceConnection already enforces.
 *
 * FAIL-CLOSED INVARIANT: an adapter that cannot prove a value (missing
 * amount, unparseable date, malformed cursor) SKIPS the record and reports
 * it in the page's `skipped` diagnostics - it never coerces (a missing
 * amount is never 0) and never guesses, exactly like
 * lib/connectors/csv-financial-connector.ts treats a malformed CSV row.
 */

/** Every ERP product this contract anticipates. Only kinds with a
 * registered adapter (lib/connectors/erp/registry.ts) can actually run;
 * the rest exist so callers can name them and fail closed with a clear
 * "not implemented" error instead of a silent undefined. */
export type ErpProviderKind =
  | "NETSUITE"
  | "QUICKBOOKS_ONLINE"
  | "SAP_S4HANA"
  | "ORACLE_ERP_CLOUD"
  | "DYNAMICS_365_FINANCE"
  | "DYNAMICS_365_BUSINESS_CENTRAL";

export type ErpSyncStream = "FINANCIAL_FACTS" | "TRANSACTIONS";

/**
 * How change notification works for a provider, stated once on its
 * descriptor so sync orchestration never branches on provider kind:
 * - POLLING_ONLY: no usable native push; deltas come from cursor polls.
 * - WEBHOOK_PLUS_POLLING: native webhooks are a latency optimization only;
 *   the cursor poll remains the source of truth (webhooks can be lost).
 */
export type ErpChangeNotificationModel = "POLLING_ONLY" | "WEBHOOK_PLUS_POLLING";

/** How an inbound webhook's authenticity is established, per provider docs. */
export type ErpWebhookVerificationMethod =
  /** Provider sends no native webhooks (e.g. NetSuite) - nothing to verify. */
  | "NONE"
  /** HMAC signature header keyed by a per-app verifier secret (e.g. QuickBooks Online's intuit-signature). */
  | "HMAC_SIGNATURE"
  /** Subscriber-chosen shared secret compared against the payload (e.g. Business Central's clientState). */
  | "SHARED_SECRET";

export interface ErpProviderDescriptor {
  kind: ErpProviderKind;
  displayName: string;
  /** OAuth 2.0 grant the customer completes to connect. Every provider in
   * scope uses authorization-code for the interactive connect; some also
   * offer a machine-to-machine grant for unattended refresh - see the
   * concrete adapter's own header for its provider's specifics. */
  connectGrant: "OAUTH2_AUTHORIZATION_CODE";
  changeNotification: ErpChangeNotificationModel;
  webhookVerification: ErpWebhookVerificationMethod;
}

/**
 * Everything an adapter needs to act for one company's connection, WITHOUT
 * any secret material. Mirrors the persisted CompanySourceConnection row
 * ERP-1 owns: `config` is the row's non-secret JSON config and
 * `credentialRef` its opaque credential reference.
 */
export interface ErpConnectionContext {
  /** Headroom's CompanySourceConnection id for this connection. Carried
   * into every normalized record's provenance. */
  connectionId: string;
  companyId: string;
  provider: ErpProviderKind;
  /** Provider-specific NON-SECRET config (e.g. NetSuite: { accountId, redirectUri }). Never a credential value. */
  config: Record<string, unknown>;
  /** Opaque reference (env-var name / secret-store key) the injected
   * resolver turns into the provider client secret at call time. Null for
   * providers/flows that need no client secret. */
  credentialRef: string | null;
}

/** Resolves an opaque credentialRef to its secret value. Injected so the
 * scaffold never reaches into process.env from library code paths under
 * test, and so production can back it with a real secret store. Returning
 * undefined means "no secret configured" - adapters fail closed on it. */
export type ErpSecretResolver = (credentialRef: string) => string | undefined;

/** Minimal fetch shape (the repo's inference adapters inject `fetchImpl`
 * the same way). The scaffold ships with NO default implementation that
 * performs live calls - see ErpLiveCallDisabledError. */
export type ErpFetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; text: string }>;

export interface ErpAdapterDeps {
  fetchImpl?: ErpFetchImpl;
  resolveSecret?: ErpSecretResolver;
  /** Injectable clock for deterministic token-expiry computation in tests. */
  now?: () => Date;
}

/** Thrown by any adapter operation that would need a live network call
 * when no fetch implementation was injected. The scaffold is deliberately
 * inert without one: building requests and normalizing responses are real,
 * sending them is a deployment decision, not a library default. */
export class ErpLiveCallDisabledError extends Error {
  constructor(operation: string) {
    super(
      `ErpProviderAdapter: "${operation}" requires a live provider call, but no fetch implementation was injected. ` +
        `This scaffold performs no network I/O by default - wire an ErpFetchImpl at the composition root to enable it.`,
    );
    this.name = "ErpLiveCallDisabledError";
  }
}

export class UnsupportedErpProviderError extends Error {
  constructor(kind: string, registered: readonly ErpProviderKind[]) {
    super(
      `ErpProviderAdapter: no adapter is registered for provider "${kind}". Registered providers: ${registered.join(", ") || "(none)"}.`,
    );
    this.name = "UnsupportedErpProviderError";
  }
}

export class ErpConfigurationError extends Error {}

export class ErpProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErpProviderRequestError";
  }
}

/**
 * The delta cursor for one (connection, stream). Persisted by ERP-1 (the
 * CompanySourceConnection.cursor column is exactly this, encoded - see
 * lib/connectors/erp/cursor.ts). Semantics:
 * - `modifiedSince` is a watermark on the PROVIDER's last-modified clock:
 *   a completed sync returns only records modified strictly after the
 *   previous watermark (adapters query with an overlap window subtracted -
 *   see the concrete adapter - and ingestion dedups the overlap by
 *   externalId, so a record may be DELIVERED twice but is APPLIED once).
 * - `lastExternalId` breaks ties at the watermark boundary.
 * - `offset` is present ONLY while a multi-page sync is in flight; a
 *   cursor handed back in a completed page never carries one. What the
 *   offset MEANS mid-flight is adapter-defined and documented on the
 *   adapter: for NetSuite transactions it is a row counter marking a
 *   keyset continuation whose position lives in
 *   `modifiedSince`/`lastExternalId` (the offset itself never positions
 *   a query); for NetSuite financial facts it never escapes a single
 *   fetch call, because snapshots are pulled whole or not at all.
 */
export interface ErpSyncCursor {
  version: 1;
  provider: ErpProviderKind;
  stream: ErpSyncStream;
  /** ISO 8601 timestamp. */
  modifiedSince: string;
  lastExternalId?: string;
  offset?: number;
}

/** Provenance carried by EVERY normalized record an adapter emits. This is
 * the exact hand-off shape ERP-1's ingestion persists: an ERP figure is
 * sourced evidence with a named origin, never auto-verified truth. */
export interface ErpRecordProvenance {
  source: "ERP";
  provider: ErpProviderKind;
  connectionId: string;
  /** The provider's own stable id for the underlying record (never a Headroom database id). */
  externalId: string;
}

/**
 * One normalized financial fact: a single amount for a single factKey as of
 * a period. `factKey` naming is owned by ERP-1's canonical mapping; an
 * adapter guarantees provenance, amount, currency and period - and, for
 * account-derived facts, uses the provisional `account:<externalAccountId>`
 * key form until ERP-1's mapping supersedes it.
 */
export interface ErpFinancialFact extends ErpRecordProvenance {
  /** ISO date - the period this fact describes. For a cumulative /
   * balance fact this is the period END (equal to `periodEnd`/`asOf`);
   * it never claims a bounded span the amount does not cover. */
  period: string;
  /** ISO date - first day of the span `amount` covers, present only
   * when the amount is a bounded-period flow over
   * [periodStart, periodEnd]. ABSENT for cumulative/balance facts: a
   * balance is a total through `periodEnd`, not a flow over a period,
   * and stamping it with an invented start date would mislabel it. */
  periodStart?: string;
  /** ISO date - last day of the span `amount` covers. For cumulative /
   * balance facts this equals `asOf` and the amount is the cumulative
   * total through that date - NOT a single-period figure. */
  periodEnd?: string;
  /** ISO date - the date the value was true as of. */
  asOf: string;
  factKey: string;
  /** The amount in the provider's native SIGNED convention, documented
   * on the concrete adapter (for NetSuite account facts: the net posted
   * line sum - debits positive, credits negative - so a credit-balance
   * account such as a liability reads NEGATIVE). Adapters never
   * absolutize a signed amount into a friendlier-looking lie. */
  amount: number;
  /** ISO 4217 currency code the amount is denominated in. */
  currency: string;
}

/** One normalized ERP transaction (a journal/vendor bill/payment/etc. in
 * the provider's own typing - `providerType` is passed through verbatim,
 * never reinterpreted; ERP-2 decides what a provider type means for
 * basket usage and add-back evidence). */
export interface ErpTransaction extends ErpRecordProvenance {
  /** Provider's own transaction type string, verbatim. */
  providerType: string;
  /** ISO date of the transaction. */
  date: string;
  /** ISO timestamp of the provider's last modification - drives the delta cursor. */
  lastModifiedAt: string;
  amount: number;
  /** ISO 4217 currency code. */
  currency: string;
  memo?: string;
  accountExternalId?: string;
}

/** A record the adapter refused to normalize, with the reason. Surfaced,
 * never silently dropped (fail-closed accounting). */
export interface ErpSkippedRecord {
  externalId: string | null;
  reason: string;
}

export interface ErpFactPage {
  facts: ErpFinancialFact[];
  /** True when another page exists in THIS sync run - call again with
   * nextCursor immediately. False means the run is complete. */
  hasMore: boolean;
  /** The cursor to persist and hand to the next call. While hasMore is
   * true it addresses the next page of this run; on the final page it is
   * the advanced watermark for the next run. Never null on success: a
   * sync that cannot advance the cursor has failed, and fails loudly. */
  nextCursor: ErpSyncCursor;
  skipped: ErpSkippedRecord[];
}

export interface ErpTransactionPage {
  transactions: ErpTransaction[];
  hasMore: boolean;
  nextCursor: ErpSyncCursor;
  skipped: ErpSkippedRecord[];
}

export interface ErpAccessToken {
  accessToken: string;
  refreshToken?: string;
  /** ISO timestamp at which the access token stops being accepted. */
  expiresAt: string;
  scope?: string;
}

export type ErpWebhookVerification =
  | { outcome: "VERIFIED" }
  | { outcome: "REJECTED"; reason: string }
  | { outcome: "UNSUPPORTED"; reason: string };

export interface ErpWebhookRequest {
  headers: Record<string, string>;
  /** The exact raw request body - signature schemes sign bytes, not parsed JSON. */
  rawBody: string;
}

export interface ErpProviderHealth {
  ok: boolean;
  message?: string;
}

/**
 * The one interface every ERP provider adapter implements. Sync
 * orchestration, the connect flow, and webhook intake program against this
 * - never against a concrete adapter (same discipline as SourceConnector
 * and the inference registry).
 */
export interface ErpProviderAdapter {
  readonly descriptor: ErpProviderDescriptor;

  /** Connect step 1 (pure): the provider authorization URL the company's
   * admin is sent to in order to grant Headroom access. `state` is an
   * opaque CSRF nonce the caller generates and verifies on callback. */
  buildAuthorizationUrl(connection: ErpConnectionContext, state: string): string;

  /** Connect step 2: exchange the authorization code from the provider's
   * redirect for tokens. Secrets are resolved via credentialRef only. */
  exchangeAuthorizationCode(connection: ErpConnectionContext, authorizationCode: string): Promise<ErpAccessToken>;

  /** Unattended renewal once the access token expires. */
  refreshAccessToken(connection: ErpConnectionContext, refreshToken: string): Promise<ErpAccessToken>;

  /** Pull financial facts since `cursor` (null = from the beginning of
   * the provider's reachable history). One page per call; while a page's
   * hasMore is true, call again with its nextCursor. A provider whose
   * facts are derived aggregates (e.g. account balances) may answer with
   * a complete snapshot instead of a delta - its adapter documents which,
   * and the page contract is identical either way. */
  fetchFinancialFacts(
    connection: ErpConnectionContext,
    token: ErpAccessToken,
    cursor: ErpSyncCursor | null,
  ): Promise<ErpFactPage>;

  /** Pull transactions modified since `cursor`. Same paging contract. */
  fetchTransactions(
    connection: ErpConnectionContext,
    token: ErpAccessToken,
    cursor: ErpSyncCursor | null,
  ): Promise<ErpTransactionPage>;

  /** Verify an inbound webhook before ANY of its content is trusted.
   * Anything other than outcome "VERIFIED" must be treated as hostile or
   * irrelevant input by the caller. Providers without native webhooks
   * return UNSUPPORTED - their sync is polling-only by design. */
  verifyWebhookSignature(connection: ErpConnectionContext, request: ErpWebhookRequest): ErpWebhookVerification;

  healthCheck(connection: ErpConnectionContext, token: ErpAccessToken): Promise<ErpProviderHealth>;
}
