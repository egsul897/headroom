/**
 * PHASE 4C FORENSIC REMEDIATION - recertification artifacts + 32-condition gate.
 * No model call, no ingestion, no network. Writes docs/phase-4c/remediation/01..14, and 15 in
 * handoff mode. The pre-remediation package is preserved under remediation/00-*.
 *
 * Run: [VITEST_TARGETED_JSON=.. VITEST_FULL_JSON=.. VITEST_FULL_BASE_JSON=.. TSC_LOG=.. LINT_LOG=.. BUILD_LOG=.. ISOLATION_JSONS=.. SCALING_JSON=..] npx tsx scripts/phase-4c-recertification.ts
 *      npx tsx scripts/phase-4c-recertification.ts --handoff <remediation-commit-sha>
 */
import { existsSync, readFileSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { readJson, sh, sha256 } from "./phase-3-601-revalidation-lib";
import type { IRDefinition, IRExpression, IRCapacityExpression, IRRule, IRSharedCapacity, RepresentationSufficiency } from "../lib/contract-model/ir/types";
import { rationalFromString } from "../lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "../lib/contract-model/runtime/types";
import { EMPTY_RESOLVER } from "../lib/contract-model/runtime/input-resolver";
import { snapshotInputResolver } from "../lib/contract-model/runtime/input/snapshot-resolver";
import type { FinancialInput, FinancialSnapshot } from "../lib/contract-model/runtime/input/types";
import { CAPACITY_GRAPH_VERSION } from "../lib/contract-model/runtime/capacity/version";
import { applyCapacityStateTransition, buildCapacityGraph, evaluateCapacityState } from "../lib/contract-model/runtime/capacity";
import { SUFFICIENCY_DOMINANCE, LIMITATION_STATUS_FLOOR } from "../lib/contract-model/runtime/capacity/state";
import { EVALUATION_DEPENDENCY_EDGE_KINDS } from "../lib/contract-model/runtime/capacity/types";
import type { CapacityAmount, CapacityPathRef, CapacityState, LedgerUsageRecord, ReclassificationElection } from "../lib/contract-model/runtime/capacity/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const OUT = "docs/phase-4c/remediation";
const at = () => new Date().toISOString();
const REMEDIATION_STARTING_SHA = "779d4103300758390a8795194b5082d87a1625d6";
const PHASE4C_STARTING_SHA = "b38fdcb5bc006b915ffe9b548fbb5ff18aade2fa";
const PHASE3_TREES = { "lib/contract-model/compiler/": "b4e6a9da496a23b9f98607355520a456e6c48e1f", "lib/contract-model/compiler/semantic/": "f79bc12dd479e9b803bf9e37092d76b6aedb8c12" };
const FROZEN = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json";
const CAP_DIR = "lib/contract-model/runtime/capacity";
const file = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readFileSync(p, "utf8") : null; };
const head = sh("git rev-parse HEAD");
const handoffSha = process.argv.includes("--handoff") ? process.argv[process.argv.indexOf("--handoff") + 1] ?? null : null;

// ---------------- tree identities (before = audited head, after = the working tree)
/** sha256 over the sorted "path blob" lines of every tracked file under `dir`, so an identity can be taken of a working tree too. */
const treeIdentity = (ref: string | "WORKTREE", dir: string, direct = false): { identity: string; files: number } => {
  const lines = ref === "WORKTREE"
    ? sh(`git ls-files -- ${dir}`).split("\n").filter(Boolean).filter((f) => !direct || !f.slice(dir.length + 1).includes("/")).map((f) => `${f} ${sh(`git hash-object ${f}`)}`)
    : sh(`git ls-tree ${direct ? "" : "-r"} ${ref} -- ${dir}/`).split("\n").filter(Boolean).filter((l) => l.includes(" blob ")).map((l) => { const [meta, path] = l.split("\t"); return `${path} ${meta!.split(" ")[2]}`; });
  return { identity: sha256(lines.sort().join("\n")), files: lines.length };
};
const trees = (ref: string | "WORKTREE") => ({
  phase3Compiler: ref === "WORKTREE" ? sh("git rev-parse HEAD:lib/contract-model/compiler") : sh(`git rev-parse ${ref}:lib/contract-model/compiler`),
  phase3Semantic: ref === "WORKTREE" ? sh("git rev-parse HEAD:lib/contract-model/compiler/semantic") : sh(`git rev-parse ${ref}:lib/contract-model/compiler/semantic`),
  ir: treeIdentity(ref, "lib/contract-model/ir"),
  phase4aRuntimeFiles: treeIdentity(ref, "lib/contract-model/runtime", true),
  phase4bInput: treeIdentity(ref, "lib/contract-model/runtime/input"),
  phase4cCapacity: treeIdentity(ref, CAP_DIR),
});
const before = trees(REMEDIATION_STARTING_SHA);
const after = trees("WORKTREE");
const dirtyOutsideCapacity = sh("git status --porcelain -- lib/").split("\n").filter(Boolean).filter((l) => !l.includes(`${CAP_DIR}/`));
const phase3Frozen = after.phase3Compiler === PHASE3_TREES["lib/contract-model/compiler/"] && after.phase3Semantic === PHASE3_TREES["lib/contract-model/compiler/semantic/"] && sh("git status --porcelain -- lib/contract-model/compiler lib/contract-model/ir").trim() === "";
const phase4aUnchanged = before.phase4aRuntimeFiles.identity === after.phase4aRuntimeFiles.identity && before.ir.identity === after.ir.identity;
const phase4bUnchanged = before.phase4bInput.identity === after.phase4bInput.identity;
const prodChanged = [...new Set(sh(`git diff --name-only ${REMEDIATION_STARTING_SHA} -- lib/`).split("\n").filter(Boolean).concat(sh("git diff --name-only -- lib/").split("\n").filter(Boolean), sh("git ls-files --others --exclude-standard lib/").split("\n").filter(Boolean)))].sort();

