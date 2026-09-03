/**
 * CANARY #11: the red team's S7 non-Latin operative clause, verbatim (audit finding 6).
 *
 * Defect (pre-fix): the classifier's punctuation test was `!/[A-Za-z0-9]/.test(trimmed)` - "no ASCII
 * alphanumerics" was taken to mean "punctuation and delimiters only". A Chinese negative-pledge sentence has no
 * ASCII letter in it, so the whole clause was PUNCTUATION_OR_DELIMITER and vanished.
 *
 * Run:  npx tsx scripts/source-coverage-canary11-reproduce.ts
 */
import { computeSourceCoverage, segmentSourceUnits, classifyUnaccountedFragment } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { scanQuantitativeValues } from "../lib/contract-model/compiler/semantic-accountability/quantitative";

function region(text: string) {
  return { regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null };
}
function span(text: string, fragment: string) {
  const at = text.indexOf(fragment);
  if (at < 0) throw new Error(`fragment not present: ${fragment}`);
  return { regionId: "operative", charStart: at, charEnd: at + fragment.length, materiality: "CRITICAL" as const };
}

// --- §1 the attack, verbatim (red team finding 6, scenario S7) ---------------------------------------------
const S7 = "The Borrower shall comply with all Applicable Laws.\n借款人不得在抵押物上设定任何留置权或其他担保权益。\nThe Agent may inspect the books of the Borrower.";
const CJK = "借款人不得在抵押物上设定任何留置权或其他担保权益。";
const ANCHORED = ["The Borrower shall comply with all Applicable Laws.", "The Agent may inspect the books of the Borrower."];

console.log("=== §1 code points of the dropped fragment");
const cps = [...CJK].map((c) => c.codePointAt(0)!);
console.log(`   length=${CJK.length} chars; first=U+${cps[0]!.toString(16).toUpperCase()} last=U+${cps[cps.length - 1]!.toString(16).toUpperCase()} (U+3002 IDEOGRAPHIC FULL STOP)`);
console.log(`   Unicode \\p{L} count=${(CJK.match(/\p{L}/gu) ?? []).length}  \\p{Script=Han} count=${(CJK.match(/\p{Script=Han}/gu) ?? []).length}  ASCII [A-Za-z0-9] count=${(CJK.match(/[A-Za-z0-9]/g) ?? []).length}`);
console.log(`   scanQuantitativeValues -> ${JSON.stringify(scanQuantitativeValues(CJK))}`);
console.log("\n=== segmentation");
for (const u of segmentSourceUnits(S7)) console.log(`   ${JSON.stringify(S7.slice(u.charStart, u.charEnd))}`);

console.log("\n=== ATTACK S7 - lines 1 and 3 inventoried, the CJK clause is not");
const cov = computeSourceCoverage({ regions: [region(S7)], spans: ANCHORED.map((f) => span(S7, f)) });
for (const s of cov.spans) console.log(`   [${s.disposition}] ${JSON.stringify(s.excerpt)}`);
console.log(`   unaccounted=${cov.unaccounted.length}`);
console.log(`   classifier on the isolated clause -> ${classifyUnaccountedFragment(CJK, []).disposition}`);

// --- §10 punctuation control (existing behaviour, plus its Unicode twin) -----------------------------------
console.log("\n=== §10 punctuation controls (must stay non-blocking)");
for (const f of ["; :,", "。、「」", " 　 "]) console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);

// --- §9 generic CJK content control (not added to production logic) ----------------------------------------
console.log("\n=== §9 generic CJK content control");
console.log(`   "公司交付报告" -> ${classifyUnaccountedFragment("公司交付报告", []).disposition}`);

// --- §11 incidental Cyrillic observation - NOT certification -----------------------------------------------
console.log("\n=== §11 incidental observation only (not certified, not a fixture)");
console.log(`   "Заемщик не должен создавать залог" -> ${classifyUnaccountedFragment("Заемщик не должен создавать залог", []).disposition}`);

// --- end to end ---------------------------------------------------------------------------------------------
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

async function endToEnd() {
  const wire: WireInventoryItem[] = ANCHORED.map((excerpt, i) => ({ localRef: `i${i}`, semanticRole: "OTHER", proposition: `clause ${i}`, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }));
  const caller = { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: wire } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
  const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region(S7)], unresolvedReferences: [], reasons: [], totalChars: S7.length, budgetChars: 10_000 };
  const inv = await runSemanticInventory({ candidateRef: "canary11", documentId: "d", sourceContext: sc, caller });
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
