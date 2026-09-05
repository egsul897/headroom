/**
 * F-5.2A ZERO-COST forensics over the FROZEN F-5.1 paid pair (certification-v5 run-A / run-B) - no model call.
 * For every F / B / H case of the frozen scorer's decomposition it records the slot, the full slot text, the missing
 * run's coverage disposition over the span, overlapping / subsuming items, a generic source-form class (A-L), the
 * earliest failure stage, and tests the F-5.2 hypothesis (identical slot input -> different proposition sets).
 *   npx tsx scripts/f5-2a-forensics.ts <outPrefix>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { partitionSourceSlots, slotForOffset, coordinationIndex, type SourceSlot } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { computeSourceCoverage } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { normalizedStart } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import type { FrozenSemanticInventory, SemanticInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const DIR = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-v5";
const DECOMP = "docs/phase-3-remediation-f5-1/09-paid-pair-v5-legacy-decomposition.json";
const out = process.argv[2]!;
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
const unit = JSON.parse(readFileSync(UNIT, "utf-8"));
const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08").sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0]!;
const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: text.slice(section.charStart, section.charEnd), anchorNodeId: section.nodeId, operativeCharStart: section.charStart, documentText: text });
const region = sourceContext.regions[0]!;
const R = region.text;
const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
const runA = JSON.parse(readFileSync(`${DIR}/run-A.json`, "utf-8")) as FrozenSemanticInventory;
const runB = JSON.parse(readFileSync(`${DIR}/run-B.json`, "utf-8")) as FrozenSemanticInventory;
if (unit.compile.sourceContext.regions[0].text !== R) throw new Error("region drift");
const decomp = JSON.parse(readFileSync(DECOMP, "utf-8")) as { rows: { run: string; inventoryItemId: string; role: string; materiality: string; span: [number, number]; class: string; detail: string; excerpt: string }[] };
const runs = { run1: runA, run2: runB } as const;
const byId = (inv: FrozenSemanticInventory) => new Map(inv.items.map((i) => [i.inventoryItemId, i] as const));
const ids = { run1: byId(runA), run2: byId(runB) };
const coverage = (inv: FrozenSemanticInventory) => computeSourceCoverage({ regions: sourceContext.regions, spans: inv.items.map((i) => ({ regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: i.materiality, inventoryItemId: i.inventoryItemId, parentItemId: i.parentItemId })) });
const cov = { run1: coverage(runA), run2: coverage(runB) };
// sanity: recomputed unaccounted must equal the frozen record
for (const [k, inv] of Object.entries(runs) as ["run1" | "run2", FrozenSemanticInventory][]) {
  const rec = inv.unaccountedSource.map((u) => `${u.charStart}-${u.charEnd}`).join(",");
  const now = cov[k].unaccounted.filter((s) => s.regionId === "operative").map((u) => `${u.charStart}-${u.charEnd}`).join(",");
  if (rec !== now) throw new Error(`coverage recomputation drift in ${k}: ${rec.length} vs ${now.length}`);
}
const opSlots = partition.slots.filter((s) => s.regionId === region.regionId);
const ov = (a: [number, number], b: [number, number]) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

// ---- generic source-form classification A-L (structural form of the omitted span, never covenant content) ----
const CITATION = /\b(?:sections?|§+|clauses?|sub-?clauses?|paragraphs?|schedules?|annex(?:es)?|exhibits?|articles?)\s*\(?[0-9ivxlcA-Z][0-9a-zA-Z.\-]*\)?(?:\s*\([a-z0-9]{1,4}\))*/i;
const ENUM_START = /^\s*(?:[;,]\s*)?(?:and\s+|or\s+)?\(?[a-z0-9]{1,4}\)\s/i;
const QUALIFIER = /^\s*(?:[;,]\s*)?(?:and\s+|or\s+|but\s+)?(?:provided|so\s+long\s+as|if\b|unless|subject\s+to|to\s+the\s+extent|in\s+the\s+event|only\s+if|for\s+so\s+long)/i;
const EXCEPTION = /^\s*(?:[;,]\s*)?(?:and\s+|or\s+|but\s+)?(?:other\s+than|except|excluding|but\s+not|not\s+including|save\s+for)/i;
const OPERAND_START = /^\s*(?:[;,]\s*)?(?:plus|minus|less|multiplied\s+by|divided\s+by|the\s+sum\s+of|the\s+product\s+of|net\s+of|without\s+duplication)\b/i;
const OPERAND_PREV = /(?:\bplus|\bminus|\bless|\bmultiplied\s+by|\bdivided\s+by|\bsum\s+of|\bproduct\s+of)\s*(?:\(?[a-z0-9]{1,4}\)\s*)?$/i;
const SELECTOR_PREV = /(?:greater|greatest|lesser|least|lower|lowest|higher|highest)\s+of\s*(?:\(?[a-z0-9]{1,4}\)\s*)?$/i;
const TEMPORAL = /\b(?:days?|months?|years?|fiscal\s+(?:quarter|year)|test\s+period|business\s+days?|calendar\s+year|within\s+\d|after\s+the\s+end|prior\s+to)\b/i;
const DEONTIC = /\b(?:shall\s+not|may\s+not|shall|may|will\s+not|must)\b/i;
const VALUE_RE = /(?:\$\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s*(?:to\s*1(?:\.0+)?|:\s*1(?:\.0+)?|x\b))/;
function sourceForm(span: [number, number], slot: SourceSlot): { form: string; signals: string[] } {
  const t = R.slice(span[0], span[1]);
  const before = R.slice(Math.max(slot.charStart, span[0] - 60), span[0]);
  const signals: string[] = [];
  if (ENUM_START.test(t)) signals.push("enumerator");
  if (CITATION.test(t)) signals.push("citation");
  if (VALUE_RE.test(t)) signals.push("value");
  if (QUALIFIER.test(t)) signals.push("qualifier");
  if (EXCEPTION.test(t)) signals.push("exception");
  if (OPERAND_START.test(t) || OPERAND_PREV.test(before)) signals.push("operand");
  if (SELECTOR_PREV.test(before)) signals.push("selector-branch");
  if (TEMPORAL.test(t)) signals.push("temporal");
  if (DEONTIC.test(t)) signals.push("deontic");
  const startsMidSlot = normalizedStart(R, span[0]) > normalizedStart(R, slot.charStart) + 2;
  const prevChar = R.slice(Math.max(0, span[0] - 2), span[0]);
  const continuation = span[0] === slot.charStart && /^[a-z]/.test(t.trim()) && !/[.;:]\s*$/.test(R.slice(Math.max(0, slot.charStart - 3), slot.charStart)) ;
  if (continuation) signals.push("continuation");
  const coordinated = startsMidSlot && /(?:\s(?:and|or)\s|;\s)$/i.test(before) && !ENUM_START.test(t);
  if (coordinated) signals.push("coordinated");
  const citationOnly = CITATION.test(t) && t.replace(CITATION, "").replace(/[^A-Za-z]/g, "").length < 12;
  const wholeSlot = span[0] <= slot.charStart + 1 && span[1] >= slot.charEnd - 3;
  const midSlotConjunction = /^\s*(?:or|and|and\/or)\s/i.test(t) || /(?:\s|\))(?:or|and)\s*$/i.test(before);
  const definedTermLabel = /^\s*\(\s*[\u201c"][^\u201d"]{2,80}[\u201d"]\s*\)\s*$/.test(t);
  const parentheticalException = /^\s*\(\s*(?:other\s+than|except|excluding)/i.test(t);
  let form = "L_OTHER";
  if (citationOnly) form = "G_EXPLICIT_CROSS_REFERENCE";
  else if (definedTermLabel) form = "L_OTHER";
  else if (parentheticalException) form = "F_EXCEPTION";
  else if (wholeSlot && (/^[a-z(]/.test(t.trim()) || /^[^A-Z]/.test(t.trim()))) form = "K_CONTINUATION_FRAGMENT";
  else if (midSlotConjunction && !ENUM_START.test(t)) form = "A_COORDINATED_PROPOSITION";
  else if (VALUE_RE.test(t) && t.replace(VALUE_RE, "").replace(/[^A-Za-z]/g, "").length < 25) form = "D_QUANTITATIVE_COMPONENT";
  else if (signals.includes("exception")) form = "F_EXCEPTION";
  else if (signals.includes("qualifier")) form = "E_QUALIFIER_OR_PROVISO";
  else if (signals.includes("selector-branch")) form = "B_ENUMERATED_BRANCH";
  else if (signals.includes("operand")) form = "C_FORMULA_OPERAND";
  else if (signals.includes("enumerator")) form = "B_ENUMERATED_BRANCH";
  else if (signals.includes("continuation")) form = "K_CONTINUATION_FRAGMENT";
  else if (signals.includes("coordinated")) form = "A_COORDINATED_PROPOSITION";
  else if (signals.includes("citation")) form = "H_DEPENDENCY_FRAGMENT";
  else if (signals.includes("temporal") && VALUE_RE.test(t) === false && /\d/.test(t)) form = "I_TEMPORAL_COMPONENT";
  else if (signals.includes("deontic")) form = "J_DEONTIC_EFFECT";
  void prevChar;
  return { form, signals };
}

function analyze(row: (typeof decomp.rows)[number]) {
  const present = row.run as "run1" | "run2"; const missing = present === "run1" ? "run2" : "run1";
  const item = ids[present].get(row.inventoryItemId)!;
  const span: [number, number] = [item.sourceSpan.charStart, item.sourceSpan.charEnd];
  const slot = slotForOffset(partition, region.regionId, span[0])!;
  const slotEnd = slotForOffset(partition, region.regionId, Math.max(span[0], span[1] - 1))!;
  const missingItems = runs[missing].items.filter((i) => i.sourceSpan.regionId === "operative" && ov([i.sourceSpan.charStart, i.sourceSpan.charEnd], span) > 0);
  const subsuming = missingItems.filter((i) => i.sourceSpan.charStart <= span[0] && i.sourceSpan.charEnd >= span[1]);
  const shorterOverlap = (i: SemanticInventoryItem) => ov([i.sourceSpan.charStart, i.sourceSpan.charEnd], span) / Math.max(1, Math.min(span[1] - span[0], i.sourceSpan.charEnd - i.sourceSpan.charStart));
  const bestOverlap = missingItems.length ? Math.max(...missingItems.map(shorterOverlap)) : 0;
  // the frozen scorer classifies among UNMATCHED items: a missing-run item already paired by id with another present-run item (the shared broader parent) is not a counterpart of this one
  const sharedIds = new Set([...ids.run1.keys()].filter((k) => ids.run2.has(k)));
  const unmatchedOverlap = missingItems.filter((i) => !sharedIds.has(i.inventoryItemId)).map(shorterOverlap);
  const bestUnmatchedOverlap = unmatchedOverlap.length ? Math.max(...unmatchedOverlap) : 0;
  const coveredBySharedItem = missingItems.some((i) => sharedIds.has(i.inventoryItemId));
  const anchoredInMissing = missingItems.filter((i) => Math.abs(normalizedStart(R, i.sourceSpan.charStart) - normalizedStart(R, span[0])) <= 2);
  const dispositions = cov[missing].spans.filter((s) => s.regionId === "operative" && ov([s.charStart, s.charEnd], span) > 0).map((s) => ({ disposition: s.disposition, chars: ov([s.charStart, s.charEnd], span), span: [s.charStart, s.charEnd] as [number, number] }));
  const dispChars: Record<string, number> = {};
  for (const d of dispositions) dispChars[d.disposition] = (dispChars[d.disposition] ?? 0) + d.chars;
  const unaccChars = dispChars.UNACCOUNTED_SOURCE ?? 0;
  const inMissingUnaccounted = runs[missing].unaccountedSource.some((u) => ov([u.charStart, u.charEnd], span) > 0);
  const presentSlotItems = runs[present].items.filter((i) => i.slotId === slot.slotId).length;
  const missingSlotItems = runs[missing].items.filter((i) => i.slotId === slot.slotId).length;
  const { form, signals } = sourceForm(span, slot);
  // scorer classification check: F requires no missing-run item with >= 50% overlap of the shorter
  const scorerCorrect = bestUnmatchedOverlap < 0.5;
  // earliest failure stage
  let stage: string;
  const slotSent = true; // every operative slot is in the 7 first-pass batches (partition tiles the region; batches cover all slots)
  const isOmission = row.class.startsWith("F_");
  if (!isOmission) stage = subsuming.length > 0 || anchoredInMissing.length === 0 ? "GRANULARITY_SPLIT_SAME_ROOT_AS_F (the other run holds this text inside a coarser or differently bounded item - the model decided fewer/different propositions for the same slot)" : "GRANULARITY_SPLIT_BOUNDARY_ONLY (anchored counterpart with different end)";
  else if (!scorerCorrect) stage = "SCORER_ERROR";
  else if (unaccChars >= 0.5 * (span[1] - span[0]) || inMissingUnaccounted) stage = "GAP_MODEL_OMISSION"; // coverage flagged it, the gap pass re-presented the slot, still absent
  else stage = "MODEL_ENUMERATION_OMISSION"; // absorbed into a coarser/neighbouring item (shared by both runs or run-specific): coverage never flagged it, no gap target
  return {
    class: row.class, presentRun: present === "run1" ? "A" : "B", missingRun: missing === "run1" ? "A" : "B", inventoryItemId: row.inventoryItemId,
    slotId: slot.slotId, slotSpan: [slot.charStart, slot.charEnd], crossesSlots: slotEnd.slotId !== slot.slotId, slotText: slot.text, coordinationSubIndex: coordinationIndex(slot, span[0]),
    span, spanLength: span[1] - span[0], excerpt: R.slice(span[0], span[1]),
    semanticFunctions: item.semanticFunctions, declaredRoles: item.declaredRoles, legacyRole: item.semanticRole, materiality: item.materiality,
    quantitativeValues: item.quantitativeValues.map((v) => `${v.kind}:${v.rawText}`), referencedTerms: item.referencedTerms, referencedSections: item.referencedSections, parentItemId: item.parentItemId,
    emittedIn: "NOT_RECOVERABLE (the frozen inventory does not record first-pass vs gap-pass per item; see 03-failure-stages.json)",
    missingRunCoverageDisposition: dispChars, missingRunOverlappingItems: missingItems.map((i) => ({ id: i.inventoryItemId, span: [i.sourceSpan.charStart, i.sourceSpan.charEnd], role: i.semanticRole, overlapOfShorter: Number(shorterOverlap(i).toFixed(2)), excerpt: i.sourceSpan.excerpt.slice(0, 100) })),
    missingRunSubsumingItem: subsuming.length > 0, missingRunAnchoredItem: anchoredInMissing.length > 0, missingRunInFinalUnaccounted: inMissingUnaccounted,
    slotItemCounts: { present: presentSlotItems, missing: missingSlotItems },
    scorerClassificationCorrect: scorerCorrect, bestMissingOverlapOfShorter: Number(bestOverlap.toFixed(2)), bestUnmatchedMissingOverlapOfShorter: Number(bestUnmatchedOverlap.toFixed(2)), missingRunCoversItWithAnItemSharedByBothRuns: coveredBySharedItem,
    sourceForm: form, sourceFormSignals: signals,
    failureStage: stage, stageDetermination: { sourcePresentInSlot: true, slotSentToModel: slotSent, firstPassOmittedOrUnknown: "first-pass vs gap not recoverable per item", postProcessingLoss: false, coverageIdentifiedMissedSource: unaccChars > 0 || inMissingUnaccounted, gapTargetedIt: unaccChars > 0 || inMissingUnaccounted ? "yes (unaccounted stretch re-presented with its whole slot)" : "no (the missing run's coverage discharged the text through another item)", gapModelStillOmitted: inMissingUnaccounted ? true : null },
  };
}
const F = decomp.rows.filter((r) => r.class === "F_TRUE_SEMANTIC_OMISSION").map(analyze);
const B = decomp.rows.filter((r) => r.class === "B_GRANULARITY_INSTABILITY").map(analyze);
const H = decomp.rows.filter((r) => r.class === "H_DEPENDENCY_FRAGMENTATION").map(analyze);
const count = <T,>(xs: T[], f: (x: T) => string) => { const c: Record<string, number> = {}; for (const x of xs) { const k = f(x); c[k] = (c[k] ?? 0) + 1; } return c; };
// ---- hypothesis: identical slot input -> different proposition sets ----
const slotStats = opSlots.map((s) => {
  const a = runA.items.filter((i) => i.slotId === s.slotId), b = runB.items.filter((i) => i.slotId === s.slotId);
  const idsA = new Set(a.map((i) => i.inventoryItemId)), idsB = new Set(b.map((i) => i.inventoryItemId));
  const inter = [...idsA].filter((x) => idsB.has(x)).length;
  return { slotId: s.slotId, chars: s.charEnd - s.charStart, itemsA: a.length, itemsB: b.length, sharedIds: inter, sameCount: a.length === b.length, identicalSet: a.length === b.length && inter === a.length };
});
const both = slotStats.filter((s) => s.itemsA > 0 && s.itemsB > 0);
const hypothesis = {
  operativeSlots: opSlots.length, slotsWithItemsInBoth: both.length, slotsWithItemsOnlyA: slotStats.filter((s) => s.itemsA > 0 && s.itemsB === 0).length, slotsWithItemsOnlyB: slotStats.filter((s) => s.itemsB > 0 && s.itemsA === 0).length, slotsEmptyInBoth: slotStats.filter((s) => s.itemsA === 0 && s.itemsB === 0).length,
  slotsSameItemCount: both.filter((s) => s.sameCount).length, slotsDifferentItemCount: both.filter((s) => !s.sameCount).length, slotsIdenticalIdSet: both.filter((s) => s.identicalSet).length,
  itemsA: runA.items.length, itemsB: runB.items.length, meanItemsPerPopulatedSlot: { A: Number((runA.items.length / slotStats.filter((s) => s.itemsA > 0).length).toFixed(2)), B: Number((runB.items.length / slotStats.filter((s) => s.itemsB > 0).length).toFixed(2)) },
  fCasesInSlotsPopulatedByBothRuns: F.filter((f) => f.slotItemCounts.missing > 0).length, fCasesInSlotsEmptyInMissingRun: F.filter((f) => f.slotItemCounts.missing === 0).length,
  fCasesWhereMissingRunHasFewerItemsInSlot: F.filter((f) => f.slotItemCounts.missing < f.slotItemCounts.present).length,
  fCasesCoveredByABroaderOrNeighbouringItem: F.filter((f) => !f.missingRunInFinalUnaccounted).length, fCasesCoveredByAnItemSharedByBothRuns: F.filter((f) => f.missingRunCoversItWithAnItemSharedByBothRuns).length, fCasesInFinalUnaccounted: F.filter((f) => f.missingRunInFinalUnaccounted).length,
  slotDistribution: slotStats,
};
const hashes = { runA: sha(`${DIR}/run-A.json`), runB: sha(`${DIR}/run-B.json`), pair: sha(`${DIR}/pair.json`), decomposition: sha(DECOMP), source: sha(SRC), unit: sha(UNIT) };
writeFileSync(`${out}/01-f-cases.json`, JSON.stringify({ artifact: "F-5.2A forensic record of every F_TRUE_SEMANTIC_OMISSION in the frozen F-5.1 paid pair (zero model calls)", hashes, count: F.length, byPresentRun: count(F, (f) => f.presentRun), bySourceForm: count(F, (f) => f.sourceForm), byFailureStage: count(F, (f) => f.failureStage), byMateriality: count(F, (f) => f.materiality), scorerCorrect: count(F, (f) => String(f.scorerClassificationCorrect)), spanLength: { min: Math.min(...F.map((f) => f.spanLength)), median: [...F.map((f) => f.spanLength)].sort((a, b) => a - b)[Math.floor(F.length / 2)], max: Math.max(...F.map((f) => f.spanLength)) }, cases: F }, null, 1));
writeFileSync(`${out}/02-b-h-cases.json`, JSON.stringify({ artifact: "F-5.2A forensic record of every B_GRANULARITY_INSTABILITY and H_DEPENDENCY_FRAGMENTATION case (zero model calls)", B: { count: B.length, bySourceForm: count(B, (f) => f.sourceForm), byFailureStage: count(B, (f) => f.failureStage), cases: B }, H: { count: H.length, bySourceForm: count(H, (f) => f.sourceForm), byFailureStage: count(H, (f) => f.failureStage), cases: H } }, null, 1));
writeFileSync(`${out}/03-failure-stages.json`, JSON.stringify({ artifact: "F-5.2A earliest failure stage of every F case", method: "SOURCE_PARTITION_FAILURE would require the span to fall outside every operative slot (impossible: the partition tiles the region; 0 observed). The slot was always sent (7 batches cover all 335 operative slots; both runs record firstPassCalls 7). POST_PROCESSING_LOSS would require a verified excerpt to be dropped (the normalizer only drops unverifiable excerpts and merges same-proposition duplicates; a merged proposition still owns its span). Whether the first pass or the gap pass emitted the PRESENT run's item is not recoverable from the frozen output (no per-item pass flag). GAP_MODEL_OMISSION = the missing run's deterministic coverage left the span UNACCOUNTED, so its whole slot was re-presented to the gap call and the proposition is STILL absent. MODEL_ENUMERATION_OMISSION = the missing run's coverage discharged the text through a broader or neighbouring item, so nothing ever re-targeted it: the model decided the slot held fewer propositions.", counts: count(F, (f) => f.failureStage), determinations: F.map((f) => ({ id: f.inventoryItemId, missingRun: f.missingRun, stage: f.failureStage, ...f.stageDetermination, subsumed: f.missingRunSubsumingItem, overlappingMissingItems: f.missingRunOverlappingItems.length })) }, null, 1));
writeFileSync(`${out}/04-hypothesis.json`, JSON.stringify({ artifact: "F-5.2A hypothesis test: deterministic slots fix where the model looks, the model still decides how many propositions each slot holds", ...hypothesis }, null, 1));
console.log(JSON.stringify({ F: F.length, fForm: count(F, (f) => f.sourceForm), fStage: count(F, (f) => f.failureStage), fScorerCorrect: count(F, (f) => String(f.scorerClassificationCorrect)), B: count(B, (f) => f.sourceForm), Bstage: count(B, (f) => f.failureStage), H: count(H, (f) => f.sourceForm), Hstage: count(H, (f) => f.failureStage), hyp: { ...hypothesis, slotDistribution: undefined } }, null, 1));
