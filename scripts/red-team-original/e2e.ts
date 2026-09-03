import { runSemanticInventory } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/reconciliation";
import { rollupAgreementSemanticStatus } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/rollup";
import { computeSourceCoverage } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/source-coverage";
import type { SourceContextResult } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/types";
import type { StageCaller } from "/home/user/headroom/lib/contract-model/compiler/llm-caller";

const caller = (items: any[]): StageCaller => ({
  providerName: "scripted", model: "scripted-inventory", isSynthetic: false,
  async call<T>(): Promise<T> { return { items, overallNotes: [] } as unknown as T; },
  lastTelemetry: () => null,
});

const ctx = (text: string): SourceContextResult => ({
  state: "COMPLETE_LOCAL_SOURCE",
  regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: "d", sourceNodeId: "n1", sectionRef: "6.02", charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null }],
  unresolvedReferences: [], reasons: [], totalChars: text.length, budgetChars: 100000,
});

const wire = (excerpt: string, role = "REQUIREMENT", ref = excerpt.slice(0, 8)) => ({
  localRef: ref, semanticRole: role, proposition: `p: ${excerpt.slice(0, 40)}`, excerpt,
  regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [],
  parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE",
});

async function run(name: string, text: string, excerpts: string[], dropped: string) {
  const sourceContext = ctx(text);
  const items = excerpts.map((e) => wire(e));
  const inv = await runSemanticInventory({ candidateRef: `unit-${name}`, documentId: "d", sourceContext, caller: caller(items) });
  const ids = inv.items.map((i) => i.inventoryItemId);
  const composition = {
    rules: [{ inventoryItemIds: ids, capacityExpression: null, conditions: [], exceptions: [], dependsOn: [] }],
    definitions: [], sharedCapacities: [],
  } as any;
  const acc = reconcileInventoryWithComposition({ inventory: inv, composition, dispositions: [], sourceContextState: sourceContext.state });
  const roll = rollupAgreementSemanticStatus([{ candidateRef: acc.candidateRef, compileStatus: "COMPLETED", verifyStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND", accountability: acc, operativeStateUncertain: false, unresolvedCrossReferences: 0 }]);
  const cov = computeSourceCoverage({ regions: sourceContext.regions, spans: inv.items.map((i) => ({ regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: i.materiality })) });
  const silent = inv.unaccountedSource.length === 0 && inv.uninventoriedValues.length === 0 && acc.semanticallyComplete && roll.status === "SEMANTICALLY_COMPLETE";
  console.log(`\n=== ${name} ===`);
  console.log("  DROPPED TEXT   :", JSON.stringify(dropped));
  console.log("  disposition    :", cov.spans.filter(s => text.slice(s.charStart, s.charEnd).includes(dropped.slice(0, 20))).map(s => `${s.disposition}[${JSON.stringify(s.excerpt.slice(0,70))}]`).join(" ") || "(n/a)");
  console.log("  inventoryStatus:", inv.inventoryStatus);
  console.log("  unaccounted    :", inv.unaccountedSource.length, "uninventoriedValues:", inv.uninventoriedValues.length);
  console.log("  semanticallyComplete:", acc.semanticallyComplete, "| rollup:", roll.status, "| gapCall attempted:", inv.gapReinventory?.attempted);
  console.log("  >>>", silent ? "SILENT OMISSION (BLOCKER)" : "surfaced");
  return silent;
}

(async () => {
  const results: [string, boolean][] = [];

  // S1: all-caps jury-trial waiver, model never inventories it.
  results.push(["S1 all-caps waiver", await run("S1 all-caps waiver",
    "The Borrower shall repay the Loans in accordance with Section 2.05.\nEACH PARTY HEREBY IRREVOCABLY WAIVES ANY RIGHT TO TRIAL BY JURY\nThe Administrative Agent shall give notice of any prepayment.",
    ["The Borrower shall repay the Loans in accordance with Section 2.05.", "The Administrative Agent shall give notice of any prepayment."],
    "EACH PARTY HEREBY IRREVOCABLY WAIVES ANY RIGHT TO TRIAL BY JURY")]);

  // S2: a whole short numbered operative clause read as a heading.
  results.push(["S2 numbered clause as heading", await run("S2 numbered clause as heading",
    "6.01 The Borrower shall deliver annual financial statements to the Agent.\n6.02 The Borrower shall not create any Lien on the Collateral\n6.03 The Borrower shall maintain insurance with reputable insurers at all times.",
    ["6.01 The Borrower shall deliver annual financial statements to the Agent.", "6.03 The Borrower shall maintain insurance with reputable insurers at all times."],
    "6.02 The Borrower shall not create any Lien on the Collateral")]);

  // S3: joint-and-several liability allocation dropped.
  results.push(["S3 jointly and severally", await run("S3 jointly and severally",
    "The Borrowers shall repay the Obligations, jointly and severally, on the Maturity Date.",
    ["The Borrowers shall repay the Obligations", "on the Maturity Date."],
    "jointly and severally,")]);

  // S4: anti-evasion "directly or indirectly" dropped from a negative covenant.
  results.push(["S4 directly or indirectly", await run("S4 directly or indirectly",
    "The Borrower shall not, directly or indirectly, create any Lien upon the Collateral.",
    ["The Borrower shall not", "create any Lien upon the Collateral."],
    "directly or indirectly,")]);

  // S5: substantive lead-in discharged by COVERED_BY_CHILD_DESCENT.
  results.push(["S5 child descent lead-in", await run("S5 child descent lead-in",
    "The Borrower shall prepay the Loans in full upon a Change of Control and shall cure any Default within thirty days after notice and shall not incur any Indebtedness other than (a) the Existing Debt (b) the Revolving Loans.",
    ["(a) the Existing Debt", "(b) the Revolving Loans."],
    "The Borrower shall prepay the Loans in full upon a Change of Control")]);

  // S6: amendment replacement text in quotes.
  results.push(["S6 quoted amendment text", await run("S6 quoted amendment text",
    "Section 6.02 of the Credit Agreement is amended and restated to read as follows: \"The Borrower shall not make any Restricted Payment while any Default is continuing.\"",
    ["Section 6.02 of the Credit Agreement is amended and restated to read as follows:"],
    "\"The Borrower shall not make any Restricted Payment while any Default is continuing.\"")]);

  // S7: non-Latin operative clause.
  results.push(["S7 non-Latin clause", await run("S7 non-Latin clause",
    "The Borrower shall comply with all Applicable Laws.\n借款人不得在抵押物上设定任何留置权或其他担保权益。\nThe Agent may inspect the books of the Borrower.",
    ["The Borrower shall comply with all Applicable Laws.", "The Agent may inspect the books of the Borrower."],
    "借款人不得在抵押物上设定任何留置权或其他担保权益。")]);

  // S8: bare integer cap in a table row.
  results.push(["S8 bare integer cap", await run("S8 bare integer cap",
    "The following baskets apply:\nGeneral Basket\n25000000\nAcquisition Basket\n40000000\nThe Borrower shall not exceed the applicable basket.",
    ["The following baskets apply:", "General Basket", "Acquisition Basket", "The Borrower shall not exceed the applicable basket."],
    "25000000")]);

  // S9: cross-reference exception dropped.
  results.push(["S9 except as provided", await run("S9 except as provided",
    "The Borrower shall not make any Investment, except as provided in Section 6.02, at any time prior to the Maturity Date.",
    ["The Borrower shall not make any Investment", "at any time prior to the Maturity Date."],
    "except as provided in Section 6.02,")]);

  // S10: all-caps cap with a spelled-out amount.
  results.push(["S10 spelled-out cap in caps", await run("S10 spelled-out cap in caps",
    "The Borrower shall indemnify the Agent for all Losses.\nIN NO EVENT SHALL THE AGGREGATE LIABILITY EXCEED FIVE MILLION DOLLARS\nThis Section survives termination of this Agreement.",
    ["The Borrower shall indemnify the Agent for all Losses.", "This Section survives termination of this Agreement."],
    "IN NO EVENT SHALL THE AGGREGATE LIABILITY EXCEED FIVE MILLION DOLLARS")]);

  console.log("\n\nSUMMARY");
  for (const [n, s] of results) console.log(` ${s ? "SILENT " : "surfaced"}  ${n}`);
})();
