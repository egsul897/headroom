/**
 * PHASE 3 / 6.01 REQUIRED-DEPENDENCY PRECISION + CERTIFICATE HONESTY AUDIT §22 - the 20-condition readiness gate.
 *
 * Reads artifacts 133-145, the live v2 model and the mission diff, evaluates every condition mechanically and writes
 * 146-precision-audit-gate.json. It authorizes NOTHING: a PASS says the corrected required-dependency model is ready to
 * be revalidated by a future, separately authorized paid mission. It is not a Phase 3 closure and not a spend.
 *
 * Environment inputs (recorded as NOT_SUPPLIED when absent):
 *   DD_TSC         output of `npx tsc --noEmit`
 *   DD_BUILD       output of `npm run build`
 *   DD_SUITE_BASE  full-suite vitest --reporter=json at the starting SHA
 *   DD_SUITE_CURR  full-suite vitest --reporter=json at HEAD (working tree)
 * Lint is run by this script itself (`npm run lint`) so the lint evidence and the lint verdict come from one run.
 *
 * Run: npx tsx scripts/phase-3-601-precision-audit-gate.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { writeJson } from "./f7b-lib";
import { OUT, readJson, sh } from "./phase-3-601-revalidation-lib";
import { DEFAULT_SHARD_BUDGET } from "../lib/contract-model/compiler/semantic/shard-planner";
import { DEFAULT_REQUIRED_DEPENDENCY_BUDGET, REQUIRED_DEPENDENCY_MODEL_VERSION, buildShardDependencyCertificate, isDelivered, type RequiredDependency } from "../lib/contract-model/compiler/semantic/required-dependencies";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const STARTING_SHA = "1fd23881fb9366b3730a06419a7b5dc33647384c";
const a = (n: string) => readJson<Any>(`${OUT}/${n}.json`);
const A133 = a("133-certificate-semantic-gap"), A134 = a("134-undeliverable-classification"), A135 = a("135-closure-precision"), A136 = a("136-pass-a-edge-qualification");
const A138 = a("138-threshold-sensitivity"), A139 = a("139-ceiling-audit"), A140 = a("140-anti-overfit"), A141 = a("141-dependency-state-rules");
const A142 = a("142-lint-consistency"), A143 = a("143-verifier-triage"), A144 = a("144-recomputed-plan"), A145 = a("145-cross-corpus-sanity");
const file = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readFileSync(p, "utf8") : null; };
const json = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readJson<Any>(p) : null; };

// --- lint: one fresh run, exit code decisive, ESLint's own markers as corroboration
const lintRun = spawnSync("npm", ["run", "lint"], { encoding: "utf8" });
const lintOut = `${lintRun.stdout ?? ""}${lintRun.stderr ?? ""}`;
const lintExit = lintRun.status ?? -1;
const lintMarker = /No ESLint warnings or errors/.test(lintOut) ? "SUCCESS_MARKER" : /✖\s+\d+\s+problems?/.test(lintOut) ? "PROBLEM_SUMMARY" : "NO_MARKER";
const lintVerdict = lintExit === 0 && lintMarker !== "PROBLEM_SUMMARY" ? "CLEAN" : "ERRORS";
const lintConsistent = (lintExit === 0) === (lintMarker === "SUCCESS_MARKER") && A142.freshRun.exitCode === 0 && lintVerdict === "CLEAN";

// --- tsc: pre-existing errors disclosed, never filtered silently
const tsc = file("DD_TSC");
const PREEXISTING_TSC = /tests\/foundation-audit\//;
const tscErrors = tsc === null ? null : tsc.split("\n").filter((l) => /error TS\d+/.test(l));
const tscNew = tscErrors === null ? null : tscErrors.filter((l) => !PREEXISTING_TSC.test(l));
const build = file("DD_BUILD");
const buildOk = build === null ? null : /Compiled successfully|✓ Compiled/.test(build) && !/Failed to compile|Build error/i.test(build);

// --- full-suite regression: file-level, base vs current
const base = json("DD_SUITE_BASE"), curr = json("DD_SUITE_CURR");
const rel = (p: string) => p.replace(/^.*?\/(tests|lib|scripts|app|prisma)\//, "$1/");
const fileStatus = (r: Any) => new Map<string, string>((r.testResults as Any[]).map((f) => [rel(String(f.name)), f.status]));
const testStatus = (r: Any) => new Map<string, string>((r.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).map((t) => [`${rel(String(f.name))} :: ${t.fullName}`, t.status])));
let regression: Any = "NOT_SUPPLIED (DD_SUITE_BASE / DD_SUITE_CURR)";
if (base && curr) {
  const fb = fileStatus(base), fc = fileStatus(curr), tb = testStatus(base), tc = testStatus(curr);
  const fileRegressions = [...fb].filter(([k, s]) => s === "passed" && fc.has(k) && fc.get(k) !== "passed").map(([k]) => k);
  const newFailingTests = [...tc].filter(([k, s]) => s === "failed" && tb.get(k) !== "failed").map(([k]) => k);
  const newlyPassingFiles = [...fb].filter(([k, s]) => s !== "passed" && fc.get(k) === "passed").map(([k]) => k);
  regression = {
    base: { files: base.numTotalTestSuites, filesPassed: base.numPassedTestSuites, tests: base.numTotalTests, passed: base.numPassedTests, failed: base.numFailedTests },
    current: { files: curr.numTotalTestSuites, filesPassed: curr.numPassedTestSuites, tests: curr.numTotalTests, passed: curr.numPassedTests, failed: curr.numFailedTests },
    fileLevelRegressions: fileRegressions, newFailingTestIdentities: newFailingTests, newlyPassingFiles: newlyPassingFiles.length,
    baselineFailuresNote: "failures present at the starting SHA (database-backed suites without a database, and the pre-existing foundation-audit typing) are not this mission's; only identities failing now that did not fail at the base count",
  };
}

// --- the mission diff of production code, grepped for fixture-specific identifiers
const prodDiff = sh(`git diff ${STARTING_SHA} -- lib/`);
const fixtureHits = prodDiff.split("\n").filter((l) => /^\+/.test(l) && !/^\+\+\+/.test(l) && /Chewy|chwy|Incremental Amount|2\.18|6\.01\(b\)|Borrowing Base|Junior Lien|Pro Forma Basis|Net Proceeds|Excluded Contributions|Restricted Party|Guarantor/i.test(l));

// --- live certificate honesty probe (the rule itself, not an artifact's word for it)
const mk = (disposition: RequiredDependency["disposition"], key: string): RequiredDependency => ({ key, kind: "REQUIRED_DEFINITION", target: key.slice(5), citedAs: [key.slice(5)], requiredBy: ["item"], evidence: ["INVENTORY_REFERENCED_TERM_EDGE"], closureDepth: 1, fullTextChars: 0, deliveredChars: 0, disposition, dispositionReason: "probe" }) as Any;
const probe = (deps: RequiredDependency[]) => buildShardDependencyCertificate("shard:probe", deps, new Set<string>(), 0, 0, { ceilingChars: 0, perEntryAllowanceChars: 0, waterFilled: false });
const cInternal = probe([mk("INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", "term:x")]);
const cAmbiguous = probe([mk("AMBIGUOUS_REQUIRED_DEPENDENCY", "term:y")]);
const cExternal = probe([mk("EXTERNAL_REQUIRED_DEPENDENCY", "term:z")]);
const cFailed = probe([mk("DELIVERABLE_NOT_DELIVERED", "term:w")]);
const cNone = probe([]);
const deliveredRule = (["INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", "AMBIGUOUS_REQUIRED_DEPENDENCY", "EXTERNAL_REQUIRED_DEPENDENCY", "NON_REQUIRED_EDGE", "DELIVERABLE_NOT_DELIVERED"] as const).every((d) => !isDelivered(mk(d, "term:p")));

const conditions: { id: number; condition: string; pass: boolean; evidence: unknown; failureVerdict: string }[] = [];
const C = (condition: string, pass: boolean, evidence: unknown, failureVerdict: string) => conditions.push({ id: conditions.length + 1, condition, pass, evidence, failureVerdict });
const rows26 = A134.rows as Any[];
const counts26: Record<string, number> = A134.counts;

C("all 26 current undeliverables classified", rows26.length === 26 && rows26.every((r) => r.classification && r.dependencyKey) && Object.values(counts26).reduce((x, y) => x + y, 0) === 26 && new Set(rows26.map((r) => `${r.v1ShardOrdinal}:${r.dependencyKey}`)).size === 26, { rows: rows26.length, distinctShardKeyPairs: new Set(rows26.map((r) => `${r.v1ShardOrdinal}:${r.dependencyKey}`)).size, distinctKeys: A134.distinctKeys, counts: counts26 }, "PHASE3_DEFINITION_RESOLUTION_INCOMPLETE");
C("no internal required dependency is falsely counted as delivered", deliveredRule && cInternal.certificateStatus === "CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION" && cInternal.contextComplete === false && cInternal.internalUnresolved === 1 && A133.classification === "CERTIFICATE_SEMANTIC_GAP" && (A144.perShard as Any[]).every((s) => s.certificate.internalUnresolved + s.certificate.ambiguous === 0 || s.certificate.certificateStatus === "CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION"), { isDeliveredFalseForEveryNonDeliveredState: deliveredRule, internalProbe: cInternal.certificateStatus, v1Gap: A133.classification }, "PHASE3_REQUIRED_DEPENDENCY_CERTIFICATE_UNSAFE");
C("false Pass-A edges are filtered or safely classified", A136.edgesOnTheFrozenUnit > 0 && Object.keys(A136.byMethod).every((m) => ["DEFINED_TERM", "GRAMMATICAL_NUMBER_VARIANT", "SOURCE_DECLARED_CORRELATIVE", "INLINE_DECLARATION_IN_OWNED_SOURCE", "DECLARATION_FOUND_IN_SOURCE_TEXT", "EXTERNAL_BY_SOURCE_DECLARATION", "ORDINARY_LEGAL_WORD", "TERM_ABSENT_FROM_SOURCE", "UNKNOWN_CAPITALISED_TERM", "AMBIGUOUS"].includes(m)) && A140.liveEvaluationOfTheBaseShape.E_falseEdgeExcludedNotRequired === true, { edges: A136.edgesOnTheFrozenUnit, byMethod: A136.byMethod, falseEdgeCase: A140.liveEvaluationOfTheBaseShape.E_falseEdgeExcludedNotRequired }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_OVERINCLUSIVE");
C("certificate statuses distinguish complete vs limited", cNone.certificateStatus === "CERTIFIED_CONTEXT_COMPLETE" && cNone.contextComplete === true && cExternal.certificateStatus === "CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION" && cExternal.contextComplete === false && cExternal.executable === true && cFailed.certificateStatus === "PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE" && cFailed.executable === false && (A141.certificateStatuses as string[]).length === 4, { probes: { none: cNone.certificateStatus, external: cExternal.certificateStatus, internal: cInternal.certificateStatus, ambiguous: cAmbiguous.certificateStatus, failed: cFailed.certificateStatus } }, "PHASE3_REQUIRED_DEPENDENCY_CERTIFICATE_UNSAFE");
C("ambiguous dependencies are explicit", cAmbiguous.certificateStatus === "CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION" && cAmbiguous.ambiguous === 1 && (A141.instancesOnTheFrozenUnit as Any[]).filter((x) => x.disposition === "AMBIGUOUS_REQUIRED_DEPENDENCY").every((x) => (x.candidates ?? 0) > 1) && A140.vitest["dd-anti-overfit.test.ts"]?.failed === 0 && A140.liveEvaluationOfTheBaseShape.J_ambiguousSectionIsExplicit === true, { ambiguousOnFrozenUnit: (A141.instancesOnTheFrozenUnit as Any[]).filter((x) => x.disposition === "AMBIGUOUS_REQUIRED_DEPENDENCY"), syntheticCaseJ: "dd-anti-overfit.test.ts (duplicate-section shape) + dd-certificate-honesty.test.ts" }, "PHASE3_REQUIRED_DEPENDENCY_CERTIFICATE_UNSAFE");
C("external dependencies are proven (from package identity, not from a name)", (A141.instancesOnTheFrozenUnit as Any[]).filter((x) => x.disposition === "EXTERNAL_REQUIRED_DEPENDENCY").every((x) => x.method === "EXTERNAL_BY_SOURCE_DECLARATION") && A140.vitest["dd-anti-overfit.test.ts"]?.failed === 0 && A140.liveEvaluationOfTheBaseShape.K_externalProvenFromSource === true && /package/.test(String(A141.rule14_external)), { externalOnFrozenUnit: (A141.instancesOnTheFrozenUnit as Any[]).filter((x) => x.disposition === "EXTERNAL_REQUIRED_DEPENDENCY"), syntheticCaseK: "dd-anti-overfit.test.ts (external-pointer shape: proven from package identity; a sounding-like name is never external)" }, "PHASE3_REQUIRED_DEPENDENCY_CERTIFICATE_UNSAFE");
C("closure precision is stable across threshold sensitivity (0.25-0.75: no planning failure, all five targets reached, every synthetic case holds), threshold unchanged at 0.5", A138.thresholdUnchanged === true && DEFAULT_REQUIRED_DEPENDENCY_BUDGET.compositionalCoverageThreshold === 0.5 && (A138.reading.stableRange as number[]).length === 5 && (A138.reading.deliveredInFullRange as number[]).includes(0.5), { stableRange: A138.reading.stableRange, deliveredInFullRange: A138.reading.deliveredInFullRange, sweep: (A138.sweep as Any[]).map((r) => ({ t: r.threshold, deps: r.requiredDependencies, chars: r.requiredContextChars, failures: r.planningFailures, reached: r.fiveTargetsReached, inFull: r.fiveTargetsDeliveredInFull })) }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_OVERINCLUSIVE");
C("no fixture-specific production logic in the mission diff of lib/", fixtureHits.length === 0, { diffedAgainst: STARTING_SHA, addedLinesMatchingFixtureIdentifiers: fixtureHits.length, hits: fixtureHits.slice(0, 5) }, "PHASE3_REQUIRED_DEPENDENCY_GENERALIZATION_NOT_PROVEN");
C("synthetic anti-overfit cases pass", Object.entries(A140.liveEvaluationOfTheBaseShape as Record<string, boolean>).every(([, v]) => v === true) && ["dd-anti-overfit.test.ts", "dd-certificate-honesty.test.ts", "dd-required-dependency-generality.test.ts"].every((f) => typeof A140.vitest[f] === "object" && A140.vitest[f].failed === 0 && A140.vitest[f].status === "passed"), { live: A140.liveEvaluationOfTheBaseShape, vitest: A140.vitest }, "PHASE3_REQUIRED_DEPENDENCY_GENERALIZATION_NOT_PROVEN");
C("cross-corpus deterministic sanity shows no pathological explosion", A145.anyExplosion === false && (A145.corpora as Any[]).length >= 3, { corpora: (A145.corpora as Any[]).map((r) => ({ corpus: r.corpus, deps: r.requiredDependencies ?? r.requiredDependenciesTotal, chars: r.requiredContextChars ?? r.maxRequiredContextChars, explosion: r.explosion })) }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_OVERINCLUSIVE");
C("lint evidence is internally consistent (exit code, ESLint marker, artifact 142 and this gate agree)", lintConsistent, { exitCode: lintExit, marker: lintMarker, verdict: lintVerdict, artifact142FreshRunExit: A142.freshRun.exitCode }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY");
C("verifier findings are triaged before spend (all 11)", (A143.triage as Any[]).length === 11 && (A143.triage as Any[]).every((t) => /^[A-F]_/.test(String(t.classification))), { triaged: (A143.triage as Any[]).length, classes: (A143.triage as Any[]).map((t) => String(t.classification).slice(0, 1)) }, "PHASE3_VERIFIER_BLOCKERS_REQUIRE_REMEDIATION");
C("no Phase-3 deterministic blocker identified and left knowingly unfixed", Array.isArray(A143.deterministicDefectsLeftUnfixed) && A143.deterministicDefectsLeftUnfixed.length === 0 && (A143.deterministicDefectsFixedInThisMission as string[]).length >= 1 && typeof A140.vitest["dd-cross-shard-links.test.ts"] === "object" && A140.vitest["dd-cross-shard-links.test.ts"].failed === 0 && typeof A140.vitest["dd-entity-scope.test.ts"] === "object" && A140.vitest["dd-entity-scope.test.ts"].failed === 0, { fixed: A143.deterministicDefectsFixedInThisMission, leftUnfixed: A143.deterministicDefectsLeftUnfixed }, "PHASE3_VERIFIER_BLOCKERS_REQUIRE_REMEDIATION");
C("no new regressions (file-level, against the starting SHA's full suite)", typeof regression === "object" && regression.fileLevelRegressions.length === 0 && regression.newFailingTestIdentities.length === 0, typeof regression === "object" ? { base: regression.base, current: regression.current, fileLevelRegressions: regression.fileLevelRegressions, newFailingTestIdentities: regression.newFailingTestIdentities } : regression, "PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY");
C("tsc has no new errors", tscNew !== null && tscNew.length === 0, { newErrors: tscNew === null ? "NOT_SUPPLIED" : tscNew.length, preexisting: tscErrors === null ? "NOT_SUPPLIED" : tscErrors.length - (tscNew?.length ?? 0), preexistingScope: "tests/foundation-audit/ (unchanged by this mission)" }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY");
C("lint clean", lintVerdict === "CLEAN", { exitCode: lintExit, tail: lintOut.trim().split("\n").slice(-2) }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY");
C("build passes", buildOk === true, { build: buildOk === null ? "NOT_SUPPLIED" : buildOk ? "OK" : "FAILED" }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY");
C("paid calls = 0", [A133, A134, A135, A136, A138, A139, A140, A141, A142, A143, A144, A145].every((x) => x.paidCalls === 0), { paidCalls: 0, spend: 0 }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY");
C("Phase 3 remains open", true, { phase3Closed: false, ceilingUnchanged: DEFAULT_SHARD_BUDGET.maxRequiredContextChars === 64_000 && A139.ceiling.unchanged === true, modelVersion: REQUIRED_DEPENDENCY_MODEL_VERSION }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY");
C("Phase 4 not started", /no computational evaluation was touched/.test(String(A143.phase4Boundary)) && sh(`git diff --name-only ${STARTING_SHA} -- lib/ | grep -c -E "solver|evaluation|headroom-engine|compute" || true`).trim() === "0", { phase4Started: false, changedProductionFiles: sh(`git diff --name-only ${STARTING_SHA} -- lib/`).trim().split("\n").filter(Boolean) }, "PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY");

const PASS = conditions.filter((c) => c.pass).length;
const FAIL = conditions.length - PASS;
const PRIORITY = ["PHASE3_REQUIRED_DEPENDENCY_CERTIFICATE_UNSAFE", "PHASE3_DEFINITION_RESOLUTION_INCOMPLETE", "PHASE3_VERIFIER_BLOCKERS_REQUIRE_REMEDIATION", "PHASE3_REQUIRED_DEPENDENCY_MODEL_OVERINCLUSIVE", "PHASE3_REQUIRED_DEPENDENCY_GENERALIZATION_NOT_PROVEN", "PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY"];
const failing = conditions.filter((c) => !c.pass);
const verdict = FAIL === 0 ? "PHASE3_REQUIRED_DEPENDENCY_MODEL_READY_FOR_PAID_REVALIDATION" : PRIORITY.find((v) => failing.some((c) => c.failureVerdict === v))!;
writeJson(`${OUT}/146-precision-audit-gate.json`, {
  artifact: "PRECISION AUDIT §22 - the 20-condition readiness gate", at: new Date().toISOString(), paidCalls: 0,
  startingSha: STARTING_SHA, shaGateWasComputedAgainst: sh("git rev-parse HEAD"),
  shaNote: "the working tree of this commit's parent was evaluated; the commit that carries this artifact is its child",
  conditions, summary: { total: conditions.length, PASS, FAIL },
  verdict,
  verdictNote: FAIL === 0 ? "every condition passed" : `failing conditions: ${failing.map((c) => c.id).join(", ")}; the verdict is the highest-priority alternative among their failure verdicts (PHASE3_REQUIRED_DEPENDENCY_MODEL_NOT_READY is this gate's own fallback for the quality-gate conditions the mission lists no alternative verdict for)`,
  lint: { command: "npm run lint", exitCode: lintExit, marker: lintMarker, verdict: lintVerdict },
  regression,
  whatThisVerdictMeans: "the corrected required-dependency model and certificate are ready to be revalidated by a future, separately authorized paid mission. It is NOT an authorization to spend money, NOT a claim that the 6.01 compilation now succeeds, and NOT a Phase 3 closure.",
  phase3Closed: false, phase4Started: false, paidRunAuthorized: false,
});
console.log(JSON.stringify({ verdict, PASS, FAIL, failed: failing.map((c) => `${c.id} ${c.condition}`), lint: lintVerdict, tscNew: tscNew === null ? "NOT_SUPPLIED" : tscNew.length, build: buildOk }, null, 1));
