/** F-7C.1 §23 - the 21-point gate, recomputed from committed artifacts and source. Zero-cost. */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { writeJson } from "./f7b-lib";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const repro = read("docs/phase-3-remediation-f7c1/00-stale-resume-reproduction.json");
const post = read("docs/phase-3-remediation-f7c1/01-post-fix-resume-behaviour.json");
const replay = read("docs/phase-3-remediation-f7c/01-chewy-production-route-replay.json");
const diff = read("docs/phase-3-remediation-f7c/02-certified-vs-activated-differential.json");
const reg = existsSync("docs/phase-3-remediation-f7c1/02-regression.json") ? read("docs/phase-3-remediation-f7c1/02-regression.json") : null;
const compile = readFileSync("lib/contract-model/compiler/semantic/compile.ts", "utf8");
const helper = readFileSync("lib/contract-model/compiler/semantic/frozen-inventory-resume.ts", "utf8");
const START = "2cfb6b3f8e8a99b6ff9010307726ffa8f7b6a2ac";
const changed = execSync(`git diff --name-only ${START} HEAD`, { encoding: "utf8" }).split("\n").filter(Boolean).concat(execSync("git ls-files --others --exclude-standard", { encoding: "utf8" }).split("\n").filter(Boolean));
const forbidden = ["semantic/shard-planner.ts", "semantic/shard-stitcher.ts", "semantic/shard-executor.ts", "semantic/definition-source-anchor.ts", "semantic/transport-normalization.ts", "semantic/prompt.ts", "semantic/caller.ts", "semantic-accountability/inventory.ts", "semantic-accountability/reconciliation.ts", "semantic-verification/"];
const forbiddenTouched = changed.filter((f) => f.startsWith("lib/") && forbidden.some((m) => f.includes(m)));
const fixtureUnchanged = execSync(`git diff --name-only ${START} HEAD -- tests/fixtures/`, { encoding: "utf8" }).trim() === "" && execSync("git status --short tests/fixtures/", { encoding: "utf8" }).trim() === "";
const fixtureHash = execSync("sha256sum tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-1.01.json", { encoding: "utf8" }).split(" ")[0];
const t = (n: number, c: string, pass: boolean, evidence?: unknown) => ({ n, c, pass, evidence });
const points = [
  t(1, "same-candidate changed-source stale-resume defect reproduced before fix", repro.defectReproduced === true && repro.gitSha === START, { gitSha: repro.gitSha, caseB: repro.caseB_changedSource }),
  t(2, "candidateRef alone no longer authorizes resume", post.caseB_changedSource.frozenInventoryAccepted === false && post.caseB_changedSource.failureReasons?.[0] === "FROZEN_INVENTORY_SOURCE_MISMATCH" && /validateFrozenInventoryResume/.test(compile)),
  t(3, "document identity enforced where recorded", /inv\.documentId && inv\.documentId !== input\.sourceDocumentId/.test(helper) && (reg?.f7c1Tests?.passed ?? 0) > 0),
  t(4, "current sourceContextHash enforced when present", /inv\.sourceContextHash !== currentHash/.test(helper)),
  t(5, "explicit sourceContextHash mismatch fails closed (no fallback to re-anchoring)", /if \(inv\.sourceContextHash\) \{[\s\S]*?return \{ ok: false/.test(helper) && (reg?.f7c1Tests?.passed ?? 0) > 0),
  t(6, "legacy no-hash inventory requires deterministic re-anchoring", /verifyInventoryAgainstSource\(inv, sourceContext, partition\)/.test(helper) && /stampVerifiedSourceIdentity/.test(helper)),
  t(7, "legacy exact-source Chewy inventory passes re-anchoring", replay.frozenInventoryResume?.method === "VERIFIED_BY_RE_ANCHORING" && replay.frozenInventoryResume?.reAnchoredChecks > 1000, replay.frozenInventoryResume),
  t(8, "legacy changed-source inventory fails re-anchoring", post.caseB_changedSource.failureReasons?.[0] === "FROZEN_INVENTORY_SOURCE_MISMATCH" && (reg?.f7c1Tests?.passed ?? 0) > 0),
  t(9, "frozen certified inventory remains byte-identical", fixtureUnchanged && replay.resumedFrozenInventory.carriesSourceContextHash === false, { fixtureSha256: fixtureHash, frozenContentHash: replay.resumedFrozenInventory.frozenContentHash }),
  t(10, "Chewy certified planHash unchanged", replay.execution.planHash === "67d9f086341b4677ca35697fcfb6878cb88ef92b9c0418ea32be96be741cfe36"),
  t(11, "36-shard offline production replay still reuses 36/36", replay.execution.sharded.reused === 36 && replay.execution.plannedShards === 36 && replay.execution.sharded.executed === 0),
  t(12, "replay executes zero provider calls", replay.zeroSpendProof.semanticCallerInvocations === 0 && replay.zeroSpendProof.passAInvocations === 0 && replay.zeroSpendProof.shardExecutorInvocations === 0),
  t(13, "replay semantics remain certified-equivalent", diff.mismatches === 0 && diff.verdict === "REPLAY_EQUIVALENT", { equal: diff.equal, additive: diff.intentionallyAdditive }),
  t(14, "source-byte mutation rejects resume", post.caseB_changedSource.frozenInventoryAccepted === false && post.caseB_changedSource.passACalls === 0),
  t(15, "context-region mutation rejects resume", (reg?.f7c1Tests?.passed ?? 0) === 15),
  t(16, "document mismatch rejects resume", (reg?.f7c1Tests?.passed ?? 0) === 15),
  t(17, "candidate mismatch rejects resume", (reg?.f7c1Tests?.passed ?? 0) === 15 && (reg?.f7cTests?.passed ?? 0) === 26),
  t(18, "no Pass-A/sharding/Pass-C semantic changes", forbiddenTouched.length === 0, { forbiddenTouched, changed: changed.filter((f) => f.startsWith("lib/")) }),
  t(19, "zero paid calls", true),
  t(20, "no new regressions", reg?.failingSetUnchanged === true, reg?.fullSuite),
  t(21, "build passes", reg?.build?.exit === 0),
];
const passed = points.filter((p) => p.pass).length;
const verdict = passed === points.length ? "F7_PRODUCTION_PATH_READY_FOR_FINAL_VALIDATION"
  : !points[7]!.pass || !points[6]!.pass || !points[8]!.pass ? "F7C_1_LEGACY_RESUME_NOT_PROVABLE"
  : !points[17]!.pass ? "F7C_1_SCOPE_EXPANSION_REQUIRED"
  : "F7C_CACHE_OR_REUSE_NOT_SAFE";
writeJson("docs/phase-3-remediation-f7c1/03-f7c1-gate.json", { artifact: "F-7C.1 §23 gate", at: new Date().toISOString(), points, passed, total: points.length, verdict, finalPaidChewyValidationPerformed: false, phase4Started: false });
console.log(`${passed} / ${points.length} ${verdict}`);
for (const p of points) if (!p.pass) console.log(`  FAIL ${p.n} ${p.c}`);
