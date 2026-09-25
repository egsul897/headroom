/**
 * CONMED population CONTINUATION - end-of-run validation, additive preservation and the consolidated
 * population manifest. Zero paid calls.
 *
 * validateContinuation()
 *   1. secret-scans every file of the continuation scratch output (a hit is a hard failure);
 *   2. re-parses every verified-unit package, re-checking package and artifact hashes;
 *   3. reconciles: every attempted candidate is on the continuation's dispatch list and NONE is in
 *      its skip set (no prior candidate re-attempted); log rows == status rows (the per-candidate
 *      flush means nothing has to be recovered - if the process died, the in-flight candidate is
 *      the first undispatched one and is charged a reservation, never $0); the cumulative ledger
 *      equals the seeded prior spend + this run's own charges (no double counting);
 *   4. records every new P-1 occurrence (verifier finding bound to no compiled unit) by candidate;
 *   5. copies the scratch directory verbatim into docs/ and verifies the copy by sha256.
 *
 * consolidatePopulation()
 *   Merges the original run and the continuation into ONE manifest that names all 135 dedup
 *   candidates exactly once: a terminal attempt (original or continuation), EMPTY_OPERATIVE_TEXT,
 *   IN_FLIGHT_UNKNOWN, or NEVER_ATTEMPTED if the continuation itself was partial. Costs are merged
 *   from labelled components; the interrupted request is counted once (its reservation) and the
 *   continuation ledger's seeded prior is subtracted before its own charges are added.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseVerifiedUnitPackage } from "../../lib/contract-model/verified-units";
import { scanForSecrets } from "./evidence";
import { continuationScratchDir, DOCS_DIR, ORIGINAL_RUN_DIR, preservedContinuationSegments } from "./run-population-continuation";

export const continuationDest = (segment: number) => path.join(DOCS_DIR, `run-continuation-${segment}`);
const sha256File = (p: string) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const walk = (dir: string, out: string[] = []): string[] => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, out); else out.push(f); } return out; };
const BENCHMARK_REFS = ["7.1", "7.2", "7.10", "7.2(c)", "7.11", "7.13", "7.14", "7.16", "7.17"];
export const bandOf = (n: number) => (n === 0 ? "EMPTY" : n <= 776 ? "SHORT" : n < 1886 ? "MID" : "LONG");
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const r6 = (x: number) => Number(x.toFixed(6));

type Status = { discoveryId: string; ref: string; operativeChars: number; compile: { outcome: string; status: string; failureReasons: string[]; wallClockMs: number | null; inputTokens: number | null; outputTokens: number | null; costUsd: number; costStatus: string }; verify: { outcome: string; status: string | null; semanticReviewInvoked: boolean | null; findings: number | null; sideCalls: { stage: string; costUsd: number }[]; costUsd: number; costStatus: string | null; wallClockMs: number | null }; package: { complete: boolean; artifactsPersisted: number; unitsMissingVerification: number; problems: string[]; packageHash: string; file: string | null } | null; evidenceFile: string | null; committedUsd: number };

export interface P1Occurrence { candidate: string; discoveryId: string; findingId: string; findingType: string; materiality: string; suppliedRuleOrDefinitionId: string; irPath: string | null; compiledUnitIds: string[]; binding: "UNBOUND_NO_SUCH_UNIT"; packageComplete: boolean; packageProblems: string[] }

export function validateContinuation(segment: number, scratch = continuationScratchDir(segment), dest = continuationDest(segment)) {
  const read = (n: string) => JSON.parse(fs.readFileSync(path.join(scratch, n), "utf8"));
  const problems: string[] = [];
  const files = walk(scratch).sort();

  // 1. secrets
  const secretHits = files.flatMap((f) => scanForSecrets(fs.readFileSync(f, "utf8")).map((h) => `${path.relative(scratch, f)}: ${h.pattern}`));
  if (secretHits.length > 0) throw new Error(`SECRET LEAK - refusing to preserve: ${secretHits.join("; ")}`);

  // 2. packages
  const packageFiles = files.filter((f) => f.endsWith(".verified-units.json"));
  const packages = packageFiles.map((f) => { try { return { file: path.relative(scratch, f), pkg: parseVerifiedUnitPackage(fs.readFileSync(f, "utf8")) }; } catch (e) { problems.push(`package ${path.relative(scratch, f)}: ${(e as Error).message}`); return null; } }).filter((x): x is NonNullable<typeof x> => x !== null);

  // 3. reconciliation
  const plan = read("00-plan.json");
  // health probes: at most two for the whole continuation; a relaunched segment carries none of its own
  const preflight = fs.existsSync(path.join(scratch, "preflight-health.json")) ? read("preflight-health.json") : null;
  const statuses = read("01-statuses.json") as Status[];
  const costs = read("02-costs.json") as { snapshot: Record<string, number>; perRequest: { discoveryId: string; stage: string; chargedToBudgetUsd: number; costAccountingStatus: string }[]; sideCalls: { discoveryId: string | null; stage: string; costUsd: number }[] };
  const checkpoint = read("03-run-manifest.checkpoint.json") as { attempted: number; toDispatch: number; committedUsd: number; lastCandidate: string | null };
  const terminatedNormally = fs.existsSync(path.join(scratch, "03-run-manifest.json"));
  const runManifest = terminatedNormally ? read("03-run-manifest.json") : null;
  const log = fs.readFileSync(path.join(scratch, "run.log"), "utf8");
  const logRows = [...log.matchAll(/\[(\d+)\/(\d+)\] (\S+)\s+compile=(\S+)\s+verify=(\S+)\s+pkg=(\S+)\s+committed=\$([\d.]+)/g)].map((m) => ({ n: Number(m[1]), of: Number(m[2]), ref: m[3]!, compile: m[4]!, verify: m[5]!, pkg: m[6]!, committed: Number(m[7]) }));
  const order = plan.order as { discoveryId: string; ref: string; operativeChars: number }[];
  const skip = new Set((plan.skippedPriorAttempts as { discoveryId: string }[]).map((s) => s.discoveryId));
  const prior = plan.priorSpend as { exactUsd: number; retainedUnknownUsd: number };
  if (plan.flushEvery !== 1) problems.push(`plan flushEvery ${plan.flushEvery} != 1`);
  if (plan.toDispatch !== order.length) problems.push("plan toDispatch != order length");
  const ids = statuses.map((s) => s.discoveryId);
  if (new Set(ids).size !== ids.length) problems.push("duplicate candidate rows");
  const planned = new Set(order.map((o) => o.discoveryId));
  for (const id of ids) { if (!planned.has(id)) problems.push(`attempted candidate not on the dispatch list: ${id}`); if (skip.has(id)) problems.push(`PRIOR CANDIDATE RE-ATTEMPTED: ${id}`); }
  const attemptedSet = new Set(ids);
  // dispatch is in plan order, so the attempted rows must be a prefix of the order
  for (let i = 0; i < statuses.length; i++) if (order[i]?.discoveryId !== statuses[i]!.discoveryId) problems.push(`row ${i + 1} (${statuses[i]!.ref}) is out of dispatch order`);
  const inFlight = terminatedNormally ? null : (order.find((o) => !attemptedSet.has(o.discoveryId)) ?? null);
  const notAttempted = order.filter((o) => !attemptedSet.has(o.discoveryId) && o.discoveryId !== inFlight?.discoveryId);
  if (statuses.length + (inFlight ? 1 : 0) + notAttempted.length !== order.length) problems.push("attempted + in-flight + not attempted != toDispatch");
  if (logRows.length !== statuses.length) problems.push(`log rows ${logRows.length} != status rows ${statuses.length} (per-candidate flush should make these equal)`);
  for (const [i, row] of logRows.entries()) { const s = statuses[i]; if (!s || s.ref !== row.ref || s.compile.outcome !== row.compile || s.verify.outcome !== row.verify || !near(s.committedUsd, row.committed, 0.0001)) problems.push(`log row ${row.n} disagrees with status row`); }
  if (checkpoint.attempted !== statuses.length) problems.push(`checkpoint attempted ${checkpoint.attempted} != status rows ${statuses.length}`);
  if (checkpoint.lastCandidate !== (statuses[statuses.length - 1]?.ref ?? null)) problems.push("checkpoint lastCandidate != last status row");
  if (runManifest && runManifest.attempted !== statuses.length) problems.push("final manifest attempted != status rows");
  if (runManifest && JSON.stringify(runManifest.candidateStatuses.map((c: { discoveryId: string }) => c.discoveryId)) !== JSON.stringify(ids)) problems.push("final manifest candidate list != status rows");

  // ledger: cumulative = seeded prior + amendment + this run's per-request charges (+ outstanding if died mid-call)
  const perExact = costs.perRequest.filter((r) => r.costAccountingStatus === "EXACT").reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const perRetained = costs.perRequest.filter((r) => r.costAccountingStatus === "UNKNOWN_TIMEOUT_BILLED").reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const amendmentUsd = costs.sideCalls.filter((c) => c.discoveryId === null).reduce((s, c) => s + c.costUsd, 0);
  const snap = costs.snapshot;
  if (!near(snap.committedUsd!, snap.exactSpendUsd! + snap.retainedUnknownTimeoutUsd! + (snap.outstandingReservedUsd ?? 0))) problems.push("ledger: committed != exact + retained + outstanding");
  if (!near(snap.exactSpendUsd!, prior.exactUsd + amendmentUsd + perExact, 2e-6)) problems.push(`ledger: exact ${snap.exactSpendUsd} != prior exact ${prior.exactUsd} + amendment ${amendmentUsd} + per-request exact ${perExact}`);
  if (!near(snap.retainedUnknownTimeoutUsd!, prior.retainedUnknownUsd + perRetained, 2e-6)) problems.push(`ledger: retained ${snap.retainedUnknownTimeoutUsd} != prior retained ${prior.retainedUnknownUsd} + per-request retained ${perRetained}`);
  const statusCharges = statuses.reduce((s, x) => s + x.compile.costUsd + x.verify.costUsd, 0);
  if (!near(statusCharges, perExact + perRetained)) problems.push(`status charges ${statusCharges} != per-request ${perExact + perRetained}`);
  if (statuses.length > 0 && !near(statuses[statuses.length - 1]!.committedUsd, snap.committedUsd!)) problems.push("last row's committed != ledger snapshot committed");
  if ((snap.outstandingReservedUsd ?? 0) > 0 && terminatedNormally) problems.push("outstanding reservation after normal termination");
  const reservation = plan.reservationPerCallUsd as number;
  const ledger = {
    source: terminatedNormally ? "final ledger snapshot (flushed after the last candidate)" : `ledger snapshot flushed after row ${statuses.length}; the in-flight candidate charged one reservation`,
    seededPrior: { exactUsd: prior.exactUsd, retainedUnknownUsd: prior.retainedUnknownUsd },
    thisRun: { amendmentUsd: r6(amendmentUsd), exactUsd: r6(amendmentUsd + perExact), timeoutReservationsRetainedUsd: r6(perRetained), committedUsd: r6(amendmentUsd + perExact + perRetained), inFlightReservationUsd: inFlight ? reservation : 0, committedIncludingInFlightUsd: r6(amendmentUsd + perExact + perRetained + (inFlight ? reservation : 0)), preflightProbesUsd: (preflight?.spendUsd as number | undefined) ?? 0 },
    cumulative: { exactUsd: snap.exactSpendUsd, timeoutReservationsRetainedUsd: snap.retainedUnknownTimeoutUsd, committedUsd: snap.committedUsd, committedIncludingInFlightUsd: r6(snap.committedUsd! + (inFlight ? reservation : 0)), ceilingUsd: plan.ceilingUsd, stopAtUsd: plan.stopAtUsd },
    inFlightAtTermination: inFlight ? { ...inFlight, billing: "UNKNOWN - dispatched, process died before any result; charged one full reservation (never $0)", chargedUsd: reservation } : null,
    budgetStopTriggered: log.includes("BUDGET STOP") || log.includes("STOP_AT"),
  };
  if (!near(ledger.cumulative.committedUsd!, prior.exactUsd + prior.retainedUnknownUsd + ledger.thisRun.committedUsd + (snap.outstandingReservedUsd ?? 0), 2e-6)) problems.push("cumulative committed != seeded prior + this run (double counting?)");
  if (ledger.cumulative.committedIncludingInFlightUsd > plan.ceilingUsd) problems.push("ceiling exceeded");
  // every recorded side call belongs to a status row, the amendment pipeline, or the in-flight candidate
  const sideAttributed = statuses.reduce((s, x) => s + x.verify.sideCalls.length, 0) + costs.sideCalls.filter((c) => c.discoveryId === null).length + (inFlight ? costs.sideCalls.filter((c) => c.discoveryId === inFlight.discoveryId).length : 0);
  if (sideAttributed !== costs.sideCalls.length) problems.push(`side calls ${costs.sideCalls.length} but attributed ${sideAttributed}`);
  for (const c of costs.sideCalls) if (c.discoveryId !== null && !attemptedSet.has(c.discoveryId) && c.discoveryId !== inFlight?.discoveryId) problems.push(`side call for an unknown candidate ${c.discoveryId}`);

  // packages vs statuses vs manifest
  const pkgByHash = new Map(packages.map((p) => [p.pkg.packageHash, p]));
  const evidenceById = new Map<string, string>();
  for (const f of files) if (f.startsWith(path.join(scratch, "evidence")) && f.endsWith(".json") && !f.includes("verified-units")) evidenceById.set(path.basename(f, ".json"), f);
  if (evidenceById.size !== statuses.length) problems.push(`evidence files ${evidenceById.size} != status rows ${statuses.length}`);
  for (const s of statuses) {
    if (!s.evidenceFile || !fs.existsSync(s.evidenceFile)) { problems.push(`status ${s.ref}: evidence file missing`); continue; }
    const ev = JSON.parse(fs.readFileSync(s.evidenceFile, "utf8"));
    if (ev.candidateRef !== s.discoveryId) problems.push(`status ${s.ref}: evidence candidateRef mismatch`);
    if (s.compile.outcome === "COMPLETED" && (!("rawModelOutput" in ev.compilation) || !Array.isArray(ev.compilation.toolCallLog))) problems.push(`status ${s.ref}: forensic fields missing`);
    if (s.package) {
      const p = pkgByHash.get(s.package.packageHash);
      if (s.package.file !== null && !p) problems.push(`status ${s.ref}: package hash not found on disk`);
      if (p && p.pkg.complete !== s.package.complete) problems.push(`status ${s.ref}: completeness disagrees with package on disk`);
      if (s.package.file !== null && ev.verifiedUnits?.packageHash !== s.package.packageHash) problems.push(`status ${s.ref}: evidence pointer does not match package`);
      if (s.compile.outcome !== "COMPLETED" && s.package.complete) problems.push(`status ${s.ref}: compile ${s.compile.outcome} but package complete`);
      if (s.verify.outcome !== "COMPLETED" && s.package.complete) problems.push(`status ${s.ref}: verify ${s.verify.outcome} but package complete`);
      if (s.compile.outcome === "COMPLETED" && s.verify.outcome === "COMPLETED" && s.package.file === null) problems.push(`status ${s.ref}: compiled and verified but no package file`);
    } else if (s.compile.outcome === "COMPLETED") problems.push(`status ${s.ref}: compiled but no package record`);
  }
  const vuManifest = read("evidence/verified-units-manifest.json");
  const vuCandidates = vuManifest.candidates as { candidateRef: string; packageHash: string; packageFile: string | null; complete: boolean }[];
  const vuHashes = new Set(vuCandidates.map((c) => c.packageHash));
  for (const p of packages) if (!vuHashes.has(p.pkg.packageHash)) problems.push(`package ${p.file} not in the verified-units manifest`);
  if (vuCandidates.length !== statuses.filter((s) => s.package !== null).length) problems.push(`verified-units manifest candidates ${vuCandidates.length} != status rows with a package record ${statuses.filter((s) => s.package !== null).length}`);
  if (vuCandidates.filter((c) => c.packageFile !== null).length !== packages.length) problems.push("verified-units manifest files != packages on disk");
  for (const c of vuCandidates) if (c.packageFile === null && c.complete) problems.push(`manifest: a package with no file claims complete (${c.packageHash})`);

  // 4. P-1 occurrences: findings whose ruleOrDefinitionId is not a compiled unit id
  const p1: P1Occurrence[] = [];
  for (const s of statuses) {
    if (!s.package?.file || !s.evidenceFile) continue;
    const pkg = pkgByHash.get(s.package.packageHash)?.pkg; if (!pkg) continue;
    const missing = pkg.problems.filter((p) => p.code === "VERIFICATION_WITHOUT_IR").flatMap((p) => p.refs);
    if (missing.length === 0) continue;
    const ev = JSON.parse(fs.readFileSync(s.evidenceFile, "utf8"));
    const compiledUnitIds = pkg.units.map((u) => u.ruleOrDefinitionId).sort();
    for (const f of (ev.verification?.findings ?? []) as { findingId: string; ruleOrDefinitionId: string; irPath?: string; findingType: string; severity: string }[]) {
      if (!missing.includes(f.ruleOrDefinitionId)) continue;
      p1.push({ candidate: s.ref, discoveryId: s.discoveryId, findingId: f.findingId, findingType: f.findingType, materiality: f.severity, suppliedRuleOrDefinitionId: f.ruleOrDefinitionId, irPath: f.irPath ?? null, compiledUnitIds, binding: "UNBOUND_NO_SUCH_UNIT", packageComplete: pkg.complete, packageProblems: [...new Set(pkg.problems.map((p) => p.code))].sort() });
    }
    for (const id of missing) if (!p1.some((x) => x.discoveryId === s.discoveryId && x.suppliedRuleOrDefinitionId === id)) problems.push(`P-1 ${s.ref}: package names missing unit ${id} but no finding carries it`);
  }

  // bands, benchmark facts (no scoring)
  const count = (f: (s: Status) => boolean) => statuses.filter(f).length;
  const byBand: Record<string, Record<string, number>> = {};
  for (const s of statuses) { const b = bandOf(s.operativeChars); byBand[b] = byBand[b] ?? {}; byBand[b]![s.compile.outcome] = (byBand[b]![s.compile.outcome] ?? 0) + 1; }
  const benchmark = BENCHMARK_REFS.filter((ref) => order.some((o) => o.ref === ref)).map((ref) => { const s = statuses.find((x) => x.ref === ref); return s ? { ref, attempted: true, compile: s.compile.outcome, verify: s.verify.outcome, verificationStatus: s.verify.status, packageComplete: s.package?.complete ?? null } : { ref, attempted: false }; });

  // 5. preserve verbatim (never into the original run's directory)
  if (path.resolve(dest) === path.resolve(ORIGINAL_RUN_DIR)) throw new Error("refusing to preserve over the original run");
  if (fs.existsSync(dest)) throw new Error(`refusing to preserve over an existing segment directory ${dest}`);
  fs.mkdirSync(dest, { recursive: true });
  const inventory = files.map((f) => { const rel = path.relative(scratch, f); const target = path.join(dest, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(f, target); const a = sha256File(f), b = sha256File(target); if (a !== b) problems.push(`copy mismatch ${rel}`); return { file: rel, bytes: fs.statSync(f).size, sha256: a }; });

  const report = {
    segment, scratch, dest, terminatedNormally, filesPreserved: inventory.length, bytesPreserved: inventory.reduce((s, i) => s + i.bytes, 0),
    secretHits: 0, packagesOnDisk: packages.length, packagesValidated: packages.length, packagesComplete: packages.filter((p) => p.pkg.complete).length,
    dispatch: { toDispatch: order.length, attempted: statuses.length, inFlightAtTermination: inFlight, notAttempted: notAttempted.map((n) => n.ref), skipSetSize: skip.size, priorCandidatesReattempted: ids.filter((id) => skip.has(id)).length },
    flush: { flushEvery: plan.flushEvery, logRows: logRows.length, statusRows: statuses.length, checkpointAttempted: checkpoint.attempted, rowsNeedingRecovery: 0 },
    compile: { COMPLETED: count((s) => s.compile.outcome === "COMPLETED"), TIMEOUT: count((s) => s.compile.outcome === "TIMEOUT"), outcomes: statuses.reduce((a: Record<string, number>, s) => { a[s.compile.outcome] = (a[s.compile.outcome] ?? 0) + 1; return a; }, {}) },
    verification: { ran: count((s) => s.verify.outcome === "COMPLETED"), statusCounts: statuses.reduce((a: Record<string, number>, s) => { const k = s.verify.status ?? s.verify.outcome; a[k] = (a[k] ?? 0) + 1; return a; }, {}), findingsTotal: statuses.reduce((s, x) => s + (x.verify.findings ?? 0), 0), reviewInvoked: count((s) => s.verify.semanticReviewInvoked === true) },
    packages: { complete: count((s) => s.package?.complete === true), incomplete: count((s) => s.package !== null && s.package.complete === false), notWritten: count((s) => s.package === null), problemsByCode: statuses.flatMap((s) => s.package?.problems ?? []).reduce((a: Record<string, number>, c) => { a[c] = (a[c] ?? 0) + 1; return a; }, {}) },
    byBand, benchmark, p1Occurrences: p1,
    preflight: preflight === null ? null : { ok: preflight.ok, spendUsd: preflight.spendUsd, probes: preflight.probes.map((p: { tier: string; status: number; inputTokens: number; outputTokens: number; costUsd: number }) => ({ tier: p.tier, status: p.status, inputTokens: p.inputTokens, outputTokens: p.outputTokens, costUsd: p.costUsd })) },
    ledger, ledgerSnapshot: snap,
    paidCalls: { compile: costs.perRequest.filter((r) => r.stage === "compile").length, compileInFlightUnknown: inFlight ? 1 : 0, verify: costs.perRequest.filter((r) => r.stage === "verify").length, verifierSideCalls: costs.sideCalls.filter((c) => c.discoveryId !== null).length, amendment: costs.sideCalls.filter((c) => c.discoveryId === null).length, healthProbes: preflight ? preflight.probes.length : 0 },
    problems, inventory,
  };
  fs.writeFileSync(path.join(path.dirname(dest), `03-continuation-${segment}-validation.json`), JSON.stringify(report, null, 2));
  return report;
}

/** One row per dedup candidate, exactly once. */
export interface PopulationRow { discoveryId: string; ref: string; operativeChars: number; band: string; disposition: "TERMINAL_ATTEMPT" | "EMPTY_OPERATIVE_TEXT" | "IN_FLIGHT_UNKNOWN" | "NEVER_ATTEMPTED"; source: "original" | `continuation-${number}` | null; compile: string | null; verify: string | null; verificationStatus: string | null; packageComplete: boolean | null; recovered: boolean; evidenceFile: string | null }

