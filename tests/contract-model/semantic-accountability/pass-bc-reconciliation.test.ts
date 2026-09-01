/**
 * SEMANTIC ACCOUNTABILITY - Pass B/C gates over the general synthetic corpus
 * (mission §18): explicit disposition >= 99% of material items, injected
 * omission detection 100% (I41 item / I42 money / I43 percentage / I44
 * condition - derived generically from EVERY complete scenario, not four
 * hand-picked cases), no false SEMANTICALLY_COMPLETE, dangling-lineage and
 * lineage-without-value-correspondence rejection, unresolved cross-unit
 * dependencies preserved as AMBIGUOUS (never guessed, never dropped),
 * agreement-level rollup (mission §26) and compile.ts integration.
 */
import { describe, expect, it } from "vitest";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../../lib/contract-model/compiler/semantic/cache";
import type { SemanticCaller, SemanticCallerResult } from "../../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../../lib/contract-model/compiler/semantic/types";
import { rollupAgreementSemanticStatus } from "../../../lib/contract-model/compiler/semantic-accountability/rollup";
import type { AgreementUnitInput, SemanticAccountabilityResult } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import { emptyContextBundle, testCompilerInput } from "../semantic-compiler/test-helpers";
import { COMPLETE_SCENARIOS, CORPUS, M, rule, submission } from "./corpus";
import { buildScenario, DOC_ID, normalizeScenarioComposition, perturbLiteral, reconcileScenario, scriptedInventoryCaller, scriptedWireItems, stripLineageNodes, valueStillPresent, type BuiltScenario } from "./harness";

const cache = new Map<string, Promise<BuiltScenario>>();
const get = (id: string) => cache.get(id) ?? (() => { const p = buildScenario(CORPUS.find((s) => s.id === id)!); cache.set(id, p); return p; })();

