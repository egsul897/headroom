/**
 * F-7C.1 - SOURCE-BOUND RESUME of a frozen Pass A inventory through the public compileCovenantToIR.
 * candidateRef is routing, not source identity. Every test is provider-free; a throwing Pass A caller proves that a
 * refused resume never silently reruns Pass A, and a throwing semantic caller proves nothing reaches a model.
 *
 *   §11 source-byte mutation     §12 context-region mutation     §13 document mismatch     §14 candidate mismatch
 *   §15 source-context state     §16 legacy re-anchoring          §17 current recorded hash  §8 cache ordering
 */
import { describe, expect, it } from "vitest";
import { compileCovenantToIR, type CompileOptions } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { validateFrozenInventoryResume } from "../../lib/contract-model/compiler/semantic/frozen-inventory-resume";
import { computeSourceContextHash, SOURCE_IDENTITY_MIGRATION_VERSION } from "../../lib/contract-model/compiler/semantic-accountability/source-identity";
import { resolveSourceContext } from "../../lib/contract-model/compiler/semantic-accountability/source-context";
import { planCompilationShards } from "../../lib/contract-model/compiler/semantic/shard-planner";
import type { ShardExecutor } from "../../lib/contract-model/compiler/semantic/shard-execution";
import type { SemanticCaller } from "../../lib/contract-model/compiler/semantic/caller";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { FrozenSemanticInventory, SourceContextResult } from "../../lib/contract-model/compiler/semantic-accountability/types";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput, emptyContextBundle } from "./semantic-compiler/test-helpers";
import { buildDefinitionsCorpus, emitDefinitionsForShard, termName, CO, INST, DOC, type SyntheticCorpus } from "./f7a-synthetic-corpus";

const SMALL = { targetPrimaryChars: 1_200, maxPrimaryChars: 2_400, maxContextChars: 4_000, maxContextEntryChars: 600, maxUnitsPerShard: 16 };
const MUTATED_2 = `“${termName(2)}” means the greater of (a) $2,000,001 and (b) 3% of Consolidated EBITDA.`;
/** A definition that cross-references a section OUTSIDE the operative window, plus that section's text: the production resolver expands it into an xref region. */
const XREF_DEF = `“${termName(3)}” means the amount permitted under Section 6.04 of this Agreement.`;
const SECTION_604 = (amount: string) => `SECTION 6.04. Investments . The Borrower shall not make Investments in an aggregate amount exceeding ${amount} at any time outstanding.`;
const twoSection = (amount: string) => buildDefinitionsCorpus({ count: 40, overrideText: new Map([[3, XREF_DEF]]), appendText: SECTION_604(amount) });
/** TRUNCATED_SOURCE: the caller supplies a window narrower than its unit and the unit exceeds the operative-unit cap, so the resolver reports truncation rather than extending. */
const TRUNCATING = (corpus: SyntheticCorpus): { extra: Partial<CompileOptions>; input: Partial<SemanticCompilerInput> } => ({ extra: { sourceContextBudget: { maxOperativeUnitChars: 500 } }, input: { operativeSourceText: corpus.sourceContext.regions[0]!.text.slice(0, 600) } });

