/** CANARY #3: the red team's RT-8 overbroad-span attack, verbatim. */
import { computeSourceCoverage, segmentSourceUnits } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

const TEXT = "The Borrower shall not incur Indebtedness exceeding $10,000,000. The Borrower shall maintain a Leverage Ratio of not more than 4.00 to 1.00 as of the last day of each fiscal quarter. The cure period is 30 days.";
const REGION = { regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: TEXT.length, text: TEXT, expandedFor: null, truncatedAtBudget: false, unitExtension: null };

async function main() {
  console.log("=== structural units");
  for (const u of segmentSourceUnits(TEXT)) console.log(`   ${JSON.stringify(TEXT.slice(u.charStart, u.charEnd))}`);

  console.log("\n=== coverage: ONE CRITICAL item, span = whole region, vacuous proposition");
  const cov = computeSourceCoverage({ regions: [REGION], spans: [{ regionId: "operative", charStart: 0, charEnd: TEXT.length, materiality: "CRITICAL" }] });
  for (const s of cov.spans) console.log(`   [${s.disposition}] ${JSON.stringify(s.excerpt.slice(0, 80))}`);
  console.log(`   unaccounted=${cov.unaccounted.length} unaccountedValues=${cov.unaccountedValues.length}`);

  console.log("\n=== end to end");
  const item: WireInventoryItem = { localRef: "blanket", semanticRole: "OTHER", proposition: "this section contains provisions", excerpt: TEXT, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" };
  const caller = { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: [item] } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
  const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [REGION], unresolvedReferences: [], reasons: [], totalChars: TEXT.length, budgetChars: 10000 };
  const inv = await runSemanticInventory({ candidateRef: "canary3", documentId: "d", sourceContext: sc, caller });
  console.log(`   items=${inv.items.length} span=${inv.items[0]?.sourceSpan.charStart}-${inv.items[0]?.sourceSpan.charEnd} values auto-attached=${inv.items[0]?.quantitativeValues.length}`);
  console.log(`   inventoryStatus      = ${inv.inventoryStatus}`);
  console.log(`   unaccountedSource    = ${inv.unaccountedSource.length} ${JSON.stringify(inv.unaccountedSource.map((s) => s.excerpt.slice(0, 60)))}`);
  console.log(`   uninventoriedValues  = ${inv.uninventoriedValues.length}`);
  // The audit's IR carried a MONEY 10000000 literal, a RATIO 4 and a condition description naming "30 days",
  // so the one blanket item reconciled REPRESENTED with all three values matched.
  const ids = inv.items.map((i) => i.inventoryItemId);
  const composition = { rules: [{
    inventoryItemIds: ids,
    capacityExpression: { kind: "MONEY", amount: 10_000_000, inventoryItemIds: ids },
    conditions: [
      { inventoryItemIds: ids, description: "leverage ratio test", expression: { kind: "RATIO", value: 4, inventoryItemIds: ids } },
      { inventoryItemIds: ids, description: "the cure period is 30 days", expression: null },
    ],
    exceptions: [], dependsOn: [], unresolvedDependencies: [],
  }], definitions: [], sharedCapacities: [] };
  // The audit's harness supplied an IR whose literals matched, so the single item reconciled REPRESENTED.
  // Modelled here by an explicit REPRESENTED disposition - the point of the attack is Pass A coverage, not Pass B.
  const rec = reconcileInventoryWithComposition({ inventory: inv, composition: composition as never, dispositions: inv.items.map((i) => ({ inventoryItemId: i.inventoryItemId, disposition: "REPRESENTED", note: "matched in IR" })), sourceContextState: sc.state });
  console.log(`   itemDisposition      = ${rec.items[0]?.disposition}`);
  console.log(`   semanticallyComplete = ${rec.semanticallyComplete}`);
  console.log(`   reasons              = ${JSON.stringify(rec.reasons)}`);
}
main();