// ---------------- builders (arbitrary identifiers; production reads none of them)
const CO = "recert-company", INST = "recert-instrument", AS_OF = "2026-06-30";
const L = { exprId: null, inputKeys: [] as string[] };
let n = 0; const id = () => `c${++n}`;
/** Mint expression ids from zero, so two constructions that differ only in order hash identically. */
const fresh = <T,>(f: () => T): T => { n = 0; return f(); };
const MONEY = (amount: number, currency = "USD"): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency, exprId: id() });
const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: id() });
const METRIC = (metricName: string): IRExpression => ({ kind: "METRIC_REFERENCE", type: "MONEY", metricName, companyId: CO, instrumentKey: INST, resolvedDefinitionId: null, exprId: id() });
const MUL = (...o: IRExpression[]): IRExpression => ({ kind: "MULTIPLY", type: "MONEY", operands: o, exprId: id() });
const RULE_REF = (ruleId: string): IRExpression => ({ kind: "RULE_REFERENCE", type: "CAPACITY", ruleId, companyId: CO, instrumentKey: INST, exprId: id() });
const rule = (ruleId: string, capacityExpression: IRCapacityExpression | null, over: Partial<IRRule> = {}): IRRule => ({
  ruleId, irSchemaVersion: "t", companyId: CO, instrumentKey: INST, sourceDocumentId: "doc", sourceSectionRef: `section-${ruleId}`,
  covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT",
  entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression, conditions: [], exceptions: [],
  dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [],
  provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: `citation-${ruleId}`, excerpt: null }, compilerVersion: null, sourceContentVersion: null, ...over,
});
const sharedCap = (sharedCapId: string, capExpression: IRCapacityExpression, memberRuleIds: string[]): IRSharedCapacity => ({ sharedCapId, companyId: CO, instrumentKey: INST, description: `pool ${sharedCapId}`, capExpression, memberRuleIds, provenance: null });
const usage = (usageId: string, amount: string, capacityPath: CapacityPathRef, over: Partial<LedgerUsageRecord> = {}): LedgerUsageRecord => ({ usageId, companyId: CO, instrumentKey: INST, effectiveAsOf: "2026-01-31", amount: { amount, currency: "USD" }, capacityPath, transactionRef: `txn-${usageId}`, status: "RECORDED", supersededByUsageId: null, provenance: { source: "recert ledger", sourceVersion: "v1", approvalRef: "a1", approvalState: "APPROVED" }, ...over });
const onRule = (ruleId: string): CapacityPathRef => ({ kind: "RULE", ruleId });
const unresolved = (candidateRuleIds: string[], reason = "the record does not establish which permission was used"): CapacityPathRef => ({ kind: "UNRESOLVED", candidateRuleIds, reason });
const mv = (amount: string): RuntimeValue => ({ type: "MONEY", amount: rationalFromString(amount), currency: "USD", lineage: L });
const fact = (key: string, amount: string): FinancialInput => ({ identity: { companyId: CO, scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST }, inputKind: "METRIC", key, identityStrength: "CONTRACT_NAME_ONLY", period: { kind: "NOT_PERIOD_SPECIFIC" }, asOf: { kind: "EXACT_DATE", isoDate: AS_OF }, valueType: "MONEY", currency: "USD" }, value: mv(amount), sourceVersion: "src-1" });
const snap = (snapshotId: string, inputs: FinancialInput[], version = "1"): FinancialSnapshot => ({ snapshotId, version, companyId: CO, asOf: AS_OF, reportingPeriod: "p", status: "APPROVED", supersedesSnapshotId: null, provenance: { source: "recert snapshot", sourceVersion: "pack-1" }, review: { reviewedBy: "r", reviewedAt: "2026-07-01T00:00:00Z", approvalRef: "ap-1" }, inputs });
const snaps = (...s: FinancialSnapshot[]) => snapshotInputResolver({ snapshots: s, companyId: CO, instrumentKey: INST });
const run = (rules: IRRule[], opts: { caps?: IRSharedCapacity[]; ledger?: LedgerUsageRecord[]; inputs?: Any } = {}) => {
  const graph = buildCapacityGraph({ rules, sharedCapacities: opts.caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: opts.caps, inputs: opts.inputs ?? EMPTY_RESOLVER, ledger: opts.ledger ?? [], asOf: AS_OF });
  return { graph, state };
};
const amt = (a: CapacityAmount): string | null => (a.kind === "AMOUNT" && a.value.type === "MONEY" ? a.value.amount : null);
const capOf = (s: CapacityState, ruleId: string) => s.capacities.find((c) => c.ruleId === ruleId)!;
const brief = (s: CapacityState, ruleId: string) => { const c = capOf(s, ruleId); return { status: c.status, gross: amt(c.grossCapacity) ?? c.grossCapacity.kind, usage: amt(c.usage) ?? c.usage.kind, remaining: amt(c.remaining) ?? c.remaining.kind, effectiveRemaining: amt(c.effectiveRemaining) ?? c.effectiveRemaining.kind, provisional: c.provisional ? { gross: amt(c.provisional.grossCapacity), remaining: amt(c.provisional.remaining), effectiveRemaining: amt(c.provisional.effectiveRemaining) } : null, limitations: c.limitations.map((l) => l.code), appliedUsageIds: c.appliedUsageIds }; };
const el = (electionId: string, sourceRuleId: string, destinationRuleId: string, amount: string): ReclassificationElection => ({ electionId, sourceRuleId, destinationRuleId, amount: { amount, currency: "USD" }, effectiveAsOf: "2026-03-31", provenance: { source: "recert election", sourceVersion: "v1", approvalRef: "ap" } });
const reclass = (to: string[]) => ({ dependsOn: to.map((t) => ({ relationshipType: "RECLASSIFIABLE_TO" as const, targetRuleId: t, description: `may reclassify into ${t}` })) });
const transition = (rules: IRRule[], ledger: LedgerUsageRecord[], elections: ReclassificationElection[]) => {
  const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const before = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
  const r = applyCapacityStateTransition({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF, before, elections });
  const totalUsage = (s: CapacityState) => s.capacities.reduce((sum, c) => sum + Number(amt(c.usage) ?? "0"), 0);
  return { allExecuted: r.allExecuted, afterIsNull: r.after === null, outcomes: r.outcomes.map((o) => ({ id: o.electionId, state: o.state, codes: o.blockedBy.map((b) => b.code) })), batchConservation: r.batchConservation, before: { totalUsage: totalUsage(before), byRule: Object.fromEntries(before.capacities.map((c) => [c.ruleId, amt(c.usage)])) }, after: r.after ? { totalUsage: totalUsage(r.after), byRule: Object.fromEntries(r.after.capacities.map((c) => [c.ruleId, amt(c.usage)])), remaining: Object.fromEntries(r.after.capacities.map((c) => [c.ruleId, amt(c.remaining)])) } : null, transitionHash: r.transitionHash };
};

// ---------------- 01 audit findings
const FINDINGS = [
  { id: "F1", title: "Batch reclassification can violate conservation and create capacity", auditObservation: "two elections of 25 + 25 against 40 of source usage both executed; source usage -10, remaining 110 on gross 100", invariant: "RECLASSIFICATION CANNOT CREATE ECONOMIC OR LEGAL CAPACITY: the sum a batch moves out of one source never exceeds what the source carries; a batch applies whole or not at all", remediation: "reclassification.ts: aggregate requested amounts by source over the whole batch against the before-state; AGGREGATE_SOURCE_USAGE_EXCEEDED on every drawer; BLOCKED_BY_BATCH_ATOMICITY on otherwise-valid elections; after is null when anything is blocked; batchConservation reported", probes: ["forensic P7", "matrices R4 A-J"], status: "REMEDIATED" },
  { id: "F2", title: "Duplicate ledger usage identity counted multiple times", auditObservation: "u1=30 and u1=80 both counted; capacity AVAILABLE with remaining 140 on gross 200 (P19); identical claimants likewise (P19b)", invariant: "USAGE CANNOT BE COUNTED TWICE THROUGH IDENTITY COLLISION: one immutable usage identity contributes at most once; duplicates are refused, never chosen between or collapsed", remediation: "ledger.ts: every record bearing a duplicated id is quarantined at index time; selectUsage fails any capacity the claimants could touch closed with DUPLICATE_LEDGER_USAGE_IDENTITY; state reports quarantinedUsageIds", probes: ["forensic P19/P19b", "matrices R6 via shared-and-ledger (rewritten test)"], status: "REMEDIATED" },
  { id: "F3", title: "Duplicate shared-capacity identity resolves by array order", auditObservation: "two IRSharedCapacity with one id: last supplied became the pool, no limitation (P3)", invariant: "IDENTITY IS UNIQUE OR FAILS CLOSED: no first-wins or last-wins for any unique graph resource", remediation: "graph.ts: duplicate sharedCapId and ruleId detected before any node is built; the id is refused as a set with DUPLICATE_SHARED_CAPACITY_IDENTITY / DUPLICATE_RULE_IDENTITY; members of a refused pool are non-authoritative; state.ts refuses duplicates among the resources it is handed too; duplicate Phase-3 edges collapse to one canonical edge", probes: ["forensic P3", "matrices R7"], status: "REMEDIATED" },
  { id: "F4", title: "Capacity-state evaluation near-quadratic", auditObservation: "wall-clock log-log slope 1.81 on a chain-of-shares construction; about 8 s at 1,600 rules; artifact 11 claimed linear from counters that did not measure the nested scans", invariant: "CAPACITY EVALUATION MUST NOT HIDE AN ACCIDENTAL PAIRWISE ALGORITHM", remediation: "ledger indexed once by path with per-(path,currency) memoized selection; membership, component and dependency lookups indexed; graph existence checks by Set; manifest union keyed by identity; edge/dependency grouping in one pass; counters extended (ledgerEntriesExamined, sharedResourceLookups, dependencyLookups, indexLookups, edgesVisited as consulted)", probes: ["forensic P21 (counters exact, wall-clock supplemental)", "matrices R13"], status: "REMEDIATED" },
  { id: "F5", title: "Phase-3 UNSUPPORTED legal state publishes authoritative AVAILABLE", auditObservation: "sufficiency UNSUPPORTED with an evaluable expression reported AVAILABLE with a gross amount (P16)", invariant: "LEGAL UNSAFETY CANNOT BE UPGRADED BY ARITHMETIC", remediation: "state.ts: SUFFICIENCY_DOMINANCE is a Record over every RepresentationSufficiency value (compile-time exhaustive) with a fail-closed default for values outside the union; unsafe entity scope is REVIEW_REQUIRED; published amounts withheld and arithmetic kept under provisional", probes: ["forensic P16", "matrices R8 table over all six values + scopes"], status: "REMEDIATED" },
  { id: "F6", title: "Empty allocation candidate information silently dropped", auditObservation: "UNRESOLVED path with no candidates left every capacity AVAILABLE at full amount (P15)", invariant: "'no usage applies' is never confused with 'usage exists but attribution cannot be determined'", remediation: "ledger.ts: unresolved-without-candidates blocks every capacity in scope with ALLOCATION_INFORMATION_MISSING; candidates entirely outside the graph are reported as USAGE_NOT_ATTRIBUTABLE_IN_GRAPH, never dropped", probes: ["forensic P15", "matrices R10 six cases"], status: "REMEDIATED" },
  { id: "F7", title: "Snapshot ambiguity signalling inconsistent", auditObservation: "ambiguous=true for two snapshots supplying different facts (benign) and false for the same fact in two snapshots (conflict); the flag was `snapshotIds.size > 1`", invariant: "ambiguity is an actual Phase-4B conflict (AMBIGUOUS_INPUT / SNAPSHOT_SET_UNSAFE), never set size", remediation: "state.ts: ambiguous derives from evaluation diagnostics; multiSnapshot and conflictingInputKeys added; AMBIGUOUS_FINANCIAL_INPUT limitation on the capacity", probes: ["forensic P12/P13", "matrices R11 six cases"], status: "REMEDIATED" },
  { id: "F8", title: "Symmetric legal relationships classified as dependency cycles", auditObservation: "every Phase-3 relationship became DEPENDS_ON and fed cycle detection; 5 of 5 real-corpus cycles were symmetric SHARES_CAPACITY_WITH pairs", invariant: "SYMMETRIC LEGAL RELATIONSHIPS ARE NOT AUTOMATICALLY COMPUTATIONAL CYCLES; true evaluation cycles still fail closed", remediation: "graph.ts: LEGAL_RELATIONSHIP edge kind for every non-reclassification relationship; DEPENDS_ON only from RULE_REFERENCE inside a capacity expression; cycle detection runs over EVALUATION_DEPENDENCY_EDGE_KINDS only", probes: ["forensic P20 (frozen corpus: 0 cycles)", "matrices R12 A-E"], status: "REMEDIATED" },
  { id: "F9", title: "Unquantified SHARES_CAPACITY_WITH leaves the member authoritative", auditObservation: "SHARED_CAPACITY_NOT_QUANTIFIED at graph level while the member entry read AVAILABLE at full amount (P1, P2)", invariant: "UNKNOWN SHARED CAPACITY CANNOT BECOME AUTHORITATIVE AVAILABILITY", remediation: "graph.ts records unquantifiedSharedWith on both ends of the relationship; state.ts makes such entries REVIEW_REQUIRED with effectiveRemaining NOT_DETERMINED and the local arithmetic under provisional; no pool is invented", probes: ["forensic P20 members", "matrices R9"], status: "REMEDIATED" },
  { id: "F10", title: "Duplicate-id tests asserted codes only", auditObservation: "the original duplicate-usage test checked LEDGER_SET_UNSAFE and never the applied amounts, which is why F2 escaped it", invariant: "a test of an identity invariant asserts the code AND the arithmetic", remediation: "the original test replaced with one asserting status, code, applied ids, usage, remaining and the forbidden amounts; forensic P19/P19b likewise", probes: ["shared-and-ledger (rewritten)", "forensic P19/P19b"], status: "REMEDIATED" },
  { id: "U8", title: "Supplied negative usage creates capacity (audit register)", auditObservation: "usage -30 accepted; remaining 130 on gross 100 (P18)", invariant: "consumption is reduced only by status or supersession; a negative row is representable only as the source half of a conserved reclassification pair with its destination half present", remediation: "ledger.ts: USAGE_AMOUNT_NOT_REPRESENTABLE issue + block; the capacity fails closed", probes: ["forensic P18"], status: "REMEDIATED" },
  { id: "U10", title: "Duplicate election ids execute (audit register)", auditObservation: "both elections with one id executed, allExecuted true (P8)", invariant: "an election identity applies at most once; fail closed, never deduplicate", remediation: "reclassification.ts: DUPLICATE_ELECTION_IDENTITY on every bearer; ELECTION_ALREADY_APPLIED when the ledger already carries the election's rows", probes: ["forensic P8", "matrices R4 H, R5"], status: "REMEDIATED" },
  { id: "U11", title: "Unproduced kinds and unreachable code documented as supported (audit register)", auditObservation: "LEDGER_USAGE, CONSUMES listed as kinds; CROSS_INSTRUMENT_NOT_REPRESENTED unreachable; movesUsageIds unused; PATH_NOT_THIS_CAPACITY", invariant: "the evidence package names what is produced and what is reserved", remediation: "artifacts 02/03/08 split produced vs reserved; PATH_NOT_THIS_CAPACITY removed (no longer produced since indexing); movesUsageIds documented as provenance-only", probes: [], status: "DOCUMENTED" },
  { id: "U16", title: "Gate condition 32 loosened post hoc (audit register)", auditObservation: "condition 32 changed from 'full suite clean' to 'no attributable regressions' after the first run, without disclosure", invariant: "criteria changes are disclosed", remediation: "disclosed in docs/phase-4c/15-regression.json, 16-phase4c-gate.json and here (14)", probes: [], status: "DISCLOSED" },
];
writeJson(`${OUT}/01-independent-audit-findings.json`, { artifact: "PHASE 4C remediation R1 - the independent audit findings, binding", at: at(), auditVerdict: "PHASE_4C_NOT_COMPLETE", auditedHead: REMEDIATION_STARTING_SHA, preRemediationPackage: `${OUT}/00-pre-remediation-closure-package/`, findings: FINDINGS });

