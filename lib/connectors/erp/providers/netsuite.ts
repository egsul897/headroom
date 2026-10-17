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
 * - Transactions: cursor delta over POSTING transactions only
 *   (`t.posting = 'T'` - non-posting records such as sales orders and
 *   estimates never hit the general ledger and are not covenant
 *   events). The first page of a run filters on lastmodifieddate with
 *   the cursor overlap window; continuation pages are KEYSET-paged on
 *   (lastmodifieddate, id) strictly after the greatest row seen so far
 *   in the run, so a row mutated mid-sync moves later in the order and
 *   is re-delivered rather than skipped by a shifting offset window,
 *   and every query stays a limit-bounded slice (offset is never the
 *   positioning mechanism, which is also what keeps each query far
 *   inside SuiteQL's documented 100,000-row result cap).
 * - Financial facts: SNAPSHOT. Account balances are derived aggregates,
 *   not records with their own modified timestamps, so facts are a
 *   whole-ledger aggregate over POSTING lines (transactionline joined
 *   to transaction, grouped by account + currency) re-pulled each run.
 *   The grouped result is paged THROUGH inside a single fetch call: a
 *   snapshot that stopped mid-way would present missing accounts as
 *   zero-activity, so any page failure fails the whole fetch and no
 *   partial snapshot is ever emitted. Ingestion dedups by externalId,
 *   so a snapshot re-pull is idempotent by construction.
 * - PERIOD + SIGN HONESTY (facts): the activity aggregate is a
 *   CUMULATIVE total through the sync instant - for a balance-sheet
 *   account that is exactly its balance; it is never a single-period
 *   flow. Facts therefore carry `periodEnd` = as-of and NO
 *   `periodStart` (see ErpFinancialFact), and amounts keep NetSuite's
 *   native line sign (debits positive, credits negative), so a
 *   credit-balance account reads negative by construction.
 * - SCOPE: reads are CONSOLIDATED across all subsidiaries on the
 *   primary accounting book unless config.subsidiaryId /
 *   config.accountingBookId narrow them. Consolidated is the covenant
 *   reporting basis (covenants test consolidated figures), so the
 *   default is a stated scope, not an oversight - a deployment that
 *   needs entity-level facts sets the config option, and an unscoped
 *   read is never silently presented as a single entity's.
 * - Webhooks: UNSUPPORTED by design (no native outbound webhooks);
 *   verifyWebhookSignature returns UNSUPPORTED and sync is polling-only.
 *
 * HOST SAFETY: every URL below is built by interpolating the configured
 * accountId as the host's subdomain token, and the token request sends
 * the client secret (Basic auth) to one of those URLs - so a hostile or
 * mistyped accountId ("evil.example/x#") would exfiltrate the secret
 * off-host. readNetSuiteConfig therefore ALLOWLIST-validates accountId
 * against NetSuite's documented subdomain forms (numeric production id,
 * "-sb<n>" sandbox, "-rp"/"-rp<n>" release preview - Oracle, "URLs for
 * Sandbox / Release Preview Accounts"), and the URL builders re-validate
 * on every call. No other config value can steer a request host:
 * redirectUri travels as form/query data and clientId as header/query
 * data; the host comes from accountId alone.
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

/** SuiteQL's documented per-query result cap (Estuary SuiteQL reference,
 * cited in the header). Offset paging cannot be trusted to reach rows
 * beyond it, so a grouped result that reports more rows than this fails
 * the run instead of emitting a truncated snapshot. */
export const NETSUITE_SUITEQL_RESULT_CAP = 100_000;

/** History floor for a first sync with no cursor: NetSuite accounts are
 * long-lived; ingestion backfills further through ERP-1 if ever needed. */
const NETSUITE_EPOCH_ISO = "2000-01-01T00:00:00.000Z";

export interface NetSuiteConnectionConfig {
  /** NetSuite account id - the subdomain token in every URL below (e.g. "1234567" or "1234567-sb1" for a sandbox). Allowlist-validated; see assertNetSuiteAccountId. */
  accountId: string;
  /** Headroom's OAuth callback URL, registered on the customer's integration record. */
  redirectUri: string;
  /** The integration record's client id (consumer key). An identifier, not a secret. */
  clientId: string;
  /** Optional OneWorld subsidiary internal id (numeric). When set, both SuiteQL queries scope to this subsidiary. When unset, reads are CONSOLIDATED across all subsidiaries - the covenant reporting basis, stated explicitly in the header rather than left implicit. */
  subsidiaryId?: string;
  /** Optional accounting book internal id (numeric). When set, queries scope to that book; when unset, the consolidated / primary-book view. */
  accountingBookId?: string;
}

/**
 * NetSuite's documented account-specific subdomain forms (Oracle,
 * "Understanding NetSuite URLs": production `123456`; sandbox account id
 * `123456_SB1` renders in the domain as `123456-sb1`; release preview
 * `123456_RP` renders as `123456-rp` - note the preview suffix carries
 * NO number in Oracle's own example, so the digit run is optional for
 * `rp` only; sandbox suffixes are numbered in every documented
 * example). The account id becomes the HOST of every URL this
 * adapter builds, including the token endpoint that receives the client
 * secret as Basic auth - anything outside these forms (dots, slashes,
 * "#", a full hostname) could steer that secret off-host, so it is
 * refused, never sanitized into a guess.
 */
const NETSUITE_ACCOUNT_ID_RE = /^[0-9]+(-(sb[0-9]+|rp[0-9]*))?$/i;

export function assertNetSuiteAccountId(accountId: string): string {
  const id = typeof accountId === "string" ? accountId.trim() : "";
  if (!NETSUITE_ACCOUNT_ID_RE.test(id)) {
    throw new ErpConfigurationError(
      `NetSuite accountId "${accountId}" is not a documented NetSuite subdomain token (expected a numeric account id, optionally suffixed "-sb<n>" for a sandbox or "-rp"/"-rp<n>" for release preview - the hyphenated domain form, not the underscored account form). ` +
        `Refusing to build provider URLs from it: the account id becomes the request host, and the token request carries the client secret.`,
    );
  }
  return id;
}

/** NetSuite internal ids (subsidiary, accounting book, transaction) are
 * numeric. Anything else interpolated into SuiteQL would be an injection
 * surface, so it is refused rather than escaped into a guess. */
export function netSuiteNumericIdLiteral(raw: string, what: string): string {
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw.trim())) {
    throw new ErpConfigurationError(`NetSuite ${what} "${raw}" is not a numeric internal id - refusing to interpolate it into SuiteQL.`);
  }
  return raw.trim();
}

