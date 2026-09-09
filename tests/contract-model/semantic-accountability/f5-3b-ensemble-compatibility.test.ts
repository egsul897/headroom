/**
 * F-5.3B section 2 - ENSEMBLE INPUT-COMPATIBILITY GATE. Two passes may count as independent corroboration only if
 * they are independent executions over semantically identical input under a compatible semantic inventory contract.
 * Every scenario is an invented drafting shape; no model call anywhere. No agreement-specific logic.
 */
import { describe, expect, it } from "vitest";
import { buildEnsembleInventory, checkEnsembleCompatibility, EnsembleIncompatibleInputError, type EnsembleInput } from "../../../lib/contract-model/compiler/semantic-accountability/ensemble";
import { normalizeInventorySubmission } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { partitionSourceSlots } from "../../../lib/contract-model/compiler/semantic-accountability/slots";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import { computePartitionHash, computeSourceContextHash, stampVerifiedSourceIdentity, verifyInventoryAgainstSource } from "../../../lib/contract-model/compiler/semantic-accountability/source-identity";
import type { FrozenSemanticInventory, SourceContextResult } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { buildTestIndex } from "../context-retrieval-test-utils";

const DOC = "f5-3b-synthetic-doc";
const TEXT = [
  "ARTICLE VII",
  "NEGATIVE COVENANTS",
  "",
  "SECTION 7.09. Omega Restrictions. The Company shall not, and shall not permit any Subsidiary to, make any Omega Payment, other than Omega Payments to a Loan Party; provided that the Company may make Omega Payments so long as no Default has occurred and is continuing.",
  "(a) Omega Payments in an aggregate amount not to exceed the greater of (x) $50,000,000 and (y) 12.5% of Total Assets;",
  "(b) Omega Payments permitted pursuant to Section 7.04(b) in an amount not to exceed $7,000,000 in any fiscal year.",
  "",
  "SECTION 7.10. Sigma Restrictions. The Company shall not make any Sigma Payment in excess of $1,000,000.",
  "",
  "SECTION 7.04. Indebtedness. The Company may incur Indebtedness as set out in clauses (b)(1) through (b)(12).",
].join("\n");