// ---------------- 02 plan
const CHANGED_TESTS = [
  { file: "tests/contract-model/runtime/capacity/shared-and-ledger.test.ts", test: "F. a cycle among capacities is detected", priorExpectation: "two symmetric REQUIRES relationships form a cycle", whyWrong: "REQUIRES is a legal relationship the evaluator never follows; a symmetric pair is not a recursion", requirement: "R12 / audit F8", replacement: "a RULE_REFERENCE cycle is detected and fails closed; F2 asserts the symmetric legal pair is not a cycle" },
  { file: "tests/contract-model/runtime/capacity/shared-and-ledger.test.ts", test: "a duplicate usage id makes the ledger unsafe rather than choosing a row", priorExpectation: "LEDGER_SET_UNSAFE raised (both rows still counted)", whyWrong: "one immutable identity may contribute at most once; the flag alone left a double count and AVAILABLE", requirement: "R6 / audit F2, F10", replacement: "quarantine, DUPLICATE_LEDGER_USAGE_IDENTITY, status AMBIGUOUS, applied [], usage and remaining NOT_DETERMINED, forbidden amounts asserted" },
  { file: "tests/contract-model/runtime/capacity/shared-and-ledger.test.ts", test: "a usage for another company / instrument / capacity is rejected", priorExpectation: "the rejection read from the per-capacity usageSelection", whyWrong: "that list existed only because every capacity rescanned the whole ledger (the quadratic source)", requirement: "R13 / audit F8", replacement: "scope rejections reported once in state.ledgerScope; a capacity's selection lists only records that could apply; never counted, reason stated, examined-once asserted" },
  { file: "tests/contract-model/runtime/capacity/determinism-and-generality.test.ts", test: "ledger selection is indexed per capacity rather than rescanning for every pair", priorExpectation: "ledgerEntriesApplied === 2n", whyWrong: "encoded the double read the audit measured", requirement: "R13 / audit F4", replacement: "examined === n, applied === n, edgesVisited === n, cacheHits >= n" },
];
writeJson(`${OUT}/02-remediation-plan.json`, {
  artifact: "PHASE 4C remediation R2/R3/R16 - scope, freeze, and the plan actually executed", at: at(),
  scope: { productionFilesChanged: prodChanged, onlyCapacityModule: prodChanged.every((f) => f.startsWith(`${CAP_DIR}/`)), noPhase4d: !existsSync("lib/contract-model/runtime/transaction"), noPhase4e: !existsSync("lib/contract-model/runtime/solver"), noIngestion: !existsSync(`${CAP_DIR}/ingestion.ts`), paidCalls: 0 },
  freeze: { phase3: { frozen: phase3Frozen, compiler: after.phase3Compiler, semantic: after.phase3Semantic }, phase4a: { unchanged: phase4aUnchanged, before: before.phase4aRuntimeFiles, after: after.phase4aRuntimeFiles }, phase4b: { unchanged: phase4bUnchanged, before: before.phase4bInput, after: after.phase4bInput }, phase4c: { before: before.phase4cCapacity, after: after.phase4cCapacity } },
  designDecisions: [
    "batch: every election draws on the before-state; no intra-batch chaining; atomic apply; aggregate conservation by source",
    "identity: any duplicated unique id (usage, election, rule, pool) is refused as a set, never deduplicated, even when claimants are byte-identical",
    "edges: LEGAL_RELATIONSHIP carries every non-reclassification Phase-3 relationship; DEPENDS_ON only from RULE_REFERENCE; cycle detection over evaluation edges only",
    "ledger: indexed once by path; scope and quarantine at index time; selection memoized per (path, currency); scope rejections reported once in ledgerScope",
    "legal state: exhaustive dominance table; unsafe scope and unquantified sharing are REVIEW_REQUIRED floors; arithmetic kept under provisional",
    "negative usage: representable only as the source half of a conserved reclassification pair",
  ],
  originalTestsChanged: CHANGED_TESTS,
  newTestFiles: ["tests/contract-model/runtime/capacity/forensic-regression.test.ts", "tests/contract-model/runtime/capacity/remediation-matrices.test.ts"],
});

