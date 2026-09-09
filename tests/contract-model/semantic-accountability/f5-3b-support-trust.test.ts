/**
 * F-5.3B sections 3-5 - SUPPORT TRUST PROPAGATION, PASS B SUPPORT CONTEXT, DUAL-PASS ORCHESTRATION.
 *
 * Required invariant: RAW SOURCE COMPLETE + MATERIAL SINGLETON (or CONFLICT) => REVIEW_REQUIRED, never COMPLETE - at
 * reconciliation, at the agreement rollup, and at the compile status. Pass B sees every ensemble item with its support
 * tag; nothing is filtered on support; support survives into reconciliation. All scripted; no model call anywhere.
 */
import { describe, expect, it } from "vitest";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../../lib/contract-model/compiler/semantic/cache";
import { renderAccountabilityContext, type SemanticCaller, type SemanticCallerResult } from "../../../lib/contract-model/compiler/semantic/caller";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import type { SemanticCompilerInput } from "../../../lib/contract-model/compiler/semantic/types";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import { buildEnsembleInventory } from "../../../lib/contract-model/compiler/semantic-accountability/ensemble";
import { runDualPassSemanticInventory, resolveSemanticInventoryMode } from "../../../lib/contract-model/compiler/semantic-accountability/dual-pass";
import { runSemanticInventory } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { rollupAgreementSemanticStatus } from "../../../lib/contract-model/compiler/semantic-accountability/rollup";
import { partitionSourceSlots } from "../../../lib/contract-model/compiler/semantic-accountability/slots";
import type { AgreementUnitInput, FrozenSemanticInventory, SemanticAccountabilityResult } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { emptyContextBundle, testCompilerInput } from "../semantic-compiler/test-helpers";
import { CORPUS } from "./corpus";
import { buildScenario, DOC_ID, mapRefsToIds, scriptedInventoryCaller, scriptedWireItems, type BuiltScenario } from "./harness";

const scenario = CORPUS.find((s) => s.id === "I7")!;
let builtPromise: Promise<BuiltScenario> | null = null;
const built = () => (builtPromise ??= buildScenario(scenario));

/** A counting StageCaller wrapper so tests can prove exactly which pass called the model how often. */
function counting(inner: StageCaller): StageCaller & { calls: number } {
  const wrapped: StageCaller & { calls: number } = {
    calls: 0,
    providerName: inner.providerName,
    model: inner.model,
    isSynthetic: inner.isSynthetic,
    async call<T>(...args: Parameters<StageCaller["call"]>): Promise<T> { wrapped.calls++; return inner.call(...args) as Promise<T>; },
    lastTelemetry: () => inner.lastTelemetry(),
  };
  return wrapped;
}

const allItems = () => scriptedWireItems(scenario.items);
const withoutA = () => scriptedWireItems(scenario.items.filter((i) => i.ref !== "a"));

