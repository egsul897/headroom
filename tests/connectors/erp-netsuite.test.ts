/**
 * NetSuite ERP adapter skeleton - the pure parts are real and pinned:
 * documented URL shapes, SuiteQL query builders, cursor advancement, and
 * fail-closed normalization of the documented SuiteQL response envelope
 * (a row with an unprovable amount/currency/date is SKIPPED with a
 * reason, never coerced to 0). Network execution is exercised only
 * through an injected fake fetch; with none injected the adapter throws
 * ErpLiveCallDisabledError - the scaffold makes no live calls.
 *
 * Fixtures are modeled on the documented SuiteQL envelope
 * ({ links, count, hasMore, items, totalResults, offset }) and the
 * SuiteAnalytics transaction/account-activity column sets named in
 * lib/connectors/erp/providers/netsuite.ts's header citations.
 */
import { describe, expect, it } from "vitest";
import {
  buildNetSuiteAccountActivityQuery,
  buildNetSuiteAuthorizationUrl,
  buildNetSuiteTransactionDeltaQuery,
  createNetSuiteAdapter,
  netSuiteSuiteQlUrl,
  netSuiteTokenEndpoint,
  normalizeNetSuiteAccountActivityPage,
  normalizeNetSuiteTransactionPage,
  readNetSuiteConfig,
  suiteQlDateLiteral,
  type SuiteQlEnvelope,
} from "../../lib/connectors/erp/providers/netsuite";
import {
  ErpConfigurationError,
  ErpLiveCallDisabledError,
  ErpProviderRequestError,
  type ErpConnectionContext,
  type ErpFetchImpl,
} from "../../lib/connectors/erp/types";

const CONNECTION: ErpConnectionContext = {
  connectionId: "conn_erp_1",
  companyId: "company_1",
  provider: "NETSUITE",
  config: { accountId: "1234567", redirectUri: "https://headroom.example/api/erp/netsuite/callback", clientId: "client-id-abc" },
  credentialRef: "HEADROOM_ERP_NETSUITE_CLIENT_SECRET",
};

const TOKEN = { accessToken: "access-token-xyz", expiresAt: "2999-01-01T00:00:00.000Z" };

describe("documented endpoint shapes", () => {
  it("builds the token endpoint on the suitetalk host", () => {
    expect(netSuiteTokenEndpoint("1234567")).toBe("https://1234567.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token");
  });

  it("builds the SuiteQL URL with limit/offset paging params", () => {
    expect(netSuiteSuiteQlUrl("1234567", { limit: 1000, offset: 2000 })).toBe(
      "https://1234567.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=1000&offset=2000",
    );
  });

  it("builds the authorization URL on the app host with the rest_webservices scope", () => {
    const url = buildNetSuiteAuthorizationUrl(readNetSuiteConfig(CONNECTION), "state-nonce-1");
    expect(url.startsWith("https://1234567.app.netsuite.com/app/login/oauth2/authorize.nl?")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("response_type")).toBe("code");
    expect(params.get("client_id")).toBe("client-id-abc");
    expect(params.get("redirect_uri")).toBe("https://headroom.example/api/erp/netsuite/callback");
    expect(params.get("scope")).toBe("rest_webservices");
    expect(params.get("state")).toBe("state-nonce-1");
  });

  it("fails closed on a connection missing its accountId", () => {
    const broken: ErpConnectionContext = { ...CONNECTION, config: { redirectUri: "x", clientId: "y" } };
    expect(() => readNetSuiteConfig(broken)).toThrow(ErpConfigurationError);
  });
});

