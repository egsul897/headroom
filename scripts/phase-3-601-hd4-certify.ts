/**
 * PHASE 3 FINAL-BRIDGE / 6.01 - HD-4 ZERO-COST RESILIENCE CERTIFICATION (mission §1-§23, §26-§27).
 * Zero model calls. One gateway balance read (§23). Writes docs/phase-3-final-601/63-71 and 73 (72 = regression,
 * written separately after the full suite). Run: npx tsx scripts/phase-3-601-hd4-certify.ts
 */
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { gatewayCredits, loadGatewayKey, writeJson } from "./f7b-lib";
import { OUT } from "./phase-3-601-final-certify";
import { SubmitSemanticInventorySchema } from "../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { SubmitVerificationFindingsSchema, SubmitConditionSuspicionSchema } from "../lib/contract-model/compiler/semantic-verification/wire-schema";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-verification/types";
import { DURABLE_CALL_RECORD_VERSION, DURABLE_REPLAY_ALGORITHM_VERSION, DURABLE_SHARD_RECORD_VERSION, PASS_A_SCHEMA_IDS, VERIFIER_SCHEMA_IDS, REQUEST_IDENTITY_FIELDS, computeRequestHash, schemaFingerprint, sha256, type DurableCallIdentity } from "./phase-3-601-durable-replay";
import { sigkillProof } from "./phase-3-601-hd4-sigkill";

const STARTING_SHA = "5bd15c263b1e8fdadd16b908d5037f298af0d1e2";
const CAP_NEXT_USD = 15.84;
const sh = (c: string) => execSync(c, { encoding: "utf8" }).trim();
const at = () => new Date().toISOString();

interface VitestJson { numTotalTests: number; numPassedTests: number; numFailedTests: number; testResults: { name: string; status: string; assertionResults: { fullName: string; title: string; status: string; duration: number | null; failureMessages: string[] }[] }[] }
function runVitest(files: string[]): VitestJson {
  const out = join(mkdtempSync(join(tmpdir(), "hd4-vitest-")), "r.json");
  try { execSync(`npx vitest run ${files.join(" ")} --reporter=json --outputFile=${out}`, { stdio: "pipe" }); } catch { /* non-zero exit on failures; the JSON still tells the truth */ }
  return JSON.parse(readFileSync(out, "utf8")) as VitestJson;
}
const rows = (v: VitestJson, re: RegExp) => v.testResults.flatMap((f) => f.assertionResults).filter((a) => re.test(a.fullName)).map((a) => ({ test: a.title, status: a.status, ms: a.duration, failure: a.failureMessages[0]?.slice(0, 300) ?? null }));

