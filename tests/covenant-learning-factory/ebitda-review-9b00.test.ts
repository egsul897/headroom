/** Reviewer PASS_WITH_NOTES at 9b00805a: (1) a DB-assigned sequence orders boxes and confirmations (timestamps can
 *  tie); (2) the 503 body is generic and leaks no env name, URL or CIK (detail is logged server-side). Self-contained:
 *  no SEC identity or network needed. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boxGeneration, computeEbitdaBox, confirmEbitdaItem, financialsForCik, latestEbitdaBox, loadConfirmations, recordEbitdaBoxFailure, refreshBoxCommitted, saveEbitdaBox, type EbitdaBox } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { handleEbitdaConfirm, type EbitdaApiDeps } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { createTestIdentityHarness, registerServerIdentityProvider, resetTrustedIdentityRuntimeForTests } from "@/lib/capacity";
import { M, args, fakeStore } from "./ebitda-box-fixture";

const scope = { companyId: "c1", documentId: "d1" };
const keyOf = (label: string) => computeEbitdaBox(args).items.find((i) => i.label === label)!.inputKey;

describe("(1) the DB sequence, not createdAt, decides 'latest' (timestamps tie)", () => {
  it("latest box and generation follow write order when createdAt ties", async () => {
    const db = fakeStore();
    db.frozenClock = true;
    db.nextBoxIds = ["a-old", "z-new"]; // id order is the opposite of write order
    await saveEbitdaBox(db, scope, { ...computeEbitdaBox(args), reason: "old" } as EbitdaBox);
    await saveEbitdaBox(db, scope, { ...computeEbitdaBox(args), reason: "new" } as EbitdaBox);
    expect((await latestEbitdaBox(db, scope))?.reason).toBe("new");
    expect(await boxGeneration(db, scope)).toBe("z-new");
  });
  it("a failure whose generation is the true latest box is written (not mistaken for stale)", async () => {
    const db = fakeStore();
    db.frozenClock = true;
    db.nextBoxIds = ["a-old", "z-new"];
    await saveEbitdaBox(db, scope, computeEbitdaBox(args));
    await saveEbitdaBox(db, scope, computeEbitdaBox(args));
    const r = await recordEbitdaBoxFailure(db, scope, new Error("boom"), { generation: "z-new" });
    expect(r.skipped).toBeUndefined();
    expect(r.box).toMatchObject({ status: "FAILED", lastGoodBoxId: "z-new" });
  });
  it("latest confirmation per key follows write order when createdAt ties", async () => {
    const db = fakeStore();
    db.frozenClock = true;
    db.nextRowIds = ["r-z", "r-a"];
    const k = keyOf("(e)");
    expect((await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(1 * M), source: "first", confirmedBy: "u" })).ok).toBe(true);
    const second = await confirmEbitdaItem(db, scope, args, { inputKey: k, value: String(2 * M), source: "second", confirmedBy: "u" });
    expect(second.ok).toBe(true);
    expect((await loadConfirmations(db, scope)).map((c) => c.value)).toEqual([String(2 * M)]);
    expect((await latestEbitdaBox(db, scope))?.items.find((i) => i.label === "(e)")?.counted).toBe(String(2 * M));
  });
});

describe("(2) 503 SEC_UNAVAILABLE body is generic; the detail is only logged", () => {
  const saved = { ua: process.env.SEC_EDGAR_USER_AGENT, email: process.env.SEC_EDGAR_CONTACT_EMAIL };
  const UA = "headroom-unit-test operator@headroom-unit-test.dev";
  const CIK = "320193";
  let db = fakeStore();
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    db = fakeStore();
    log = vi.spyOn(console, "error").mockImplementation(() => {});
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    registerServerIdentityProvider(createTestIdentityHarness({ allowTestHarness: true, principalsByHandle: { cfo: { principalId: "cfo", companyScope: ["c1"], permissions: ["REVIEW_EVIDENCE", "SUBMIT_EVIDENCE"], completenessRoles: [], identityAssurance: "SESSION_AUTHENTICATED", expiresAtMs: Date.now() + 3600_000, authorizationBasis: "session:verified:test" } } }));
  });
  afterEach(() => {
    log.mockRestore();
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    for (const [k, v] of [["SEC_EDGAR_USER_AGENT", saved.ua], ["SEC_EDGAR_CONTACT_EMAIL", saved.email]] as const) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  });
  const deps = (fetchImpl: typeof fetch): EbitdaApiDeps => ({
    store: () => db, documentBelongsTo: async () => true, refresh: async () => null,
    companyIdentityLoader: async (id) => ({ id, tenantKind: "CUSTOMER" }),
    pipelineArgsFor: async () => ({ ...args, ...(await financialsForCik(CIK, fetchImpl)) }),
  });
  const post = (d: EbitdaApiDeps) => handleEbitdaConfirm(d, new Request("http://x/c", { method: "POST", headers: { authorization: "Bearer cfo", "content-type": "application/json" }, body: JSON.stringify({ inputKey: keyOf("(e)"), value: 1 * M, source: "a" }) }), scope);
  const leaks = (body: unknown) => {
    const s = JSON.stringify(body);
    return ["SEC_EDGAR", "USER_AGENT", "CONTACT_EMAIL", "http", "sec.gov", "data.sec", CIK, "example.com", "headroom-unit-test", "ECONNRESET"].filter((t) => s.includes(t));
  };
  const outage = (async (url: unknown) => { throw new TypeError(`fetch failed: ECONNRESET ${String(url)}`); }) as unknown as typeof fetch;
  const never = (async () => { throw new Error("fetch must not be called"); }) as unknown as typeof fetch;

  it.each([
    ["missing identity", () => { delete process.env.SEC_EDGAR_USER_AGENT; delete process.env.SEC_EDGAR_CONTACT_EMAIL; }, never],
    ["placeholder identity", () => { process.env.SEC_EDGAR_USER_AGENT = "headroom ops@example.com"; }, never],
    ["network outage", () => { process.env.SEC_EDGAR_USER_AGENT = UA; }, outage],
  ] as const)("%s: body is exactly { error: <generic>, code } and leaks nothing; detail is logged", async (_n, setup, f) => {
    setup();
    const r = await post(deps(f));
    expect(r.status).toBe(503);
    expect(Object.keys(r.body as object).sort()).toEqual(["code", "error"]);
    expect(r.body).toMatchObject({ code: "SEC_UNAVAILABLE", error: expect.stringMatching(/unavailable/i) });
    expect(leaks(r.body)).toEqual([]);
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toMatch(/SEC/);
  });

  it("a FAILED box from an SEC error surfaces a generic reason (GET shows it), detail logged", async () => {
    process.env.SEC_EDGAR_USER_AGENT = UA;
    const r = await refreshBoxCommitted(db, scope, async () => ({ ...args, ...(await financialsForCik(CIK, outage)) }));
    expect(r?.box.status).toBe("FAILED");
    expect(leaks(r?.box.reason)).toEqual([]);
    expect(leaks((await latestEbitdaBox(db, scope))?.reason)).toEqual([]);
    expect(log).toHaveBeenCalled();
    // a non-SEC failure keeps its (internal, non-secret) message
    const r2 = await recordEbitdaBoxFailure(db, scope, new Error("parser exploded"), { generation: await boxGeneration(db, scope) });
    expect(r2.box.reason).toMatch(/parser exploded/);
  });
});
