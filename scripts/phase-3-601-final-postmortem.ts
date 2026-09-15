/**
 * PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN - post-mortem ledger reconstruction (zero model calls).
 *
 * The certified paid run (scripts/phase-3-601-final-run.ts) was SIGKILLed by a session-worker/container
 * restart at ~15:02 UTC on 2026-09-15, during Pass A pass 2 (batch 5 of 6 in flight). The run's own
 * ledger writer never executed, so artifacts 50-57 are reconstructed here from the two durable traces the
 * guard wrote synchronously during the run:
 *   - guard-state.ndjson : one line per admission check (spent BEFORE each call, remaining work, balance)
 *   - run.log            : the run's stdout, one [cost] line per COMPLETED call with real token counts
 * plus one gateway balance read after the kill. Every figure below is derived from those files; nothing is
 * estimated. Run: npx tsx scripts/phase-3-601-final-postmortem.ts
 */
import { readFileSync } from "node:fs";
import { gatewayCredits, loadGatewayKey, writeJson } from "./f7b-lib";
import { CAP_USD, OUT, PRIOR, RAW } from "./phase-3-601-final-certify";

interface GuardLine { at: string; stage: string; spent: number; passABatchesRemaining: number; passAGapRemaining: number; passBTokensRemaining: number; conservativeRemaining: number; capRemaining: number; balanceRemaining: number }