describe("SuiteQL query builders", () => {
  it("renders the delta watermark as a TO_DATE literal in UTC", () => {
    expect(suiteQlDateLiteral("2026-10-17T14:30:05.000Z")).toBe("TO_DATE('2026-10-17 14:30:05', 'YYYY-MM-DD HH24:MI:SS')");
  });

  it("filters transactions on lastmodifieddate and orders ascending so the last page carries the watermark", () => {
    const q = buildNetSuiteTransactionDeltaQuery("2026-10-17T14:25:00.000Z");
    expect(q).toContain("FROM transaction t");
    expect(q).toContain("t.lastmodifieddate > TO_DATE('2026-10-17 14:25:00', 'YYYY-MM-DD HH24:MI:SS')");
    expect(q).toContain("ORDER BY t.lastmodifieddate, t.id");
  });

  it("aggregates transaction lines per account + currency for facts", () => {
    const q = buildNetSuiteAccountActivityQuery();
    expect(q).toContain("FROM transactionline tl");
    expect(q).toContain("SUM(tl.foreignamount) AS amount");
    expect(q).toContain("GROUP BY tl.account, c.symbol");
  });

  it("restricts BOTH queries to posting transactions - non-posting orders/estimates never reach the GL (Grok finding 3)", () => {
    expect(buildNetSuiteTransactionDeltaQuery("2026-10-17T14:25:00.000Z")).toContain("t.posting = 'T'");
    expect(buildNetSuiteAccountActivityQuery()).toContain("t.posting = 'T'");
  });

  it("selects dates through TO_CHAR ISO masks so responses never depend on the account's display format (Grok finding 4)", () => {
    const q = buildNetSuiteTransactionDeltaQuery("2026-10-17T14:25:00.000Z");
    expect(q).toContain("TO_CHAR(t.trandate, 'YYYY-MM-DD') AS trandate");
    expect(q).toContain("TO_CHAR(t.lastmodifieddate, 'YYYY-MM-DD HH24:MI:SS') AS lastmodifieddate");
  });

  it("orders the grouped facts result so offset paging over it is stable", () => {
    expect(buildNetSuiteAccountActivityQuery()).toContain("ORDER BY tl.account, c.symbol");
  });

  it("builds the keyset continuation predicate strictly after the (lastmodifieddate, id) position (Grok finding 6)", () => {
    const q = buildNetSuiteTransactionDeltaQuery("ignored-in-keyset-mode", {
      keysetAfter: { modifiedSinceIso: "2026-10-17T11:45:00.000Z", lastExternalId: "102" },
    });
    expect(q).toContain(
      "(t.lastmodifieddate > TO_DATE('2026-10-17 11:45:00', 'YYYY-MM-DD HH24:MI:SS') OR (t.lastmodifieddate = TO_DATE('2026-10-17 11:45:00', 'YYYY-MM-DD HH24:MI:SS') AND t.id > 102))",
    );
    expect(q).not.toContain("ignored");
  });

  it("refuses a non-numeric keyset tiebreak instead of interpolating it into SuiteQL", () => {
    expect(() =>
      buildNetSuiteTransactionDeltaQuery("2026-10-17T14:25:00.000Z", { keysetAfter: { modifiedSinceIso: "2026-10-17T11:45:00.000Z", lastExternalId: "102 OR 1=1" } }),
    ).toThrow(ErpConfigurationError);
  });

  it("scopes both queries when subsidiary / accounting book config is set, and refuses non-numeric scope ids", () => {
    const scope = { subsidiaryId: "3", accountingBookId: "2" };
    expect(buildNetSuiteTransactionDeltaQuery("2026-10-17T14:25:00.000Z", scope)).toContain("t.subsidiary = 3");
    expect(buildNetSuiteTransactionDeltaQuery("2026-10-17T14:25:00.000Z", scope)).toContain("t.accountingbook = 2");
    expect(buildNetSuiteAccountActivityQuery(scope)).toContain("t.subsidiary = 3");
    expect(() => buildNetSuiteAccountActivityQuery({ subsidiaryId: "3; DROP" })).toThrow(ErpConfigurationError);
  });
});