function readOptionalNumericId(connection: ErpConnectionContext, value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ErpConfigurationError(`NetSuite connection ${connection.connectionId}: config.${field} must be a numeric internal id.`);
  }
  try {
    return netSuiteNumericIdLiteral(String(value), field);
  } catch {
    throw new ErpConfigurationError(`NetSuite connection ${connection.connectionId}: config.${field} "${String(value)}" is not a numeric internal id.`);
  }
}

export function readNetSuiteConfig(connection: ErpConnectionContext): NetSuiteConnectionConfig {
  const raw = connection.config as Partial<NetSuiteConnectionConfig>;
  const { redirectUri, clientId } = raw;
  if (typeof raw.accountId !== "string" || raw.accountId.trim() === "") {
    throw new ErpConfigurationError(`NetSuite connection ${connection.connectionId}: config.accountId is required (the account's subdomain token).`);
  }
  const accountId = assertNetSuiteAccountId(raw.accountId);
  if (typeof redirectUri !== "string" || redirectUri.trim() === "") {
    throw new ErpConfigurationError(`NetSuite connection ${connection.connectionId}: config.redirectUri is required (registered on the integration record).`);
  }
  if (typeof clientId !== "string" || clientId.trim() === "") {
    throw new ErpConfigurationError(`NetSuite connection ${connection.connectionId}: config.clientId is required (the integration record's client id).`);
  }
  const subsidiaryId = readOptionalNumericId(connection, raw.subsidiaryId, "subsidiaryId");
  const accountingBookId = readOptionalNumericId(connection, raw.accountingBookId, "accountingBookId");
  return {
    accountId,
    redirectUri,
    clientId,
    ...(subsidiaryId !== undefined ? { subsidiaryId } : {}),
    ...(accountingBookId !== undefined ? { accountingBookId } : {}),
  };
}

