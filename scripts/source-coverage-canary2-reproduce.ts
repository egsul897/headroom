/** CANARY #2 reproduction: the independent red team's S9 fixture. */
import { computeSourceCoverage, classifyUnaccountedFragment, segmentSourceUnits } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { rollupAgreementSemanticStatus } from "../lib/contract-model/compiler/semantic-accountability/rollup";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

const TEXT = "The Borrower shall not make any Investment, except as provided in Section 6.02, at any time prior to the Maturity Date.";
const REGION = { regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: TEXT.length, text: TEXT, expandedFor: null, truncatedAtBudget: false, unitExtension: null };

const ANCHORED = ["The Borrower shall not make any Investment,", "at any time prior to the Maturity Date."];

async function main() {
  console.log("=== units");
  for (const u of segmentSourceUnits(TEXT)) console.log(`   ${JSON.stringify(TEXT.slice(u.charStart, u.charEnd))}`);

  console.log("\n=== direct classifier probe");
  for (const f of ["except as provided in Section 6.02,", "and", "; and", "(a)"]) {
    console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
  }

  console.log("\n=== coverage with the exception NOT inventoried");
  const spans = ANCHORED.map((n) => { const i = TEXT.indexOf(n); if (i < 0) throw new Error(n); return { regionId: "operative", charStart: i, charEnd: i + n.length, materiality: "CRITICAL" }; });
  const cov = computeSourceCoverage({ regions: [REGION], spans });
  for (const s of cov.spans) console.log(`   [${s.disposition}] ${JSON.stringify(s.excerpt)}`);
  console.log(`   unaccounted=${cov.unaccounted.length} values=${cov.unaccountedValues.length}`);

  console.log("\n=== end to end");
  const items: WireInventoryItem[] = ANCHORED.map((n, i) => ({ localRef: `a${i}`, semanticRole: "PROHIBITION", proposition: `p${i}`, excerpt: n, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }));
  const caller = { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
  const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [REGION], unresolvedReferences: [], reasons: [], totalChars: TEXT.length, budgetChars: 10000 };
  const inv = await runSemanticInventory({ candidateRef: "canary2", documentId: "d", sourceContext: sc, caller });
  const composition = { rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] };
  const rec = reconcileInventoryWithComposition({ inventory: inv, composition: composition as never, dispositions: [], sourceContextState: sc.state });
  const roll = rollupAgreementSemanticStatus([{ candidateRef: "canary2", accountability: rec, verification: null }] as never);
  console.log(`   inventoryStatus       = ${inv.inventoryStatus}`);
  console.log(`   unaccountedSource     = ${inv.unaccountedSource.length} ${JSON.stringify(inv.unaccountedSource.map((s) => s.excerpt))}`);
  console.log(`   uninventoriedValues   = ${inv.uninventoriedValues.length}`);
  console.log(`   semanticallyComplete  = ${rec.semanticallyComplete}`);
  console.log(`   reasons               = ${JSON.stringify(rec.reasons)}`);
  console.log(`   rollup                = ${(roll as { status: string }).status}`);
}
main();