describe("accountId host allowlist (Grok finding 5)", () => {
  it("accepts NetSuite's documented subdomain forms", () => {
    for (const accountId of ["1234567", "1234567-sb1", "1234567-SB12", "1234567-rp", "1234567-rp2"]) {
      const conn: ErpConnectionContext = { ...CONNECTION, config: { ...CONNECTION.config, accountId } };
      expect(readNetSuiteConfig(conn).accountId).toBe(accountId);
    }
  });

  it("refuses hostile or malformed account ids - the id becomes the host that receives the client secret", () => {
    for (const accountId of ["evil.example/x#", "1234567.evil.com", "1234567@evil.com", "1234567_SB1", "1234567-sb", "abc", "1234567/..", ""]) {
      const conn: ErpConnectionContext = { ...CONNECTION, config: { ...CONNECTION.config, accountId } };
      expect(() => readNetSuiteConfig(conn), accountId).toThrow(ErpConfigurationError);
    }
  });

  it("makes the raw URL builders refuse a hostile id too, and refuses before any fetch in the adapter", async () => {
    expect(() => netSuiteTokenEndpoint("evil.example/x#")).toThrow(ErpConfigurationError);
    expect(() => netSuiteSuiteQlUrl("1234567.evil.com", { limit: 1, offset: 0 })).toThrow(ErpConfigurationError);
    let calls = 0;
    const adapter = createNetSuiteAdapter({
      fetchImpl: async () => {
        calls += 1;
        return { status: 200, text: "{}" };
      },
      resolveSecret: () => "the-secret",
    });
    const hostile: ErpConnectionContext = { ...CONNECTION, config: { ...CONNECTION.config, accountId: "evil.example/x#" } };
    await expect(adapter.exchangeAuthorizationCode(hostile, "auth-code-1")).rejects.toThrow(ErpConfigurationError);
    expect(calls).toBe(0);
  });

  it("reads optional subsidiary/book scope from config and refuses non-numeric values there", () => {
    const scoped: ErpConnectionContext = { ...CONNECTION, config: { ...CONNECTION.config, subsidiaryId: "3", accountingBookId: 2 } };
    expect(readNetSuiteConfig(scoped)).toMatchObject({ subsidiaryId: "3", accountingBookId: "2" });
    const bad: ErpConnectionContext = { ...CONNECTION, config: { ...CONNECTION.config, subsidiaryId: "3 OR 1=1" } };
    expect(() => readNetSuiteConfig(bad)).toThrow(ErpConfigurationError);
  });
});

describe("strict date parsing (Grok finding 4)", () => {
  const row = (over: Record<string, unknown>) => ({
    id: 301,
    trandate: "2026-10-15",
    type: "Journal",
    lastmodifieddate: "2026-10-16T09:00:00.000Z",
    foreigntotal: 10,
    currencysymbol: "USD",
    ...over,
  });

  it("skips a DD/MM-shaped trandate instead of letting Date.parse silently move the day", () => {
    const page = normalizeNetSuiteTransactionPage({ hasMore: false, items: [row({ trandate: "15/10/2026" })] }, CONNECTION, null, "2026-10-17T12:00:00.000Z");
    expect(page.transactions).toHaveLength(0);
    expect(page.skipped).toHaveLength(1);
    expect(page.skipped[0]!.reason).toContain("strict ISO");
  });

  it("skips an MM/DD-shaped datetime outright - slash forms are unprovable in either reading", () => {
    const page = normalizeNetSuiteTransactionPage(
      { hasMore: false, items: [row({ lastmodifieddate: "10/15/2026 09:00:00" })] },
      CONNECTION,
      null,
      "2026-10-17T12:00:00.000Z",
    );
    expect(page.transactions).toHaveLength(0);
    expect(page.skipped).toHaveLength(1);
  });

  it("reads the zone-less TO_CHAR wall time as UTC - the same convention the watermark literal renders with", () => {
    const page = normalizeNetSuiteTransactionPage(
      { hasMore: false, items: [row({ lastmodifieddate: "2026-10-16 09:00:00" })] },
      CONNECTION,
      null,
      "2026-10-17T12:00:00.000Z",
    );
    expect(page.skipped).toHaveLength(0);
    expect(page.transactions[0]!.lastModifiedAt).toBe("2026-10-16T09:00:00.000Z");
    expect(page.nextCursor.modifiedSince).toBe("2026-10-16T09:00:00.000Z");
  });

  it("throws when a page claims hasMore but delivers nothing to advance on", () => {
    expect(() => normalizeNetSuiteTransactionPage({ hasMore: true, items: [] }, CONNECTION, null, "2026-10-17T12:00:00.000Z")).toThrow(
      ErpProviderRequestError,
    );
  });
});

const TXN_ENVELOPE: SuiteQlEnvelope = {
  links: [{ rel: "self", href: "https://1234567.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql" }],
  count: 2,
  hasMore: false,
  totalResults: 2,
  offset: 0,
  items: [
    { id: 101, tranid: "JE-1", trandate: "2026-10-15", type: "Journal", lastmodifieddate: "2026-10-16T09:00:00.000Z", foreigntotal: 2500000, memo: "Term loan draw", currencysymbol: "USD" },
    { id: 102, tranid: "VB-9", trandate: "2026-10-16", type: "VendBill", lastmodifieddate: "2026-10-17T11:45:00.000Z", foreigntotal: "12500.50", memo: "", currencysymbol: "usd" },
  ],
};