// ---------------- 03 reclassification conservation
const src = () => [rule("src", MONEY(100), reclass(["dst"])), rule("dst", MONEY(100))];
const led = () => [usage("u1", "40", onRule("src"))];
const R4 = {
  "A. one election below source usage": transition(src(), led(), [el("e1", "src", "dst", "25")]),
  "B. one election equal to source usage": transition(src(), led(), [el("e1", "src", "dst", "40")]),
  "C. one election above source usage": transition(src(), led(), [el("e1", "src", "dst", "50")]),
  "D. two elections summing below": transition(src(), led(), [el("e1", "src", "dst", "10"), el("e2", "src", "dst", "20")]),
  "E. two elections summing to exactly": transition(src(), led(), [el("e1", "src", "dst", "15"), el("e2", "src", "dst", "25")]),
  "F. two elections individually valid, jointly over (audit P7)": transition(src(), led(), [el("e1", "src", "dst", "25"), el("e2", "src", "dst", "25")]),
  "G. four elections within": transition(src(), led(), [el("e1", "src", "dst", "10"), el("e2", "src", "dst", "10"), el("e3", "src", "dst", "10"), el("e4", "src", "dst", "10")]),
  "G. three elections over": transition(src(), led(), [el("e1", "src", "dst", "15"), el("e2", "src", "dst", "15"), el("e3", "src", "dst", "15")]),
  "H. duplicate election identity (audit P8)": transition(src(), led(), [el("dup", "src", "dst", "5"), el("dup", "src", "dst", "5"), el("other", "src", "dst", "5")]),
  "I. one source to two targets within": transition([rule("src", MONEY(100), reclass(["d1", "d2"])), rule("d1", MONEY(100)), rule("d2", MONEY(100))], led(), [el("e1", "src", "d1", "20"), el("e2", "src", "d2", "20")]),
  "I. one source to two targets over": transition([rule("src", MONEY(100), reclass(["d1", "d2"])), rule("d1", MONEY(100)), rule("d2", MONEY(100))], led(), [el("e1", "src", "d1", "25"), el("e2", "src", "d2", "20")]),
  "J. two sources, each within": transition([rule("sA", MONEY(100), reclass(["dst"])), rule("sB", MONEY(100), reclass(["dst"])), rule("dst", MONEY(100))], [usage("uA", "40", onRule("sA")), usage("uB", "30", onRule("sB"))], [el("a1", "sA", "dst", "40"), el("b1", "sB", "dst", "10"), el("b2", "sB", "dst", "20")]),
  "J. two sources, one over blocks the batch": transition([rule("sA", MONEY(100), reclass(["dst"])), rule("sB", MONEY(100), reclass(["dst"])), rule("dst", MONEY(100))], [usage("uA", "40", onRule("sA")), usage("uB", "30", onRule("sB"))], [el("a1", "sA", "dst", "10"), el("b1", "sB", "dst", "35")]),
};
const orderF1 = fresh(() => transition(src(), led(), [el("e1", "src", "dst", "25"), el("e2", "src", "dst", "25")]).transitionHash);
const orderF2 = fresh(() => transition(src(), led(), [el("e2", "src", "dst", "25"), el("e1", "src", "dst", "25")]).transitionHash);
// A refused batch is refused for a stated reason (aggregate conservation, or identity for case H); an applied batch preserves total usage and every source's conservation holds.
const conservationHolds = Object.values(R4).every((r) => (r.after === null ? r.outcomes.every((o) => o.state === "RECLASSIFICATION_NOT_EXECUTABLE") && (r.batchConservation.some((b) => !b.holds) || r.outcomes.some((o) => o.codes.includes("DUPLICATE_ELECTION_IDENTITY"))) : r.after.totalUsage === r.before.totalUsage && r.batchConservation.every((b) => b.holds) && r.allExecuted))
  && R4["F. two elections individually valid, jointly over (audit P7)"].afterIsNull && R4["H. duplicate election identity (audit P8)"].afterIsNull && orderF1 === orderF2;
writeJson(`${OUT}/03-reclassification-conservation.json`, { artifact: "PHASE 4C remediation R4/R5 - batch conservation and election identity, executed through production code", at: at(), invariant: "sum of executable elections per source <= source usage in the before-state; atomic; no capacity created; total usage preserved", chaining: "none inside a batch; a chained move is two batches", matrix: R4, orderInvariance: { hashSameUnderPermutation: orderF1 === orderF2 }, allHold: conservationHolds });

// ---------------- 04 ledger identity
const dupDiff = fresh(() => run([rule("a", MONEY(200))], { ledger: [usage("dup", "30", onRule("a")), usage("dup", "80", onRule("a"))] }));
const dupSame = fresh(() => run([rule("a", MONEY(200))], { ledger: [usage("dup", "30", onRule("a")), usage("dup", "30", onRule("a"))] }));
const dupRev = fresh(() => run([rule("a", MONEY(200))], { ledger: [usage("dup", "80", onRule("a")), usage("dup", "30", onRule("a"))] }));
const indep = run([rule("a", MONEY(200))], { ledger: [usage("u1", "30", onRule("a")), usage("u2", "80", onRule("a"))] });
const neg = run([rule("a", MONEY(100))], { ledger: [usage("u1", "-30", onRule("a"))] });
const ledgerIdentitySafe = ["AMBIGUOUS"].includes(brief(dupDiff.state, "a").status) && brief(dupDiff.state, "a").usage === "NOT_DETERMINED" && brief(dupSame.state, "a").usage === "NOT_DETERMINED" && dupDiff.state.stateHash === dupRev.state.stateHash && brief(indep.state, "a").usage === "110" && brief(neg.state, "a").remaining === "NOT_DETERMINED";
writeJson(`${OUT}/04-ledger-identity.json`, { artifact: "PHASE 4C remediation R6 - one immutable usage identity contributes at most once", at: at(), invariant: "duplicate identity is refused as a set, never chosen between, never collapsed; capacities the claimants could touch fail closed with DUPLICATE_LEDGER_USAGE_IDENTITY", differingClaimants: { ...brief(dupDiff.state, "a"), quarantined: dupDiff.state.ledgerScope.quarantinedUsageIds, ledgerIssues: dupDiff.state.ledgerIssues.map((i) => i.code) }, identicalClaimants: brief(dupSame.state, "a"), orderInvariant: dupDiff.state.stateHash === dupRev.state.stateHash, independentRecordsBothCount: brief(indep.state, "a"), negativeSuppliedUsage: { ...brief(neg.state, "a"), ledgerIssues: neg.state.ledgerIssues.map((i) => i.code) }, safe: ledgerIdentitySafe });

// ---------------- 05 shared-capacity identity
const poolDup = fresh(() => { const r = [rule("a", MONEY(100))]; const p1 = sharedCap("p", MONEY(150), ["a"]); const p2 = sharedCap("p", MONEY(50), ["a"]); return { ...run(r, { caps: [p1, p2] }), rev: run(r, { caps: [p2, p1] }) }; });
const poolDupRev = poolDup.rev;
const ruleDup = fresh(() => { const r1 = rule("r", MONEY(100)); const r2 = rule("r", MONEY(500)); const o = rule("o", MONEY(10)); return { ...run([r1, r2, o]), rev: run([o, r2, r1]) }; });
const ruleDupRev = ruleDup.rev;
const sharedIdentitySafe = poolDup.graph.nodes.every((x) => x.kind !== "SHARED_CAPACITY") && poolDup.graph.limitations.some((l) => l.code === "DUPLICATE_SHARED_CAPACITY_IDENTITY") && brief(poolDup.state, "a").status !== "AVAILABLE" && poolDup.state.stateHash === poolDupRev.state.stateHash && ruleDup.graph.nodes.map((x) => x.ruleId).join() === "o" && ruleDup.graph.graphHash === ruleDupRev.graph.graphHash;
writeJson(`${OUT}/05-shared-capacity-identity.json`, { artifact: "PHASE 4C remediation R7 - duplicate rule and pool identity never resolve by array order", at: at(), duplicatePool: { graphLimitations: poolDup.graph.limitations.map((l) => l.code), sharedNodes: 0, member: brief(poolDup.state, "a"), orderInvariant: poolDup.state.stateHash === poolDupRev.state.stateHash }, duplicateRule: { nodes: ruleDup.graph.nodes.map((x) => x.ruleId), limitations: ruleDup.graph.limitations.map((l) => l.code), orderInvariant: ruleDup.graph.graphHash === ruleDupRev.graph.graphHash }, safe: sharedIdentitySafe });

