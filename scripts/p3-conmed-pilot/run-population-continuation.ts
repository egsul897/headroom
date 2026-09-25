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
export const DOCS_DIR = "docs/phase-3-conmed-population-verified";
/** Scratch directory of continuation segment n (segment 1 kept its original name). */
export const continuationScratchDir = (segment: number) => (segment === 1 ? "/tmp/claude-0/pilot/population-continuation" : `/tmp/claude-0/pilot/population-continuation-${segment}`);
/** Preserved continuation segments, in order, as found in docs/ (run-continuation-1, run-continuation-2, ...). */
export function preservedContinuationSegments(docsDir = DOCS_DIR): string[] {
  return fs.readdirSync(docsDir).filter((d) => /^run-continuation-\d+$/.test(d)).sort((a, b) => Number(a.slice(17)) - Number(b.slice(17))).map((d) => path.join(docsDir, d));
}

export interface ContinuationSet {
  priorTerminal: { discoveryId: string; ref: string; source: string }[];
  inFlightUnknown: { discoveryId: string; ref: string; source: string }[];
  skipDiscoveryIds: Set<string>;
  neverAttempted: { discoveryId: string; ref: string; operativeChars: number }[];
  emptySkips: { discoveryId: string; ref: string }[];
  priorSpend: { exactUsd: number; retainedUnknownUsd: number; label: string; breakdown: Record<string, number> };
  segment: number;
}

type SegmentStatus = { discoveryId: string; ref: string; compile: { costUsd: number; costStatus: string }; verify: { costUsd: number; costStatus: string | null } };

/**
 * Derived from the preserved artifacts, never from a hand-written list: the original run plus every
 * preserved continuation segment before this one. A segment killed mid-candidate (container reclaim)
 * contributes its terminal rows, its in-flight candidate (INDETERMINATE: never rerun, one reservation
 * carried) and its own incremental spend.
 */
