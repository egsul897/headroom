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

export function validateAndPreserve(scratch = OUT, dest = "docs/phase-3-conmed-population-verified/run") {
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
  const statuses = read("01-statuses.json") as { discoveryId: string; ref: string; operativeChars: number; compile: { outcome: string; costUsd: number; costStatus: string }; verify: { outcome: string; status: string | null; costUsd: number; costStatus: string | null; sideCalls: unknown[] }; package: { complete: boolean; packageHash: string; file: string | null } | null; evidenceFile: string | null; committedUsd: number }[];
  const costs = read("02-costs.json") as { snapshot: Record<string, number>; perRequest: { discoveryId: string; stage: string; chargedToBudgetUsd: number; costAccountingStatus: string }[]; sideCalls: { discoveryId: string | null; stage: string; costUsd: number }[] };
  const runManifest = read("03-run-manifest.json");
  const vuManifest = read("evidence/verified-units-manifest.json");
  const preflight = fs.existsSync(path.join(scratch, "preflight-health.json")) ? read("preflight-health.json") : null;

  const ids = statuses.map((s) => s.discoveryId);
  if (new Set(ids).size !== ids.length) problems.push("duplicate candidate rows in 01-statuses");
  const planned = new Set((plan.order as { discoveryId: string }[]).map((o) => o.discoveryId));
  for (const id of ids) if (!planned.has(id)) problems.push(`attempted candidate not in plan: ${id}`);
  const notAttempted = (plan.order as { discoveryId: string; ref: string }[]).filter((o) => !ids.includes(o.discoveryId));
  if (statuses.length + notAttempted.length !== plan.attemptable) problems.push("attempted + not attempted != attemptable");

  const count = (f: (s: (typeof statuses)[number]) => boolean) => statuses.filter(f).length;
  const expect = (name: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${name}: manifest ${JSON.stringify(a)} vs recomputed ${JSON.stringify(b)}`); };
  expect("attempted", runManifest.attempted, statuses.length);
  expect("compileCompleted", runManifest.compileCompleted, count((s) => s.compile.outcome === "COMPLETED"));
  expect("compileTimeout", runManifest.compileTimeout, count((s) => s.compile.outcome === "TIMEOUT"));
  expect("verificationCompleted", runManifest.verificationCompleted, count((s) => s.verify.outcome === "COMPLETED"));
  expect("pairedPackagesComplete", runManifest.pairedPackagesComplete, count((s) => s.package?.complete === true));
  expect("pairedPackagesIncomplete", runManifest.pairedPackagesIncomplete, count((s) => s.package !== null && s.package.complete === false));
  expect("pairedPackagesNotWritten", runManifest.pairedPackagesNotWritten, count((s) => s.package === null));

  // ledger: committed = exact + retained; per-request charges sum to committed (minus one-time amendment settle, which is in perRequest? it is settled separately)
  const perRequestSum = costs.perRequest.reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const exactSum = costs.perRequest.filter((r) => r.costAccountingStatus === "EXACT").reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const retainedSum = costs.perRequest.filter((r) => r.costAccountingStatus === "UNKNOWN_TIMEOUT_BILLED").reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const amendmentUsd = runManifest.spend.amendmentPipelineUsd as number;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (!near(costs.snapshot.committedUsd!, costs.snapshot.exactSpendUsd! + costs.snapshot.retainedUnknownTimeoutUsd! + (costs.snapshot.outstandingReservedUsd ?? 0))) problems.push("ledger: committed != exact + retained + outstanding");
  if (!near(costs.snapshot.exactSpendUsd!, exactSum + amendmentUsd)) problems.push(`ledger: exact ${costs.snapshot.exactSpendUsd} != per-request exact ${exactSum} + amendment ${amendmentUsd}`);
  if (!near(costs.snapshot.retainedUnknownTimeoutUsd!, retainedSum)) problems.push(`ledger: retained ${costs.snapshot.retainedUnknownTimeoutUsd} != per-request retained ${retainedSum}`);
  if (!near(perRequestSum + amendmentUsd, costs.snapshot.committedUsd! - (costs.snapshot.outstandingReservedUsd ?? 0))) problems.push("ledger: per-request charges + amendment != committed");
  const statusCompileSum = statuses.reduce((s, x) => s + x.compile.costUsd, 0) + statuses.reduce((s, x) => s + x.verify.costUsd, 0);
  if (!near(statusCompileSum, perRequestSum)) problems.push(`status-level charges ${statusCompileSum} != per-request ${perRequestSum}`);
  if (costs.snapshot.committedUsd! > runManifest.spend.ceilingUsd) problems.push("ceiling exceeded");
  // every side call is attributed to a status row's verify.sideCalls or to the run-level amendment
  const sideAttributed = statuses.reduce((s, x) => s + x.verify.sideCalls.length, 0) + costs.sideCalls.filter((c) => c.discoveryId === null).length;
  if (sideAttributed !== costs.sideCalls.length) problems.push(`side calls ${costs.sideCalls.length} but attributed ${sideAttributed}`);

  // packages vs statuses vs verified-units manifest
  const pkgByHash = new Map(packages.map((p) => [p.pkg.packageHash, p]));
  for (const s of statuses) {
    if (s.package) {
      const p = pkgByHash.get(s.package.packageHash);
      if (!p) problems.push(`status ${s.ref}: package hash not found on disk`);
      else if (p.pkg.complete !== s.package.complete) problems.push(`status ${s.ref}: completeness disagrees with package on disk`);
      if (!s.evidenceFile || !fs.existsSync(s.evidenceFile)) problems.push(`status ${s.ref}: evidence file missing`);
      else {
        const ev = JSON.parse(fs.readFileSync(s.evidenceFile, "utf8"));
        if (ev.verifiedUnits?.packageHash !== s.package.packageHash) problems.push(`status ${s.ref}: evidence pointer does not match package`);
        if (s.compile.outcome === "COMPLETED" && (!("rawModelOutput" in ev.compilation) || !Array.isArray(ev.compilation.toolCallLog))) problems.push(`status ${s.ref}: forensic fields missing`);
      }
      // completeness semantics
      if (s.compile.outcome !== "COMPLETED" && s.package.complete) problems.push(`status ${s.ref}: compile ${s.compile.outcome} but package complete`);
      if (s.verify.outcome !== "COMPLETED" && s.package.complete) problems.push(`status ${s.ref}: verify ${s.verify.outcome} but package complete`);
    }
  }
  // A candidate that compiled no unit has nothing to pair, so no package FILE exists for it; its
  // package is still recorded (complete: false, packageFile: null) in the status row and the manifest.
  const vuCandidates = vuManifest.candidates as { packageHash: string; packageFile: string | null; complete: boolean }[];
  const vuHashes = new Set(vuCandidates.map((c) => c.packageHash));
  for (const p of packages) if (!vuHashes.has(p.pkg.packageHash)) problems.push(`package ${p.file} not in verified-units manifest`);
  expect("verified-units manifest candidates", vuCandidates.length, statuses.filter((s) => s.package !== null).length);
  expect("verified-units manifest files", vuCandidates.filter((c) => c.packageFile !== null).length, packages.length);
  for (const c of vuCandidates) if (c.packageFile === null && c.complete) problems.push(`manifest: a package with no file claims complete (${c.packageHash})`);

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

  const report = {
    scratch, dest, filesPreserved: inventory.length, bytesPreserved: inventory.reduce((s, i) => s + i.bytes, 0),
    secretHits: 0, packagesOnDisk: packages.length, packagesValidated: packages.length, packagesComplete: packages.filter((p) => p.pkg.complete).length,
    attempted: statuses.length, notAttempted: notAttempted.map((n) => n.ref), planned: plan.attemptable,
    byBand, benchmark, preflight: preflight ? { ok: preflight.ok, spendUsd: preflight.spendUsd, probes: preflight.probes.map((p: { tier: string; status: number; inputTokens: number; outputTokens: number; costUsd: number }) => ({ tier: p.tier, status: p.status, inputTokens: p.inputTokens, outputTokens: p.outputTokens, costUsd: p.costUsd })) } : null,
    ledger: costs.snapshot, runManifest: { ...runManifest, candidateStatuses: undefined },
    paidCalls: { compile: costs.perRequest.filter((r) => r.stage === "compile").length, verifierSideCalls: costs.sideCalls.filter((c) => c.discoveryId !== null).length, amendment: costs.sideCalls.filter((c) => c.discoveryId === null).length, healthProbes: preflight ? preflight.probes.length : 0 },
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
