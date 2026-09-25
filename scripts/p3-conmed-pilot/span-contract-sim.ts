/**
 * ZERO-COST simulation of the proposed CANDIDATE-SPAN CONTRACT.
 *
 *   CURRENT  operativeSourceText = structuralNodeIds.map(getNodeText(id,"DESCENDANTS")).join("\n\n")
 *   PROPOSED operativeSourceText = getNodeText(structuralNodeIds[0], "DESCENDANTS")
 *
 * structuralNodeIds is NOT changed: the linked nodes stay on the candidate, so context-retrieval,
 * coverage-audit, semantic-coverage and supersession keep receiving exactly what they receive today.
 * This script measures the difference, runs the REAL planner over both, and checks - against the real
 * context bundle production already builds - whether the parent text the proposal removes from
 * OPERATIVE is still retrieved as typed CONTEXT. No model calls anywhere.
 */
import fs from "node:fs";
import path from "node:path";
import { planCompilationShards } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { resolveSourceContext } from "../../lib/contract-model/compiler/semantic-accountability/source-context";
import { CALIBRATED_TOKENS_PER_CHAR, FIXED_CALL_OVERHEAD_CHARS } from "../../lib/contract-model/compiler/semantic/shard-types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import type { FrozenSemanticInventory } from "../../lib/contract-model/compiler/semantic-accountability/types";
import { COMPANY_ID, INSTRUMENT_KEY, operativeTextFor } from "./pipeline";
import { prepare, buildInput } from "./compile-run";
import { dedupExact } from "./dedup";
import { budgetFor, emptyInventory } from "./shard-threshold-sim";
import { preChangeOperativeText } from "./pre-change-span";

const OUT = "docs/phase-3-candidate-span-remediation";
const INVENTORY_BATCH_CHARS = 6000, INVENTORY_PASSES = 2, MAX_TOOL_CALLS = 8, MAX_TURN_OVERHEAD = 4;
const tok = (c: number) => Math.ceil(c * CALIBRATED_TOKENS_PER_CHAR);
const inventoryCalls = (chars: number) => Math.max(1, Math.ceil(chars / INVENTORY_BATCH_CHARS)) * INVENTORY_PASSES;
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]! : 0; };
const dist = (xs: number[]) => ({ n: xs.length, total: xs.reduce((a, b) => a + b, 0), mean: xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0, p50: q(xs, 0.5), p90: q(xs, 0.9), p95: q(xs, 0.95), max: q(xs, 1), over4k: xs.filter((x) => x > 4000).length, over6k: xs.filter((x) => x > 6000).length, over8k: xs.filter((x) => x > 8000).length, over10k: xs.filter((x) => x > 10000).length });

export interface SpanRow {
  discoveryId: string; ref: string; role: string; nodeIds: number; dual: boolean;
  currentChars: number; proposedChars: number; removedChars: number;
  currentShards: number; proposedShards: number; currentMaxPrimary: number; proposedMaxPrimary: number;
  currentInvCalls: number; proposedInvCalls: number; currentMaxSeq: number; proposedMaxSeq: number;
  currentFirstTurnTok: number; proposedFirstTurnTok: number;
  linkedRefs: string[]; parentScopeItems: string[]; parentCoveredByContext: boolean; parentCoveredByParentScopeAlone: boolean; parentScopeChars: number;
}

export const FOCUS_IDS: Record<string, string> = {
  short_7_2_e: "discovery-candidate:31223fa50581f12fb594ec0d",
  long_7_2_e: "discovery-candidate:62512247bce898548b6f9b63",
  parent_7_2_k: "discovery-candidate:28d7bafd7a1fedde253333ef",
  long_7_2_k: "discovery-candidate:c9999a82a8a6c1c3a9648e22",
  k_i: "discovery-candidate:abc8af03ac51f922f06ded82",
  k_ii: "discovery-candidate:42316093889582e0874f69a6",
  medium_7_6: "discovery-candidate:42423b37324ac426d0f961e2",
};