function unit(candidateRef: string, accountability: SemanticAccountabilityResult | null, over: Partial<AgreementUnitInput> = {}): AgreementUnitInput {
  return { candidateRef, compileStatus: "COMPLETED", verifyStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND", accountability, operativeStateUncertain: false, unresolvedCrossReferences: 0, ...over };
}

describe("semantic accountability - Pass B/C over the synthetic corpus", () => {
  for (const scenario of CORPUS) {
    it(`${scenario.id} ${scenario.title}: full lineage-bearing composition -> 0 material MISSING, 0 dangling, semanticallyComplete=${scenario.expectSemanticallyComplete}`, async () => {
      const b = await get(scenario.id);
      const normalized = normalizeScenarioComposition(b);
      const acc = reconcileScenario(b, normalized);
      expect(acc.counts.materialMissingFromComposition, acc.reasons.join("\n")).toBe(0);
      expect(acc.counts.materialQuantitativeValuesMissing, acc.reasons.join("\n")).toBe(0);
      expect(acc.counts.danglingLineageReferences).toBe(0);
      expect(acc.semanticallyComplete).toBe(scenario.expectSemanticallyComplete);
      const byRef = (ref: string) => acc.items.find((i) => i.inventoryItemId === b.idOf(ref))!;
      for (const ref of scenario.expectedAmbiguousRefs ?? []) expect(byRef(ref).disposition, ref).toBe("AMBIGUOUS");
      for (const ref of scenario.expectedNonComputationalRefs ?? []) expect(byRef(ref).disposition, ref).toBe("INTENTIONALLY_NON_COMPUTATIONAL");
      if (scenario.expectedUnresolvedDependencies !== undefined) expect(normalized.rules.reduce((n, r) => n + (r.unresolvedDependencies?.length ?? 0), 0)).toBe(scenario.expectedUnresolvedDependencies);
      // Every material item that is neither AMBIGUOUS-by-design nor explicitly dispositioned is REPRESENTED (or UNSUPPORTED with disclosure) - never silently anything.
      for (const item of acc.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL")) {
        expect(["REPRESENTED", "AMBIGUOUS", "INTENTIONALLY_NON_COMPUTATIONAL", "UNSUPPORTED"], `${scenario.id}:${item.inventoryItemId} ${item.reason}`).toContain(item.disposition);
        expect(item.reason.length).toBeGreaterThan(0);
      }
    });
  }

  it("aggregate Pass B/C gate (mission §18): explicit disposition of material items >= 99% across the corpus", async () => {
    let material = 0;
    let dispositioned = 0;
    for (const s of CORPUS) {
      const b = await get(s.id);
      const acc = reconcileScenario(b, normalizeScenarioComposition(b));
      for (const i of acc.items) {
        if (i.materiality !== "CRITICAL" && i.materiality !== "MATERIAL") continue;
        material++;
        if (i.disposition !== "MISSING_FROM_COMPOSITION") dispositioned++;
      }
    }
    expect(material).toBeGreaterThan(120);
    expect(dispositioned / material).toBeGreaterThanOrEqual(0.99);
  });

  it("I39: a TRUNCATED_SOURCE unit can never be SEMANTICALLY complete even when every supplied item is represented", async () => {
    const b = await get("I39");
    const acc = reconcileScenario(b, normalizeScenarioComposition(b));
    expect(acc.counts.materialMissingFromComposition).toBe(0);
    expect(acc.semanticallyComplete).toBe(false);
    expect(acc.reasons.join(" ")).toMatch(/TRUNCATED_SOURCE/);
  });

  it("I45: fully represented semantics with an unavailable financial mapping is accountable (REPRESENTED, complete) while executability stays separately PARTIAL", async () => {
    const b = await get("I45");
    const normalized = normalizeScenarioComposition(b);
    const acc = reconcileScenario(b, normalized);
    expect(acc.semanticallyComplete).toBe(true);
    expect(acc.items.every((i) => i.disposition === "REPRESENTED")).toBe(true);
    expect(normalized.rules[0]!.sufficiency).toBe("PARTIAL");
    expect(Object.keys(acc)).not.toContain("executable");
  });
});

describe("semantic accountability - injected omissions (I41-I44) derived from every complete scenario", () => {
  it("I41: omitting one material inventory item (every node carrying its lineage) is detected as MISSING_FROM_COMPOSITION - 100% over the corpus", async () => {
    let injections = 0;
    let detected = 0;
    const misses: string[] = [];
    for (const s of COMPLETE_SCENARIOS) {
      const b = await get(s.id);
      const base = normalizeScenarioComposition(b);
      let perScenario = 0;
      for (const gt of s.items) {
        if (gt.materiality !== "CRITICAL" && gt.materiality !== "MATERIAL") continue;
        if (gt.role === "DEPENDENCY" || gt.role === "REFERENCE") continue; // term/section correspondence is a legitimate, disclosed inference path - covered separately
        if (s.expectedNonComputationalRefs?.includes(gt.ref)) continue; // explicitly dispositioned items are not omissions
        const id = b.idOf(gt.ref);
        const { ir, removed } = stripLineageNodes(base, id);
        if (removed === 0) continue;
        const values = b.inventory.items.find((i) => i.inventoryItemId === id)!.quantitativeValues;
        if (values.some((v) => valueStillPresent(ir, v.kind, v.normalizedValue, v.rawText))) continue; // the value legitimately survives elsewhere in the IR - not an omission
        if (values.length === 0 && gt.role !== "PERMISSION" && gt.role !== "PROHIBITION" && gt.role !== "CONDITION" && gt.role !== "EXCEPTION" && gt.role !== "SHARED_CAP" && gt.role !== "RECLASSIFICATION" && gt.role !== "REQUIREMENT" && gt.role !== "TRIGGER" && gt.role !== "CURE" && gt.role !== "TIME_PERIOD" && gt.role !== "FORMULA_COMPONENT" && gt.role !== "VALUE" && gt.role !== "THRESHOLD" && gt.role !== "ALTERNATIVE") continue;
        injections++;
        perScenario++;
        const acc = reconcileScenario(b, ir);
        const item = acc.items.find((i) => i.inventoryItemId === id)!;
        if (item.disposition === "MISSING_FROM_COMPOSITION" && acc.counts.materialMissingFromComposition >= 1 && !acc.semanticallyComplete) detected++;
        else misses.push(`${s.id}:${gt.ref} -> ${item.disposition} (${item.reason})`);
      }
      expect(perScenario, `${s.id} must contribute at least one injectable omission`).toBeGreaterThanOrEqual(1);
    }
    expect(misses).toEqual([]);
    expect(injections).toBeGreaterThan(100);
    expect(detected / injections).toBe(1);
  });

  it("I42: omitting (rewriting) one monetary value is detected - lineage without value correspondence never earns credit - 100% over the corpus", async () => {
    let injections = 0;
    let detected = 0;
    const misses: string[] = [];
    for (const s of COMPLETE_SCENARIOS) {
      const b = await get(s.id);
      const base = normalizeScenarioComposition(b);
      for (const gt of s.items) {
        if (gt.materiality !== "CRITICAL" && gt.materiality !== "MATERIAL") continue;
        const id = b.idOf(gt.ref);
        const item = b.inventory.items.find((i) => i.inventoryItemId === id)!;
        for (const v of item.quantitativeValues.filter((v) => v.kind === "MONEY" && v.normalizedValue !== null)) {
          const { ir, rewritten } = perturbLiteral(base, "MONEY", v.normalizedValue!);
          if (rewritten === 0 || valueStillPresent(ir, "MONEY", v.normalizedValue, v.rawText)) continue;
          injections++;
          const acc = reconcileScenario(b, ir);
          const r = acc.items.find((i) => i.inventoryItemId === id)!;
          const q = r.quantitative.find((x) => x.value.rawText === v.rawText)!;
          if (q.disposition === "VALUE_MISSING_FROM_COMPOSITION" && r.disposition === "MISSING_FROM_COMPOSITION" && acc.counts.materialQuantitativeValuesMissing >= 1 && !acc.semanticallyComplete) detected++;
          else misses.push(`${s.id}:${gt.ref}:${v.rawText} -> ${r.disposition}/${q.disposition}`);
        }
      }
    }
    expect(misses).toEqual([]);
    expect(injections).toBeGreaterThan(50);
    expect(detected / injections).toBe(1);
  });

  it("I43: omitting (rewriting) one percentage is detected - 100% over the corpus", async () => {
    let injections = 0;
    let detected = 0;
    const misses: string[] = [];
    for (const s of COMPLETE_SCENARIOS) {
      const b = await get(s.id);
      const base = normalizeScenarioComposition(b);
      for (const gt of s.items) {
        if (gt.materiality !== "CRITICAL" && gt.materiality !== "MATERIAL") continue;
        const id = b.idOf(gt.ref);
        const item = b.inventory.items.find((i) => i.inventoryItemId === id)!;
        for (const v of item.quantitativeValues.filter((v) => v.kind === "PERCENT" && v.normalizedValue !== null)) {
          const { ir, rewritten } = perturbLiteral(base, "PERCENT", v.normalizedValue!);
          if (rewritten === 0 || valueStillPresent(ir, "PERCENT", v.normalizedValue, v.rawText)) continue;
          injections++;
          const acc = reconcileScenario(b, ir);
          const r = acc.items.find((i) => i.inventoryItemId === id)!;
          const q = r.quantitative.find((x) => x.value.rawText === v.rawText)!;
          if (q.disposition === "VALUE_MISSING_FROM_COMPOSITION" && r.disposition === "MISSING_FROM_COMPOSITION" && !acc.semanticallyComplete) detected++;
          else misses.push(`${s.id}:${gt.ref}:${v.rawText} -> ${r.disposition}/${q.disposition}`);
        }
      }
    }
    expect(misses).toEqual([]);
    expect(injections).toBeGreaterThan(10);
    expect(detected / injections).toBe(1);
  });

  it("I44: omitting one condition (dropping the IRCondition that carries it) is detected - 100% over every scenario with a condition item", async () => {
    let injections = 0;
    let detected = 0;
    const misses: string[] = [];
    for (const s of COMPLETE_SCENARIOS) {
      const b = await get(s.id);
      const base = normalizeScenarioComposition(b);
      for (const gt of s.items.filter((i) => i.role === "CONDITION" && (i.materiality === "CRITICAL" || i.materiality === "MATERIAL"))) {
        const id = b.idOf(gt.ref);
        const carried = base.rules.some((r) => r.conditions.some((c) => c.inventoryItemIds?.includes(id)) || r.exceptions.some((e) => e.conditions.some((c) => c.inventoryItemIds?.includes(id))));
        if (!carried) continue;
        const { ir, removed } = stripLineageNodes(base, id);
        expect(removed).toBeGreaterThanOrEqual(1);
        const values = b.inventory.items.find((i) => i.inventoryItemId === id)!.quantitativeValues;
        if (values.some((v) => valueStillPresent(ir, v.kind, v.normalizedValue, v.rawText))) continue;
        injections++;
        const acc = reconcileScenario(b, ir);
        const r = acc.items.find((i) => i.inventoryItemId === id)!;
        if (r.disposition === "MISSING_FROM_COMPOSITION" && !acc.semanticallyComplete) detected++;
        else misses.push(`${s.id}:${gt.ref} -> ${r.disposition} (${r.reason})`);
      }
    }
    expect(misses).toEqual([]);
    expect(injections).toBeGreaterThan(10);
    expect(detected / injections).toBe(1);
  });

  it("no false COMPLETE: a composition that links every item by lineage but carries none of the values is MISSING for every valued item", async () => {
    const b = await get("I6");
    const bogus = submission({ rules: [rule("r1", "7.01", { capacityExpression: M(1, [b.idOf("a"), b.idOf("b")]) }, [b.idOf("lead")])] });
    const acc = reconcileScenario(b, normalizeScenarioComposition(b, bogus));
    expect(acc.semanticallyComplete).toBe(false);
    expect(acc.items.filter((i) => i.disposition === "MISSING_FROM_COMPOSITION").length).toBe(2);
    expect(acc.items.filter((i) => i.disposition === "MISSING_FROM_COMPOSITION").every((i) => /lineage claim without value correspondence/.test(i.reason))).toBe(true);
  });

  it("dangling lineage: a composition claiming an inventoryItemId the frozen inventory never had is counted and blocks completeness", async () => {
    const b = await get("I6");
    const base = b.scenario.compose(b.idOf);
    base.rules[0]!.inventoryItemIds = [...(base.rules[0]!.inventoryItemIds ?? []), "inv-item:does-not-exist"];
    const acc = reconcileScenario(b, normalizeScenarioComposition(b, base));
    expect(acc.counts.danglingLineageReferences).toBe(1);
    expect(acc.semanticallyComplete).toBe(false);
  });

  it("self-declared REPRESENTED is never accepted as a disposition - only lineage/value correspondence earns it", async () => {
    const b = await get("I6");
    const bogus = submission({ rules: [rule("r1", "7.01", { capacityExpression: M(25_000_000, [b.idOf("a")]) }, [b.idOf("lead")])], inventoryDispositions: [{ inventoryItemId: b.idOf("b"), disposition: "REPRESENTED", note: "trust me" }] });
    const acc = reconcileScenario(b, normalizeScenarioComposition(b, bogus));
    const item = acc.items.find((i) => i.inventoryItemId === b.idOf("b"))!;
    expect(item.disposition).toBe("MISSING_FROM_COMPOSITION");
    expect(item.modelDisposition).toBe("REPRESENTED");
  });

  it("I10/I29/I32/I40: an unresolvable cross-unit dependsOn is preserved as IRRule.unresolvedDependencies (never dropped) and the inventory item is AMBIGUOUS (never REPRESENTED, never MISSING)", async () => {
    for (const id of ["I10", "I29", "I32", "I40"]) {
      const b = await get(id);
      const normalized = normalizeScenarioComposition(b);
      const unresolved = normalized.rules.flatMap((r) => r.unresolvedDependencies ?? []);
      expect(unresolved.length, id).toBe(1);
      expect(unresolved[0]!.targetRef).toMatch(/Section 7\.0\d/);
      const depRef = id === "I10" ? "adep" : "dep";
      expect(unresolved[0]!.inventoryItemIds).toEqual([b.idOf(depRef)]);
      const acc = reconcileScenario(b, normalized);
      expect(acc.items.find((i) => i.inventoryItemId === b.idOf(depRef))!.disposition, id).toBe("AMBIGUOUS");
    }
  });

  it("I28/I29: a shared cap is structurally represented (IRSharedCapacity with lineage) and its value lives only there - omitting it is detected", async () => {
    for (const id of ["I28", "I29"]) {
      const b = await get(id);
      const normalized = normalizeScenarioComposition(b);
      expect(normalized.sharedCapacities.length, id).toBe(1);
      expect(normalized.sharedCapacities[0]!.inventoryItemIds).toEqual([b.idOf("cap")]);
      expect(normalized.sharedCapacities[0]!.memberRuleIds.length).toBeGreaterThanOrEqual(1);
      const { ir } = stripLineageNodes(normalized, b.idOf("cap"));
      const acc = reconcileScenario(b, ir);
      expect(acc.items.find((i) => i.inventoryItemId === b.idOf("cap"))!.disposition).toBe("MISSING_FROM_COMPOSITION");
      expect(acc.counts.criticalMissingFromComposition).toBe(1);
    }
  });

  it("I33: a within-unit dependency chain (c -> b -> a) is resolved to real IRRuleDependency edges carrying lineage", async () => {
    const b = await get("I33");
    const normalized = normalizeScenarioComposition(b);
    const rb = normalized.rules[1]!;
    const rc = normalized.rules[2]!;
    expect(rb.dependsOn[0]!.targetRuleId).toBe(normalized.rules[0]!.ruleId);
    expect(rc.dependsOn[0]!.targetRuleId).toBe(rb.ruleId);
    expect(rb.dependsOn[0]!.inventoryItemIds).toEqual([b.idOf("bdep")]);
    expect(rc.dependsOn[0]!.inventoryItemIds).toEqual([b.idOf("cdep")]);
    expect(rb.unresolvedDependencies ?? []).toEqual([]);
  });
});

describe("semantic accountability - agreement-level rollup (mission §26)", () => {
  it("all units complete + verified -> SEMANTICALLY_COMPLETE; one material MISSING anywhere -> SEMANTICALLY_INCOMPLETE", async () => {
    const units: AgreementUnitInput[] = [];
    for (const id of ["I6", "I7", "I12", "I16"]) {
      const b = await get(id);
      units.push(unit(id, reconcileScenario(b, normalizeScenarioComposition(b))));
    }
    expect(rollupAgreementSemanticStatus(units).status).toBe("SEMANTICALLY_COMPLETE");
    const b6 = await get("I6");
    const { ir } = stripLineageNodes(normalizeScenarioComposition(b6), b6.idOf("b"));
    const broken = [...units.slice(1), unit("I6", reconcileScenario(b6, ir))];
    const r = rollupAgreementSemanticStatus(broken);
    expect(r.status).toBe("SEMANTICALLY_INCOMPLETE");
    expect(r.counts.materialMissingFromComposition).toBe(1);
  });

  it("unresolved cross-references, unverified units, truncated source or missing accountability -> REVIEW_REQUIRED, never COMPLETE", async () => {
    const b10 = await get("I10");
    const acc10 = reconcileScenario(b10, normalizeScenarioComposition(b10));
    expect(rollupAgreementSemanticStatus([unit("I10", acc10, { unresolvedCrossReferences: 1 })]).status).toBe("REVIEW_REQUIRED");
    const b6 = await get("I6");
    const acc6 = reconcileScenario(b6, normalizeScenarioComposition(b6));
    expect(rollupAgreementSemanticStatus([unit("I6", acc6, { verifyStatus: null })]).status).toBe("REVIEW_REQUIRED");
    expect(rollupAgreementSemanticStatus([unit("I6", null)]).status).toBe("REVIEW_REQUIRED");
    const b39 = await get("I39");
    expect(rollupAgreementSemanticStatus([unit("I39", reconcileScenario(b39, normalizeScenarioComposition(b39)))]).status).toBe("REVIEW_REQUIRED");
    expect(rollupAgreementSemanticStatus([]).status).toBe("REVIEW_REQUIRED");
  });
});

describe("semantic accountability - compile.ts integration (Pass A freeze -> Pass B -> Pass C)", () => {
  function scriptedComposer(build: (input: SemanticCompilerInput) => SemanticCallerResult["submission"]): SemanticCaller & { inputs: SemanticCompilerInput[] } {
    const inputs: SemanticCompilerInput[] = [];
    return {
      providerName: "scripted",
      model: "scripted-composer",
      isSynthetic: false,
      inputs,
      async compile(input) {
        inputs.push(input);
        return { submission: build(input), rawSubmission: {}, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
      },
    };
  }

  async function compileScenario(id: string, omitRef?: string) {
    const b = await get(id);
    const composer = scriptedComposer((input) => {
      // The composition sees the FROZEN inventory (read-only) and composes against its ids - exactly the production flow.
      const frozen = input.frozenInventory!;
      const idOf = (ref: string) => {
        const gt = b.scenario.items.find((i) => i.ref === ref)!;
        return frozen.items.find((i) => i.sourceSpan.excerpt === gt.excerpt && i.semanticRole === gt.role)!.inventoryItemId;
      };
      const s = b.scenario.compose(idOf);
      if (omitRef) {
        const omitId = idOf(omitRef);
        s.rules = s.rules.filter((r) => !(r.capacityExpression?.inventoryItemIds ?? []).includes(omitId));
      }
      return s;
    });
    const input = testCompilerInput({
      candidateRef: id,
      sourceDocumentId: DOC_ID,
      sourceSectionRef: b.scenario.anchorRef,
      operativeSourceText: b.operativeText,
      operativeCharStart: b.anchor.charStart,
      contextBundle: emptyContextBundle({ originatingDocumentId: DOC_ID, originatingStructuralNodeIds: [b.anchor.nodeId], normalizedSourceRef: b.scenario.anchorRef }),
      toolAccess: { structuralIndex: b.index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle({ originatingDocumentId: DOC_ID, originatingStructuralNodeIds: [b.anchor.nodeId] }) },
    });
    const result = await compileCovenantToIR(input, { caller: composer, inventoryCaller: scriptedInventoryCaller(scriptedWireItems(b.scenario.items)), cache: new InMemorySemanticCompilationCache() });
    return { b, result, composer };
  }

  it("a fully accounted unit compiles COMPLETED with accountability.semanticallyComplete=true; the composition received the frozen inventory before composing", async () => {
    const { result, composer } = await compileScenario("I6");
    expect(result.status).toBe("COMPLETED");
    expect(result.sourceContext?.state).toBe("COMPLETE_LOCAL_SOURCE");
    expect(result.frozenInventory?.inventoryStatus).toBe("INVENTORY_OK");
    expect(result.accountability?.semanticallyComplete).toBe(true);
    expect(composer.inputs[0]!.frozenInventory?.frozenContentHash).toBe(result.frozenInventory?.frozenContentHash);
  });

  it("omitting a material item in the composition surfaces INVENTORY_ITEM_MISSING_FROM_COMPOSITION as a failure reason and the unit is not COMPLETED", async () => {
    const { result } = await compileScenario("I6", "b");
    expect(result.failureReasons).toContain("INVENTORY_ITEM_MISSING_FROM_COMPOSITION");
    expect(result.status).not.toBe("COMPLETED");
    expect(result.accountability?.counts.materialMissingFromComposition).toBe(1);
    expect(result.unresolvedIssues.some((i) => i.includes("MISSING_FROM_COMPOSITION"))).toBe(true);
  });

  it("a truncated operative window surfaces SOURCE_CONTEXT_TRUNCATED and can never be COMPLETED", async () => {
    const { result } = await compileScenario("I39");
    expect(result.sourceContext?.state).toBe("TRUNCATED_SOURCE");
    expect(result.failureReasons).toContain("SOURCE_CONTEXT_TRUNCATED");
    expect(result.status).not.toBe("COMPLETED");
  });

  it("accountability can only be disabled explicitly (options.accountability === false) - and then it is null, never a fake COMPLETE", async () => {
    const b = await get("I6");
    const composer = scriptedComposer(() => b.scenario.compose(b.idOf));
    const result = await compileCovenantToIR(testCompilerInput({ candidateRef: "I6", operativeSourceText: b.operativeText }), { caller: composer, accountability: false, cache: new InMemorySemanticCompilationCache() });
    expect(result.accountability).toBeNull();
    expect(result.frozenInventory).toBeNull();
    expect(result.sourceContext).toBeNull();
  });
});
