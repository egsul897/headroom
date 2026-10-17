/** Reviewer PASS_WITH_NOTES at 35c7598f: plausibility bound without a base, idempotent replay, FAILED box, migration. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { computeEbitdaBox, confirmEbitdaItem, latestEbitdaBox, recordEbitdaBoxFailure } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { handleEbitdaGet } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { runAfterResponse } from "@/lib/covenant-learning-factory/pipeline/after-response";
import { registerEvaluationAnonymousReadGrant, clearEvaluationAnonymousReadGrantsForTests } from "@/lib/customer-workflow/evaluation-anonymous-read-policy";
import { M, args, fakeStore, fin } from "./ebitda-box-fixture";

const scope = { companyId: "c1", documentId: "d1" };
const withValues = (patch: Record<string, number>, extra: Array<{ metric: string; value: number }> = []) => ({
  ...args,
  financials: {
    ...fin,
    values: [
      ...fin.values.map((v) => (v.concept in patch ? { ...v, value: String(patch[v.concept]) } : v)),
      ...extra.map((e) => ({ ...fin.values[0]!, metric: e.metric, concept: "Revenues", value: String(e.value) })),
    ],
  },
}) as typeof args;
const keyOf = (a: typeof args, label: string) => computeEbitdaBox(a).items.find((i) => i.label === label)!.inputKey;

describe("(2) no positive base EBITDA: never fall back to 1e12", () => {
  const noBase = withValues({ NetIncomeLoss: -10 * M });
  it("uncapped line without another sourced figure → 422 NEEDS_BASE, nothing persisted", async () => {
    const db = fakeStore();
    expect(computeEbitdaBox(noBase).base?.value).toBe(String(-10 * M));
    const out = await confirmEbitdaItem(db, scope, noBase, { inputKey: keyOf(noBase, "(f)"), value: String(2 * M), source: "x", confirmedBy: "u1" });
    expect(out).toMatchObject({ ok: false, status: 422, code: "NEEDS_BASE" });
    expect(db.rows).toHaveLength(0);
  });
  it("bounded by reported revenue when the filings have it", async () => {
    const a = withValues({ NetIncomeLoss: -10 * M }, [{ metric: "revenue", value: 300 * M }]);
    const k = keyOf(a, "(f)");
    expect(await confirmEbitdaItem(fakeStore(), scope, a, { inputKey: k, value: String(300 * M + 1), source: "x", confirmedBy: "u1" })).toMatchObject({ ok: false, status: 422, code: "OUT_OF_RANGE" });
    expect((await confirmEbitdaItem(fakeStore(), scope, a, { inputKey: k, value: String(2 * M), source: "x", confirmedBy: "u1" })).ok).toBe(true);
  });
  it("a capped line is bounded by 10x its dollar cap", async () => {
    const k = keyOf(noBase, "(e)"); // cap $5M
    expect(await confirmEbitdaItem(fakeStore(), scope, noBase, { inputKey: k, value: String(50 * M + 1), source: "x", confirmedBy: "u1" })).toMatchObject({ ok: false, status: 422, code: "OUT_OF_RANGE" });
    expect((await confirmEbitdaItem(fakeStore(), scope, noBase, { inputKey: k, value: String(7 * M), source: "x", confirmedBy: "u1" })).ok).toBe(true);
  });
});

describe("(3) idempotency", () => {
  const k = () => keyOf(args, "(e)");
  it("a replay by a different principal is 409", async () => {
    const db = fakeStore();
    await confirmEbitdaItem(db, scope, args, { inputKey: k(), value: String(1 * M), source: "a", confirmedBy: "u1", idempotencyKey: "i1" });
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: k(), value: String(1 * M), source: "a", confirmedBy: "u2", idempotencyKey: "i1" })).toMatchObject({ ok: false, status: 409, code: "IDEMPOTENCY_CONFLICT" });
  });
  it("a replay returns the stored original response, even after later confirmations changed the box", async () => {
    const db = fakeStore();
    const first = await confirmEbitdaItem(db, scope, args, { inputKey: k(), value: String(1 * M), source: "a", confirmedBy: "u1", idempotencyKey: "i1" });
    await confirmEbitdaItem(db, scope, args, { inputKey: k(), value: String(4 * M), source: "b", confirmedBy: "u1", idempotencyKey: "i2" });
    const again = await confirmEbitdaItem(db, scope, args, { inputKey: k(), value: String(1 * M), source: "a", confirmedBy: "u1", idempotencyKey: "i1" });
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.replayed).toBe(true);
    expect(again.boxId).toBe(first.boxId);
    expect(again.box.totalEbitda).toBe(first.box.totalEbitda);
    expect(again.gain).toEqual(first.gain);
  });
  it("concurrent requests with one key: the loser gets the winner's response (same principal) or 409 — never a throw", async () => {
    const db = fakeStore();
    const req = (who: string) => confirmEbitdaItem(db, scope, args, { inputKey: k(), value: String(1 * M), source: "a", confirmedBy: who, idempotencyKey: "race" });
    const same = await Promise.all([req("u1"), req("u1")]);
    expect(same.every((r) => r.ok)).toBe(true);
    expect(same.filter((r) => r.ok && r.replayed)).toHaveLength(1);
    expect(db.rows).toHaveLength(1);
    const db2 = fakeStore();
    const req2 = (who: string) => confirmEbitdaItem(db2, scope, args, { inputKey: k(), value: String(1 * M), source: "a", confirmedBy: who, idempotencyKey: "race" });
    const mixed = await Promise.allSettled([req2("u1"), req2("u2")]);
    expect(mixed.every((r) => r.status === "fulfilled")).toBe(true);
    expect(mixed.map((r) => (r as PromiseFulfilledResult<{ ok: boolean; status?: number }>).value).filter((v) => !v.ok)).toEqual([expect.objectContaining({ status: 409 })]);
  });
});

describe("(4) background failure is persisted and surfaced", () => {
  it("a failed background run saves a FAILED box whose reason GET returns", async () => {
    const db = fakeStore();
    const handed: Promise<unknown>[] = [];
    runAfterResponse(async () => { throw new Error("SEC companyfacts 503"); }, (err) => recordEbitdaBoxFailure(db, scope, err).then(() => undefined), (p) => handed.push(p));
    await handed[0];
    expect(await latestEbitdaBox(db, scope)).toMatchObject({ status: "FAILED", reason: expect.stringMatching(/SEC companyfacts 503/) });
    registerEvaluationAnonymousReadGrant({ companyId: "c1", policyBasis: "test", allowAnonymousRead: true });
    try {
      const r = await handleEbitdaGet({ store: () => db, documentBelongsTo: async () => true, pipelineArgsFor: async () => args, refresh: async () => null, companyIdentityLoader: async (id) => ({ id, tenantKind: "EVALUATION" }) }, new Request("http://x/e"), scope);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: "FAILED", reason: expect.stringMatching(/SEC companyfacts 503/) });
    } finally { clearEvaluationAnonymousReadGrantsForTests({ allowTestReset: true }); }
  });
  it("the upload path records failures (wired to recordEbitdaBoxFailure)", () => {
    expect(readFileSync("lib/product/customer-intelligence/analyze-upload.ts", "utf8")).toMatch(/recordEbitdaBoxFailure\(/);
  });
});

describe("(5) migration: idempotent up/down, same-company document, RESTRICT history", () => {
  const dir = "prisma/migrations/20261017050000_customer_ebitda_append_only";
  const up = readFileSync(`${dir}/migration.sql`, "utf8"), down = readFileSync(`${dir}/down.sql`, "utf8");
  const stmts = (sql: string) => sql.replace(/--[^\n]*/g, "").split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);
  it("every up statement is guarded", () => {
    for (const st of stmts(up.replace(/DO \$\$[\s\S]*?END \$\$;/g, ""))) expect(st).toMatch(/IF NOT EXISTS|IF EXISTS|^UPDATE .* WHERE "idempotencyKey" IS NULL|SET NOT NULL/);
    expect(up).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = c\.name/);
    expect(up).not.toMatch(/^ALTER TABLE \S+ ADD CONSTRAINT/m);
  });
  it("every down statement is guarded", () => {
    for (const st of stmts(down.replace(/DO \$\$[\s\S]*?END \$\$;/g, ""))) expect(st).toMatch(/IF NOT EXISTS|IF EXISTS/);
  });
  it("documents belong to the same company (composite FK) and confirmation history is RESTRICT", () => {
    expect(up).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "documents_id_companyId_key"/);
    expect(up).toMatch(/customer_ebitda_confirmations_documentId_companyId_fkey', \$c\$FOREIGN KEY \("documentId", "companyId"\) REFERENCES "documents"\("id", "companyId"\) ON DELETE RESTRICT/);
    expect(up).toMatch(/customer_ebitda_confirmations_companyId_fkey', \$c\$FOREIGN KEY \("companyId"\) REFERENCES "companies"\("id"\) ON DELETE RESTRICT/);
    expect(up).toMatch(/customer_ebitda_boxes_documentId_companyId_fkey/);
    expect(up).not.toMatch(/confirmations_\w+_fkey', \$c\$[^$]*CASCADE ON UPDATE CASCADE NOT VALID\$c\$\)[^\n]*\n[^\n]*confirm/);
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const conf = schema.slice(schema.indexOf("model CustomerEbitdaConfirmation {"), schema.indexOf("\n}", schema.indexOf("model CustomerEbitdaConfirmation {")));
    expect(conf).toMatch(/fields: \[documentId, companyId\], references: \[id, companyId\], onDelete: Restrict/);
    expect(conf).toMatch(/company\s+Company\s+@relation\(fields: \[companyId\], references: \[id\], onDelete: Restrict\)/);
    expect(up).toMatch(/'FAILED'/);
  });
});
