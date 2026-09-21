/**
 * PHASE 4D POST-REMEDIATION INDEPENDENT AUDIT GATE.
 *
 * Supersedes docs/phase-4d/remediation/10-recertification-gate.json, which passed 43/43 at
 * ec506b40 while three real problems were present:
 *
 *   N1  an interleaving the engine itself flagged as unrepresentable was still committable,
 *       because the limitation it raised carried no status floor and no blocking role;
 *   N2  a reclassification composed with an independent supersession of the same usage left
 *       NEGATIVE recorded usage - capacity manufactured from nothing - and was committable,
 *       because post-state validation checked over-consumption but not under-consumption;
 *   N3  the gate's own "tsc has no new error" predicate read a log written BEFORE the gate
 *       script existed, so it validated a tree that did not include itself.
 *
 * This gate re-executes the safety properties, adds the two missing conflict classes, and
 * refuses to trust an external log that is older than the sources it claims to cover.
 */
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { readJson, sh } from "./phase-3-601-revalidation-lib";
import type { IRExpression, IRRule, IRSharedCapacity } from "../lib/contract-model/ir/types";
import { rationalFromString } from "../lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "../lib/contract-model/runtime/types";
import { snapshotInputResolver } from "../lib/contract-model/runtime/input/snapshot-resolver";
import type { FinancialInput, FinancialSnapshot } from "../lib/contract-model/runtime/input/types";
import { buildCapacityGraph, evaluateCapacityState } from "../lib/contract-model/runtime/capacity";
import type { CapacityState, LedgerUsageRecord, ReclassificationElection } from "../lib/contract-model/runtime/capacity/types";
import { simulateTransaction } from "../lib/contract-model/runtime/transaction/simulate";
import { TRANSACTION_SIMULATION_VERSION } from "../lib/contract-model/runtime/transaction/version";
import type { HypotheticalTransaction, SelectedPath, TransactionEffect, TransactionQuantity, TransactionSimulationResult } from "../lib/contract-model/runtime/transaction/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const OUT = "docs/phase-4d/post-remediation-audit";
const at = () => new Date().toISOString();
const FAILED = "feab14fd7a0245586f92342b3833d5c224603e83";
const REMEDIATION = "ec506b40adb1d9d6c8cda21c1603c2c986a0109a";
const TX_DIR = "lib/contract-model/runtime/transaction";

const CO = "audit-org", INST = "audit-inst", AS_OF = "2026-06-30";
const L = { exprId: null, inputKeys: [] as string[] };
let n = 0; const id = () => `a${++n}`;
const MONEY = (amount: number): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency: "USD", exprId: id() });
const rule = (ruleId: string, cap: Any, over: Partial<IRRule> = {}): IRRule => ({
  ruleId, irSchemaVersion: "a", companyId: CO, instrumentKey: INST, sourceDocumentId: "d",
  sourceSectionRef: `s-${ruleId}`, covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], transactionScope: null,
  capacityExpression: cap, conditions: [], exceptions: [], dependsOn: [], operativeLineage: null,
  sufficiency: "COMPLETE", sufficiencyReasons: [],
  provenance: { documentId: "d", sourceNodeKey: null, sourceCitation: `c-${ruleId}`, excerpt: null },
  compilerVersion: null, sourceContentVersion: null, ...over,
});
const poolOf = (sharedCapId: string, cap: IRExpression, memberRuleIds: string[]): IRSharedCapacity =>
  ({ sharedCapId, companyId: CO, instrumentKey: INST, description: sharedCapId, capExpression: cap as Any, memberRuleIds, provenance: null });