(async () => {
  loadGatewayKey();
  const guardLines: GuardLine[] = readFileSync(`${RAW}/guard-state.ndjson`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const log = readFileSync(`${RAW}/run.log`, "utf8").split("\n");
  const costLines = log.filter((l) => l.includes("[cost]"));
  const modelLine = log.find((l) => l.includes("models: inventory=")) ?? "";
  const model = /inventory=(\S+)/.exec(modelLine)?.[1] ?? null;
  const balanceBefore = Number(/balance \$([0-9.]+)/.exec(modelLine)?.[1] ?? "0");

  // Completed call k (1-based) was admitted by guard line k-1 and its cost is spent[k] - spent[k-1]; guard line k
  // (the NEXT admission check) is the first durable timestamp after the call returned.
  const calls = costLines.map((l, i) => {
    const m = /\[cost\] (\S+): in=(\d+) out=(\d+) \+\$([0-9.]+) \(spent \$([0-9.]+)/.exec(l)!;
    const before = guardLines[i]!, after = guardLines[i + 1];
    return { n: i + 1, stage: m[1]!, model, inputTokens: Number(m[2]), outputTokens: Number(m[3]), cacheRead: null, cacheWrite: null, costUsd: +(after ? after.spent - before.spent : Number(m[4])).toFixed(6), conservativeRemainingBeforeUsd: +before.conservativeRemaining.toFixed(4), admittedAt: before.at, completedBy: after?.at ?? null };
  });
  const spent = calls.reduce((a, c) => a + c.costUsd, 0);
  const lastCheck = guardLines[guardLines.length - 1]!;
  const inFlight = guardLines.length > calls.length ? { stage: lastCheck.stage, admittedAt: lastCheck.at, spentBefore: +lastCheck.spent.toFixed(6), conservativeRemainingBefore: +lastCheck.conservativeRemaining.toFixed(4), completed: false } : null;
  const credits = await gatewayCredits();
  const balanceAfter = credits ? Number(credits.balance) : null;
  const gatewaySpend = balanceAfter === null ? null : +(balanceBefore - balanceAfter).toFixed(6);
  const inFlightBilled = gatewaySpend === null ? null : Math.abs(gatewaySpend - spent) > 1e-6;
  const inFlightBilledUsd = inFlightBilled ? +(gatewaySpend! - spent).toFixed(6) : 0;
  // Money actually left the account: the gateway figure is authoritative when readable (it includes the in-flight call
  // that the provider completed and billed after the client process died).
  const actualSpend = gatewaySpend ?? spent;
  const byPrefix = (p: string) => +calls.filter((c) => c.stage.startsWith(p)).reduce((a, c) => a + c.costUsd, 0).toFixed(6);
  const count = (p: string) => calls.filter((c) => c.stage.startsWith(p)).length;
  const p1Batch = count("passA-1:semantic_inventory") - count("passA-1:semantic_inventory_gap"), p1Gap = count("passA-1:semantic_inventory_gap");
  const p2Batch = count("passA-2:semantic_inventory") - count("passA-2:semantic_inventory_gap"), p2Gap = count("passA-2:semantic_inventory_gap");
  const at = new Date().toISOString();
  const kill = { event: "session worker / container restart", signalObserved: "SIGKILL (background task exit code 137)", lastDurableWriteAt: lastCheck.at, hostUptimeUnbroken: true, note: "the host did not reboot (uptime continuous); the harness worker process was restarted and its child processes, including the paid run, were killed. Nothing in the run, the guard or production raised or returned." };
  const stopReason = `run process killed by ${kill.event} during Pass A pass 2 (${p2Batch} of 6 batch calls completed, batch ${p2Batch + 1} in flight); Pass A never returned, so no inventory existed to persist`;

  const lostPass1 = { batches: p1Batch, gapCalls: p1Gap, costUsd: byPrefix("passA-1"), state: "completed inside runDualPassSemanticInventory and held only in process memory; the ensemble-level persistAndReload (HD-3 closure) runs after BOTH passes return, so pass 1 was never written" };
  writeJson(`${OUT}/50-final-clean-pass-a-ledger.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §8/§9 - fresh DUAL_PASS_ENSEMBLE Pass A (RECONSTRUCTED POST-MORTEM: run killed before Pass A returned)", at, reconstructedBy: "scripts/phase-3-601-final-postmortem.ts from guard-state.ndjson + run.log", freshExecution: true, historicalInventoryReused: false, completed: false, killed: kill,
    pass1: { calls: p1Batch + p1Gap, batches: p1Batch, gapCalls: p1Gap, costUsd: byPrefix("passA-1"), completedAllCalls: p1Batch === 6 && p1Gap === 1, items: null, inventoryStatus: null, inventoryStatusReason: "pass 1 finished its 6 batch calls and 1 gap call; its inventory object was in memory only and was lost with the process", sourceCoverage: null, frozenContentHash: null },
    pass2: { calls: p2Batch + p2Gap, batches: p2Batch, gapCalls: p2Gap, costUsd: byPrefix("passA-2"), completedAllCalls: false, items: null, inventoryStatus: null, inventoryStatusReason: `pass 2 completed ${p2Batch} of 6 batch calls; batch ${p2Batch + 1} was in flight at the kill`, inFlightCall: inFlight, frozenContentHash: null },
    ensembleBuilt: false, ensembleRefusal: null, authoritative: null, ensemble: null, lostWork: { pass1: lostPass1, pass2PartialCostUsd: byPrefix("passA-2"), inFlightCallBilledUsd: inFlightBilledUsd, totalLostUsd: +actualSpend.toFixed(6) } });

  writeJson(`${OUT}/51-final-clean-persistence-proof.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §10 - durable persistence and reload proof (NOT PERFORMED)", at, performed: false, persistenceOk: false, reason: "persistAndReload runs the instant runDualPassSemanticInventory returns; it never returned. The HD-3 closure (persist before any gate) was certified at zero cost in 48 and was not reached in the paid run.", frozenInventory: null, passes: null,
    persistenceGranularityObservation: { id: "HD-4 (candidate)", classification: "environment-caused loss, harness-amplified", statement: "The HD-3 closure persists at ENSEMBLE granularity (after both passes). It cannot protect against a process kill during Pass A itself. Pass 1 (7 calls, $" + lostPass1.costUsd.toFixed(4) + ") had completed and would have survived under per-pass or per-call persistence of raw provider responses, which a replaying StageCaller could then feed back into the production runDualPassSemanticInventory at zero cost. This is a design observation for the next mission, not a defect in any gate: no gate refused, no gate mis-fired, and production behaved correctly up to the kill." } });

  writeJson(`${OUT}/52-final-clean-resume-proof.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §11 - F-7C.1 resume proof on the RELOADED inventory (NOT PERFORMED)", at, performed: false, decision: null, reason: "no persisted inventory exists (51)" });
  writeJson(`${OUT}/53-final-clean-real-plan.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §12/§13 - real shard plan and cost recheck on the RELOADED inventory (NOT PERFORMED)", at, performed: false, fits: null, recheck: null, reason: "no persisted inventory exists (51); the pre-run plan over the synthetic-free inventory is in 49" });

  writeJson(`${OUT}/54-final-clean-paid-ledger.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §7 - paid ledger (RECONSTRUCTED POST-MORTEM)", at, reconstructedBy: "scripts/phase-3-601-final-postmortem.ts", reconstructionSources: [`${RAW}/guard-state.ndjson (${guardLines.length} admission checks)`, `${RAW}/run.log (${calls.length} completed-call cost lines)`, "one gateway /v1/credits read after the kill"], startedAt: guardLines[0]!.at, killedAfter: lastCheck.at, capUsd: CAP_USD, paidCalls: calls.length + (inFlightBilled ? 1 : 0), completedCalls: calls.length, spendUsd: +actualSpend.toFixed(6), spendBasis: gatewaySpend === null ? "guard ledger (gateway unreadable)" : "gateway-reported balance delta (authoritative; includes the in-flight call billed after the kill)", guardLedgerSpendUsd: +spent.toFixed(6),
    costBreakdown: { passAPass1Usd: byPrefix("passA-1"), passAPass2Usd: +(byPrefix("passA-2") + inFlightBilledUsd).toFixed(6), passAPass2CompletedCallsUsd: byPrefix("passA-2"), passAPass2InFlightBilledUsd: inFlightBilledUsd, passBUsd: 0, conditionSuspicionUsd: 0, semanticReviewUsd: 0, providerRetriesUsd: 0, totalUsd: +actualSpend.toFixed(6) },
    callCounts: { passA1: p1Batch + p1Gap, passA2: p2Batch + p2Gap + (inFlightBilled ? 1 : 0), passA2Completed: p2Batch + p2Gap, compileTurns: 0, conditionSuspicion: 0, semanticReview: 0 },
    gatewayBalanceBefore: balanceBefore, gatewayBalanceAfter: balanceAfter, gatewayReportedSpendUsd: gatewaySpend, gatewayMatchesGuardLedger: gatewaySpend !== null && Math.abs(gatewaySpend - spent) < 1e-6,
    inFlightCallAtKill: inFlight ? { ...inFlight, billedByGateway: inFlightBilled, billedUsd: inFlightBilledUsd, evidence: gatewaySpend === null ? "gateway unreadable" : `gateway-reported spend $${gatewaySpend} ${inFlightBilled ? "exceeds" : "equals"} the guard ledger $${spent.toFixed(6)} for the 11 completed calls${inFlightBilled ? `; the difference $${inFlightBilledUsd} is the batch call the provider completed and billed after the client process died (balance read 15:04:45Z showed no charge yet; a later read shows it)` : ""}` } : null,
    guardRefusals: [], guardStateLog: `${RAW}/guard-state.ndjson`, runLog: `${RAW}/run.log`, calls, capNeverExceeded: actualSpend <= CAP_USD, everyCallAdmittedUnderConservativeRule: guardLines.every((g) => g.conservativeRemaining <= g.capRemaining && g.conservativeRemaining <= g.balanceRemaining),
    stoppedEarly: true, stopVerdict: "PHASE3_601_ENVIRONMENT_BLOCKED", stopReason, costBoundDuringRun: false, killed: kill,
    rerunNotAttempted: { reason: "a fresh end-to-end run needs the full conservative estimate ($" + Number(JSON.parse(readFileSync(`${OUT}/49-final-clean-cost-preflight.json`, "utf8")).estimates.conservative.totalUsd).toFixed(4) + ") which no longer fits the cap remaining ($" + (CAP_USD - actualSpend).toFixed(4) + "); §7 forbids starting work that cannot finish under the cap, and no partial output exists to resume from" },
    priorSpend: PRIOR, cumulativeSection601SpendUsd: +(PRIOR.cumulativeUsd + actualSpend).toFixed(6) });

  writeJson(`${OUT}/55-final-clean-production-compile.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §14/§15/§17/§20 - production compileCovenantToIR over the RELOADED inventory (NOT INVOKED)", at, entryPoint: "compileCovenantToIR", invoked: false, frozenInventorySource: null, passARerunAttemptedByProduction: false, priorShardResultsSupplied: false, shardExecutorOverridden: false, status: null, failureReasons: null, errorDetail: null, compileError: null, costBoundDuringRun: false, costUsd: 0, execution: null, resumeMetadata: null, planComparison: null, perShardPersistence: [], output: null, provider: null, model: null, rawEvidence: null, reason: "run killed before Pass A returned (54)" });
  writeJson(`${OUT}/56-final-clean-pass-c.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §19 - global Pass C (NOT PRODUCED)", at, present: false, semanticallyComplete: null, inventoryStatusCarried: null, counts: null, reasons: null, supportSummary: null, items: null, reason: "compile not invoked (55)" });
  writeJson(`${OUT}/57-final-clean-verifier.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §22 - independent verifier (NOT RUN)", at, ranOnUntouchedProductionOutput: false, routingForced: false, status: null, verifyError: "not run - no compiled unit exists (55)", semanticReviewInvoked: null, conditionSuspicion: null, findings: null, findingCounts: null, callCounts: { semanticReview: 0, conditionSuspicion: 0 }, costUsd: 0, rawEvidence: null });

  console.log(JSON.stringify({ completedCalls: calls.length, guardLedgerSpend: +spent.toFixed(6), actualSpend: +actualSpend.toFixed(6), gatewaySpend, inFlightBilledUsd, inFlight, inFlightBilled, pass1: { p1Batch, p1Gap, usd: byPrefix("passA-1") }, pass2: { p2Batch, p2Gap, usd: byPrefix("passA-2") }, balanceBefore, balanceAfter, capRemaining: +(CAP_USD - actualSpend).toFixed(6) }, null, 1));
})();
