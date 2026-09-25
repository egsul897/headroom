/**
 * CONMED resume - end-of-run validation and repository preservation. Zero paid calls.
 *
 * Reads the scratch output of run-population-verified.ts and:
 *   1. secret-scans every file (a hit is a hard failure);
 *   2. re-parses every verified-unit package, re-checking package and artifact hashes;
 *   3. reconciles the run manifest's counts against the candidate statuses, the cost ledger against
 *      the per-request records, the verified-unit manifest against the packages on disk, and the
 *      attempted set against the planned denominator; refuses duplicate rows;
 *   4. classifies every attempt by operative-span band and tracks the nine V3.1.1 CONMED benchmark
 *      candidates by execution facts only (no scoring);
 *   5. copies the complete scratch directory into an additive docs/ directory and verifies the copy
 *      file by file by sha256.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseVerifiedUnitPackage } from "../../lib/contract-model/verified-units";
import { scanForSecrets } from "./evidence";
import { OUT } from "./run-population-verified";

const sha256File = (p: string) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const walk = (dir: string, out: string[] = []): string[] => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, out); else out.push(f); } return out; };
const BENCHMARK_REFS = ["7.1", "7.2", "7.10", "7.2(c)", "7.11", "7.13", "7.14", "7.16", "7.17"];
const bandOf = (n: number) => (n === 0 ? "EMPTY" : n <= 776 ? "SHORT" : n < 1886 ? "MID" : "LONG");

export function validateAndPreserve(scratch = OUT, dest = "docs/phase-3-conmed-population-verified/run-original") {
  const read = (n: string) => JSON.parse(fs.readFileSync(path.join(scratch, n), "utf8"));
  const problems: string[] = [];
  const files = walk(scratch).sort();

  // 1. secrets
  const secretHits = files.flatMap((f) => scanForSecrets(fs.readFileSync(f, "utf8")).map((h) => `${path.relative(scratch, f)}: ${h.pattern}`));
  if (secretHits.length > 0) throw new Error(`SECRET LEAK - refusing to preserve: ${secretHits.join("; ")}`);

  // 2. packages
  const packageFiles = files.filter((f) => f.endsWith(".verified-units.json"));
  const packages = packageFiles.map((f) => { try { return { file: path.relative(scratch, f), pkg: parseVerifiedUnitPackage(fs.readFileSync(f, "utf8")) }; } catch (e) { problems.push(`package ${path.relative(scratch, f)}: ${(e as Error).message}`); return null; } }).filter((x): x is NonNullable<typeof x> => x !== null);

  // 3. reconciliation - with honest reconstruction when the run terminated abnormally
  //
  // The runner flushes 01-statuses / 02-costs / the verified-units manifest every 10 candidates and
  // writes 03-run-manifest only at the end. If the process died between flushes (this run: a
  // container restart at candidate 105), the candidates after the last flush exist only as their
  // per-candidate evidence + package files and as log rows. Those are recovered here from the files
  // the runner wrote at the time - never invented - and every reconstructed figure is labelled.
  const plan = read("00-plan.json");
  const preflight = fs.existsSync(path.join(scratch, "preflight-health.json")) ? read("preflight-health.json") : null;
  const expect = (name: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${name}: manifest ${JSON.stringify(a)} vs recomputed ${JSON.stringify(b)}`); };
  type Status = { discoveryId: string; ref: string; operativeChars: number; compile: { outcome: string; status: string; failureReasons: string[]; wallClockMs: number | null; inputTokens: number | null; outputTokens: number | null; costUsd: number; costStatus: string }; verify: { outcome: string; status: string | null; semanticReviewInvoked: boolean | null; findings: number | null; sideCalls: unknown[]; costUsd: number; costStatus: string | null; wallClockMs: number | null }; package: { complete: boolean; artifactsPersisted: number; unitsMissingVerification: number; problems: string[]; packageHash: string; file: string | null } | null; evidenceFile: string | null; committedUsd: number; recovered?: true; recoveryNote?: string };
  const flushed = read("01-statuses.json") as Status[];
  const costs = read("02-costs.json") as { snapshot: Record<string, number>; perRequest: { discoveryId: string; stage: string; chargedToBudgetUsd: number; costAccountingStatus: string }[]; sideCalls: { discoveryId: string | null; stage: string; costUsd: number }[] };
  const log = fs.readFileSync(path.join(scratch, "run.log"), "utf8");
  const logRows = [...log.matchAll(/\[(\d+)\/(\d+)\] (\S+)\s+compile=(\S+)\s+verify=(\S+)\s+pkg=(\S+)\s+committed=\$([\d.]+)/g)].map((m) => ({ n: Number(m[1]), ref: m[3]!, compile: m[4]!, verify: m[5]!, pkg: m[6]!, committed: Number(m[7]) }));
  const order = plan.order as { discoveryId: string; ref: string; operativeChars: number }[];
  const evidenceById = new Map<string, string>();
  for (const f of files) if (f.startsWith(path.join(scratch, "evidence")) && f.endsWith(".json") && !f.includes("verified-units")) evidenceById.set(path.basename(f, ".json"), f);
  const flushedIds = new Set(flushed.map((s) => s.discoveryId));
  const recovered: Status[] = [];
  for (const o of order) {
    if (flushedIds.has(o.discoveryId) || !evidenceById.has(o.discoveryId)) continue;
    const ev = JSON.parse(fs.readFileSync(evidenceById.get(o.discoveryId)!, "utf8"));
    const idx = order.findIndex((x) => x.discoveryId === o.discoveryId);
    const row = logRows.find((r) => r.n === idx + 1 && r.ref === o.ref);
    const prev = logRows.find((r) => r.n === idx);
    if (!row || !prev) { problems.push(`recovery: no log row for ${o.ref}`); continue; }
    const compileCost = ev.run.costUsd as number;
    const delta = Math.round((row.committed - prev.committed) * 1e4) / 1e4;
    const verifyCost = Math.max(0, Math.round((delta - compileCost) * 1e6) / 1e6);
    const pkgFile = ev.verifiedUnits ? path.join(scratch, "evidence", ev.verifiedUnits.file) : null;
    recovered.push({
      discoveryId: o.discoveryId, ref: o.ref, operativeChars: o.operativeChars,
      compile: { outcome: row.compile, status: ev.compilation.status, failureReasons: ev.compilation.failureReasons, wallClockMs: ev.run.wallClockMs, inputTokens: ev.run.inputTokens, outputTokens: ev.run.outputTokens, costUsd: compileCost, costStatus: ev.run.costStatus },
      verify: { outcome: row.verify, status: ev.verification?.status ?? null, semanticReviewInvoked: ev.verification?.semanticReviewInvoked ?? null, findings: ev.verification ? (ev.verification.findings as unknown[]).length : null, sideCalls: [], costUsd: verifyCost, costStatus: ev.verification ? "EXACT_FROM_LOG_DELTA" : null, wallClockMs: null },
      package: ev.verifiedUnits ? { complete: ev.verifiedUnits.complete, artifactsPersisted: ev.verifiedUnits.artifactsPersisted, unitsMissingVerification: ev.verifiedUnits.unitsMissingVerification, problems: ev.verifiedUnits.problems, packageHash: ev.verifiedUnits.packageHash, file: pkgFile } : null,
      evidenceFile: evidenceById.get(o.discoveryId)!, committedUsd: row.committed,
      recovered: true, recoveryNote: "status row lost with the process between flushes; rebuilt from the candidate's own evidence file (compile facts, verification status, package pointer) and the run log's committed delta (verify cost = delta - compile cost; side-call breakdown not recoverable)",
    });
  }
  const statuses: Status[] = [...flushed, ...recovered];
  const ids = statuses.map((s) => s.discoveryId);
  if (new Set(ids).size !== ids.length) problems.push("duplicate candidate rows");
  const planned = new Set(order.map((o) => o.discoveryId));
  for (const id of ids) if (!planned.has(id)) problems.push(`attempted candidate not in plan: ${id}`);
  const attemptedSet = new Set(ids);
  const inFlight = order.find((o, i) => !attemptedSet.has(o.discoveryId) && order.slice(0, i).every((p) => attemptedSet.has(p.discoveryId))) ?? null;
  const notAttempted = order.filter((o) => !attemptedSet.has(o.discoveryId) && o.discoveryId !== inFlight?.discoveryId);
  if (statuses.length + (inFlight ? 1 : 0) + notAttempted.length !== plan.attemptable) problems.push("attempted + in-flight + not attempted != attemptable");
  if (logRows.length !== statuses.length) problems.push(`log rows ${logRows.length} != status rows ${statuses.length}`);
  const terminatedNormally = fs.existsSync(path.join(scratch, "03-run-manifest.json"));

  // ledger: the flushed snapshot covers the flushed rows; recovered rows extend it from their own charges
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const perRequestSum = costs.perRequest.reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const exactSum = costs.perRequest.filter((r) => r.costAccountingStatus === "EXACT").reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const retainedSum = costs.perRequest.filter((r) => r.costAccountingStatus === "UNKNOWN_TIMEOUT_BILLED").reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const amendmentUsd = costs.sideCalls.filter((c) => c.discoveryId === null).reduce((s, c) => s + c.costUsd, 0);
  if (!near(costs.snapshot.committedUsd!, costs.snapshot.exactSpendUsd! + costs.snapshot.retainedUnknownTimeoutUsd! + (costs.snapshot.outstandingReservedUsd ?? 0))) problems.push("ledger: committed != exact + retained + outstanding");
  if (!near(costs.snapshot.exactSpendUsd!, exactSum + amendmentUsd)) problems.push(`ledger: exact ${costs.snapshot.exactSpendUsd} != per-request exact ${exactSum} + amendment ${amendmentUsd}`);
  if (!near(costs.snapshot.retainedUnknownTimeoutUsd!, retainedSum)) problems.push(`ledger: retained ${costs.snapshot.retainedUnknownTimeoutUsd} != per-request retained ${retainedSum}`);
  const flushedCharges = flushed.reduce((s, x) => s + x.compile.costUsd + x.verify.costUsd, 0);
  if (!near(flushedCharges, perRequestSum)) problems.push(`flushed status charges ${flushedCharges} != per-request ${perRequestSum}`);
  if (!near(flushed[flushed.length - 1]!.committedUsd, costs.snapshot.committedUsd!)) problems.push("last flushed row's committed != ledger snapshot committed");
  const recoveredExact = recovered.reduce((s, x) => s + (x.compile.costStatus === "EXACT" ? x.compile.costUsd : 0) + x.verify.costUsd, 0);
  const recoveredRetained = recovered.reduce((s, x) => s + (x.compile.costStatus === "UNKNOWN_TIMEOUT_BILLED" ? x.compile.costUsd : 0), 0);
  const reservation = plan.reservationPerCallUsd as number;
  const ledger = {
    source: terminatedNormally ? "final ledger snapshot" : `flushed snapshot at ${flushed.length} rows, extended by ${recovered.length} recovered rows from the log's committed deltas`,
    exactUsd: costs.snapshot.exactSpendUsd! + recoveredExact,
    timeoutReservationsRetainedUsd: costs.snapshot.retainedUnknownTimeoutUsd! + recoveredRetained,
    committedUsd: costs.snapshot.committedUsd! + recoveredExact + recoveredRetained,
    lastLoggedCommittedUsd: logRows[logRows.length - 1]?.committed ?? null,
    inFlightAtTermination: inFlight ? { ...inFlight, billing: "UNKNOWN - the compile request was dispatched and the process died before any result; charged one full reservation under the standing policy (never $0)", chargedUsd: reservation } : null,
    committedIncludingInFlightUsd: costs.snapshot.committedUsd! + recoveredExact + recoveredRetained + (inFlight ? reservation : 0),
    ceilingUsd: plan.ceilingUsd, stopAtUsd: plan.stopAtUsd,
  };
  if (ledger.lastLoggedCommittedUsd !== null && Math.abs(ledger.committedUsd - ledger.lastLoggedCommittedUsd) > 0.0002) problems.push(`reconstructed committed ${ledger.committedUsd} != last logged ${ledger.lastLoggedCommittedUsd}`);
  if (ledger.committedIncludingInFlightUsd > ledger.ceilingUsd) problems.push("ceiling exceeded");
  const sideAttributed = flushed.reduce((s, x) => s + x.verify.sideCalls.length, 0) + costs.sideCalls.filter((c) => c.discoveryId === null).length;
  if (sideAttributed !== costs.sideCalls.length) problems.push(`side calls ${costs.sideCalls.length} but attributed ${sideAttributed}`);

  // packages vs statuses
  const pkgByHash = new Map(packages.map((p) => [p.pkg.packageHash, p]));
  for (const s of statuses) {
    if (s.package) {
      const p = pkgByHash.get(s.package.packageHash);
      if (s.package.file !== null && !p) problems.push(`status ${s.ref}: package hash not found on disk`);
      if (p && p.pkg.complete !== s.package.complete) problems.push(`status ${s.ref}: completeness disagrees with package on disk`);
      if (!s.evidenceFile || !fs.existsSync(s.evidenceFile)) problems.push(`status ${s.ref}: evidence file missing`);
      else {
        const ev = JSON.parse(fs.readFileSync(s.evidenceFile, "utf8"));
        if (s.package.file !== null && ev.verifiedUnits?.packageHash !== s.package.packageHash) problems.push(`status ${s.ref}: evidence pointer does not match package`);
        if (s.compile.outcome === "COMPLETED" && (!("rawModelOutput" in ev.compilation) || !Array.isArray(ev.compilation.toolCallLog))) problems.push(`status ${s.ref}: forensic fields missing`);
      }
      if (s.compile.outcome !== "COMPLETED" && s.package.complete) problems.push(`status ${s.ref}: compile ${s.compile.outcome} but package complete`);
      if (s.verify.outcome !== "COMPLETED" && s.package.complete) problems.push(`status ${s.ref}: verify ${s.verify.outcome} but package complete`);
    }
  }
  // verified-units manifest: the flushed one covers the flushed rows; packages on disk beyond it belong to recovered rows
  const vuManifest = read("evidence/verified-units-manifest.json");
  const vuCandidates = vuManifest.candidates as { packageHash: string; packageFile: string | null; complete: boolean }[];
  const vuHashes = new Set(vuCandidates.map((c) => c.packageHash));
  const recoveredHashes = new Set(recovered.map((r) => r.package?.packageHash).filter(Boolean));
  for (const p of packages) if (!vuHashes.has(p.pkg.packageHash) && !recoveredHashes.has(p.pkg.packageHash)) problems.push(`package ${p.file} in neither the flushed manifest nor a recovered row`);
  expect("verified-units manifest candidates (flushed)", vuCandidates.length, flushed.filter((s) => s.package !== null).length);
  expect("verified-units manifest files + recovered files", vuCandidates.filter((c) => c.packageFile !== null).length + recovered.filter((r) => r.package?.file).length, packages.length);
  for (const c of vuCandidates) if (c.packageFile === null && c.complete) problems.push(`manifest: a package with no file claims complete (${c.packageHash})`);

  const count = (f: (s: Status) => boolean) => statuses.filter(f).length;
  const runManifest = terminatedNormally ? read("03-run-manifest.json") : {
    schema: "p3-conmed-resume-run-manifest.v1", manifestReconstructedPostHoc: true,
    terminated: { reason: "CONTAINER_RESTART_DURING_RUN", lastTerminalCandidate: statuses[statuses.length - 1]?.ref ?? null, inFlightCandidate: inFlight, unattempted: notAttempted.map((o) => o.ref), lastFlushRows: flushed.length, recoveredRows: recovered.map((r) => r.ref) },
    runId: plan.runId, model: plan.model, timeoutMs: plan.timeoutMs, concurrencyUsed: plan.concurrency, autoRetry: plan.autoRetry, fallbackModel: plan.fallbackModel, premiumModelBudgetUsd: plan.premiumModelBudgetUsd,
    denominator: { dedup: plan.dedupDenominator, attemptable: plan.attemptable, skippedEmpty: (plan.skippedEmpty as unknown[]).length },
    attempted: statuses.length,
    compileCompleted: count((s) => s.compile.outcome === "COMPLETED"), compileTimeout: count((s) => s.compile.outcome === "TIMEOUT"),
    compileProviderFailure: count((s) => s.compile.outcome === "PROVIDER_FAILURE"),
    compileOtherFailure: count((s) => s.compile.outcome !== "COMPLETED" && s.compile.outcome !== "TIMEOUT" && s.compile.outcome !== "PROVIDER_FAILURE"),
    compileOutcomeCounts: statuses.reduce((a: Record<string, number>, s) => { a[s.compile.outcome] = (a[s.compile.outcome] ?? 0) + 1; return a; }, {}),
    verificationCompleted: count((s) => s.verify.outcome === "COMPLETED"),
    verificationIncomplete: count((s) => s.verify.outcome === "COMPLETED" && (s.verify.status === "VERIFICATION_INCOMPLETE" || s.verify.status === "NOT_VERIFIED")),
    verificationFailed: count((s) => s.verify.outcome === "TIMEOUT" || s.verify.outcome === "EXECUTION_FAILURE" || (s.verify.outcome === "COMPLETED" && s.verify.status === "VERIFICATION_FAILED")),
    verificationStatusCounts: statuses.reduce((a: Record<string, number>, s) => { const k = s.verify.status ?? s.verify.outcome; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
    pairedPackagesComplete: count((s) => s.package?.complete === true), pairedPackagesIncomplete: count((s) => s.package !== null && s.package.complete === false), pairedPackagesNotWritten: count((s) => s.package === null),
    spend: { exactUsd: ledger.exactUsd, timeoutReservationsRetainedUsd: ledger.timeoutReservationsRetainedUsd, committedUsd: ledger.committedUsd, committedIncludingInFlightUsd: ledger.committedIncludingInFlightUsd, ceilingUsd: ledger.ceilingUsd, stopAtUsd: ledger.stopAtUsd, amendmentPipelineUsd: amendmentUsd },
    candidateStatuses: statuses.map((s) => ({ discoveryId: s.discoveryId, ref: s.ref, compile: s.compile.outcome, verify: s.verify.outcome, verificationStatus: s.verify.status, packageComplete: s.package?.complete ?? null, recovered: s.recovered ?? false })),
  };

  // 4. bands and benchmark tracking
  const byBand: Record<string, Record<string, number>> = {};
  for (const s of statuses) { const b = bandOf(s.operativeChars); byBand[b] = byBand[b] ?? {}; byBand[b]![s.compile.outcome] = (byBand[b]![s.compile.outcome] ?? 0) + 1; }
  const benchmark = BENCHMARK_REFS.map((ref) => {
    const s = statuses.find((x) => x.ref === ref);
    if (!s) return { ref, attempted: false, notAttemptedReason: notAttempted.some((n) => n.ref === ref) ? "NOT_REACHED" : "NOT_IN_PLAN" };
    return { ref, attempted: true, discoveryId: s.discoveryId, band: bandOf(s.operativeChars), compile: s.compile.outcome, verify: s.verify.outcome, verificationStatus: s.verify.status, packageComplete: s.package?.complete ?? null, executionLimited: s.compile.outcome === "TIMEOUT" || s.verify.outcome === "TIMEOUT" };
  });

  // 5. preserve
  fs.mkdirSync(dest, { recursive: true });
  const inventory = files.map((f) => { const rel = path.relative(scratch, f); const target = path.join(dest, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(f, target); const a = sha256File(f), b = sha256File(target); if (a !== b) problems.push(`copy mismatch ${rel}`); return { file: rel, bytes: fs.statSync(f).size, sha256: a }; });
  if (!terminatedNormally) {
    // the reconstructed manifest is written to BOTH locations after the verbatim copy, and listed as reconstructed
    const body = JSON.stringify(runManifest, null, 2);
    for (const d of [scratch, dest]) fs.writeFileSync(path.join(d, "03-run-manifest.reconstructed.json"), body);
    inventory.push({ file: "03-run-manifest.reconstructed.json", bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") });
  }

  const report = {
    scratch, dest, filesPreserved: inventory.length, bytesPreserved: inventory.reduce((s, i) => s + i.bytes, 0),
    secretHits: 0, packagesOnDisk: packages.length, packagesValidated: packages.length, packagesComplete: packages.filter((p) => p.pkg.complete).length,
    attempted: statuses.length, recovered: recovered.length, notAttempted: notAttempted.map((n) => n.ref), planned: plan.attemptable,
    byBand, benchmark, preflight: preflight ? { ok: preflight.ok, spendUsd: preflight.spendUsd, probes: preflight.probes.map((p: { tier: string; status: number; inputTokens: number; outputTokens: number; costUsd: number }) => ({ tier: p.tier, status: p.status, inputTokens: p.inputTokens, outputTokens: p.outputTokens, costUsd: p.costUsd })) } : null,
    ledger, flushedLedgerSnapshot: costs.snapshot, runManifest: { ...runManifest, candidateStatuses: undefined },
    recoveredRows: recovered.map((r) => ({ ref: r.ref, compile: r.compile.outcome, verify: r.verify.outcome, verificationStatus: r.verify.status, packageComplete: r.package?.complete ?? null, compileCostUsd: r.compile.costUsd, verifyCostUsdFromLogDelta: r.verify.costUsd })),
    inFlightAtTermination: inFlight, terminatedNormally,
    paidCalls: { compile: costs.perRequest.filter((r) => r.stage === "compile").length + recovered.length, compileInFlightUnknown: inFlight ? 1 : 0, verifierSideCallsFlushed: costs.sideCalls.filter((c) => c.discoveryId !== null).length, verifierCallsRecoveredRowsMinimum: recovered.filter((r) => r.verify.outcome === "COMPLETED").length, amendment: costs.sideCalls.filter((c) => c.discoveryId === null).length, healthProbes: preflight ? preflight.probes.length : 0 },
    problems, inventory,
  };
  fs.writeFileSync(path.join(path.dirname(dest), "01-run-validation.json"), JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1]?.endsWith("conmed-resume-postrun.ts")) {
  const r = validateAndPreserve();
  const { inventory, ...summary } = r;
  console.log(JSON.stringify({ ...summary, inventoryFiles: inventory.length }, null, 1));
  if (r.problems.length > 0) process.exitCode = 2;
}
