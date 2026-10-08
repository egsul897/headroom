/**
 * Keeps the independent defect register (docs/product-readiness/03-defect-register.json) truthful against the live
 * acceptance run:
 *   - every OPEN defect's signatures must still be observed as failing checks (when a signature stops failing, the
 *     register entry must be closed or re-classified - this test fails to force that bookkeeping);
 *   - every finding the run produces must be covered by a register entry (no unregistered findings).
 * Fixing a defect is Cursor's work; this file only makes silent drift impossible.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runAll } from "../../scripts/product-acceptance/runner";
import type { AcceptanceReport } from "../../scripts/product-acceptance/report-types";

interface Register { defects: Array<{ id: string; status: string; title: string; severity: string; signatures: Array<{ packageId: string; expectationRef: string; severity?: string; evidence?: string }> }> }
/** Signatures whose evidence is the mutation suite are checked by tests/product-acceptance/mutations.test.ts, not by the acceptance run. */
const runSignatures = (d: Register["defects"][number]) => d.signatures.filter((s) => s.evidence !== "MUTATION");
const register = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../docs/product-readiness/03-defect-register.json"), "utf8")) as Register;

let report: AcceptanceReport;
beforeAll(async () => { report = await runAll(); }, 600_000);

const findingAt = (packageId: string, expectationRef: string) => report.packages.find((p) => p.packageId === packageId)?.findings.find((f) => f.expectationRef === expectationRef);

describe("defect register ↔ acceptance run", () => {
  for (const d of register.defects.filter((d) => d.status === "OPEN")) {
    it(`${d.id} (${d.severity}) is still observed: ${d.title}`, () => {
      for (const s of runSignatures(d)) {
        const f = findingAt(s.packageId, s.expectationRef);
        expect(f, `${d.id}: ${s.packageId} ${s.expectationRef} no longer fails - close or re-classify the register entry`).toBeDefined();
      }
    });
  }
  it("every finding in the run is registered", () => {
    const registered = new Set(register.defects.flatMap((d) => d.signatures.map((s) => `${s.packageId}|${s.expectationRef}`)));
    const unregistered = report.packages.flatMap((p) => p.findings.filter((f) => !registered.has(`${p.packageId}|${f.expectationRef}`)).map((f) => `${p.packageId}|${f.expectationRef} [${f.severity}]`));
    expect(unregistered).toEqual([]);
  });
  it("register severities match the run's severities", () => {
    for (const d of register.defects.filter((d) => d.status === "OPEN")) for (const s of runSignatures(d)) { const f = findingAt(s.packageId, s.expectationRef); if (f) expect(f.severity, `${d.id} ${s.expectationRef}`).toBe(s.severity ?? d.severity); }
  });
});