export function consolidatePopulation(originalDir = ORIGINAL_RUN_DIR, segmentDirs = preservedContinuationSegments(), docsDir = DOCS_DIR) {
  const rd = (d: string, n: string) => JSON.parse(fs.readFileSync(path.join(d, n), "utf8"));
  const problems: string[] = [];
  const oPlan = rd(originalDir, "00-plan.json");
  const oManifest = rd(originalDir, "03-run-manifest.reconstructed.json");
  const oValidation = rd(path.dirname(originalDir), "01-run-validation.json");
  const chars = new Map<string, number>((oPlan.order as { discoveryId: string; operativeChars: number }[]).map((o) => [o.discoveryId, o.operativeChars]));
  const rows: PopulationRow[] = [];
  for (const c of oManifest.candidateStatuses as { discoveryId: string; ref: string; compile: string; verify: string; verificationStatus: string | null; packageComplete: boolean | null; recovered: boolean }[]) {
    rows.push({ discoveryId: c.discoveryId, ref: c.ref, operativeChars: chars.get(c.discoveryId)!, band: bandOf(chars.get(c.discoveryId)!), disposition: "TERMINAL_ATTEMPT", source: "original", compile: c.compile, verify: c.verify, verificationStatus: c.verificationStatus, packageComplete: c.packageComplete, recovered: c.recovered, evidenceFile: path.join(path.basename(originalDir), "evidence", `${c.discoveryId}.json`) });
  }
  const inFlight = oManifest.terminated.inFlightCandidate as { discoveryId: string; ref: string; operativeChars: number };
  rows.push({ discoveryId: inFlight.discoveryId, ref: inFlight.ref, operativeChars: inFlight.operativeChars, band: bandOf(inFlight.operativeChars), disposition: "IN_FLIGHT_UNKNOWN", source: "original", compile: null, verify: null, verificationStatus: null, packageComplete: null, recovered: false, evidenceFile: null });
  // cost merge - labelled components, each counted once
  const oL = oValidation.ledger;
  const components: { component: string; usd: number; status: string; source: string }[] = [
    { component: "original run: exact (compile + verify + amendment)", usd: oL.exactUsd, status: "EXACT", source: `${path.basename(originalDir)} ledger (01-run-validation.json)` },
    { component: "original run: timeout reservations retained", usd: oL.timeoutReservationsRetainedUsd, status: "UNKNOWN_TIMEOUT_BILLED", source: `${path.basename(originalDir)} ledger` },
    { component: `original run: interrupted request ${inFlight.ref}, one reservation (counted here only)`, usd: oL.inFlightAtTermination.chargedUsd, status: "UNKNOWN_IN_FLIGHT", source: `${path.basename(originalDir)} in-flight` },
    { component: "original run: health probes", usd: oValidation.preflight.spendUsd, status: "EXACT", source: `${path.basename(originalDir)}/preflight-health.json` },
    { component: "original run: possible amendment call from the aborted first launch", usd: 0.0004, status: "UNKNOWN_POSSIBLE", source: "02-run-report.json (upper bound)" },
  ];
  const segments: Record<string, unknown>[] = [];
  const p1: P1Occurrence[] = [];
  let lastCumulative: number | null = null; let lastProbes = 0;
  for (const [i, dir] of segmentDirs.entries()) {
    const n = i + 1; const name = path.basename(dir);
    const cPlan = rd(dir, "00-plan.json");
    const cStatuses = rd(dir, "01-statuses.json") as Status[];
    const cValidation = rd(docsDir, `03-continuation-${n}-validation.json`);
    if (cValidation.dest !== dir && path.resolve(cValidation.dest) !== path.resolve(dir)) problems.push(`${name}: validation report is for ${cValidation.dest}`);
    for (const s of cStatuses) rows.push({ discoveryId: s.discoveryId, ref: s.ref, operativeChars: s.operativeChars, band: bandOf(s.operativeChars), disposition: "TERMINAL_ATTEMPT", source: `continuation-${n}`, compile: s.compile.outcome, verify: s.verify.outcome, verificationStatus: s.verify.status, packageComplete: s.package?.complete ?? null, recovered: false, evidenceFile: path.join(name, "evidence", `${s.discoveryId}.json`) });
    if (cValidation.dispatch.inFlightAtTermination) { const f = cValidation.dispatch.inFlightAtTermination; rows.push({ discoveryId: f.discoveryId, ref: f.ref, operativeChars: f.operativeChars, band: bandOf(f.operativeChars), disposition: "IN_FLIGHT_UNKNOWN", source: `continuation-${n}`, compile: null, verify: null, verificationStatus: null, packageComplete: null, recovered: false, evidenceFile: null }); }
    const cL = cValidation.ledger;
    if (cL.thisRun.preflightProbesUsd > 0) components.push({ component: `${name}: health probes`, usd: cL.thisRun.preflightProbesUsd, status: "EXACT", source: `${name}/preflight-health.json` });
    components.push({ component: `${name}: exact (compile + verify + amendment), this segment only`, usd: cL.thisRun.exactUsd, status: "EXACT", source: `${name} ledger minus seeded prior` });
    components.push({ component: `${name}: timeout reservations retained, this segment only`, usd: cL.thisRun.timeoutReservationsRetainedUsd, status: "UNKNOWN_TIMEOUT_BILLED", source: `${name} ledger minus seeded prior` });
    if (cL.thisRun.inFlightReservationUsd > 0) components.push({ component: `${name}: interrupted request ${cValidation.dispatch.inFlightAtTermination?.ref}, one reservation (counted here only)`, usd: cL.thisRun.inFlightReservationUsd, status: "UNKNOWN_IN_FLIGHT", source: `${name} validation` });
    // the seeded prior of this segment must equal everything merged before it
    const mergedBefore = r6(components.filter((c) => !c.component.startsWith(`${name}:`)).reduce((s, c) => s + c.usd, 0));
    const seeded = cPlan.priorSpend as { exactUsd: number; retainedUnknownUsd: number };
    if (!near(seeded.exactUsd + seeded.retainedUnknownUsd, mergedBefore, 5e-6)) problems.push(`${name}: seeded prior ${r6(seeded.exactUsd + seeded.retainedUnknownUsd)} != components merged before it ${mergedBefore}`);
    lastCumulative = cL.cumulative.committedIncludingInFlightUsd; lastProbes = cL.thisRun.preflightProbesUsd;
    p1.push(...(cValidation.p1Occurrences as P1Occurrence[]));
    segments.push({ dir: name, runId: cPlan.runId, toDispatch: cPlan.toDispatch, attempted: cStatuses.length, terminatedNormally: cValidation.terminatedNormally, inFlightAtTermination: cValidation.dispatch.inFlightAtTermination?.ref ?? null, notAttempted: cValidation.dispatch.notAttempted.length, priorCandidatesReattempted: cValidation.dispatch.priorCandidatesReattempted, healthProbes: cValidation.paidCalls.healthProbes });
  }
  const covered = new Set(rows.map((r) => r.discoveryId));
  for (const o of oPlan.order as { discoveryId: string; ref: string; operativeChars: number }[]) if (!covered.has(o.discoveryId)) rows.push({ discoveryId: o.discoveryId, ref: o.ref, operativeChars: o.operativeChars, band: bandOf(o.operativeChars), disposition: "NEVER_ATTEMPTED", source: null, compile: null, verify: null, verificationStatus: null, packageComplete: null, recovered: false, evidenceFile: null });
  for (const e of oPlan.skippedEmpty as { discoveryId: string; ref: string }[]) rows.push({ discoveryId: e.discoveryId, ref: e.ref, operativeChars: 0, band: "EMPTY", disposition: "EMPTY_OPERATIVE_TEXT", source: null, compile: null, verify: null, verificationStatus: null, packageComplete: null, recovered: false, evidenceFile: null });
  rows.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : a.discoveryId < b.discoveryId ? -1 : 1));
  // exactly once, and exactly the dedup population
  const idsAll = rows.map((r) => r.discoveryId);
  if (new Set(idsAll).size !== idsAll.length) problems.push("a candidate appears more than once");
  const dedup = new Set([...(oPlan.order as { discoveryId: string }[]).map((o) => o.discoveryId), ...(oPlan.skippedEmpty as { discoveryId: string }[]).map((e) => e.discoveryId)]);
  if (dedup.size !== oPlan.dedupDenominator) problems.push("original plan does not enumerate the dedup denominator");
  for (const id of idsAll) if (!dedup.has(id)) problems.push(`row not in the dedup population: ${id}`);
  for (const id of dedup) if (!idsAll.includes(id)) problems.push(`dedup candidate without a row: ${id}`);
  if (rows.length !== oPlan.dedupDenominator) problems.push(`rows ${rows.length} != dedup denominator ${oPlan.dedupDenominator}`);
  for (const r of rows) if (r.evidenceFile && !fs.existsSync(path.join(docsDir, r.evidenceFile))) problems.push(`evidence file missing for ${r.ref}`);

  const totalUsd = r6(components.reduce((s, c) => s + c.usd, 0));
  if (lastCumulative !== null && !near(totalUsd, r6(lastCumulative + lastProbes), 5e-6)) problems.push(`merged total ${totalUsd} != last segment's cumulative ledger + its probes ${r6(lastCumulative + lastProbes)}`);
  const exactUsd = r6(components.filter((c) => c.status === "EXACT").reduce((s, c) => s + c.usd, 0));

  const terminal = rows.filter((r) => r.disposition === "TERMINAL_ATTEMPT");
  const tally = (f: (r: PopulationRow) => string | null | undefined) => terminal.reduce((a: Record<string, number>, r) => { const k = f(r) ?? "null"; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const byBand: Record<string, Record<string, number>> = {};
  for (const r of rows) { byBand[r.band] = byBand[r.band] ?? {}; const k = r.disposition === "TERMINAL_ATTEMPT" ? r.compile! : r.disposition; byBand[r.band]![k] = (byBand[r.band]![k] ?? 0) + 1; }
  const benchmark = BENCHMARK_REFS.map((ref) => { const r = rows.find((x) => x.ref === ref)!; return { ref, band: r.band, source: r.source, disposition: r.disposition, compile: r.compile, verify: r.verify, verificationStatus: r.verificationStatus, packageComplete: r.packageComplete, executionLimited: r.disposition !== "TERMINAL_ATTEMPT" || r.compile === "TIMEOUT" || r.verify === "TIMEOUT" }; });
  const manifest = {
    schema: "p3-conmed-population-manifest.v1",
    evidenceLabel: "CURRENT_PIPELINE_COMPILE_AND_VERIFY",
    runs: { original: { dir: path.basename(originalDir), runId: oPlan.runId, attempted: oManifest.attempted, terminated: oManifest.terminated.reason, inFlightAtTermination: inFlight.ref }, continuationSegments: segments },
    model: oPlan.model, timeoutMs: oPlan.timeoutMs, concurrency: oPlan.concurrency, autoRetry: oPlan.autoRetry, fallbackModel: oPlan.fallbackModel, premiumModelBudgetUsd: oPlan.premiumModelBudgetUsd, attemptsPerCandidate: 1,
    denominator: { discovered: 163, dedup: oPlan.dedupDenominator, emptyOperativeText: (oPlan.skippedEmpty as unknown[]).length, attemptable: oPlan.attemptable },
    dispositions: rows.reduce((a: Record<string, number>, r) => { a[r.disposition] = (a[r.disposition] ?? 0) + 1; return a; }, {}),
    bySource: rows.reduce((a: Record<string, number>, r) => { const k = `${r.source ?? "none"}:${r.disposition}`; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
    compileOutcomes: tally((r) => r.compile), verifyOutcomes: tally((r) => r.verify), verificationStatuses: tally((r) => r.verificationStatus ?? r.verify),
    packages: { complete: terminal.filter((r) => r.packageComplete === true).length, incomplete: terminal.filter((r) => r.packageComplete === false).length, none: terminal.filter((r) => r.packageComplete === null).length },
    byBand, benchmarkExecutionFactsOnly: benchmark, scored: false,
    spend: { components, totalUsd, exactUsd, unknownOrRetainedUsd: r6(totalUsd - exactUsd), ceilingUsd: oPlan.ceilingUsd, stopAtUsd: oPlan.stopAtUsd, ceilingExceeded: totalUsd > oPlan.ceilingUsd, remainingUnderCeilingUsd: r6(oPlan.ceilingUsd - totalUsd), doubleCountingCheck: "each interrupted request appears once (its reservation); each segment's seeded prior equals the components merged before it and is excluded from that segment's own components; the merged total equals the last segment's cumulative ledger plus its probes" },
    p1OccurrencesContinuation: p1,
    rows, problems,
  };
  fs.writeFileSync(path.join(docsDir, "04-population-manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1]?.endsWith("conmed-continuation-postrun.ts")) {
  const segment = Number(process.argv[2]);
  if (!Number.isInteger(segment) || segment < 1) throw new Error("usage: conmed-continuation-postrun.ts <segment>");
  const r = validateContinuation(segment);
  const { inventory, ...summary } = r;
  console.log(JSON.stringify({ ...summary, inventoryFiles: inventory.length }, null, 1));
  if (r.problems.length > 0) process.exitCode = 2;
  else { const m = consolidatePopulation(); const { rows, ...ms } = m; console.log(JSON.stringify({ ...ms, rows: rows.length }, null, 1)); if (m.problems.length > 0) process.exitCode = 2; }
}