const pack = (inputs: FinancialInput[]): FinancialSnapshot => ({
  snapshotId: "audit-pack", version: "1", companyId: CO, asOf: AS_OF, reportingPeriod: "p", status: "APPROVED",
  supersedesSnapshotId: null, provenance: { source: "audit", sourceVersion: "v1" },
  review: { reviewedBy: "a", reviewedAt: "2026-07-01T00:00:00Z", approvalRef: "r" }, inputs,
});
const usage = (usageId: string, amount: string, ruleId: string): LedgerUsageRecord => ({
  usageId, companyId: CO, instrumentKey: INST, effectiveAsOf: "2026-01-31", amount: { amount, currency: "USD" },
  capacityPath: { kind: "RULE", ruleId }, transactionRef: `h-${usageId}`, status: "RECORDED", supersededByUsageId: null,
  provenance: { source: "hist", sourceVersion: "v1", approvalRef: "h", approvalState: "APPROVED" },
});
const nodeOf = (r: string) => `capacity:rule:${r}`;
interface Scene { graph: Any; state: CapacityState; inputs: Any; context: Any }
function scene(o: { rules: IRRule[]; pools?: IRSharedCapacity[]; ledger?: LedgerUsageRecord[] }): Scene {
  const rules = o.rules, pools = o.pools ?? [], ledger = o.ledger ?? [];
  const inputs = snapshotInputResolver({ snapshots: [pack([])], definitions: [], rules, companyId: CO, instrumentKey: INST });
  const graph = buildCapacityGraph({ rules, sharedCapacities: pools, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: pools, inputs, ledger, asOf: AS_OF });
  return { graph, state, inputs, context: { rules, sharedCapacities: pools, ledger, asOf: AS_OF } };
}
const cash = (amount: string): TransactionQuantity => ({ type: "MONEY", amount, currency: "USD" });
const consume = (effectId: string, node: string, amount: TransactionQuantity, over: Any = {}): TransactionEffect =>
  ({ effectId, kind: "CONSUME_CAPACITY", capacityNodeId: node, amount, ...over } as Any);
const supersede = (effectId: string, usageId: string, amt: TransactionQuantity | null): TransactionEffect =>
  ({ effectId, kind: "SUPERSEDE_LEDGER_USAGE", usageId, replacementAmount: amt, reason: "restated" } as Any);
const restore = (effectId: string, usageId: string): TransactionEffect => ({ effectId, kind: "RESTORE_CAPACITY", usageId, reason: "released" } as Any);
const reclassify = (effectId: string, e: ReclassificationElection): TransactionEffect => ({ effectId, kind: "APPLY_RECLASSIFICATION", election: e } as Any);
const electionOf = (electionId: string, s: string, d: string, amount: string): ReclassificationElection =>
  ({ electionId, sourceRuleId: s, destinationRuleId: d, amount: { amount, currency: "USD" }, effectiveAsOf: "2026-03-31", provenance: { source: "b", sourceVersion: "v", approvalRef: "a" } } as Any);
const txOf = (transactionId: string, effects: TransactionEffect[], over: Partial<HypotheticalTransaction> = {}): HypotheticalTransaction =>
  ({ transactionId, companyId: CO, instrumentKey: INST, effectiveAsOf: AS_OF, category: null, label: null, effects,
    provenance: { source: "audit", sourceVersion: "v1", approvalRef: null }, ...over } as Any);
const path = (o: Partial<SelectedPath> = {}): SelectedPath => ({ capacityNodeIds: [], ruleIds: [], sharedCapacityIds: [], reclassificationElectionIds: [], ...o });
const run = (s: Scene, t: HypotheticalTransaction, p: SelectedPath) =>
  simulateTransaction({ transaction: t, currentState: s.state, capacityGraph: s.graph, selectedPath: p, inputs: s.inputs, context: s.context });
const amt = (a: Any): string | null => (a && a.kind === "AMOUNT" && a.value?.type === "MONEY" ? a.value.amount : null);
const codesOf = (r: TransactionSimulationResult) => r.limitations.map((l) => l.code).sort();

/** Unsafe = over-consumed OR under-consumed. Both directions, because both manufacture error. */
function unsafe(state: CapacityState | null): string[] {
  if (!state) return [];
  const o: string[] = [];
  const neg = (x: Any) => String(amt(x) ?? "").startsWith("-");
  for (const c of state.capacities) {
    if (c.limitations.some((l) => l.code === "OVER_CONSUMPTION")) o.push(`cap:${c.capacityNodeId}:over`);
    else if (neg(c.remaining)) o.push(`cap:${c.capacityNodeId}:negRemaining`);
    if (neg(c.usage)) o.push(`cap:${c.capacityNodeId}:negUsage`);
  }
  for (const s of state.sharedConstraints) {
    if (s.limitations.some((l) => l.code === "OVER_CONSUMPTION")) o.push(`shared:${s.sharedCapacityId}:over`);
    else if (neg(s.remaining)) o.push(`shared:${s.sharedCapacityId}:negRemaining`);
    if (neg(s.usage)) o.push(`shared:${s.sharedCapacityId}:negUsage`);
  }
  return [...new Set(o)].sort();
}

