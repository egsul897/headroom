/** Reviewer PASS_WITH_NOTES at 48c33d17: transactional confirm (row first, box from committed rows), migration notes,
 *  revenue bound, ceiling wording, FAILED box keeps last committed state, SEC errors are FAILED. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { computeEbitdaBox, confirmEbitdaItem, financialsForCik, latestEbitdaBox, recordEbitdaBoxFailure, refreshBoxCommitted } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { M, args, fakeStore, fin } from "./ebitda-box-fixture";

const scope = { companyId: "c1", documentId: "d1" };
const keyE = () => computeEbitdaBox(args).items.find((i) => i.label === "(e)")!.inputKey;
const countedE = async (db: ReturnType<typeof fakeStore>) => (await latestEbitdaBox(db, scope))?.items.find((i) => i.label === "(e)")?.counted ?? null;

describe("confirm: one transaction, row first, box from committed rows", () => {
  it("race loser (same idempotency key, different amount) writes nothing; GET shows only the winner", async () => {
    const db = fakeStore();
    const req = (who: string, v: number) => confirmEbitdaItem(db, scope, args, { inputKey: keyE(), value: String(v * M), source: "a", confirmedBy: who, idempotencyKey: "race" });
    const [a, b] = await Promise.allSettled([req("u1", 1), req("u2", 4)]);
    expect(a.status === "fulfilled" && b.status === "fulfilled").toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.boxes).toHaveLength(1);
    expect(await countedE(db)).toBe(db.rows[0]!.value);
    expect(db.locks.length).toBeGreaterThan(0);
  });

  it("a failed insert writes no box: GET keeps the last committed figure", async () => {
    const db = fakeStore();
    await confirmEbitdaItem(db, scope, args, { inputKey: keyE(), value: String(1 * M), source: "a", confirmedBy: "u1" });
    const boxes = db.boxes.length;
    db.beforeCreate = () => { throw new Error("insert failed: deadlock detected"); };
    await expect(confirmEbitdaItem(db, scope, args, { inputKey: keyE(), value: String(4 * M), source: "b", confirmedBy: "u1" })).rejects.toThrow(/insert failed/);
    expect(db.boxes).toHaveLength(boxes);
    expect(db.rows).toHaveLength(1);
    expect(await countedE(db)).toBe(String(1 * M));
  });

  it("a connection reset while saving the box rolls back the row too: nothing uncommitted is visible", async () => {
    const db = fakeStore();
    await confirmEbitdaItem(db, scope, args, { inputKey: keyE(), value: String(1 * M), source: "a", confirmedBy: "u1" });
    const boxes = db.boxes.length;
    // reset while the confirmation row is being written
    let once = true;
    db.beforeCreate = () => { if (once) { once = false; throw Object.assign(new Error("Connection reset by peer"), { code: "P1017" }); } };
    await expect(confirmEbitdaItem(db, scope, args, { inputKey: keyE(), value: String(4 * M), source: "b", confirmedBy: "u1" })).rejects.toThrow(/reset/);
    expect(db.rows).toHaveLength(1);
    expect(db.boxes).toHaveLength(boxes);
    expect(await countedE(db)).toBe(String(1 * M));
    // reset while the box is being written (after the row): the row is rolled back with it
    db.failBoxWrite = Object.assign(new Error("Connection reset by peer"), { code: "P1017" });
    await expect(confirmEbitdaItem(db, scope, args, { inputKey: keyE(), value: String(4 * M), source: "b", confirmedBy: "u1" })).rejects.toThrow(/reset/);
    expect(db.rows).toHaveLength(1);
    expect(db.boxes).toHaveLength(boxes);
    expect(await countedE(db)).toBe(String(1 * M));
    // and a retry after the reset commits normally
    const ok = await confirmEbitdaItem(db, scope, args, { inputKey: keyE(), value: String(4 * M), source: "b", confirmedBy: "u1" });
    expect(ok.ok).toBe(true);
    expect(await countedE(db)).toBe(String(4 * M));
  });

  it("the saved box is computed from the rows as committed (a row committed concurrently is included)", async () => {
    const db = fakeStore();
    let injected = false;
    db.beforeCreate = async () => {
      if (injected) return; injected = true;
      // another request committed a different key just before this insert
      db.rows.push({ id: "r-other", companyId: "c1", documentId: "d1", inputKey: computeEbitdaBox(args).items.find((i) => i.label === "(f)")!.inputKey, kind: "LENDER_APPROVAL", value: "1", source: "consent", confirmedBy: "u9", idempotencyKey: "other", createdAt: new Date(0) });
    };
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: keyE(), value: String(1 * M), source: "a", confirmedBy: "u1" });
    expect(out.ok && out.box.confirmations.map((c) => c.kind)).toEqual(expect.arrayContaining(["LENDER_APPROVAL", "AMOUNT"]));
    expect(((await latestEbitdaBox(db, scope))?.confirmations ?? []).length).toBe(2);
  });
});

describe("refresh / failure", () => {
  it("SEC fetch errors give FAILED (not NEEDS_FINANCIALS); 404 (no XBRL) stays NEEDS_FINANCIALS", async () => {
    const err503 = (async () => new Response("busy", { status: 403 })) as unknown as typeof fetch;
    await expect(financialsForCik("1", err503)).rejects.toThrow(/SEC 403/);
    const nf = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    process.env.SEC_EDGAR_USER_AGENT ||= "headroom-test test@example.com";
    expect(await financialsForCik("1", nf)).toMatchObject({ financials: null });
    const db = fakeStore();
    const r = await refreshBoxCommitted(db, scope, async () => { throw new Error("SEC 403 for https://data.sec.gov/x"); });
    expect(r?.box.status).toBe("FAILED");
    expect((await latestEbitdaBox(db, scope))?.status).toBe("FAILED");
  });

  it("a FAILED box keeps the last committed confirmations and total visible", async () => {
    const db = fakeStore();
    const ok = await confirmEbitdaItem(db, scope, args, { inputKey: keyE(), value: String(3 * M), source: "a", confirmedBy: "u1" });
    expect(ok.ok).toBe(true);
    await recordEbitdaBoxFailure(db, scope, new Error("SEC 503"));
    const b = await latestEbitdaBox(db, scope);
    expect(b).toMatchObject({ status: "FAILED", reason: expect.stringMatching(/SEC 503/), totalEbitda: ok.ok ? ok.box.totalEbitda : null });
    expect(b?.confirmations).toEqual([expect.objectContaining({ key: keyE(), value: String(3 * M) })]);
    // a second failure still shows the last good figures, not an empty box
    await recordEbitdaBoxFailure(db, scope, new Error("SEC 503 again"));
    expect((await latestEbitdaBox(db, scope))?.totalEbitda).toBe(ok.ok ? ok.box.totalEbitda : null);
  });
});

describe("plausibility bound without a base", () => {
  const noBaseRev = (rev: number) => ({ ...args, financials: { ...fin, values: [...fin.values.map((v) => (v.concept === "NetIncomeLoss" ? { ...v, value: String(-10 * M) } : v)), { ...fin.values[0]!, metric: "revenue" as const, concept: "Revenues", value: String(rev) }] } }) as typeof args;
  const keyF = (a: typeof args) => computeEbitdaBox(a).items.find((i) => i.label === "(f)")!.inputKey;
  it("an uncapped line is bounded by 50% of reported revenue", async () => {
    const a = noBaseRev(300 * M);
    expect(await confirmEbitdaItem(fakeStore(), scope, a, { inputKey: keyF(a), value: String(150 * M + 1), source: "x", confirmedBy: "u1" })).toMatchObject({ ok: false, status: 422, code: "OUT_OF_RANGE", error: expect.stringMatching(/50% of the issuer's reported revenue/) });
    expect((await confirmEbitdaItem(fakeStore(), scope, a, { inputKey: keyF(a), value: String(150 * M), source: "x", confirmedBy: "u1" })).ok).toBe(true);
  });
  it("when the 1e12 ceiling is what refuses, the message says so (not 'revenue')", async () => {
    const a = noBaseRev(5e12);
    const out = await confirmEbitdaItem(fakeStore(), scope, a, { inputKey: keyF(a), value: String(1e12 + 1), source: "x", confirmedBy: "u1" });
    expect(out).toMatchObject({ ok: false, status: 422, code: "OUT_OF_RANGE" });
    expect(!out.ok && out.error).toMatch(/1e12 USD absolute ceiling/);
    expect(!out.ok && out.error).not.toMatch(/revenue/);
  });
});

describe("migration notes", () => {
  const up = readFileSync("prisma/migrations/20261017050000_customer_ebitda_append_only/migration.sql", "utf8");
  it("header says it was never applied; CONCURRENTLY is explained", () => {
    expect(up).toMatch(/never applied/i);
    expect(up).toMatch(/CONCURRENTLY/);
  });
  it("a document's company cannot change while confirmations reference it (ON UPDATE RESTRICT on the history FKs)", () => {
    expect(up).toMatch(/customer_ebitda_confirmations_documentId_companyId_fkey', \$c\$FOREIGN KEY \("documentId", "companyId"\) REFERENCES "documents"\("id", "companyId"\) ON DELETE RESTRICT ON UPDATE RESTRICT/);
    expect(up).toMatch(/customer_ebitda_confirmations_companyId_fkey', \$c\$FOREIGN KEY \("companyId"\) REFERENCES "companies"\("id"\) ON DELETE RESTRICT ON UPDATE RESTRICT/);
  });
});