describe("normalizeNetSuiteTransactionPage", () => {
  it("normalizes documented rows into ERP provenance-carrying transactions", () => {
    const page = normalizeNetSuiteTransactionPage(TXN_ENVELOPE, CONNECTION, null, "2026-10-17T12:00:00.000Z");
    expect(page.skipped).toHaveLength(0);
    expect(page.hasMore).toBe(false);
    expect(page.transactions).toHaveLength(2);
    expect(page.transactions[0]).toEqual({
      source: "ERP",
      provider: "NETSUITE",
      connectionId: "conn_erp_1",
      externalId: "101",
      providerType: "Journal",
      date: "2026-10-15",
      lastModifiedAt: "2026-10-16T09:00:00.000Z",
      amount: 2500000,
      currency: "USD",
      memo: "Term loan draw",
    });
    // String amounts are parsed, currency symbols upper-cased, empty memo dropped.
    expect(page.transactions[1]).toMatchObject({ externalId: "102", amount: 12500.5, currency: "USD" });
    expect(page.transactions[1]!.memo).toBeUndefined();
  });

  it("advances the watermark to the max lastmodifieddate on the final page", () => {
    const page = normalizeNetSuiteTransactionPage(TXN_ENVELOPE, CONNECTION, null, "2026-10-17T12:00:00.000Z");
    expect(page.nextCursor).toEqual({
      version: 1,
      provider: "NETSUITE",
      stream: "TRANSACTIONS",
      modifiedSince: "2026-10-17T11:45:00.000Z",
      lastExternalId: "102",
    });
  });

  it("advances the keyset position (greatest row seen) while hasMore - the mid-run cursor is a position, not the frozen watermark", () => {
    // Behavior changed by the Grok cross-review fix (finding 6): mid-run
    // pages used to keep the original watermark and page by offset, so a
    // row mutated mid-sync could shift across an offset page boundary
    // and be skipped permanently. The mid-run cursor now carries the
    // keyset position; the COMPLETED cursor's watermark semantics are
    // unchanged (see the final-page test above).
    const previous = { version: 1 as const, provider: "NETSUITE" as const, stream: "TRANSACTIONS" as const, modifiedSince: "2026-10-01T00:00:00.000Z", offset: 1000 };
    const page = normalizeNetSuiteTransactionPage({ ...TXN_ENVELOPE, hasMore: true }, CONNECTION, previous, "2026-10-17T12:00:00.000Z");
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor.modifiedSince).toBe("2026-10-17T11:45:00.000Z");
    expect(page.nextCursor.lastExternalId).toBe("102");
    // Offset survives only as the in-flight marker / row counter: it
    // advances by rows actually consumed (2 in this fixture), not by
    // the page-size constant, and never positions a query.
    expect(page.nextCursor.offset).toBe(1002);
  });

  it("skips rows whose amount or currency cannot be proven - never coerces to 0", () => {
    const envelope: SuiteQlEnvelope = {
      hasMore: false,
      items: [
        { id: 201, trandate: "2026-10-15", type: "Journal", lastmodifieddate: "2026-10-16T09:00:00.000Z", foreigntotal: null, currencysymbol: "USD" },
        { id: 202, trandate: "2026-10-15", type: "Journal", lastmodifieddate: "2026-10-16T09:00:00.000Z", foreigntotal: 10, currencysymbol: "US" },
        { trandate: "2026-10-15", type: "Journal", lastmodifieddate: "2026-10-16T09:00:00.000Z", foreigntotal: 10, currencysymbol: "USD" },
      ],
    };
    const page = normalizeNetSuiteTransactionPage(envelope, CONNECTION, null, "2026-10-17T12:00:00.000Z");
    expect(page.transactions).toHaveLength(0);
    expect(page.skipped).toHaveLength(3);
    expect(page.skipped.map((s) => s.externalId)).toEqual(["201", "202", null]);
  });
});

