/**
 * NetSuite ERP provider adapter - SKELETON (ERP-3).
 *
 * NetSuite is the first provider implemented (see the ERP-3 design
 * report for the full comparison): it is the dominant ERP among
 * mid-market, sponsor-backed borrowers with institutional credit
 * agreements, and uniquely among the surveyed providers its SuiteQL
 * query service gives SQL-shaped bulk reads of the general ledger with
 * a last-modified delta filter - the exact shape fact/transaction
 * ingestion needs - behind a standard OAuth 2.0 connect.
 *
 * WHAT IS REAL IN THIS SKELETON vs WHAT IS A SEAM:
 * - REAL (pure, unit-tested): every URL builder, the SuiteQL query
 *   builders, cursor math, and the response normalizers. Every URL and
 *   envelope field below comes from the cited vendor documentation.
 * - SEAM: HTTP execution goes through the injected ErpFetchImpl. With
 *   none injected, operations that would call NetSuite throw
 *   ErpLiveCallDisabledError - this scaffold performs NO live network
 *   calls by default.
 * - SEAM (flagged, validate before live use): SuiteQL has NO metadata
 *   introspection (documented - see the Estuary SuiteQL reference
 *   below), so the transaction/transactionline column names in the
 *   query builders follow the SuiteAnalytics record catalog and MUST be
 *   confirmed against a real NetSuite sandbox account before this
 *   adapter is wired to production. The envelope, endpoints, auth, and
 *   paging shapes are documented; the column set is the one part that
 *   cannot be verified from documentation alone.
 *
 * CITED SOURCES (vendor first):
 * - OAuth 2.0 for REST web services, token endpoint, record URL format,
 *   Bearer header: Oracle NetSuite Applications Suite help,
 *   "OAuth 2.0 Authorization Header for REST Web Services" -
 *   https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157780312610.html
 * - Authorization-code flow URLs (authorize at
 *   https://<accountId>.app.netsuite.com/app/login/oauth2/authorize.nl,
 *   token exchange + refresh at the token endpoint, access token
 *   expires_in 3600, refresh token lifetime 7 days): Oracle NetSuite
 *   developer blog flow, summarized at
 *   https://www.houseblend.io/articles/pdfs/netsuite-tba-oauth2-migration-2027.pdf
 * - SuiteQL endpoint (POST /services/rest/query/v1/suiteql with
 *   limit/offset params, body {"q": ...}, Prefer: transient header,
 *   response envelope { links, count, hasMore, items, totalResults,
 *   offset }): https://mindcloud.co/resources/netsuite-rest-api-documentation-and-discussion
 * - SuiteQL constraints (100,000-row result cap, 1,000-row REST pages,
 *   no metadata introspection): https://docs.estuary.dev/reference/Connectors/capture-connectors/netsuite-suiteql/
 * - No native outbound webhooks; delta sync = scheduled SuiteQL polling
 *   with a lastmodifieddate filter: https://www.getknit.dev/blog/netsuite-api-integration-guide-in-depth
 * - Governance is ACCOUNT-LEVEL CONCURRENCY (shared across SOAP/REST/
 *   RESTlets), not a per-minute rate - the sync worker must serialize
 *   calls per account and back off on 429/403 rather than parallelize:
 *   https://www.houseblend.io/articles/netsuite-api-governance-guide
 *
 * AUTHENTICATION MODEL: OAuth 2.0 authorization code grant against an
 * integration record the CUSTOMER's NetSuite admin creates in their own
 * account (Setup > Integration > Manage Integrations), with Headroom's
 * redirect URI registered and the `rest_webservices` scope. The client
 * id is non-secret config; the client secret reaches this adapter only
 * through ErpConnectionContext.credentialRef via the injected secret
 * resolver - it is never stored on the connection row and never logged.
 * NetSuite also offers a client-credentials (M2M) grant signed with a
 * customer-uploaded certificate; it is deliberately NOT used for the
 * connect flow here because it requires the customer to generate and
 * upload certificate material, a heavier onboarding than the
 * authorization-code grant for the same read access.
 *
 * SYNC MODEL:
 * - Transactions: cursor delta. SuiteQL over the `transaction` table
 *   filtered on lastmodifieddate, ascending order so the final page
 *   carries the new watermark.
 * - Financial facts: SNAPSHOT. Account balances are derived aggregates,
 *   not records with their own modified timestamps, so facts are a
 *   whole-ledger aggregate (transactionline joined to transaction,
 *   grouped by account + currency) re-pulled each run; the cursor is
 *   validated and advanced to the sync instant but does not filter the
 *   query. Ingestion dedups by externalId, so a snapshot re-pull is
 *   idempotent by construction.
 * - Webhooks: UNSUPPORTED by design (no native outbound webhooks);
 *   verifyWebhookSignature returns UNSUPPORTED and sync is polling-only.
 */

