/**
 * CONMED benchmark recovery - end-of-run validation and additive preservation. Zero paid calls.
 *
 *   1. secret-scan every file (a hit is a hard failure);
 *   2. re-parse every verified-unit package (package + artifact hashes);
 *   3. §25 checks: exactly the eight target ids, zero non-target dispatch, <= 2 attempts per target,
 *      no third attempt, no fallback/premium, every reservation equals the P-7 policy figure for that
 *      candidate, the ledger reconciles (exact = probes + amendment + per-request exact; retained =
 *      per-request timeouts; outstanding 0), a 402 halted further dispatch, canonical selection is
 *      the first recovered attempt, population files unchanged (hashes from the pre-flight state);
 *   4. copy the scratch directory verbatim into docs/ and verify by sha256.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseVerifiedUnitPackage } from "../../lib/contract-model/verified-units";
import { scanForSecrets } from "./evidence";
import { compileReservationUsd, verifyReservationUsd } from "./reservation-policy";
import { loadModel } from "./compile-run";
import { canonicalAttempt, MAX_ATTEMPTS_PER_CASE, OUT, TARGET_REFS, EXCLUDED_REF, type RecoveryAttempt } from "./run-benchmark-recovery";

export const RECOVERY_DEST = "docs/phase-3-conmed-benchmark-recovery/run";
const sha256File = (p: string) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const walk = (dir: string, out: string[] = []): string[] => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, out); else out.push(f); } return out; };
const near = (a: number, b: number, eps = 2e-6) => Math.abs(a - b) < eps;

export function validateAndPreserve(scratch = OUT, dest = RECOVERY_DEST) {
  const read = (n: string) => JSON.parse(fs.readFileSync(path.join(scratch, n), "utf8"));
  const problems: string[] = [];
  const files = walk(scratch).filter((f) => !f.endsWith("/.pid")).sort();
  const secretHits = files.flatMap((f) => scanForSecrets(fs.readFileSync(f, "utf8")).map((h) => `${path.relative(scratch, f)}: ${h.pattern}`));
  if (secretHits.length > 0) throw new Error(`SECRET LEAK - refusing to preserve: ${secretHits.join("; ")}`);

  const packageFiles = files.filter((f) => f.endsWith(".verified-units.json"));
  const packages = packageFiles.map((f) => { try { return { file: path.relative(scratch, f), pkg: parseVerifiedUnitPackage(fs.readFileSync(f, "utf8")) }; } catch (e) { problems.push(`package ${path.relative(scratch, f)}: ${(e as Error).message}`); return null; } }).filter((x): x is NonNullable<typeof x> => x !== null);

  const plan = read("00-plan.json"); const attempts = read("01-attempts.json") as RecoveryAttempt[]; const costs = read("02-costs.json") as { snapshot: Record<string, number>; perRequest: { discoveryId: string; stage: string; attempt: number; chargedToBudgetUsd: number; costAccountingStatus: string }[]; sideCalls: { discoveryId: string | null; stage: string; costUsd: number; model: string }[] };
  const preflight = read("preflight-health.json"); const manifest = fs.existsSync(path.join(scratch, "03-run-manifest.json")) ? read("03-run-manifest.json") : null;
  const model = loadModel(plan.model);
  const targets = plan.targets as { discoveryId: string; ref: string; operativeChars: number }[];
  const targetIds = new Set(targets.map((t) => t.discoveryId));
  if (targets.length !== 8 || targetIds.size !== 8) problems.push("target count != 8");
  if (JSON.stringify([...targets.map((t) => t.ref)].sort()) !== JSON.stringify([...TARGET_REFS].sort())) problems.push("targets != the eight benchmark refs");
  if (targets.some((t) => t.ref === EXCLUDED_REF)) problems.push("7.11 dispatched");
  for (const a of attempts) if (!targetIds.has(a.discoveryId)) problems.push(`NON-TARGET DISPATCH: ${a.ref}`);
  const perCase = new Map<string, RecoveryAttempt[]>();
  for (const a of attempts) perCase.set(a.ref, [...(perCase.get(a.ref) ?? []), a]);
  for (const [ref, as] of perCase) { if (as.length > MAX_ATTEMPTS_PER_CASE) problems.push(`${ref}: ${as.length} attempts`); if (as.map((a) => a.attempt).join(",") !== as.map((_, i) => i + 1).join(",")) problems.push(`${ref}: attempt numbering ${as.map((a) => a.attempt)}`); if (as.length === 2 && as[0]!.recovery === "RECOVERED") problems.push(`${ref}: retried after RECOVERED`); if (as.length === 2 && !as[0]!.retryEligible) problems.push(`${ref}: retried although ineligible (${as[0]!.retryIneligibleReason})`); }
  if (attempts.length > 16) problems.push("more than 16 attempts");
  // reservations equal the policy figure for that candidate
  for (const a of attempts) {
    if (!near(a.compile.reservationUsd ?? -1, compileReservationUsd(model, a.operativeChars), 1e-8)) problems.push(`${a.ref}#${a.attempt}: compile reservation ${a.compile.reservationUsd} != policy ${compileReservationUsd(model, a.operativeChars)}`);
    if (a.verify.reservationUsd !== undefined && !near(a.verify.reservationUsd, verifyReservationUsd(model), 1e-8)) problems.push(`${a.ref}#${a.attempt}: verify reservation != policy`);
    if (a.compile.outcome === "TIMEOUT" && !near(a.compile.costUsd, a.compile.reservationUsd ?? 0, 1e-8)) problems.push(`${a.ref}#${a.attempt}: timeout did not retain the full reservation`);
    if (a.compile.outcome === "PROVIDER_FAILURE" && (a.compile.inputTokens ?? 0) === 0 && a.compile.costUsd !== 0) problems.push(`${a.ref}#${a.attempt}: zero-token provider failure charged`);
    for (const s of a.verify.sideCalls) if (!/semantic_verification|condition_suspicion/.test(s.stage)) problems.push(`${a.ref}#${a.attempt}: unexpected verify side call ${s.stage}`);
  }
  for (const c of costs.sideCalls) if (c.model !== plan.model) problems.push(`side call on ${c.model}`);
  // ledger
  const perExact = costs.perRequest.filter((r) => r.costAccountingStatus === "EXACT").reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const perRetained = costs.perRequest.filter((r) => r.costAccountingStatus === "UNKNOWN_TIMEOUT_BILLED").reduce((s, r) => s + r.chargedToBudgetUsd, 0);
  const amendmentUsd = costs.sideCalls.filter((c) => c.discoveryId === null).reduce((s, c) => s + c.costUsd, 0);
  const snap = costs.snapshot;
  if (!near(snap.exactSpendUsd!, preflight.spendUsd + amendmentUsd + perExact)) problems.push(`ledger exact ${snap.exactSpendUsd} != probes ${preflight.spendUsd} + amendment ${amendmentUsd} + per-request exact ${perExact}`);
  if (!near(snap.retainedUnknownTimeoutUsd!, perRetained)) problems.push("ledger retained != per-request timeouts");
  if ((snap.outstandingReservedUsd ?? 0) !== 0 && manifest) problems.push("outstanding reservation after termination");
  if (!near(snap.committedUsd!, snap.exactSpendUsd! + snap.retainedUnknownTimeoutUsd! + (snap.outstandingReservedUsd ?? 0))) problems.push("committed != exact + retained + outstanding");
  if (snap.committedUsd! > plan.ceilingUsd) problems.push("ceiling exceeded");
  const statusCharges = attempts.reduce((s, a) => s + a.compile.costUsd + a.verify.costUsd, 0);
  if (!near(statusCharges, perExact + perRetained)) problems.push("attempt charges != per-request");
  if (attempts.length > 0 && !near(attempts[attempts.length - 1]!.committedUsd, snap.committedUsd!)) problems.push("last attempt committed != snapshot");
  if (plan.ceilingUsd !== 15 || plan.stopAtUsd !== 14.9) problems.push("ceiling/stopAt != 15/14.9");
  // 402 halts: any credit-exhausted attempt must be the last one
  const ce = attempts.findIndex((a) => a.recovery === "CREDIT_EXHAUSTED");
  if (ce >= 0 && ce !== attempts.length - 1) problems.push("dispatch continued after credit exhaustion");
  if (ce >= 0 && manifest && manifest.stopReason !== "GATEWAY_CREDIT_EXHAUSTED") problems.push("credit exhaustion without the stop reason");
  // packages vs attempts
  const pkgByHash = new Map(packages.map((p) => [p.pkg.packageHash, p]));
  for (const a of attempts) {
    if (a.package?.file) { const p = pkgByHash.get(a.package.packageHash); if (!p) problems.push(`${a.ref}#${a.attempt}: package not on disk`); else if (p.pkg.complete !== a.package.complete) problems.push(`${a.ref}#${a.attempt}: completeness disagrees`); }
    if (a.evidenceFile && !fs.existsSync(a.evidenceFile)) problems.push(`${a.ref}#${a.attempt}: evidence missing`);
    if (a.evidenceFile && !a.evidenceFile.includes(`/attempt-${a.attempt}/`)) problems.push(`${a.ref}#${a.attempt}: evidence not in its attempt directory`);
    if (a.recovery === "RECOVERED" && !(a.compile.outcome === "COMPLETED" && a.verify.outcome === "COMPLETED" && a.package?.complete && a.packageHashValid && a.evidenceFile)) problems.push(`${a.ref}#${a.attempt}: RECOVERED without the required evidence`);
    if (a.recovery !== "RECOVERED" && a.compile.outcome === "COMPLETED" && a.verify.outcome === "COMPLETED" && a.package?.complete && a.packageHashValid) problems.push(`${a.ref}#${a.attempt}: complete evidence not marked RECOVERED`);
  }
  // canonical determinism
  if (manifest) for (const c of manifest.cases as { ref: string; canonical: { attempt: number } | null; finalRecovered: boolean }[]) { const canon = canonicalAttempt(perCase.get(c.ref) ?? []); if ((canon?.attempt ?? null) !== (c.canonical?.attempt ?? null)) problems.push(`${c.ref}: canonical attempt ${c.canonical?.attempt} != first recovered ${canon?.attempt}`); if (c.finalRecovered !== (canon !== null)) problems.push(`${c.ref}: finalRecovered disagrees`); }
  // population immutability against the pre-flight inventory
  const start = JSON.parse(fs.readFileSync("docs/phase-3-conmed-benchmark-recovery-preflight/00-starting-state.json", "utf8"));
  const popChanged = (start.populationFiles as { file: string; sha256: string }[]).filter((f) => sha256File(path.join("docs/phase-3-conmed-population-verified", f.file)) !== f.sha256).map((f) => f.file);
  if (popChanged.length > 0) problems.push(`POPULATION FILES CHANGED: ${popChanged.join(", ")}`);

  if (fs.existsSync(dest)) throw new Error(`refusing to preserve over ${dest}`);
  fs.mkdirSync(dest, { recursive: true });
  const inventory = files.map((f) => { const rel = path.relative(scratch, f); const target = path.join(dest, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(f, target); const a = sha256File(f), b = sha256File(target); if (a !== b) problems.push(`copy mismatch ${rel}`); return { file: rel, bytes: fs.statSync(f).size, sha256: a }; });
  const report = {
    scratch, dest, terminatedNormally: manifest !== null, filesPreserved: inventory.length, bytesPreserved: inventory.reduce((s, i) => s + i.bytes, 0),
    secretHits: 0, packagesOnDisk: packages.length, packagesValidated: packages.length, packagesComplete: packages.filter((p) => p.pkg.complete).length,
    targets: targets.length, attempts: attempts.length, nonTargetDispatches: attempts.filter((a) => !targetIds.has(a.discoveryId)).length, maxAttemptsPerCase: Math.max(0, ...[...perCase.values()].map((v) => v.length)),
    ledger: { snapshot: snap, probesUsd: preflight.spendUsd, amendmentUsd, perRequestExactUsd: perExact, perRequestRetainedUsd: perRetained, ceilingUsd: plan.ceilingUsd, stopAtUsd: plan.stopAtUsd },
    populationFilesChanged: popChanged.length, problems, inventory,
  };
  fs.writeFileSync(path.join(path.dirname(dest), "01-run-validation.json"), JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1]?.endsWith("benchmark-recovery-postrun.ts")) {
  const r = validateAndPreserve();
  const { inventory, ...summary } = r;
  console.log(JSON.stringify({ ...summary, inventoryFiles: inventory.length }, null, 1));
  if (r.problems.length > 0) process.exitCode = 2;
}