function assertConnection(connection: ErpConnectionContext): void {
  if (connection.provider !== "NETSUITE") {
    throw new ErpConfigurationError(`NetSuiteAdapter: connection ${connection.connectionId} is for provider ${connection.provider}, not NETSUITE.`);
  }
}

/** Documented: https://<accountID>.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token
 * The accountId is re-validated here (not only in readNetSuiteConfig)
 * because these builders are exported: no call path may mint a
 * token-endpoint URL - the one that receives the client secret - from an
 * unvalidated host token. */
export function netSuiteTokenEndpoint(accountId: string): string {
  const id = assertNetSuiteAccountId(accountId);
  return `https://${id}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;
}

/** Documented: POST https://<accountId>.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=<n>&offset=<n> */
export function netSuiteSuiteQlUrl(accountId: string, page: { limit: number; offset: number }): string {
  const id = assertNetSuiteAccountId(accountId);
  return `https://${id}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=${page.limit}&offset=${page.offset}`;
}

/** Documented authorize host: https://<accountId>.app.netsuite.com/app/login/oauth2/authorize.nl */
export function buildNetSuiteAuthorizationUrl(config: NetSuiteConnectionConfig, state: string): string {
  const accountId = assertNetSuiteAccountId(config.accountId);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "rest_webservices",
    state,
  });
  return `https://${accountId}.app.netsuite.com/app/login/oauth2/authorize.nl?${params.toString()}`;
}

/** SuiteQL compares datetime columns with Oracle-style TO_DATE literals.
 * The watermark is rendered from its UTC components with an explicit
 * mask - the literal is a UTC literal by construction, and the row
 * parser (strictIsoTimestamp) reads SuiteQL's zone-less wall times back
 * AS UTC, so rendering and parsing round-trip on one stated convention
 * instead of depending on the host's timezone. */
export function suiteQlDateLiteral(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) {
    throw new ErpConfigurationError(`suiteQlDateLiteral: "${isoTimestamp}" is not a parseable timestamp.`);
  }
  const p = (n: number) => String(n).padStart(2, "0");
  const rendered = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  return `TO_DATE('${rendered}', 'YYYY-MM-DD HH24:MI:SS')`;
}

/** Scope clauses shared by both SuiteQL queries. Unset scope =
 * consolidated across subsidiaries on the primary book (see header);
 * set scope interpolates ONLY validated numeric internal ids. */
function scopeClauses(scope: { subsidiaryId?: string; accountingBookId?: string }): string[] {
  const clauses: string[] = [];
  if (scope.subsidiaryId !== undefined) {
    clauses.push(`t.subsidiary = ${netSuiteNumericIdLiteral(scope.subsidiaryId, "subsidiaryId")}`);
  }
  if (scope.accountingBookId !== undefined) {
    clauses.push(`t.accountingbook = ${netSuiteNumericIdLiteral(scope.accountingBookId, "accountingBookId")}`);
  }
  return clauses;
}

export interface NetSuiteDeltaQueryOptions {
  /** Keyset continuation: rows strictly after this (lastmodifieddate,
   * id) position. When present, `windowStartIso` is ignored - the
   * predicate IS the position, so no offset window can shift under a
   * row that changes mid-sync. */
  keysetAfter?: { modifiedSinceIso: string; lastExternalId: string };
  subsidiaryId?: string;
  accountingBookId?: string;
}