// ---------------- 06 legal-state dominance
const EVERY: RepresentationSufficiency[] = ["COMPLETE", "PARTIAL", "AMBIGUOUS", "UNSUPPORTED", "MISSING_CONTEXT", "CONFLICTED"];
const dominance = Object.fromEntries(EVERY.map((suff) => [suff, brief(run([rule("r", MONEY(100), { sufficiency: suff, sufficiencyReasons: [`reason ${suff}`] })], { ledger: [usage("u1", "30", onRule("r"))] }).state, "r")]));
const scopeAudit = (status: string, safeToRely: boolean) => ({ entityScopeAudit: { guardVersion: "t", status, safeToRely, reasonCodes: [], rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "EMPTY" }, tagNormalization: [], before: { entityScope: [], entityScopeExcluded: [], sufficiency: "COMPLETE" }, witness: { ownExcerpt: null, citedUnitLeadIn: null, decidedBy: "NONE", signals: [] } } as Any });
const scopes = Object.fromEntries(["UNDERINCLUSIVE_VS_SOURCE", "AMBIGUOUS_VS_SOURCE", "UNRECOGNIZED_TAG", "UNWITNESSED", "UNSPECIFIED"].map((st) => [st, brief(run([rule("r", MONEY(100), scopeAudit(st, false))]).state, "r")]));
const outOfEnum = brief(run([rule("r", MONEY(100), { sufficiency: "SOMETHING_ELSE" as RepresentationSufficiency })]).state, "r");
const dominanceHolds = EVERY.every((suff) => (suff === "COMPLETE" ? dominance[suff]!.status === "AVAILABLE" && dominance[suff]!.gross === "100" : dominance[suff]!.status !== "AVAILABLE" && dominance[suff]!.gross === "NOT_DETERMINED" && dominance[suff]!.provisional?.remaining === "70")) && Object.values(scopes).every((b) => b.status === "REVIEW_REQUIRED" && b.gross === "NOT_DETERMINED") && outOfEnum.status === "UNSUPPORTED";
writeJson(`${OUT}/06-legal-state-dominance.json`, { artifact: "PHASE 4C remediation R8 - the exhaustive dominance table, executed", at: at(), table: SUFFICIENCY_DOMINANCE, limitationStatusFloors: LIMITATION_STATUS_FLOOR, everySufficiencyValue: dominance, unsafeEntityScopes: scopes, valueOutsideEnumeration: outOfEnum, holds: dominanceHolds });

// ---------------- 07 unquantified shared capacity
const unq = run([rule("a", MONEY(100), { dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "b", description: "a shares with b" }] }), rule("b", MONEY(200))], { ledger: [usage("u1", "30", onRule("a"))] });
const quantified = run([rule("a", MONEY(100), { dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "b", description: "a shares with b" }] }), rule("b", MONEY(200))], { caps: [sharedCap("p", MONEY(150), ["a", "b"])], ledger: [usage("u1", "30", onRule("a"))] });
const unqHolds = unq.graph.nodes.every((x) => x.kind !== "SHARED_CAPACITY") && unq.state.capacities.every((c) => c.status === "REVIEW_REQUIRED" && c.effectiveRemaining.kind === "NOT_DETERMINED") && brief(unq.state, "a").provisional?.remaining === "70" && brief(quantified.state, "a").status === "AVAILABLE" && brief(quantified.state, "a").effectiveRemaining === "70";
writeJson(`${OUT}/07-unquantified-shared-capacity.json`, { artifact: "PHASE 4C remediation R9 - an unquantified share is never authoritative availability", at: at(), relationshipExists: unq.graph.edges.filter((e) => e.sourceRelationship === "SHARES_CAPACITY_WITH").map((e) => e.kind), noPoolInvented: unq.graph.nodes.every((x) => x.kind !== "SHARED_CAPACITY"), graphLimitations: unq.graph.limitations.map((l) => l.code), memberA: brief(unq.state, "a"), memberB: brief(unq.state, "b"), withQuantifiedPool: { a: brief(quantified.state, "a"), b: brief(quantified.state, "b") }, holds: unqHolds });

// ---------------- 08 allocation + snapshot
const two = () => [rule("a", MONEY(100)), rule("b", MONEY(100))];
const alloc = {
  "1. none legally applicable": brief(run(two(), { ledger: [usage("u1", "40", onRule("b"))] }).state, "a"),
  "2. information missing": brief(run(two(), { ledger: [usage("u1", "40", unresolved([], "unknown"))] }).state, "a"),
  "3. one candidate": brief(run(two(), { ledger: [usage("u1", "40", unresolved(["a"]))] }).state, "a"),
  "4. multiple candidates": brief(run(two(), { ledger: [usage("u1", "40", unresolved(["a", "b"]))] }).state, "a"),
  "5. explicit selection": brief(run(two(), { ledger: [usage("u1", "40", onRule("a"))] }).state, "a"),
  "6. candidates outside the graph": (() => { const s = run(two(), { ledger: [usage("u1", "40", unresolved(["elsewhere-1", "elsewhere-2"]))] }).state; return { a: brief(s, "a"), stateLimitations: s.limitations.map((l) => l.code), ledgerIssues: s.ledgerIssues.map((i) => i.code) }; })(),
};
const allocHolds = alloc["1. none legally applicable"].remaining === "100" && alloc["2. information missing"].status === "AMBIGUOUS" && alloc["3. one candidate"].status === "AMBIGUOUS" && alloc["4. multiple candidates"].status === "AMBIGUOUS" && alloc["5. explicit selection"].remaining === "60" && alloc["6. candidates outside the graph"].stateLimitations.includes("USAGE_NOT_ATTRIBUTABLE_IN_GRAPH");
const m1 = () => [rule("a", MUL(PCT(0.1), METRIC("m1")))];
const m2 = () => [rule("a", MUL(PCT(0.1), METRIC("m1"))), rule("b", MUL(PCT(0.1), METRIC("m2")))];
const sb = (s: CapacityState) => ({ binding: s.snapshotBinding, statuses: s.capacities.map((c) => c.status), stateLimitations: s.limitations.map((l) => l.code), hash: s.stateHash });
const snapCases = {
  "identical fact identity in two snapshots": sb(run(m1(), { inputs: snaps(snap("s1", [fact("m1", "1000")]), snap("s2", [fact("m1", "1000")])) }).state),
  "compatible: different facts from different snapshots (audit P12)": sb(fresh(() => run(m2(), { inputs: snaps(snap("s1", [fact("m1", "1000")]), snap("s2", [fact("m2", "2000")])) })).state),
  "missing binding": sb(run(m1()).state),
  "conflicting identities: same fact, different versions": sb(run(m1(), { inputs: snaps(snap("s1", [fact("m1", "1000")], "1"), snap("s1-revised", [fact("m1", "1000")], "2")) }).state),
  "conflicting values (audit P13)": sb(fresh(() => run(m1(), { inputs: snaps(snap("s1", [fact("m1", "1000")]), snap("s2", [fact("m1", "5000")])) })).state),
  "permutation of the conflicting case": sb(fresh(() => run(m1(), { inputs: snaps(snap("s2", [fact("m1", "5000")]), snap("s1", [fact("m1", "1000")])) })).state),
  "permutation of the compatible case": sb(fresh(() => run(m2(), { inputs: snaps(snap("s2", [fact("m2", "2000")]), snap("s1", [fact("m1", "1000")])) })).state),
};
const snapHolds = snapCases["compatible: different facts from different snapshots (audit P12)"].binding.ambiguous === false && snapCases["compatible: different facts from different snapshots (audit P12)"].binding.multiSnapshot === true && snapCases["conflicting values (audit P13)"].binding.ambiguous === true && snapCases["conflicting values (audit P13)"].binding.conflictingInputKeys.join() === "m1" && snapCases["missing binding"].binding.ambiguous === false && snapCases["conflicting values (audit P13)"].hash === snapCases["permutation of the conflicting case"].hash && snapCases["compatible: different facts from different snapshots (audit P12)"].hash === snapCases["permutation of the compatible case"].hash;
writeJson(`${OUT}/08-allocation-and-snapshot.json`, { artifact: "PHASE 4C remediation R10/R11 - allocation completeness and snapshot ambiguity", at: at(), allocation: { rule: "'no usage applies' is a determined zero; 'attribution unknown' fails the capacities it could touch closed; candidates outside the graph are reported, never dropped", cases: alloc, holds: allocHolds }, snapshot: { rule: "ambiguous only on an actual Phase-4B conflict (AMBIGUOUS_INPUT / SNAPSHOT_SET_UNSAFE); multiSnapshot is a separate fact; conflictingInputKeys names the facts; order-independent", cases: snapCases, holds: snapHolds } });

