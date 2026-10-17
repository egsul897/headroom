/** Workstream E, Part 3 — LENDER_APPROVAL separation of duties.
 *
 *  A conditional add-back counts only when BOTH its amount and its lender approval are confirmed. The approval
 *  attests an external fact, so it must be recorded by a different principal than the one who confirmed the
 *  amount it unlocks: a LENDER_APPROVAL whose confirmedBy equals the current AMOUNT confirmation's confirmedBy
 *  for the same key is refused (409 SEPARATION_OF_DUTIES) and nothing is persisted. The rule is data-driven —
 *  it compares the two identities recorded on the append-only confirmation rows; no user id is hardcoded.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeEbitdaBox, confirmEbitdaItem } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { handleEbitdaConfirm, type EbitdaApiDeps } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { createTestIdentityHarness, registerServerIdentityProvider, resetTrustedIdentityRuntimeForTests } from "@/lib/capacity";
import { M, args, fakeStore } from "./ebitda-box-fixture";

const scope = { companyId: "c1", documentId: "d1" };
// Clause (f): "other non-recurring costs approved in writing by the Administrative Agent" — the CONDITIONAL item.
const keyF = computeEbitdaBox(args).items.find((i) => i.label === "(f)")!.inputKey;
const amount = (by: string, value = 2 * M) => ({ inputKey: keyF, value: String(value), source: "Q2 management accounts", confirmedBy: by });
const approval = (by: string) => ({ inputKey: keyF, kind: "LENDER_APPROVAL" as const, source: "Agent approval letter 2026-07-15", confirmedBy: by });

describe("separation of duties on LENDER_APPROVAL", () => {
  it("the principal who confirmed the amount cannot also record the lender approval (409, nothing persisted)", async () => {
    const db = fakeStore();
    expect((await confirmEbitdaItem(db, scope, args, amount("cfo@x"))).ok).toBe(true);
    const out = await confirmEbitdaItem(db, scope, args, approval("cfo@x"));
    expect(out).toMatchObject({ ok: false, status: 409, code: "SEPARATION_OF_DUTIES" });
    expect(db.rows).toHaveLength(1); // only the amount row; the refused approval left no trace
  });

  it("a different principal's approval completes the item; both identities are recorded on the box", async () => {
    const db = fakeStore();
    await confirmEbitdaItem(db, scope, args, amount("cfo@x"));
    const out = await confirmEbitdaItem(db, scope, args, approval("treasurer@x"));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.box.items.find((i) => i.label === "(f)")!).toMatchObject({ status: "CONFIRMED", counted: String(2 * M) });
    const byKind = new Map(out.box.confirmations.map((c) => [c.kind, c.confirmedBy]));
    expect(byKind.get("AMOUNT")).toBe("cfo@x");
    expect(byKind.get("LENDER_APPROVAL")).toBe("treasurer@x");
    expect(db.rows.map((r) => [r.kind, r.confirmedBy])).toEqual([["AMOUNT", "cfo@x"], ["LENDER_APPROVAL", "treasurer@x"]]);
  });

  it("an approval recorded before any amount exists is allowed (no underlying confirmer to conflict with)", async () => {
    const db = fakeStore();
    const out = await confirmEbitdaItem(db, scope, args, approval("cfo@x"));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.box.items.find((i) => i.label === "(f)")!.status).toBe("CONDITIONAL"); // still not counted
  });

  it("the check follows the CURRENT amount confirmer: after a second principal re-confirms the amount, the first may approve", async () => {
    const db = fakeStore();
    await confirmEbitdaItem(db, scope, args, amount("cfo@x"));
    expect(await confirmEbitdaItem(db, scope, args, approval("cfo@x"))).toMatchObject({ ok: false, status: 409, code: "SEPARATION_OF_DUTIES" });
    await confirmEbitdaItem(db, scope, args, amount("treasurer@x", 3 * M)); // supersedes cfo@x's amount
    const out = await confirmEbitdaItem(db, scope, args, approval("cfo@x"));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.box.items.find((i) => i.label === "(f)")!).toMatchObject({ status: "CONFIRMED", counted: String(3 * M) });
  });
});

describe("separation of duties through the confirm API", () => {
  let db = fakeStore();
  const deps = (): EbitdaApiDeps => ({
    store: () => db,
    documentBelongsTo: async (c) => c === "c1",
    pipelineArgsFor: async () => args,
    refresh: async () => null,
    companyIdentityLoader: async (id) => ({ id, tenantKind: "CUSTOMER" }),
  });
  const post = (body: unknown, token: string) => handleEbitdaConfirm(deps(), new Request("http://x/c", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }), scope);
  beforeEach(() => {
    db = fakeStore();
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    const who = (principalId: string) => ({ principalId, companyScope: ["c1"], permissions: ["REVIEW_EVIDENCE", "SUBMIT_EVIDENCE"] as never, completenessRoles: [] as never, identityAssurance: "SESSION_AUTHENTICATED" as const, expiresAtMs: Date.now() + 3600_000, authorizationBasis: "session:verified:test" });
    registerServerIdentityProvider(createTestIdentityHarness({ allowTestHarness: true, principalsByHandle: { cfo: who("cfo-principal"), approver: who("approver-principal") } }));
  });
  afterEach(() => resetTrustedIdentityRuntimeForTests({ allowTestReset: true }));

  it("amount by cfo-principal → its own approval is 409 SEPARATION_OF_DUTIES; approver-principal's approval is 200", async () => {
    expect((await post({ inputKey: keyF, value: 2 * M, source: "Q2 accounts" }, "cfo")).status).toBe(200);
    const refused = await post({ inputKey: keyF, kind: "LENDER_APPROVAL", source: "Agent letter" }, "cfo");
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "SEPARATION_OF_DUTIES" });
    expect(db.rows).toHaveLength(1);
    expect((await post({ inputKey: keyF, kind: "LENDER_APPROVAL", source: "Agent letter" }, "approver")).status).toBe(200);
    expect(db.rows.map((r) => [r.kind, r.confirmedBy])).toEqual([["AMOUNT", "cfo-principal"], ["LENDER_APPROVAL", "approver-principal"]]);
  });
});
