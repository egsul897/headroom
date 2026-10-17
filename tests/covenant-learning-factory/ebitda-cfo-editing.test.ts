/** Workstream E, Part 2 — CFO add/edit of add-backs with multi-source evidence.
 *
 *  Evidence kinds: SEC_FILING (filing-detected), OFFICERS_CERTIFICATE, ERP, CFO_ENTERED — every CFO figure carries
 *  its kind + a source reference. The CFO can confirm a listed item with any evidence kind, and can ADD an item by
 *  proposing it: a proposal whose label maps to a permitted category in THIS agreement's EBITDA definition shows
 *  MAPPED and counts only after a normal confirm; a proposal that maps to nothing shows NEEDS_INPUT, counted "0",
 *  and never flows into EBITDA. Edits are new append-only rows; history is never mutated.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { computeEbitdaBox, confirmEbitdaItem, loadProposals, proposeEbitdaItem, proposalHistory } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { handleEbitdaConfirm, handleEbitdaPropose, type EbitdaApiDeps } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { createTestIdentityHarness, registerServerIdentityProvider, resetTrustedIdentityRuntimeForTests } from "@/lib/capacity";
import { M, args, fakeStore } from "./ebitda-box-fixture";

const scope = { companyId: "c1", documentId: "d1" };
const keyOf = (label: string) => computeEbitdaBox(args).items.find((i) => i.label === label)!.inputKey;
const baseTotal = computeEbitdaBox(args).totalEbitda;

describe("confirm carries the evidence kind + reference", () => {
  it.each([
    ["OFFICERS_CERTIFICATE", "Officer's certificate 2026-09-30 (Q3 period)"],
    ["ERP", "ERP ref NS-2026-1147"],
    ["CFO_ENTERED", "Q2 2026 management accounts"],
  ] as const)("sourceKind %s is stored on the row and shown on the item's source", async (sourceKind, sourceRef) => {
    const db = fakeStore();
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: keyOf("(e)"), value: String(7 * M), source: "CFO submission", sourceKind, sourceRef, confirmedBy: "cfo@x" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(db.rows[0]).toMatchObject({ sourceKind, sourceRef });
    const e = out.box.items.find((i) => i.label === "(e)")!;
    expect(e.status).toBe("CONFIRMED");
    expect(e.counted).toBe(String(5 * M)); // the clause's $5M cap applies exactly as for a detected item
    expect(e.source[0]).toMatchObject({ kind: "CFO", evidenceKind: sourceKind, ref: sourceRef });
    expect(out.box.confirmations[0]).toMatchObject({ sourceKind, sourceRef });
  });

  it("no sourceKind → CFO_ENTERED (pre-existing clients and rows keep working)", async () => {
    const db = fakeStore();
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: keyOf("(e)"), value: String(1 * M), source: "a", confirmedBy: "cfo@x" });
    expect(out.ok && out.box.items.find((i) => i.label === "(e)")!.source[0]).toMatchObject({ kind: "CFO", evidenceKind: "CFO_ENTERED" });
  });

  it("filing-detected items are labelled SEC_FILING evidence", () => {
    const d = computeEbitdaBox(args).items.find((i) => i.label === "(d)")!;
    expect(d.source[0]).toMatchObject({ kind: "XBRL", evidenceKind: "SEC_FILING" });
  });

  it("an unknown sourceKind is refused (400) and nothing is persisted", async () => {
    const db = fakeStore();
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: keyOf("(e)"), value: String(1 * M), source: "a", sourceKind: "AUDITED_FINANCIALS" as never, confirmedBy: "cfo@x" });
    expect(out).toMatchObject({ ok: false, status: 400 });
    expect(db.rows).toHaveLength(0);
  });
});

describe("CFO add: proposals", () => {
  it("an unmapped proposal is listed as NEEDS_INPUT, counted 0, and the totals do not move", async () => {
    const db = fakeStore();
    const out = await proposeEbitdaItem(db, scope, args, { label: "loyalty programme costs", value: String(3 * M), source: "Officer's certificate pack", sourceKind: "OFFICERS_CERTIFICATE", sourceRef: "Certificate 2026-09-30", proposedBy: "cfo@x" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.proposal).toMatchObject({ status: "NEEDS_INPUT", mappedInputKey: null, sourceKind: "OFFICERS_CERTIFICATE", sourceRef: "Certificate 2026-09-30" });
    const item = out.box.items.find((i) => i.label === "loyalty programme costs")!;
    expect(item).toMatchObject({ status: "NEEDS_INPUT", counted: "0", amount: String(3 * M) });
    expect(item.source[0]).toMatchObject({ kind: "CFO", evidenceKind: "OFFICERS_CERTIFICATE", ref: "Certificate 2026-09-30" });
    expect(out.box.totalEbitda).toBe(baseTotal);
    expect(out.box.confirmedAddBacks).toBe(computeEbitdaBox(args).confirmedAddBacks);
    expect(db.proposals).toHaveLength(1);
  });

  it("a proposal naming a permitted category (clause label or the clause's own words) is MAPPED and counts only after a confirm", async () => {
    const db = fakeStore();
    const byLabel = await proposeEbitdaItem(db, scope, args, { label: "(e)", value: String(7 * M), source: "ERP extract", sourceKind: "ERP", sourceRef: "ERP ref 88", proposedBy: "cfo@x" });
    expect(byLabel.ok && byLabel.proposal).toMatchObject({ status: "MAPPED", mappedInputKey: keyOf("(e)") });
    if (!byLabel.ok) return;
    // Not counted yet, and not duplicated as a second item: the flag item represents it.
    expect(byLabel.box.items.filter((i) => i.label === "(e)")).toHaveLength(1);
    expect(byLabel.box.items.find((i) => i.label === "(e)")!.status).toBe("PENDING");
    expect(byLabel.box.totalEbitda).toBe(baseTotal);
    // Confirm flows it in — validated (capped) in the locked transaction like any detected item.
    const conf = await confirmEbitdaItem(db, scope, args, { inputKey: keyOf("(e)"), value: String(7 * M), source: "ERP extract", sourceKind: "ERP", sourceRef: "ERP ref 88", confirmedBy: "cfo@x" });
    expect(conf.ok).toBe(true);
    if (!conf.ok) return;
    expect(conf.box.items.find((i) => i.label === "(e)")!).toMatchObject({ status: "CONFIRMED", counted: String(5 * M) });
    expect(conf.box.proposals.find((p) => p.label === "(e)")).toMatchObject({ status: "MAPPED" });

    const db2 = fakeStore();
    const byWords = await proposeEbitdaItem(db2, scope, args, { label: "costs of new systems implementation", value: String(1 * M), source: "cert", sourceKind: "OFFICERS_CERTIFICATE", sourceRef: "2026-09-30", proposedBy: "cfo@x" });
    expect(byWords.ok && byWords.proposal).toMatchObject({ status: "MAPPED", mappedInputKey: keyOf("(e)") });
  });

  it("edit = a new row superseding the old: latest wins, history is never mutated", async () => {
    const db = fakeStore();
    await proposeEbitdaItem(db, scope, args, { label: "loyalty programme costs", value: String(3 * M), source: "a", sourceKind: "CFO_ENTERED", proposedBy: "cfo@x" });
    const out = await proposeEbitdaItem(db, scope, args, { label: "Loyalty Programme Costs", value: String(4 * M), source: "b", sourceKind: "ERP", sourceRef: "ERP ref 9", proposedBy: "cfo@x" });
    expect(out.ok).toBe(true);
    const hist = await proposalHistory(db, scope);
    expect(hist.map((r) => [r.amount, r.source])).toEqual([[String(3 * M), "a"], [String(4 * M), "b"]]);
    const current = await loadProposals(db, scope);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ amount: String(4 * M), sourceKind: "ERP" });
    if (out.ok) expect(out.box.items.find((i) => i.status === "NEEDS_INPUT")!.amount).toBe(String(4 * M));
  });

  it("a proposal beyond the plausible bound is refused (422) inside the same validation as a confirm; nothing persisted", async () => {
    const db = fakeStore();
    const out = await proposeEbitdaItem(db, scope, args, { label: "(e)", value: String(1_001 * M), source: "a", sourceKind: "CFO_ENTERED", proposedBy: "cfo@x" });
    expect(out).toMatchObject({ ok: false, status: 422, code: "OUT_OF_RANGE" });
    expect(db.proposals).toHaveLength(0);
    expect(db.boxes).toHaveLength(0);
  });

  it("proposals require stated evidence: missing source or an unknown kind is refused", async () => {
    const db = fakeStore();
    expect(await proposeEbitdaItem(db, scope, args, { label: "x", value: "1", source: " ", sourceKind: "ERP", proposedBy: "cfo@x" })).toMatchObject({ ok: false, status: 400 });
    expect(await proposeEbitdaItem(db, scope, args, { label: "x", value: "1", source: "a", sourceKind: "GUESS" as never, proposedBy: "cfo@x" })).toMatchObject({ ok: false, status: 400 });
    expect(db.proposals).toHaveLength(0);
  });

  it("idempotency: same key + payload replays; a different payload is 409", async () => {
    const db = fakeStore();
    const req = { label: "loyalty programme costs", value: String(3 * M), source: "a", sourceKind: "ERP" as const, sourceRef: "r1", proposedBy: "cfo@x", idempotencyKey: "p1" };
    const first = await proposeEbitdaItem(db, scope, args, req);
    const again = await proposeEbitdaItem(db, scope, args, req);
    expect(first.ok && again.ok && again.replayed).toBe(true);
    expect(db.proposals).toHaveLength(1);
    expect(await proposeEbitdaItem(db, scope, args, { ...req, value: String(9 * M) })).toMatchObject({ ok: false, status: 409 });
    expect(db.proposals).toHaveLength(1);
  });
});

describe("propose API: same write gate as confirm", () => {
  let db = fakeStore();
  const deps = (): EbitdaApiDeps => ({
    store: () => db,
    documentBelongsTo: async (c) => c === "c1",
    pipelineArgsFor: async () => args,
    refresh: async () => null,
    companyIdentityLoader: async (id) => ({ id, tenantKind: "CUSTOMER" }),
  });
  const post = (handler: typeof handleEbitdaPropose, body: unknown, token?: string) => handler(deps(), new Request("http://x/p", { method: "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify(body) }), scope);
  beforeEach(() => {
    db = fakeStore();
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    const who = (principalId: string, companyScope: string[]) => ({ principalId, companyScope, permissions: ["REVIEW_EVIDENCE", "SUBMIT_EVIDENCE"] as never, completenessRoles: [] as never, identityAssurance: "SESSION_AUTHENTICATED" as const, expiresAtMs: Date.now() + 3600_000, authorizationBasis: "session:verified:test" });
    registerServerIdentityProvider(createTestIdentityHarness({ allowTestHarness: true, principalsByHandle: { cfo: who("cfo-principal", ["c1"]), outsider: who("outsider", ["c-other"]) } }));
  });
  afterEach(() => resetTrustedIdentityRuntimeForTests({ allowTestReset: true }));

  it("unauthenticated → 401; cross-company principal → 404; scoped CFO → 200 and proposedBy is the principal", async () => {
    const body = { label: "loyalty programme costs", value: 3 * M, source: "cert pack", sourceKind: "OFFICERS_CERTIFICATE", sourceRef: "2026-09-30" };
    expect((await post(handleEbitdaPropose, body)).status).toBe(401);
    expect((await post(handleEbitdaPropose, body, "outsider")).status).toBe(404);
    expect(db.proposals).toHaveLength(0);
    const ok = await post(handleEbitdaPropose, body, "cfo");
    expect(ok.status).toBe(200);
    expect(db.proposals[0]).toMatchObject({ proposedBy: "cfo-principal", sourceKind: "OFFICERS_CERTIFICATE", sourceRef: "2026-09-30" });
    expect((ok.body as { proposal: { status: string } }).proposal.status).toBe("NEEDS_INPUT");
  });

  it("confirm via the API carries sourceKind/sourceRef through; a bad kind is 400", async () => {
    const ok = await post(handleEbitdaConfirm as typeof handleEbitdaPropose, { inputKey: keyOf("(e)"), value: 2 * M, source: "cert", sourceKind: "OFFICERS_CERTIFICATE", sourceRef: "2026-09-30" }, "cfo");
    expect(ok.status).toBe(200);
    expect(db.rows[0]).toMatchObject({ sourceKind: "OFFICERS_CERTIFICATE", sourceRef: "2026-09-30", confirmedBy: "cfo-principal" });
    expect((await post(handleEbitdaConfirm as typeof handleEbitdaPropose, { inputKey: keyOf("(e)"), value: 2 * M, source: "cert", sourceKind: "LEDGER" }, "cfo")).status).toBe(400);
  });
});

describe("migration 20261017090000: guarded up/down, RESTRICT history, evidence vocabulary", () => {
  const dir = "prisma/migrations/20261017090000_customer_ebitda_evidence_proposals";
  const up = readFileSync(`${dir}/migration.sql`, "utf8"), down = readFileSync(`${dir}/down.sql`, "utf8");
  const stmts = (sql: string) => sql.replace(/--[^\n]*/g, "").split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);
  it("every up statement is guarded", () => {
    for (const st of stmts(up.replace(/DO \$\$[\s\S]*?END \$\$;/g, ""))) expect(st).toMatch(/IF NOT EXISTS|OWNED BY/);
    expect(up).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = c\.name/);
  });
  it("every down statement is guarded", () => {
    for (const st of stmts(down.replace(/DO \$\$[\s\S]*?END \$\$;/g, ""))) expect(st).toMatch(/IF EXISTS/);
  });
  it("the schema carries the proposal model with RESTRICT FKs and the confirmation evidence columns", () => {
    expect(up).toMatch(/'OFFICERS_CERTIFICATE', 'ERP', 'CFO_ENTERED'/);
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const prop = schema.slice(schema.indexOf("model CustomerEbitdaProposal {"), schema.indexOf("\n}", schema.indexOf("model CustomerEbitdaProposal {")));
    expect(prop).toMatch(/fields: \[documentId, companyId\], references: \[id, companyId\], onDelete: Restrict/);
    expect(prop).toMatch(/sourceKind\s+String/);
    const conf = schema.slice(schema.indexOf("model CustomerEbitdaConfirmation {"), schema.indexOf("\n}", schema.indexOf("model CustomerEbitdaConfirmation {")));
    expect(conf).toMatch(/sourceKind\s+String\?/);
    expect(conf).toMatch(/sourceRef\s+String\?/);
  });
});