// ---------------- 09 cycle semantics
const withRules = (rules: IRRule[]) => run(rules, { inputs: snapshotInputResolver({ snapshots: [], rules, companyId: CO, instrumentKey: INST }) });
const legal = (type: string, target: string) => ({ relationshipType: type as Any, targetRuleId: target, description: `${type} ${target}` });
const cyc = {
  "A. true directed cycle": (() => { const { graph, state } = withRules([rule("a", RULE_REF("b")), rule("b", RULE_REF("a"))]); return { cycles: graph.cycles.map((c) => ({ nodePath: c.nodePath, kinds: c.edgePath.map((e) => e.kind) })), statuses: state.capacities.map((c) => c.status), limitations: state.limitations.map((l) => l.code) }; })(),
  "B. symmetric shared-cap relationship": (() => { const { graph, state } = run([rule("a", MONEY(100), { dependsOn: [legal("SHARES_CAPACITY_WITH", "b")] }), rule("b", MONEY(100), { dependsOn: [legal("SHARES_CAPACITY_WITH", "a")] })]); return { cycles: graph.cycles.length, edgeKinds: graph.edges.map((e) => e.kind), statuses: state.capacities.map((c) => c.status) }; })(),
  "C. symmetric legal relationships": Object.fromEntries(["REQUIRES", "LIMITED_BY", "ALTERNATIVE_TO"].map((t) => { const { graph, state } = run([rule("a", MONEY(10), { dependsOn: [legal(t, "b")] }), rule("b", MONEY(20), { dependsOn: [legal(t, "a")] })]); return [t, { cycles: graph.cycles.length, edgeKinds: [...new Set(graph.edges.map((e) => e.kind))], statuses: state.capacities.map((c) => [c.status, amt(c.remaining)]) }]; })),
  "D. DAG with bidirectional metadata": (() => { const { graph, state } = withRules([rule("a", RULE_REF("b"), { dependsOn: [legal("REQUIRES", "b")] }), rule("b", MONEY(50), { dependsOn: [legal("REQUIRES", "a"), legal("LIMITED_BY", "a")] })]); return { cycles: graph.cycles.length, dependsOn: graph.edges.filter((e) => e.kind === "DEPENDS_ON").map((e) => [e.from, e.to]), a: brief(state, "a") }; })(),
  "E. three-node real cycle": (() => { const { graph, state } = withRules([rule("a", RULE_REF("b")), rule("b", RULE_REF("c")), rule("c", RULE_REF("a"))]); return { cycles: graph.cycles.map((c) => c.nodePath), statuses: state.capacities.map((c) => c.status) }; })(),
};
const frozen = readJson<{ rules: IRRule[]; definitions: IRDefinition[]; sharedCapacities?: IRSharedCapacity[] }>(FROZEN);
const PC = "pf-co", PI = "pf-in";
const retarget = <T extends { companyId: string; instrumentKey: string }>(o: T): T => JSON.parse(JSON.stringify(o).replace(new RegExp(`"${o.companyId}"`, "g"), `"${PC}"`).replace(new RegExp(`"${o.instrumentKey}"`, "g"), `"${PI}"`)) as T;
const frozenRules = frozen.rules.filter((r) => r.capacityExpression).map(retarget);
const frozenGraph = buildCapacityGraph({ rules: frozenRules, definitions: frozen.definitions.map(retarget), sharedCapacities: (frozen.sharedCapacities ?? []).map(retarget), companyId: PC, instrumentKey: PI, asOf: AS_OF });
const frozenState = evaluateCapacityState({ graph: frozenGraph, rules: frozenRules, definitions: frozen.definitions.map(retarget), inputs: EMPTY_RESOLVER, asOf: AS_OF });
const frozenShares = frozenGraph.edges.filter((e) => e.sourceRelationship === "SHARES_CAPACITY_WITH");
const cycleHolds = cyc["A. true directed cycle"].cycles.length === 1 && cyc["A. true directed cycle"].statuses.every((s) => s !== "AVAILABLE") && cyc["B. symmetric shared-cap relationship"].cycles === 0 && Object.values(cyc["C. symmetric legal relationships"]).every((c: Any) => c.cycles === 0) && cyc["D. DAG with bidirectional metadata"].cycles === 0 && cyc["D. DAG with bidirectional metadata"].a.gross === "50" && cyc["E. three-node real cycle"].cycles.length === 1 && frozenGraph.cycles.length === 0;
writeJson(`${OUT}/09-cycle-semantics.json`, { artifact: "PHASE 4C remediation R12 - real cycles versus symmetric relationships", at: at(), cycleDetectionRunsOver: [...EVALUATION_DEPENDENCY_EDGE_KINDS], synthetic: cyc, frozenCorpus: { evaluationCycles: frozenGraph.cycles.length, sharesCapacityWithEdges: frozenShares.length, allCarriedAsLegalRelationship: frozenShares.every((e) => e.kind === "LEGAL_RELATIONSHIP"), preRemediation: "5 cycles reported, all symmetric SHARES_CAPACITY_WITH pairs (audit P20)" }, holds: cycleHolds });

// ---------------- 10 complexity
const chain = (size: number) => {
  n = 0;
  const pad = (i: number) => String(i).padStart(5, "0");
  const rules = Array.from({ length: size }, (_, i) => rule(`zr-${pad(i)}`, MONEY(100), { dependsOn: i > 0 ? [legal("SHARES_CAPACITY_WITH", `zr-${pad(i - 1)}`)] : [] }));
  const caps = [sharedCap("zr-pool", MONEY(1_000_000), rules.map((r) => r.ruleId))];
  const ledger = rules.map((r, i) => usage(`zu-${pad(i)}`, "1", onRule(r.ruleId)));
  return { rules, caps, ledger };
};
const measure = (size: number) => {
  const { rules, caps, ledger } = chain(size);
  const t0 = process.hrtime.bigint();
  const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const t1 = process.hrtime.bigint();
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
  const t2 = process.hrtime.bigint();
  return { size, buildMs: +(Number(t1 - t0) / 1e6).toFixed(1), evalMs: +(Number(t2 - t1) / 1e6).toFixed(1), counters: state.complexity };
};
measure(50);
const rows = [100, 200, 400, 800, 1600].map(measure);
const slopeOf = (key: "buildMs" | "evalMs") => { const xs = rows.map((r) => Math.log(r.size)), ys = rows.map((r) => Math.log(Math.max(0.01, r[key]))); const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length; return +(xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0)).toFixed(2); };
const countersLinear = rows.every((r) => r.counters.nodesVisited === r.size + 1 && r.counters.expressionsEvaluated === r.size + 1 && r.counters.ledgerEntriesExamined === r.size && r.counters.ledgerEntriesApplied === r.size && r.counters.edgesVisited === r.size && r.counters.sharedResourceLookups === r.size && r.counters.dependencyLookups === r.size + 1 && r.counters.indexLookups <= 6 * r.size + 6);
const wall = { build: slopeOf("buildMs"), eval: slopeOf("evalMs") };
writeJson(`${OUT}/10-complexity-remediation.json`, {
  artifact: "PHASE 4C remediation R13 - the algorithmic sources, the fix, the counters, and a supplemental wall-clock re-measurement", at: at(),
  auditedMeasurement: { construction: "chain of SHARES_CAPACITY_WITH, one pool over every rule, one usage per rule", evalLogLogSlope: 1.81, evalMsAt1600: "about 8000" },
  algorithmicSourcesFound: [
    "state.ts: selectUsage walked index.ordered (the whole ledger) once per capacity and once more per pool member -> O(capacities x ledger)",
    "state.ts: graph.nodes.filter(...) per rule for component roles, graph.edges.filter(...) per rule for member edges -> O(rules x nodes), O(rules x edges)",
    "state.ts: memberEdges.length added to edgesVisited per rule, so the counter grew quadratically without measuring anything",
    "graph.ts: nodes.some(...) existence checks per member and per dependency; unionManifests merged.find per dependency; dependsOn lists via edges.filter per node",
    "reclassification.ts: reclassEdges.find per election and explanations.find per election",
  ],
  fix: ["ledger indexed once by path; selection memoized per (path, currency) so pools re-read members through the memo", "membership, component, pool and rule lookups via Maps built once", "nodeIds Set for existence; manifest union keyed by dependency identity; grouped single passes for dependency lists and edge de-duplication", "reclassification edge and explanation lookups via Maps"],
  counters: rows.map((r) => ({ size: r.size, ...r.counters })),
  countersLinearInN: countersLinear,
  wallClockSupplemental: { rows: rows.map((r) => ({ size: r.size, buildMs: r.buildMs, evalMs: r.evalMs })), logLogSlope: wall, note: "supplemental; the proof is the counters. Measured in-process while writing this artifact, so subject to machine load." },
});