function throwingCaller(): SemanticCaller & { calls: number } { const c = { calls: 0 }; return { providerName: "scripted", model: "scripted", isSynthetic: false, get calls() { return c.calls; }, compile: async () => { c.calls++; throw new Error("semantic caller must not be invoked"); } } as SemanticCaller & { calls: number }; }
function throwingInventory(): StageCaller & { calls: number } { const c = { calls: 0 }; return { providerName: "scripted", model: "scripted", isSynthetic: false, get calls() { return c.calls; }, call: async () => { c.calls++; throw new Error("PASS_A_INVOKED"); }, lastTelemetry: () => null } as StageCaller & { calls: number }; }
function inputFor(corpus: SyntheticCorpus, overrides: Partial<SemanticCompilerInput> = {}): SemanticCompilerInput {
  const r = corpus.sourceContext.regions[0]!; const cb = overrides.contextBundle ?? emptyContextBundle();
  return testCompilerInput({ companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, candidateRef: corpus.frozenInventory.candidateRef, sourceSectionRef: "1.01", operativeSourceText: r.text, operativeCharStart: r.charStart, contextBundle: cb, toolAccess: { structuralIndex: corpus.index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: cb }, ...overrides });
}
function resolved(corpus: SyntheticCorpus, budget?: { maxOperativeUnitChars?: number }): SourceContextResult {
  const r = corpus.sourceContext.regions[0]!;
  return resolveSourceContext({ index: corpus.index, documentId: DOC, operativeSourceText: r.text, anchorNodeId: null, operativeCharStart: r.charStart, documentText: corpus.index.getDocumentText(DOC) ?? null, ...(budget ?? {}) });
}
/** Plans over the PRODUCTION-resolved source context (which may carry an expansion region the hand-built corpus context lacks) so every shard the production path hands the executor is known to it. */
const faithful = (corpus: SyntheticCorpus, budget = SMALL): ShardExecutor => { const plan = planCompilationShards({ candidateRef: corpus.frozenInventory.candidateRef, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext: resolved(corpus), frozenInventory: corpus.frozenInventory, structuralIndex: corpus.index, budget, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } }); return async (shard) => ({ status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(corpus, plan, shard), failureReasons: [], unresolvedIssues: [], telemetry: null }); };
async function attempt(corpus: SyntheticCorpus, frozen: FrozenSemanticInventory, extra: Partial<CompileOptions> = {}, inputOverrides: Partial<SemanticCompilerInput> = {}) {
  const caller = throwingCaller(); const passA = throwingInventory();
  const r = await compileCovenantToIR(inputFor(corpus, inputOverrides), { caller, inventoryCaller: passA, inventoryMode: "SINGLE_PASS", frozenInventory: frozen, shardBudget: SMALL, shardExecutor: faithful(corpus), cache: new InMemorySemanticCompilationCache(), ...extra });
  return { r, callerCalls: caller.calls, passACalls: passA.calls };
}
/** A CURRENT-generation inventory: the legacy synthetic inventory stamped with the recorded hash of the source it was built against. */
function currentGeneration(corpus: SyntheticCorpus, over: SourceContextResult = resolved(corpus)): FrozenSemanticInventory {
  return { ...corpus.frozenInventory, documentId: DOC, sourceContextState: over.state, sourceContextHash: computeSourceContextHash(over), sourceIdentity: { method: "RECORDED_AT_FREEZE", sourceContextHash: computeSourceContextHash(over), partitionHash: null, migrationVersion: SOURCE_IDENTITY_MIGRATION_VERSION, verifiedAt: "2026-01-01T00:00:00.000Z" } };
}
const expectRefused = (out: Awaited<ReturnType<typeof attempt>>, check: string) => {
  expect(out.r.status).toBe("FAILED");
  expect(out.r.failureReasons).toEqual(["FROZEN_INVENTORY_SOURCE_MISMATCH"]);
  expect(out.r.unresolvedIssues.some((i) => i.startsWith(`[frozen-inventory-resume] ${check}`))).toBe(true);
  expect(out.r.frozenInventory).toBeNull();
  expect(out.r.execution).toBeNull();
  expect(out.passACalls).toBe(0); // never a silent rerun
  expect(out.callerCalls).toBe(0); // never a model call
  expect(out.r.rules).toEqual([]); expect(out.r.definitions).toEqual([]);
};