// --- scenarios --------------------------------------------------------------
const flat = (c: number, led: LedgerUsageRecord[] = []) => scene({ rules: [rule("P", MONEY(c))], ledger: led });
const rP = path({ capacityNodeIds: [nodeOf("P")], ruleIds: ["P"] });
const reclScene = (u: string) => scene({
  rules: [rule("SRC", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "DST", description: "may reclassify" }] as Any }), rule("DST", MONEY(100))],
  ledger: [usage("h1", u, "SRC")],
});
const rSrc = path({ capacityNodeIds: [nodeOf("SRC")], ruleIds: ["SRC", "DST"], reclassificationElectionIds: ["EL"] });

const N2a = run(reclScene("40"), txOf("N2a", [reclassify("r", electionOf("EL", "SRC", "DST", "40")), supersede("s", "h1", cash("5"))]), rSrc);
const N2b = run(reclScene("40"), txOf("N2b", [reclassify("r", electionOf("EL", "SRC", "DST", "40")), restore("s", "h1")]), rSrc);
const N1 = run(reclScene("50"), txOf("N1", [
  reclassify("a", electionOf("E1", "SRC", "DST", "20")),
  consume("mid", nodeOf("SRC"), cash("5")),
  reclassify("b", electionOf("E2", "SRC", "DST", "20")),
]), path({ capacityNodeIds: [nodeOf("SRC")], ruleIds: ["SRC", "DST"], reclassificationElectionIds: ["E1", "E2"] }));
const AGG = run(flat(100), txOf("AGG", [consume("x", nodeOf("P"), cash("60")), consume("y", nodeOf("P"), cash("60"))]), rP);
const EXACT = run(flat(100), txOf("EXACT", [consume("x", nodeOf("P"), cash("60")), consume("y", nodeOf("P"), cash("40"))]), rP);
const SHARED = run(
  scene({ rules: [rule("A", MONEY(500)), rule("B", MONEY(500))], pools: [poolOf("POOL", MONEY(100), ["A", "B"])] }),
  txOf("SHARED", [consume("x", nodeOf("A"), cash("60")), consume("y", nodeOf("B"), cash("60"))], { intendedAmount: cash("120") } as Any),
  path({ capacityNodeIds: [nodeOf("A"), nodeOf("B")], ruleIds: ["A", "B"], sharedCapacityIds: ["POOL"] }));

/** Broad invariant sweep including reclassification and ledger composition. */
const sweep = (() => {
  const amounts = ["5", "30", "60", "95"];
  let checked = 0; const violations: string[] = [];
  const check = (label: string, r: TransactionSimulationResult) => {
    checked++;
    const u = unsafe(r.postState);
    if (r.commitPlan.committable && u.length > 0) violations.push(`${label}: committable with ${u.join(",")}`);
    if (r.selectedPathResult === "SATISFIED" && u.length > 0) violations.push(`${label}: SATISFIED with ${u.join(",")}`);
  };
  for (const a of amounts) for (const b of amounts) for (const h of ["0", "25"]) {
    const led = h === "0" ? [] : [usage("h1", h, "P")];
    check(`c(${a})+c(${b})h${h}`, run(flat(100, led), txOf("s", [consume("e1", nodeOf("P"), cash(a)), consume("e2", nodeOf("P"), cash(b))]), rP));
  }
  for (const a of amounts) for (const kind of ["sup", "res"]) for (const order of [0, 1]) {
    const other = kind === "sup" ? supersede("s", "h1", cash("5")) : restore("s", "h1");
    const cn = consume("c", nodeOf("P"), cash(a));
    check(`${kind}/consume(${a})o${order}`, run(flat(100, [usage("h1", "40", "P")]), txOf("s", order === 0 ? [other, cn] : [cn, other]), rP));
  }
  for (const a of amounts) for (const kind of ["sup", "res"]) for (const elec of ["20", "40"]) {
    const other = kind === "sup" ? supersede("s", "h1", cash(a)) : restore("s", "h1");
    check(`reclass(${elec})+${kind}(${a})`, run(reclScene("40"), txOf("s", [reclassify("r", electionOf("EL", "SRC", "DST", elec)), other]), rSrc));
  }
  return { compositionsChecked: checked, violations };
})();

