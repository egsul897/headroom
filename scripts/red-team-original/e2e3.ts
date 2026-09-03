import { runSemanticInventory } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/reconciliation";
import { rollupAgreementSemanticStatus } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/rollup";
import type { SourceContextResult } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/types";
import type { StageCaller } from "/home/user/headroom/lib/contract-model/compiler/llm-caller";
const ctx = (text: string): SourceContextResult => ({ state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: "d", sourceNodeId: "n", sectionRef: "6.02", charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: text.length, budgetChars: 1e5 });
const item = (excerpt: string, prop: string, ref = "r") => ({ localRef: ref, semanticRole: "OTHER", proposition: prop, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" });

const TEXT = "The Borrower shall not incur Indebtedness exceeding $10,000,000. The Borrower shall maintain a Leverage Ratio of not more than 4.00 to 1.00 as of the last day of each fiscal quarter. The cure period is 30 days.";

async function go(label: string, callerImpl: StageCaller) {
  const sc = ctx(TEXT);
  const inv = await runSemanticInventory({ candidateRef: label, documentId: "d", sourceContext: sc, caller: callerImpl });
  const composition = { rules: [{ inventoryItemIds: inv.items.map(i=>i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [] }], definitions: [], sharedCapacities: [] } as any;
  const disp = inv.items.map(i => ({ inventoryItemId: i.inventoryItemId, disposition: "INTENTIONALLY_NON_COMPUTATIONAL", note: "n/a" }));
  const acc = reconcileInventoryWithComposition({ inventory: inv, composition: { rules: [], definitions: [], sharedCapacities: [] }, dispositions: disp, sourceContextState: sc.state });
  const roll = rollupAgreementSemanticStatus([{ candidateRef: label, compileStatus: "COMPLETED", verifyStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND", accountability: acc, operativeStateUncertain: false, unresolvedCrossReferences: 0 }]);
  console.log(`${label}: items=${inv.items.length} status=${inv.inventoryStatus} unacc=${inv.unaccountedSource.length} vals=${inv.uninventoriedValues.length} complete=${acc.semanticallyComplete} rollup=${roll.status} gap=${JSON.stringify(inv.gapReinventory)}`);
  console.log("   propositions:", inv.items.map(i=>JSON.stringify(i.proposition)).join(", "));
}

(async () => {
// A: ONE overbroad item span swallowing the entire unit, with a vacuous proposition.
await go("A one-overbroad-span", { providerName:"s", model:"s", isSynthetic:false, async call<T>(): Promise<T> { return { items: [item(TEXT, "this section contains provisions")], overallNotes: [] } as unknown as T; }, lastTelemetry: () => null });

// B: first call returns nothing; the GAP call echoes the reported gap text back as one CRITICAL item.
let n = 0;
await go("B gap-echo", { providerName:"s", model:"s", isSynthetic:false, async call<T>(args?: any): Promise<T> {
  n++;
  if (n === 1) return { items: [], overallNotes: [] } as unknown as T;
  return { items: [item(TEXT, "acknowledged", "g")], overallNotes: [] } as unknown as T;
}, lastTelemetry: () => null });
})();
