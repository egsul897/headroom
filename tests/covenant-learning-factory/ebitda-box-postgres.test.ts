/**
 * EBITDA box writes against a REAL Postgres (Prisma interactive transactions, pg_advisory_xact_lock, the BIGSERIAL
 * sequence and the check constraints from the EBITDA migrations). Runs only when EBITDA_PG_TEST_URL points at a local,
 * already-migrated database (CI: the ephemeral Postgres service in .github/workflows/ebitda-postgres.yml). It never
 * reads DATABASE_URL and refuses any non-local host, so it cannot touch a shared database. No secrets needed.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boxGeneration, computeEbitdaBox, confirmEbitdaItem, latestEbitdaBox, loadConfirmations, recordEbitdaBoxFailure, refreshBoxCommitted, type EbitdaBoxStore } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { M, args } from "./ebitda-box-fixture";

const url = process.env.EBITDA_PG_TEST_URL ?? "";
const local = (() => { try { return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname); } catch { return false; } })();
// CI sets EBITDA_PG_TEST_REQUIRED=1 so a missing URL fails loudly instead of silently skipping the suite.
if (process.env.EBITDA_PG_TEST_REQUIRED === "1" && !url) throw new Error("EBITDA_PG_TEST_REQUIRED=1 but EBITDA_PG_TEST_URL is not set");
if (url && !local) throw new Error("EBITDA_PG_TEST_URL must point at a local, ephemeral Postgres (refusing a remote host)");

describe.skipIf(!url)("EBITDA box on real Postgres (transactions, advisory lock, sequence, constraints)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = prisma as unknown as EbitdaBoxStore;
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const scope = { companyId: `ebx-pg-c-${run}`, documentId: `ebx-pg-d-${run}` };
  const keyOf = (label: string) => computeEbitdaBox(args).items.find((i) => i.label === label)!.inputKey;

  beforeAll(async () => {
    await prisma.company.create({ data: { id: scope.companyId, name: "EBITDA PG test" } });
    await prisma.document.create({ data: { id: scope.documentId, companyId: scope.companyId, name: "agreement", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("concurrent confirmations serialise on the advisory lock: every row lands, seq is strictly increasing, the latest box reflects the last committed row per key", async () => {
    const e = keyOf("(e)"), d = keyOf("(d)");
    const writes = [1, 2, 3, 4, 5].map((n) => confirmEbitdaItem(db, scope, { ...args, sourceId: scope.documentId }, { inputKey: n % 2 ? e : d, value: String(n * M), source: `cfo-${n}`, confirmedBy: "cfo" }));
    const out = await Promise.all(writes);
    expect(out.every((o) => o.ok)).toBe(true);
    const rows = await prisma.customerEbitdaConfirmation.findMany({ where: scope, orderBy: { seq: "asc" } });
    expect(rows).toHaveLength(5);
    const boxes = await prisma.customerEbitdaBox.findMany({ where: scope, orderBy: { seq: "asc" } });
    expect(boxes).toHaveLength(5);
    for (let i = 1; i < 5; i++) { expect(rows[i]!.seq > rows[i - 1]!.seq).toBe(true); expect(boxes[i]!.seq > boxes[i - 1]!.seq).toBe(true); }
    // Each box was computed from exactly the rows committed before it plus its own: box i sees rows 0..i.
    const latest = await latestEbitdaBox(db, scope);
    expect(latest?.status).toBe("READY");
    const current = await loadConfirmations(db, scope);
    expect(current).toHaveLength(2);
    const lastE = rows.filter((r) => r.inputKey === e).at(-1)!, lastD = rows.filter((r) => r.inputKey === d).at(-1)!;
    expect(current.find((c) => c.key === e)?.value).toBe(lastE.value);
    expect(current.find((c) => c.key === d)?.value).toBe(lastD.value);
    expect(latest?.items.find((i) => i.label === "(e)")?.counted).toBe(lastE.value);
    expect(await boxGeneration(db, scope)).toBe(boxes.at(-1)!.id);
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
  });
});