describe("normalizeNetSuiteAccountActivityPage", () => {
  it("emits snapshot facts whose identity carries account + currency, with the asOf in the idempotency identity", () => {
    const envelope: SuiteQlEnvelope = {
      hasMore: false,
      items: [
        { accountid: 55, currencysymbol: "USD", amount: 60250000 },
        { accountid: 77, currencysymbol: "EUR", amount: "not-a-number" },
      ],
    };
    const page = normalizeNetSuiteAccountActivityPage(envelope, CONNECTION, null, "2026-10-17T12:00:00.000Z");
    expect(page.hasMore).toBe(false);
    expect(page.facts).toEqual([
      {
        source: "ERP",
        provider: "NETSUITE",
        connectionId: "conn_erp_1",
        // Grok cross-review finding 2: factKey is account + currency (the
        // query's grouping); externalId adds the snapshot asOf so the
        // next day's snapshot is a distinct fact, not a re-delivery.
        externalId: "account:55:USD:2026-10-17",
        period: "2026-10-17",
        periodEnd: "2026-10-17",
        asOf: "2026-10-17",
        factKey: "account:55:USD",
        amount: 60250000,
        currency: "USD",
      },
    ]);
    // Cumulative balance, honestly labeled: periodEnd set, NO periodStart.
    expect(page.facts[0]).not.toHaveProperty("periodStart");
    expect(page.skipped).toHaveLength(1);
    expect(page.nextCursor.stream).toBe("FINANCIAL_FACTS");
  });

  it("keeps the same account in two currencies as two distinct facts (no dedup collision)", () => {
    const envelope: SuiteQlEnvelope = {
      hasMore: false,
      items: [
        { accountid: 55, currencysymbol: "USD", amount: 100 },
        { accountid: 55, currencysymbol: "EUR", amount: 200 },
      ],
    };
    const page = normalizeNetSuiteAccountActivityPage(envelope, CONNECTION, null, "2026-10-17T12:00:00.000Z");
    expect(page.facts.map((f) => f.externalId)).toEqual(["account:55:USD:2026-10-17", "account:55:EUR:2026-10-17"]);
    expect(page.facts.map((f) => f.factKey)).toEqual(["account:55:USD", "account:55:EUR"]);
  });

  it("carries the envelope's hasMore truthfully and advances the snapshot offset", () => {
    const envelope: SuiteQlEnvelope = { hasMore: true, items: [{ accountid: 55, currencysymbol: "USD", amount: 100 }] };
    const page = normalizeNetSuiteAccountActivityPage(envelope, CONNECTION, null, "2026-10-17T12:00:00.000Z");
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor.offset).toBe(1);
  });

  it("fails the run when the grouped result exceeds SuiteQL's documented result cap", () => {
    const envelope: SuiteQlEnvelope = { hasMore: false, totalResults: 100_001, items: [] };
    expect(() => normalizeNetSuiteAccountActivityPage(envelope, CONNECTION, null, "2026-10-17T12:00:00.000Z")).toThrow(/result cap/);
  });
});

