/**
 * A citation on a rule is not the legal meaning of a condition, an exception,
 * or a shared capacity. The compatible node has to be present.
 */
import { describe, expect, it } from "vitest";
import { runSemanticInventory } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { FrozenSemanticInventory, SourceContextRegion } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";

const TEXT = "The Borrower may incur other Indebtedness provided that no Default has occurred, except purchase money obligations, together with amounts under Section 4.02. Consolidated income is determined without duplication.";
const region = (text: string): SourceContextRegion => ({ regionId: "operative", kind: "OPERATIVE", documentId: "d", sourceNodeId: null, sectionRef: "7.01", charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null });
const caller = (items: WireInventoryItem[]): StageCaller => { let call = 0; return { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: call++ === 0 ? items : [] } as T; }, lastTelemetry: () => null } as unknown as StageCaller; };
const wire = (localRef: string, role: string, excerpt: string, operative: "OPERATIVE" | "DEFINITIONAL" = "OPERATIVE"): WireInventoryItem => ({ localRef, semanticRole: role, proposition: localRef, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative } as never);

async function inventory(): Promise<FrozenSemanticInventory> {
  return runSemanticInventory({
    candidateRef: "role-lineage",
    documentId: "d",
    sourceContext: { state: "COMPLETE_LOCAL_SOURCE", regions: [region(TEXT)], unresolvedReferences: [], reasons: [], totalChars: TEXT.length, budgetChars: 10_000 },
    caller: caller([
      wire("perm", "PERMISSION", "The Borrower may incur other Indebtedness"),
      wire("cond", "CONDITION", "provided that no Default has occurred"),
      wire("exc", "EXCEPTION", "except purchase money obligations"),
      wire("cap", "SHARED_CAP", "together with amounts under Section 4.02"),
      wire("def", "CONDITION", "determined without duplication", "DEFINITIONAL"),
    ]),
  });
}

const idOf = (inv: FrozenSemanticInventory, excerpt: string) => inv.items.find((item) => item.sourceSpan.excerpt === excerpt)!.inventoryItemId;

function reconcile(inv: FrozenSemanticInventory, composition: { conditions?: unknown[]; exceptions?: unknown[]; sharedCapacities?: unknown[]; ruleIds: string[]; capacityExpression?: unknown }) {
  return reconcileInventoryWithComposition({
    inventory: inv,
    composition: {
      rules: [{ inventoryItemIds: composition.ruleIds, capacityExpression: composition.capacityExpression ?? null, conditions: composition.conditions ?? [], exceptions: composition.exceptions ?? [], dependsOn: [], unresolvedDependencies: [] }],
      definitions: [],
      sharedCapacities: composition.sharedCapacities ?? [],
    } as never,
    dispositions: [],
    sourceContextState: "COMPLETE_LOCAL_SOURCE",
  });
}

describe("inventory role must match the citing node", () => {
  it("a condition, exception, or shared capacity cited only on the rule is missing, and a permission cited there is represented", async () => {
    const inv = await inventory();
    const perm = idOf(inv, "The Borrower may incur other Indebtedness");
    const cond = idOf(inv, "provided that no Default has occurred");
    const exc = idOf(inv, "except purchase money obligations");
    const cap = idOf(inv, "together with amounts under Section 4.02");
    const rec = reconcile(inv, { ruleIds: [perm, cond, exc, cap] });
    const byId = new Map(rec.items.map((item) => [item.inventoryItemId, item]));
    expect(byId.get(perm)!.disposition).toBe("REPRESENTED");
    for (const id of [cond, exc, cap]) {
      expect(byId.get(id)!.disposition).toBe("MISSING_FROM_COMPOSITION");
      expect(byId.get(id)!.reason).toContain("does not preserve");
    }
    expect(rec.semanticallyComplete).toBe(false);
  });

  it("the same items are represented when each sits on a compatible node", async () => {
    const inv = await inventory();
    const perm = idOf(inv, "The Borrower may incur other Indebtedness");
    const cond = idOf(inv, "provided that no Default has occurred");
    const exc = idOf(inv, "except purchase money obligations");
    const cap = idOf(inv, "together with amounts under Section 4.02");
    const rec = reconcile(inv, {
      ruleIds: [perm],
      conditions: [{ inventoryItemIds: [cond], description: "no Default", expression: null }],
      exceptions: [{ inventoryItemIds: [exc], description: "purchase money", conditions: [] }],
      sharedCapacities: [{ inventoryItemIds: [cap], description: "shared with Section 4.02", capExpression: null }],
    });
    const byId = new Map(rec.items.map((item) => [item.inventoryItemId, item]));
    expect(byId.get(cond)!.disposition).toBe("REPRESENTED");
    expect(byId.get(exc)!.disposition).toBe("REPRESENTED");
    expect(byId.get(cap)!.disposition).toBe("REPRESENTED");
  });

  it("a quantitative condition cited on the capacity expression is represented, and one with no amount is not", async () => {
    const text = "Indebtedness incurred to refinance permitted Indebtedness; provided that the principal amount thereof does not exceed the principal amount so refinanced plus fees not to exceed $2,000,000. The Borrower may incur other Indebtedness provided that no Default has occurred.";
    const inv = await runSemanticInventory({
      candidateRef: "role-lineage-cap",
      documentId: "d",
      sourceContext: { state: "COMPLETE_LOCAL_SOURCE", regions: [region(text)], unresolvedReferences: [], reasons: [], totalChars: text.length, budgetChars: 10_000 },
      caller: caller([
        wire("perm", "PERMISSION", "Indebtedness incurred to refinance permitted Indebtedness"),
        wire("capcond", "CONDITION", "the principal amount thereof does not exceed the principal amount so refinanced plus fees not to exceed $2,000,000"),
        wire("logic", "CONDITION", "provided that no Default has occurred"),
      ]),
    });
    const capcond = idOf(inv, "the principal amount thereof does not exceed the principal amount so refinanced plus fees not to exceed $2,000,000");
    const logic = idOf(inv, "provided that no Default has occurred");
    expect(inv.items.find((item) => item.inventoryItemId === capcond)!.quantitativeValues.some((value) => value.normalizedValue === 2_000_000)).toBe(true);
    const money = { kind: "MONEY", amount: 2_000_000, currency: "USD", inventoryItemIds: [capcond] };
    const onCapacity = reconcile(inv, { ruleIds: [idOf(inv, "Indebtedness incurred to refinance permitted Indebtedness")], capacityExpression: money });
    expect(onCapacity.items.find((item) => item.inventoryItemId === capcond)!.disposition).toBe("REPRESENTED");
    const logicOnCapacity = reconcile(inv, { ruleIds: [], capacityExpression: { ...money, inventoryItemIds: [logic] } });
    expect(logicOnCapacity.items.find((item) => item.inventoryItemId === logic)!.disposition).toBe("MISSING_FROM_COMPOSITION");
    const capOnRule = reconcile(inv, { ruleIds: [capcond], capacityExpression: { kind: "MONEY", amount: 2_000_000, currency: "USD", inventoryItemIds: [] } });
    expect(capOnRule.items.find((item) => item.inventoryItemId === capcond)!.disposition).toBe("MISSING_FROM_COMPOSITION");
  });

  it("a definitional condition cited on a definition-shaped rule citation is not treated as a dropped operative condition", async () => {
    const inv = await inventory();
    const def = inv.items.find((item) => item.operative === "DEFINITIONAL")!;
    const rec = reconcile(inv, { ruleIds: [def.inventoryItemId] });
    expect(rec.items.find((item) => item.inventoryItemId === def.inventoryItemId)!.disposition).toBe("REPRESENTED");
  });
});
