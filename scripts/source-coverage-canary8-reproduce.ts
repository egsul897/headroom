/**
 * CANARY #8: the red team's ALL-CAPS attack, verbatim (audit finding 1, scenarios S2 and S10).
 *
 * Defect (pre-fix): ALLCAPS_CAPTION_RE was /^\s*[A-Z][A-Z0-9\s,'&/.-]{2,80}\s*$/ - any all-caps line up to 82
 * characters was a heading. All caps is the standard drafting register for jury-trial waivers, warranty
 * disclaimers and liability caps, so operative text vanished on typography alone.
 *
 * Run:  npx tsx scripts/source-coverage-canary8-reproduce.ts
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
  console.log(`   unaccounted=${cov.unaccounted.length} unaccountedValues=${cov.unaccounted.length === 0 ? 0 : cov.unaccountedValues.length}`);
  return cov;
}

// --- §1 the attack, verbatim (red team finding 1, scenario S2) ---------------------------------------------
const S2 = "The Borrower shall repay the Loans in accordance with Section 2.05.\nEACH PARTY HEREBY IRREVOCABLY WAIVES ANY RIGHT TO TRIAL BY JURY\nThe Administrative Agent shall give notice of any prepayment.";
const WAIVER = "EACH PARTY HEREBY IRREVOCABLY WAIVES ANY RIGHT TO TRIAL BY JURY";
console.log("=== structural units");
for (const u of segmentSourceUnits(S2)) console.log(`   ${JSON.stringify(S2.slice(u.charStart, u.charEnd))}`);
console.log(`\n=== §12 recognised quantitative values in the attack fragment`);
console.log(`   scanQuantitativeValues(<waiver line>) -> ${JSON.stringify(scanQuantitativeValues(WAIVER))}`);
report("ATTACK S2 - the first and third lines are inventoried, the waiver is not", S2, ["The Borrower shall repay the Loans in accordance with Section 2.05.", "The Administrative Agent shall give notice of any prepayment."]);

// --- the S10 variant named in the same finding -------------------------------------------------------------
const S10 = "IN NO EVENT SHALL THE AGGREGATE LIABILITY EXCEED FIVE MILLION DOLLARS";
console.log(`\n=== §12 recognised values in the S10 variant`);
console.log(`   scanQuantitativeValues(<S10>) -> ${JSON.stringify(scanQuantitativeValues(S10))}`);
report("ATTACK S10 - an all-caps liability cap, nothing inventoried", S10, []);

// --- §9 true ALL-CAPS heading control ----------------------------------------------------------------------
console.log("\n=== §9 genuine all-caps headings (classifier, standalone) - must stay HEADING_OR_LABEL");
for (const f of ["NEGATIVE COVENANTS", "RESTRICTED PAYMENTS", "EVENTS OF DEFAULT", "ARTICLE VII\nNEGATIVE COVENANTS"]) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}

// --- §10 generic ALL-CAPS proposition control --------------------------------------------------------------
console.log("\n=== §10 all-caps propositions (classifier, standalone) - must be UNACCOUNTED_SOURCE");
for (const f of ["THE COMPANY MUST DELIVER THE REPORT", WAIVER, S10]) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}

// --- §11 the disclosed limitation, stated honestly rather than hidden ---------------------------------------
console.log("\n=== §11 disclosed limitation: a determinerless all-caps predication still passes");
console.log(`   "BORROWER SHALL PAY INTEREST" -> ${classifyUnaccountedFragment("BORROWER SHALL PAY INTEREST", []).disposition}`);

// --- end to end ---------------------------------------------------------------------------------------------
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

async function endToEnd() {
  const anchored = ["The Borrower shall repay the Loans in accordance with Section 2.05.", "The Administrative Agent shall give notice of any prepayment."];
  const wire: WireInventoryItem[] = anchored.map((excerpt, i) => ({ localRef: `i${i}`, semanticRole: "OTHER", proposition: `clause ${i}`, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }));
  const caller = { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: wire } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
  const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region(S2)], unresolvedReferences: [], reasons: [], totalChars: S2.length, budgetChars: 10_000 };
  const inv = await runSemanticInventory({ candidateRef: "canary8", documentId: "d", sourceContext: sc, caller });
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
