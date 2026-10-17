/** Workstream E, Part 1 — production sign-in for the EBITDA endpoints: the authorization matrix, pinned.
 *
 *  What the endpoints require (ebitda-box-api.ts, unchanged semantics): the request credential is verified by the
 *  host-registered ServerIdentityProvider (lib/capacity/identity/provider-contract.ts `verifyAndMintPrincipal`) and
 *  the minted principal is gated per company by lib/customer-workflow/workspace-access.ts — reads need
 *  REVIEW_EVIDENCE, writes (confirm / refresh) need SUBMIT_EVIDENCE and a principal (never the request body).
 *  Anonymous access exists ONLY for a read on an EVALUATION workspace with an explicit registered grant.
 *
 *  PRODUCTION BLOCKER (flagged, not worked around): this tree contains no session stack at all — no next-auth
 *  dependency, no User/Membership models, no lib/auth session helper — and no production code calls
 *  registerServerIdentityProvider. TRUSTED_IDENTITY_PRODUCTION_ACTIVATION stays "BLOCKED"
 *  (lib/capacity/identity/activation.ts). So on a real deployment today the gate fails closed for every
 *  CUSTOMER-workspace read and for every write. These tests pin the gate's behavior with the test identity harness; flipping production on
 *  requires the host to register a real provider (the release lineage's NextAuth bridge does this for the
 *  rulebook surfaces) — a policy + wiring decision for the parent/Egzon, not something to fake here.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeEbitdaBox } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { handleEbitdaConfirm, handleEbitdaGet, type EbitdaApiDeps } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { createTestIdentityHarness, registerServerIdentityProvider, resetTrustedIdentityRuntimeForTests } from "@/lib/capacity";
import { clearEvaluationAnonymousReadGrantsForTests, registerEvaluationAnonymousReadGrant } from "@/lib/customer-workflow/evaluation-anonymous-read-policy";
import { M, args, fakeStore } from "./ebitda-box-fixture";

const CUSTOMER = "c1", EVAL = "c-eval";
const tenant: Record<string, "CUSTOMER" | "EVALUATION"> = { [CUSTOMER]: "CUSTOMER", [EVAL]: "EVALUATION" };
let db = fakeStore();
const deps = (): EbitdaApiDeps => ({
  store: () => db,
  documentBelongsTo: async () => true,
  pipelineArgsFor: async () => args,
  refresh: async (c, d) => { const box = computeEbitdaBox(args); const { id } = await db.customerEbitdaBox.create({ data: { companyId: c, documentId: d, status: box.status, version: box.version, payload: box } }); return { box, id }; },
  companyIdentityLoader: async (id) => (tenant[id] ? { id, tenantKind: tenant[id]! } : null),
});
const P = (companyId: string) => ({ companyId, documentId: "d1" });
const keyOf = (label: string) => computeEbitdaBox(args).items.find((i) => i.label === label)!.inputKey;
const get = (token?: string, q = "") => new Request(`http://x/e${q}`, token ? { headers: { authorization: `Bearer ${token}` } } : {});
const post = (token?: string) => new Request("http://x/c", { method: "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify({ inputKey: keyOf("(e)"), value: 1 * M, source: "Q2 accounts" }) });
const who = (principalId: string, companyScope: string[], permissions: string[], expiresAtMs = Date.now() + 3600_000) =>
  ({ principalId, companyScope, permissions: permissions as never, completenessRoles: [] as never, identityAssurance: "SESSION_AUTHENTICATED" as const, expiresAtMs, authorizationBasis: "session:verified:test" });

beforeEach(() => {
  db = fakeStore();
  resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
  registerServerIdentityProvider(createTestIdentityHarness({ allowTestHarness: true, principalsByHandle: {
    cfo: who("cfo-principal", [CUSTOMER, EVAL], ["REVIEW_EVIDENCE", "SUBMIT_EVIDENCE"]),
    expired: who("expired-principal", [CUSTOMER], ["REVIEW_EVIDENCE", "SUBMIT_EVIDENCE"], Date.now() - 1_000),
  } }));
});
afterEach(() => { resetTrustedIdentityRuntimeForTests({ allowTestReset: true }); clearEvaluationAnonymousReadGrantsForTests({ allowTestReset: true }); });

describe("writes: a presented credential that does not verify is refused, never downgraded", () => {
  it("POST confirm with an unknown/forged credential → 401, nothing persisted", async () => {
    expect((await handleEbitdaConfirm(deps(), post("forged"), P(CUSTOMER))).status).toBe(401);
    expect(db.rows).toHaveLength(0);
  });
  it("POST confirm with an expired credential → 401, nothing persisted", async () => {
    expect((await handleEbitdaConfirm(deps(), post("expired"), P(CUSTOMER))).status).toBe(401);
    expect(db.rows).toHaveLength(0);
  });
  it("GET ?refresh=1 with a forged credential → 401 and no box is computed", async () => {
    expect((await handleEbitdaGet(deps(), get("forged", "?refresh=1"), P(CUSTOMER))).status).toBe(401);
    expect(db.boxes).toHaveLength(0);
  });
});

describe("anonymous reads exist only for EVALUATION workspaces with an explicit grant", () => {
  it("no grant registered → anonymous GET on an EVALUATION workspace is refused (404, no box data)", async () => {
    await deps().refresh(EVAL, "d1");
    const r = await handleEbitdaGet(deps(), get(), P(EVAL));
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/totalEbitda/);
  });
  it("grant registered → anonymous GET reads; the grant never extends to another company or to writes", async () => {
    registerEvaluationAnonymousReadGrant({ companyId: EVAL, policyBasis: "test", allowAnonymousRead: true });
    await deps().refresh(EVAL, "d1");
    expect((await handleEbitdaGet(deps(), get(), P(EVAL))).status).toBe(200);
    await deps().refresh(CUSTOMER, "d1");
    expect((await handleEbitdaGet(deps(), get(), P(CUSTOMER))).status).toBe(404);
    expect((await handleEbitdaConfirm(deps(), post(), P(EVAL))).status).toBe(401);
    expect(db.rows).toHaveLength(0);
  });
});
