/**
 * F-5 zero-cost re-key: pushes the two FROZEN Chewy §6.08 Pass A runs (their verified excerpts, roles, values,
 * identifiers and materiality - exactly what the model produced) through the v4 deterministic post-processing
 * (slot partition + canonical identity + overlap merge) WITHOUT any model call, and writes re-keyed inventories
 * for scripts/f5-align-runs.py. Also reports the slot partition and the bounded-call plan for the unit.
 *   npx tsx scripts/f5-frozen-rekey.ts <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { normalizeInventorySubmission } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { batchSlots, partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { buildInventorySystemPrompt, buildInventoryUserContent } from "../lib/contract-model/compiler/semantic-accountability/prompt";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const out = process.argv[2]!;
const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
const unit = JSON.parse(readFileSync(UNIT, "utf-8"));
const sourceContext: SourceContextResult = unit.compile.sourceContext;
// The recorded region names the pre-F-2 anchor node; re-anchor to the current structural index's 6.08 section node.
const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08").sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0]!;
sourceContext.regions[0]!.sourceNodeId = section.nodeId;
const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
const batches = batchSlots(partition, sourceContext);
const toWire = (i: SemanticInventoryItem, k: number): WireInventoryItem => ({ localRef: `w${k}`, semanticRole: i.semanticRole, proposition: i.proposition, excerpt: i.sourceSpan.excerpt, regionId: i.sourceSpan.regionId, slotId: null, quantitativeValues: i.quantitativeValues.map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue, unit: v.unit })), referencedTerms: i.referencedTerms, referencedSections: i.referencedSections, parentRef: null, relatedRefs: [], materiality: i.materiality, ambiguity: i.ambiguity, ambiguityReason: i.ambiguityReason, operative: i.operative });
const rekey = (inv: FrozenSemanticInventory): FrozenSemanticInventory => {
  const r = normalizeInventorySubmission({ candidateRef: unit.candidateRef, sourceContext, structuralIndex: index }, inv.items.map(toWire), partition);
  return { ...inv, items: r.items, rejectedDuplicateItems: r.rejectedDuplicates, rejectedUnverifiableItems: r.rejectedUnverifiable };
};
const run1 = rekey(unit.compile.frozenInventory);
const run2 = rekey(unit.inventoryRun2);
const promptChars = batches.map((b) => buildInventorySystemPrompt().length + buildInventoryUserContent(sourceContext, b).length);
const slotSizes = partition.slots.map((s) => s.charEnd - s.charStart);
writeFileSync(out, JSON.stringify({ regionText: sourceContext.regions[0]!.text, run1, run2, partition: { methods: partition.methods, slots: partition.slots.length, slotSizeChars: { min: Math.min(...slotSizes), max: Math.max(...slotSizes), mean: Math.round(slotSizes.reduce((a, b) => a + b, 0) / slotSizes.length) }, coversRegionExactly: partition.slots.every((s, i) => (i === 0 ? s.charStart === 0 : s.charStart === partition.slots[i - 1]!.charEnd)) && partition.slots[partition.slots.length - 1]!.charEnd === sourceContext.regions[0]!.text.length, sample: partition.slots.slice(0, 12).map((s) => ({ slotId: s.slotId, chars: [s.charStart, s.charEnd], context: s.context.map((c) => c.sectionRef), head: s.text.trim().slice(0, 80) })) }, batches: batches.map((b, i) => ({ batch: i + 1, slots: b.slots.length, chars: b.chars, promptChars: promptChars[i] })), rekey: { run1: { items: run1.items.length, merged: run1.rejectedDuplicateItems, unverifiable: run1.rejectedUnverifiableItems }, run2: { items: run2.items.length, merged: run2.rejectedDuplicateItems, unverifiable: run2.rejectedUnverifiableItems } } }, null, 1));
console.log(JSON.stringify({ slots: partition.slots.length, methods: partition.methods, batches: batches.length, promptChars, run1: run1.items.length, run2: run2.items.length, merged: [run1.rejectedDuplicateItems, run2.rejectedDuplicateItems] }));
