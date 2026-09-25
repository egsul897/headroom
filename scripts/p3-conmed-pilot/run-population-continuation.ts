/**
 * CONMED population CONTINUATION - remaining candidates only, same pipeline, same budget.
 *
 * The original run (docs/phase-3-conmed-population-verified/run-original) attempted 104 of 133 candidates
 * before a container restart killed it with one candidate in flight. This entry point derives the
 * skip set FROM THOSE ARTIFACTS - every candidate with a terminal record plus the in-flight one -
 * and runs the unchanged runner over what remains, with the original run's accounted spend seeded
 * into the ledger so the same $3.50 ceiling and STOP_AT govern the whole population.
 *
 * Nothing about model, timeout, concurrency, retry, verification or persistence changes. The two
 * authorized harness changes are durability only: a flush after every terminal candidate, and a
 * detached launch (done by the caller with nohup/setsid; this file has no opinion about it).
 *
 * The in-flight candidate is NOT rerun: no local trace of its request exists, so its provider-side
 * completion is indeterminate and the one-attempt policy wins. It stays IN_FLIGHT_UNKNOWN with its
 * reservation carried forward.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";

export const ORIGINAL_RUN_DIR = "docs/phase-3-conmed-population-verified/run-original";
export const ORIGINAL_SCRATCH_DIR = "/tmp/claude-0/pilot/population-verified";
export const CONTINUATION_SCRATCH_DIR = "/tmp/claude-0/pilot/population-continuation";

export interface ContinuationSet {
  priorTerminal: { discoveryId: string; ref: string }[];
  inFlightUnknown: { discoveryId: string; ref: string } | null;
  skipDiscoveryIds: Set<string>;
  neverAttempted: { discoveryId: string; ref: string; operativeChars: number }[];
  emptySkips: { discoveryId: string; ref: string }[];
  priorSpend: { exactUsd: number; retainedUnknownUsd: number; label: string; breakdown: Record<string, number> };
}

/** Derived from the preserved artifacts, never from a hand-written list. */
export function deriveContinuationSet(originalRunDir = ORIGINAL_RUN_DIR): ContinuationSet {
  const read = (n: string) => JSON.parse(fs.readFileSync(path.join(originalRunDir, n), "utf8"));
  const plan = read("00-plan.json");
  const manifest = read("03-run-manifest.reconstructed.json");
  const validation = JSON.parse(fs.readFileSync(path.join(path.dirname(originalRunDir), "01-run-validation.json"), "utf8"));
  const preflight = read("preflight-health.json");
  const order = plan.order as { discoveryId: string; ref: string; operativeChars: number }[];
  const priorTerminal = (manifest.candidateStatuses as { discoveryId: string; ref: string }[]).map((c) => ({ discoveryId: c.discoveryId, ref: c.ref }));
  const evidenceIds = new Set(fs.readdirSync(path.join(originalRunDir, "evidence")).filter((f) => f.endsWith(".json") && !f.includes("manifest")).map((f) => f.slice(0, -5)));
  for (const t of priorTerminal) if (!evidenceIds.has(t.discoveryId)) throw new Error(`terminal record without evidence: ${t.ref}`);
  if (evidenceIds.size !== priorTerminal.length) throw new Error(`evidence files ${evidenceIds.size} != terminal records ${priorTerminal.length}`);
  const terminalIds = new Set(priorTerminal.map((t) => t.discoveryId));
  const inFlight = manifest.terminated?.inFlightCandidate ?? null;
  if (inFlight && terminalIds.has(inFlight.discoveryId)) throw new Error("in-flight candidate has a terminal record");
  const skipDiscoveryIds = new Set<string>([...terminalIds, ...(inFlight ? [inFlight.discoveryId] : [])]);
  const neverAttempted = order.filter((o) => !skipDiscoveryIds.has(o.discoveryId));
  if (priorTerminal.length + (inFlight ? 1 : 0) + neverAttempted.length !== plan.attemptable) throw new Error("continuation set does not reconcile to the attemptable population");
  // prior spend: the validated ledger of the original run + its in-flight reservation + its pre-flight probes
  // + the possible amendment call from the aborted first launch (unknown billing, conservatively retained)
  const ledger = validation.ledger as { exactUsd: number; timeoutReservationsRetainedUsd: number; inFlightAtTermination: { chargedUsd: number } | null };
  const abortedLaunchPossibleAmendmentUsd = 0.0004;
  const breakdown = {
    originalExactUsd: ledger.exactUsd,
    originalTimeoutReservationsUsd: ledger.timeoutReservationsRetainedUsd,
    originalInFlightReservationUsd: ledger.inFlightAtTermination?.chargedUsd ?? 0,
    originalPreflightProbesUsd: preflight.spendUsd as number,
    abortedFirstLaunchPossibleAmendmentUsd: abortedLaunchPossibleAmendmentUsd,
  };
  const exactUsd = breakdown.originalExactUsd + breakdown.originalPreflightProbesUsd;
  const retainedUnknownUsd = breakdown.originalTimeoutReservationsUsd + breakdown.originalInFlightReservationUsd + abortedLaunchPossibleAmendmentUsd;
  return {
    priorTerminal, inFlightUnknown: inFlight ? { discoveryId: inFlight.discoveryId, ref: inFlight.ref } : null, skipDiscoveryIds, neverAttempted,
    emptySkips: (plan.skippedEmpty as { discoveryId: string; ref: string }[]).map((s) => ({ discoveryId: s.discoveryId, ref: s.ref })),
    priorSpend: { exactUsd, retainedUnknownUsd, label: "original run (validated ledger) + in-flight reservation + pre-flight probes + possible aborted-launch amendment call", breakdown },
  };
}

/**
 * The runner's OUT is fixed at module load, and ES imports are hoisted above any statement in this
 * file - so the output directory is set in the environment FIRST and the runner is imported
 * dynamically afterwards. The continuation must never write into the original run's directory.
 */
export async function runContinuation(argv: string[]) {
  process.env.CONMED_RUN_OUT = CONTINUATION_SCRATCH_DIR;
  const runner = await import("./run-population-verified");
  if ((runner.OUT as string) !== CONTINUATION_SCRATCH_DIR || (runner.OUT as string) === ORIGINAL_SCRATCH_DIR) throw new Error(`refusing to run: runner output directory is ${runner.OUT}`);
  const set = deriveContinuationSet();
  console.log(JSON.stringify({ out: runner.OUT, priorTerminal: set.priorTerminal.length, inFlightUnknown: set.inFlightUnknown, neverAttempted: set.neverAttempted.length, skip: set.skipDiscoveryIds.size, priorSpend: set.priorSpend }, null, 1));
  return runner.main(argv, { skipDiscoveryIds: set.skipDiscoveryIds, priorSpend: set.priorSpend, flushEvery: 1, runLabel: "conmed-continuation" });
}

if (process.argv[1]?.endsWith("run-population-continuation.ts")) void runContinuation(process.argv.slice(2));
