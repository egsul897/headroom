/**
 * F-5 same-root ZERO-COST regression: every recorded Pass A inventory under tests/fixtures that still carries its
 * source context is pushed through the v4 deterministic post-processing (segment-fallback slots: the recorded
 * structural indexes are not preserved) with its own verified excerpts as the wire input. Reports identity changes,
 * merges (and potential false merges), source-coverage deltas and lineage-relevant counts. No model call.
 *   npx tsx scripts/f5-same-root-rekey.ts <out.json>
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
const toWire = (i: SemanticInventoryItem, k: number): WireInventoryItem => ({ localRef: `w${k}`, semanticRole: i.semanticRole, proposition: i.proposition, excerpt: i.sourceSpan.excerpt, regionId: i.sourceSpan.regionId, slotId: null, quantitativeValues: i.quantitativeValues.map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue, unit: v.unit })), referencedTerms: i.referencedTerms, referencedSections: i.referencedSections, parentRef: null, relatedRefs: [], materiality: i.materiality, ambiguity: i.ambiguity, ambiguityReason: i.ambiguityReason, operative: i.operative });

const records: { file: string; pointer: string; inventory: FrozenSemanticInventory; sourceContext: SourceContextResult }[] = [];
for (const f of listJson("tests/fixtures")) {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(f, "utf-8")); } catch { continue; }
  findRecords(parsed, f, "", records);
}
const rows = records.map((r) => {
  const before = r.inventory.items;
  if (before.length === 0) return { file: r.file, pointer: r.pointer, itemsBefore: 0, skipped: "empty inventory" };
  const re = normalizeInventorySubmission({ candidateRef: r.inventory.candidateRef, sourceContext: r.sourceContext }, before.map(toWire));
  const spans = (items: SemanticInventoryItem[]) => items.map((i) => ({ regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: i.materiality }));
  const covBefore = computeSourceCoverage({ regions: r.sourceContext.regions, spans: spans(before) });
  const covAfter = computeSourceCoverage({ regions: r.sourceContext.regions, spans: spans(re.items) });
  // potential false merges: a member that was actually MERGED (its role+span no longer exists as its own item) whose
  // proposition shares < 20% of its words with the surviving item it merged into
  let falseMergeCandidates = 0;
  const survivors = re.items;
  const own = new Set(survivors.map((x) => `${x.semanticRole}|${x.sourceSpan.regionId}|${x.sourceSpan.charStart}-${x.sourceSpan.charEnd}`));
  for (const b of before) {
    if (own.has(`${b.semanticRole}|${b.sourceSpan.regionId}|${b.sourceSpan.charStart}-${b.sourceSpan.charEnd}`)) continue;
    const s = survivors.find((x) => x.semanticRole === b.semanticRole && x.sourceSpan.regionId === b.sourceSpan.regionId && x.sourceSpan.charStart <= b.sourceSpan.charStart && b.sourceSpan.charEnd <= x.sourceSpan.charEnd);
    if (s && jacc(words(s.proposition), words(b.proposition)) < 0.2) falseMergeCandidates++;
  }
  const idsBefore = new Set(before.map((i) => i.inventoryItemId));
  const idsAfter = new Set(re.items.map((i) => i.inventoryItemId));
  const materialBefore = before.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").length;
  const materialAfter = re.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").length;
  return { file: r.file, pointer: r.pointer, itemsBefore: before.length, itemsAfter: re.items.length, merged: re.rejectedDuplicates, unverifiable: re.rejectedUnverifiable, identityChanged: [...idsBefore].filter((id) => !idsAfter.has(id)).length, materialBefore, materialAfter, unaccountedBefore: covBefore.unaccounted.length, unaccountedAfter: covAfter.unaccounted.length, unaccountedValuesBefore: covBefore.unaccountedValues.length, unaccountedValuesAfter: covAfter.unaccountedValues.length, falseMergeCandidates, slotsAssigned: re.items.every((i) => !!i.slotId) };
});
const replayed = rows.filter((r) => "itemsAfter" in r) as Extract<(typeof rows)[number], { itemsAfter: number }>[];
const summary = {
  artifact: "F-5 same-root zero-cost regression: recorded Pass A inventories re-keyed through the v4 post-processing (segment-fallback slots)",
  recordsFound: rows.length, recordsReplayed: replayed.length,
  totals: { itemsBefore: replayed.reduce((n, r) => n + r.itemsBefore, 0), itemsAfter: replayed.reduce((n, r) => n + r.itemsAfter, 0), merged: replayed.reduce((n, r) => n + r.merged, 0), unverifiable: replayed.reduce((n, r) => n + r.unverifiable, 0), identityChanged: replayed.reduce((n, r) => n + r.identityChanged, 0), falseMergeCandidates: replayed.reduce((n, r) => n + r.falseMergeCandidates, 0), unaccountedBefore: replayed.reduce((n, r) => n + r.unaccountedBefore, 0), unaccountedAfter: replayed.reduce((n, r) => n + r.unaccountedAfter, 0), unaccountedValuesBefore: replayed.reduce((n, r) => n + r.unaccountedValuesBefore, 0), unaccountedValuesAfter: replayed.reduce((n, r) => n + r.unaccountedValuesAfter, 0), materialBefore: replayed.reduce((n, r) => n + r.materialBefore, 0), materialAfter: replayed.reduce((n, r) => n + r.materialAfter, 0) },
  note: "identityChanged counts v3 ids that no longer exist (v4 re-keys EVERY id by design - a version bump; Pass C canonicalizes recorded lineage by content digest, never by raw id). Coverage is span-driven and unchanged unless a merge drops a span, which the totals show.",
  rows,
};
writeFileSync(process.argv[2]!, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, rows: undefined }, null, 1));
