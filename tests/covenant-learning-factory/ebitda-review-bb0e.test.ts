/** Reviewer PASS_WITH_NOTES at bb0ed766: SEC errors on confirm → 503, locked + generation-checked FAILED writes,
 *  structured FAILED fields, mandatory lock, gain inside the lock. Self-contained: no SEC identity needed. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeEbitdaBox, confirmEbitdaItem, financialsForCik, latestEbitdaBox, recordEbitdaBoxFailure, refreshBoxCommitted, withDocumentTransaction, type EbitdaBox } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { handleEbitdaConfirm, type EbitdaApiDeps } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { createTestIdentityHarness, registerServerIdentityProvider, resetTrustedIdentityRuntimeForTests } from "@/lib/capacity";
import { M, args, fakeStore } from "./ebitda-box-fixture";

const scope = { companyId: "c1", documentId: "d1" };
const keyOf = (label: string) => computeEbitdaBox(args).items.find((i) => i.label === label)!.inputKey;

describe("(b) SEC unavailable during POST confirm → 503 SEC_UNAVAILABLE, never a 500", () => {
  const saved = { ua: process.env.SEC_EDGAR_USER_AGENT, email: process.env.SEC_EDGAR_CONTACT_EMAIL };
  let db = fakeStore();
  beforeEach(() => {
    db = fakeStore();
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    registerServerIdentityProvider(createTestIdentityHarness({ allowTestHarness: true, principalsByHandle: { cfo: { principalId: "cfo", companyScope: ["c1"], permissions: ["REVIEW_EVIDENCE", "SUBMIT_EVIDENCE"], completenessRoles: [], identityAssurance: "SESSION_AUTHENTICATED", expiresAtMs: Date.now() + 3600_000, authorizationBasis: "session:verified:test" } } }));
  });
  afterEach(() => {
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    for (const [k, v] of [["SEC_EDGAR_USER_AGENT", saved.ua], ["SEC_EDGAR_CONTACT_EMAIL", saved.email]] as const) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  });
  const deps = (fetchImpl: typeof fetch): EbitdaApiDeps => ({
    store: () => db, documentBelongsTo: async () => true, refresh: async () => null,
    companyIdentityLoader: async (id) => ({ id, tenantKind: "CUSTOMER" }),
    pipelineArgsFor: async () => ({ ...args, ...(await financialsForCik("1", fetchImpl)) }),
  });
  const post = (d: EbitdaApiDeps) => handleEbitdaConfirm(d, new Request("http://x/c", { method: "POST", headers: { authorization: "Bearer cfo", "content-type": "application/json" }, body: JSON.stringify({ inputKey: keyOf("(e)"), value: 1 * M, source: "a" }) }), scope);
  const never = (async () => { throw new Error("fetch must not be called without an SEC identity"); }) as unknown as typeof fetch;

  it("missing SEC identity", async () => {
    delete process.env.SEC_EDGAR_USER_AGENT; delete process.env.SEC_EDGAR_CONTACT_EMAIL;
    const r = await post(deps(never));
    expect(r).toMatchObject({ status: 503, body: { code: "SEC_UNAVAILABLE" } });
    expect(db.rows).toHaveLength(0);
  });
  it("placeholder SEC identity", async () => {
    process.env.SEC_EDGAR_USER_AGENT = "headroom ops@example.com";
    expect(await post(deps(never))).toMatchObject({ status: 503, body: { code: "SEC_UNAVAILABLE" } });
  });
  it("SEC outage (network error / non-retryable status)", async () => {
    process.env.SEC_EDGAR_USER_AGENT = "headroom-unit-test operator@headroom-unit-test.dev"; // fetch below is mocked
    const down = (async () => { throw new TypeError("fetch failed: ECONNRESET"); }) as unknown as typeof fetch;
    expect(await post(deps(down))).toMatchObject({ status: 503, body: { code: "SEC_UNAVAILABLE" } });
    const forbidden = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    expect(await post(deps(forbidden))).toMatchObject({ status: 503, body: { code: "SEC_UNAVAILABLE" } });
    expect(db.rows).toHaveLength(0);
  });
});

describe("(c) FAILED writes: same lock + transaction, never over a newer box", () => {
  it("a stale failure (its run started before a READY box was committed) does not overwrite that READY box", async () => {
    const db = fakeStore();
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const refresh = refreshBoxCommitted(db, scope, async () => { await slow; throw new Error("SEC 503"); });
    const ok = await confirmEbitdaItem(db, scope, args, { inputKey: keyOf("(e)"), value: String(2 * M), source: "a", confirmedBy: "u1" });
    expect(ok.ok).toBe(true);
    release();
    await refresh;
    const latest = await latestEbitdaBox(db, scope);
    expect(latest?.status).toBe("READY");
    expect(latest?.items.find((i) => i.label === "(e)")?.counted).toBe(String(2 * M));
    expect(db.boxes.filter((b) => (b.payload as EbitdaBox).status === "FAILED")).toHaveLength(0);
  });
  it("a current failure is written under the lock, with structured staleSince / lastGoodBoxId", async () => {
    const db = fakeStore();
    const ok = await confirmEbitdaItem(db, scope, args, { inputKey: keyOf("(e)"), value: String(2 * M), source: "a", confirmedBy: "u1" });
    const locksBefore = db.locks.length;
    const r = await refreshBoxCommitted(db, scope, async () => { throw new Error("SEC 503"); });
    expect(db.locks.length).toBeGreaterThan(locksBefore);
    expect(r?.box).toMatchObject({ status: "FAILED", lastGoodBoxId: ok.ok ? ok.boxId : "x", staleSince: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) });
    const direct = await recordEbitdaBoxFailure(db, scope, new Error("x"), { generation: "not-the-latest" });
    expect(direct.skipped).toBe(true);
  });
});

describe("notes", () => {
  it("the lock is mandatory: a store without $queryRawUnsafe is refused", async () => {
    const db = fakeStore();
    delete (db as { $queryRawUnsafe?: unknown }).$queryRawUnsafe;
    await expect(withDocumentTransaction(db, scope, async () => 1)).rejects.toThrow(/lock/);
    await expect(confirmEbitdaItem(db, scope, args, { inputKey: keyOf("(e)"), value: String(1 * M), source: "a", confirmedBy: "u1" })).rejects.toThrow(/lock/);
    expect(db.rows).toHaveLength(0);
  });
  it("gain is computed inside the lock (sees what committed while waiting for it)", async () => {
    const db = fakeStore();
    const kf = keyOf("(f)");
    let once = true;
    db.onLock = () => {
      if (!once) return; once = false;
      db.rows.push({ id: "r-approval", companyId: "c1", documentId: "d1", inputKey: kf, kind: "LENDER_APPROVAL", value: "1", source: "consent", confirmedBy: "u9", idempotencyKey: "approval", createdAt: new Date(0) });
    };
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: kf, value: String(2 * M), source: "a", confirmedBy: "u1" });
    expect(out.ok && out.gain?.ebitda).toBe(String(2 * M));
    expect(out.ok && out.box.items.find((i) => i.label === "(f)")?.status).toBe("CONFIRMED");
  });
});
