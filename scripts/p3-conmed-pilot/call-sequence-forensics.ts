/**
 * The second half of the diagnosis: how many MODEL CALLS a candidate costs before and
 * during compilation, and what 7.2(k) looks like structurally. Deterministic and free.
 *
 * This matters because the 480s ceiling is not a budget for one call — it covers the
 * whole sequential chain: dual-pass semantic inventory (one call per 6,000-char batch,
 * twice), then the compile conversation (up to maxToolCalls + overhead turns).
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import { DEFAULT_SHARD_BUDGET } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { buildDeterministicStages, sealedPopulation, rehydrateNodeIds, operativeTextFor } from "./pipeline";

const INVENTORY_BATCH_CHARS = 6000;
const INVENTORY_PASSES = 2;
const MAX_TURN_OVERHEAD = 4;
const OUT = "docs/phase-3-long-provision-forensics";

/** Sequential model calls a single candidate costs, end to end, inside one 480s ceiling. */
export function callSequence(sourceChars: number, budget = DEFAULT_TOOL_BUDGET) {
  const batchesPerPass = Math.max(1, Math.ceil(sourceChars / INVENTORY_BATCH_CHARS));
  const inventoryCalls = batchesPerPass * INVENTORY_PASSES;
  const maxCompileTurns = budget.maxToolCalls + MAX_TURN_OVERHEAD;
  return { sourceChars, batchesPerPass, inventoryCalls, maxCompileTurns, maxSequentialCalls: inventoryCalls + maxCompileTurns, secondsPerCallAt480s: Number((480 / (inventoryCalls + maxCompileTurns)).toFixed(1)) };
}

/** Would the planner shard this provision, or hand it to one conversation whole? */
export function shardDisposition(sourceChars: number, budget = DEFAULT_SHARD_BUDGET) {
  if (sourceChars > budget.maxPrimaryChars) return { sharded: true, reason: `exceeds maxPrimaryChars ${budget.maxPrimaryChars}` };
  if (sourceChars > budget.targetPrimaryChars) return { sharded: "MAYBE", reason: `above targetPrimaryChars ${budget.targetPrimaryChars} but below maxPrimaryChars ${budget.maxPrimaryChars}` };
  return { sharded: false, reason: `below targetPrimaryChars ${budget.targetPrimaryChars} — handled MONOLITHICALLY as one conversation` };
}

function main() {
  const stages = buildDeterministicStages();
  const { rehydrated } = rehydrateNodeIds(sealedPopulation().eligible, stages.index);
  const withText = rehydrated.map((c) => ({ c, chars: operativeTextFor(c, stages.index).length, ref: String(c.normalizedSourceRef) })).filter((x) => x.chars > 0);

  const cases = [
    { slot: "SHORT_CONTROL", ref: "7.2(e)", target: 200 },
    { slot: "MEDIUM", ref: null as string | null, target: 3500 },
    { slot: "LONG", ref: "7.2(e)", target: 9045 },
    { slot: "HARD", ref: "7.2(k)", target: 9621 },
  ].map((c) => {
    const pool = c.ref ? withText.filter((x) => x.ref === c.ref) : withText;
    const best = pool.sort((a, b) => Math.abs(a.chars - c.target) - Math.abs(b.chars - c.target))[0]!;
    return { slot: c.slot, ref: best.ref, chars: best.chars, seq: callSequence(best.chars), shard: shardDisposition(best.chars) };
  });

  console.log("=== SEQUENTIAL MODEL CALLS PER CANDIDATE (all inside ONE 480s ceiling) ===");
  console.log("slot            ref        chars  invBatches  invCalls  maxTurns  maxCalls  s/call@480s  sharded");
  for (const c of cases) {
    console.log(`${c.slot.padEnd(15)} ${c.ref.padEnd(10)} ${String(c.chars).padStart(5)}  ${String(c.seq.batchesPerPass).padStart(10)}  ${String(c.seq.inventoryCalls).padStart(8)}  ${String(c.seq.maxCompileTurns).padStart(8)}  ${String(c.seq.maxSequentialCalls).padStart(8)}  ${String(c.seq.secondsPerCallAt480s).padStart(11)}  ${String(c.shard.sharded)}`);
  }

  // ---- 7.2(k) structural map
  const k = withText.filter((x) => x.ref === "7.2(k)" || x.ref.startsWith("7.2(k)("));
  const all72k = withText.filter((x) => /^7\.2\(k\)/.test(x.ref));
  console.log("\n=== 7.2(k) STRUCTURAL MAP ===");
  for (const x of all72k.sort((a, b) => a.ref.localeCompare(b.ref))) {
    const s = callSequence(x.chars);
    console.log(`  ${x.ref.padEnd(14)} ${String(x.chars).padStart(5)} ch  invCalls=${s.inventoryCalls}  maxCalls=${s.maxSequentialCalls}  ${shardDisposition(x.chars).sharded === false ? "MONOLITHIC" : "SHARD?"}`);
  }
  const parent = all72k.find((x) => x.ref === "7.2(k)");
  const children = all72k.filter((x) => x.ref !== "7.2(k)");
  const childChars = children.reduce((s, x) => s + x.chars, 0);
  console.log(`\n  parent 7.2(k): ${parent?.chars ?? 0} chars`);
  console.log(`  child candidates: ${children.length}, total ${childChars} chars`);
  console.log(`  OVERLAP: parent span re-covered by children = ${parent ? Math.round((100 * childChars) / parent.chars) : 0}% of the parent's own length`);

  fs.mkdirSync(path.join(process.cwd(), OUT), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), OUT, "02-call-sequence.json"), JSON.stringify({
    inventoryBatchChars: INVENTORY_BATCH_CHARS, inventoryPasses: INVENTORY_PASSES,
    toolBudget: DEFAULT_TOOL_BUDGET, maxTurnOverhead: MAX_TURN_OVERHEAD, shardBudget: DEFAULT_SHARD_BUDGET,
    cases,
    structuralMap72k: all72k.map((x) => ({ ref: x.ref, chars: x.chars, ...callSequence(x.chars) })),
    overlap: { parentChars: parent?.chars ?? 0, childCount: children.length, childChars },
  }, null, 2) + "\n");
  console.log(`\nwrote ${OUT}/02-call-sequence.json`);
}

if (process.argv[1]?.endsWith("call-sequence-forensics.ts")) main();
