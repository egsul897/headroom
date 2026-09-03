/**
 * CANARY #12: the red team's preserved Cyrillic fixture, verbatim (/tmp/rt/p1.ts line 18; audit finding 6,
 * "Same for Cyrillic"). VERIFY-FIRST: canary #11's script-agnostic fix may already cover it.
 *
 * Run:  npx tsx scripts/source-coverage-canary12-reproduce.ts
 */
import { computeSourceCoverage, segmentSourceUnits, classifyUnaccountedFragment } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { scanQuantitativeValues } from "../lib/contract-model/compiler/semantic-accountability/quantitative";
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

const CYR = "Заемщик не вправе создавать залог.";
// The audit's end-to-end shape for finding 6 (S7): an uninventoried non-Latin clause between two covered
// English clauses. The Cyrillic sentence is substituted into that surround exactly as the finding describes.
const TEXT = `The Borrower shall comply with all Applicable Laws.\n${CYR}\nThe Agent may inspect the books of the Borrower.`;
const ANCHORED = ["The Borrower shall comply with all Applicable Laws.", "The Agent may inspect the books of the Borrower."];
const CJK = "借款人不得在抵押物上设定任何留置权或其他担保权益。";

function region(text: string) {
  return { regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null };
}
function span(text: string, f: string) { const at = text.indexOf(f); return { regionId: "operative", charStart: at, charEnd: at + f.length, materiality: "CRITICAL" as const }; }

async function main() {
  console.log("=== §1 exact fixture + Unicode properties");
  const cps = [...CYR].map((c) => c.codePointAt(0)!);
  console.log(`   ${JSON.stringify(CYR)} length=${CYR.length} first=U+${cps[0]!.toString(16).toUpperCase()} last=U+${cps[cps.length - 1]!.toString(16).toUpperCase()}`);
  console.log(`   \\p{L}=${(CYR.match(/\p{L}/gu) ?? []).length} \\p{Script=Cyrillic}=${(CYR.match(/\p{Script=Cyrillic}/gu) ?? []).length} ASCII[A-Za-z0-9]=${(CYR.match(/[A-Za-z0-9]/g) ?? []).length}`);
  console.log(`   scanQuantitativeValues -> ${JSON.stringify(scanQuantitativeValues(CYR))}`);
  console.log(`   classifier (the red team's exact probe) -> ${classifyUnaccountedFragment(CYR, scanQuantitativeValues(CYR)).disposition}`);
  console.log("\n=== §2 segmentation");
  for (const u of segmentSourceUnits(TEXT)) console.log(`   ${JSON.stringify(TEXT.slice(u.charStart, u.charEnd))}`);
  console.log("\n=== §2 coverage - lines 1 and 3 inventoried, the Cyrillic clause not");
  const cov = computeSourceCoverage({ regions: [region(TEXT)], spans: ANCHORED.map((f) => span(TEXT, f)) });
  for (const s of cov.spans) console.log(`   [${s.disposition}] ${JSON.stringify(s.excerpt)}`);
  console.log(`   unaccounted=${cov.unaccounted.length}`);
  const wire: WireInventoryItem[] = ANCHORED.map((excerpt, i) => ({ localRef: `i${i}`, semanticRole: "OTHER", proposition: `clause ${i}`, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }));
  const caller = { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: wire } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
  const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region(TEXT)], unresolvedReferences: [], reasons: [], totalChars: TEXT.length, budgetChars: 10_000 };
  const inv = await runSemanticInventory({ candidateRef: "canary12", documentId: "d", sourceContext: sc, caller });
  const rec = reconcileInventoryWithComposition({ inventory: inv, composition: { rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] } as never, dispositions: inv.items.map((i) => ({ inventoryItemId: i.inventoryItemId, disposition: "REPRESENTED" as const, note: "matched" })), sourceContextState: sc.state });
  console.log(`\n=== §2 end to end\n   inventoryStatus      = ${inv.inventoryStatus}\n   unaccountedSource    = ${inv.unaccountedSource.length} ${JSON.stringify(inv.unaccountedSource.map((s) => s.excerpt))}\n   semanticallyComplete = ${rec.semanticallyComplete}`);
  console.log("\n=== §7 canary #11 CJK fixture");
  console.log(`   ${classifyUnaccountedFragment(CJK, []).disposition}`);
  console.log("\n=== §6 punctuation control (existing)");
  console.log(`   "; :," -> ${classifyUnaccountedFragment("; :,", []).disposition}`);
}
main();
