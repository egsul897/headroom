import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyRelabels, indexRelabels, validateRelabelLog, type ReferenceRelabelLog } from "../../lib/covenant-learning-factory/scoreboard/reference-relabels";

const entry = (i: number, over: Record<string, unknown> = {}) => ({
  id: `RL-${String(i).padStart(4, "0")}`, date: "2026-10-15", sourceId: "s1", locator: { candidateId: `c${i}` },
  oldLabel: "LIENS", newLabel: "NOT_COVENANT_SCOPE", quote: "q", reason: "r", approver: "owner", ...over,
});
const log = (entries: unknown[]): ReferenceRelabelLog => ({ schema: "clf-scoreboard-reference-relabels/v1", entries } as never);
const input = () => ({
  source: { sourceId: "s1" }, documentText: null, definitions: [], conditions: [],
  candidates: [{ candidateId: "c1", family: "LIENS", excerpt: "x" }, { candidateId: "c2", family: "LIENS", excerpt: "y" }, { candidateId: "c3", family: "DEBT", excerpt: "z" }],
}) as never;

describe("reference relabels", () => {
  it("drops NOT_COVENANT_SCOPE and replaces families; leaves others", () => {
    const out = applyRelabels(input(), indexRelabels(log([entry(1), entry(2, { newLabel: "EVENTS_OF_DEFAULT" })]))) as { candidates: { candidateId: string; family: string }[] };
    expect(out.candidates).toEqual([{ candidateId: "c2", family: "EVENTS_OF_DEFAULT", excerpt: "y" }, { candidateId: "c3", family: "DEBT", excerpt: "z" }]);
  });
  it("fails closed on old-label mismatch or missing candidate", () => {
    expect(() => applyRelabels(input(), indexRelabels(log([entry(1, { locator: { candidateId: "c3" } })])))).toThrow(/label is DEBT/);
    expect(() => applyRelabels(input(), indexRelabels(log([entry(1, { locator: { candidateId: "zz" } })])))).toThrow(/not found/);
  });
  it("requires contiguous ids, complete records, no duplicate locators", () => {
    expect(validateRelabelLog(log([entry(2)])).join()).toMatch(/RL-0001/);
    expect(validateRelabelLog(log([entry(1, { reason: "" })])).join()).toMatch(/reason/);
    expect(validateRelabelLog(log([entry(1), entry(2, { locator: { candidateId: "c1" } })])).join()).toMatch(/duplicate/);
  });
  it("committed log is valid and every change keeps its old label", () => {
    const l = JSON.parse(readFileSync("scripts/covenant-learning-factory/scoreboard/reference-relabels.json", "utf8")) as ReferenceRelabelLog;
    expect(validateRelabelLog(l)).toEqual([]);
    for (const e of l.entries) expect(e.oldLabel).toBeTruthy();
  });
});
