/**
 * §8 — the CONMED low-cost current-pipeline pilot.
 *
 * Runs the UNCHANGED production compiler over the sealed CONMED Article VII population
 * with a cheaper model, under a hard $75 ceiling, with §2's cheap-first cascade.
 *
 * Discipline this file enforces, because the mission depends on it:
 *  - the population is the whole sealed set; there is no cap and no slice;
 *  - the budget guard STOPS before crossing $75 and records exactly what was not run,
 *    rather than trimming the population quietly;
 *  - escalation is triggered by execution failure only, never by an unfavourable answer;
 *  - every model response is frozen to disk before anything is scored.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { INSTRUMENT_KEY, operativeTextFor, sha256 } from "./pipeline";
import { dedupExact } from "./dedup";
import { CandidateTimeoutError, PER_CANDIDATE_TIMEOUT_MS, buildInput, callerFor, loadModel, maxTokensFor, prepare, realCost, record, runPool, shouldEscalate, withTimeout, type CandidateRecord } from "./compile-run";

const OUT = "/tmp/claude-0/pilot/run";
const BUDGET_CEILING_USD = 75;
/** Stop before the ceiling with room for the calls already in flight at the chosen pool size. */
const BUDGET_STOP_AT_USD = 70;

function save(name: string, body: unknown) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(body, null, 2));
}