import { cursorWindowStart } from "../cursor";
import {
  ErpConfigurationError,
  ErpLiveCallDisabledError,
  ErpProviderRequestError,
  type ErpAccessToken,
  type ErpAdapterDeps,
  type ErpConnectionContext,
  type ErpFactPage,
  type ErpFinancialFact,
  type ErpProviderAdapter,
  type ErpProviderDescriptor,
  type ErpProviderHealth,
  type ErpSkippedRecord,
  type ErpSyncCursor,
  type ErpTransaction,
  type ErpTransactionPage,
  type ErpWebhookRequest,
  type ErpWebhookVerification,
} from "../types";

export const NETSUITE_DESCRIPTOR: ErpProviderDescriptor = {
  kind: "NETSUITE",
  displayName: "NetSuite",
  connectGrant: "OAUTH2_AUTHORIZATION_CODE",
  changeNotification: "POLLING_ONLY",
  webhookVerification: "NONE",
};

/** SuiteQL page size for delta reads. Kept well under the documented
 * 100,000-row SuiteQL result cap; REST record pages cap at 1,000. */
export const NETSUITE_SUITEQL_PAGE_SIZE = 1000;

/** History floor for a first sync with no cursor: NetSuite accounts are
 * long-lived; ingestion backfills further through ERP-1 if ever needed. */
const NETSUITE_EPOCH_ISO = "2000-01-01T00:00:00.000Z";

export interface NetSuiteConnectionConfig {
  /** NetSuite account id - the subdomain token in every URL below (e.g. "1234567" or "1234567-sb1" for a sandbox). */
  accountId: string;
  /** Headroom's OAuth callback URL, registered on the customer's integration record. */
  redirectUri: string;
  /** The integration record's client id (consumer key). An identifier, not a secret. */
  clientId: string;
}

export function readNetSuiteConfig(connection: ErpConnectionContext): NetSuiteConnectionConfig {
  const { accountId, redirectUri, clientId } = connection.config as Partial<NetSuiteConnectionConfig>;
  if (typeof accountId !== "string" || accountId.trim() === "") {
    throw new ErpConfigurationError(`NetSuite connection ${connection.connectionId}: config.accountId is required (the account's subdomain token).`);
  }
  if (typeof redirectUri !== "string" || redirectUri.trim() === "") {
    throw new ErpConfigurationError(`NetSuite connection ${connection.connectionId}: config.redirectUri is required (registered on the integration record).`);
  }
  if (typeof clientId !== "string" || clientId.trim() === "") {
    throw new ErpConfigurationError(`NetSuite connection ${connection.connectionId}: config.clientId is required (the integration record's client id).`);
  }
  return { accountId, redirectUri, clientId };
}

function assertConnection(connection: ErpConnectionContext): void {
  if (connection.provider !== "NETSUITE") {
    throw new ErpConfigurationError(`NetSuiteAdapter: connection ${connection.connectionId} is for provider ${connection.provider}, not NETSUITE.`);
  }
}