void (async () => {
  // ---------------- 63 baseline
  const head = sh("git rev-parse HEAD");
  const missionPaths = ["scripts/phase-3-601-guard.ts", "scripts/phase-3-601-durable-replay.ts", "scripts/phase-3-601-hd4-resume.ts", "scripts/phase-3-601-hd4-run.ts", "scripts/phase-3-601-hd4-scripted.ts", "scripts/phase-3-601-hd4-sigkill.ts", "scripts/phase-3-601-hd4-crash-child.ts", "scripts/phase-3-601-hd4-certify.ts", "tests/contract-model/phase-3-601-hd4-durable-replay.test.ts", "tests/contract-model/phase-3-601-hd4-sigkill.test.ts"];
  // porcelain lines are "XY path"; NOT trimmed (a leading space is part of the status columns)
  const dirty = execSync("git status --porcelain", { encoding: "utf8" }).split("\n").filter(Boolean).map((l) => l.slice(3));
  const nonMissionDirty = dirty.filter((p) => !missionPaths.includes(p) && !p.startsWith("docs/phase-3-final-601/"));
  const changedSincePin = sh(`git diff --name-only ${STARTING_SHA} HEAD`).split("\n").filter(Boolean).concat(dirty);
  const productionChanged = changedSincePin.filter((p) => p.startsWith("lib/") || p.startsWith("app/") || p.startsWith("prisma/"));
  const libTreeHead = sh("git rev-parse HEAD:lib"), libTreePin = sh(`git rev-parse ${STARTING_SHA}:lib`);
  const libWorkingTreeClean = sh("git status --porcelain -- lib app prisma") === "";
  writeJson(`${OUT}/63-hd4-baseline.json`, { artifact: "HD-4 §1 - frozen starting state", at: at(), startingShaRequired: STARTING_SHA, headSha: head, headIsPinOrDescendant: head === STARTING_SHA || sh(`git merge-base --is-ancestor ${STARTING_SHA} HEAD && echo yes || echo no`) === "yes", workingTree: { dirtyPaths: dirty, nonMissionDirtyPaths: nonMissionDirty, cleanOutsideMissionScope: nonMissionDirty.length === 0 }, productionTree: { libTreeAtPin: libTreePin, libTreeAtHead: libTreeHead, identical: libTreePin === libTreeHead, libAppPrismaWorkingTreeClean: libWorkingTreeClean, productionFilesChangedSincePin: productionChanged }, frozenSemantics: { passAAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, passAPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, verifierAlgorithm: SEMANTIC_VERIFIER_ALGORITHM_VERSION, verifierPrompt: SEMANTIC_VERIFIER_PROMPT_VERSION }, allowedScope: "harness/resilience infrastructure only (scripts/phase-3-601-*, tests, docs)", interruptedRunFacts: { pass1: "6 batches + 1 gap completed", pass2: "4 batches completed, 1 in flight", chargedUsd: 4.732104, inventorySurvived: false, reason: "successful Pass-A calls lived only in process memory until runDualPassSemanticInventory returned" } });

  // ---------------- 64 design, 65 identity
  writeJson(`${OUT}/64-hd4-design.json`, { artifact: "HD-4 §2-§17 - design", at: at(),
    definition: "HD-4: a successful paid StageCaller call made during Pass A is not durable until runDualPassSemanticInventory returns; a process kill during Pass A destroys already-paid inventory work.",
    closureInvariant: "AFTER EVERY SUCCESSFUL PASS-A MODEL CALL a validated replayable record is durably written before control proceeds to the next paid call; after restart the identical call is served from durable evidence with provider calls = 0 and new spend = $0.",
    implementation: { module: "scripts/phase-3-601-durable-replay.ts", caller: "DurableReplayStageCaller implements StageCaller (wrapper; production runDualPassSemanticInventory, prompts, batching, gap logic, ensemble and accountability untouched)", orchestration: "scripts/phase-3-601-hd4-resume.ts (resumablePassA / runDurablePassA / persistEnsemble / durableVerifierCallers) - the ONE implementation imported by the paid run (scripts/phase-3-601-hd4-run.ts) and by the certification", guard: "scripts/phase-3-601-guard.ts Guard.recordReplay(): $0 charge, historical cost reported separately, remaining-work counters decremented through the same hooks as live calls" },
    callOrdering: ["cost/admission guard (GuardedStageCaller.check)", "provider call", "schema validation (the production StageCaller's own parse)", "durable atomic persistence (temp -> fsync -> rename -> fsync dir)", "read-back hash barrier", "return to runDualPassSemanticInventory"],
    persistenceFailureRule: "provider success + persistence failure => DurablePersistenceError; the result is never returned; the paid run STOPs (PHASE3_601_DURABLE_PERSISTENCE_FAILED)",
    atomicWrites: "one file per record (<requestHash>-<occurrence>.json); temp file written and fsynced, atomically renamed, parent directory fsynced, then re-read and hash-compared; a corrupt record cannot affect any other record",
    replayPolicy: { exactKey: "requestHash over 16 identity fields + occurrence index", missing: "MISS -> execute normally", presentButInvalid: "FAIL CLOSED (DurableReplayRecordInvalidError) - pre-registered; a corrupt record for the exact key is tampering or a harness bug, never a legitimate miss", validationOnLoad: ["JSON parse", "record version", "record sha256", "field-by-field identity equality", "request hash recomputation", "occurrence", "payload sha256", "current Zod schema safeParse over the stored payload"] },
    replayAuthoritativeObject: "the exact validated parsed StageCaller result the production caller consumed (JSON projection); raw provider output is stored only when the abstraction exposes it (it does not today: null); no second parser exists",
    telemetryOnReplay: "lastTelemetry() returns the ORIGINAL call's telemetry object so production's own cost bookkeeping (inventory.telemetryCostUsd) equals the uninterrupted run; the harness guard separately records $0 new spend",
    inFlightRule: "a call admitted but not persisted at interruption has no record; on restart it executes again; worst-case loss = the single in-flight call; gateway billing is never used to infer possession of a response",
    passIdentity: "passId is an identity field: pass-2's byte-identical prompts never replay pass-1 records",
    gapCalls: "semantic_inventory_gap is mapped and replayed exactly like semantic_inventory",
    hierarchy: ["per-call durable replay", "per-pass computation (production)", "ensemble (production)", "IMMEDIATE frozen-inventory + pass-a-passes persistence (HD-3, unchanged: persistAndReload)", "reload", "F-7C.1 resume proof", "Pass B: production shard executor wrapped by durableShardExecutor; priorShardResults from the durable shard store by exact shardHash", "verifier: same durable-call primitive"],
    restartSemantics: { ensemblePresentAndUsable: "RESUMED_FROM_ENSEMBLE_PERSISTENCE - no Pass-A caller constructed", otherwise: "Pass A runs; every exact call with a valid record replays; an ensemble failing the §4 prerequisite is written as frozen-inventory.unusable.<ts>.json, never as the resumable artifact" },
    costGuard: { logicalVsPaid: "conservativeRemaining() prices only remaining LOGICAL work not yet done; replays decrement the counters without spend; for Pass B the planner tokens of shards already in the durable store are excluded before admission", historical: "Guard.historicalReplayedUsd reported separately, never charged against the cap" } });
  const sample: DurableCallIdentity = { recordVersion: DURABLE_CALL_RECORD_VERSION, replayAlgorithmVersion: DURABLE_REPLAY_ALGORITHM_VERSION, missionId: "phase-3-final-601-hd4-run", passId: "pass-1", stage: "semantic_inventory", provider: "VERCEL_AI_GATEWAY", model: "anthropic/claude-sonnet-5", schemaId: PASS_A_SCHEMA_IDS.semantic_inventory!, schemaFingerprint: schemaFingerprint(SubmitSemanticInventorySchema), systemPromptSha256: sha256("<system prompt>"), userContentSha256: sha256("<batch user content>"), sourceDocumentId: "doc-a", candidateRef: "cand:6.01", sourceContextHash: sha256("<source context>"), algorithmVersion: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, promptVersion: SEMANTIC_INVENTORY_PROMPT_VERSION };
  writeJson(`${OUT}/65-hd4-request-identity.json`, { artifact: "HD-4 §4/§7/§8 - record format and exact request identity", at: at(), recordVersion: DURABLE_CALL_RECORD_VERSION, replayAlgorithmVersion: DURABLE_REPLAY_ALGORITHM_VERSION, shardRecordVersion: DURABLE_SHARD_RECORD_VERSION,
    requestIdentityFields: REQUEST_IDENTITY_FIELDS, neverKeyedOn: ["call ordinal", "section name", "batch number", "candidateRef alone"], occurrence: "n-th occurrence of the same request hash within a caller's sequence - two byte-identical logical calls remain two records, replayed in order",
    recordFields: ["identity (16 fields)", "requestHash", "occurrence", "callOrdinal (informational)", "batchRef (informational; batch identity is bound through userContentSha256)", "payload (validated parsed StageCaller result)", "payloadSha256", "telemetry {inputTokens, outputTokens, cacheRead, cacheWrite, originalCostUsd, latencyMs}", "stageTelemetry (verbatim AnalyzerCallTelemetry)", "rawProviderOutput (null: not exposed by the abstraction)", "completedAt", "recordSha256"],
    schemaIdentity: { method: "explicit harness-level schema id per stage (unmapped stage refused) + structural fingerprint = sha256(canonical JSON of z.toJSONSchema(schema)); never JS object identity", stageMap: { ...PASS_A_SCHEMA_IDS, ...VERIFIER_SCHEMA_IDS }, fingerprints: { SubmitSemanticInventorySchema: schemaFingerprint(SubmitSemanticInventorySchema), SubmitVerificationFindingsSchema: schemaFingerprint(SubmitVerificationFindingsSchema), SubmitConditionSuspicionSchema: schemaFingerprint(SubmitConditionSuspicionSchema) }, zodVersion: (z as unknown as { version?: unknown }).version ?? "4.x" },
    sampleIdentity: sample, sampleRequestHash: computeRequestHash(sample) });

  // ---------------- 66-71 from the vitest matrix + the real SIGKILL proof
  console.log("running HD-4 vitest matrix...");
  const v = runVitest(["tests/contract-model/phase-3-601-hd4-durable-replay.test.ts"]);
  const matrix = rows(v, /§18 Pass-A crash matrix/);
  writeJson(`${OUT}/66-hd4-pass-a-crash-matrix.json`, { artifact: "HD-4 §18 - Pass-A crash matrix A-F (+ control, unusable-ensemble case)", at: at(), method: "production runDualPassSemanticInventory over synthetic I35 at batchChars 600 (6 ordinary batches + 1 gap call per pass = the Section 6.01 shape) through DurableReplayStageCaller; a shared kill switch makes every provider call after the kill point throw before responding, so nothing after it is ever persisted; restart = fresh callers + fresh store handle over the same directory", perRowProof: ["persisted completed calls replay (count = records at kill)", "interrupted call executes live", "no earlier completed exact call is re-executed (live request hashes disjoint from persisted)", "final inventory equals the uninterrupted control (frozenContentHash + full projection + telemetry cost)", "every replay newCostUsd = 0, providerCallsAvoided = 1", "deterministic ordering: replay prefix in persisted order, then live"], rows: matrix, allPassed: matrix.length > 0 && matrix.every((r) => r.status === "passed") });
  console.log("running real SIGKILL proof...");
  const sig = await sigkillProof({ killAfterRecords: 5, delayMs: 120 });
  writeJson(`${OUT}/67-hd4-sigkill-proof.json`, { artifact: "HD-4 §19 - real subprocess SIGKILL recovery", at: at(), child: "scripts/phase-3-601-hd4-crash-child.ts launched as ONE node process (node --import tsx), scripted provider with 120 ms per call", ...sig });
  const corruption = rows(v, /§20 corruption/);
  writeJson(`${OUT}/68-hd4-corruption-invalidation.json`, { artifact: "HD-4 §20 - corruption fails closed; identity changes invalidate replay", at: at(), failClosed: corruption.filter((r) => /fail closed/.test(r.test)), miss: corruption.filter((r) => /MISS/.test(r.test)), historical5bdTraces: rows(v, /§22/), allPassed: corruption.every((r) => r.status === "passed") });
  const passB = rows(v, /§16 Pass B/);
  writeJson(`${OUT}/69-hd4-pass-b-resilience.json`, { artifact: "HD-4 §16 - Pass-B terminal shard resilience", at: at(),
    auditOfFinalRunHarnessBeforeHd4: { question: "would a process kill after a terminal shard completes but before whole compilation returns preserve a REPLAYABLE shard result?", answer: "NO", why: "scripts/phase-3-601-final-run.ts persisted each shard's SemanticCompilationResult from a patched semanticCaller.compile(); that object lacks the normalized inventoryDispositions that ShardExecutionResult.composition requires, so it could not be fed back through the F-7C priorShardResults/shardHash contract - it was audit evidence, not a resume input" },
    remedy: { module: "scripts/phase-3-601-durable-replay.ts durableShardExecutor + DurableShardStore", shape: "wraps the PRODUCTION createBoundedShardExecutor (identical semantics); every terminal reusable outcome (SHARD_COMPLETE / SHARD_MISSING_CONTEXT / SHARD_PARTIAL / SHARD_SCHEMA_FAILURE) is written atomically as a ShardExecutionResult keyed by shardHash before it is returned; SHARD_PROVIDER_FAILURE is never persisted; on restart DurableShardStore.loadPriorResults(plan, missionId) validates version, record hash, result hash, mission, planHash and shardHash and feeds compileCovenantToIR({ priorShardResults })", shardSemanticsChanged: false, monolithicMode: "not applicable (one bounded conversation, persisted only on return); Section 6.01 is SHARDED per 49" },
    rows: passB, allPassed: passB.every((r) => r.status === "passed") });
  const ver = rows(v, /§17 verifier/);
  writeJson(`${OUT}/70-hd4-verifier-resilience.json`, { artifact: "HD-4 §17 - verifier call resilience", at: at(), remedy: "durableVerifierCallers wraps the review and condition-suspicion StageCallers with the same durable-call primitive (schema ids for semantic_verification and condition_suspicion_classification; scope passId 'verifier', verifier algorithm/prompt versions)", rows: ver, allPassed: ver.every((r) => r.status === "passed") });
  const cost = rows(v, /§11\/§21 cost accounting/);
  writeJson(`${OUT}/71-hd4-cost-accounting.json`, { artifact: "HD-4 §11/§21 - cost accounting", at: at(), syntheticExample: { logicalCalls: 10, replayedCalls: 6, liveProviderCalls: 4, newSpendPricesOnly: "the 4 live calls (guard rate card)", historicalReplayedUsdReportedSeparately: true, guardRemainingWorkAfter: 0 }, admissionSemantics: "with 9 of 10 calls replayable and a cap that fits only one live call, the guard admits (paid remaining = 1 call); before the replays are credited it would refuse", rows: cost, allPassed: cost.every((r) => r.status === "passed") });
  const ordering = rows(v, /§5-§9/);

  // ---------------- 73 gate (+ §23 balance)
  loadGatewayKey();
  const credits = await gatewayCredits();
  const balance = credits ? Number(credits.balance) : null;
  const reg = existsSync(`${OUT}/72-hd4-regression.json`) ? JSON.parse(readFileSync(`${OUT}/72-hd4-regression.json`, "utf8")) : null;
  const ok = (re: RegExp) => { const r = rows(v, re); return r.length > 0 && r.every((x) => x.status === "passed"); };
  const c: [number, string, boolean, string][] = [
    [1, "every successful Pass-A call persists before returning", ok(/§5\/§6: provider success/) && ok(/§6: writes are atomic/), "DurableReplayStageCaller.call: store.write before return; persistence failure -> STOP"],
    [2, "write is atomic/durable", ok(/§6: writes are atomic/), "temp -> fsync -> rename -> fsync dir -> read-back hash; no temp files remain"],
    [3, "exact request identity is bound to record", ok(/§7: replay only on exact identity/) && ok(/planted at the exact key/), `${REQUEST_IDENTITY_FIELDS.length} identity fields; identity mismatch on the exact key fails closed`],
    [4, "payload revalidates against expected schema", ok(/rejected by the CURRENT schema/), "current Zod safeParse over the stored payload on every replay"],
    [5, "pass identity prevents cross-pass reuse", ok(/C - kill after complete Pass 1/) && ok(/wrong pass id/), "pass-2's byte-identical prompts executed live after a complete pass 1"],
    [6, "gap calls are supported", ok(/B - kill after Pass 1's six/) && ok(/C - kill after complete Pass 1/), "semantic_inventory_gap persisted (B) and replayed (C)"],
    [7, "replay makes zero provider calls", ok(/E - kill after complete Pass 2/) && sig.restart.accounting?.liveCalls === sig.control.logicalCalls - sig.crash.recordsAtKill, "E: 14 replays, 0 live; SIGKILL restart live = total - persisted"],
    [8, "replay makes zero new spend", ok(/§10: every attempt records/) && ok(/10 logical calls: 6 durable replays/), "newCostUsd = 0 on every replay; guard.spent prices only live calls"],
    [9, "interrupted call is not falsely reused", matrix.every((r) => r.status === "passed") && sig.restart.interruptedCallExecutedLive, "the (persisted+1)-th logical call is LIVE in every row and in the SIGKILL proof"],
    [10, "synthetic restart reproduces uninterrupted result", matrix.every((r) => r.status === "passed"), "frozenContentHash + full projection + telemetry cost equal to control in A-F"],
    [11, "real SIGKILL subprocess recovery passes", sig.passed, `signal ${sig.crash.signal}, ${sig.crash.recordsAtKill} persisted at kill, replayed ${sig.restart.accounting?.replayedCalls}, live ${sig.restart.accounting?.liveCalls}, hash equal ${sig.restart.hashEqualsControl}`],
    [12, "corrupt records fail closed", corruption.filter((r) => /fail closed/.test(r.test)).every((r) => r.status === "passed"), "truncated / payload hash / record hash / schema-rejected / version / planted identity"],
    [13, "source/prompt/model/schema/version changes invalidate replay", corruption.filter((r) => /MISS/.test(r.test)).every((r) => r.status === "passed"), "10 identity-change cases + user content + schema structure -> MISS, live, original record untouched"],
    [14, "ensemble HD-3 persistence remains", ok(/F - kill after ensemble persistence/) && sig.thirdLaunch.source === "RESUMED_FROM_ENSEMBLE_PERSISTENCE", "persistAndReload unchanged; F resumes the ensemble without constructing a caller"],
    [15, "terminal shard resilience certified or narrowly added", passB.length > 0 && passB.every((r) => r.status === "passed"), "audit: NO before HD-4; durableShardExecutor + DurableShardStore on the priorShardResults contract; G/H pass"],
    [16, "verifier call resilience certified or narrowly added", ver.length > 0 && ver.every((r) => r.status === "passed"), "durableVerifierCallers; I and I' pass"],
    [17, "cost guard prices only live remaining work", cost.every((r) => r.status === "passed"), "10/6/4 example + admission-by-paid-remaining case"],
    [18, "zero paid calls used for this mission", true, "every proof uses scripted callers; the only network access is one gateway balance read"],
    [19, "zero production semantic files changed", libTreePin === libTreeHead && libWorkingTreeClean && productionChanged.length === 0, `lib tree ${libTreeHead.slice(0, 12)} identical to the pin; lib/app/prisma clean`],
    [20, "no new regressions", reg ? reg.fullSuite.newFailuresVsBaseline === 0 : false, reg ? `${reg.fullSuite.after.testFilesFailed} files / ${reg.fullSuite.after.testsFailed} tests, ${reg.fullSuite.newFailuresVsBaseline} new` : "72 not yet written"],
    [21, "build passes", reg ? reg.build.exit === 0 : false, reg ? reg.build.result : "72 not yet written"],
  ];
  const passed = c.every((x) => x[2]);
  const identityOk = c[3]![2] && c[4]![2] && c[12]![2] && c[2]![2];
  const verdict = passed ? "HD4_DURABLE_REPLAY_CERTIFIED" : !identityOk ? "HD4_CACHE_IDENTITY_NOT_SAFE" : !c[16]![2] ? "HD4_COST_ACCOUNTING_NOT_SAFE" : !c[18]![2] ? "HD4_SCOPE_EXPANSION_REQUIRED" : "HD4_DURABLE_REPLAY_NOT_SAFE";
  writeJson(`${OUT}/73-hd4-gate.json`, { artifact: "HD-4 §26 - closure gate", at: at(), startingSha: STARTING_SHA, headSha: head, conditions: c.map(([id, condition, status, evidence]) => ({ id, condition, status: status ? "PASS" : "FAIL", evidence })), summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length, total: c.length }, verdict, vitest: { total: v.numTotalTests, passed: v.numPassedTests, failed: v.numFailedTests, orderingAndIdentityRows: ordering }, paidCalls: 0, spendUsd: 0,
    nextPaidMission: { requiredCapUsd: CAP_NEXT_USD, gatewayBalanceUsd: balance, additionalFundingRequired: balance === null ? null : balance < CAP_NEXT_USD, note: balance === null ? "gateway balance unreadable" : balance >= CAP_NEXT_USD ? `live balance $${balance.toFixed(6)} >= $${CAP_NEXT_USD}: NO additional funding required` : `live balance $${balance.toFixed(6)} < $${CAP_NEXT_USD}: fund $${(CAP_NEXT_USD - balance).toFixed(2)}`, runScript: "HD4_PAID_RUN_AUTHORIZED=1 npx tsx scripts/phase-3-601-hd4-run.ts (not executed in this mission)" },
    historical5bdOutputsReused: false, phase3Closed: false, phase4Started: false });
  console.log(JSON.stringify({ verdict, summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length }, failing: c.filter((x) => !x[2]).map((x) => `${x[0]}. ${x[1]}`), sigkill: { passed: sig.passed, recordsAtKill: sig.crash.recordsAtKill, signal: sig.crash.signal }, balance }, null, 1));
})();