async function main() {
  const tier1Id = process.argv[2]!;
  const tier2Id = process.argv[3]!;
  const concurrency = Number(process.argv[4] ?? 6);

  const tier1 = loadModel(tier1Id);
  const tier2 = loadModel(tier2Id);
  const { stages, pop, rehydrated, unresolved, bundles } = await prepare();

  // --- §7: free savings pass, before a single paid compilation ---
  const { keep, report: dedupReport } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
  save("01-dedup", dedupReport);
  console.log(`population ${pop.all.length} -> eligible ${pop.eligible.length} -> after exact dedup ${keep.length} (removed ${dedupReport.exactDuplicatesRemoved}, cache hits ${dedupReport.cacheHits})`);

  // --- amendment effects + operative state: the compiler's tool access, as production builds it ---
  const stageCaller = getStageCaller();
  console.log(`amendment stage caller: ${stageCaller.providerName} ${stageCaller.model}`);
  const amendment = await runAmendmentPipeline(stageCaller, { documents: stages.documents, packageGraph: stages.packageGraph, index: stages.index });
  const operativeState = computeOperativeContractState({
    instrumentKey: INSTRUMENT_KEY,
    baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement",
    asOfDate: new Date().toISOString().slice(0, 10),
    index: stages.index,
    allEffects: amendment.effects,
  });
  console.log(`amendment effects ${amendment.effects.length}, operative state ${operativeState.status} (${operativeState.provisions.length} provisions)`);
  save("02-amendment", { effects: amendment.effects.length, summary: amendment.summary, operativeStateStatus: operativeState.status, provisions: operativeState.provisions.length });



  // --- Tier 1 ---
  process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(tier1));
  const caller1 = callerFor(tier1Id);
  let spent = 0;
  const notRun: { discoveryId: string; sourceSectionRef: string; reason: string }[] = [];
  const frozen: { discoveryId: string; model: string; tier: number; result: SemanticCompilationResult }[] = [];

  const runOne = async (candidate: DiscoveredCandidate, model: typeof tier1, caller: ReturnType<typeof callerFor>, tier: 1 | 2, escalationReason: string | null): Promise<CandidateRecord> => {
    const input = buildInput(candidate, bundles.get(candidate.discoveryId), stages, operativeState, amendment.effects);
    try {
      const result = await withTimeout(compileCovenantToIR(input, { caller }), PER_CANDIDATE_TIMEOUT_MS);
      frozen.push({ discoveryId: candidate.discoveryId, model: model.id, tier, result });
      const rec = record(candidate, input, result, model, tier, escalationReason);
      spent += rec.actualCostUsd;
      return rec;
    } catch (err) {
      const name = err instanceof Error ? err.name : "UnknownError";
      const synthetic = {
        status: "FAILED",
        failureReasons: [name === "CandidateTimeoutError" ? "WALL_CLOCK_TIMEOUT" : "TRANSPORT_OR_INTERNAL_ERROR"],
        rules: [],
        definitions: [],
        toolCallLog: [],
        telemetry: null,
      } as unknown as SemanticCompilationResult;
      frozen.push({ discoveryId: candidate.discoveryId, model: model.id, tier, result: synthetic });
      return record(candidate, input, synthetic, model, tier, escalationReason);
    }
  };

  let done = 0;
  const tier1Records = await runPool(keep, concurrency, async (candidate) => {
    if (spent >= BUDGET_STOP_AT_USD) {
      notRun.push({ discoveryId: candidate.discoveryId, sourceSectionRef: candidate.normalizedSourceRef, reason: `budget guard: $${spent.toFixed(2)} spent, stopping before the $${BUDGET_CEILING_USD} ceiling` });
      return null;
    }
    const rec = await runOne(candidate, tier1, caller1, 1, null);
    done++;
    if (done % 10 === 0 || rec.status === "FAILED") console.log(`  [T1 ${done}/${keep.length}] ${rec.sourceSectionRef} ${rec.status} rules=${rec.rules} $${spent.toFixed(3)}`);
    return rec;
  });
  const t1 = tier1Records.filter((r): r is CandidateRecord => r !== null);
  save("03-tier1", t1);
  console.log(`\nTier 1 complete: ${t1.length} run, ${t1.filter((r) => r.status !== "FAILED").length} usable, $${spent.toFixed(4)} spent, ${notRun.length} not run`);

  // --- Tier 2: execution failures only (§2) ---
  const byId = new Map(keep.map((c) => [c.discoveryId, c]));
  const escalate = t1
    .map((r) => ({ r, decision: shouldEscalate(frozen.find((f) => f.discoveryId === r.discoveryId && f.tier === 1)!.result) }))
    .filter((x) => x.decision.escalate);
  console.log(`escalating ${escalate.length} candidates to ${tier2Id} (execution failures only)`);

  process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(tier2));
  const caller2 = callerFor(tier2Id);
  const t2 = await runPool(escalate, Math.max(2, Math.floor(concurrency / 2)), async (x) => {
    if (spent >= BUDGET_STOP_AT_USD) {
      notRun.push({ discoveryId: x.r.discoveryId, sourceSectionRef: x.r.sourceSectionRef, reason: `budget guard during escalation: $${spent.toFixed(2)} spent` });
      return null;
    }
    const rec = await runOne(byId.get(x.r.discoveryId)!, tier2, caller2, 2, x.decision.reason);
    console.log(`  [T2] ${rec.sourceSectionRef} ${rec.status} rules=${rec.rules} (was ${x.decision.reason}) $${spent.toFixed(3)}`);
    return rec;
  });
  const tier2Records = t2.filter((r): r is CandidateRecord => r !== null);
  save("04-tier2", tier2Records);

  // Final per-candidate outcome: the Tier-2 record where one exists, else Tier 1.
  const finalById = new Map<string, CandidateRecord>();
  for (const r of t1) finalById.set(r.discoveryId, r);
  for (const r of tier2Records) finalById.set(r.discoveryId, r);
  const final = [...finalById.values()].sort((a, b) => a.sourceSectionRef.localeCompare(b.sourceSectionRef));

  save("05-final-records", final);
  save("06-frozen-responses", frozen.map((f) => ({ ...f, resultHash: sha256(JSON.stringify(f.result)) })));
  save("07-not-run", notRun);
  save("08-run-meta", {
    tier1Model: tier1Id,
    tier2Model: tier2Id,
    tier1MaxTokens: maxTokensFor(tier1),
    tier2MaxTokens: maxTokensFor(tier2),
    concurrency,
    sealedPopulation: pop.all.length,
    eligible: pop.eligible.length,
    compiled: final.length,
    notRun: notRun.length,
    unresolvedNodeKeys: unresolved,
    budgetCeilingUsd: BUDGET_CEILING_USD,
    actualCostUsd: Number(spent.toFixed(4)),
  });

  console.log(`\nDONE. ${final.length} candidates, ${final.filter((r) => r.status !== "FAILED").length} usable, ${final.reduce((s, r) => s + r.rules, 0)} rules, $${spent.toFixed(4)} actual spend, ${notRun.length} not run.`);
}

void main();