/**
 * Transactions delta query over the SuiteAnalytics `transaction` table.
 * POSTING transactions only: non-posting records (sales orders,
 * estimates, purchase orders) never post to the GL and are not covenant
 * events. Dates are selected through TO_CHAR in ISO masks so the
 * response never depends on the account's display date format (a
 * DD/MM-shaped string parsed by Date.parse would silently become a
 * different day). Two addressing modes, both ordered ascending by
 * (lastmodifieddate, id) so the greatest row seen is the position:
 * - window mode (first page of a run): lastmodifieddate after the
 *   overlap-adjusted watermark;
 * - keyset mode (continuations): rows strictly after the
 *   (lastmodifieddate, id) position the previous page ended at.
 * Column set per the SuiteAnalytics record catalog - see the header's
 * sandbox-validation seam.
 */
export function buildNetSuiteTransactionDeltaQuery(windowStartIso: string, options: NetSuiteDeltaQueryOptions = {}): string {
  const clauses: string[] = ["t.posting = 'T'"];
  if (options.keysetAfter) {
    const literal = suiteQlDateLiteral(options.keysetAfter.modifiedSinceIso);
    const afterId = netSuiteNumericIdLiteral(options.keysetAfter.lastExternalId, "keyset lastExternalId");
    clauses.push(`(t.lastmodifieddate > ${literal} OR (t.lastmodifieddate = ${literal} AND t.id > ${afterId}))`);
  } else {
    clauses.push(`t.lastmodifieddate > ${suiteQlDateLiteral(windowStartIso)}`);
  }
  clauses.push(...scopeClauses(options));
  return (
    "SELECT t.id, t.tranid, TO_CHAR(t.trandate, 'YYYY-MM-DD') AS trandate, t.type, " +
    "TO_CHAR(t.lastmodifieddate, 'YYYY-MM-DD HH24:MI:SS') AS lastmodifieddate, t.foreigntotal, t.memo, c.symbol AS currencysymbol " +
    "FROM transaction t LEFT JOIN currency c ON t.currency = c.id " +
    `WHERE ${clauses.join(" AND ")} ` +
    "ORDER BY t.lastmodifieddate, t.id"
  );
}

/**
 * Account-activity aggregate for financial facts: net POSTED line amount
 * per account + transaction currency, over the WHOLE ledger (snapshot
 * semantics - see header: the sum is a cumulative balance through the
 * sync instant, debits positive / credits negative). The ORDER BY is
 * load-bearing: the grouped result is offset-paged inside
 * fetchFinancialFacts, and offset paging over an unordered GROUP BY
 * could repeat or drop groups between pages.
 */
export function buildNetSuiteAccountActivityQuery(options: { subsidiaryId?: string; accountingBookId?: string } = {}): string {
  const clauses: string[] = ["t.posting = 'T'", ...scopeClauses(options)];
  return (
    "SELECT tl.account AS accountid, c.symbol AS currencysymbol, SUM(tl.foreignamount) AS amount " +
    "FROM transactionline tl " +
    "JOIN transaction t ON tl.transaction = t.id " +
    "LEFT JOIN currency c ON t.currency = c.id " +
    `WHERE ${clauses.join(" AND ")} ` +
    "GROUP BY tl.account, c.symbol " +
    "ORDER BY tl.account, c.symbol"
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

/**
 * STRICT date parsing. Date.parse is deliberately NOT used on provider
 * strings: it accepts account-locale shapes and guesses - "05/10/2026"
 * from a DD/MM account parses as May 10, a silently WRONG date, worse
 * than an unparseable one - and zone-less timestamps parse in the host's
 * timezone, shifting a watermark by the host's UTC offset. The query
 * builders select dates through TO_CHAR in ISO masks, so anything that
 * is not exactly ISO is unprovable and the row is skipped with a reason.
 * Zone-less ISO timestamps are read as UTC - the same convention
 * suiteQlDateLiteral renders with - so parse and render round-trip.
 */
const ISO_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})?$/;

function strictIsoDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = ISO_DATE_ONLY_RE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  // Round-trip the components so an impossible date (2026-02-31) is
  // rejected instead of rolling into March.
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function strictIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (ISO_DATE_ONLY_RE.test(v)) {
    const d = strictIsoDateOnly(v);
    return d === null ? null : `${d}T00:00:00.000Z`;
  }
  const m = ISO_TIMESTAMP_RE.exec(v);
  if (!m) return null;
  const zoneRaw = m[8];
  const zone = zoneRaw === undefined || zoneRaw === "Z" ? "Z" : zoneRaw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}${zone}`);
  if (Number.isNaN(ms)) return null;
  const out = new Date(ms);
  if (zone === "Z") {
    // Component round-trip: reject rollovers Date.parse would otherwise
    // normalize (month 13, hour 25).
    if (
      out.getUTCFullYear() !== Number(m[1]) ||
      out.getUTCMonth() + 1 !== Number(m[2]) ||
      out.getUTCDate() !== Number(m[3]) ||
      out.getUTCHours() !== Number(m[4]) ||
      out.getUTCMinutes() !== Number(m[5]) ||
      out.getUTCSeconds() !== Number(m[6])
    ) {
      return null;
    }
  }
  return out.toISOString();
}

/** Total order over provider external ids for keyset positions: numeric
 * when both ids are digit strings (NetSuite internal ids are), so "102"
 * sorts after "99" - a lexicographic compare would invert them and
 * strand rows at the watermark boundary. */
function compareExternalIds(a: string, b: string): number {
  if (/^[0-9]+$/.test(a) && /^[0-9]+$/.test(b)) {
    const na = a.replace(/^0+/, "") || "0";
    const nb = b.replace(/^0+/, "") || "0";
    if (na.length !== nb.length) return na.length - nb.length;
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
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
  const items = envelope.items ?? [];
  if (envelope.hasMore === true && items.length === 0) {
    // A page that claims more rows but delivers none gives the keyset
    // nothing to advance on - paging further could loop or, worse,
    // conclude with a watermark past rows never seen. Fail the run.
    throw new ErpProviderRequestError(
      "NetSuiteAdapter: SuiteQL transaction page claims hasMore but returned zero items - the delta position cannot advance, failing the run instead of risking a silent gap.",
    );
  }
  const skipped: ErpSkippedRecord[] = [];
  const transactions: ErpTransaction[] = [];
  // Keyset position: the greatest (lastmodifieddate, id) SEEN in this
  // run, seeded from the incoming cursor. It advances over SKIPPED rows
  // too - a refusal is surfaced in `skipped`, and a position that
  // stopped at an unprovable row would re-fetch it forever; the
  // watermark may pass a row only because that row was reported, never
  // silently. (A row whose lastmodifieddate itself is unparseable
  // cannot define a position and does not advance it; it is reported on
  // every page that returns it.)
  let posModified: string | null = previous?.modifiedSince ?? null;
  let posId: string | undefined = previous?.lastExternalId;
  const advancePosition = (ts: string, id: string) => {
    if (posModified === null || ts > posModified || (ts === posModified && (posId === undefined || compareExternalIds(id, posId) > 0))) {
      posModified = ts;
      posId = id;
    }
  };

  for (const row of items) {
    const externalId = typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : null;
    if (externalId === null) {
      skipped.push({ externalId: null, reason: "SuiteQL transaction row has no id - cannot establish provenance, skipped." });
      continue;
    }
    const lastModifiedAt = strictIsoTimestamp(row.lastmodifieddate);
    if (lastModifiedAt !== null) advancePosition(lastModifiedAt, externalId);
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
    const date = strictIsoDateOnly(row.trandate);
    if (date === null || lastModifiedAt === null) {
      skipped.push({
        externalId,
        reason: "Transaction row's trandate/lastmodifieddate is not in the strict ISO form the query selects (TO_CHAR masks) - the account's display format is never guessed at, skipped.",
      });
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
  }

  const hasMore = envelope.hasMore === true;
  const nextCursor: ErpSyncCursor = hasMore
    ? {
        version: 1,
        provider: "NETSUITE",
        stream: "TRANSACTIONS",
        // Mid-run the cursor IS the keyset position, not the completed
        // watermark: the next page queries strictly after it. `offset`
        // survives only as the in-flight marker (and row counter) that
        // tells fetchTransactions this cursor is a continuation.
        modifiedSince: posModified ?? NETSUITE_EPOCH_ISO,
        ...(posId !== undefined ? { lastExternalId: posId } : {}),
        offset: (previous?.offset ?? 0) + items.length,
      }
    : {
        version: 1,
        provider: "NETSUITE",
        stream: "TRANSACTIONS",
        modifiedSince: posModified ?? syncStartedAtIso,
        ...(posId !== undefined ? { lastExternalId: posId } : {}),
      };
  return { transactions, hasMore, nextCursor, skipped };
}

/**
 * Normalize one SuiteQL account-activity page into financial facts.
 * Pure. Identity, stated precisely because ERP-1 dedups on it:
 * - `factKey` is WHAT the fact measures: `account:<id>:<currency>` -
 *   the query groups by account + currency, so the same account in two
 *   currencies is two different facts; omitting the currency (the
 *   pre-review shape) collided them into one dedup identity and
 *   silently dropped a currency's balance. ERP-1's canonical mapping
 *   owns the final keys beyond this provisional form.
 * - `externalId` is THIS SNAPSHOT's idempotency identity:
 *   `account:<id>:<currency>:<asOf>` - re-delivering the same snapshot
 *   dedups, while the next day's snapshot of the same account+currency
 *   is a distinct fact, never swallowed as a re-delivery.
 * Period honesty: the amount is the cumulative posted total through
 * the sync instant, so `period`/`periodEnd` carry the as-of date and
 * `periodStart` stays absent (see ErpFinancialFact).
 * The envelope's hasMore is carried through truthfully - hard-coding
 * false here (the pre-review shape) silently truncated any grouped
 * result larger than one page.
 */
export function normalizeNetSuiteAccountActivityPage(
  envelope: SuiteQlEnvelope,
  connection: ErpConnectionContext,
  previous: ErpSyncCursor | null,
  syncDateIso: string,
): ErpFactPage {
  const items = envelope.items ?? [];
  if (envelope.hasMore === true && items.length === 0) {
    throw new ErpProviderRequestError(
      "NetSuiteAdapter: SuiteQL account-activity page claims hasMore but returned zero items - the snapshot cannot be completed, failing the run instead of emitting a partial one.",
    );
  }
  if (typeof envelope.totalResults === "number" && envelope.totalResults > NETSUITE_SUITEQL_RESULT_CAP) {
    throw new ErpProviderRequestError(
      `NetSuiteAdapter: account-activity result reports ${envelope.totalResults} grouped rows, beyond SuiteQL's documented ${NETSUITE_SUITEQL_RESULT_CAP}-row result cap - offset paging cannot be trusted to reach them all, failing the run instead of emitting a truncated snapshot.`,
    );
  }
  const syncTs = strictIsoTimestamp(syncDateIso);
  if (syncTs === null) {
    throw new ErpConfigurationError(`NetSuiteAdapter: sync instant "${syncDateIso}" is not an ISO timestamp - cannot date the snapshot.`);
  }
  const asOf = syncTs.slice(0, 10);
  const skipped: ErpSkippedRecord[] = [];
  const facts: ErpFinancialFact[] = [];

  for (const row of items) {
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
      externalId: `account:${accountId}:${currency}:${asOf}`,
      period: asOf,
      periodEnd: asOf,
      asOf,
      factKey: `account:${accountId}:${currency}`,
      amount,
      currency,
    });
  }

  const hasMore = envelope.hasMore === true;
  return {
    facts,
    hasMore,
    nextCursor: {
      version: 1,
      provider: "NETSUITE",
      stream: "FINANCIAL_FACTS",
      modifiedSince: syncTs,
      // Mid-snapshot offset lives only inside fetchFinancialFacts'
      // paging loop; a completed snapshot's cursor never carries one.
      ...(hasMore ? { offset: (previous?.offset ?? 0) + items.length } : {}),
    },
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
    const config = readNetSuiteConfig(connection);
    const scope = { subsidiaryId: config.subsidiaryId, accountingBookId: config.accountingBookId };
    // A cursor carrying an offset is a mid-run KEYSET continuation: its
    // (modifiedSince, lastExternalId) is the position to resume
    // strictly after, and the query - not the URL offset - does the
    // positioning. A continuation without its tiebreak is corrupt:
    // resuming from the timestamp alone could skip rows sharing it.
    const isContinuation = cursor?.offset !== undefined;
    if (isContinuation && cursor.lastExternalId === undefined) {
      throw new ErpConfigurationError(
        "NetSuiteAdapter.fetchTransactions: mid-run cursor carries an offset but no lastExternalId keyset tiebreak - refusing to resume from a position that cannot be stated exactly.",
      );
    }
    const syncStartedAt = (this.deps.now ? this.deps.now() : new Date()).toISOString();
    const query = isContinuation
      ? buildNetSuiteTransactionDeltaQuery("", {
          keysetAfter: { modifiedSinceIso: cursor.modifiedSince, lastExternalId: cursor.lastExternalId! },
          ...scope,
        })
      : buildNetSuiteTransactionDeltaQuery(cursorWindowStart(cursor, NETSUITE_EPOCH_ISO), scope);
    const envelope = await this.runSuiteQl(connection, token, query, 0, "SuiteQL transaction delta query");
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
    if (cursor?.offset !== undefined) {
      // Snapshot cursors are only ever handed back COMPLETED (no
      // offset). An offset here means a partial snapshot was persisted
      // by something else - resuming it would silently miss its first
      // pages' accounts, so the caller restarts from the last completed
      // cursor instead. Whole or not at all.
      throw new ErpConfigurationError(
        "NetSuiteAdapter.fetchFinancialFacts: cursor carries an offset - financial-facts snapshots are pulled whole in a single call and never persist a mid-run cursor. Refusing to resume a partial snapshot.",
      );
    }
    const config = readNetSuiteConfig(connection);
    // Snapshot semantics (see header): the cursor does not filter this
    // query; it is validated above and advanced to the sync instant.
    const syncStartedAt = (this.deps.now ? this.deps.now() : new Date()).toISOString();
    const query = buildNetSuiteAccountActivityQuery({ subsidiaryId: config.subsidiaryId, accountingBookId: config.accountingBookId });
    // Page through the WHOLE grouped result inside this call. A
    // snapshot is only meaningful complete - accounts on an unfetched
    // page would read as zero-activity - so any page failure propagates
    // and no partial page set is ever returned.
    const facts: ErpFinancialFact[] = [];
    const skipped: ErpSkippedRecord[] = [];
    const seenIdentities = new Set<string>();
    let pageCursor: ErpSyncCursor | null = cursor;
    let completedCursor: ErpSyncCursor | null = null;
    for (;;) {
      const envelope = await this.runSuiteQl(connection, token, query, pageCursor?.offset ?? 0, "SuiteQL account activity query");
      const page = normalizeNetSuiteAccountActivityPage(envelope, connection, pageCursor, syncStartedAt);
      for (const fact of page.facts) {
        if (seenIdentities.has(fact.externalId)) {
          throw new ErpProviderRequestError(
            `NetSuiteAdapter: account-activity snapshot returned the group "${fact.externalId}" twice while paging - the snapshot is internally inconsistent, failing the run instead of double-counting or dropping it.`,
          );
        }
        seenIdentities.add(fact.externalId);
        facts.push(fact);
      }
      skipped.push(...page.skipped);
      completedCursor = page.nextCursor;
      if (!page.hasMore) break;
      pageCursor = page.nextCursor;
    }
    return { facts, hasMore: false, nextCursor: completedCursor!, skipped };
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
