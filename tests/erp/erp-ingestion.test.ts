/**
 * ERP-1 ingestion foundation (lib/erp/**).
 *
 * Runs the REAL pipeline - createErpConnection, ingestErpFinancialFacts,
 * and lib/onboarding/financial.ts's upsertFinancialFactsForDate (the
 * canonical writer) - against an in-memory Prisma fake, because this
 * environment has no Postgres. The fake implements only the delegates the
 * pipeline touches, with the same semantics the writer relies on (exact
 * (companyId, asOfDate) matching, unique (connectionId, idempotencyKey)
 * with NULL keys distinct). DB-level enforcement (FKs, the unique index
 * under concurrency, Decimal precision) is covered by the migration +
 * Prisma schema and runs in CI's Postgres-backed suites.
 *
 * Pins the foundation's contract:
 *  - identity safety: an ERP delivery can never create a duplicate
 *    same-date FinancialState, and a conflicting restatement fails closed;
 *  - idempotency: re-delivery is a no-op, never a duplicate state;
 *  - auth: per-connection token hash, company scope from the connection;
 *  - honesty: unmapped keys stored verbatim + surfaced, never guessed;
 *    every attempt (accepted AND refused) lands in the sync audit.
 */
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createErpConnection, ErpConnectionExistsError, rotateErpConnectionSecret, UnsupportedErpConfigError } from "../../lib/erp/connections";
import { ingestErpFinancialFacts, parseErpPayload } from "../../lib/erp/ingest";
import { listErpFactsNeedingAttention, listErpSyncEvents } from "../../lib/erp/queries";
import { erpTokenFromHeaders, generateErpSecret, hashErpSecret, verifyErpSecret } from "../../lib/erp/secret";
import type { ErpFinancialFactInput, ErpFinancialFactsPayload } from "../../lib/erp/types";
import type { FinancialUnit } from "../../lib/connectors/units";

// ---------------------------------------------------------------------------
// In-memory Prisma fake
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v instanceof Date) return row[k] instanceof Date && row[k].getTime() === v.getTime();
    if (v && typeof v === "object") {
      if ("not" in v) return v.not === null ? row[k] != null : row[k] !== v.not;
      if ("in" in v) return (v.in as unknown[]).includes(row[k]);
      return false;
    }
    return row[k] === v;
  });
}

