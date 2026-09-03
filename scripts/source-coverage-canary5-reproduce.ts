/**
 * CANARY #5: the red team's S6 amendment quoted-replacement attack, verbatim.
 *
 * Defect (pre-fix): DEFINED_TERM_LABEL_RE accepted ANY quoted run up to 120 characters standing alone in a
 * segment - including a complete covenant sentence. The replacement covenant an amendment installs is the whole
 * point of the amendment, and it disappeared as "a quoted defined-term label with no operative body".
 *
 * Run:  npx tsx scripts/source-coverage-canary5-reproduce.ts
 */
import { computeSourceCoverage, segmentSourceUnits, classifyUnaccountedFragment } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";

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
}

// --- §1 the attack, verbatim (red team finding 5, scenario S6) ---------------------------------------------
const S6 = 'Section 6.02 of the Credit Agreement is amended and restated to read as follows: "The Borrower shall not make any Restricted Payment while any Default is continuing."';
console.log("=== structural units");
for (const u of segmentSourceUnits(S6)) console.log(`   ${JSON.stringify(S6.slice(u.charStart, u.charEnd))}`);
report("ATTACK - only the lead-in is inventoried", S6, ["Section 6.02 of the Credit Agreement is amended and restated to read as follows:"]);

// --- §8 true quoted-label control -------------------------------------------------------------------------
console.log("\n=== §8 quoted defined-term labels (classifier, standalone)");
for (const f of ['"Consolidated EBITDA"', '"Applicable Margin" means', '"Permitted Liens" has the meaning assigned in Section 1.01', '"Change of Control".']) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}
const DEFS = 'The following terms are defined below.\n"Consolidated EBITDA"\n"Applicable Margin"\nEach term has the meaning assigned to it.';
report("CONTROL A - a definitions list of bare quoted term names (must NOT surface a gap)", DEFS, ["The following terms are defined below.", "Each term has the meaning assigned to it."]);

// --- §9 generic quoted-proposition control (no legal vocabulary at all) -----------------------------------
const GENERIC = 'The text is replaced with:\n"The Company must deliver the report."';
report("CONTROL B - generic quoted proposition (must surface a gap)", GENERIC, ["The text is replaced with:"]);

// --- end to end: does the quoted covenant block completeness? ---------------------------------------------
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

async function endToEnd() {
  const leadIn = "Section 6.02 of the Credit Agreement is amended and restated to read as follows:";
  const item: WireInventoryItem = { localRef: "lead", semanticRole: "OTHER", proposition: "section 6.02 is amended and restated", excerpt: leadIn, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" };
  const caller = { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: [item] } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
  const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region(S6)], unresolvedReferences: [], reasons: [], totalChars: S6.length, budgetChars: 10_000 };
  const inv = await runSemanticInventory({ candidateRef: "canary5", documentId: "d", sourceContext: sc, caller });
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
  console.log(`   reasons              = ${JSON.stringify(rec.reasons)}`);
}
endToEnd();