describe("adapter behavior with injected fetch", () => {
  const jsonFetch =
    (payload: unknown, capture?: (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => void): ErpFetchImpl =>
    async (url, init) => {
      capture?.(url, init);
      return { status: 200, text: JSON.stringify(payload) };
    };

  it("exchanges an authorization code at the documented token endpoint with Basic client auth", async () => {
    let seenUrl = "";
    let seenInit: { method: string; headers: Record<string, string>; body?: string } | null = null;
    const adapter = createNetSuiteAdapter({
      fetchImpl: jsonFetch({ access_token: "tok-1", refresh_token: "ref-1", expires_in: 3600, scope: "rest_webservices" }, (url, init) => {
        seenUrl = url;
        seenInit = init;
      }),
      resolveSecret: (ref) => (ref === "HEADROOM_ERP_NETSUITE_CLIENT_SECRET" ? "the-secret" : undefined),
      now: () => new Date("2026-10-17T12:00:00.000Z"),
    });
    const token = await adapter.exchangeAuthorizationCode(CONNECTION, "auth-code-1");
    expect(seenUrl).toBe("https://1234567.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token");
    expect(seenInit!.method).toBe("POST");
    expect(seenInit!.headers.Authorization).toBe(`Basic ${Buffer.from("client-id-abc:the-secret", "utf8").toString("base64")}`);
    const form = new URLSearchParams(seenInit!.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("auth-code-1");
    expect(form.get("redirect_uri")).toBe("https://headroom.example/api/erp/netsuite/callback");
    expect(token).toEqual({
      accessToken: "tok-1",
      refreshToken: "ref-1",
      expiresAt: "2026-10-17T13:00:00.000Z",
      scope: "rest_webservices",
    });
  });

  it("fails closed when the credentialRef does not resolve - no token request is attempted", async () => {
    let calls = 0;
    const adapter = createNetSuiteAdapter({
      fetchImpl: async () => {
        calls += 1;
        return { status: 200, text: "{}" };
      },
      resolveSecret: () => undefined,
    });
    await expect(adapter.exchangeAuthorizationCode(CONNECTION, "auth-code-1")).rejects.toThrow(ErpConfigurationError);
    expect(calls).toBe(0);
  });

  it("fetches a transaction page through the injected fetch and normalizes it", async () => {
    let seenUrl = "";
    let seenBody = "";
    const adapter = createNetSuiteAdapter({
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenBody = init.body ?? "";
        return { status: 200, text: JSON.stringify(TXN_ENVELOPE) };
      },
      now: () => new Date("2026-10-17T12:00:00.000Z"),
    });
    const page = await adapter.fetchTransactions(CONNECTION, TOKEN, null);
    expect(seenUrl).toContain("/services/rest/query/v1/suiteql?limit=1000&offset=0");
    expect(JSON.parse(seenBody).q).toContain("FROM transaction t");
    expect(page.transactions).toHaveLength(2);
    expect(page.nextCursor.modifiedSince).toBe("2026-10-17T11:45:00.000Z");
  });

  it("rejects a cursor minted for the wrong stream", async () => {
    const adapter = createNetSuiteAdapter({ fetchImpl: jsonFetch(TXN_ENVELOPE) });
    const factsCursor = { version: 1 as const, provider: "NETSUITE" as const, stream: "FINANCIAL_FACTS" as const, modifiedSince: "2026-10-01T00:00:00.000Z" };
    await expect(adapter.fetchTransactions(CONNECTION, TOKEN, factsCursor)).rejects.toThrow(ErpConfigurationError);
  });

  it("resumes a mid-run transactions cursor by KEYSET - the query carries the position, the URL offset stays 0 (Grok finding 6)", async () => {
    let seenUrl = "";
    let seenBody = "";
    const adapter = createNetSuiteAdapter({
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenBody = init.body ?? "";
        return { status: 200, text: JSON.stringify({ hasMore: false, items: [] }) };
      },
      now: () => new Date("2026-10-17T12:00:00.000Z"),
    });
    const continuation = {
      version: 1 as const,
      provider: "NETSUITE" as const,
      stream: "TRANSACTIONS" as const,
      modifiedSince: "2026-10-17T11:45:00.000Z",
      lastExternalId: "102",
      offset: 2000,
    };
    await adapter.fetchTransactions(CONNECTION, TOKEN, continuation);
    expect(seenUrl).toContain("offset=0");
    expect(JSON.parse(seenBody).q).toContain("AND t.id > 102");
  });

  it("refuses a mid-run transactions cursor that lost its keyset tiebreak", async () => {
    const adapter = createNetSuiteAdapter({ fetchImpl: jsonFetch(TXN_ENVELOPE) });
    const corrupt = {
      version: 1 as const,
      provider: "NETSUITE" as const,
      stream: "TRANSACTIONS" as const,
      modifiedSince: "2026-10-17T11:45:00.000Z",
      offset: 2000,
    };
    await expect(adapter.fetchTransactions(CONNECTION, TOKEN, corrupt)).rejects.toThrow(ErpConfigurationError);
  });
});

