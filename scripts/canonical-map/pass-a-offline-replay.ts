/**
 * OFFLINE replay of the eight benchmark-recovery targets through the NEW Pass A execution policy - zero provider calls.
 * For each target the exact preserved operative text (recovery evidence) is re-anchored in the deterministic CONMED
 * stages, the source context, slot partition and batches are recomputed, and the derived bounds are reported:
 * slots, batches, deterministic signals, maximum legitimate items, maximum serialized output, requested ceiling.
 */
import fs from "node:fs";
import path from "node:path";
import { buildDeterministicStages, rehydrateNodeIds, sealedPopulation } from "../p3-conmed-pilot/pipeline";
import { resolveSourceContext } from "../../lib/contract-model/compiler/semantic-accountability/source-context";
import { batchSlots, partitionSourceSlots } from "../../lib/contract-model/compiler/semantic-accountability/slots";
import { splitOversizedBatches } from "../../lib/contract-model/compiler/semantic-accountability/inventory";
import { CERTIFIED_INVENTORY_EXECUTION_POLICY, computeSlotSignals, deriveInventoryOutputBound, inventoryPolicyIdentity, maxPropositionsForSlot } from "../../lib/contract-model/compiler/semantic-accountability/inventory-policy";
import { buildInventorySystemPrompt, buildInventoryUserContent } from "../../lib/contract-model/compiler/semantic-accountability/prompt";
import { DEFAULT_MAX_TOKENS } from "../../lib/contract-model/analyzer/anthropic-analyzer";
import { resolveOperativeSource } from "../../lib/contract-model/compiler/candidate-span";

const TARGETS = ["7.1", "7.2", "7.10", "7.2(c)", "7.13", "7.14", "7.16", "7.17"];
const OBSERVED_OLD: Record<string, { sourceChars: number; passAOutputTokens: number[] }> = {
  "7.1": { sourceChars: 3275, passAOutputTokens: [42396] }, "7.13": { sourceChars: 1212, passAOutputTokens: [43846] }, "7.14": { sourceChars: 1106, passAOutputTokens: [45028] },
  "7.16": { sourceChars: 1144, passAOutputTokens: [63943] }, "7.17": { sourceChars: 795, passAOutputTokens: [40605] }, "7.2(c)": { sourceChars: 529, passAOutputTokens: [116913, 36761] },
};

export interface PassAReplayRow {
  ref: string; discoveryId: string; operativeSourceChars: number; preservedChars: number | null; charsMatchPreserved: boolean | null;
  sourceContextState: string; regionsConsidered: number; slots: number; batches: number;
  deterministicSignals: { values: number; references: number; definedTerms: number };
  perSlot: { slotId: string; chars: number; values: number; references: number; maxPropositions: number; perItemMaxChars: number }[];
  maxLegitimateItems: number; maxSerializedChars: number; requestedMaxOutputTokens: number; oldMaxOutputTokens: number;
  oldObservedOutputTokens: number[] | null; reductionFactorVsOldCeiling: number; promptChars: { system: number; user: number };
}

