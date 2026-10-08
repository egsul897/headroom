/**
 * Legal-invariant checks (directive continuous loop). PRODUCT verdicts that fail must be registered in the defect
 * register with evidence INVARIANT, and every such registration must still fail; OBSERVATION verdicts never fail.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { INVARIANTS, runInvariants, type InvariantResult } from "../../scripts/product-acceptance/invariants";

interface Register { defects: Array<{ id: string; status: string; signatures: Array<{ packageId: string; expectationRef: string; severity?: string; evidence?: string }> }> }
const register = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../docs/product-readiness/03-defect-register.json"), "utf8")) as Register;
let results: InvariantResult[] = [];
beforeAll(async () => { results = await runInvariants(); }, 600_000);

describe("invariant harness", () => {
  it("every invariant states its legal expectation and runs on a pinned package or an in-memory variation", () => {
    for (const inv of INVARIANTS) { expect(inv.legalStatement.length).toBeGreaterThan(40); expect(inv.packageId).toMatch(/^pkg-[a-z]-/); }
    expect(results.map((r) => r.id)).toEqual(INVARIANTS.map((i) => i.id));
  });
  it("is deterministic", async () => { const again = await runInvariants(); expect(again.map((r) => r.verdicts.map((v) => [v.ref, v.ok]))).toEqual(results.map((r) => r.verdicts.map((v) => [v.ref, v.ok]))); }, 600_000);
});

describe("PRODUCT verdicts ↔ defect register", () => {
  it("every failing PRODUCT verdict is registered with evidence INVARIANT, and every such registration still fails", () => {
    const failing = new Map<string, string>();
    for (const r of results) for (const v of r.verdicts) if (v.kind === "PRODUCT" && !v.ok) failing.set(`${r.packageId}|${v.ref}`, v.severity ?? "?");
    const registered = new Map<string, string>();
    for (const d of register.defects.filter((d) => d.status === "OPEN")) for (const s of d.signatures.filter((s) => s.evidence === "INVARIANT")) registered.set(`${s.packageId}|${s.expectationRef}`, s.severity ?? "?");
    expect([...failing.keys()].sort()).toEqual([...registered.keys()].sort());
    for (const [k, sev] of failing) expect(registered.get(k), k).toBe(sev);
  });
  it("the invariants Headroom meets today stay met (hanging proviso, same-document override at section level, Article IX cap at section level, conditional effectiveness, cache identity)", () => {
    for (const id of ["INV-01", "INV-03", "INV-04", "INV-06", "INV-37"]) expect(results.find((r) => r.id === id)!.verdicts.filter((v) => v.kind === "PRODUCT" && !v.ok).map((v) => v.ref), id).toEqual([]);
  });
});
