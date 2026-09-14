/**
 * F-5.2A ZERO-COST counterfactual: generates the source-owned obligation ledger for frozen Chewy 6.08 (twice; byte-identical
 * required), maps the ALREADY-PAID F-5.1 run A / run B inventories onto it with no model call, and measures whether the
 * frozen scorer's F / B / H cases would have been exposed as UNSATISFIED obligations in the run that omitted them.
 *   npx tsx scripts/f5-2a-counterfactual.ts <outDir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { computeSourceCoverage } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { generateObligations, normalizedStartOf, resolveObligations, type AccountingItemView, type InventoryObligation, type ObligationMode, type ObligationResolution } from "./f5-2a-obligations-experiment";
import type { FrozenSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const DIR = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-v5";
const out = process.argv[2]!;
const MODE = (process.argv[3] ?? "conservative") as ObligationMode;
const SUFFIX = MODE === "conservative" ? "" : `-${MODE}`;
const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08").sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0]!;
const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: text.slice(section.charStart, section.charEnd), anchorNodeId: section.nodeId, operativeCharStart: section.charStart, documentText: text });
const R = sourceContext.regions[0]!.text;
const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
const runA = JSON.parse(readFileSync(`${DIR}/run-A.json`, "utf-8")) as FrozenSemanticInventory;
const runB = JSON.parse(readFileSync(`${DIR}/run-B.json`, "utf-8")) as FrozenSemanticInventory;
const fCases = JSON.parse(readFileSync(`${out}/01-f-cases.json`, "utf-8")) as { cases: { inventoryItemId: string; presentRun: string; missingRun: string; span: [number, number]; slotId: string; failureStage: string; sourceForm: string; materiality: string }[] };
const bh = JSON.parse(readFileSync(`${out}/02-b-h-cases.json`, "utf-8")) as { B: { cases: typeof fCases.cases }; H: { cases: typeof fCases.cases } };

// ---- deterministic identity: two independent generations must be byte-identical ----
const ledger1 = generateObligations(sourceContext, partitionSourceSlots({ sourceContext, structuralIndex: index }), "doc-a", MODE);
const ledger2 = generateObligations(sourceContext, partition, "doc-a", MODE);
const j1 = JSON.stringify(ledger1), j2 = JSON.stringify(ledger2);
const identical = j1 === j2;
const ledger = ledger1;
const sha = createHash("sha256").update(j1).digest("hex");

// ---- map the paid runs (no claims exist on v5 evidence: satisfaction is inferred by anchor / inside coverage only) ----
const view = (inv: FrozenSemanticInventory): AccountingItemView[] => inv.items.map((i) => ({ inventoryItemId: i.inventoryItemId, regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: i.materiality, values: i.quantitativeValues, claimedObligationIds: [] }));
const NON_SEMANTIC = new Set(["STRUCTURAL_NOISE", "HEADING_OR_LABEL", "CITATION_ONLY", "DEFINED_TERM_LABEL", "PUNCTUATION_OR_DELIMITER", "NON_SEMANTIC_FORMATTING"]);
const nonSemantic = (inv: FrozenSemanticInventory) => computeSourceCoverage({ regions: sourceContext.regions, spans: inv.items.map((i) => ({ regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: i.materiality, inventoryItemId: i.inventoryItemId, parentItemId: i.parentItemId })) }).spans.filter((s) => NON_SEMANTIC.has(s.disposition)).map((s) => ({ regionId: s.regionId, charStart: s.charStart, charEnd: s.charEnd }));
const resA = resolveObligations(ledger, sourceContext, view(runA), nonSemantic(runA));
const resB = resolveObligations(ledger, sourceContext, view(runB), nonSemantic(runB));
const byIdA = new Map(resA.resolutions.map((r) => [r.obligationId, r] as const));
const byIdB = new Map(resB.resolutions.map((r) => [r.obligationId, r] as const));
const sat = (r: ObligationResolution | undefined) => !!r && r.status !== "UNSATISFIED";
const satA = ledger.obligations.filter((o) => sat(byIdA.get(o.obligationId)));
const satB = ledger.obligations.filter((o) => sat(byIdB.get(o.obligationId)));
const satBoth = ledger.obligations.filter((o) => sat(byIdA.get(o.obligationId)) && sat(byIdB.get(o.obligationId)));
const unsatA = ledger.obligations.filter((o) => !sat(byIdA.get(o.obligationId)));
const unsatB = ledger.obligations.filter((o) => !sat(byIdB.get(o.obligationId)));
const unsatAOnly = unsatA.filter((o) => sat(byIdB.get(o.obligationId)));
const unsatBOnly = unsatB.filter((o) => sat(byIdA.get(o.obligationId)));
const unsatBoth = unsatA.filter((o) => !sat(byIdB.get(o.obligationId)));

// ---- capture of the frozen scorer's cases: an obligation ANCHORED at the omitted span (start within one word, >= 50% overlap of the shorter), UNSATISFIED in the missing run ----
const wordsBetween = (a: number, b: number) => (R.slice(Math.min(a, b), Math.max(a, b)).match(/\S+/g) ?? []).length;
function capture(c: { span: [number, number]; missingRun: string }) {
  const anchored = ledger.obligations.filter((o) => o.regionId === "operative" && wordsBetween(normalizedStartOf(R, o.charStart), normalizedStartOf(R, c.span[0])) <= 1 && Math.max(0, Math.min(o.charEnd, c.span[1]) - Math.max(o.charStart, c.span[0])) >= 0.5 * Math.min(o.charEnd - o.charStart, c.span[1] - c.span[0]));
  const res = c.missingRun === "A" ? byIdA : byIdB;
  const unsatisfiedAnchored = anchored.filter((o) => !sat(res.get(o.obligationId)));
  const baseSlot = ledger.obligations.find((o) => o.kind === "BASE_SLOT" && o.regionId === "operative" && o.charStart <= c.span[0] && o.charEnd >= c.span[0]);
  const baseUnsatisfied = baseSlot ? !sat(res.get(baseSlot.obligationId)) : false;
  const capturedByNonBase = unsatisfiedAnchored.some((o) => o.kind !== "BASE_SLOT");
  return { anchoredObligations: anchored.map((o) => ({ id: o.obligationId, kind: o.kind, span: [o.charStart, o.charEnd], statusInMissingRun: res.get(o.obligationId)?.status })), captured: unsatisfiedAnchored.length > 0, capturedByNonBase, capturedOnlyByBaseSlot: unsatisfiedAnchored.length > 0 && !capturedByNonBase, capturedBy: unsatisfiedAnchored.map((o) => o.kind), anchoredButSatisfiedInMissingRun: anchored.length > 0 && unsatisfiedAnchored.length === 0, noAnchoredObligation: anchored.length === 0, baseSlotUnsatisfiedInMissingRun: baseUnsatisfied };
}
const fCap = fCases.cases.map((c) => ({ id: c.inventoryItemId, missingRun: c.missingRun, span: c.span, slotId: c.slotId, failureStage: c.failureStage, sourceForm: c.sourceForm, materiality: c.materiality, excerpt: R.slice(c.span[0], c.span[1]).slice(0, 100), ...capture(c) }));
const bCap = bh.B.cases.map((c) => ({ id: c.inventoryItemId, missingRun: c.missingRun, span: c.span, ...capture(c) }));
const hCap = bh.H.cases.map((c) => ({ id: c.inventoryItemId, missingRun: c.missingRun, span: c.span, ...capture(c) }));
const rate = (xs: { captured: boolean }[]) => (xs.length ? Number((xs.filter((x) => x.captured).length / xs.length).toFixed(4)) : null);
const count = <T,>(xs: T[], f: (x: T) => string) => { const c: Record<string, number> = {}; for (const x of xs) { const k = f(x); c[k] = (c[k] ?? 0) + 1; } return c; };

// ---- false obligation candidates: unsatisfied in BOTH runs, and in BOTH runs entirely inside a material item not anchored at it; not overlapping either run's final unaccounted source ----
const materialItems = (inv: FrozenSemanticInventory) => inv.items.filter((i) => i.sourceSpan.regionId === "operative" && (i.materiality === "CRITICAL" || i.materiality === "MATERIAL"));
const mA = materialItems(runA), mB = materialItems(runB);
const insideBroader = (o: InventoryObligation, items: typeof mA) => items.some((i) => i.sourceSpan.charStart <= o.charStart && i.sourceSpan.charEnd >= o.charEnd && wordsBetween(normalizedStartOf(R, i.sourceSpan.charStart), normalizedStartOf(R, o.charStart)) > 1);
const touchesUnaccounted = (o: InventoryObligation, inv: FrozenSemanticInventory) => inv.unaccountedSource.some((u) => u.charStart < o.charEnd && u.charEnd > o.charStart);
const nonBase = ledger.obligations.filter((o) => o.kind !== "BASE_SLOT");
const falseObligation = unsatBoth.filter((o) => o.kind !== "BASE_SLOT" && insideBroader(o, mA) && insideBroader(o, mB) && !touchesUnaccounted(o, runA) && !touchesUnaccounted(o, runB));
const reviewWorkBoth = unsatBoth.filter((o) => touchesUnaccounted(o, runA) || touchesUnaccounted(o, runB));
// ---- false satisfaction candidates: satisfied only by inside coverage with no anchored item ----
const falseSat = (res: typeof resA) => res.resolutions.filter((r) => r.status === "SATISFIED_BY_COVERAGE");

const result = {
  artifact: "F-5.2A zero-cost counterfactual: the source-owned obligation ledger for frozen Chewy 6.08 mapped onto the already-paid F-5.1 run A / run B (no model call)",
  ledger: { algorithmVersion: ledger.algorithmVersion, sha256: sha, byteIdenticalAcrossTwoGenerations: identical, totalObligations: ledger.obligations.length, countsByKind: ledger.countsByKind, slotsWithObligations: ledger.slotsWithObligations, operativeSlots: partition.slots.filter((s) => s.regionId === "operative").length, nonBaseObligations: nonBase.length },
  satisfaction: { satisfiedByA: satA.length, satisfiedByB: satB.length, satisfiedByBoth: satBoth.length, unresolvedA: unsatA.length, unresolvedB: unsatB.length, aOnlyUnresolved: unsatAOnly.length, bOnlyUnresolved: unsatBOnly.length, unresolvedInBoth: unsatBoth.length, rateA: Number((satA.length / ledger.obligations.length).toFixed(4)), rateB: Number((satB.length / ledger.obligations.length).toFixed(4)), rateBoth: Number((satBoth.length / ledger.obligations.length).toFixed(4)), statusCountsA: resA.countsByStatus, statusCountsB: resB.countsByStatus, unresolvedByKindA: count(unsatA, (o) => o.kind), unresolvedByKindB: count(unsatB, (o) => o.kind) },
  mode: MODE,
  capture: { F: { total: fCap.length, captured: fCap.filter((c) => c.captured).length, rate: rate(fCap), capturedByNonBaseObligation: fCap.filter((c) => c.capturedByNonBase).length, capturedOnlyByBaseSlot: fCap.filter((c) => c.capturedOnlyByBaseSlot).length, byKind: count(fCap.filter((c) => c.captured), (c) => c.capturedBy.join("+")), anchoredButSatisfiedInMissingRun: fCap.filter((c) => c.anchoredButSatisfiedInMissingRun).length, noAnchoredObligation: fCap.filter((c) => c.noAnchoredObligation).length, byFailureStage: { captured: count(fCap.filter((c) => c.captured), (c) => c.failureStage), missed: count(fCap.filter((c) => !c.captured), (c) => c.failureStage) }, bySourceForm: { captured: count(fCap.filter((c) => c.captured), (c) => c.sourceForm), missed: count(fCap.filter((c) => !c.captured), (c) => c.sourceForm) } }, B: { total: bCap.length, captured: bCap.filter((c) => c.captured).length, rate: rate(bCap) }, H: { total: hCap.length, captured: hCap.filter((c) => c.captured).length, rate: rate(hCap) } },
  falseObligationCandidates: { count: falseObligation.length, rateOfNonBase: Number((falseObligation.length / Math.max(1, nonBase.length)).toFixed(4)), byKind: count(falseObligation, (o) => o.kind), sample: falseObligation.slice(0, 25).map((o) => ({ kind: o.kind, slotId: o.slotId, text: o.text.slice(0, 90) })) },
  unresolvedInBothThatAreReviewWork: reviewWorkBoth.length,
  falseSatisfactionCandidates: { A: falseSat(resA).length, B: falseSat(resB).length, definition: "satisfied only by inside-coverage (rule b) with no anchored item; listed for audit, counted as satisfied" },
  stableGapTargets: { A: unsatA.map((o) => o.obligationId), B: unsatB.map((o) => o.obligationId), intersection: unsatBoth.length, unionSize: new Set([...unsatA, ...unsatB].map((o) => o.obligationId)).size, jaccard: Number((unsatBoth.length / Math.max(1, new Set([...unsatA, ...unsatB].map((o) => o.obligationId)).size)).toFixed(4)), before: { unaccountedSegmentsA: runA.unaccountedSource.length, unaccountedSegmentsB: runB.unaccountedSource.length, identical: runA.unaccountedSource.filter((u) => runB.unaccountedSource.some((v) => v.charStart === u.charStart && v.charEnd === u.charEnd)).length } },
  fCases: fCap, bCases: bCap, hCases: hCap,
  unresolvedAOnlySample: unsatAOnly.slice(0, 20).map((o) => ({ kind: o.kind, slotId: o.slotId, text: o.text.slice(0, 90) })),
  unresolvedBOnlySample: unsatBOnly.slice(0, 20).map((o) => ({ kind: o.kind, slotId: o.slotId, text: o.text.slice(0, 90) })),
};
writeFileSync(`${out}/06-obligation-ledger-chewy-608${SUFFIX}.json`, JSON.stringify(ledger, null, 1));
writeFileSync(`${out}/07-counterfactual${SUFFIX}.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ ledger: result.ledger, satisfaction: result.satisfaction, capture: result.capture, falseObligationCandidates: { count: result.falseObligationCandidates.count, rateOfNonBase: result.falseObligationCandidates.rateOfNonBase, byKind: result.falseObligationCandidates.byKind }, reviewWorkBoth: result.unresolvedInBothThatAreReviewWork, falseSat: result.falseSatisfactionCandidates, gapTargets: { intersection: result.stableGapTargets.intersection, union: result.stableGapTargets.unionSize, jaccard: result.stableGapTargets.jaccard, before: result.stableGapTargets.before } }, null, 1));