describe("F-7C.1 §16 legacy inventory (no sourceContextHash) - deterministic re-anchoring", () => {
  const original = buildDefinitionsCorpus({ count: 40 });
  it("against the exact original source: VERIFIED_BY_RE_ANCHORING, resume allowed, Pass A not run, evidence record explicit, historical object untouched", async () => {
    const frozen = original.frozenInventory;
    const before = JSON.stringify(frozen);
    const out = await attempt(original, frozen);
    expect(out.r.status).toBe("COMPLETED");
    expect(out.passACalls).toBe(0);
    const rec = out.r.execution!.frozenInventoryResume!;
    expect(rec.method).toBe("VERIFIED_BY_RE_ANCHORING");
    expect(rec.candidateRef).toBe(frozen.candidateRef);
    expect(rec.documentId).toBe(DOC);
    expect(rec.frozenContentHash).toBe(frozen.frozenContentHash);
    expect(rec.sourceContextHash).toBe(computeSourceContextHash(resolved(original)));
    expect(rec.reAnchoredChecks).toBeGreaterThanOrEqual(40);
    expect(out.r.frozenInventory!.sourceIdentity?.method).toBe("VERIFIED_BY_RE_ANCHORING"); // ephemeral stamped copy on the result
    expect(out.r.frozenInventory!.frozenContentHash).toBe(frozen.frozenContentHash);
    expect(JSON.stringify(frozen)).toBe(before); // the supplied object was not mutated
    expect(frozen.sourceContextHash).toBeUndefined();
  });
  it("§11 against source with one byte changed inside a represented span: re-anchoring fails on the item excerpt, resume refused, Pass A NOT silently run", async () => {
    const mutated = buildDefinitionsCorpus({ count: 40, overrideText: new Map([[2, MUTATED_2]]) });
    const out = await attempt(mutated, original.frozenInventory);
    expectRefused(out, "item-");
    expect(out.r.unresolvedIssues.some((i) => /inv-item:002/.test(i))).toBe(true);
  });
  it("§12 a context region the frozen evidence was built against that is not part of the current source context: refused", async () => {
    const frozen: FrozenSemanticInventory = { ...original.frozenInventory, unaccountedSource: [{ regionId: "xref-1", charStart: 0, charEnd: 12, excerpt: "Section 6.04", reason: "F-7C.1 test: a span in a cross-reference expansion region the legacy inventory saw", values: [] }] };
    const out = await attempt(original, frozen);
    expectRefused(out, "unaccounted-region");
  });
  it("§15 source-context state: COMPLETE_LOCAL_SOURCE evidence against a TRUNCATED_SOURCE resolution is refused even though the operative text overlaps", async () => {
    const t = TRUNCATING(original);
    const out = await attempt(original, original.frozenInventory, t.extra, t.input);
    expect(out.r.sourceContext?.state).toBe("TRUNCATED_SOURCE");
    expectRefused(out, "");
    expect(out.r.unresolvedIssues.some((i) => /source-state/.test(i))).toBe(true);
  });
});

describe("F-7C.1 §17 current-generation inventory (recorded sourceContextHash)", () => {
  const original = buildDefinitionsCorpus({ count: 40 });
  it("matching current hash: resume allowed by RECORDED_SOURCE_CONTEXT_HASH with no item-by-item migration", async () => {
    const frozen = currentGeneration(original);
    const out = await attempt(original, frozen);
    expect(out.r.status).toBe("COMPLETED");
    expect(out.passACalls).toBe(0);
    const rec = out.r.execution!.frozenInventoryResume!;
    expect(rec.method).toBe("RECORDED_SOURCE_CONTEXT_HASH");
    expect(rec.reAnchoredChecks).toBeNull();
    expect(out.r.frozenInventory).toBe(frozen); // the same object, no ephemeral copy needed
  });
  it("§11 explicit hash mismatch after a one-byte source change: refused, and NOT rescued by legacy re-anchoring", async () => {
    const mutated = buildDefinitionsCorpus({ count: 40, overrideText: new Map([[2, MUTATED_2]]) });
    const out = await attempt(mutated, currentGeneration(original));
    expectRefused(out, "source-context-hash");
    expect(out.r.unresolvedIssues.filter((i) => i.startsWith("[frozen-inventory-resume]"))).toHaveLength(1); // one explicit identity verdict, no re-anchoring attempted
  });
  it("§12 the recorded hash covers every region: an inventory frozen over a source context with an extra expansion region does not match the current operative-only resolution", async () => {
    const withXref: SourceContextResult = { ...resolved(original), regions: [...resolved(original).regions, { regionId: "xref-1", kind: "CROSS_REFERENCE_EXPANSION", documentId: DOC, sourceNodeId: null, sectionRef: "6.04", charStart: -1, charEnd: -1, text: "Section 6.04 text the inventory saw", expandedFor: null, truncatedAtBudget: false, unitExtension: null }] };
    const out = await attempt(original, currentGeneration(original, withXref));
    expectRefused(out, "source-context-hash");
    // and the operative text alone is identical, proving identity is not the main-text hash
    expect(computeSourceContextHash(resolved(original))).not.toBe(computeSourceContextHash(withXref));
    expect(resolved(original).regions[0]!.text).toBe(withXref.regions[0]!.text);
  });
  it("§15 overlapping text, different source-context state: refused", async () => {
    const t = TRUNCATING(original);
    const out = await attempt(original, currentGeneration(original), t.extra, t.input);
    expect(out.r.sourceContext?.state).toBe("TRUNCATED_SOURCE");
    expectRefused(out, "source-context-hash");
  });
  it("§12 a REAL cross-reference expansion region: mutating the referenced section outside the operative window leaves the operative text byte-identical yet refuses resume", async () => {
    const a = twoSection("$500,000"), b = twoSection("$750,000");
    expect(a.sourceContext.regions[0]!.text).toBe(b.sourceContext.regions[0]!.text); // operative window identical
    const ra = resolved(a), rb = resolved(b);
    expect(ra.regions.map((r) => r.kind)).toEqual(["OPERATIVE", "CROSS_REFERENCE_EXPANSION"]);
    expect(ra.regions[1]!.text).not.toBe(rb.regions[1]!.text);
    const frozen = currentGeneration(a, ra);
    const accepted = await attempt(a, frozen);
    expect(accepted.r.status).not.toBe("FAILED");
    expect(accepted.r.execution?.frozenInventoryResume?.method).toBe("RECORDED_SOURCE_CONTEXT_HASH");
    expect(accepted.passACalls).toBe(0);
    expectRefused(await attempt(b, frozen), "source-context-hash");
  });
});