function makeFakeDb() {
  const store = {
    connections: [] as Row[],
    events: [] as Row[],
    facts: [] as Row[],
    snapshots: [] as Row[],
    states: [] as Row[],
  };
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;
  const nextSeq = () => ++seq;
  const now = () => new Date();

  const db: any = {
    companySourceConnection: {
      findUnique: async ({ where }: any) => {
        if (where.id) return store.connections.find((c) => c.id === where.id) ?? null;
        if (where.companyId_connectorType) {
          const { companyId, connectorType } = where.companyId_connectorType;
          return store.connections.find((c) => c.companyId === companyId && c.connectorType === connectorType) ?? null;
        }
        return null;
      },
      create: async ({ data }: any) => {
        const row = { id: nextId("conn"), createdAt: now(), updatedAt: now(), errorState: null, cursor: null, lastSuccessfulSyncAt: null, enabled: true, credentialRef: null, ...data };
        store.connections.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = store.connections.find((c) => c.id === where.id);
        if (!row) throw new Error("connection not found");
        Object.assign(row, data, { updatedAt: now() });
        return row;
      },
    },
    erpSyncEvent: {
      findUnique: async ({ where }: any) => {
        if (where.id) return store.events.find((e) => e.id === where.id) ?? null;
        if (where.connectionId_idempotencyKey) {
          const { connectionId, idempotencyKey } = where.connectionId_idempotencyKey;
          return store.events.find((e) => e.connectionId === connectionId && e.idempotencyKey !== null && e.idempotencyKey === idempotencyKey) ?? null;
        }
        return null;
      },
      findMany: async ({ where, orderBy, take }: any = {}) => {
        let rows = store.events.filter((e) => matches(e, where ?? {}));
        if (orderBy?.receivedAt === "desc") rows = [...rows].sort((a, b) => b._seq - a._seq);
        if (orderBy?.receivedAt === "asc") rows = [...rows].sort((a, b) => a._seq - b._seq);
        return take ? rows.slice(0, take) : rows;
      },
      create: async ({ data }: any) => {
        const row = {
          id: nextId("evt"),
          _seq: nextSeq(),
          receivedAt: now(),
          externalEventId: null,
          idempotencyKey: null,
          duplicateOfEventId: null,
          payload: null,
          detail: null,
          needsAttention: false,
          appliedCount: 0,
          conflictCount: 0,
          unmappedCount: 0,
          withheldCount: 0,
          ...data,
        };
        store.events.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = store.events.find((e) => e.id === where.id);
        if (!row) throw new Error("event not found");
        Object.assign(row, data);
        return row;
      },
    },
    erpFinancialFact: {
      create: async ({ data }: any) => {
        const row = { id: nextId("fact"), _seq: nextSeq(), createdAt: now(), updatedAt: now(), ...data };
        store.facts.push(row);
        return row;
      },
      findMany: async ({ where, orderBy }: any = {}) => {
        let rows = store.facts.filter((f) => matches(f, where ?? {}));
        if (orderBy?.createdAt === "asc") rows = [...rows].sort((a, b) => a._seq - b._seq);
        return rows;
      },
      update: async ({ where, data }: any) => {
        const row = store.facts.find((f) => f.id === where.id);
        if (!row) throw new Error("fact not found");
        Object.assign(row, data, { updatedAt: now() });
        return row;
      },
    },
    financialSnapshot: {
      findMany: async ({ where }: any) => store.snapshots.filter((s) => matches(s, where ?? {})),
      create: async ({ data }: any) => {
        const row = { id: nextId("snap"), createdAt: now(), ...data };
        store.snapshots.push(row);
        return row;
      },
    },
    financialState: {
      findMany: async ({ where }: any) => store.states.filter((s) => matches(s, where ?? {})),
      create: async ({ data }: any) => {
        const row = { id: nextId("state"), createdAt: now(), updatedAt: now(), ...data };
        store.states.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = store.states.find((s) => s.id === where.id);
        if (!row) throw new Error("state not found");
        Object.assign(row, data, { updatedAt: now() });
        return row;
      },
    },
    $transaction: async (fn: any) => fn(db),
  };
  return { db: db as unknown as PrismaClient, store };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPANY_A = "co-erp-a";
const COMPANY_B = "co-erp-b";
const AS_OF = "2026-06-30";

/** The full 8-metric promotable set, declared in raw USD + PERCENT (canonical $M values: 4.2 / 52 / 30 / 18 / 2.1 / 9 / 5 / 7.5). */
function completeFacts(overrides: Record<string, number> = {}): ErpFinancialFactInput[] {
  const values: Record<string, { value: number; unit: FinancialUnit }> = {
    cash: { value: 4_200_000, unit: "USD" },
    total_debt: { value: 52_000_000, unit: "USD" },
    secured_debt: { value: 30_000_000, unit: "USD" },
    covenant_ebitda: { value: 18_000_000, unit: "USD" },
    interest_expense: { value: 2_100_000, unit: "USD" },
    cumulative_net_income: { value: 9_000_000, unit: "USD" },
    equity_proceeds: { value: 5_000_000, unit: "USD" },
    assumed_new_debt_rate_pct: { value: 7.5, unit: "PERCENT" },
  };
  for (const [k, v] of Object.entries(overrides)) values[k] = { value: v, unit: values[k]?.unit ?? "USD" };
  return Object.entries(values).map(([key, { value, unit }]) => ({ key, value, unit, externalId: `je-${key}-1` }));
}

function body(payload: ErpFinancialFactsPayload): string {
  return JSON.stringify(payload);
}

async function setupConnection(db: PrismaClient, companyId = COMPANY_A, metricKeyMap?: Record<string, string>) {
  return createErpConnection({ companyId, providerKind: "NETSUITE", externalAccountRef: "NS-12345", metricKeyMap, createdBy: "user-1" }, db);
}

// ---------------------------------------------------------------------------
// Secrets (pure)
// ---------------------------------------------------------------------------

describe("erp secret", () => {
  it("hash/verify roundtrip; wrong token and malformed stored hash fail closed", () => {
    const { secret, secretHash } = generateErpSecret();
    expect(secret.startsWith("hrp_erp_")).toBe(true);
    expect(secretHash).toBe(hashErpSecret(secret));
    expect(secretHash).not.toContain(secret);
    expect(verifyErpSecret(secret, secretHash)).toBe(true);
    expect(verifyErpSecret("hrp_erp_wrong", secretHash)).toBe(false);
    expect(verifyErpSecret(null, secretHash)).toBe(false);
    expect(verifyErpSecret(secret, null)).toBe(false);
    expect(verifyErpSecret(secret, "not-hex")).toBe(false);
  });

  it("extracts the token from Authorization Bearer or the explicit header only", () => {
    const headers = (record: Record<string, string>) => ({ get: (n: string) => record[n.toLowerCase()] ?? null });
    expect(erpTokenFromHeaders(headers({ authorization: "Bearer abc" }))).toBe("abc");
    expect(erpTokenFromHeaders(headers({ "x-headroom-erp-token": "xyz" }))).toBe("xyz");
    expect(erpTokenFromHeaders(headers({}))).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Payload validation (pure)
// ---------------------------------------------------------------------------

describe("parseErpPayload", () => {
  it("accepts a well-formed delivery and lands a bare date at UTC midnight", () => {
    const parsed = parseErpPayload({ asOfDate: AS_OF, facts: completeFacts() });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.asOfDate.toISOString()).toBe("2026-06-30T00:00:00.000Z");
  });

  it("refuses impossible dates, missing/undeclared units, empty facts, and non-finite values", () => {
    expect(parseErpPayload({ asOfDate: "2026-02-31", facts: completeFacts() }).ok).toBe(false);
    expect(parseErpPayload({ asOfDate: AS_OF, facts: [{ key: "cash", value: 1 }] }).ok).toBe(false);
    expect(parseErpPayload({ asOfDate: AS_OF, facts: [{ key: "cash", value: 1, unit: "BTC" }] }).ok).toBe(false);
    expect(parseErpPayload({ asOfDate: AS_OF, facts: [] }).ok).toBe(false);
    expect(parseErpPayload({ asOfDate: AS_OF, facts: [{ key: "cash", value: Number.NaN, unit: "USD" }] }).ok).toBe(false);
    expect(parseErpPayload("nonsense").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Connection provisioning
// ---------------------------------------------------------------------------

describe("createErpConnection", () => {
  it("stores only the token hash; provider kind is data; a second ERP connection fails closed", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    expect(connection.connectorType).toBe("ERP");
    expect(connection.provider).toBe("NETSUITE");
    expect(connection.externalAccountRef).toBe("NS-12345");
    expect(connection.inboundSecretHash).toBe(hashErpSecret(secret));
    expect(JSON.stringify(store.connections)).not.toContain(secret);
    await expect(setupConnection(db)).rejects.toBeInstanceOf(ErpConnectionExistsError);
  });

  it("refuses a metricKeyMap pointing at a non-canonical metric", async () => {
    const { db } = makeFakeDb();
    await expect(
      createErpConnection({ companyId: COMPANY_A, providerKind: "SAP", metricKeyMap: { "1000": "made_up_metric" } }, db),
    ).rejects.toBeInstanceOf(UnsupportedErpConfigError);
  });

  it("secret rotation: the old token dies, the new token works", async () => {
    const { db } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const rotated = await rotateErpConnectionSecret({ connectionId: connection.id, updatedBy: "user-2" }, db);
    const raw = body({ asOfDate: AS_OF, facts: completeFacts() });
    const withOld = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: raw, presentedToken: secret, idempotencyKey: "k-old", client: db });
    expect(withOld.status).toBe(401);
    const withNew = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: raw, presentedToken: rotated.secret, idempotencyKey: "k-new", client: db });
    expect(withNew.outcome).toBe("APPLIED");
  });
});

// ---------------------------------------------------------------------------
// Ingestion: happy path + identity safety
// ---------------------------------------------------------------------------

describe("ingestErpFinancialFacts", () => {
  it("applies a complete delivery into exactly ONE snapshot + ONE state, values normalized to $M, provenance on every fact", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const result = await ingestErpFinancialFacts({
      connectionId: connection.id,
      rawBody: body({ asOfDate: AS_OF, externalEventId: "close-2026-06", facts: completeFacts() }),
      presentedToken: secret,
      idempotencyKey: "delivery-1",
      client: db,
    });
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("APPLIED");
    expect(result.counts).toEqual({ applied: 8, conflicted: 0, unmapped: 0, withheld: 0 });

    expect(store.snapshots).toHaveLength(1);
    expect(store.states).toHaveLength(1);
    expect(Number(store.snapshots[0]!.cash)).toBe(4.2);
    expect(Number(store.snapshots[0]!.totalDebt)).toBe(52);
    expect(Number(store.snapshots[0]!.ebitda)).toBe(18);
    expect(Number(store.snapshots[0]!.assumedNewDebtRatePct)).toBe(7.5);
    expect(store.snapshots[0]!.companyId).toBe(COMPANY_A);

    const facts = store.facts.filter((f) => f.syncEventId === result.eventId);
    expect(facts).toHaveLength(8);
    for (const f of facts) {
      expect(f.status).toBe("APPLIED");
      expect(f.connectionId).toBe(connection.id);
      expect(f.companyId).toBe(COMPANY_A);
      expect(f.externalId).toMatch(/^je-/);
      expect(f.financialSnapshotId).toBe(store.snapshots[0]!.id);
    }
    // Push cursor advanced to the delivery's external event id.
    expect(store.connections[0]!.cursor).toBe("close-2026-06");
    expect(store.connections[0]!.inboundSecretHash).not.toBe(secret);
  });

  it("idempotent re-delivery is a no-op: DUPLICATE outcome, still one snapshot/state, both attempts audited", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const raw = body({ asOfDate: AS_OF, facts: completeFacts() });
    const first = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: raw, presentedToken: secret, idempotencyKey: "delivery-1", client: db });
    const second = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: raw, presentedToken: secret, idempotencyKey: "delivery-1", client: db });
    expect(second.ok).toBe(true);
    expect(second.outcome).toBe("DUPLICATE");
    expect(second.originalEventId).toBe(first.eventId);
    expect(second.counts.applied).toBe(8);
    expect(store.snapshots).toHaveLength(1);
    expect(store.states).toHaveLength(1);
    expect(store.facts).toHaveLength(8);
    const events = await listErpSyncEvents(connection.id, 50, db);
    expect(events.map((e) => e.outcome)).toEqual(["DUPLICATE", "APPLIED"]);
  });

  it("same idempotency key with a different payload is refused; the original stands", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: body({ asOfDate: AS_OF, facts: completeFacts() }), presentedToken: secret, idempotencyKey: "delivery-1", client: db });
    const mismatch = await ingestErpFinancialFacts({
      connectionId: connection.id,
      rawBody: body({ asOfDate: AS_OF, facts: completeFacts({ cash: 9_900_000 }) }),
      presentedToken: secret,
      idempotencyKey: "delivery-1",
      client: db,
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.outcome).toBe("REFUSED_IDEMPOTENCY_MISMATCH");
    expect(Number(store.snapshots[0]!.cash)).toBe(4.2);
    expect(store.facts.filter((f) => f.status === "APPLIED")).toHaveLength(8);
  });

  it("corroboration: the same values re-posted under a new key apply without a rewrite - still one row per table", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const raw = body({ asOfDate: AS_OF, facts: completeFacts() });
    await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: raw, presentedToken: secret, idempotencyKey: "d1", client: db });
    const again = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: raw, presentedToken: secret, idempotencyKey: "d2", client: db });
    expect(again.outcome).toBe("APPLIED");
    expect(store.snapshots).toHaveLength(1);
    expect(store.states).toHaveLength(1);
  });

  it("conflicting restatement of the same period fails closed: fact CONFLICT, canonical value unchanged, event flagged", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: body({ asOfDate: AS_OF, facts: completeFacts() }), presentedToken: secret, idempotencyKey: "d1", client: db });
    const conflict = await ingestErpFinancialFacts({
      connectionId: connection.id,
      rawBody: body({ asOfDate: AS_OF, facts: [{ key: "cash", value: 9_900_000, unit: "USD" }] }),
      presentedToken: secret,
      idempotencyKey: "d2",
      client: db,
    });
    expect(conflict.status).toBe(409);
    expect(conflict.outcome).toBe("NEEDS_ATTENTION");
    expect(Number(store.snapshots[0]!.cash)).toBe(4.2);
    const conflictFact = store.facts.find((f) => f.syncEventId === conflict.eventId);
    expect(conflictFact!.status).toBe("CONFLICT");
    expect(conflictFact!.detail).toContain("CONFLICTING_FINANCIAL_FACTS");
    const event = store.events.find((e) => e.id === conflict.eventId);
    expect(event!.needsAttention).toBe(true);
  });

  it("duplicate same-date FinancialState rows (pre-existing legacy state) resolve AMBIGUOUS and fail closed - ERP never adds a third", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const asOf = new Date("2026-06-30T00:00:00.000Z");
    for (let i = 0; i < 2; i++) {
      store.states.push({ id: `legacy-state-${i}`, companyId: COMPANY_A, asOfDate: asOf, periodType: "ACTUAL", scope: "CONSOLIDATED", balanceSheetFacts: {}, incomeStatementFacts: {}, covenantMetricFacts: {}, createdAt: new Date(), updatedAt: new Date() });
    }
    const result = await ingestErpFinancialFacts({
      connectionId: connection.id,
      rawBody: body({ asOfDate: AS_OF, facts: completeFacts() }),
      presentedToken: secret,
      idempotencyKey: "d1",
      client: db,
    });
    expect(result.outcome).toBe("NEEDS_ATTENTION");
    expect(store.states).toHaveLength(2);
    expect(store.snapshots).toHaveLength(0);
    const facts = store.facts.filter((f) => f.syncEventId === result.eventId);
    expect(facts.every((f) => f.status === "CONFLICT" && (f.detail ?? "").includes("FINANCIAL_IDENTITY_AMBIGUOUS"))).toBe(true);
  });

  it("incremental feed: a partial delivery withholds (no fabricated row); the completing delivery promotes the union", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const all = completeFacts();
    const first = await ingestErpFinancialFacts({
      connectionId: connection.id,
      rawBody: body({ asOfDate: AS_OF, facts: all.slice(0, 4) }),
      presentedToken: secret,
      idempotencyKey: "d1",
      client: db,
    });
    expect(first.outcome).toBe("WITHHELD");
    expect(store.snapshots).toHaveLength(0);
    expect(store.states).toHaveLength(0);

    const second = await ingestErpFinancialFacts({
      connectionId: connection.id,
      rawBody: body({ asOfDate: AS_OF, facts: all.slice(4) }),
      presentedToken: secret,
      idempotencyKey: "d2",
      client: db,
    });
    expect(second.outcome).toBe("APPLIED");
    expect(store.snapshots).toHaveLength(1);
    expect(store.states).toHaveLength(1);
    expect(store.facts.every((f) => f.status === "APPLIED")).toBe(true);
    expect(Number(store.snapshots[0]!.cash)).toBe(4.2);
  });

  it("two staged deliveries disagreeing on a field conflict with each other - no winner, no canonical row", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const all = completeFacts();
    await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: body({ asOfDate: AS_OF, facts: all.slice(0, 4) }), presentedToken: secret, idempotencyKey: "d1", client: db });
    const clashing = all.slice(4).concat([{ key: "cash", value: 7_700_000, unit: "USD" }]);
    const second = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: body({ asOfDate: AS_OF, facts: clashing }), presentedToken: secret, idempotencyKey: "d2", client: db });
    expect(second.outcome).toBe("NEEDS_ATTENTION");
    expect(store.snapshots).toHaveLength(0);
    const cashFacts = store.facts.filter((f) => f.sourceKey === "cash");
    expect(cashFacts).toHaveLength(2);
    expect(cashFacts.every((f) => f.status === "CONFLICT")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ingestion: auth + tenant isolation
// ---------------------------------------------------------------------------

describe("ingest auth and tenant isolation", () => {
  it("bad token: 401, REFUSED_AUTH audited, nothing staged or written", async () => {
    const { db, store } = makeFakeDb();
    const { connection } = await setupConnection(db);
    const result = await ingestErpFinancialFacts({
      connectionId: connection.id,
      rawBody: body({ asOfDate: AS_OF, facts: completeFacts() }),
      presentedToken: "hrp_erp_wrong",
      idempotencyKey: "d1",
      client: db,
    });
    expect(result.status).toBe(401);
    expect(result.outcome).toBe("REFUSED_AUTH");
    expect(store.facts).toHaveLength(0);
    expect(store.snapshots).toHaveLength(0);
    expect(store.events).toHaveLength(1);
    expect(store.events[0]!.outcome).toBe("REFUSED_AUTH");
  });

  it("unknown connection id: 404, no audit row (nothing trustworthy to attach it to)", async () => {
    const { db, store } = makeFakeDb();
    const result = await ingestErpFinancialFacts({ connectionId: "nope", rawBody: "{}", presentedToken: "x", client: db });
    expect(result.status).toBe(404);
    expect(store.events).toHaveLength(0);
  });

  it("cross-company: company A's token cannot write through company B's connection, and A's deliveries never create B rows", async () => {
    const { db, store } = makeFakeDb();
    const a = await setupConnection(db, COMPANY_A);
    const b = await setupConnection(db, COMPANY_B);
    const raw = body({ asOfDate: AS_OF, facts: completeFacts() });
    const cross = await ingestErpFinancialFacts({ connectionId: b.connection.id, rawBody: raw, presentedToken: a.secret, idempotencyKey: "d1", client: db });
    expect(cross.status).toBe(401);
    const own = await ingestErpFinancialFacts({ connectionId: a.connection.id, rawBody: raw, presentedToken: a.secret, idempotencyKey: "d1", client: db });
    expect(own.outcome).toBe("APPLIED");
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0]!.companyId).toBe(COMPANY_A);
    expect(store.facts.every((f) => f.companyId === COMPANY_A)).toBe(true);
  });

  it("a disabled connection refuses even with the valid token (operator kill switch)", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    store.connections[0]!.enabled = false;
    const result = await ingestErpFinancialFacts({
      connectionId: connection.id,
      rawBody: body({ asOfDate: AS_OF, facts: completeFacts() }),
      presentedToken: secret,
      idempotencyKey: "d1",
      client: db,
    });
    expect(result.status).toBe(401);
    expect(result.outcome).toBe("REFUSED_AUTH");
    expect(store.snapshots).toHaveLength(0);
  });

  it("malformed body: REFUSED_VALIDATION audited, nothing staged", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const badJson = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: "{not json", presentedToken: secret, client: db });
    expect(badJson.status).toBe(400);
    expect(badJson.outcome).toBe("REFUSED_VALIDATION");
    const badShape = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: body({ asOfDate: AS_OF, facts: [{ key: "cash", value: 1, unit: "BTC" } as any] }), presentedToken: secret, client: db });
    expect(badShape.status).toBe(400);
    expect(store.facts).toHaveLength(0);
    expect(store.events.filter((e) => e.outcome === "REFUSED_VALIDATION")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Ingestion: mapping honesty
// ---------------------------------------------------------------------------

describe("ingest mapping honesty", () => {
  const KEY_MAP = {
    "1000": "cash",
    "2000": "total_debt",
    "2100": "secured_debt",
    "3000": "covenant_ebitda",
    "4000": "interest_expense",
    "5000": "cumulative_net_income",
    "6000": "equity_proceeds",
    "7000": "assumed_new_debt_rate_pct",
  };

  it("ERP-native keys promote only via the connection's explicit metricKeyMap; an unmapped key is stored verbatim and surfaced", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db, COMPANY_A, KEY_MAP);
    const rawValues: Record<string, { value: number; unit: FinancialUnit }> = {
      "1000": { value: 4_200_000, unit: "USD" },
      "2000": { value: 52_000_000, unit: "USD" },
      "2100": { value: 30_000_000, unit: "USD" },
      "3000": { value: 18_000_000, unit: "USD" },
      "4000": { value: 2_100_000, unit: "USD" },
      "5000": { value: 9_000_000, unit: "USD" },
      "6000": { value: 5_000_000, unit: "USD" },
      "7000": { value: 7.5, unit: "PERCENT" },
    };
    const facts: ErpFinancialFactInput[] = Object.entries(rawValues).map(([key, { value, unit }]) => ({ key, value, unit }));
    facts.push({ key: "acct_9999_misc", value: 12345, unit: "USD" });
    const result = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: body({ asOfDate: AS_OF, facts }), presentedToken: secret, idempotencyKey: "d1", client: db });
    expect(result.outcome).toBe("APPLIED");
    expect(result.counts).toEqual({ applied: 8, conflicted: 0, unmapped: 1, withheld: 0 });
    expect(Number(store.snapshots[0]!.cash)).toBe(4.2);

    const unmapped = store.facts.find((f) => f.sourceKey === "acct_9999_misc");
    expect(unmapped!.status).toBe("UNMAPPED");
    expect(unmapped!.canonicalMetric).toBeNull();
    expect(Number(unmapped!.declaredValue)).toBe(12345);
    expect(unmapped!.declaredUnit).toBe("USD");

    const attention = await listErpFactsNeedingAttention(COMPANY_A, db);
    expect(attention.map((f) => f.sourceKey)).toContain("acct_9999_misc");
    const event = store.events.find((e) => e.id === result.eventId);
    expect(event!.needsAttention).toBe(true);
    expect(event!.unmappedCount).toBe(1);
  });

  it("gaap_ebitda is recognized but NOT_PROMOTABLE - it never lands in the canonical ebitda field", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const facts = completeFacts().concat([{ key: "gaap_ebitda", value: 999_000_000, unit: "USD" }]);
    const result = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: body({ asOfDate: AS_OF, facts }), presentedToken: secret, idempotencyKey: "d1", client: db });
    expect(result.outcome).toBe("APPLIED");
    expect(Number(store.snapshots[0]!.ebitda)).toBe(18);
    const gaap = store.facts.find((f) => f.sourceKey === "gaap_ebitda");
    expect(gaap!.status).toBe("NOT_PROMOTABLE");
    expect(gaap!.canonicalMetric).toBe("gaap_ebitda");
  });

  it("an incompatible declared unit for a recognized metric refuses that fact (never silently converted)", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const facts: ErpFinancialFactInput[] = completeFacts().map((f) => (f.key === "cash" ? { ...f, unit: "PERCENT" as const } : f));
    const result = await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: body({ asOfDate: AS_OF, facts }), presentedToken: secret, idempotencyKey: "d1", client: db });
    const cash = store.facts.find((f) => f.sourceKey === "cash");
    expect(cash!.status).toBe("REFUSED");
    expect(cash!.detail).toContain("PERCENT");
    // Without cash the set is incomplete - nothing canonical was created.
    expect(store.snapshots).toHaveLength(0);
    expect(result.outcome).toBe("NEEDS_ATTENTION");
  });

  it("a value outside the sanity ceiling is refused, not promoted (the unit-scale bug class)", async () => {
    const { db, store } = makeFakeDb();
    const { connection, secret } = await setupConnection(db);
    const facts: ErpFinancialFactInput[] = completeFacts().map((f) => (f.key === "cash" ? { ...f, value: 20_000_000, unit: "USD_MILLIONS" as const } : f));
    await ingestErpFinancialFacts({ connectionId: connection.id, rawBody: body({ asOfDate: AS_OF, facts }), presentedToken: secret, idempotencyKey: "d1", client: db });
    const cash = store.facts.find((f) => f.sourceKey === "cash");
    expect(cash!.status).toBe("REFUSED");
    expect(store.snapshots).toHaveLength(0);
  });
});