// ---------------- 11 adversarial regression + 12 real fixture + 13 full regression
const rel = (p: string) => p.replace(/^.*?\/(tests|lib|scripts|app|prisma)\//, "$1/");
const readV = (p: string | undefined) => { if (!p || !existsSync(p)) return null; const j = readJson<Any>(p); return { sha256: sha256(readFileSync(p)), tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, ids: new Map<string, string>((j.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).map((t) => [`${rel(String(f.name))} :: ${t.fullName}`, t.status]))) }; };
const full = readV(process.env.VITEST_FULL_JSON), base = readV(process.env.VITEST_FULL_BASE_JSON), targeted = readV(process.env.VITEST_TARGETED_JSON);
const pick = (prefix: string) => (targeted ? [...targeted.ids].filter(([k]) => k.startsWith(prefix)) : []);
const suite = (prefix: string) => ({ tests: pick(prefix).length, failed: pick(prefix).filter(([, s]) => s === "failed").length });
const forensic = suite("tests/contract-model/runtime/capacity/forensic-regression.test.ts");
const matrices = suite("tests/contract-model/runtime/capacity/remediation-matrices.test.ts");
const original = ["capacity-state", "shared-and-ledger", "builder-and-reclassification", "determinism-and-generality", "phase3-fixture-proof"].map((f) => [f, suite(`tests/contract-model/runtime/capacity/${f}.test.ts`)] as const);
writeJson(`${OUT}/11-adversarial-regression.json`, { artifact: "PHASE 4C remediation R15/R16 - the forensic suite, the matrices, and the original suite", at: at(), forensicSuite: { file: "tests/contract-model/runtime/capacity/forensic-regression.test.ts", probes: ["P3", "P7", "P8", "P12", "P13", "P15", "P16", "P18", "P19", "P19b", "P20", "P21", "P22"], ...forensic, tests: pick("tests/contract-model/runtime/capacity/forensic-regression.test.ts").map(([k, s]) => [k.split(" :: ")[1], s]) }, matrices: { file: "tests/contract-model/runtime/capacity/remediation-matrices.test.ts", covers: ["R4 A-J", "R5", "R7", "R8", "R9", "R10", "R11", "R12 A-E", "R13"], ...matrices }, originalSuite: Object.fromEntries(original), originalTestsChanged: CHANGED_TESTS, targetedRunSupplied: targeted !== null });

