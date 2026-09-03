/**
 * CANARY #6: the red team's S8 bare-integer attack, verbatim (audit finding 7).
 *
 * Defect (pre-fix): PAGE_FURNITURE_RE carried the alternative `[-–—\s]*\d+[-–—\s]*`, so ANY standalone integer
 * was "page or table-of-contents furniture". A basket amount written without a currency symbol - which the
 * quantitative extractor also does not recognise, since it has no bare-number pattern - was therefore accounted
 * for twice over as non-semantic and vanished.
 *
 * Run:  npx tsx scripts/source-coverage-canary6-reproduce.ts
 */
import { computeSourceCoverage, segmentSourceUnits, classifyUnaccountedFragment } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { scanQuantitativeValues } from "../lib/contract-model/compiler/semantic-accountability/quantitative";

type Span = { regionId: string; charStart: number; charEnd: number; materiality: "CRITICAL" | "MATERIAL" };
function region(text: string) {
  return { regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null };
}
function span(text: string, fragment: string): Span {
  const at = text.indexOf(fragment);
  if (at < 0) throw new Error(`fragment not present: ${fragment}`);
  return { regionId: "operative", charStart: at, charEnd: at + fragment.length, materiality: "CRITICAL" };
}
function report(label: string, text: string, fragments: string[]) {
  const cov = computeSourceCoverage({ regions: [region(text)], spans: fragments.map((f) => span(text, f)) });
  console.log(`\n=== ${label}`);
  for (const s of cov.spans) console.log(`   [${s.disposition}] ${JSON.stringify(s.excerpt)}`);
  console.log(`   unaccounted=${cov.unaccounted.length} unaccountedValues=${cov.unaccountedValues.length}`);
  return cov;
}

// --- §1 the attack, verbatim (red team finding 7, scenario S8) ---------------------------------------------
const S8 = "The following baskets apply:\nGeneral Basket\n25000000\nAcquisition Basket\n40000000\nThe Borrower shall not exceed the applicable basket.";
console.log("=== structural units");
for (const u of segmentSourceUnits(S8)) console.log(`   ${JSON.stringify(S8.slice(u.charStart, u.charEnd))}`);
console.log("\n=== quantitative extraction over the bare integer (§6: why value accounting is bypassed)");
console.log(`   scanQuantitativeValues("25000000") -> ${JSON.stringify(scanQuantitativeValues("25000000"))}`);
report("ATTACK - the two basket labels and the closing sentence are inventoried, the amounts are not", S8, ["The following baskets apply:", "General Basket", "Acquisition Basket", "The Borrower shall not exceed the applicable basket."]);

// --- §8 true page-number control ---------------------------------------------------------------------------
console.log("\n=== §8 pagination fixtures (classifier, standalone) - must stay NON_SEMANTIC_FORMATTING");
for (const f of ["Page 12", "Page 12 of 40", "- 12 -", "12 of 40", "Negative Covenants..............72"]) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}
console.log("\n=== bare numbers (classifier, standalone) - must NOT be page furniture");
for (const f of ["12", "75", "100", "4.00", "2028", "25000000"]) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}
console.log("\n=== numeric enumerator residue - must stay STRUCTURAL_NOISE");
for (const f of ["(a)", "(2)", "(iv)", "and", "; :,"]) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}

// --- §9 generic bare-number control (no legal vocabulary at all) -------------------------------------------
report("CONTROL - generic bare number (must surface a gap)", "Threshold\n75", ["Threshold"]);

// --- end to end: does the bare basket amount block completeness? ------------------------------------------
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

async function endToEnd() {
  const anchored = ["The following baskets apply:", "General Basket", "Acquisition Basket", "The Borrower shall not exceed the applicable basket."];
  const wire: WireInventoryItem[] = anchored.map((excerpt, i) => ({ localRef: `i${i}`, semanticRole: "OTHER", proposition: `basket line ${i}`, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }));
  const caller = { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: wire } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
  const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region(S8)], unresolvedReferences: [], reasons: [], totalChars: S8.length, budgetChars: 10_000 };
  const inv = await runSemanticInventory({ candidateRef: "canary6", documentId: "d", sourceContext: sc, caller });
  console.log(`\n=== end to end`);
  console.log(`   inventoryStatus      = ${inv.inventoryStatus}`);
  console.log(`   unaccountedSource    = ${inv.unaccountedSource.length} ${JSON.stringify(inv.unaccountedSource.map((s) => s.excerpt))}`);
  const rec = reconcileInventoryWithComposition({
    inventory: inv,
    composition: { rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] } as never,
    dispositions: inv.items.map((i) => ({ inventoryItemId: i.inventoryItemId, disposition: "REPRESENTED" as const, note: "matched" })),
    sourceContextState: sc.state,
  });
  console.log(`   semanticallyComplete = ${rec.semanticallyComplete}`);
}
endToEnd();