/** Two real single-pass Pass A runs (scripted model) over the SAME source context, then the STRICT ensemble. */
async function ensembleOf(b: BuiltScenario, pass1: WireInventoryItem[], pass2: WireInventoryItem[]) {
  const run = (items: WireInventoryItem[]) => runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext: b.sourceContext, structuralIndex: b.index, caller: scriptedInventoryCaller(items) });
  const [a, c] = [await run(pass1), await run(pass2)];
  const partition = partitionSourceSlots({ sourceContext: b.sourceContext, structuralIndex: b.index });
  return buildEnsembleInventory({ candidateRef: scenario.id, sourceContext: b.sourceContext, structuralIndex: b.index, partition, passes: [{ passId: "pass-1", inventory: a }, { passId: "pass-2", inventory: c }], compatibility: { mode: "STRICT" } });
}
function reconcile(b: BuiltScenario, inventory: FrozenSemanticInventory, dispositions: { inventoryItemId: string; disposition: string; note: string }[] = []): SemanticAccountabilityResult {
  const idByRef = mapRefsToIds(scenario.items, inventory.items, b.sourceContext);
  const idOf = (ref: string) => { const id = idByRef.get(ref); if (!id) throw new Error(`no ensemble item for ${ref}`); return id; };
  const normalized = normalizeSubmission(scenario.compose(idOf), testCompilerInput({ candidateRef: scenario.id, sourceSectionRef: scenario.anchorRef, operativeSourceText: b.operativeText }));
  return reconcileInventoryWithComposition({ inventory, composition: { rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities }, dispositions: [...normalized.inventoryDispositions, ...dispositions], sourceContextState: b.sourceContext.state });
}
const unit = (acc: SemanticAccountabilityResult | null, over: Partial<AgreementUnitInput> = {}): AgreementUnitInput => ({ candidateRef: scenario.id, compileStatus: "COMPLETED", verifyStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND", accountability: acc, operativeStateUncertain: false, unresolvedCrossReferences: 0, ...over });

describe("F-5.3B section 3 - support trust propagation (reconciliation, rollup)", () => {
  it("RAW SOURCE COMPLETE + MATERIAL SINGLETON => REVIEW_REQUIRED, not COMPLETE: INVENTORY_OK ensemble, every item REPRESENTED, still not semantically complete", async () => {
    const b = await built();
    const e = await ensembleOf(b, allItems(), withoutA());
    expect(e.inventoryStatus).toBe("INVENTORY_OK");
    expect(e.unaccountedSource).toHaveLength(0);
    expect(e.ensemble.counts.materialSingleRun).toBe(1);
    expect(e.ensemble.supportReviewRequired).toBe(true);
    const acc = reconcile(b, e);
    expect(acc.counts.materialMissingFromComposition).toBe(0);
    expect(acc.items.every((i) => i.disposition === "REPRESENTED")).toBe(true);
    // REPRESENTED x SINGLE_RUN: full accountability credit ...
    const singleton = acc.items.find((i) => i.support?.supportStatus === "SINGLE_RUN")!;
    expect(singleton.disposition).toBe("REPRESENTED");
    expect(singleton.support).toMatchObject({ supportingPasses: ["pass-1"], supportStatus: "SINGLE_RUN" });
    expect(acc.support).toMatchObject({ passIds: ["pass-1", "pass-2"], corroborated: 1, singleRun: 1, materialSingleRun: 1, conflicted: 0 });
    expect(acc.support!.byDisposition.REPRESENTED).toEqual({ corroborated: 1, singleRun: 1, conflicted: 0 });
    // ... but the unit stays review-marked, on its own field AND on the completeness claim.
    expect(acc.supportReviewRequired).toBe(true);
    expect(acc.semanticallyComplete).toBe(false);
    expect(acc.reasons.some((r) => r.startsWith("independent-pass support asymmetry"))).toBe(true);
    const roll = rollupAgreementSemanticStatus([unit(acc)]);
    expect(roll.status).toBe("REVIEW_REQUIRED");
    expect(roll.counts.supportReviewRequired).toBe(1);
    expect(roll.units[0]!.reasons.some((r) => /support asymmetry/.test(r))).toBe(true);
  });

  it("control: the same unit with two agreeing passes (all corroborated) reconciles SEMANTICALLY_COMPLETE, and single-pass evidence carries no support at all", async () => {
    const b = await built();
    const e = await ensembleOf(b, allItems(), allItems());
    expect(e.ensemble.counts).toMatchObject({ corroborated: 2, singleRun: 0, conflicted: 0 });
    const acc = reconcile(b, e);
    expect(acc.supportReviewRequired).toBe(false);
    expect(acc.semanticallyComplete).toBe(true);
    expect(rollupAgreementSemanticStatus([unit(acc)]).status).toBe("SEMANTICALLY_COMPLETE");
    const single = reconcile(b, b.inventory);
    expect(single.supportReviewRequired).toBe(false);
    expect(single.support).toBeUndefined();
    expect(single.items.every((i) => i.support === undefined)).toBe(true);
    expect(single.semanticallyComplete).toBe(true);
  });

  it("RAW SOURCE COMPLETE + CONFLICT => REVIEW_REQUIRED; representing one side does not resolve the conflict; both sides survive with explicit conflict provenance", async () => {
    const b = await built();
    const items = allItems();
    const flipped = items.map((i) => (i.localRef === "a" ? { ...i, semanticRole: "PROHIBITION" } : i));
    const e = await ensembleOf(b, items, flipped);
    expect(e.ensemble.counts.conflicted).toBe(2);
    expect(e.ensemble.counts.materialConflicted).toBe(2);
    expect(e.ensemble.conflicts[0]!.reason).toMatch(/contradictory deontic effects/);
    const acc = reconcile(b, e);
    const conflicted = acc.items.filter((i) => i.support?.supportStatus === "CONFLICTED");
    expect(conflicted).toHaveLength(2);
    // the composition carried the PERMISSION reading by lineage; the PROHIBITION reading is only value-inferred - neither
    // disposition resolves the conflict, both sides keep their explicit conflict provenance
    expect(conflicted.every((i) => i.disposition !== "MISSING_FROM_COMPOSITION")).toBe(true);
    expect(conflicted.every((i) => (i.support!.conflictWith ?? []).length === 1)).toBe(true);
    expect(acc.supportReviewRequired).toBe(true);
    expect(acc.semanticallyComplete).toBe(false);
    expect(rollupAgreementSemanticStatus([unit(acc, { compileStatus: "REVIEW_REQUIRED" })]).status).not.toBe("SEMANTICALLY_COMPLETE");
    // dispositioning the non-lineage side AMBIGUOUS (the Pass B contract) is honoured, and the conflict still forces review
    const other = conflicted.find((i) => i.lineageIrPaths.every((p) => p.includes("(inferred")) || i.lineageIrPaths.length === 0) ?? conflicted[1]!;
    const acc2 = reconcile(b, e, [{ inventoryItemId: other.inventoryItemId, disposition: "AMBIGUOUS", note: "conflicting reading of the same stretch" }]);
    expect(acc2.items.find((i) => i.inventoryItemId === other.inventoryItemId)!.disposition).toBe("AMBIGUOUS");
    expect(acc2.counts.materialMissingFromComposition).toBe(0);
    expect(acc2.support!.materialConflicted).toBe(2);
    expect(acc2.supportReviewRequired).toBe(true);
    expect(acc2.semanticallyComplete).toBe(false);
  });

  it("legacy INVENTORY_OK bypass is closed: an ensemble record's supportReviewRequired alone (even with no item-level support tags) refuses completeness", async () => {
    const b = await built();
    const e = await ensembleOf(b, allItems(), withoutA());
    const stripped: FrozenSemanticInventory = { ...e, items: e.items.map((i) => { const { support: _s, ...rest } = i; void _s; return rest; }) };
    expect(stripped.inventoryStatus).toBe("INVENTORY_OK");
    const acc = reconcile(b, stripped);
    expect(acc.items.every((i) => i.disposition === "REPRESENTED")).toBe(true);
    expect(acc.supportReviewRequired).toBe(true);
    expect(acc.semanticallyComplete).toBe(false);
    expect(rollupAgreementSemanticStatus([unit(acc)]).status).toBe("REVIEW_REQUIRED");
  });
});

describe("F-5.3B section 4 - Pass B support context (deterministic)", () => {
  it("singleton and conflicted items appear in the Pass B context with support tags; no item is filtered on support; single-pass context carries no tags", async () => {
    const b = await built();
    const e = await ensembleOf(b, allItems(), withoutA());
    const ctx = renderAccountabilityContext(testCompilerInput({ candidateRef: scenario.id, operativeSourceText: b.operativeText, sourceContext: b.sourceContext, frozenInventory: e }));
    expect(ctx).toMatch(/DUAL-PASS ENSEMBLE INVENTORY/);
    expect(ctx).toMatch(/Support is PROVENANCE, never a filter/);
    for (const it of e.items) expect(ctx).toContain(it.inventoryItemId);
    const singleton = e.items.find((i) => i.support?.supportStatus === "SINGLE_RUN")!;
    expect(ctx).toContain(`${singleton.inventoryItemId} [SINGLE_RUN pass-1] `);
    const corroborated = e.items.find((i) => i.support?.supportStatus === "CORROBORATED")!;
    expect(ctx).toContain(`${corroborated.inventoryItemId} [CORROBORATED] `);
    // the proposition line itself is unchanged by support metadata
    expect(ctx).toContain(singleton.proposition);
    const items = allItems();
    const conflictE = await ensembleOf(b, items, items.map((i) => (i.localRef === "a" ? { ...i, semanticRole: "PROHIBITION" } : i)));
    const conflictCtx = renderAccountabilityContext(testCompilerInput({ candidateRef: scenario.id, operativeSourceText: b.operativeText, sourceContext: b.sourceContext, frozenInventory: conflictE }));
    const c = conflictE.items.find((i) => i.support?.supportStatus === "CONFLICTED")!;
    expect(conflictCtx).toContain(`${c.inventoryItemId} [CONFLICTED with ${c.support!.conflictWith!.join(", ")}: `);
    expect(conflictCtx).toMatch(/disposition BOTH sides AMBIGUOUS/);
    const singleCtx = renderAccountabilityContext(testCompilerInput({ candidateRef: scenario.id, operativeSourceText: b.operativeText, sourceContext: b.sourceContext, frozenInventory: b.inventory }));
    expect(singleCtx).not.toMatch(/\[CORROBORATED\]|\[SINGLE_RUN|\[CONFLICTED|DUAL-PASS ENSEMBLE/);
  });
});

describe("F-5.3B section 5 - dual-pass orchestration (mocked callers)", () => {
  function scriptedComposer(): SemanticCaller & { inputs: SemanticCompilerInput[] } {
    const inputs: SemanticCompilerInput[] = [];
    return {
      providerName: "scripted", model: "scripted-composer", isSynthetic: false, inputs,
      async compile(input): Promise<SemanticCallerResult> {
        inputs.push(input);
        const frozen = input.frozenInventory!;
        // a FAILED inventory has no items: the composer then names a placeholder (which reconciliation reports as dangling) rather than crashing
        const idOf = (ref: string) => { const gt = scenario.items.find((i) => i.ref === ref)!; return frozen.items.find((i) => i.sourceSpan.excerpt === gt.excerpt && i.semanticRole === gt.role)?.inventoryItemId ?? `inv-item:${"0".repeat(24)}`; };
        return { submission: scenario.compose(idOf), rawSubmission: {}, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
      },
    };
  }
  async function compile(b: BuiltScenario, options: Parameters<typeof compileCovenantToIR>[1]) {
    const composer = scriptedComposer();
    const input = testCompilerInput({
      candidateRef: scenario.id, sourceDocumentId: DOC_ID, sourceSectionRef: scenario.anchorRef, operativeSourceText: b.operativeText, operativeCharStart: b.anchor.charStart,
      contextBundle: emptyContextBundle({ originatingDocumentId: DOC_ID, originatingStructuralNodeIds: [b.anchor.nodeId], normalizedSourceRef: scenario.anchorRef }),
      toolAccess: { structuralIndex: b.index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle({ originatingDocumentId: DOC_ID, originatingStructuralNodeIds: [b.anchor.nodeId] }) },
    });
    const result = await compileCovenantToIR(input, { caller: composer, cache: new InMemorySemanticCompilationCache(), ...options });
    return { result, composer };
  }

  it("DUAL_PASS_ENSEMBLE: two independent Pass A executions (each called, no third pass) -> frozen STRICT ensemble with generic pass ids -> Pass B sees every item -> REVIEW_REQUIRED via SEMANTIC_SUPPORT_REVIEW_REQUIRED when a material singleton exists", async () => {
    const b = await built();
    const c1 = counting(scriptedInventoryCaller(allItems())), c2 = counting(scriptedInventoryCaller(withoutA()));
    const { result, composer } = await compile(b, { inventoryMode: "DUAL_PASS_ENSEMBLE", inventoryPassCallers: [c1, c2] });
    expect(result.inventoryMode).toBe("DUAL_PASS_ENSEMBLE");
    expect(result.frozenInventory?.ensemble?.passIds).toEqual(["pass-1", "pass-2"]);
    expect(result.frozenInventory?.ensemble?.compatibility?.mode).toBe("STRICT");
    expect(result.inventoryPasses?.map((p) => p.passId)).toEqual(["pass-1", "pass-2"]);
    expect(c1.calls).toBeGreaterThan(0);
    expect(c2.calls).toBeGreaterThan(0);
    // exactly two passes: each caller made the calls of ONE single-pass run, and no other caller exists
    const single = counting(scriptedInventoryCaller(allItems()));
    await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext: b.sourceContext, structuralIndex: b.index, caller: single });
    expect(c1.calls).toBe(single.calls);
    expect(c2.calls).toBeLessThanOrEqual(single.calls + 1);
    // Pass B received every canonical item (singleton included) and consumed it
    expect(composer.inputs[0]!.frozenInventory?.frozenContentHash).toBe(result.frozenInventory?.frozenContentHash);
    expect(composer.inputs[0]!.frozenInventory?.items.some((i) => i.support?.supportStatus === "SINGLE_RUN")).toBe(true);
    expect(result.accountability?.counts.materialMissingFromComposition).toBe(0);
    expect(result.accountability?.supportReviewRequired).toBe(true);
    expect(result.accountability?.semanticallyComplete).toBe(false);
    // raw source coverage says OK; trust still says review
    expect(result.frozenInventory?.inventoryStatus).toBe("INVENTORY_OK");
    expect(result.failureReasons).toContain("SEMANTIC_SUPPORT_REVIEW_REQUIRED");
    expect(result.failureReasons).not.toContain("SEMANTIC_ACCOUNTABILITY_INCOMPLETE");
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.unresolvedIssues.some((i) => i.startsWith("[support]"))).toBe(true);
  });

  it("DUAL_PASS_ENSEMBLE with two agreeing passes -> all corroborated -> COMPLETED (the mode never blocks a genuinely corroborated unit)", async () => {
    const b = await built();
    const { result } = await compile(b, { inventoryMode: "DUAL_PASS_ENSEMBLE", inventoryPassCallers: [scriptedInventoryCaller(allItems()), scriptedInventoryCaller(allItems())] });
    expect(result.frozenInventory?.ensemble?.counts).toMatchObject({ corroborated: 2, singleRun: 0, conflicted: 0 });
    expect(result.accountability?.supportReviewRequired).toBe(false);
    expect(result.failureReasons).not.toContain("SEMANTIC_SUPPORT_REVIEW_REQUIRED");
    expect(result.status).toBe("COMPLETED");
  });

  it("a pass that fails yields no ensemble (INVENTORY_FAILED, SEMANTIC_INVENTORY_UNAVAILABLE) - never a one-pass 'ensemble'; a synthetic provider is SKIPPED as in single-pass", async () => {
    const b = await built();
    const { result } = await compile(b, { inventoryMode: "DUAL_PASS_ENSEMBLE", inventoryPassCallers: [scriptedInventoryCaller(allItems()), scriptedInventoryCaller([], { fail: true })] });
    expect(result.frozenInventory?.ensemble).toBeUndefined();
    expect(result.frozenInventory?.inventoryStatus).toBe("INVENTORY_FAILED");
    expect(result.frozenInventory?.inventoryStatusReason).toMatch(/dual-pass ensemble not built/);
    expect(result.failureReasons).toContain("SEMANTIC_INVENTORY_UNAVAILABLE");
    expect(result.status).not.toBe("COMPLETED");
    const synthetic: StageCaller = { providerName: "synthetic", model: "synthetic-v1", isSynthetic: true, async call<T>(): Promise<T> { return {} as T; }, lastTelemetry: () => null };
    const skipped = await runDualPassSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext: b.sourceContext, structuralIndex: b.index, passCallers: [synthetic, synthetic] });
    expect(skipped.ensembleBuilt).toBe(false);
    expect(skipped.inventory.inventoryStatus).toBe("INVENTORY_SKIPPED_NO_PROVIDER");
  });

  it("SINGLE_PASS stays the default (no second paid call), the mode is part of the cache identity, and an unknown mode is an error", async () => {
    const b = await built();
    const c1 = counting(scriptedInventoryCaller(allItems()));
    const { result } = await compile(b, { inventoryCaller: c1 });
    expect(result.inventoryMode).toBe("SINGLE_PASS");
    expect(result.frozenInventory?.ensemble).toBeUndefined();
    expect(result.inventoryPasses).toBeNull();
    expect(result.status).toBe("COMPLETED");
    const cache = new InMemorySemanticCompilationCache();
    const single = counting(scriptedInventoryCaller(allItems()));
    const dual = counting(scriptedInventoryCaller(allItems()));
    await compile(b, { cache, inventoryCaller: single });
    const { result: r2 } = await compile(b, { cache, inventoryMode: "DUAL_PASS_ENSEMBLE", inventoryPassCallers: [dual, dual] });
    expect(r2.inventoryMode).toBe("DUAL_PASS_ENSEMBLE");
    expect(dual.calls).toBeGreaterThan(0);
    expect(resolveSemanticInventoryMode("SINGLE_PASS")).toBe("SINGLE_PASS");
    expect(() => resolveSemanticInventoryMode("THREE_PASS_VOTE" as never)).toThrow(/unknown semantic inventory mode/);
  });

  it("runDualPassSemanticInventory: exactly two passes, both accounted in the ensemble's call record, refuses identical pass ids, and the ensemble is order-independent", async () => {
    const b = await built();
    const c1 = counting(scriptedInventoryCaller(allItems())), c2 = counting(scriptedInventoryCaller(withoutA()));
    const r = await runDualPassSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext: b.sourceContext, structuralIndex: b.index, passCallers: [c1, c2] });
    expect(r.ensembleBuilt).toBe(true);
    expect(r.passes.map((p) => p.passId)).toEqual(["pass-1", "pass-2"]);
    expect(r.inventory.partition?.firstPassCalls).toBe(r.passes.reduce((n, p) => n + (p.inventory.partition?.firstPassCalls ?? 0), 0));
    expect(r.inventory.ensemble?.passHashes).toEqual({ "pass-1": r.passes[0]!.inventory.frozenContentHash, "pass-2": r.passes[1]!.inventory.frozenContentHash });
    await expect(runDualPassSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext: b.sourceContext, structuralIndex: b.index, passCallers: [c1, c2], passIds: ["same", "same"] })).rejects.toThrow(/two distinct pass ids/);
    const swapped = await runDualPassSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext: b.sourceContext, structuralIndex: b.index, passCallers: [c2, c1], passIds: ["pass-2", "pass-1"] });
    expect(swapped.inventory.frozenContentHash).toBe(r.inventory.frozenContentHash);
  });
});