const shareMembers = new Set(frozenShares.flatMap((e) => [e.from, e.to]));
const statusCounts = frozenState.capacities.reduce<Record<string, number>>((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {});
writeJson(`${OUT}/12-real-fixture-retest.json`, { artifact: "PHASE 4C remediation R18 - the frozen real corpus after remediation; gaps kept explicit", at: at(), source: { path: FROZEN, sha256: sha256(readFileSync(FROZEN)) }, rulesWithCapacity: frozenRules.length, nodes: frozenGraph.nodes.length, edges: frozenGraph.edges.length, statusCounts, evaluationCycles: frozenGraph.cycles.length, limitationCodes: [...new Set(frozenGraph.limitations.map((l) => l.code))].sort(), realCorpusSharedCapacityCount: (frozen.sharedCapacities ?? []).length, realCorpusExecutableReclassificationEdgeCount: frozenGraph.edges.filter((e) => e.kind === "RECLASSIFIABLE_TO").length, sharesCapacityWithEdges: frozenShares.length, unquantifiedShareMembers: { count: [...shareMembers].length, allNonAuthoritative: frozenState.capacities.filter((c) => shareMembers.has(c.capacityNodeId)).every((c) => c.status !== "AVAILABLE" && c.effectiveRemaining.kind === "NOT_DETERMINED") }, everyUndeterminedGrossIsNonAvailable: frozenState.capacities.every((c) => (c.grossCapacity.kind === "NOT_DETERMINED" ? c.status !== "AVAILABLE" : true)), honestGap: "the frozen corpus contains 0 quantified shared-capacity resources and 0 executable reclassification edges; shared-capacity and reclassification runtime execution are proved on synthetic IR only, and no fixture here is described as frozen real evidence" });

const newFailing = full && base ? [...full.ids].filter(([k, s]) => s === "failed" && base.ids.get(k) !== "failed").map(([k]) => k) : null;
const targetedNew = targeted && base ? [...targeted.ids].filter(([k, s]) => s === "failed" && base.ids.get(k) !== "failed").map(([k]) => k) : null;
const TIMING_FILES = ["tests/contract-model/part-b-recert-finding4-independent.test.ts", "tests/contract-model/part-b-terminal-recert-open3-independent.test.ts"];
const isTiming = (k: string) => TIMING_FILES.some((f) => k.startsWith(f)) && /wall-clock time|scaling behavior/.test(k);
const allNew = [...new Set([...(newFailing ?? []), ...(targetedNew ?? [])])];
const isolationRuns = (process.env.ISOLATION_JSONS ?? "").split(",").filter(Boolean).map((p) => { const j = readJson<Any>(p); return { file: p.replace(/^.*\//, ""), tests: j.numTotalTests, failed: j.numFailedTests, failing: (j.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).filter((t) => t.status === "failed").map((t) => String(t.fullName).slice(0, 70))) }; });
const isoPass = isolationRuns.filter((r) => r.failed === 0).length, isoFail = isolationRuns.length - isoPass;
const scaling = process.env.SCALING_JSON && existsSync(process.env.SCALING_JSON) ? readJson<Any>(process.env.SCALING_JSON) : null;
const tsc = file("TSC_LOG"), lint = file("LINT_LOG"), build = file("BUILD_LOG");
const tscErr = tsc ? tsc.split("\n").filter((l) => /error TS\d+/.test(l)) : null;
const tscNew = tscErr ? tscErr.filter((l) => !/tests\/foundation-audit\//.test(l)) : null;
const lintOk = lint !== null && /^EXIT=0\s*$/m.test(lint) && /No ESLint warnings or errors/.test(lint);
const buildOk = build !== null && /^EXIT=0\s*$/m.test(build) && /Compiled successfully/.test(build);
const inheritedOnly = allNew.length === 0 || (allNew.every(isTiming) && after.phase3Compiler === PHASE3_TREES["lib/contract-model/compiler/"]);
writeJson(`${OUT}/13-full-regression.json`, {
  artifact: "PHASE 4C remediation R14/R19 - full regression at the remediated tree", at: at(), headAtRun: head, workingTreeDirty: sh("git status --porcelain").trim() !== "",
  targeted: targeted ? { tests: targeted.tests, passed: targeted.passed, failed: targeted.failed, newFailingVsBase: targetedNew } : "NOT_SUPPLIED",
  fullSuite: full && base ? { base: { sha256: base.sha256, tests: base.tests, passed: base.passed, failed: base.failed }, now: { sha256: full.sha256, tests: full.tests, passed: full.passed, failed: full.failed }, newFailingIdentities: newFailing } : "NOT_SUPPLIED",
  inheritedInstability: { classification: "INHERITED FLAKY / UNSTABLE TEST - not waived, not called passing", identities: allNew, allAreTimingIdentities: allNew.every(isTiming), measuredFunction: "segmentCoordinateClauses (lib/contract-model/compiler/semantic-coverage/unit-hypothesis.ts), frozen Phase-3 tree", phase3TreeUnchanged: after.phase3Compiler === PHASE3_TREES["lib/contract-model/compiler/"], isolationRuns, isolationPasses: isoPass, isolationFails: isoFail, directMeasurement: scaling, rootCause: "per-step threshold lenRatio^2 x 0.6 (about 2.4) against a linear prediction of 2.0; ordinary noise under runner load exceeds it; not a Phase-4C regression (both identities predate Phase 4A and failed in the 4A and 4B regression artifacts)", waived: false },
  noRegressionAttributableToPhase4C: inheritedOnly,
  tsc: tscErr ? { errors: tscErr.length, newErrors: tscNew!.length, preexisting: "tests/foundation-audit/" } : "NOT_SUPPLIED",
  lint: lint ? { ok: lintOk } : "NOT_SUPPLIED", build: build ? { ok: buildOk } : "NOT_SUPPLIED",
});

// ---------------- 14 recertification gate (R19, 32 conditions)
const capSrc = sh(`cat ${CAP_DIR}/*.ts`).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const SOLVER_NAMES = ["maximumTransactionAmount(", "bestBasket", "optimalAllocation", "findPermissionPath", "solveFor", "chooseBasket", "simulateTransaction", "applyHypothetical"];
const solverHits = SOLVER_NAMES.filter((f) => capSrc.includes(f));
const provDemo = run([rule("a", MUL(PCT(0.1), METRIC("m1")))], { inputs: snaps(snap("s1", [fact("m1", "1000")])), ledger: [usage("u1", "10", onRule("a"))] }).state;
const repeat = (() => { n = 0; const R = [rule("a", MONEY(100))]; const Ld = [usage("u1", "30", onRule("a"))]; return Array.from({ length: 5 }, () => run(R, { ledger: Ld }).state.stateHash); })();
const allCapacityPass = original.every(([, s]) => s.failed === 0) && forensic.failed === 0 && matrices.failed === 0 && targeted !== null;
const G: [number, string, boolean, string][] = [
  [1, "Phase 3 remains frozen", phase3Frozen, `compiler ${after.phase3Compiler}; semantic ${after.phase3Semantic}`],
  [2, "Phase 4A semantics remain unchanged", phase4aUnchanged && dirtyOutsideCapacity.length === 0, `runtime file identity before ${before.phase4aRuntimeFiles.identity.slice(0, 12)} after ${after.phase4aRuntimeFiles.identity.slice(0, 12)}`],
  [3, "Phase 4B semantics remain unchanged", phase4bUnchanged, `input tree identity before ${before.phase4bInput.identity.slice(0, 12)} after ${after.phase4bInput.identity.slice(0, 12)}`],
  [4, "batch reclassification conservation holds", conservationHolds, "03"],
  [5, "aggregate elections cannot create capacity", R4["F. two elections individually valid, jointly over (audit P7)"].afterIsNull && R4["C. one election above source usage"].afterIsNull && R4["I. one source to two targets over"].afterIsNull, "03 C/F/I"],
  [6, "duplicate election identity cannot execute twice", R4["H. duplicate election identity (audit P8)"].afterIsNull && R4["H. duplicate election identity (audit P8)"].outcomes.filter((o) => o.id === "dup").every((o) => o.codes.includes("DUPLICATE_ELECTION_IDENTITY")), "03 H"],
  [7, "duplicate ledger identity cannot double-count usage", ledgerIdentitySafe, "04"],
  [8, "duplicate capacity / shared-resource identity cannot resolve by array order", sharedIdentitySafe, "05"],
  [9, "unsafe Phase-3 states always dominate numeric availability", dominanceHolds, "06"],
  [10, "unquantified shared-capacity relationships do not produce authoritative effective availability", unqHolds, "07"],
  [11, "missing / ambiguous allocation data fails explicitly", allocHolds, "08"],
  [12, "snapshot ambiguity semantics are correct and order-independent", snapHolds, "08"],
  [13, "symmetric non-dependency relationships do not produce false evaluation cycles", cyc["B. symmetric shared-cap relationship"].cycles === 0 && Object.values(cyc["C. symmetric legal relationships"]).every((c: Any) => c.cycles === 0) && cyc["D. DAG with bidirectional metadata"].cycles === 0 && frozenGraph.cycles.length === 0, "09"],
  [14, "true dependency cycles still fail closed", cyc["A. true directed cycle"].cycles.length === 1 && cyc["E. three-node real cycle"].cycles.length === 1 && cyc["A. true directed cycle"].statuses.every((s) => s !== "AVAILABLE"), "09"],
  [15, "capacity evaluation no longer exhibits accidental near-quadratic structural behaviour", countersLinear && wall.eval < 1.5, `counters exact-linear ${countersLinear}; supplemental wall-clock eval slope ${wall.eval} (audited 1.81)`],
  [16, "deterministic complexity counters support the claimed complexity", countersLinear, "10"],
  [17, "original Phase-4C valid tests pass", targeted !== null && original.every(([, s]) => s.failed === 0 && s.tests > 0), `${original.map(([f, s]) => `${f} ${s.tests}/${s.failed}`).join("; ")}`],
  [18, "adversarial forensic regression suite passes", targeted !== null && forensic.tests > 0 && forensic.failed === 0, `${forensic.tests} tests, ${forensic.failed} failed`],
  [19, "reclassification synthetic matrix passes", targeted !== null && matrices.failed === 0 && conservationHolds, `matrices ${matrices.tests}/${matrices.failed}`],
  [20, "shared-capacity synthetic matrix passes", targeted !== null && matrices.failed === 0 && unqHolds && sharedIdentitySafe, "07 / 05 / shared-and-ledger"],
  [21, "real fixture limitations remain honestly disclosed", (frozen.sharedCapacities ?? []).length === 0 && frozenGraph.edges.filter((e) => e.kind === "RECLASSIFIABLE_TO").length === 0, "12: 0 quantified pools, 0 executable reclassification edges, stated"],
  [22, "provenance remains complete", Boolean(provDemo.explanations[0]?.sourceRules[0]?.sourceCitation) && provDemo.snapshotBinding.snapshotIds.length === 1 && provDemo.explanations[0]!.ledgerEntries.length === 1 && provDemo.explanations[0]!.inputsUsed.length > 0, "explanation carries citation, snapshot, ledger entry, inputs"],
  [23, "immutability / hash determinism remains intact", new Set(repeat).size === 1 && orderF1 === orderF2 && dupDiff.state.stateHash === dupRev.state.stateHash, "repeat hashes identical; permutation hashes identical"],
  [24, "no solver / simulation logic has entered Phase 4C", solverHits.length === 0 && !capSrc.includes("hypothetical"), `hits ${solverHits.join(", ") || "none"}`],
  [25, "Phase 4D remains unstarted", !existsSync("lib/contract-model/runtime/transaction") && !capSrc.includes("applyHypothetical"), ""],
  [26, "Phase 4E remains unstarted", !existsSync("lib/contract-model/runtime/solver") && solverHits.length === 0, ""],
  [27, "Phase 5 remains unstarted", !existsSync(`${CAP_DIR}/ingestion.ts`) && !/fetch\(|PrismaClient|xlsx|csv-parse/.test(capSrc), ""],
  [28, "tsc passes with no new errors", tscNew !== null && tscNew.length === 0, `tsc new ${tscNew?.length ?? "n/a"}`],
  [29, "lint passes", lintOk, ""],
  [30, "build passes", buildOk, ""],
  [31, "full regression has no attributable new failures", full !== null && base !== null && inheritedOnly, `new identities ${allNew.length}: ${allNew.map((k) => k.slice(0, 80)).join(" | ") || "none"}`],
  [32, "inherited segmentCoordinateClauses instability documented honestly and not waived", isolationRuns.length >= 6 && scaling !== null && after.phase3Compiler === PHASE3_TREES["lib/contract-model/compiler/"], `isolation ${isoPass} pass / ${isoFail} fail of ${isolationRuns.length}; direct slope ${scaling?.logLogSlope ?? "n/a"}; classification INHERITED FLAKY / UNSTABLE, not waived`],
];
const failing = G.filter((g) => !g[2]);
const verdict = failing.length === 0 ? "PHASE4C_CAPACITY_STATE_READY" : "PHASE_4C_NOT_COMPLETE";
writeJson(`${OUT}/14-recertification.json`, {
  artifact: "PHASE 4C remediation R19 - the 32-condition recertification gate", at: at(), remediationStartingSha: REMEDIATION_STARTING_SHA, phase4cStartingSha: PHASE4C_STARTING_SHA, headAtRun: head,
  criterionChangeDisclosure: "the original Phase-4C gate condition 32 was reworded after its first run (audit U16); this recertification uses the mission's own 32 conditions verbatim and none was changed after seeing a result",
  conditions: G.map(([num, condition, pass, evidence]) => ({ n: num, condition, status: pass ? "PASS" : "FAIL", evidence })),
  summary: { PASS: G.length - failing.length, FAIL: failing.length, total: G.length },
  smallestRemainingBlockerSet: failing.map((g) => `${g[0]} ${g[1]}`),
  verdict, phase4cComplete: verdict === "PHASE4C_CAPACITY_STATE_READY",
  paidCalls: 0, modelCalls: 0, phase4dStarted: false, phase4eStarted: false, phase5Started: false,
});

// ---------------- 15 handoff (only after recertification, with the remediation commit sha)
if (handoffSha) {
  const gate = readJson<Any>(`${OUT}/14-recertification.json`);
  const capacityAtSha = treeIdentity(handoffSha, CAP_DIR);
  writeJson(`${OUT}/15-phase4d-handoff.json`, {
    artifact: "PHASE 4C remediation R21 - the Phase-4D handoff", at: at(),
    phase4dStartingSha: handoffSha,
    phase4dStartingShaNote: "the commit carrying the remediated production code, tests and artifacts 00-14; this file is sealed by the immediately following commit, whose only change is this file. Phase 4D verifies the tree identities below, which are identical in both commits.",
    supersededPhase4dStartingSha: REMEDIATION_STARTING_SHA,
    phase3TreeHash: { compiler: after.phase3Compiler, semantic: after.phase3Semantic },
    phase4aRuntimeIdentity: after.phase4aRuntimeFiles,
    phase4bInputTreeIdentity: after.phase4bInput,
    phase4cCapacityTreeIdentity: capacityAtSha,
    capacityGraphVersion: CAPACITY_GRAPH_VERSION,
    phase4cGateVerdict: gate.verdict,
    recertification: { conditions: gate.summary, artifact: `${OUT}/14-recertification.json` },
    knownInheritedInstabilities: [{ identities: TIMING_FILES, function: "segmentCoordinateClauses", classification: "INHERITED FLAKY / UNSTABLE TEST", waived: false, evidence: `${OUT}/13-full-regression.json` }],
    realCorpusSharedCapacityCount: (frozen.sharedCapacities ?? []).length,
    realCorpusExecutableReclassificationEdgeCount: frozenGraph.edges.filter((e) => e.kind === "RECLASSIFIABLE_TO").length,
    phase4dStarted: false, phase4eStarted: false, phase5Started: false,
  });
}
console.log(JSON.stringify({ verdict, pass: G.length - failing.length, total: G.length, failing: failing.map((g) => `${g[0]} ${g[1]}`), wall, countersLinear, newFailing: allNew, handoff: handoffSha }, null, 1));