export function deriveContinuationSet(originalRunDir = ORIGINAL_RUN_DIR, priorSegments: string[] = preservedContinuationSegments()): ContinuationSet {
  const read = (n: string) => JSON.parse(fs.readFileSync(path.join(originalRunDir, n), "utf8"));
  const plan = read("00-plan.json");
  const manifest = read("03-run-manifest.reconstructed.json");
  const validation = JSON.parse(fs.readFileSync(path.join(path.dirname(originalRunDir), "01-run-validation.json"), "utf8"));
  const preflight = read("preflight-health.json");
  const order = plan.order as { discoveryId: string; ref: string; operativeChars: number }[];
  const priorTerminal = (manifest.candidateStatuses as { discoveryId: string; ref: string }[]).map((c) => ({ discoveryId: c.discoveryId, ref: c.ref, source: "original" }));
  const evidenceIds = new Set(fs.readdirSync(path.join(originalRunDir, "evidence")).filter((f) => f.endsWith(".json") && !f.includes("manifest")).map((f) => f.slice(0, -5)));
  for (const t of priorTerminal) if (!evidenceIds.has(t.discoveryId)) throw new Error(`terminal record without evidence: ${t.ref}`);
  if (evidenceIds.size !== priorTerminal.length) throw new Error(`evidence files ${evidenceIds.size} != terminal records ${priorTerminal.length}`);
  const inFlight = manifest.terminated?.inFlightCandidate ?? null;
  const inFlightUnknown: ContinuationSet["inFlightUnknown"] = inFlight ? [{ discoveryId: inFlight.discoveryId, ref: inFlight.ref, source: "original" }] : [];
  // prior spend: the validated ledger of the original run + its in-flight reservation + its pre-flight probes
  // + the possible amendment call from the aborted first launch (unknown billing, conservatively retained)
  const ledger = validation.ledger as { exactUsd: number; timeoutReservationsRetainedUsd: number; inFlightAtTermination: { chargedUsd: number } | null };
  const breakdown: Record<string, number> = {
    originalExactUsd: ledger.exactUsd,
    originalTimeoutReservationsUsd: ledger.timeoutReservationsRetainedUsd,
    originalInFlightReservationUsd: ledger.inFlightAtTermination?.chargedUsd ?? 0,
    originalPreflightProbesUsd: preflight.spendUsd as number,
    abortedFirstLaunchPossibleAmendmentUsd: 0.0004,
  };
  let exactUsd = breakdown.originalExactUsd! + breakdown.originalPreflightProbesUsd!;
  let retainedUnknownUsd = breakdown.originalTimeoutReservationsUsd! + breakdown.originalInFlightReservationUsd! + breakdown.abortedFirstLaunchPossibleAmendmentUsd!;
  // every preserved continuation segment before this one
  for (const [i, dir] of priorSegments.entries()) {
    const seg = `continuation${i + 1}`;
    const rd = (n: string) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
    const sPlan = rd("00-plan.json");
    const sStatuses = rd("01-statuses.json") as SegmentStatus[];
    const sCosts = rd("02-costs.json") as { perRequest: { chargedToBudgetUsd: number; costAccountingStatus: string }[]; sideCalls: { discoveryId: string | null; costUsd: number }[] };
    const sEvidence = new Set(fs.readdirSync(path.join(dir, "evidence")).filter((f) => f.endsWith(".json") && !f.includes("manifest")).map((f) => f.slice(0, -5)));
    if (sEvidence.size !== sStatuses.length) throw new Error(`${seg}: evidence files ${sEvidence.size} != status rows ${sStatuses.length}`);
    for (const s of sStatuses) { if (!sEvidence.has(s.discoveryId)) throw new Error(`${seg}: terminal record without evidence: ${s.ref}`); priorTerminal.push({ discoveryId: s.discoveryId, ref: s.ref, source: seg }); }
    const terminalNow = new Set(priorTerminal.map((t) => t.discoveryId));
    if (!fs.existsSync(path.join(dir, "03-run-manifest.json"))) {
      const sOrder = sPlan.order as { discoveryId: string; ref: string }[];
      const f = sOrder.find((o) => !terminalNow.has(o.discoveryId));
      if (f) inFlightUnknown.push({ discoveryId: f.discoveryId, ref: f.ref, source: seg });
    }
    const segExact = sCosts.perRequest.filter((r) => r.costAccountingStatus === "EXACT").reduce((a, r) => a + r.chargedToBudgetUsd, 0) + sCosts.sideCalls.filter((c) => c.discoveryId === null).reduce((a, c) => a + c.costUsd, 0);
    const segRetained = sCosts.perRequest.filter((r) => r.costAccountingStatus === "UNKNOWN_TIMEOUT_BILLED").reduce((a, r) => a + r.chargedToBudgetUsd, 0);
    const segProbes = fs.existsSync(path.join(dir, "preflight-health.json")) ? (rd("preflight-health.json").spendUsd as number) : 0;
    const segInFlight = inFlightUnknown.some((x) => x.source === seg) ? (sPlan.reservationPerCallUsd as number) : 0;
    breakdown[`${seg}ExactUsd`] = segExact; breakdown[`${seg}TimeoutReservationsUsd`] = segRetained; breakdown[`${seg}InFlightReservationUsd`] = segInFlight; breakdown[`${seg}PreflightProbesUsd`] = segProbes;
    exactUsd += segExact + segProbes; retainedUnknownUsd += segRetained + segInFlight;
  }
  const terminalIds = new Set(priorTerminal.map((t) => t.discoveryId));
  if (terminalIds.size !== priorTerminal.length) throw new Error("a candidate has terminal records in more than one run");
  for (const f of inFlightUnknown) if (terminalIds.has(f.discoveryId)) throw new Error(`in-flight candidate ${f.ref} has a terminal record`);
  const skipDiscoveryIds = new Set<string>([...terminalIds, ...inFlightUnknown.map((f) => f.discoveryId)]);
  const neverAttempted = order.filter((o) => !skipDiscoveryIds.has(o.discoveryId));
  if (priorTerminal.length + inFlightUnknown.length + neverAttempted.length !== plan.attemptable) throw new Error("continuation set does not reconcile to the attemptable population");
  return {
    priorTerminal, inFlightUnknown, skipDiscoveryIds, neverAttempted,
    emptySkips: (plan.skippedEmpty as { discoveryId: string; ref: string }[]).map((s) => ({ discoveryId: s.discoveryId, ref: s.ref })),
    priorSpend: { exactUsd, retainedUnknownUsd, label: `original run (validated ledger) + in-flight reservation + pre-flight probes + possible aborted-launch amendment call + ${priorSegments.length} preserved continuation segment(s)`, breakdown },
    segment: priorSegments.length + 1,
  };
}

/**
 * The runner's OUT is fixed at module load, and ES imports are hoisted above any statement in this
 * file - so the output directory is set in the environment FIRST and the runner is imported
 * dynamically afterwards. The continuation must never write into the original run's directory or
 * into an earlier segment's.
 */
export async function runContinuation(argv: string[]) {
  const set = deriveContinuationSet();
  const out = continuationScratchDir(set.segment);
  if (fs.existsSync(path.join(out, "01-statuses.json"))) throw new Error(`refusing to run: ${out} already holds a segment's output`);
  process.env.CONMED_RUN_OUT = out;
  const runner = await import("./run-population-verified");
  if ((runner.OUT as string) !== out || (runner.OUT as string) === ORIGINAL_SCRATCH_DIR) throw new Error(`refusing to run: runner output directory is ${runner.OUT}`);
  console.log(JSON.stringify({ out: runner.OUT, segment: set.segment, priorTerminal: set.priorTerminal.length, inFlightUnknown: set.inFlightUnknown, neverAttempted: set.neverAttempted.length, skip: set.skipDiscoveryIds.size, priorSpend: set.priorSpend }, null, 1));
  return runner.main(argv, { skipDiscoveryIds: set.skipDiscoveryIds, priorSpend: set.priorSpend, flushEvery: 1, runLabel: `conmed-continuation-${set.segment}` });
}

if (process.argv[1]?.endsWith("run-population-continuation.ts")) void runContinuation(process.argv.slice(2));
