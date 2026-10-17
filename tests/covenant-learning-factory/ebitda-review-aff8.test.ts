/** Reviewer FAIL at aff86f7b: CFO-confirm hardening (blocker 1) and API authentication / tenant checks (blocker 2). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeEbitdaBox, confirmEbitdaItem, confirmationHistory, loadConfirmations } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { handleEbitdaConfirm, handleEbitdaGet, type EbitdaApiDeps } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { runAfterResponse } from "@/lib/covenant-learning-factory/pipeline/after-response";
import { createTestIdentityHarness, PERMISSION_BUNDLES, registerServerIdentityProvider, resetTrustedIdentityRuntimeForTests } from "@/lib/capacity";
import { clearEvaluationAnonymousReadGrantsForTests, registerEvaluationAnonymousReadGrant } from "@/lib/customer-workflow/evaluation-anonymous-read-policy";
import { readFileSync } from "node:fs";
import { M, args, fakeStore } from "./ebitda-box-fixture";

const scope = { companyId: "c1", documentId: "d1" };
const keyOf = (label: string) => computeEbitdaBox(args).items.find((i) => i.label === label)!.inputKey;

describe("blocker 1: CFO confirm", () => {
  it("a CONDITIONAL line stays uncounted (and never CONFIRMED) after an amount confirm without the lender approval", async () => {
    const db = fakeStore();
    const before = computeEbitdaBox(args);
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: keyOf("(f)"), value: String(2 * M), source: "Q2 management accounts", confirmedBy: "u1" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const f = out.box.items.find((i) => i.label === "(f)")!;
    expect(f.status).toBe("CONDITIONAL");
    expect(f.counted).toBe("0");
    expect(out.box.totalEbitda).toBe(before.totalEbitda);
    expect(out.gain?.ebitda).toBe("0");
  });

  it("approval alone does not count it; amount + approval does; approval on a non-conditional item is 422", async () => {
    const db = fakeStore();
    const k = keyOf("(f)");
    const a = await confirmEbitdaItem(db, scope, args, { inputKey: k, kind: "LENDER_APPROVAL", source: "Agent consent 2026-07-15", confirmedBy: "u1" });
    expect(a.ok && a.box.items.find((i) => i.label === "(f)")!.status).toBe("CONDITIONAL");
    const b = await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(2 * M), source: "Q2 accounts", confirmedBy: "u1" });
    expect(b.ok && b.box.items.find((i) => i.label === "(f)")).toMatchObject({ status: "CONFIRMED", counted: String(2 * M) });
    expect(await confirmEbitdaItem(fakeStore(), scope, args, { inputKey: keyOf("(e)"), kind: "LENDER_APPROVAL", source: "x", confirmedBy: "u1" })).toMatchObject({ ok: false, status: 422 });
  });

  it("rejects negative and implausibly large values with 422; nothing persisted", async () => {
    const db = fakeStore();
    const k = keyOf("(e)");
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: k, value: "-5", source: "x", confirmedBy: "u1" })).toMatchObject({ ok: false, status: 422 });
    // base EBITDA here is $100M (net income base) → bound 10× = $1B
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(1_000 * M + 1), source: "x", confirmedBy: "u1" })).toMatchObject({ ok: false, status: 422 });
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: k, value: "10000000000000", source: "x", confirmedBy: "u1" })).toMatchObject({ ok: false, status: 422 });
    expect(db.rows.length).toBe(0);
    expect((await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(1_000 * M), source: "x", confirmedBy: "u1" })).ok).toBe(true);
  });

  it("normalises the input key canonically (case, whitespace) and stores the tracker's key; variants share one current figure", async () => {
    const db = fakeStore();
    const k = keyOf("(e)");
    await confirmEbitdaItem(db, scope, args, { inputKey: ` ${k.toLowerCase().replace(":", ": ")} `, value: String(1 * M), source: "a", confirmedBy: "u1" });
    await confirmEbitdaItem(db, scope, args, { inputKey: k.toUpperCase(), value: String(3 * M), source: "b", confirmedBy: "u1" });
    expect(db.rows.map((r) => r.inputKey)).toEqual([k, k]);
    const cur = await loadConfirmations(db, scope);
    expect(cur).toHaveLength(1);
    expect(cur[0]).toMatchObject({ key: k, value: String(3 * M) });
  });

  it("append-only: history kept, never updated in place; latest row wins", async () => {
    const db = fakeStore();
    const k = keyOf("(e)");
    await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(1 * M), source: "a", confirmedBy: "u1" });
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(2 * M), source: "b", confirmedBy: "u2" });
    expect(db.updates).toBe(0);
    const hist = await confirmationHistory(db, scope);
    expect(hist.map((r) => [r.value, r.confirmedBy])).toEqual([[String(1 * M), "u1"], [String(2 * M), "u2"]]);
    expect(out.ok && out.box.items.find((i) => i.label === "(e)")!.counted).toBe(String(2 * M));
  });

  it("idempotency key: same payload replays without a new row; a different payload is 409", async () => {
    const db = fakeStore();
    const k = keyOf("(e)");
    const first = await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(1 * M), source: "a", confirmedBy: "u1", idempotencyKey: "req-1" });
    const again = await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(1 * M), source: "a", confirmedBy: "u1", idempotencyKey: "req-1" });
    expect(first.ok && again.ok).toBe(true);
    expect(again.ok && again.replayed).toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(2 * M), source: "a", confirmedBy: "u1", idempotencyKey: "req-1" })).toMatchObject({ ok: false, status: 409 });
    expect(db.rows).toHaveLength(1);
  });
});

describe("blocker 2: API authentication and tenant checks", () => {
  const CUSTOMER = "c1", EVAL = "c-eval", OTHER = "c-other";
  const tenant: Record<string, "CUSTOMER" | "EVALUATION"> = { [CUSTOMER]: "CUSTOMER", [EVAL]: "EVALUATION", [OTHER]: "CUSTOMER" };
  let db = fakeStore();
  const deps = (): EbitdaApiDeps => ({
    store: () => db,
    documentBelongsTo: async (c, d) => d === "d1" && c !== OTHER,
    pipelineArgsFor: async () => args,
    refresh: async (c, d) => { const box = computeEbitdaBox(args); const { id } = await db.customerEbitdaBox.create({ data: { companyId: c, documentId: d, status: box.status, version: box.version, payload: box } }); return { box, id }; },
    companyIdentityLoader: async (id) => (tenant[id] ? { id, tenantKind: tenant[id]! } : null),
  });
  const req = (path: string, o: { token?: string; body?: unknown; method?: string; headers?: Record<string, string> } = {}) =>
    new Request(`http://x${path}`, { method: o.method ?? (o.body ? "POST" : "GET"), headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(o.body ? { "content-type": "application/json" } : {}), ...(o.headers ?? {}) }, ...(o.body ? { body: JSON.stringify(o.body) } : {}) });
  const P = (companyId: string) => ({ companyId, documentId: "d1" });

  beforeEach(() => {
    db = fakeStore();
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    const who = (principalId: string, companyScope: string[], permissions: readonly string[]) => ({ principalId, companyScope, permissions: [...permissions] as never, completenessRoles: [], identityAssurance: "SESSION_AUTHENTICATED" as const, expiresAtMs: Date.now() + 3600_000, authorizationBasis: "session:verified:test" });
    registerServerIdentityProvider(createTestIdentityHarness({ allowTestHarness: true, principalsByHandle: {
      cfo: who("cfo-principal", [CUSTOMER, EVAL], ["REVIEW_EVIDENCE", "SUBMIT_EVIDENCE"]),
      reader: who("reader-principal", [CUSTOMER], PERMISSION_BUNDLES.EVIDENCE_REVIEWER),
      outsider: who("outsider", [OTHER], ["REVIEW_EVIDENCE", "SUBMIT_EVIDENCE"]),
    } }));
    registerEvaluationAnonymousReadGrant({ companyId: EVAL, policyBasis: "test", allowAnonymousRead: true });
  });
  afterEach(() => { resetTrustedIdentityRuntimeForTests({ allowTestReset: true }); clearEvaluationAnonymousReadGrantsForTests({ allowTestReset: true }); });

  it("the routes go through the gated handlers and never read confirmedBy from the body", () => {
    const dir = "app/api/companies/[companyId]/documents/[documentId]/ebitda";
    const get = readFileSync(`${dir}/route.ts`, "utf8"), post = readFileSync(`${dir}/confirm/route.ts`, "utf8");
    expect(get).toMatch(/handleEbitdaGet\(/);
    expect(post).toMatch(/handleEbitdaConfirm\(/);
    expect(get + post).not.toMatch(/latestEbitdaBox|refreshEbitdaBox|confirmEbitdaItem|body\.confirmedBy/);
  });

  it("GET: anonymous on a CUSTOMER workspace and cross-tenant principals are refused (404); a scoped principal reads", async () => {
    await deps().refresh(CUSTOMER, "d1");
    expect((await handleEbitdaGet(deps(), req("/e"), P(CUSTOMER))).status).toBe(404);
    expect((await handleEbitdaGet(deps(), req("/e", { token: "outsider" }), P(CUSTOMER))).status).toBe(404);
    expect((await handleEbitdaGet(deps(), req("/e", { token: "forged" }), P(CUSTOMER))).status).toBe(404);
    expect((await handleEbitdaGet(deps(), req("/e", { token: "reader" }), P(CUSTOMER))).status).toBe(200);
  });

  it("refresh requires authentication even where anonymous read is granted, and SUBMIT_EVIDENCE on the company", async () => {
    expect((await handleEbitdaGet(deps(), req("/e?refresh=1"), P(EVAL))).status).toBe(401);
    expect((await handleEbitdaGet(deps(), req("/e?refresh=1", { token: "reader" }), P(CUSTOMER))).status).toBe(404);
    expect(db.boxes).toHaveLength(0);
    expect((await handleEbitdaGet(deps(), req("/e?refresh=1", { token: "cfo" }), P(CUSTOMER))).status).toBe(200);
    expect(db.boxes).toHaveLength(1);
  });

  it("POST: 401 without credentials; cross-tenant / wrong document 404; confirmedBy is the session principal, never the body", async () => {
    const body = { inputKey: keyOf("(e)"), value: 1 * M, source: "Q2 accounts", confirmedBy: "attacker@evil" };
    expect((await handleEbitdaConfirm(deps(), req("/c", { body }), P(CUSTOMER))).status).toBe(401);
    expect((await handleEbitdaConfirm(deps(), req("/c", { body, token: "outsider" }), P(CUSTOMER))).status).toBe(404);
    expect((await handleEbitdaConfirm(deps(), req("/c", { body, token: "reader" }), P(CUSTOMER))).status).toBe(404);
    expect((await handleEbitdaConfirm(deps(), req("/c", { body, token: "outsider" }), P(OTHER))).status).toBe(404);
    expect(db.rows).toHaveLength(0);
    const ok = await handleEbitdaConfirm(deps(), req("/c", { body, token: "cfo", headers: { "idempotency-key": "k1" } }), P(CUSTOMER));
    expect(ok.status).toBe(200);
    expect(db.rows[0]).toMatchObject({ confirmedBy: "cfo-principal", idempotencyKey: "k1" });
    const replay = await handleEbitdaConfirm(deps(), req("/c", { body, token: "cfo", headers: { "idempotency-key": "k1" } }), P(CUSTOMER));
    expect(replay.body).toMatchObject({ replayed: true });
    expect(db.rows).toHaveLength(1);
    expect((await handleEbitdaConfirm(deps(), req("/c", { body: { ...body, value: -1 }, token: "cfo" }), P(CUSTOMER))).status).toBe(422);
  });
});

describe("note: EBITDA box runs after the upload response", () => {
  it("runAfterResponse returns before the task runs and hands the promise to waitUntil", async () => {
    let ran = false; const handed: Promise<unknown>[] = [];
    runAfterResponse(async () => { ran = true; }, undefined, (p) => handed.push(p));
    expect(ran).toBe(false);
    expect(handed).toHaveLength(1);
    await handed[0];
    expect(ran).toBe(true);
  });
  it("task errors are reported, never thrown", async () => {
    const errs: unknown[] = []; const handed: Promise<unknown>[] = [];
    runAfterResponse(async () => { throw new Error("sec down"); }, (e) => { errs.push(e); }, (p) => handed.push(p));
    await handed[0];
    expect(String(errs[0])).toMatch(/sec down/);
  });
});
