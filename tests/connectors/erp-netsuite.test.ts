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
import { ErpConfigurationError, ErpLiveCallDisabledError, type ErpConnectionContext, type ErpFetchImpl } from "../../lib/connectors/erp/types";

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

  it("keeps the original watermark and pages by offset while hasMore", () => {
    const previous = { version: 1 as const, provider: "NETSUITE" as const, stream: "TRANSACTIONS" as const, modifiedSince: "2026-10-01T00:00:00.000Z", offset: 1000 };
    const page = normalizeNetSuiteTransactionPage({ ...TXN_ENVELOPE, hasMore: true }, CONNECTION, previous, "2026-10-17T12:00:00.000Z");
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor.modifiedSince).toBe("2026-10-01T00:00:00.000Z");
    // Offset advances by rows actually consumed (2 in this fixture), not
    // by the page-size constant.
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
  it("emits snapshot facts with provisional account factKeys and full provenance", () => {
    const envelope: SuiteQlEnvelope = {
      hasMore: false,
      items: [
        { accountid: 55, currencysymbol: "USD", amount: 60250000 },
        { accountid: 77, currencysymbol: "EUR", amount: "not-a-number" },
      ],
    };
    const page = normalizeNetSuiteAccountActivityPage(envelope, CONNECTION, "2026-10-17T12:00:00.000Z");
    expect(page.hasMore).toBe(false);
    expect(page.facts).toEqual([
      {
        source: "ERP",
        provider: "NETSUITE",
        connectionId: "conn_erp_1",
        externalId: "account:55",
        period: "2026-10-17",
        asOf: "2026-10-17",
        factKey: "account:55",
        amount: 60250000,
        currency: "USD",
      },
    ]);
    expect(page.skipped).toHaveLength(1);
    expect(page.nextCursor.stream).toBe("FINANCIAL_FACTS");
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