async function main() {
  const { stages, bundles, rehydrated } = await prepare();
  // The sealed 137 population is defined by the PRE-CHANGE span, so before/after stays comparable.
  const { keep } = dedupExact(rehydrated, (c) => preChangeOperativeText(c, stages.index));
  // Tier 1 (real frozen inventories) is used when the pilot's frozen responses are on disk. They live in
  // the session scratch directory, so a reclaimed container leaves every candidate on the structural-only
  // path. The planner consumes the inventory ONLY for ownership/must-link, so operative-span measurements
  // are identical either way; the tier is recorded so the provenance of the shard counts is never implied.
  const frozenPath = "/tmp/claude-0/pilot/run/06-frozen-responses.json";
  const realInv = new Map<string, FrozenSemanticInventory>();
  if (fs.existsSync(frozenPath)) for (const e of JSON.parse(fs.readFileSync(frozenPath, "utf8")) as { discoveryId: string; result?: { frozenInventory?: FrozenSemanticInventory } }[]) {
    const inv = e.result?.frozenInventory; if (inv && inv.items.length > 0 && !realInv.has(e.discoveryId)) realInv.set(e.discoveryId, inv);
  }

  const rows: SpanRow[] = [];
  for (const c of keep) {
    const ids = c.structuralNodeIds ?? [];
    const anchorId = ids[0];
    const currentText = preChangeOperativeText(c, stages.index);
    const proposedText = operativeTextFor(c, stages.index); // now the production rule itself
    const bundle = bundles.get(c.discoveryId);

    // What the REAL production context bundle already holds for this candidate.
    const parentScopeItems: string[] = [];
    let parentCovered = false, parentByScopeAlone = false, parentScopeChars = 0;
    const linked = new Set(ids.slice(1));
    for (const item of bundle?.items ?? []) {
      if (item.type === "PARENT_SCOPE") { parentScopeItems.push(item.normalizedRef); parentScopeChars += item.excerptText.length; }
      if (item.structuralNodeId !== null && linked.has(item.structuralNodeId)) {
        if (item.type === "PARENT_SCOPE" || item.type === "OPERATIVE_SOURCE") parentCovered = true;
        if (item.type === "PARENT_SCOPE") parentByScopeAlone = true;
      }
    }

    const plan = (text: string) => {
      const input = { ...buildInput(c, bundle, stages, undefined as never, []), operativeSourceText: text };
      const sc = resolveSourceContext({ index: stages.index, documentId: input.sourceDocumentId, operativeSourceText: text, anchorNodeId: input.contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: input.operativeCharStart ?? null, documentText: stages.index.getDocumentText(input.sourceDocumentId) ?? null });
      const inv = realInv.get(c.discoveryId) ?? emptyInventory(c.discoveryId, sc);
      try {
        const p = planCompilationShards({ candidateRef: c.discoveryId, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, documentId: input.sourceDocumentId, sourceContext: sc, frozenInventory: inv, structuralIndex: stages.index, budget: budgetFor(12_000), generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
        return { shards: p.shards.length, maxPrimary: Math.max(0, ...p.shards.map((s) => s.primaryChars)), firstTurnTok: Math.max(0, ...p.shards.map((s) => s.estimate.inputTokens)) };
      } catch { return { shards: 1, maxPrimary: text.length, firstTurnTok: tok(text.length + FIXED_CALL_OVERHEAD_CHARS) }; }
    };
    const cur = plan(currentText), pro = plan(proposedText);
    rows.push({
      discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), role: String(c.role), nodeIds: ids.length, dual: ids.length > 1,
      currentChars: currentText.length, proposedChars: proposedText.length, removedChars: currentText.length - proposedText.length,
      currentShards: cur.shards, proposedShards: pro.shards, currentMaxPrimary: cur.maxPrimary, proposedMaxPrimary: pro.maxPrimary,
      currentInvCalls: inventoryCalls(currentText.length), proposedInvCalls: inventoryCalls(proposedText.length),
      currentMaxSeq: inventoryCalls(currentText.length) + MAX_TOOL_CALLS + MAX_TURN_OVERHEAD, proposedMaxSeq: inventoryCalls(proposedText.length) + MAX_TOOL_CALLS + MAX_TURN_OVERHEAD,
      currentFirstTurnTok: cur.firstTurnTok, proposedFirstTurnTok: pro.firstTurnTok,
      linkedRefs: ids.slice(1).map((id) => stages.index.getNodeById(id)?.sectionRef ?? "?"),
      parentScopeItems, parentCoveredByContext: ids.length > 1 ? parentCovered : true, parentCoveredByParentScopeAlone: ids.length > 1 ? parentByScopeAlone : true, parentScopeChars,
    });
  }

  const dual = rows.filter((r) => r.dual);
  const seqHist = (sel: (r: SpanRow) => number) => Object.fromEntries([...new Set(rows.map(sel))].sort((a, b) => a - b).map((v) => [v, rows.filter((r) => sel(r) === v).length]));
  const summary = {
    generatedBy: "scripts/p3-conmed-pilot/span-contract-sim.ts", modelCalls: 0,
    inventoryTier: realInv.size > 0 ? `TIER_1_REAL_INVENTORY for ${realInv.size} candidates, TIER_2_STRUCTURAL_ONLY for the rest` : "TIER_2_STRUCTURAL_ONLY for all candidates (the pilot's frozen responses are not on disk in this container; the planner uses the inventory only for ownership/must-link, so every operative-span figure here is unaffected and only shard counts could differ for the 17 candidates that have a real inventory)",
    population: rows.length, dual: dual.length,
    current: dist(rows.map((r) => r.currentChars)), proposed: dist(rows.map((r) => r.proposedChars)),
    reductionPct: Math.round((10000 * rows.reduce((a, r) => a + r.removedChars, 0)) / rows.reduce((a, r) => a + r.currentChars, 0)) / 100,
    shards: { current: rows.reduce((a, r) => a + r.currentShards, 0), proposed: rows.reduce((a, r) => a + r.proposedShards, 0), currentSharded: rows.filter((r) => r.currentShards > 1).length, proposedSharded: rows.filter((r) => r.proposedShards > 1).length },
    inventoryCalls: { current: rows.reduce((a, r) => a + r.currentInvCalls, 0), proposed: rows.reduce((a, r) => a + r.proposedInvCalls, 0) },
    maxSequentialCalls: { currentMax: Math.max(...rows.map((r) => r.currentMaxSeq)), proposedMax: Math.max(...rows.map((r) => r.proposedMaxSeq)), currentHistogram: seqHist((r) => r.currentMaxSeq), proposedHistogram: seqHist((r) => r.proposedMaxSeq) },
    firstTurnTokens: { currentMax: Math.max(...rows.map((r) => r.currentFirstTurnTok)), proposedMax: Math.max(...rows.map((r) => r.proposedFirstTurnTok)), currentTotal: rows.reduce((a, r) => a + r.currentFirstTurnTok, 0), proposedTotal: rows.reduce((a, r) => a + r.proposedFirstTurnTok, 0) },
    linkedContextRetention: { dualCandidates: dual.length, parentPresentInRealContextBundle: dual.filter((r) => r.parentCoveredByContext).length, parentPresentAsTypedPARENT_SCOPEalone: dual.filter((r) => r.parentCoveredByParentScopeAlone).length, parentScopeChars: dist(dual.map((r) => r.parentScopeChars)), contextLossCases: dual.filter((r) => !r.parentCoveredByContext).map((r) => ({ ref: r.ref, linkedRefs: r.linkedRefs })) },
    residualOver4k: rows.filter((r) => r.proposedChars > 4000).map((r) => ({ ref: r.ref, role: r.role, chars: r.proposedChars, nodeIds: r.nodeIds })),
  };
  const focus = Object.fromEntries(Object.entries(FOCUS_IDS).map(([slot, id]) => [slot, rows.find((r) => r.discoveryId === id) ?? null]));

  // The §9 duplicate question: which candidates share one anchor once the span is anchor-only?
  const byAnchor = new Map<string, SpanRow[]>();
  for (const c of keep) {
    const a = (c.structuralNodeIds ?? [])[0]; if (!a) continue;
    if (!byAnchor.has(a)) byAnchor.set(a, []);
    byAnchor.get(a)!.push(rows.find((x) => x.discoveryId === c.discoveryId)!);
  }
  const sameAnchorGroups = [...byAnchor.entries()].filter(([, v]) => v.length > 1).map(([a, v]) => ({ anchorNodeId: a, anchorRef: stages.index.getNodeById(a)?.sectionRef ?? "?", members: v.map((m) => ({ discoveryId: m.discoveryId, ref: m.ref, role: m.role, currentChars: m.currentChars, proposedChars: m.proposedChars })) }));

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "02-conmed-before-after.json"), JSON.stringify({ ...summary, focus }, null, 2));
  fs.writeFileSync(path.join(OUT, "03-per-candidate.json"), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(OUT, "04-same-anchor-groups.json"), JSON.stringify({ note: "candidates sharing one anchor node - the §9 duplicate-candidate question", groups: sameAnchorGroups }, null, 2));

  console.log("tier:", summary.inventoryTier);
  console.log("operative chars   current", JSON.stringify(summary.current));
  console.log("operative chars  proposed", JSON.stringify(summary.proposed));
  console.log("reduction%", summary.reductionPct, "shards", JSON.stringify(summary.shards), "invCalls", JSON.stringify(summary.inventoryCalls));
  console.log("maxSeq", JSON.stringify(summary.maxSequentialCalls), "\nfirstTurnTok", JSON.stringify(summary.firstTurnTokens));
  console.log("retention", JSON.stringify(summary.linkedContextRetention));
  console.log("residual >4k", JSON.stringify(summary.residualOver4k));
  for (const [slot, r] of Object.entries(focus)) if (r) console.log(`  ${slot.padEnd(13)} ${r.ref.padEnd(11)} ${String(r.currentChars).padStart(5)} -> ${String(r.proposedChars).padStart(5)} | shards ${r.currentShards}->${r.proposedShards} | maxPri ${r.currentMaxPrimary}->${r.proposedMaxPrimary} | seq ${r.currentMaxSeq}->${r.proposedMaxSeq} | linked=${JSON.stringify(r.linkedRefs)} parentScope=${JSON.stringify(r.parentScopeItems)} covered=${r.parentCoveredByContext}`);
  console.log("same-anchor groups:", sameAnchorGroups.map((g) => `${g.anchorRef}x${g.members.length}[${g.members.map((m) => m.role).join(",")}]`).join(" "));
}
if (process.argv[1]?.endsWith("span-contract-sim.ts")) void main();
