import { describe, expect, it } from "vitest";
import { computeEbitdaBox, confirmEbitdaItem, latestEbitdaBox } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";

import { M, args, fakeStore } from "./ebitda-box-fixture";

describe("EBITDA box data shape", () => {
  const box = computeEbitdaBox(args);
  it("totals: base, confirmed add-backs, total", () => {
    expect(box.status).toBe("READY");
    expect(box.base?.value).toBe(String(100 * M));
    expect(box.confirmedAddBacks).toBe(String(8 * M)); // restructuring evidenced by filings
    expect(box.totalEbitda).toBe(String((100 + 20 + 30 + 50 + 8) * M));
  });
  it("items carry amount/source/clause/cap/status; nothing invented", () => {
    const d = box.items.find((i) => i.label === "(d)")!;
    expect(d).toMatchObject({ status: "EVIDENCED", counted: String(8 * M), amount: String(8 * M) });
    expect(d.source[0]).toMatchObject({ kind: "XBRL", value: String(8 * M) });
    const e = box.items.find((i) => i.label === "(e)")!;
    expect(e).toMatchObject({ status: "PENDING", counted: "0", amount: null, potentialEbitda: String(5 * M) });
    expect(e.cap?.amount).toBe(String(5 * M));
    const f = box.items.find((i) => i.label === "(f)")!;
    expect(f.status).toBe("CONDITIONAL");
    expect(f.conditionText).toMatch(/approved in writing by the Administrative Agent/);
  });
  it("extra available = known cap room on pending items; unbounded pending counted, not valued", () => {
    expect(box.extraAvailableIfConfirmed).toBe(String(5 * M));
    expect(box.pendingConditional).toBe(1);
  });
  it("no financials → NEEDS_FINANCIALS, no amounts", () => {
    const b = computeEbitdaBox({ ...args, financials: null });
    expect(b).toMatchObject({ status: "NEEDS_FINANCIALS", totalEbitda: null, items: [] });
  });
});

describe("CFO confirm flow (persisted, recomputed)", () => {
  const scope = { companyId: "c1", documentId: "d1" };
  it("confirming a capped item counts it (cap applied) and persists the figure + a new box", async () => {
    const db = fakeStore();
    const key = computeEbitdaBox(args).items.find((i) => i.label === "(e)")!.inputKey;
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: key, value: String(7 * M), source: "Q2 2026 management accounts", confirmedBy: "cfo@x" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.gain?.ebitda).toBe(String(5 * M)); // capped at $5M
    const e = out.box.items.find((i) => i.label === "(e)")!;
    expect(e).toMatchObject({ status: "CONFIRMED", counted: String(5 * M), amount: String(7 * M) });
    expect(e.source[0]).toMatchObject({ kind: "CFO" });
    expect(out.box.totalEbitda).toBe(String(213 * M));
    expect(db.rows.length).toBe(1);
    expect((await latestEbitdaBox(db, scope))?.totalEbitda).toBe(String(213 * M));
  });
  it("conditional item counts only once the CFO confirms the amount AND the lender approval", async () => {
    const db = fakeStore();
    const key = computeEbitdaBox(args).items.find((i) => i.label === "(f)")!.inputKey;
    await confirmEbitdaItem(db, scope, args, { inputKey: key, value: String(2 * M), source: "Q2 management accounts", confirmedBy: "cfo@x" });
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: key, kind: "LENDER_APPROVAL", source: "Agent approval letter 2026-07-15", confirmedBy: "cfo@x" });
    expect(out.ok && out.box.items.find((i) => i.label === "(f)")!.status).toBe("CONFIRMED");
  });
  it("refuses: no source, non-integer, unknown key; nothing persisted", async () => {
    const db = fakeStore();
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: "ADDBACK:(e)", value: "100", source: " ", confirmedBy: "cfo@x" })).toMatchObject({ ok: false, status: 400 });
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: "ADDBACK:(e)", value: "1.5", source: "x", confirmedBy: "cfo@x" })).toMatchObject({ ok: false, status: 400 });
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: "ADDBACK:(zz)", value: "100", source: "x", confirmedBy: "cfo@x" })).toMatchObject({ ok: false, status: 404 });
    expect(db.rows.length).toBe(0);
    expect(db.boxes.length).toBe(0);
  });
  it("re-confirming a key appends a row; the latest figure wins", async () => {
    const db = fakeStore();
    const key = computeEbitdaBox(args).items.find((i) => i.label === "(e)")!.inputKey;
    await confirmEbitdaItem(db, scope, args, { inputKey: key, value: String(1 * M), source: "a", confirmedBy: "cfo@x" });
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: key, value: String(2 * M), source: "b", confirmedBy: "cfo@x" });
    expect(db.rows.length).toBe(2);
    expect(out.ok && out.box.items.find((i) => i.label === "(e)")!.counted).toBe(String(2 * M));
  });
});