describe("adapter fetchFinancialFacts - whole-snapshot paging (Grok finding 1)", () => {
  const factsFetch =
    (pages: Array<{ status?: number; payload?: unknown }>, seenOffsets: number[]): ErpFetchImpl =>
    async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      seenOffsets.push(offset);
      const page = pages[seenOffsets.length - 1] ?? { payload: { hasMore: false, items: [] } };
      return { status: page.status ?? 200, text: JSON.stringify(page.payload ?? {}) };
    };

  it("pages through envelope.hasMore inside one call and returns the COMPLETE snapshot", async () => {
    const seenOffsets: number[] = [];
    const adapter = createNetSuiteAdapter({
      fetchImpl: factsFetch(
        [
          { payload: { hasMore: true, totalResults: 2, items: [{ accountid: 55, currencysymbol: "USD", amount: 100 }] } },
          { payload: { hasMore: false, totalResults: 2, items: [{ accountid: 77, currencysymbol: "EUR", amount: 200 }] } },
        ],
        seenOffsets,
      ),
      now: () => new Date("2026-10-17T12:00:00.000Z"),
    });
    const page = await adapter.fetchFinancialFacts(CONNECTION, TOKEN, null);
    // Second page is addressed by rows consumed on the first (1), not by
    // a page-size constant.
    expect(seenOffsets).toEqual([0, 1]);
    expect(page.hasMore).toBe(false);
    expect(page.facts.map((f) => f.externalId)).toEqual(["account:55:USD:2026-10-17", "account:77:EUR:2026-10-17"]);
    expect(page.nextCursor.offset).toBeUndefined();
  });

  it("fails the whole fetch when a later page fails - no partial snapshot is emitted", async () => {
    const seenOffsets: number[] = [];
    const adapter = createNetSuiteAdapter({
      fetchImpl: factsFetch(
        [
          { payload: { hasMore: true, items: [{ accountid: 55, currencysymbol: "USD", amount: 100 }] } },
          { status: 500, payload: {} },
        ],
        seenOffsets,
      ),
      now: () => new Date("2026-10-17T12:00:00.000Z"),
    });
    await expect(adapter.fetchFinancialFacts(CONNECTION, TOKEN, null)).rejects.toThrow(ErpProviderRequestError);
    expect(seenOffsets).toEqual([0, 1]);
  });

  it("fails the run when the same account+currency group appears on two pages", async () => {
    const seenOffsets: number[] = [];
    const adapter = createNetSuiteAdapter({
      fetchImpl: factsFetch(
        [
          { payload: { hasMore: true, items: [{ accountid: 55, currencysymbol: "USD", amount: 100 }] } },
          { payload: { hasMore: false, items: [{ accountid: 55, currencysymbol: "USD", amount: 100 }] } },
        ],
        seenOffsets,
      ),
      now: () => new Date("2026-10-17T12:00:00.000Z"),
    });
    await expect(adapter.fetchFinancialFacts(CONNECTION, TOKEN, null)).rejects.toThrow(/twice while paging/);
  });

  it("refuses to resume a facts cursor carrying an offset - snapshots restart whole or not at all", async () => {
    const adapter = createNetSuiteAdapter({ fetchImpl: factsFetch([], []) });
    const partial = {
      version: 1 as const,
      provider: "NETSUITE" as const,
      stream: "FINANCIAL_FACTS" as const,
      modifiedSince: "2026-10-17T12:00:00.000Z",
      offset: 1000,
    };
    await expect(adapter.fetchFinancialFacts(CONNECTION, TOKEN, partial)).rejects.toThrow(ErpConfigurationError);
  });
});

describe("scaffold inertness and webhook posture", () => {
  it("throws ErpLiveCallDisabledError for live operations when no fetch is injected", async () => {
    const adapter = createNetSuiteAdapter({ resolveSecret: () => "s" });
    await expect(adapter.fetchTransactions(CONNECTION, TOKEN, null)).rejects.toThrow(ErpLiveCallDisabledError);
    await expect(adapter.exchangeAuthorizationCode(CONNECTION, "code")).rejects.toThrow(ErpLiveCallDisabledError);
  });

  it("reports webhooks UNSUPPORTED - NetSuite sync is polling-only, and forged webhooks must not be trusted", () => {
    const adapter = createNetSuiteAdapter();
    expect(adapter.descriptor.changeNotification).toBe("POLLING_ONLY");
    expect(adapter.verifyWebhookSignature(CONNECTION, { headers: {}, rawBody: "{}" })).toEqual({
      outcome: "UNSUPPORTED",
      reason: expect.stringContaining("no native outbound webhooks"),
    });
  });

  it("healthCheck maps a failed probe to ok:false instead of throwing", async () => {
    const adapter = createNetSuiteAdapter({
      fetchImpl: async () => ({ status: 401, text: "unauthorized" }),
    });
    const health = await adapter.healthCheck(CONNECTION, TOKEN);
    expect(health.ok).toBe(false);
    expect(health.message).toContain("401");
  });
});