describe("F-7C.1 §13/§14 document and candidate identity", () => {
  const original = buildDefinitionsCorpus({ count: 40 });
  it("§13 same candidateRef, same-looking text, different sourceDocumentId: refused when the inventory records a document", async () => {
    const frozen = { ...currentGeneration(original), documentId: "doc-OTHER" };
    const out = await attempt(original, frozen);
    expectRefused(out, "document");
  });
  it("§13 legacy inventory that records a document is held to it too", async () => {
    const frozen = { ...original.frozenInventory, documentId: "doc-OTHER" };
    const out = await attempt(original, frozen);
    expectRefused(out, "document");
  });
  it("§14 frozen candidate A, compile candidate B: refused (F-7C protection kept, now structured)", async () => {
    const out = await attempt(original, original.frozenInventory, {}, { candidateRef: "cand:B" });
    expectRefused(out, "candidate");
  });
  it("the helper itself reports every failing identity check", () => {
    const d = validateFrozenInventoryResume({ candidateRef: "cand:B", sourceDocumentId: "doc-OTHER", frozenInventory: { ...original.frozenInventory, documentId: DOC }, sourceContext: resolved(original), structuralIndex: original.index });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.failures.map((f) => f.check).sort()).toEqual(["candidate", "document"]);
  });
});

describe("F-7C.1 §8 cache ordering cannot bypass the gate", () => {
  it("a result compiled over the original source is never served for the same candidate over changed source, and the refused compile is not cached", async () => {
    const original = buildDefinitionsCorpus({ count: 40 });
    const mutated = buildDefinitionsCorpus({ count: 40, overrideText: new Map([[2, MUTATED_2]]) });
    const cache = new InMemorySemanticCompilationCache();
    const ok = await attempt(original, original.frozenInventory, { cache });
    expect(ok.r.status).toBe("COMPLETED");
    expect(cache.get(ok.r.cacheKey)).toBe(ok.r);
    const stale = await attempt(mutated, original.frozenInventory, { cache });
    expect(stale.r.cacheKey).not.toBe(ok.r.cacheKey);
    expectRefused(stale, "item-");
    expect(cache.get(stale.r.cacheKey)).toBeNull();
  });
  it("the resolved source-context identity is part of the outer key even when operative text and bundle identity are unchanged", async () => {
    const a = twoSection("$500,000"), b = twoSection("$750,000");
    const cache = new InMemorySemanticCompilationCache();
    const frozen = currentGeneration(a, resolved(a));
    const ra = await attempt(a, frozen, { cache });
    expect(ra.r.status).not.toBe("FAILED");
    expect(ra.r.execution?.frozenInventoryResume?.method).toBe("RECORDED_SOURCE_CONTEXT_HASH");
    const rb = await attempt(b, frozen, { cache }); // same operative text, same bundle identity, same frozen hash - only the expansion region changed
    expect(rb.r.cacheKey).not.toBe(ra.r.cacheKey);
    expect(rb.r).not.toBe(ra.r);
    expectRefused(rb, "source-context-hash");
  });
});
