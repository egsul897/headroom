/**
 * CANARY #7: the red team's numbered-caption attack, verbatim (audit finding 2, and its V4 variant).
 *
 * Defect (pre-fix): NUMBERED_CAPTION_RE's body was `[A-Za-z][\w\s,'&/-]{0,80}?` - an arbitrary run of words
 * under a length ceiling. Any numbered line up to ~86 characters with no clause terminator inside read as a
 * caption, so an entire negative covenant was dismissed as a heading.
 *
 * Run:  npx tsx scripts/source-coverage-canary7-reproduce.ts
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
  console.log(`   unaccounted=${cov.unaccounted.length} unaccountedValues=${cov.unaccountedValues.length} ${JSON.stringify(cov.unaccountedValues.map((v) => `${v.kind}:${v.rawText}`))}`);
  return cov;
}

// --- §1 the attack, verbatim (red team finding 2) ----------------------------------------------------------
const F2 = "6.01 The Borrower shall deliver annual financial statements to the Agent.\n6.02 The Borrower shall not create any Lien on the Collateral\n6.03 The Borrower shall maintain insurance with reputable insurers at all times.";
console.log("=== structural units");
for (const u of segmentSourceUnits(F2)) console.log(`   ${JSON.stringify(F2.slice(u.charStart, u.charEnd))}`);
report("ATTACK - 6.01 and 6.03 are inventoried, 6.02 is not", F2, ["6.01 The Borrower shall deliver annual financial statements to the Agent.", "6.03 The Borrower shall maintain insurance with reputable insurers at all times."]);

// --- §6 the V4 variant carrying the material amount --------------------------------------------------------
const V4 = "5.02 The maximum aggregate basket amount is 2,500,000";
console.log("\n=== §6 does the extractor recognise the V4 amount?");
console.log(`   scanQuantitativeValues("2,500,000")               -> ${JSON.stringify(scanQuantitativeValues("2,500,000"))}`);
console.log(`   scanQuantitativeValues(<the whole V4 line>)       -> ${JSON.stringify(scanQuantitativeValues(V4))}`);
report("ATTACK V4 - a numbered line carrying a material amount, nothing inventoried", V4, []);

// --- §8 true numbered-caption control ----------------------------------------------------------------------
console.log("\n=== §8 genuine captions (classifier, standalone) - must stay HEADING_OR_LABEL");
for (const f of ["SECTION 7.04 Dispositions.", "6.02 Liens.", "7.05 Restricted Payments", "6.02 Limitation on Indebtedness.", "Section 7.11."]) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}

// --- §9 generic numbered-proposition control (no legal vocabulary) -----------------------------------------
console.log("\n=== §9 numbered propositions (classifier, standalone) - must be UNACCOUNTED_SOURCE");
for (const f of ["5.02 The Company must deliver the report.", "6.02 The Borrower shall not create any Lien on the Collateral", V4]) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}

// --- end to end: does the numbered covenant block completeness? -------------------------------------------
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

async function endToEnd() {
  const anchored = ["6.01 The Borrower shall deliver annual financial statements to the Agent.", "6.03 The Borrower shall maintain insurance with reputable insurers at all times."];
  const wire: WireInventoryItem[] = anchored.map((excerpt, i) => ({ localRef: `i${i}`, semanticRole: "OTHER", proposition: `covenant ${i}`, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }));
  const caller = { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: wire } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
  const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region(F2)], unresolvedReferences: [], reasons: [], totalChars: F2.length, budgetChars: 10_000 };
  const inv = await runSemanticInventory({ candidateRef: "canary7", documentId: "d", sourceContext: sc, caller });
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
