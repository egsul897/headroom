/**
 * Mutation suite (directive queue 7): controlled legal edits applied in memory to the pinned corpus. Two contracts:
 *   HARNESS - the suite's own expectation deltas and kill predictions hold (text/identity/closure, and whether the
 *             unchanged manifest detects the mutant through the production deterministic audits);
 *   PRODUCT - Headroom's behaviour on each mutant; every failing PRODUCT verdict must be registered in the defect
 *             register with evidence MUTATION (never silently tolerated, never fixed by weakening the expectation).
 * Fixtures on disk are never modified; the corpus-integrity test pins their bytes.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPackage, listPackageIds } from "../../scripts/product-acceptance/corpus";
import { MUTATIONS, applyMutation, observeMutation, type MutationObservation } from "../../scripts/product-acceptance/mutations";

interface Register { defects: Array<{ id: string; status: string; signatures: Array<{ packageId: string; expectationRef: string; severity?: string; evidence?: string }> }> }
const register = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../docs/product-readiness/03-defect-register.json"), "utf8")) as Register;

const obs = new Map<string, MutationObservation>();
beforeAll(async () => { for (const m of MUTATIONS) obs.set(m.id, await observeMutation(loadPackage(m.packageId), m)); }, 600_000);

describe("mutation suite contract", () => {
  it("covers every operator the directive names", () => {
    const kinds = new Set(MUTATIONS.map((m) => m.kind));
    for (const k of ["CHANGED_THRESHOLD", "ADDED_CONDITION", "REMOVED_EXCEPTION", "REVISED_DEFINITION", "NEW_AMENDMENT", "MOVED_COVENANT", "CHANGED_ENTITY_SCOPE", "CONFLICTING_DOCUMENT", "REORDERED_HIERARCHY", "MISSING_REFERENCED_PROVISION"]) expect(kinds.has(k as never), k).toBe(true);
  });
  it("mutates only in memory: the loaded package and the fixture bytes are untouched", () => {
    for (const m of MUTATIONS) {
      const pkg = loadPackage(m.packageId);
      const before = pkg.documents.map((d) => [d.documentId, d.text, d.sha256] as const);
      const mutated = applyMutation(pkg, m);
      expect(mutated).not.toBe(pkg);
      expect(pkg.documents.map((d) => [d.documentId, d.text, d.sha256] as const)).toEqual(before);
      for (const d of pkg.documents) expect(fs.readFileSync(path.join(pkg.dir, d.file), "utf8")).toBe(d.text);
    }
    expect(listPackageIds().length).toBe(14);
  });
  it("every mutation is applicable (no edit anchor drifted)", () => { for (const m of MUTATIONS) expect(obs.get(m.id), m.id).toBeDefined(); });
});

describe("HARNESS verdicts: expectation deltas and kill predictions", () => {
  for (const m of MUTATIONS) it(`${m.id} ${m.kind}: ${m.description.slice(0, 80)}`, () => {
    const o = obs.get(m.id)!;
    const failed = o.verdicts.filter((v) => v.kind === "HARNESS" && !v.ok).map((v) => `${v.check} — ${v.detail}`);
    expect(failed, failed.join("\n")).toEqual([]);
    expect(o.kill.predictionHeld, `${o.kill.verdict} vs predicted ${o.kill.predicted}`).toBe(true);
  });
  it("mutants that change legal content are killed by the unchanged manifest; only the equivalent and the declared-gap mutants survive", () => {
    const survivors = MUTATIONS.filter((m) => obs.get(m.id)!.kill.verdict === "SURVIVED").map((m) => m.id).sort();
    expect(survivors).toEqual(MUTATIONS.filter((m) => m.expect.survival !== "KILLED").map((m) => m.id).sort());
    expect(survivors).toEqual(["MUT-08", "MUT-09", "MUT-12", "MUT-13", "MUT-15", "MUT-16"]); // MUT-14 incidental CONTEXT kill (Default on withheld clause); MUT-02 killed by text-hash pinning
  });
  it("a killed mutant never makes a baseline failure vanish for free (no expectation was weakened by the mutation)", () => {
    for (const m of MUTATIONS) { const o = obs.get(m.id)!; if (o.kill.verdict === "KILLED") expect(o.kill.vanishedFailures.filter((r) => !r.startsWith("context:")), `${m.id} vanished: ${o.kill.vanishedFailures.join(", ")}`).toEqual([]); }
  });
});

describe("structural identity under edits (finding, not a defect)", () => {
  it("a length-preserving edit keeps every node id", () => { for (const id of ["MUT-01", "MUT-06", "MUT-11"]) expect(obs.get(id)!.nodeIdSurvival.shifted, id).toBe(0); });
  it("a length-changing insertion shifts the id of every later node although their text is unchanged (node ids are positional)", () => {
    for (const id of ["MUT-02", "MUT-04", "MUT-07"]) { const s = obs.get(id)!.nodeIdSurvival; expect(s.shifted, id).toBeGreaterThan(0); expect(s.textHashSurvived, id).toBeGreaterThan(s.survived); expect(s.textHashSurvived, id).toBe(s.total - 1); }
  });
  it("re-ordering two sections changes no section text but changes both node ids", () => {
    const o = obs.get("MUT-09")!;
    expect(o.nodeIdSurvival.textHashSurvived).toBe(o.nodeIdSurvival.total);
    expect(o.nodeIdSurvival.shifted).toBeGreaterThan(0);
    // the swap puts 7.03 at 7.02's old offset, so 7.03 inherits 7.02's former id: positional identity can silently re-label a node
    expect(o.nodeIds["7.03"]!.after).toBe(o.nodeIds["7.02"]!.before);
    expect(o.nodeIds["7.02"]!.before).not.toBe(o.nodeIds["7.02"]!.after);
    expect(o.nodeIds["7.03"]!.before).not.toBe(o.nodeIds["7.03"]!.after);
  });
});

describe("PRODUCT verdicts ↔ defect register", () => {
  it("every failing PRODUCT verdict is registered with evidence MUTATION, and every such registration still fails", () => {
    const failing = new Map<string, string>();
    for (const m of MUTATIONS) for (const v of obs.get(m.id)!.verdicts) if (v.kind === "PRODUCT" && !v.ok) failing.set(`${m.packageId}|${v.ref}`, v.severity ?? "?");
    const registered = new Map<string, string>();
    for (const d of register.defects.filter((d) => d.status === "OPEN")) for (const s of d.signatures.filter((s) => s.evidence === "MUTATION")) registered.set(`${s.packageId}|${s.expectationRef}`, s.severity ?? "?");
    expect([...failing.keys()].sort()).toEqual([...registered.keys()].sort());
    for (const [k, sev] of failing) expect(registered.get(k), k).toBe(sev);
  });
  it("the new-amendment and the dangling-reference mutants are handled correctly by the production stages", () => {
    for (const id of ["MUT-05", "MUT-10", "MUT-11"]) expect(obs.get(id)!.verdicts.filter((v) => v.kind === "PRODUCT" && !v.ok), id).toEqual([]);
  });
});