function unit(sectionRef: string) {
  const index = buildTestIndex([{ documentId: DOC, label: "synthetic", text: TEXT }]);
  const anchor = index.findNodesByRef(DOC, sectionRef)[0]!;
  const operativeText = index.getNodeText(anchor.nodeId, "DESCENDANTS");
  const sourceContext = resolveSourceContext({ index, documentId: DOC, operativeSourceText: operativeText, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: TEXT });
  const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
  return { index, sourceContext, partition };
}
const U709 = unit("7.09");
const U710 = unit("7.10");
const CREF = "f5-3b-unit";
const wire = (localRef: string, role: string, excerpt: string, extra: Partial<WireInventoryItem> = {}): WireInventoryItem => ({ localRef, semanticRole: role, proposition: `${role}: ${excerpt.slice(0, 40)}`, excerpt, regionId: null, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", ...extra });

type Over = Partial<FrozenSemanticInventory> & { identity?: "recorded" | "none" };
/** A scripted single pass over a unit: the real normalizer over scripted wire, frozen into an inventory shape with a RECORDED source identity (as Pass A stamps it), unless identity: "none" (pre-F-5.3B evidence). */
function pass(u: typeof U709, items: WireInventoryItem[], over: Over = {}): FrozenSemanticInventory {
  const { identity = "recorded", ...rest } = over;
  const r = normalizeInventorySubmission({ candidateRef: CREF, sourceContext: u.sourceContext, structuralIndex: u.index }, items, u.partition);
  const sch = computeSourceContextHash(u.sourceContext);
  const base: FrozenSemanticInventory = { candidateRef: CREF, items: r.items, uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "scripted", rejectedUnverifiableItems: r.rejectedUnverifiable, rejectedDuplicateItems: r.rejectedDuplicates, sourceContextState: u.sourceContext.state, frozenContentHash: `scripted-${items.map((i) => i.localRef).join("+")}`, frozenAt: "2026-01-01T00:00:00.000Z", algorithmVersion: "semantic-accountability.v5", promptVersion: "semantic-inventory-prompt.v5", provider: "scripted", model: "scripted-model-x", telemetryCostUsd: null, partition: { methods: u.partition.methods, slots: u.partition.slots.map((s) => ({ slotId: s.slotId, regionId: s.regionId, sectionRef: s.sectionRef, charStart: s.charStart, charEnd: s.charEnd })), batches: 1, batchChars: 6000, gapBatches: 0, firstPassCalls: 1, gapCalls: 0 } };
  const withIdentity = identity === "recorded" ? { ...base, documentId: DOC, sourceContextHash: sch, sourceIdentity: { method: "RECORDED_AT_FREEZE" as const, sourceContextHash: sch, partitionHash: computePartitionHash(u.partition) } } : base;
  return { ...withIdentity, ...rest };
}
const PROHIBITION = "The Company shall not, and shall not permit any Subsidiary to, make any Omega Payment";
const EXCEPTION = "other than Omega Payments to a Loan Party";
const P1 = [wire("p", "PROHIBITION", PROHIBITION), wire("x", "EXCEPTION", EXCEPTION, { parentRef: "p" })];
const P2 = [wire("q", "PROHIBITION", PROHIBITION)];
const input = (a: FrozenSemanticInventory, b: FrozenSemanticInventory, over: Partial<EnsembleInput> = {}): EnsembleInput => ({ candidateRef: CREF, sourceContext: U709.sourceContext, structuralIndex: U709.index, partition: U709.partition, passes: [{ passId: "pass-1", inventory: a }, { passId: "pass-2", inventory: b }], ...over });
const refusal = (i: EnsembleInput): EnsembleIncompatibleInputError => {
  try { buildEnsembleInventory(i); } catch (e) { if (e instanceof EnsembleIncompatibleInputError) return e; throw e; }
  throw new Error("expected the ensemble to refuse");
};

describe("F-5.3B section 2 - input-compatibility gate (STRICT is the default and the only production mode)", () => {
  it("A. same source + same versions + same provider/model -> accepted, with every check recorded as passing in STRICT mode", () => {
    const e = buildEnsembleInventory(input(pass(U709, P1), pass(U709, P2)));
    expect(e.items).toHaveLength(2);
    const c = e.ensemble.compatibility!;
    expect(c.mode).toBe("STRICT");
    expect(c.declaredExceptions).toEqual([]);
    expect(c.checks.every((k) => k.pass)).toBe(true);
    expect(new Set(c.checks.map((k) => k.check))).toEqual(new Set(["candidate-ref", "source-identity-recorded", "source-context-hash", "partition", "document", "algorithm-generation", "prompt-generation", "provider-model", "pass-status"]));
    expect(c.sourceContextHash).toBe(computeSourceContextHash(U709.sourceContext));
    expect(e.sourceContextHash).toBe(c.sourceContextHash);
    expect(e.sourceIdentity?.method).toBe("RECORDED_AT_FREEZE");
  });

  it("B. different candidate -> rejected explicitly (never silently downgraded or unioned)", () => {
    const err = refusal(input(pass(U709, P1), pass(U709, P2, { candidateRef: "some-other-unit" })));
    expect(err.failures.map((f) => f.check)).toContain("candidate-ref");
    expect(err.record.mode).toBe("STRICT");
  });

  it("C. different source-context hash (a pass over another unit's source, even under the same candidateRef) -> rejected", () => {
    const other = pass(U710, [wire("s", "PROHIBITION", "The Company shall not make any Sigma Payment in excess of $1,000,000.")]);
    const err = refusal(input(pass(U709, P1), other));
    const checks = err.failures.map((f) => f.check);
    expect(checks).toContain("source-context-hash");
    // sharing candidateRef was NOT sufficient: the candidate check passed and the identity check still refused.
    expect(err.record.checks.filter((k) => k.check === "candidate-ref").every((k) => k.pass)).toBe(true);
  });

  it("D. different prompt generation -> rejected", () => {
    const err = refusal(input(pass(U709, P1), pass(U709, P2, { promptVersion: "semantic-inventory-prompt.v4" })));
    expect(err.failures.map((f) => f.check)).toContain("prompt-generation");
  });

  it("E. different accountability generation -> rejected unless a future versioned migration declares compatibility (none does)", () => {
    const err = refusal(input(pass(U709, P1), pass(U709, P2, { algorithmVersion: "semantic-accountability.v4" })));
    expect(err.failures.map((f) => f.check)).toContain("algorithm-generation");
    // Both passes on a generation the ensemble does not support are rejected too - "same as each other" is not "compatible".
    const both = refusal(input(pass(U709, P1, { algorithmVersion: "semantic-accountability.v4" }), pass(U709, P2, { algorithmVersion: "semantic-accountability.v4" })));
    expect(both.failures.map((f) => f.check)).toContain("algorithm-generation");
  });

  it("F. different slot partition / source-unit identity -> rejected", () => {
    const a = pass(U709, P1);
    const tampered = pass(U709, P2);
    tampered.partition = { ...tampered.partition!, slots: tampered.partition!.slots.slice(0, -1) };
    const err = refusal(input(a, tampered));
    expect(err.failures.map((f) => f.check)).toContain("partition");
    // and a pass whose documentId names another document
    const doc = refusal(input(a, pass(U709, P2, { documentId: "another-document" })));
    expect(doc.failures.map((f) => f.check)).toContain("document");
  });

  it("G. different provider/model for THIS certification -> rejected; a pass that did not run (FAILED/SKIPPED) -> rejected", () => {
    expect(refusal(input(pass(U709, P1), pass(U709, P2, { model: "scripted-model-y" }))).failures.map((f) => f.check)).toContain("provider-model");
    expect(refusal(input(pass(U709, P1), pass(U709, P2, { provider: "other-provider" }))).failures.map((f) => f.check)).toContain("provider-model");
    expect(refusal(input(pass(U709, P1), pass(U709, [], { inventoryStatus: "INVENTORY_FAILED" }))).failures.map((f) => f.check)).toContain("pass-status");
    expect(refusal(input(pass(U709, P1), pass(U709, [], { inventoryStatus: "INVENTORY_SKIPPED_NO_PROVIDER" }))).failures.map((f) => f.check)).toContain("pass-status");
  });

  it("H. a pass with NO recorded source identity is rejected under STRICT - candidateRef alone is never sufficient", () => {
    const err = refusal(input(pass(U709, P1), pass(U709, P2, { identity: "none" })));
    expect(err.failures.map((f) => f.check)).toEqual(expect.arrayContaining(["source-identity-recorded", "source-context-hash"]));
  });

  it("I. the versioned re-anchoring migration verifies pre-F-5.3B evidence against the actual source and stamps it - then STRICT admits it; tampered evidence is refused by the migration itself", () => {
    const legacy = pass(U709, P2, { identity: "none" });
    expect(legacy.sourceContextHash).toBeUndefined();
    const stamped = stampVerifiedSourceIdentity(legacy, U709.sourceContext, U709.partition, () => "2026-09-09T00:00:00.000Z");
    expect(stamped.sourceIdentity).toMatchObject({ method: "VERIFIED_BY_RE_ANCHORING", migrationVersion: "source-identity-migration.v1", sourceContextHash: computeSourceContextHash(U709.sourceContext) });
    expect(stamped.frozenContentHash).toBe(legacy.frozenContentHash);
    const e = buildEnsembleInventory(input(pass(U709, P1), stamped));
    expect(e.ensemble.compatibility!.passes["pass-2"]!.sourceIdentityMethod).toBe("VERIFIED_BY_RE_ANCHORING");
    // tampered: an excerpt that is not the text at its recorded offsets
    const tampered: FrozenSemanticInventory = { ...legacy, items: legacy.items.map((i) => ({ ...i, sourceSpan: { ...i.sourceSpan, excerpt: "The Company may make any Omega Payment" } })) };
    expect(verifyInventoryAgainstSource(tampered, U709.sourceContext, U709.partition).map((f) => f.check)).toContain("item-excerpt");
    expect(() => stampVerifiedSourceIdentity(tampered, U709.sourceContext, U709.partition)).toThrow(/source identity could not be verified/);
    // and re-anchoring against a DIFFERENT unit's source is refused (regions/partition do not match)
    expect(() => stampVerifiedSourceIdentity(legacy, U710.sourceContext, U710.partition)).toThrow(/source identity could not be verified/);
  });

  it("J. EXPERIMENTAL_CROSS_VERSION admits only the checks it explicitly names, records them, and can never be selected by STRICT (STRICT refuses declared exceptions outright)", () => {
    const a = pass(U709, P1), b = pass(U709, P2, { algorithmVersion: "semantic-accountability.v4", promptVersion: "semantic-inventory-prompt.v4" });
    // names only the prompt: the algorithm failure still refuses
    expect(() => buildEnsembleInventory(input(a, b, { compatibility: { mode: "EXPERIMENTAL_CROSS_VERSION", acceptFailing: ["prompt-generation"] } }))).toThrow(EnsembleIncompatibleInputError);
    const e = buildEnsembleInventory(input(a, b, { compatibility: { mode: "EXPERIMENTAL_CROSS_VERSION", acceptFailing: ["prompt-generation", "algorithm-generation"] } }));
    expect(e.ensemble.compatibility).toMatchObject({ mode: "EXPERIMENTAL_CROSS_VERSION", declaredExceptions: ["algorithm-generation", "prompt-generation"] });
    expect(e.ensemble.compatibility!.checks.some((k) => !k.pass)).toBe(true);
    expect(() => buildEnsembleInventory(input(a, b, { compatibility: { mode: "STRICT", acceptFailing: ["algorithm-generation"] } }))).toThrow(/STRICT compatibility admits no declared exceptions/);
    const check = checkEnsembleCompatibility(input(a, b));
    expect(check.admitted).toBe(false);
    expect(check.record.mode).toBe("STRICT");
  });

  it("K. the compatibility record is order-free (Union(A,B) and Union(B,A) carry identical records) and the gate contains no agreement-specific logic (it keys on hashes/versions only)", () => {
    const a = pass(U709, P1), b = pass(U709, P2);
    const ab = buildEnsembleInventory(input(a, b));
    const ba = buildEnsembleInventory({ ...input(a, b), passes: [{ passId: "pass-2", inventory: b }, { passId: "pass-1", inventory: a }] });
    expect(JSON.stringify(ab.ensemble.compatibility)).toBe(JSON.stringify(ba.ensemble.compatibility));
    expect(ab.frozenContentHash).toBe(ba.frozenContentHash);
    const sc: SourceContextResult = U709.sourceContext;
    expect(JSON.stringify(ab.ensemble.compatibility)).not.toMatch(/Omega|Chewy|6\.08/);
    expect(computeSourceContextHash(sc)).toHaveLength(64);
  });
});
