/**
 * F-5.1 same-root ZERO-COST regression: every recorded Pass A inventory under tests/fixtures that still carries its
 * source context is pushed through the v5 deterministic migration (canonical semantic functions + role-blind,
 * start-anchored identity) with its own verified excerpts, declared roles and parent links as the wire input.
 * Reports role-conflict pairs (same source ownership, different declared role) and how many were canonicalized into
 * ONE identity, false-merge candidates (different declared roles AND dissimilar propositions AND non-identical spans),
 * lineage loss, coverage deltas and materiality changes. No model call.
 *   npx tsx scripts/f5-1-same-root-replay.ts <out.json>
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeInventorySubmission } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { computeSourceCoverage } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";

type Json = Record<string, unknown>;
function listJson(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) listJson(p, out);
    else if (name.endsWith(".json") && st.size < 60_000_000) out.push(p);
  }
  return out;
}
function findRecords(o: unknown, file: string, pointer: string, out: { file: string; pointer: string; inventory: FrozenSemanticInventory; sourceContext: SourceContextResult }[]): void {
  if (Array.isArray(o)) { o.forEach((v, i) => findRecords(v, file, `${pointer}[${i}]`, out)); return; }
  if (!o || typeof o !== "object") return;
  const rec = o as Json;
  if (rec.frozenInventory && (rec.frozenInventory as Json).items && rec.sourceContext && (rec.sourceContext as Json).regions) {
    out.push({ file, pointer, inventory: rec.frozenInventory as FrozenSemanticInventory, sourceContext: rec.sourceContext as SourceContextResult });
    return;
  }
  for (const [k, v] of Object.entries(rec)) findRecords(v, file, `${pointer}/${k}`, out);
}
const words = (p: string) => new Set(p.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2));
const jacc = (a: Set<string>, b: Set<string>) => { const u = new Set([...a, ...b]); return u.size ? [...a].filter((x) => b.has(x)).length / u.size : 1; };
const toWire = (i: SemanticInventoryItem): WireInventoryItem => ({ localRef: i.inventoryItemId, semanticRole: i.semanticRole, additionalRoles: (i.declaredRoles ?? []).slice(1), proposition: i.proposition, excerpt: i.sourceSpan.excerpt, regionId: i.sourceSpan.regionId, slotId: null, quantitativeValues: i.quantitativeValues.map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue, unit: v.unit })), referencedTerms: i.referencedTerms, referencedSections: i.referencedSections, parentRef: i.parentItemId, relatedRefs: i.relatedItemIds, materiality: i.materiality, ambiguity: i.ambiguity, ambiguityReason: i.ambiguityReason, operative: i.operative });

const records: { file: string; pointer: string; inventory: FrozenSemanticInventory; sourceContext: SourceContextResult }[] = [];
for (const f of listJson("tests/fixtures")) {
  if (f.includes("phase-3-remediation-f5-run")) continue; // the certification pair is replayed by its own script
  try { findRecords(JSON.parse(readFileSync(f, "utf-8")), f, "", records); } catch { /* not json */ }
}
const rows: Json[] = [];
const totals = { records: 0, itemsBefore: 0, itemsAfter: 0, merged: 0, roleConflictPairs: 0, roleConflictPairsCanonicalized: 0, falseMergeCandidates: 0, valuesLost: 0, itemsLost: 0, parentLinksBefore: 0, parentLinksAfter: 0, materialityChanged: 0, coverageChangedRecords: 0, statusChangedRecords: 0, deterministicAdditions: 0 };
for (const rec of records) {
  const inv = rec.inventory;
  if (!inv.items.length) continue;
  const candidateRef = (inv.candidateRef as string) || "same-root";
  let r: ReturnType<typeof normalizeInventorySubmission>;
  try { r = normalizeInventorySubmission({ candidateRef, sourceContext: rec.sourceContext }, inv.items.map(toWire)); } catch (e) { rows.push({ file: rec.file, pointer: rec.pointer, error: String(e) }); continue; }
  const byId = new Map(r.items.map((it) => [it.inventoryItemId, it] as const));
  const v5ByOld = new Map<string, SemanticInventoryItem>();
  for (const [id, refs] of Object.entries(r.memberLocalRefs)) for (const ref of refs) v5ByOld.set(ref, byId.get(id)!);
  // role-conflict pairs in the ORIGINAL evidence: same region, same normalized start (+1 word), mutual overlap >= 50%, different role
  const region = (x: SemanticInventoryItem) => x.sourceSpan.regionId;
  const ov = (x: SemanticInventoryItem, y: SemanticInventoryItem) => Math.max(0, Math.min(x.sourceSpan.charEnd, y.sourceSpan.charEnd) - Math.max(x.sourceSpan.charStart, y.sourceSpan.charStart));
  const mutual = (x: SemanticInventoryItem, y: SemanticInventoryItem) => ov(x, y) / Math.max(1, Math.max(x.sourceSpan.charEnd - x.sourceSpan.charStart, y.sourceSpan.charEnd - y.sourceSpan.charStart));
  let conflicts = 0, canonicalized = 0, falseMerge = 0;
  const conflictRows: Json[] = [];
  for (let i = 0; i < inv.items.length; i++) for (let j = i + 1; j < inv.items.length; j++) {
    const x = inv.items[i]!, y = inv.items[j]!;
    if (region(x) !== region(y) || x.semanticRole === y.semanticRole || mutual(x, y) < 0.5) continue;
    conflicts++;
    const same = v5ByOld.get(x.inventoryItemId) === v5ByOld.get(y.inventoryItemId);
    if (same) canonicalized++;
    const j2 = jacc(words(x.proposition), words(y.proposition));
    const identical = x.sourceSpan.charStart === y.sourceSpan.charStart && x.sourceSpan.charEnd === y.sourceSpan.charEnd;
    const fm = same && j2 < 0.25 && !identical;
    if (fm) falseMerge++;
    conflictRows.push({ roles: [x.semanticRole, y.semanticRole], spans: [[x.sourceSpan.charStart, x.sourceSpan.charEnd], [y.sourceSpan.charStart, y.sourceSpan.charEnd]], mutualOverlap: Number(mutual(x, y).toFixed(2)), propJaccard: Number(j2.toFixed(2)), canonicalizedIntoOne: same, falseMergeCandidate: fm, excerpt: x.sourceSpan.excerpt.slice(0, 100) });
  }
  const oldValues = new Set(inv.items.flatMap((i) => i.quantitativeValues.map((v) => `${i.sourceSpan.regionId}:${v.kind}:${v.normalizedValue ?? v.rawText}`)));
  const newValues = new Set(r.items.flatMap((i) => i.quantitativeValues.map((v) => `${i.sourceSpan.regionId}:${v.kind}:${v.normalizedValue ?? v.rawText}`)));
  const lostValues = [...oldValues].filter((v) => !newValues.has(v));
  const spans = (xs: SemanticInventoryItem[]) => xs.map((i) => ({ regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: i.materiality, inventoryItemId: i.inventoryItemId, parentItemId: i.parentItemId }));
  const before = computeSourceCoverage({ regions: rec.sourceContext.regions, spans: spans(inv.items) });
  const after = computeSourceCoverage({ regions: rec.sourceContext.regions, spans: spans(r.items) });
  const unaccBefore = before.unaccounted.length;
  const unaccAfter = after.unaccounted.length;
  const fraction = (c: typeof before) => { const total = Object.values(c.charsByDisposition).reduce((a, b) => a + b, 0); return total ? Number(((total - (c.charsByDisposition.UNACCOUNTED_SOURCE ?? 0)) / total).toFixed(4)) : 1; };
  const materialityChanged = inv.items.filter((o) => { const n = v5ByOld.get(o.inventoryItemId); return n && n.materiality !== o.materiality; }).length;
  const parentsBefore = inv.items.filter((i) => i.parentItemId).length, parentsAfter = r.items.filter((i) => i.parentItemId).length;
  const det = r.items.filter((i) => (i.functionProvenance?.deterministic.length ?? 0) > 0).length;
  const row = { file: rec.file.replace("tests/fixtures/", ""), pointer: rec.pointer, itemsBefore: inv.items.length, itemsAfter: r.items.length, merged: r.rejectedDuplicates, unverifiable: r.rejectedUnverifiable, itemsLost: inv.items.length - v5ByOld.size, roleConflictPairs: conflicts, roleConflictPairsCanonicalized: canonicalized, falseMergeCandidates: falseMerge, valuesLost: lostValues, parentLinks: [parentsBefore, parentsAfter], materialityChanged, unaccountedSegments: [unaccBefore, unaccAfter], accountedCharFraction: [fraction(before), fraction(after)], itemsWithDeterministicFunctionAddition: det, conflictRows };
  rows.push(row);
  totals.records++; totals.itemsBefore += inv.items.length; totals.itemsAfter += r.items.length; totals.merged += r.rejectedDuplicates; totals.roleConflictPairs += conflicts; totals.roleConflictPairsCanonicalized += canonicalized; totals.falseMergeCandidates += falseMerge; totals.valuesLost += lostValues.length; totals.itemsLost += inv.items.length - v5ByOld.size; totals.parentLinksBefore += parentsBefore; totals.parentLinksAfter += parentsAfter; totals.materialityChanged += materialityChanged; totals.deterministicAdditions += det;
  if (unaccBefore !== unaccAfter || fraction(before) !== fraction(after)) totals.coverageChangedRecords++;
}
writeFileSync(process.argv[2]!, JSON.stringify({ artifact: "F-5.1 same-root zero-cost replay of every recorded Pass A inventory through the v5 canonical migration (segment-fallback slots; no model call)", totals, records: rows }, null, 1));
console.log(JSON.stringify(totals, null, 1));