/** Documented: https://<accountID>.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token */
export function netSuiteTokenEndpoint(accountId: string): string {
  return `https://${accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;
}

/** Documented: POST https://<accountId>.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=<n>&offset=<n> */
export function netSuiteSuiteQlUrl(accountId: string, page: { limit: number; offset: number }): string {
  return `https://${accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=${page.limit}&offset=${page.offset}`;
}

/** Documented authorize host: https://<accountId>.app.netsuite.com/app/login/oauth2/authorize.nl */
export function buildNetSuiteAuthorizationUrl(config: NetSuiteConnectionConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "rest_webservices",
    state,
  });
  return `https://${config.accountId}.app.netsuite.com/app/login/oauth2/authorize.nl?${params.toString()}`;
}

/** SuiteQL compares datetime columns with Oracle-style TO_DATE literals;
 * the watermark is rendered in UTC with the documented mask shape. */
export function suiteQlDateLiteral(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) {
    throw new ErpConfigurationError(`suiteQlDateLiteral: "${isoTimestamp}" is not a parseable timestamp.`);
  }
  const p = (n: number) => String(n).padStart(2, "0");
  const rendered = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  return `TO_DATE('${rendered}', 'YYYY-MM-DD HH24:MI:SS')`;
}

/**
 * Transactions delta query over the SuiteAnalytics `transaction` table,
 * filtered on lastmodifieddate (the documented SuiteQL delta pattern).
 * Ascending (lastmodifieddate, id) order is load-bearing: the final
 * page's maximum lastmodifieddate becomes the next watermark.
 * Column set per the SuiteAnalytics record catalog - see the header's
 * sandbox-validation seam.
 */
export function buildNetSuiteTransactionDeltaQuery(windowStartIso: string): string {
  return (
    "SELECT t.id, t.tranid, t.trandate, t.type, t.lastmodifieddate, t.foreigntotal, t.memo, c.symbol AS currencysymbol " +
    "FROM transaction t LEFT JOIN currency c ON t.currency = c.id " +
    `WHERE t.lastmodifieddate > ${suiteQlDateLiteral(windowStartIso)} ` +
    "ORDER BY t.lastmodifieddate, t.id"
  );
}

/**
 * Account-activity aggregate for financial facts: net posted line amount
 * per account + transaction currency, over the WHOLE ledger (snapshot
 * semantics - see header). Grouped output rows are bounded by
 * accounts x currencies, far under the SuiteQL result cap.
 */
export function buildNetSuiteAccountActivityQuery(): string {
  return (
    "SELECT tl.account AS accountid, c.symbol AS currencysymbol, SUM(tl.foreignamount) AS amount " +
    "FROM transactionline tl " +
    "JOIN transaction t ON tl.transaction = t.id " +
    "LEFT JOIN currency c ON t.currency = c.id " +
    "GROUP BY tl.account, c.symbol"
  );
}

/** The documented SuiteQL response envelope. */
export interface SuiteQlEnvelope {
  links?: Array<{ rel: string; href: string }>;
  count?: number;
  hasMore?: boolean;
  items?: Array<Record<string, unknown>>;
  totalResults?: number;
  offset?: number;
}

function parseSuiteQlEnvelope(text: string, operation: string): SuiteQlEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ErpProviderRequestError(`NetSuiteAdapter: ${operation} returned a non-JSON response body.`);
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as SuiteQlEnvelope).items)) {
    throw new ErpProviderRequestError(`NetSuiteAdapter: ${operation} response is missing the documented SuiteQL "items" array.`);
  }
  return parsed as SuiteQlEnvelope;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function isoDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function isoCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * Normalize one SuiteQL transaction-delta page into the ERP-1 hand-off
 * shape. Pure. Rows that cannot be proven (no id, no finite amount, no
 * currency symbol, unparseable dates) are SKIPPED with a reason - never
 * coerced, never zero-filled.
 */