export function replayPassA(): { policy: string; rows: PassAReplayRow[] } {
  const stages = buildDeterministicStages();
  const pop = sealedPopulation();
  const { rehydrated } = rehydrateNodeIds(pop.all, stages.index);
  const policy = CERTIFIED_INVENTORY_EXECUTION_POLICY;
  const evidenceDir = "docs/phase-3-conmed-benchmark-recovery";
  const preservedChars = new Map<string, number>();
  for (const f of fs.readdirSync(evidenceDir, { recursive: true }) as string[]) {
    if (!f.endsWith(".json") || !f.includes("evidence")) continue;
    try { const d = JSON.parse(fs.readFileSync(path.join(evidenceDir, f), "utf8")); if (d.compilerInput?.sourceSectionRef) preservedChars.set(d.compilerInput.sourceSectionRef, d.compilerInput.operativeSourceChars); } catch { /* not a record */ }
  }
  const rows: PassAReplayRow[] = [];
  for (const ref of TARGETS) {
    const c = rehydrated.find((x) => x.normalizedSourceRef === ref);
    if (!c) { rows.push({ ref, discoveryId: "(not in sealed population)", operativeSourceChars: 0, preservedChars: preservedChars.get(ref) ?? null, charsMatchPreserved: null, sourceContextState: "N/A", regionsConsidered: 0, slots: 0, batches: 0, deterministicSignals: { values: 0, references: 0, definedTerms: 0 }, perSlot: [], maxLegitimateItems: 0, maxSerializedChars: 0, requestedMaxOutputTokens: 0, oldMaxOutputTokens: DEFAULT_MAX_TOKENS, oldObservedOutputTokens: OBSERVED_OLD[ref]?.passAOutputTokens ?? null, reductionFactorVsOldCeiling: 0, promptChars: { system: 0, user: 0 } }); continue; }
    const src = resolveOperativeSource(c, stages.index, null);
    const anchor = c.structuralNodeIds[0] ? stages.index.getNodeById(c.structuralNodeIds[0]) : undefined;
    const sc = resolveSourceContext({ index: stages.index, documentId: c.documentId, operativeSourceText: src.text, anchorNodeId: anchor?.nodeId ?? null, operativeCharStart: anchor?.charStart ?? null, documentText: stages.index.getDocumentText(c.documentId) ?? null });
    // certified CONTEXT_ONLY: accountability sees the operative region(s) only
    const accountability = { ...sc, regions: sc.regions.filter((r) => r.kind === "OPERATIVE") };
    const partition = partitionSourceSlots({ sourceContext: accountability, structuralIndex: stages.index });
    const batches = splitOversizedBatches(batchSlots(partition, accountability, policy.batchChars), policy.maxBatchSlots);
    const perSlot = partition.slots.map((sl) => { const sig = computeSlotSignals(sl, stages.index); return { slotId: sl.slotId, chars: sl.text.length, values: sig.values.length, references: sig.references.length, definedTerms: sig.definedTerms.length, maxPropositions: maxPropositionsForSlot(sig, policy), perItemMaxChars: 0 }; });
    const bounds = batches.map((b) => deriveInventoryOutputBound(b.slots, stages.index, policy));
    for (const b of bounds) for (const p of b.perSlot) { const row = perSlot.find((x) => x.slotId === p.slotId); if (row) row.perItemMaxChars = p.perItemMaxChars; }
    const requested = Math.max(0, ...bounds.map((b) => b.maxOutputTokens));
    const sys = buildInventorySystemPrompt(policy);
    const user = batches[0] ? buildInventoryUserContent(accountability, batches[0], { bound: bounds[0], signals: new Map(batches[0].slots.map((sl) => [sl.slotId, computeSlotSignals(sl, stages.index)] as const)) }) : "";
    rows.push({
      ref, discoveryId: c.discoveryId, operativeSourceChars: src.text.length, preservedChars: preservedChars.get(ref) ?? OBSERVED_OLD[ref]?.sourceChars ?? null, charsMatchPreserved: preservedChars.has(ref) || OBSERVED_OLD[ref] ? src.text.length === (preservedChars.get(ref) ?? OBSERVED_OLD[ref]!.sourceChars) : null,
      sourceContextState: sc.state, regionsConsidered: accountability.regions.length, slots: partition.slots.length, batches: batches.length,
      deterministicSignals: { values: perSlot.reduce((n, p) => n + p.values, 0), references: perSlot.reduce((n, p) => n + p.references, 0), definedTerms: perSlot.reduce((n, p) => n + p.definedTerms, 0) },
      perSlot: perSlot.map(({ definedTerms: _d, ...rest }) => { void _d; return rest; }),
      maxLegitimateItems: bounds.reduce((n, b) => n + b.maxItems, 0), maxSerializedChars: bounds.reduce((n, b) => n + b.maxSerializedChars, 0), requestedMaxOutputTokens: requested, oldMaxOutputTokens: DEFAULT_MAX_TOKENS,
      oldObservedOutputTokens: OBSERVED_OLD[ref]?.passAOutputTokens ?? null, reductionFactorVsOldCeiling: requested > 0 ? Number((DEFAULT_MAX_TOKENS / requested).toFixed(1)) : 0, promptChars: { system: sys.length, user: user.length },
    });
  }
  return { policy: inventoryPolicyIdentity(policy), rows };
}

if (process.argv[1]?.endsWith("pass-a-offline-replay.ts")) {
  const out = replayPassA();
  const dir = "docs/canonical-covenant-map";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "06-pass-a-offline-replay.json"), JSON.stringify({ generatedAt: new Date().toISOString(), paidCalls: 0, ...out }, null, 2));
  console.log(JSON.stringify({ policy: out.policy, rows: out.rows.map((r) => ({ ref: r.ref, chars: r.operativeSourceChars, preserved: r.preservedChars, match: r.charsMatchPreserved, state: r.sourceContextState, slots: r.slots, batches: r.batches, signals: r.deterministicSignals, maxItems: r.maxLegitimateItems, maxChars: r.maxSerializedChars, newMaxTokens: r.requestedMaxOutputTokens, oldMax: r.oldMaxOutputTokens, observed: r.oldObservedOutputTokens, reduction: r.reductionFactorVsOldCeiling, prompt: r.promptChars })) }, null, 1));
}
