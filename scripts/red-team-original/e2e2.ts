import { runSemanticInventory } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/reconciliation";
import { rollupAgreementSemanticStatus } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/rollup";
import type { SourceContextResult } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/types";
import type { StageCaller } from "/home/user/headroom/lib/contract-model/compiler/llm-caller";
const caller = (items: any[]): StageCaller => ({ providerName: "s", model: "s", isSynthetic: false, async call<T>(): Promise<T> { return { items, overallNotes: [] } as unknown as T; }, lastTelemetry: () => null });
const ctx = (text: string): SourceContextResult => ({ state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: "d", sourceNodeId: "n", sectionRef: "6.02", charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: text.length, budgetChars: 1e5 });
const wire = (excerpt: string, i: number) => ({ localRef: `r${i}`, semanticRole: "REQUIREMENT", proposition: "p", excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" });
async function run(name: string, text: string, excerpts: string[], dropped: string) {
  const sc = ctx(text);
  const inv = await runSemanticInventory({ candidateRef: name, documentId: "d", sourceContext: sc, caller: caller(excerpts.map(wire)) });
  const composition = { rules: [{ inventoryItemIds: inv.items.map(i=>i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [] }], definitions: [], sharedCapacities: [] } as any;
  const acc = reconcileInventoryWithComposition({ inventory: inv, composition, dispositions: [], sourceContextState: sc.state });
  const roll = rollupAgreementSemanticStatus([{ candidateRef: name, compileStatus: "COMPLETED", verifyStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND", accountability: acc, operativeStateUncertain: false, unresolvedCrossReferences: 0 }]);
  const silent = inv.unaccountedSource.length===0 && inv.uninventoriedValues.length===0 && acc.semanticallyComplete && roll.status==="SEMANTICALLY_COMPLETE";
  console.log(`${silent ? "SILENT  " : "surfaced"} | ${name} | dropped=${JSON.stringify(dropped.slice(0,70))} | status=${inv.inventoryStatus} unacc=${inv.unaccountedSource.length} vals=${inv.uninventoriedValues.length} complete=${acc.semanticallyComplete} rollup=${roll.status}`);
  return silent;
}
(async () => {
  // V1: unrecognised currency cap inside a child-descent lead-in
  await run("V1 CHF cap in lead-in",
    "The Borrower shall not make Restricted Payments in an aggregate amount exceeding CHF 2,000,000 in any fiscal year other than (a) intercompany dividends (b) tax distributions.",
    ["(a) intercompany dividends", "(b) tax distributions."],
    "The Borrower shall not make Restricted Payments ... exceeding CHF 2,000,000");
  // V2: recognised USD cap in the same lead-in -- control, must be caught
  await run("V2 USD cap in lead-in (CONTROL)",
    "The Borrower shall not make Restricted Payments in an aggregate amount exceeding $2,000,000 in any fiscal year other than (a) intercompany dividends (b) tax distributions.",
    ["(a) intercompany dividends", "(b) tax distributions."],
    "$2,000,000 lead-in");
  // V3: spelled-out cure period in a lead-in
  await run("V3 spelled-out cure period lead-in",
    "The Borrower shall cure any breach of this covenant within one hundred and eighty days after written notice from the Agent and shall pay each of (a) accrued interest (b) all fees.",
    ["(a) accrued interest", "(b) all fees."],
    "cure within one hundred and eighty days");
  // V4: caption-shaped clause carrying a comma-separated cap
  await run("V4 caption-shaped cap",
    "5.01 The Agent shall act reasonably in all matters under this Agreement.\n5.02 The maximum aggregate basket amount is 2,500,000\n5.03 The Borrower shall pay all fees when due under this Agreement.",
    ["5.01 The Agent shall act reasonably in all matters under this Agreement.", "5.03 The Borrower shall pay all fees when due under this Agreement."],
    "5.02 The maximum aggregate basket amount is 2,500,000");
  // V5: nested list -- inner lead-in with substance
  await run("V5 nested lead-in",
    "The Borrower shall deliver (a) the annual audited statements which shall be certified by a Responsible Officer and shall include (i) a balance sheet (ii) a cash flow statement (b) the quarterly statements.",
    ["(i) a balance sheet", "(ii) a cash flow statement", "(b) the quarterly statements."],
    "(a) ... which shall be certified by a Responsible Officer");
  // V6: exception carve-out only in the lead-in, children benign
  await run("V6 carve-out lead-in",
    "This Section shall not apply to any Excluded Subsidiary and shall be tested only on the last day of each of (a) the first fiscal quarter (b) the third fiscal quarter.",
    ["(a) the first fiscal quarter", "(b) the third fiscal quarter."],
    "This Section shall not apply to any Excluded Subsidiary");
})();
