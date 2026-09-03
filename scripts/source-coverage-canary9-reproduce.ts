/**
 * CANARY #9: the red team's modifier-suppression attacks, verbatim (audit finding 3, scenarios S3 and S4).
 *
 * Defect (pre-fix): a fragment whose every word is in FUNCTION_WORDS scores zero content words and is dismissed
 * as STRUCTURAL_NOISE - "the residue of splitting a parent unit". The adverbial adjuncts in that set include
 * "jointly", "severally", "directly" and "indirectly", so two modifiers that materially change liability
 * allocation and anti-evasion scope disappear between two covered clauses.
 *
 * Run:  npx tsx scripts/source-coverage-canary9-reproduce.ts
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
  console.log(`   units: ${JSON.stringify(segmentSourceUnits(text).map((u) => text.slice(u.charStart, u.charEnd)))}`);
  for (const s of cov.spans) console.log(`   [${s.disposition}] ${JSON.stringify(s.excerpt)}`);
  console.log(`   unaccounted=${cov.unaccounted.length}`);
  return cov;
}

// --- §1 fixture A, verbatim (red team finding 3, scenario S3) ----------------------------------------------
const S3 = "The Borrowers shall repay the Obligations, jointly and severally, on the Maturity Date.";
report("FIXTURE A - jointly and severally", S3, ["The Borrowers shall repay the Obligations,", "on the Maturity Date."]);

// --- §1 fixture B, verbatim (red team finding 3, scenario S4) ----------------------------------------------
const S4 = "The Borrower shall not, directly or indirectly, create any Lien upon the Collateral.";
report("FIXTURE B - directly or indirectly", S4, ["The Borrower shall not,", "create any Lien upon the Collateral."]);

// --- §3 the classifier, directly -------------------------------------------------------------------------
console.log("\n=== §3 classifier on the isolated modifier fragments");
for (const f of ["jointly and severally,", "directly or indirectly,"]) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}

// --- §9 pure structural-glue control ----------------------------------------------------------------------
console.log("\n=== §9 pure glue (must stay non-blocking)");
for (const f of ["and", "(a)", "; :,", "or", "of the"]) {
  console.log(`   ${JSON.stringify(f)} -> ${classifyUnaccountedFragment(f, []).disposition}`);
}

// --- §10 generic modifier control (no legal vocabulary) ---------------------------------------------------
const GEN = "The parties are responsible, both individually and collectively, for the outcome.";
report("CONTROL - generic modifier (must surface)", GEN, ["The parties are responsible,", "for the outcome."]);

// --- end to end on fixture A ------------------------------------------------------------------------------
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

async function endToEnd() {
  const anchored = ["The Borrowers shall repay the Obligations,", "on the Maturity Date."];
  const wire: WireInventoryItem[] = anchored.map((excerpt, i) => ({ localRef: `i${i}`, semanticRole: "OTHER", proposition: `clause ${i}`, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" }));
  const caller = { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: wire } as T; }, lastTelemetry: () => null } as unknown as StageCaller;
  const sc = { state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region(S3)], unresolvedReferences: [], reasons: [], totalChars: S3.length, budgetChars: 10_000 };
  const inv = await runSemanticInventory({ candidateRef: "canary9", documentId: "d", sourceContext: sc, caller });
  console.log(`\n=== end to end (fixture A)`);
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