export function normalizeNetSuiteTransactionPage(
  envelope: SuiteQlEnvelope,
  connection: ErpConnectionContext,
  previous: ErpSyncCursor | null,
  syncStartedAtIso: string,
): ErpTransactionPage {
  const skipped: ErpSkippedRecord[] = [];
  const transactions: ErpTransaction[] = [];
  const items = envelope.items ?? [];
  let maxModified: string | null = previous?.modifiedSince ?? null;
  let maxModifiedId: string | undefined;

  for (const row of items) {
    const externalId = typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : null;
    if (externalId === null) {
      skipped.push({ externalId: null, reason: "SuiteQL transaction row has no id - cannot establish provenance, skipped." });
      continue;
    }
    const amount = finiteNumber(row.foreigntotal);
    if (amount === null) {
      skipped.push({ externalId, reason: "Transaction row has no finite foreigntotal - amount not provable, skipped (never treated as 0)." });
      continue;
    }
    const currency = isoCurrencyCode(row.currencysymbol);
    if (currency === null) {
      skipped.push({ externalId, reason: "Transaction row has no ISO currency symbol - currency not provable, skipped." });
      continue;
    }
    const date = isoDateOnly(row.trandate);
    const lastModifiedAt = isoTimestamp(row.lastmodifieddate);
    if (date === null || lastModifiedAt === null) {
      skipped.push({ externalId, reason: "Transaction row has an unparseable trandate/lastmodifieddate - skipped." });
      continue;
    }
    transactions.push({
      source: "ERP",
      provider: "NETSUITE",
      connectionId: connection.connectionId,
      externalId,
      providerType: typeof row.type === "string" ? row.type : "UNKNOWN",
      date,
      lastModifiedAt,
      amount,
      currency,
      ...(typeof row.memo === "string" && row.memo.trim() !== "" ? { memo: row.memo } : {}),
    });
    if (maxModified === null || lastModifiedAt > maxModified || (lastModifiedAt === maxModified && (maxModifiedId === undefined || externalId > maxModifiedId))) {
      maxModified = lastModifiedAt;
      maxModifiedId = externalId;
    }
  }

  const hasMore = envelope.hasMore === true;
  const previousOffset = previous?.offset ?? 0;
  const nextCursor: ErpSyncCursor = hasMore
    ? {
        version: 1,
        provider: "NETSUITE",
        stream: "TRANSACTIONS",
        // Watermark advances ONLY on the final page - mid-run pages keep
        // the original watermark and page forward by offset.
        modifiedSince: previous?.modifiedSince ?? NETSUITE_EPOCH_ISO,
        offset: previousOffset + items.length,
      }
    : {
        version: 1,
        provider: "NETSUITE",
        stream: "TRANSACTIONS",
        modifiedSince: maxModified ?? syncStartedAtIso,
        ...(maxModifiedId !== undefined ? { lastExternalId: maxModifiedId } : {}),
      };
  return { transactions, hasMore, nextCursor, skipped };
}

/**
 * Normalize one SuiteQL account-activity page into financial facts.
 * Pure. The factKey is the provisional `account:<externalId>` form -
 * ERP-1's canonical mapping owns the final keys; what this adapter
 * guarantees is provenance, amount, currency, and as-of.
 */
export function normalizeNetSuiteAccountActivityPage(
  envelope: SuiteQlEnvelope,
  connection: ErpConnectionContext,
  syncDateIso: string,
): ErpFactPage {
  const skipped: ErpSkippedRecord[] = [];
  const facts: ErpFinancialFact[] = [];
  const asOf = isoDateOnly(syncDateIso) ?? syncDateIso.slice(0, 10);

  for (const row of envelope.items ?? []) {
    const accountId = typeof row.accountid === "string" || typeof row.accountid === "number" ? String(row.accountid) : null;
    if (accountId === null) {
      skipped.push({ externalId: null, reason: "Account-activity row has no account id - cannot establish provenance, skipped." });
      continue;
    }
    const amount = finiteNumber(row.amount);
    if (amount === null) {
      skipped.push({ externalId: accountId, reason: "Account-activity row has no finite aggregated amount - skipped (never treated as 0)." });
      continue;
    }
    const currency = isoCurrencyCode(row.currencysymbol);
    if (currency === null) {
      skipped.push({ externalId: accountId, reason: "Account-activity row has no ISO currency symbol - skipped." });
      continue;
    }
    facts.push({
      source: "ERP",
      provider: "NETSUITE",
      connectionId: connection.connectionId,
      externalId: `account:${accountId}`,
      period: asOf,
      asOf,
      factKey: `account:${accountId}`,
      amount,
      currency,
    });
  }

  return {
    facts,
    hasMore: false,
    nextCursor: { version: 1, provider: "NETSUITE", stream: "FINANCIAL_FACTS", modifiedSince: new Date(syncDateIso).toISOString() },
    skipped,
  };
}

