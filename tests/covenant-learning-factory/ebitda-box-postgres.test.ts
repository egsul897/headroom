/**
 * EBITDA box writes against a REAL Postgres (Prisma interactive transactions, pg_advisory_xact_lock, the BIGSERIAL
 * sequence and the check constraints from the EBITDA migrations). Runs only when EBITDA_PG_TEST_URL points at a local,
 * already-migrated database (CI: the ephemeral Postgres service in .github/workflows/ebitda-postgres.yml). It never
 * reads DATABASE_URL and refuses any non-local host, so it cannot touch a shared database. No secrets needed.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boxGeneration, canonicalInputKey, computeEbitdaBox, confirmEbitdaItem, latestEbitdaBox, loadConfirmations, recordEbitdaBoxFailure, refreshBoxCommitted, type EbitdaBox, type EbitdaBoxStore } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { M, args } from "./ebitda-box-fixture";

const url = process.env.EBITDA_PG_TEST_URL ?? "";
const local = (() => { try { return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname); } catch { return false; } })();
// CI sets EBITDA_PG_TEST_REQUIRED=1 so a missing URL fails loudly instead of silently skipping the suite.
if (process.env.EBITDA_PG_TEST_REQUIRED === "1" && !url) throw new Error("EBITDA_PG_TEST_REQUIRED=1 but EBITDA_PG_TEST_URL is not set");
if (url && !local) throw new Error("EBITDA_PG_TEST_URL must point at a local, ephemeral Postgres (refusing a remote host)");

describe.skipIf(!url)("EBITDA box on real Postgres (transactions, advisory lock, sequence, constraints)", () => {
  // Enough pool connections for the concurrent writers (each waits on the lock inside its own transaction).
  const pooled = url && !/connection_limit=/.test(url) ? `${url}${url.includes("?") ? "&" : "?"}connection_limit=40` : url;
  const prisma = new PrismaClient({ datasources: { db: { url: pooled } } });
  const db = prisma as unknown as EbitdaBoxStore;
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const scope = { companyId: `ebx-pg-c-${run}`, documentId: `ebx-pg-d-${run}` };
  const keyOf = (label: string) => computeEbitdaBox(args).items.find((i) => i.label === label)!.inputKey;

  beforeAll(async () => {
    await prisma.company.create({ data: { id: scope.companyId, name: "EBITDA PG test" } });
    await prisma.document.create({ data: { id: scope.documentId, companyId: scope.companyId, name: "agreement", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("lock-dependent: 12 concurrent confirms on each of 3 documents — each box saw exactly the rows committed before it, and the latest box is the last committed row's", async () => {
    // Without pg_advisory_xact_lock two transactions read the committed rows at the same time, each misses the other's
    // row, and a box is saved that did not see the row committed just before it. This test fails in that case
    // (verified by swapping the lock for a no-op); with the lock every box sees exactly rows 0..i by seq.
    const e = keyOf("(e)"), d = keyOf("(d)");
    const N = 12;
    const docs = await Promise.all([0, 1, 2].map(async (j) => {
      const s = { companyId: scope.companyId, documentId: `${scope.documentId}-c${j}` };
      await prisma.document.create({ data: { id: s.documentId, companyId: s.companyId, name: `agreement ${j}`, type: "CREDIT_AGREEMENT" } });
      return s;
    }));
    // Values stay under the (e) line's $5,000,000 cap so the counted amount equals the confirmed value; all distinct.
    const out = await Promise.all(docs.flatMap((s, j) => Array.from({ length: N }, (_, n) => confirmEbitdaItem(db, s, { ...args, sourceId: s.documentId }, {
      inputKey: n % 2 ? d : e, value: String((n + 1) * 300_000 + j * 1_000), source: `cfo-${j}-${n}`, confirmedBy: "cfo",
    }))));
    expect(out.filter((o) => !o.ok)).toEqual([]);
    for (const s of docs) {
      const rows = await prisma.customerEbitdaConfirmation.findMany({ where: s, orderBy: { seq: "asc" } });
      const boxes = await prisma.customerEbitdaBox.findMany({ where: s, orderBy: { seq: "asc" } });
      expect(rows).toHaveLength(N);
      expect(boxes).toHaveLength(N);
      const boxById = new Map(boxes.map((b) => [b.id, b]));
      const seen = new Map<string, string>();
      let prevBoxSeq = -1n;
      for (const r of rows) {
        seen.set(canonicalInputKey(r.inputKey), r.value);
        const box = boxById.get((r.response as { boxId: string }).boxId);
        expect(box, `box for row ${r.seq}`).toBeDefined();
        expect(box!.seq > prevBoxSeq).toBe(true); // boxes were committed in row order
        prevBoxSeq = box!.seq;
        const saw = Object.fromEntries(((box!.payload as unknown as EbitdaBox).confirmations ?? []).map((c) => [canonicalInputKey(c.key), c.value]));
        expect(saw, `box for row seq ${r.seq} saw exactly the rows up to it`).toEqual(Object.fromEntries(seen));
      }
      const last = rows.at(-1)!;
      expect(await boxGeneration(db, s)).toBe((last.response as { boxId: string }).boxId);
      const latest = await latestEbitdaBox(db, s);
      expect(latest?.status).toBe("READY");
      expect(latest?.items.find((i) => i.label === "(e)")?.counted).toBe(rows.filter((r) => r.inputKey === e).at(-1)!.value);
      expect(Object.fromEntries((await loadConfirmations(db, s)).map((c) => [canonicalInputKey(c.key), c.value]))).toEqual(Object.fromEntries(seen));
    }
  }, 120_000);

  it("concurrent confirms on one document: every row lands with a strictly increasing seq", async () => {
    const e = keyOf("(e)");
    const out = await Promise.all([1, 2, 3, 4, 5].map((n) => confirmEbitdaItem(db, scope, { ...args, sourceId: scope.documentId }, { inputKey: e, value: String(n * M / 2), source: `cfo-${n}`, confirmedBy: "cfo" })));
    expect(out.every((o) => o.ok)).toBe(true);
    const rows = await prisma.customerEbitdaConfirmation.findMany({ where: scope, orderBy: { seq: "asc" } });
    expect(rows).toHaveLength(5);
    expect((await latestEbitdaBox(db, scope))?.items.find((i) => i.label === "(e)")?.counted).toBe(rows.at(-1)!.value);
  });

  it("a failure inside the transaction rolls back the confirmation row too (nothing half-written)", async () => {
    const before = await prisma.customerEbitdaConfirmation.count({ where: scope });
    const boxesBefore = await prisma.customerEbitdaBox.count({ where: scope });
    const failing: EbitdaBoxStore = {
      ...db,
      customerEbitdaBox: db.customerEbitdaBox, customerEbitdaConfirmation: db.customerEbitdaConfirmation,
      $queryRawUnsafe: db.$queryRawUnsafe!.bind(db),
      $transaction: (fn, opts) => prisma.$transaction((tx) => {
        const t = tx as unknown as EbitdaBoxStore;
        return fn({ ...t, customerEbitdaConfirmation: t.customerEbitdaConfirmation, $queryRawUnsafe: t.$queryRawUnsafe!.bind(t), customerEbitdaBox: { ...t.customerEbitdaBox, create: async () => { throw new Error("connection reset (simulated)"); } } });
      }, opts),
    };
    await expect(confirmEbitdaItem(failing, scope, args, { inputKey: keyOf("(e)"), value: String(9 * M), source: "lost", confirmedBy: "cfo" })).rejects.toThrow(/connection reset/);
    expect(await prisma.customerEbitdaConfirmation.count({ where: scope })).toBe(before);
    expect(await prisma.customerEbitdaBox.count({ where: scope })).toBe(boxesBefore);
  });

  it("a stale failure never shadows a newer READY box; a current one is written FAILED with lastGoodBoxId", async () => {
    const stale = await recordEbitdaBoxFailure(db, scope, new Error("old run failed"), { generation: "an-older-box" });
    expect(stale.skipped).toBe(true);
    expect((await latestEbitdaBox(db, scope))?.status).toBe("READY");
    const good = await boxGeneration(db, scope);
    const r = await refreshBoxCommitted(db, scope, async () => { throw new Error("parser failed"); });
    expect(r?.box).toMatchObject({ status: "FAILED", lastGoodBoxId: good });
    expect((await latestEbitdaBox(db, scope))?.status).toBe("FAILED");
  });

  it("the database enforces the confirmation check constraints", async () => {
    const base = { ...scope, inputKey: "ADDBACK:X", kind: "AMOUNT", source: "s", confirmedBy: "cfo" };
    await expect(prisma.customerEbitdaConfirmation.create({ data: { ...base, value: "-5", idempotencyKey: `neg-${run}` } })).rejects.toThrow(/check constraint|violates/i);
    await expect(prisma.customerEbitdaConfirmation.create({ data: { ...base, inputKey: "ADDBACK: X", value: "5", idempotencyKey: `ws-${run}` } })).rejects.toThrow(/check constraint|violates/i);
    // 20261017090000: BASE_METRIC is an allowed kind (still a non-negative integer); unknown kinds are refused.
    await expect(prisma.customerEbitdaConfirmation.create({ data: { ...base, inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: "300000000", idempotencyKey: `bm-${run}` } })).resolves.toBeTruthy();
    await expect(prisma.customerEbitdaConfirmation.create({ data: { ...base, kind: "BOGUS", value: "5", idempotencyKey: `bogus-${run}` } })).rejects.toThrow(/check constraint|violates/i);
    await expect(prisma.customerEbitdaConfirmation.create({ data: { ...base, inputKey: "METRIC:NETINCOME", kind: "BASE_METRIC", value: "-5", idempotencyKey: `bmneg-${run}` } })).rejects.toThrow(/check constraint|violates/i);
  });

  it("migration 20261017090000 is one atomic statement: replay keeps exactly one kind check; down refuses while BASE_METRIC rows exist", async () => {
    const { readFileSync } = await import("node:fs");
    const dir = "prisma/migrations/20261017090000_customer_ebitda_base_metric";
    const kindChecks = () => prisma.$queryRawUnsafe<Array<{ def: string }>>(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = '"customer_ebitda_confirmations"'::regclass AND conname = 'customer_ebitda_confirmations_kind_check'`);
    await prisma.$executeRawUnsafe(readFileSync(`${dir}/migration.sql`, "utf8")); // idempotent replay
    let defs = await kindChecks();
    expect(defs).toHaveLength(1);
    expect(defs[0]!.def).toMatch(/BASE_METRIC/);
    // BASE_METRIC rows exist (previous test): the rollback raises and leaves the widened check in place.
    await expect(prisma.$executeRawUnsafe(readFileSync(`${dir}/down.sql`, "utf8"))).rejects.toThrow(/refusing to narrow/);
    defs = await kindChecks();
    expect(defs).toHaveLength(1);
    expect(defs[0]!.def).toMatch(/BASE_METRIC/);
  });
});
