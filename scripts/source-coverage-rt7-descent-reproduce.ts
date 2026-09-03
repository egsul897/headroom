/**
 * RT-7 architectural remediation - executable certification of the artifact-33 static blocker.
 *
 * Frame: the red team's own V1 scenario (scripts/red-team-original/e2e2.ts), verbatim except that the
 * quantitative slot "CHF 2,000,000" is occupied by each ORIGINAL RT-7 probe string from p3.ts that can
 * syntactically stand in an "exceeding <value>" / "within <value>" position. No new value forms are invented.
 * The two enumerated children are inventoried exactly as in V1; the lead-in is not.
 *
 * Zero model calls. Run: npx tsx scripts/source-coverage-rt7-descent-reproduce.ts
 */
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { rollupAgreementSemanticStatus } from "../lib/contract-model/compiler/semantic-accountability/rollup";
import { scanQuantitativeValues } from "../lib/contract-model/compiler/semantic-accountability/quantitative";
import { computeSourceCoverage } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import type { SourceContextResult } from "../lib/contract-model/compiler/semantic-accountability/types";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";

const caller = (items: unknown[]): StageCaller => ({ providerName: "s", model: "s", isSynthetic: false, async call<T>(): Promise<T> { return { items, overallNotes: [] } as unknown as T; }, lastTelemetry: () => null });
const ctx = (text: string): SourceContextResult => ({ state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: "d", sourceNodeId: "n", sectionRef: "6.02", charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: text.length, budgetChars: 1e5 });
const wire = (excerpt: string, i: number) => ({ localRef: `r${i}`, semanticRole: "REQUIREMENT", proposition: "p", excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" });

export async function certify(name: string, text: string, excerpts: string[], valueSlot: string) {
  const sc = ctx(text);
  const inv = await runSemanticInventory({ candidateRef: name, documentId: "d", sourceContext: sc, caller: caller(excerpts.map(wire)) });
  const composition = { rules: [{ inventoryItemIds: inv.items.map((i) => i.inventoryItemId), capacityExpression: null, conditions: [], exceptions: [], dependsOn: [] }], definitions: [], sharedCapacities: [] } as never;
  const acc = reconcileInventoryWithComposition({ inventory: inv, composition, dispositions: [], sourceContextState: sc.state });
  const roll = rollupAgreementSemanticStatus([{ candidateRef: name, compileStatus: "COMPLETED", verifyStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND", accountability: acc, operativeStateUncertain: false, unresolvedCrossReferences: 0 }]);
  const silent = inv.unaccountedSource.length === 0 && inv.uninventoriedValues.length === 0 && acc.semanticallyComplete && roll.status === "SEMANTICALLY_COMPLETE";
  const cov = computeSourceCoverage({ regions: sc.regions, spans: inv.items.map((i) => ({ regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: "CRITICAL" as const })) });
  const parent = cov.spans.find((s) => s.charStart === 0);
  const scan = scanQuantitativeValues(valueSlot).map((v) => `${v.kind}:${v.rawText}`);
  console.log(`${silent ? "SILENT  " : "surfaced"} | ${name.padEnd(30)} | scan=${JSON.stringify(scan)} parent=${parent?.disposition} unacc=${inv.unaccountedSource.length} vals=${inv.uninventoriedValues.length} status=${inv.inventoryStatus} complete=${acc.semanticallyComplete} rollup=${roll.status}`);
  return { silent, parent: parent?.disposition, unacc: inv.unaccountedSource.length, status: inv.inventoryStatus, complete: acc.semanticallyComplete };
}

const CHILDREN = ["(a) intercompany dividends", "(b) tax distributions."];
const frame = (slot: string) => `The Borrower shall not make Restricted Payments in an aggregate amount exceeding ${slot} in any fiscal year other than (a) intercompany dividends (b) tax distributions.`;
// Original p3 probes that can occupy the "exceeding <value>" quantitative slot of the V1 frame.
export const AMOUNT_SLOT_PROBES = ["five million dollars", "fifty percent (50%)", "fifty percent", "one-half of the Net Proceeds", "¥500,000,000", "CHF 2,000,000", "2,500,000 (the \"Cap\")", "one half of one percent", "twenty-five basis points", "$2,000,000"];
// Original p3 probes that are durations/dates: same V1 frame with the "in any fiscal year" period slot occupied.
const periodFrame = (slot: string) => `The Borrower shall not make Restricted Payments in an aggregate amount exceeding the Threshold Amount within ${slot} other than (a) intercompany dividends (b) tax distributions.`;
export const PERIOD_SLOT_PROBES = ["one hundred and eighty days", "thirty days", "3/31/2030", "31 March 2030"];
// "a ratio of 4.5:1" only fits a ratio slot.
const ratioFrame = (slot: string) => `The Borrower shall not make Restricted Payments if the Leverage Ratio would exceed ${slot} other than (a) intercompany dividends (b) tax distributions.`;

if (require.main === module) {
  (async () => {
    console.log("== FIRST FIXTURE (mission §4)");
    await certify("RT7 five million dollars", frame("five million dollars"), CHILDREN, "five million dollars");
    console.log("\n== AMOUNT SLOT - every original p3 amount-shaped probe (V1 CHF and V2 USD as controls)");
    for (const p of AMOUNT_SLOT_PROBES) await certify(`RT7 ${p}`, frame(p), CHILDREN, p);
    console.log("\n== PERIOD SLOT - original duration/date probes");
    for (const p of PERIOD_SLOT_PROBES) await certify(`RT7 ${p}`, periodFrame(p), CHILDREN, p);
    console.log("\n== RATIO SLOT - original ratio probe (scanner-visible control)");
    await certify("RT7 a ratio of 4.5:1", ratioFrame("a ratio of 4.5:1"), CHILDREN, "a ratio of 4.5:1");
  })();
}