export class NetSuiteErpAdapter implements ErpProviderAdapter {
  readonly descriptor = NETSUITE_DESCRIPTOR;
  private readonly deps: ErpAdapterDeps;

  constructor(deps: ErpAdapterDeps = {}) {
    this.deps = deps;
  }

  buildAuthorizationUrl(connection: ErpConnectionContext, state: string): string {
    assertConnection(connection);
    return buildNetSuiteAuthorizationUrl(readNetSuiteConfig(connection), state);
  }

  private resolveClientSecret(connection: ErpConnectionContext): string {
    if (!connection.credentialRef) {
      throw new ErpConfigurationError(
        `NetSuite connection ${connection.connectionId}: no credentialRef - the integration record's client secret must be referenced (never stored raw) before token exchange.`,
      );
    }
    const secret = this.deps.resolveSecret?.(connection.credentialRef);
    if (!secret) {
      throw new ErpConfigurationError(
        `NetSuite connection ${connection.connectionId}: credentialRef "${connection.credentialRef}" did not resolve to a secret value. Failing closed - no token request attempted.`,
      );
    }
    return secret;
  }

  private async tokenRequest(connection: ErpConnectionContext, form: Record<string, string>): Promise<ErpAccessToken> {
    const config = readNetSuiteConfig(connection);
    const secret = this.resolveClientSecret(connection);
    if (!this.deps.fetchImpl) throw new ErpLiveCallDisabledError("NetSuite token request");
    const body = new URLSearchParams(form).toString();
    const basic = Buffer.from(`${config.clientId}:${secret}`, "utf8").toString("base64");
    const res = await this.deps.fetchImpl(netSuiteTokenEndpoint(config.accountId), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body,
    });
    if (res.status !== 200) {
      // The response body is deliberately NOT echoed: token-endpoint error
      // payloads can carry grant material. Status only.
      throw new ErpProviderRequestError(`NetSuiteAdapter: token request failed (HTTP ${res.status}).`, res.status);
    }
    let parsed: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown };
    try {
      parsed = JSON.parse(res.text) as typeof parsed;
    } catch {
      throw new ErpProviderRequestError("NetSuiteAdapter: token endpoint returned a non-JSON response body.");
    }
    if (typeof parsed.access_token !== "string" || parsed.access_token === "") {
      throw new ErpProviderRequestError("NetSuiteAdapter: token response carries no access_token.");
    }
    const expiresInSec = typeof parsed.expires_in === "number" && Number.isFinite(parsed.expires_in) ? parsed.expires_in : 3600;
    const now = this.deps.now ? this.deps.now() : new Date();
    return {
      accessToken: parsed.access_token,
      ...(typeof parsed.refresh_token === "string" ? { refreshToken: parsed.refresh_token } : {}),
      expiresAt: new Date(now.getTime() + expiresInSec * 1000).toISOString(),
      ...(typeof parsed.scope === "string" ? { scope: parsed.scope } : {}),
    };
  }

  async exchangeAuthorizationCode(connection: ErpConnectionContext, authorizationCode: string): Promise<ErpAccessToken> {
    assertConnection(connection);
    const config = readNetSuiteConfig(connection);
    return this.tokenRequest(connection, {
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: config.redirectUri,
    });
  }

  async refreshAccessToken(connection: ErpConnectionContext, refreshToken: string): Promise<ErpAccessToken> {
    assertConnection(connection);
    return this.tokenRequest(connection, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  private async runSuiteQl(
    connection: ErpConnectionContext,
    token: ErpAccessToken,
    query: string,
    offset: number,
    operation: string,
  ): Promise<SuiteQlEnvelope> {
    const config = readNetSuiteConfig(connection);
    if (!this.deps.fetchImpl) throw new ErpLiveCallDisabledError(operation);
    const res = await this.deps.fetchImpl(netSuiteSuiteQlUrl(config.accountId, { limit: NETSUITE_SUITEQL_PAGE_SIZE, offset }), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
        Prefer: "transient",
      },
      body: JSON.stringify({ q: query }),
    });
    if (res.status !== 200) {
      throw new ErpProviderRequestError(`NetSuiteAdapter: ${operation} failed (HTTP ${res.status}).`, res.status);
    }
    return parseSuiteQlEnvelope(res.text, operation);
  }

  async fetchTransactions(
    connection: ErpConnectionContext,
    token: ErpAccessToken,
    cursor: ErpSyncCursor | null,
  ): Promise<ErpTransactionPage> {
    assertConnection(connection);
    if (cursor !== null && (cursor.provider !== "NETSUITE" || cursor.stream !== "TRANSACTIONS")) {
      throw new ErpConfigurationError(`NetSuiteAdapter.fetchTransactions: cursor is for ${cursor.provider}/${cursor.stream}, expected NETSUITE/TRANSACTIONS.`);
    }
    const syncStartedAt = (this.deps.now ? this.deps.now() : new Date()).toISOString();
    const windowStart = cursorWindowStart(cursor, NETSUITE_EPOCH_ISO);
    const envelope = await this.runSuiteQl(connection, token, buildNetSuiteTransactionDeltaQuery(windowStart), cursor?.offset ?? 0, "SuiteQL transaction delta query");
    return normalizeNetSuiteTransactionPage(envelope, connection, cursor, syncStartedAt);
  }

  async fetchFinancialFacts(
    connection: ErpConnectionContext,
    token: ErpAccessToken,
    cursor: ErpSyncCursor | null,
  ): Promise<ErpFactPage> {
    assertConnection(connection);
    if (cursor !== null && (cursor.provider !== "NETSUITE" || cursor.stream !== "FINANCIAL_FACTS")) {
      throw new ErpConfigurationError(`NetSuiteAdapter.fetchFinancialFacts: cursor is for ${cursor.provider}/${cursor.stream}, expected NETSUITE/FINANCIAL_FACTS.`);
    }
    // Snapshot semantics (see header): the cursor does not filter this
    // query; it is validated above and advanced by the normalizer.
    const syncStartedAt = (this.deps.now ? this.deps.now() : new Date()).toISOString();
    const envelope = await this.runSuiteQl(connection, token, buildNetSuiteAccountActivityQuery(), 0, "SuiteQL account activity query");
    return normalizeNetSuiteAccountActivityPage(envelope, connection, syncStartedAt);
  }

  verifyWebhookSignature(_connection: ErpConnectionContext, _request: ErpWebhookRequest): ErpWebhookVerification {
    return {
      outcome: "UNSUPPORTED",
      reason:
        "NetSuite has no native outbound webhooks - change notification is SuiteQL polling on lastmodifieddate. " +
        "Any inbound HTTP call claiming to be a NetSuite webhook is not from this integration path and must not be trusted.",
    };
  }

  async healthCheck(connection: ErpConnectionContext, token: ErpAccessToken): Promise<ErpProviderHealth> {
    assertConnection(connection);
    try {
      await this.runSuiteQl(connection, token, "SELECT id FROM transaction ORDER BY id", 0, "SuiteQL health probe");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export function createNetSuiteAdapter(deps: ErpAdapterDeps = {}): NetSuiteErpAdapter {
  return new NetSuiteErpAdapter(deps);
}