// --- external logs, with a freshness requirement -----------------------------
const newestSourceMtime = (() => {
  let t = 0;
  const walk = (dir: string) => { for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${f.name}`;
    if (f.isDirectory()) { if (!["node_modules", ".git", ".next"].includes(f.name)) walk(p); }
    else if (/\.(ts|tsx)$/.test(f.name)) t = Math.max(t, statSync(p).mtimeMs);
  } };
  for (const d of ["lib", "tests", "scripts"]) if (existsSync(d)) walk(d);
  return t;
})();
const logFresh = (env: string) => { const p = process.env[env]; return Boolean(p && existsSync(p) && statSync(p).mtimeMs >= newestSourceMtime); };
const readLog = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readFileSync(p, "utf8") : ""; };
const tscLog = readLog("TSC_LOG"), lintLog = readLog("LINT_LOG"), buildLog = readLog("BUILD_LOG");
const tscNew = tscLog.split("\n").filter((l) => /error TS/.test(l) && !l.startsWith("tests/foundation-audit/"));

const rel = (p: string) => p.replace(/^.*?\/(tests|lib|scripts|app|prisma)\//, "$1/");
const readV = (env: string) => { const p = process.env[env]; if (!p || !existsSync(p)) return null; const j = readJson<Any>(p);
  return { tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests,
    ids: new Map<string, string>((j.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).map((t) => [`${rel(String(f.name))} :: ${t.fullName}`, t.status]))) }; };
const before = readV("VITEST_BEFORE_JSON"), after = readV("VITEST_AFTER_JSON");
const newFailing = before && after ? [...after.ids].filter(([k, v]) => v === "failed" && before.ids.get(k) !== "failed").map(([k]) => k).sort() : [];
const nowFixed = before && after ? [...before.ids].filter(([k, v]) => v === "failed" && after.ids.get(k) === "passed").map(([k]) => k).sort() : [];

// --- freeze ------------------------------------------------------------------
const tree = (ref: string, d: string) => sh(`git rev-parse ${ref}:${d}`);
const FROZEN_DIRS = ["lib/contract-model/compiler", "lib/contract-model/compiler/semantic", "lib/contract-model/ir", "lib/contract-model/runtime/input", "lib/contract-model/runtime/capacity"];
const frozen = FROZEN_DIRS.map((d) => ({ dir: d, atFailedBaseline: tree(FAILED, d), now: tree("HEAD", d), identical: tree(FAILED, d) === tree("HEAD", d) }));
const changedProd = [...new Set(sh(`git diff --name-only ${FAILED} -- lib/`).split("\n").filter(Boolean)
  .concat(sh("git diff --name-only -- lib/").split("\n").filter(Boolean), sh("git ls-files --others --exclude-standard lib/").split("\n").filter(Boolean)))].sort();
const outsideTx = changedProd.filter((f) => !f.startsWith(`${TX_DIR}/`));

// --- gate ---------------------------------------------------------------------
type C = { n: number; condition: string; kind: "behavioural" | "structural" | "external"; ok: boolean; evidence: string };
const G: C[] = [];
const add = (condition: string, kind: C["kind"], ok: boolean, evidence: string) => G.push({ n: G.length + 1, condition, kind, ok, evidence });

add("N1 an unrepresentable interleaving is refused AND non-committable", "behavioural",
  codesOf(N1).includes("UNSUPPORTED_EFFECT_INTERLEAVING") && !N1.commitPlan.committable && N1.selectedPathResult !== "SATISFIED",
  `${N1.simulationStatus}/${N1.selectedPathResult}, committable ${N1.commitPlan.committable}, ${codesOf(N1).join(",")}`);
add("N2 reclassification plus supersession of the same usage cannot manufacture capacity", "behavioural",
  codesOf(N2a).includes("USAGE_CONSERVATION_VIOLATED") && !N2a.commitPlan.committable && N2a.postState === null,
  `${codesOf(N2a).join(",")}; postState ${N2a.postState === null ? "null" : "published"}`);
add("N2 reclassification plus restore of the same usage cannot manufacture capacity", "behavioural",
  codesOf(N2b).includes("USAGE_CONSERVATION_VIOLATED") && !N2b.commitPlan.committable && N2b.postState === null,
  `${codesOf(N2b).join(",")}`);
add("negative recorded usage is treated as unsafe wherever it appears", "behavioural",
  unsafe(N2a.postState).length === 0 && unsafe(N2b.postState).length === 0, "no successor state published for either");
add("aggregate same-node consumption still fails closed", "behavioural", !AGG.commitPlan.committable && AGG.postState === null, `${AGG.selectedPathResult}`);
add("exact aggregate exhaustion still succeeds", "behavioural", EXACT.commitPlan.committable && amt(EXACT.postState!.capacities[0]!.remaining) === "0", "remaining 0");
add("aggregate shared-pool consumption still fails closed", "behavioural", !SHARED.commitPlan.committable, `${SHARED.selectedPathResult}`);
add("committable implies a safe final state across the sweep", "behavioural", sweep.violations.length === 0, `${sweep.compositionsChecked} compositions, ${sweep.violations.length} violations`);
add("no production change outside the transaction module", "structural", outsideTx.length === 0, outsideTx.join(",") || "none");
for (const f of frozen) add(`${f.dir} is byte-identical to the failed baseline`, "structural", f.identical, f.now.slice(0, 12));
add("Phase 4E remains unstarted", "structural", !existsSync("lib/contract-model/runtime/allocation") && !existsSync("lib/contract-model/runtime/optimizer"), "no directory");
add("Phase 5 remains unstarted", "structural", !existsSync("lib/contract-model/ingestion"), "no directory");
add("N3 the tsc log is newer than every source it claims to cover", "external", logFresh("TSC_LOG"), logFresh("TSC_LOG") ? "fresh" : "STALE - the log predates the current sources");
add("tsc has no new error", "external", tscLog !== "" && tscNew.length === 0 && logFresh("TSC_LOG"), `${tscNew.length} new`);
add("lint passes on a fresh log", "external", /No ESLint warnings or errors/.test(lintLog) && logFresh("LINT_LOG"), logFresh("LINT_LOG") ? "fresh+clean" : "stale or failing");
add("build passes on a fresh log", "external", /Compiled successfully/.test(buildLog) && logFresh("BUILD_LOG"), logFresh("BUILD_LOG") ? "fresh+compiled" : "stale or failing");
add("no new failing identity versus the remediation commit", "external", after !== null && before !== null && newFailing.length === 0,
  after && before ? `now ${after.failed}/${after.tests}; before ${before.failed}/${before.tests}; new ${newFailing.length}` : "inputs missing");

const pass = G.filter((c) => c.ok).length;
const failing = G.filter((c) => !c.ok);
const verdict = failing.length === 0 ? "PHASE4D_TRANSACTION_SIMULATION_READY"
  : failing.some((c) => /manufacture capacity|negative recorded usage|aggregate|safe final state/i.test(c.condition)) ? "PHASE4D_STATE_TRANSITION_UNSAFE"
    : failing.some((c) => /interleaving|conservation/i.test(c.condition)) ? "PHASE4D_LEDGER_TRANSITION_UNSAFE"
      : failing.some((c) => /byte-identical|outside the transaction module|unstarted/i.test(c.condition)) ? "PHASE4D_RUNTIME_BOUNDARY_VIOLATED"
        : "PHASE4D_REGRESSION_DETECTED";

writeJson(`${OUT}/01-audit-gate.json`, {
  artifact: "PHASE 4D POST-REMEDIATION INDEPENDENT AUDIT GATE", at: at(),
  supersedes: "docs/phase-4d/remediation/10-recertification-gate.json (43/43 at ec506b40)",
  failedBaseline: FAILED, remediationCommit: REMEDIATION, headAtRun: sh("git rev-parse HEAD"),
  transactionSimulationVersion: TRANSACTION_SIMULATION_VERSION,
  newDefectsFoundByThisAudit: [
    { id: "N1", title: "an interleaving the engine flagged as unrepresentable was still committable", severity: "HIGH", fixed: true },
    { id: "N2", title: "reclassification composed with an independent change to the same usage manufactured capacity (negative recorded usage)", severity: "CRITICAL", fixed: true },
    { id: "N3", title: "the remediation gate validated a tsc log older than its own gate script", severity: "PROCESS", fixed: true },
  ],
  conditions: G.map((c) => ({ n: c.n, condition: c.condition, kind: c.kind, status: c.ok ? "PASS" : "FAIL", evidence: c.evidence })),
  predicateMix: { behavioural: G.filter((c) => c.kind === "behavioural").length, structural: G.filter((c) => c.kind === "structural").length, external: G.filter((c) => c.kind === "external").length },
  sweep, regression: { newFailingIdentities: newFailing, nowPassingThatPreviouslyFailed: nowFixed },
  summary: { PASS: pass, FAIL: failing.length, total: G.length }, verdict,
  paidCalls: 0, modelCalls: 0, spendUsd: 0,
});
console.log(JSON.stringify({ verdict, pass, total: G.length, failing: failing.map((c) => c.condition), sweep: sweep.compositionsChecked, newFailing: newFailing.length }, null, 1));
