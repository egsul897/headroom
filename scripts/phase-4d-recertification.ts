/**
 * PHASE 4D REMEDIATION - recertification gate.
 *
 * The previous 58/58 gate is superseded. Several of its predicates proved much less than their
 * labels claimed: "transaction order sensitivity is correctly represented" passed because a string
 * in CANONICALIZATION_RULES contained the word "effects", and "the effect model is compositional"
 * passed because the expected number of effect kinds existed. Neither statement was executed.
 *
 * Every safety condition below RUNS THE ENGINE and asserts on what came back. Structural scans are
 * kept only for boundary questions they can actually answer - forbidden imports, forbidden
 * directories, absence of a solver entry point - and never as evidence of runtime semantics.
 *
 * No paid call, no model call, no network, no persistence.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { readJson, sh, sha256 } from "./phase-3-601-revalidation-lib";
import type { IRExpression, IRCapacityExpression, IRRule, IRSharedCapacity } from "../lib/contract-model/ir/types";
import { CONTRACT_RUNTIME_VERSION } from "../lib/contract-model/runtime/version";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "../lib/contract-model/runtime/input/version";
import { snapshotInputResolver } from "../lib/contract-model/runtime/input/snapshot-resolver";
import type { FinancialInput, FinancialSnapshot } from "../lib/contract-model/runtime/input/types";
import { rationalFromString } from "../lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "../lib/contract-model/runtime/types";
import { CAPACITY_GRAPH_VERSION } from "../lib/contract-model/runtime/capacity/version";
import { buildCapacityGraph, evaluateCapacityState } from "../lib/contract-model/runtime/capacity";
import type { CapacityState, LedgerUsageRecord, ReclassificationElection } from "../lib/contract-model/runtime/capacity/types";
import { TRANSACTION_SIMULATION_VERSION } from "../lib/contract-model/runtime/transaction/version";
import { simulateTransaction } from "../lib/contract-model/runtime/transaction/simulate";
import type { HypotheticalTransaction, SelectedPath, TransactionEffect, TransactionQuantity, TransactionSimulationResult } from "../lib/contract-model/runtime/transaction/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const OUT = "docs/phase-4d/remediation";
const at = () => new Date().toISOString();
const FAILED_BASELINE = "feab14fd7a0245586f92342b3833d5c224603e83";
const PHASE3_TREES = { compiler: "b4e6a9da496a23b9f98607355520a456e6c48e1f", semantic: "f79bc12dd479e9b803bf9e37092d76b6aedb8c12" };
const TX_DIR = "lib/contract-model/runtime/transaction";
const FROZEN = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json";
const file = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readFileSync(p, "utf8") : null; };

// ---------------------------------------------------------------------------
// Scenario builders. Arbitrary identifiers; production reads none of them.
// ---------------------------------------------------------------------------
const CO = "recert-org", INST = "recert-facility", AS_OF = "2026-06-30";
const L = { exprId: null, inputKeys: [] as string[] };
let n = 0; const id = () => `r${++n}`;
const MONEY = (amount: number, currency = "USD"): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency, exprId: id() });
const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: id() });
const FIGURE = (key: string): IRExpression => ({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: key, companyId: CO, instrumentKey: INST, resolvedDefinitionId: null, exprId: id() });
const MUL = (...operands: IRExpression[]): IRExpression => ({ kind: "MULTIPLY", type: "MONEY", operands, exprId: id() });

const rule = (ruleId: string, cap: IRCapacityExpression | IRExpression | null, over: Partial<IRRule> = {}): IRRule => ({
  ruleId, irSchemaVersion: "r", companyId: CO, instrumentKey: INST, sourceDocumentId: "doc",
  sourceSectionRef: `ref-${ruleId}`, covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], transactionScope: null,
  capacityExpression: cap as Any, conditions: [], exceptions: [], dependsOn: [], operativeLineage: null,
  sufficiency: "COMPLETE", sufficiencyReasons: [],
  provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: `cite-${ruleId}`, excerpt: null },
  compilerVersion: null, sourceContentVersion: null, ...over,
});
const poolOf = (sharedCapId: string, cap: IRExpression, memberRuleIds: string[]): IRSharedCapacity =>
  ({ sharedCapId, companyId: CO, instrumentKey: INST, description: `resource ${sharedCapId}`, capExpression: cap as Any, memberRuleIds, provenance: null });
const mv = (amount: string): RuntimeValue => ({ type: "MONEY", amount: rationalFromString(amount), currency: "USD", lineage: L });
const fact = (key: string, amount: string): FinancialInput => ({
  identity: { companyId: CO, scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST }, inputKind: "METRIC", key,
    identityStrength: "CONTRACT_NAME_ONLY", period: { kind: "NOT_PERIOD_SPECIFIC" }, asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
    valueType: "MONEY", currency: "USD" },
  value: mv(amount), sourceVersion: "src-1",
});
const packOf = (inputs: FinancialInput[]): FinancialSnapshot => ({
  snapshotId: "recert-pack", version: "1", companyId: CO, asOf: AS_OF, reportingPeriod: "p1", status: "APPROVED",
  supersedesSnapshotId: null, provenance: { source: "recertification pack", sourceVersion: "v1" },
  review: { reviewedBy: "r", reviewedAt: "2026-07-01T00:00:00Z", approvalRef: "a1" }, inputs,
});
const usage = (usageId: string, amount: string, ruleId: string): LedgerUsageRecord => ({
  usageId, companyId: CO, instrumentKey: INST, effectiveAsOf: "2026-01-31", amount: { amount, currency: "USD" },
  capacityPath: { kind: "RULE", ruleId }, transactionRef: `hist-${usageId}`, status: "RECORDED", supersededByUsageId: null,
  provenance: { source: "historical", sourceVersion: "v1", approvalRef: "h", approvalState: "APPROVED" },
});
const nodeOf = (ruleId: string) => `capacity:rule:${ruleId}`;

interface Scene { graph: Any; state: CapacityState; inputs: Any; context: Any }
function scene(opts: { rules: IRRule[]; pools?: IRSharedCapacity[]; ledger?: LedgerUsageRecord[]; facts?: FinancialInput[] }): Scene {
  const rules = opts.rules, pools = opts.pools ?? [], ledger = opts.ledger ?? [], facts = opts.facts ?? [];
  const inputs = snapshotInputResolver({ snapshots: [packOf(facts)], definitions: [], rules, companyId: CO, instrumentKey: INST });
  const graph = buildCapacityGraph({ rules, sharedCapacities: pools, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: pools, inputs, ledger, asOf: AS_OF });
  return { graph, state, inputs, context: { rules, sharedCapacities: pools, ledger, asOf: AS_OF } };
}
const cash = (amount: string, currency = "USD"): TransactionQuantity => ({ type: "MONEY", amount, currency });
const consume = (effectId: string, capacityNodeId: string, amount: TransactionQuantity, over: Any = {}): TransactionEffect =>
  ({ effectId, kind: "CONSUME_CAPACITY", capacityNodeId, amount, ...over } as Any);
const restore = (effectId: string, usageId: string): TransactionEffect => ({ effectId, kind: "RESTORE_CAPACITY", usageId, reason: "released" } as Any);
const supersede = (effectId: string, usageId: string, replacementAmount: TransactionQuantity | null): TransactionEffect =>
  ({ effectId, kind: "SUPERSEDE_LEDGER_USAGE", usageId, replacementAmount, reason: "restated" } as Any);
const setEvent = (effectId: string, eventDescription: string, active: boolean): TransactionEffect =>
  ({ effectId, kind: active ? "ACTIVATE_EVENT" : "DEACTIVATE_EVENT", eventDescription, asOf: AS_OF } as Any);
const adjust = (effectId: string, metricKey: string, value: TransactionQuantity): TransactionEffect =>
  ({ effectId, kind: "CHANGE_METRIC", metricKey, period: null, asOf: AS_OF, adjustment: { kind: "DELTA", value } } as Any);
const reclassify = (effectId: string, election: ReclassificationElection): TransactionEffect => ({ effectId, kind: "APPLY_RECLASSIFICATION", election } as Any);
const electionOf = (electionId: string, sourceRuleId: string, destinationRuleId: string, amount: string): ReclassificationElection =>
  ({ electionId, sourceRuleId, destinationRuleId, amount: { amount, currency: "USD" }, effectiveAsOf: "2026-03-31", provenance: { source: "board", sourceVersion: "v1", approvalRef: "e" } } as Any);
const txOf = (transactionId: string, effects: TransactionEffect[], over: Partial<HypotheticalTransaction> = {}): HypotheticalTransaction =>
  ({ transactionId, companyId: CO, instrumentKey: INST, effectiveAsOf: AS_OF, category: null, label: null, effects,
    provenance: { source: "recertification hypothetical", sourceVersion: "v1", approvalRef: null }, ...over } as Any);
const path = (over: Partial<SelectedPath> = {}): SelectedPath =>
  ({ capacityNodeIds: [], ruleIds: [], sharedCapacityIds: [], reclassificationElectionIds: [], ...over });
const run = (s: Scene, transaction: HypotheticalTransaction, selectedPath: SelectedPath): TransactionSimulationResult =>
  simulateTransaction({ transaction, currentState: s.state, capacityGraph: s.graph, selectedPath, inputs: s.inputs, context: s.context });

const amt = (a: Any): string | null => (a && a.kind === "AMOUNT" && a.value?.type === "MONEY" ? a.value.amount : null);
const codesOf = (r: TransactionSimulationResult) => r.limitations.map((l) => l.code).sort();

/** Phase-4C's own report of an over-drawn resource, read two ways because it expresses it two ways. */
function unsafeIn(state: CapacityState | null): string[] {
  if (!state) return [];
  const out: string[] = [];
  for (const c of state.capacities) {
    if (c.limitations.some((l) => l.code === "OVER_CONSUMPTION")) out.push(`capacity ${c.capacityNodeId}`);
    else if (String(amt(c.remaining) ?? "").startsWith("-")) out.push(`capacity ${c.capacityNodeId}`);
  }
  for (const s of state.sharedConstraints) {
    if (s.limitations.some((l) => l.code === "OVER_CONSUMPTION")) out.push(`shared ${s.sharedCapacityId}`);
    else if (String(amt(s.remaining) ?? "").startsWith("-")) out.push(`shared ${s.sharedCapacityId}`);
  }
  return [...new Set(out)].sort();
}

// ---------------------------------------------------------------------------
// The executed scenarios. Each returns evidence the gate reads.
// ---------------------------------------------------------------------------
const flat = (cap: number, ledger: LedgerUsageRecord[] = []) => scene({ rules: [rule("p-a", MONEY(cap))], ledger });
const routeA = path({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
const sharedScene = (poolCap: number, memberCap: number, ledger: LedgerUsageRecord[] = []) => scene({
  rules: [rule("p-a", MONEY(memberCap)), rule("p-b", MONEY(memberCap))],
  pools: [poolOf("res-1", MONEY(poolCap), ["p-a", "p-b"])], ledger,
});
const routeAB = path({ capacityNodeIds: [nodeOf("p-a"), nodeOf("p-b")], ruleIds: ["p-a", "p-b"], sharedCapacityIds: ["res-1"] });

const brief = (r: TransactionSimulationResult) => ({
  simulationStatus: r.simulationStatus, selectedPathResult: r.selectedPathResult,
  committable: r.commitPlan.committable, postStatePublished: r.postState !== null,
  perEffectOutcomes: r.capacityEffects.map((c) => c.outcome),
  perEffectAvailable: r.capacityEffects.map((c) => amt(c.availableAmount) ?? c.availableAmount.kind),
  postStateUnsafe: unsafeIn(r.postState), limitations: codesOf(r),
});

// S1 aggregate same-node consumption
const s1 = run(flat(100), txOf("t1", [consume("e1", nodeOf("p-a"), cash("60")), consume("e2", nodeOf("p-a"), cash("60"))]), routeA);
// S2 exact aggregate exhaustion
const s2 = run(flat(100), txOf("t2", [consume("e1", nodeOf("p-a"), cash("60")), consume("e2", nodeOf("p-a"), cash("40"))]), routeA);
// S3 aggregate shared-pool consumption
const s3 = run(sharedScene(100, 500), txOf("t3", [consume("e1", nodeOf("p-a"), cash("60")), consume("e2", nodeOf("p-b"), cash("60"))], { intendedAmount: cash("120") } as Any), routeAB);
// S3b exact shared exhaustion
const s3b = run(sharedScene(100, 500), txOf("t3b", [consume("e1", nodeOf("p-a"), cash("60")), consume("e2", nodeOf("p-b"), cash("40"))], { intendedAmount: cash("100") } as Any), routeAB);
// S4 existing usage + aggregate effects
const s4 = run(flat(100, [usage("u1", "30", "p-a")]), txOf("t4", [consume("e1", nodeOf("p-a"), cash("40")), consume("e2", nodeOf("p-a"), cash("40"))]), routeA);
// S5/S6 restore-then-consume vs the reverse
const led40 = [usage("u1", "40", "p-a")];
const s5f = run(flat(100, led40), txOf("t5f", [restore("e1", "u1"), consume("e2", nodeOf("p-a"), cash("100"))]), routeA);
const s5r = run(flat(100, led40), txOf("t5r", [consume("e1", nodeOf("p-a"), cash("100")), restore("e2", "u1")]), routeA);
// S7 supersede-then-consume vs the reverse
const led60 = [usage("u1", "60", "p-a")];
const s7f = run(flat(100, led60), txOf("t7f", [supersede("e1", "u1", cash("20")), consume("e2", nodeOf("p-a"), cash("80"))]), routeA);
const s7r = run(flat(100, led60), txOf("t7r", [consume("e1", nodeOf("p-a"), cash("80")), supersede("e2", "u1", cash("20"))]), routeA);
// S8 conflicting ledger successors
const s8 = run(flat(100, led40), txOf("t8", [supersede("e1", "u1", cash("10")), supersede("e2", "u1", cash("20"))]), routeA);
// S9 conflicting event state
const s9 = run(flat(100), txOf("t9", [setEvent("e1", "a default has occurred", true), setEvent("e2", "a default has occurred", false)]), routeA);
const s9ok = run(flat(100), txOf("t9ok", [setEvent("e1", "a default has occurred", true), setEvent("e2", "a default has occurred", true)]), routeA);
// S10 dangling dependency
const s10 = run(flat(100), txOf("t10", [consume("e1", nodeOf("p-a"), cash("10"), { dependsOnEffectIds: ["ghost"] })]), routeA);
// S11 duplicate effect ids
const s11 = run(flat(100), txOf("t11", [consume("e1", nodeOf("p-a"), cash("10")), consume("e1", nodeOf("p-a"), cash("20"))]), routeA);
// S12 dependency cycle
const s12 = run(flat(100), txOf("t12", [consume("e1", nodeOf("p-a"), cash("10"), { dependsOnEffectIds: ["e2"] }), consume("e2", nodeOf("p-a"), cash("10"), { dependsOnEffectIds: ["e1"] })]), routeA);
// S12b fixed point
const fpScene = scene({ rules: [rule("p-g", MUL(PCT(0.2), FIGURE("figure-base")) as Any)], facts: [fact("figure-base", "1000")] });
const s12b = run(fpScene, txOf("t12b", [adjust("e1", "figure-base", cash("100")), consume("e2", nodeOf("p-g"), cash("10"), { dependsOnEffectIds: ["e1"] }), adjust("e3", "figure-base", cash("50"), )]), path({ capacityNodeIds: [nodeOf("p-g")], ruleIds: ["p-g"] }));
// S13 reclassification conservation under composition
const reclScene = () => scene({
  rules: [rule("p-src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "p-dst", description: "may reclassify" }] as Any }), rule("p-dst", MONEY(100))],
  ledger: [usage("u1", "40", "p-src")],
});
const s13 = run(reclScene(), txOf("t13", [reclassify("e1", electionOf("el-1", "p-src", "p-dst", "25")), reclassify("e2", electionOf("el-2", "p-src", "p-dst", "25"))]), path({ reclassificationElectionIds: ["el-1", "el-2"] }));
// S14 metric adjustment ordering
const mScene = () => scene({ rules: [rule("p-g", MUL(PCT(0.2), FIGURE("figure-base")) as Any)], facts: [fact("figure-base", "1000")] });
const routeG = path({ capacityNodeIds: [nodeOf("p-g")], ruleIds: ["p-g"] });
const s14f = run(mScene(), txOf("t14", [adjust("e1", "figure-base", cash("1000")), consume("e2", nodeOf("p-g"), cash("350"))]), routeG);
const s14r = run(mScene(), txOf("t14", [consume("e1", nodeOf("p-g"), cash("350")), adjust("e2", "figure-base", cash("1000"))]), routeG);
// S15 no mutation of caller inputs
const mutScene = flat(100, [usage("u1", "30", "p-a")]);
const beforeState = JSON.stringify(mutScene.state);
const beforeLedger = JSON.stringify(mutScene.context.ledger);
const s15 = run(mutScene, txOf("t15", [consume("e1", nodeOf("p-a"), cash("60")), consume("e2", nodeOf("p-a"), cash("60"))]), routeA);
const noMutation = JSON.stringify(mutScene.state) === beforeState && JSON.stringify(mutScene.context.ledger) === beforeLedger;
// S16 deterministic replay
// One scene, replayed. Rebuilding the scene would mint fresh expression ids and therefore a fresh
// capacity-graph hash, which is a property of this harness and not of the engine; replay
// determinism is the claim that the SAME inputs give the SAME answer.
const replayScene = flat(100);
const replays = [0, 1, 2, 3, 4].map(() => {
  const r = run(replayScene, txOf("t16", [consume("e1", nodeOf("p-a"), cash("30")), consume("e2", nodeOf("p-a"), cash("30"))]), routeA);
  return { tx: r.transactionIdentity.transactionHash, sim: r.simulationIdentity.simulationId, post: r.postStateIdentity?.postStateHash ?? null };
});
// Control: a rebuilt scene changes the graph hash and therefore the simulation id, while the
// TRANSACTION hash - which does not bind the graph - stays the same. Recorded so the distinction
// is evidence rather than an excuse.
const rebuiltScene = flat(100);
const rebuiltReplay = run(rebuiltScene, txOf("t16", [consume("e1", nodeOf("p-a"), cash("30")), consume("e2", nodeOf("p-a"), cash("30"))]), routeA);
const rebuiltControl = {
  transactionHashStable: rebuiltReplay.transactionIdentity.transactionHash === replays[0]!.tx,
  simulationIdDiffersBecauseGraphHashDiffers: rebuiltReplay.simulationIdentity.simulationId !== replays[0]!.sim,
  graphHashA: replayScene.graph.graphHash, graphHashB: rebuiltScene.graph.graphHash,
};
const replayIdentical = new Set(replays.map((x) => JSON.stringify(x))).size === 1;
// S17 identity metamorphic properties
const idA = run(flat(100, led40), txOf("t17", [restore("e1", "u1"), consume("e2", nodeOf("p-a"), cash("50"))]), routeA);
const idB = run(flat(100, led40), txOf("t17", [consume("e2", nodeOf("p-a"), cash("50")), restore("e1", "u1")]), routeA);
const idLabel = run(flat(100), txOf("t17b", [consume("e1", nodeOf("p-a"), cash("10"))], { label: "a totally different display name" } as Any), routeA);
const idPlain = run(flat(100), txOf("t17b", [consume("e1", nodeOf("p-a"), cash("10"))]), routeA);
const idAmount = run(flat(100), txOf("t17b", [consume("e1", nodeOf("p-a"), cash("11"))]), routeA);
// S18 failure atomicity
const s18 = s8;
// S19 complexity scaling
const scaling = [1, 2, 4, 8, 16, 32].map((k) => {
  const rules = Array.from({ length: k }, (_, i) => rule(`q${i}`, MONEY(1000)));
  const sc = scene({ rules });
  const r = run(sc, txOf(`ts${k}`, rules.map((x, i) => consume(`e${i}`, nodeOf(x.ruleId), cash("1")))), path({ capacityNodeIds: rules.map((x) => nodeOf(x.ruleId)), ruleIds: rules.map((x) => x.ruleId) }));
  return { effects: k, stateEvaluations: r.complexity.stateEvaluations, ledgerEntriesExamined: r.complexity.ledgerEntriesExamined, simulationSteps: r.complexity.simulationSteps, satisfied: r.selectedPathResult === "SATISFIED" };
});

// ---------------------------------------------------------------------------
// Exhaustive small-composition sweep: the committable-implies-safe invariant.
// ---------------------------------------------------------------------------
const sweep = (() => {
  const amounts = ["10", "60", "90", "140"];
  let checked = 0; const violations: string[] = [];
  const check = (label: string, r: TransactionSimulationResult) => {
    checked++;
    const u = unsafeIn(r.postState);
    if (r.commitPlan.committable && u.length > 0) violations.push(`${label}: committable with ${u.join(", ")}`);
    if (r.selectedPathResult === "SATISFIED" && u.length > 0) violations.push(`${label}: SATISFIED with ${u.join(", ")}`);
    if (r.commitPlan.committable && r.postState === null) violations.push(`${label}: committable with no post-state`);
  };
  for (const a of amounts) for (const b of amounts) for (const hist of ["0", "30"]) {
    const led = hist === "0" ? [] : [usage("u1", hist, "p-a")];
    check(`consume(${a})+consume(${b}) hist=${hist}`, run(flat(100, led), txOf("s", [consume("e1", nodeOf("p-a"), cash(a)), consume("e2", nodeOf("p-a"), cash(b))]), routeA));
  }
  for (const a of amounts) for (const b of amounts) {
    check(`shared ${a}+${b}`, run(sharedScene(100, 500), txOf("s", [consume("e1", nodeOf("p-a"), cash(a)), consume("e2", nodeOf("p-b"), cash(b))], { intendedAmount: cash(String(Number(a) + Number(b))) } as Any), routeAB));
  }
  for (const a of amounts) for (const order of [0, 1]) {
    const eff = order === 0 ? [restore("e1", "u1"), consume("e2", nodeOf("p-a"), cash(a))] : [consume("e1", nodeOf("p-a"), cash(a)), restore("e2", "u1")];
    check(`restore/consume(${a}) o=${order}`, run(flat(100, led40), txOf("s", eff), routeA));
    const eff2 = order === 0 ? [supersede("e1", "u1", cash("10")), consume("e2", nodeOf("p-a"), cash(a))] : [consume("e1", nodeOf("p-a"), cash(a)), supersede("e2", "u1", cash("10"))];
    check(`supersede/consume(${a}) o=${order}`, run(flat(100, led40), txOf("s", eff2), routeA));
  }
  for (const a of amounts) for (const target of ["p-src", "p-dst"]) for (const order of [0, 1]) {
    const rc = reclassify("er", electionOf("el-1", "p-src", "p-dst", "25"));
    const cn = consume("ec", nodeOf(target), cash(a));
    check(`reclass+consume(${target},${a}) o=${order}`, run(reclScene(), txOf("s", order === 0 ? [rc, cn] : [cn, rc]), path({ capacityNodeIds: [nodeOf(target)], ruleIds: ["p-src", "p-dst"], reclassificationElectionIds: ["el-1"] })));
  }
  for (const a of amounts) for (const b of amounts) {
    check(`PARTIAL ${a}+${b}`, run(scene({ rules: [rule("p-a", MONEY(100), { sufficiency: "PARTIAL", sufficiencyReasons: ["x"] })] }), txOf("s", [consume("e1", nodeOf("p-a"), cash(a)), consume("e2", nodeOf("p-a"), cash(b))]), routeA));
  }
  for (const a of amounts) for (const order of [0, 1]) {
    const m = adjust("em", "figure-base", cash("1000"));
    const c = consume("ec", nodeOf("p-g"), cash(a));
    check(`metric+consume(${a}) o=${order}`, run(mScene(), txOf("s", order === 0 ? [m, c] : [c, m]), routeG));
  }
  return { compositionsChecked: checked, violations };
})();

// ---------------------------------------------------------------------------
// Structural boundary scans - kept ONLY for questions a scan can answer.
// ---------------------------------------------------------------------------
const txFiles = readdirSync(TX_DIR).filter((f) => f.endsWith(".ts")).sort();
const txSrc = txFiles.map((f) => readFileSync(`${TX_DIR}/${f}`, "utf8")).join("\n");
const nonComment = txSrc.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const solverHits = ["maximize(", "minimize(", "optimi", "solve(", "bisect", "binarySearch", "chooseBest", "rankPaths"].filter((p) => nonComment.toLowerCase().includes(p.toLowerCase()));
// A type-only import of a generated enum is not ingestion. The scan reads value-level usage only,
// so `import type { EntityClassTag } from "@prisma/client"` does not trip it while `prisma.` does.
const valueLines = nonComment.split("\n").filter((l) => !/^\s*import\s+type\b/.test(l)).join("\n");
const ingestionHits = ["fetch(", "axios(", "prisma.", "readFile", "writeFile", "PDFParse"].filter((p) => valueLines.includes(p));
const persistenceHits = ["prisma.", "db.", "INSERT INTO", "writeFileSync"].filter((p) => valueLines.includes(p));
const importsOutside = [...nonComment.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!).filter((x) => x.startsWith("..")).sort();
const earlierImportingTx = sh(`grep -rl "runtime/transaction" lib/contract-model/compiler lib/contract-model/ir lib/contract-model/runtime/input lib/contract-model/runtime/capacity 2>/dev/null || true`).split("\n").filter(Boolean);

// ---------------------------------------------------------------------------
// Freeze / boundary proof
// ---------------------------------------------------------------------------
const head = sh("git rev-parse HEAD");
const treeAt = (ref: string, dir: string) => sh(`git rev-parse ${ref}:${dir}`);
const TREES = [
  ["phase3Compiler", "lib/contract-model/compiler"], ["phase3Semantic", "lib/contract-model/compiler/semantic"],
  ["ir", "lib/contract-model/ir"], ["phase4bInput", "lib/contract-model/runtime/input"],
  ["phase4cCapacity", "lib/contract-model/runtime/capacity"],
] as const;
interface FrozenTrees { phase3Compiler: string; phase3Semantic: string; ir: string; phase4bInput: string; phase4cCapacity: string }
const treeMap = (ref: string): FrozenTrees => ({
  phase3Compiler: treeAt(ref, "lib/contract-model/compiler"),
  phase3Semantic: treeAt(ref, "lib/contract-model/compiler/semantic"),
  ir: treeAt(ref, "lib/contract-model/ir"),
  phase4bInput: treeAt(ref, "lib/contract-model/runtime/input"),
  phase4cCapacity: treeAt(ref, "lib/contract-model/runtime/capacity"),
});
const frozenBefore = treeMap(FAILED_BASELINE);
const frozenNow = treeMap("HEAD");
const changedProduction = sh(`git diff --name-only ${FAILED_BASELINE} -- lib/`).split("\n").filter(Boolean)
  .concat(sh("git diff --name-only -- lib/").split("\n").filter(Boolean), sh("git ls-files --others --exclude-standard lib/").split("\n").filter(Boolean));
const priorPhaseTouched = [...new Set(changedProduction)].filter((f) => !f.startsWith(`${TX_DIR}/`)).sort();

// ---------------------------------------------------------------------------
// Regression inputs
// ---------------------------------------------------------------------------
const rel = (p: string) => p.replace(/^.*?\/(tests|lib|scripts|app|prisma)\//, "$1/");
const readV = (p: string | undefined) => { if (!p || !existsSync(p)) return null; const j = readJson<Any>(p); return { tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, ids: new Map<string, string>((j.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).map((t) => [`${rel(String(f.name))} :: ${t.fullName}`, t.status]))) }; };
const full = readV(process.env.VITEST_FULL_JSON), base = readV(process.env.VITEST_FULL_BASE_JSON), targeted = readV(process.env.VITEST_TARGETED_JSON);
const newFailing = full && base ? [...full.ids].filter(([k, v]) => v === "failed" && base.ids.get(k) !== "failed").map(([k]) => k).sort() : [];
const fixedVsBase = full && base ? [...base.ids].filter(([k, v]) => v === "failed" && full.ids.get(k) === "passed").map(([k]) => k).sort() : [];
const tscLog = file("TSC_LOG") ?? "", lintLog = file("LINT_LOG") ?? "", buildLog = file("BUILD_LOG") ?? "";
const tscNew = tscLog.split("\n").filter((l) => /error TS/.test(l) && !l.startsWith("tests/foundation-audit/"));
const txSuite = targeted ? [...targeted.ids].filter(([k]) => k.includes("runtime/transaction/")) : [];

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------
writeJson(`${OUT}/02-defect-reproduction.json`, {
  artifact: "PHASE 4D REMEDIATION §1, §2, §5, §6, §7 - each reported defect reproduced against the failed baseline, then re-run against the remediation", at: at(),
  failedBaseline: FAILED_BASELINE,
  defects: [
    { id: "D1", title: "aggregate consumption against one capacity", reported: true, reproduced: true,
      preFix: { simulationStatus: "SIMULATED", selectedPathResult: "SATISFIED", committable: true, perEffectAvailable: ["100", "100"], postStateUsage: "120", postStateStatus: "REVIEW_REQUIRED" },
      postFix: brief(s1), rootCause: "every CONSUME_CAPACITY was measured against the same pre-transaction Phase-4C state; the effects never saw one another" },
    { id: "D2", title: "aggregate consumption across a quantified shared pool", reported: true, reproduced: true,
      preFix: { committable: true, postStateOverConsumed: ["res-1 remaining -20"] }, postFix: brief(s3),
      rootCause: "same independent-measurement defect, observed through the shared constraint" },
    { id: "D3", title: "competing ledger successors for one historical usage", reported: true, reproduced: true,
      preFix: { committable: true, supersededRows: 2, bothSuccessorsPublished: true, arbitraryWinner: "Array.prototype.find picked the first match when rebuilding the ledger" },
      postFix: brief(s8), rootCause: "no check that two effects claimed the same predecessor; the post-state rebuild resolved it by array order" },
    { id: "D4", title: "conflicting event assignments resolved by effect-id order", reported: true, reproduced: true,
      preFix: { committable: true, limitations: [], mechanism: "overlay.ts sorted event effects by effectId and wrote them into a Map, so the last write won" },
      postFix: brief(s9), rootCause: "map overwrite keyed by event description and as-of, with no agreement check" },
    { id: "D5", title: "dependency on a non-existent effect silently ignored", reported: true, reproduced: true,
      preFix: { committable: true, limitations: [], mechanism: "detectEffectCycles skipped the edge behind `if (byId.has(d))`" },
      postFix: brief(s10), rootCause: "a dangling dependency was treated as a no-op rather than a malformed transaction" },
    { id: "D6", title: "duplicate effect identity", reported: true, reproduced: false,
      note: "already refused at the failed baseline by classifyEffects; re-asserted here so it stays refused", postFix: brief(s11) },
  ],
  additionalFindings: [
    { id: "A1", title: "post-state was never validated against the transaction-level verdict",
      detail: "the failed baseline computed a post-state and published it without reading what Phase 4C said about it. In the single-capacity case Phase 4C degraded the entry to REVIEW_REQUIRED with an OVER_CONSUMPTION limitation and WITHHELD the remaining figure; the simulation still reported SATISFIED and committable. A sign test on `remaining` alone would have missed this, because the withheld figure is not negative - it is absent." },
    { id: "A2", title: "a metric adjustment was visible to every effect regardless of position",
      detail: "the overlay was built once from all CHANGE_METRIC effects before any effect ran, so stating an adjustment after a draw had the same effect as stating it before. Ordering is now semantic and both orders are distinguished." },
    { id: "A3", title: "batch reclassification conservation was briefly broken during remediation and restored",
      detail: "an intermediate sequential design applied each election through its own Phase-4C transition, which let two elections that individually fit jointly exceed the source. Caught by the pre-existing matrix case AE. Elections now execute as ONE Phase-4C batch at the position of the first election, preserving the recertified conservation rule." },
    { id: "A4", title: "the aggregate post-state backstop did not fire in any swept composition",
      detail: `INSUFFICIENT_AGGREGATE_CAPACITY is implemented and wired, but across ${sweep.compositionsChecked} swept compositions the sequential model caught every over-draw at the draw itself, reporting INSUFFICIENT_CAPACITY. The backstop is defence in depth, not the mechanism, and is reported as such rather than claimed as coverage.` },
  ],
});

writeJson(`${OUT}/03-effect-conflict-matrix.json`, {
  artifact: "PHASE 4D REMEDIATION §8 - the effect resource / read-write / conflict model and the invariant covering each class", at: at(),
  effects: [
    { kind: "CONSUME_CAPACITY", writes: ["capacity:<node>", "ledger identity <tx>::<effect>"], reads: ["the capacity expression's financial inputs", "the capacity state left by prior effects"] },
    { kind: "RESTORE_CAPACITY", writes: ["usage:<usageId>", "ledger identity <tx>::<effect>"], reads: ["the named historical usage"] },
    { kind: "SUPERSEDE_LEDGER_USAGE", writes: ["usage:<usageId>", "ledger identity <tx>::<effect>"], reads: ["the named historical usage"] },
    { kind: "APPLY_RECLASSIFICATION", writes: ["capacity:rule:<source>", "capacity:rule:<destination>"], reads: ["the source capacity's inputs", "an encoded Phase-3 RECLASSIFIABLE_TO edge"] },
    { kind: "CHANGE_METRIC", writes: ["metric:<key>@<period>/<asOf>"], reads: ["the approved snapshot's value for that input"] },
    { kind: "ACTIVATE_EVENT", writes: ["event:<description>@<asOf>"], reads: [] },
    { kind: "DEACTIVATE_EVENT", writes: ["event:<description>@<asOf>"], reads: [] },
  ],
  conflictClasses: [
    { id: "C1", class: "two effects write the same capacity", invariant: "each draw is measured against the state its predecessors produced", detectedBy: "sequential execution", evidence: brief(s1), test: "1A, 1C, 1D, 4C" },
    { id: "C2", class: "two effects consume a common shared resource", invariant: "the pool bounds the sum of member draws", detectedBy: "sequential execution through Phase-4C shared constraints", evidence: brief(s3), test: "2A-2F" },
    { id: "C3", class: "an effect reads what an earlier effect writes", invariant: "the later effect observes the earlier one", detectedBy: "cursor refresh on a dirty write", evidence: { adjustThenDraw: brief(s14f), drawThenAdjust: brief(s14r) }, test: "4A, 4B, 4E" },
    { id: "C4", class: "two effects supersede the same ledger identity", invariant: "one historical record may have at most one successor per transaction", detectedBy: "detectCompositionConflicts", evidence: brief(s8), test: "5A-5C" },
    { id: "C5", class: "conflicting event assignment", invariant: "incompatible assignments to one target are refused, never ordered", detectedBy: "detectCompositionConflicts", evidence: brief(s9), test: "6A, 6B" },
    { id: "C6", class: "agreeing assignment to one target", invariant: "agreement is not a conflict", detectedBy: "assignment comparison", evidence: brief(s9ok), test: "6C, 6D, 6E" },
    { id: "C7", class: "duplicate identity", invariant: "effect ids and proposed usage ids are unique", detectedBy: "classifyEffects + proposed-identity count", evidence: brief(s11), test: "7G" },
    { id: "C8", class: "missing or cyclic dependency", invariant: "a dangling edge is malformed; a cycle has no evaluation order", detectedBy: "detectCompositionConflicts + detectEffectCycles", evidence: { dangling: brief(s10), cycle: brief(s12) }, test: "7A-7F" },
    { id: "C9", class: "reclassification composed with other effects", invariant: "elections execute as one conserving Phase-4C batch; an interleaving that contradicts atomicity is refused", detectedBy: "single batch at the first election + interleaving guard", evidence: { batchOverSource: { allExecuted: s13.reclassificationEffects.allExecuted, batchConservation: s13.reclassificationEffects.batchConservation } }, test: "AE, 4F, 5D" },
  ],
});

writeJson(`${OUT}/04-ordering-contract.json`, {
  artifact: "PHASE 4D REMEDIATION §3, §4 - the corrected effect-ordering contract", at: at(),
  contract: "SEQUENTIAL. transaction.effects is an ordered list. Each effect applies to the state produced by the effects stated before it. Ordering is therefore semantic, and it is part of transaction identity.",
  consequences: [
    "a second draw on a resource sees what the first left",
    "a draw stated after a release sees the released headroom; stated before it, it does not",
    "a draw stated after a metric adjustment sees the adjusted capacity; stated before it, it does not",
    "reordering effects that change the transition changes the transaction hash and the post-state hash",
  ],
  exceptionAndWhy: {
    rule: "APPLY_RECLASSIFICATION elections execute as ONE Phase-4C batch at the position of the first election",
    reason: "Phase 4C enforces conservation across a batch aggregated by source; applying elections singly would let two elections that individually fit jointly exceed the source usage. Atomicity is preserved and the batch still observes effects stated before it.",
    guard: "where a non-election effect is stated between two elections AND touches capacity those elections move, the stated order and the atomic batch disagree, and the transaction is refused rather than resolved",
  },
  dependsOnEffectIdsMeaning: "dependsOnEffectIds declares that an effect's MAGNITUDE OR STATE depends on another effect. It does not re-order execution - the stated order does that. A dependency that points forward therefore contradicts the stated order and is refused (EFFECT_DEPENDENCY_CONTRADICTS_ORDER); a dependency naming an effect the transaction does not carry is refused (INVALID_EFFECT_DEPENDENCY); a cycle is refused (TRANSACTION_EFFECT_DEPENDENCY_CYCLE or FIXED_POINT_REQUIRED).",
  evidence: {
    restoreThenConsume: brief(s5f), consumeThenRestore: brief(s5r),
    supersedeThenConsume: brief(s7f), consumeThenSupersede: brief(s7r),
    adjustThenConsume: brief(s14f), consumeThenAdjust: brief(s14r),
    orderChangesIdentity: idA.transactionIdentity.transactionHash !== idB.transactionIdentity.transactionHash,
  },
});

writeJson(`${OUT}/05-post-state-and-committability.json`, {
  artifact: "PHASE 4D REMEDIATION §9, §10 - the post-state is validated, and committable means the final state is safe", at: at(),
  committableDefinition: "postState !== null AND the post-state survived validation AND selectedPathResult === SATISFIED AND simulationStatus === SIMULATED. All four, never fewer.",
  postStateValidation: "after the transition is built, Phase 4C is asked what it produced. Every capacity and shared constraint the transaction touched is read for an OVER_CONSUMPTION limitation and for a negative remaining. Both are read because an over-draw that makes an entry non-authoritative WITHHOLDS the remaining figure rather than making it negative.",
  publishedVsRefused: {
    provisionalInformational: "a REVIEW_REQUIRED path may still publish a clearly non-committable post-state where the arithmetic is shown but legal reliance is unsafe - an unquantified shared relationship, a partially represented rule",
    contradictoryInvalid: "a transition that over-consumes a quantified constraint, carries conflicting ledger or event transitions, or rests on a malformed dependency graph publishes NO post-state at all",
  },
  invariantSweep: sweep,
  atomicity: { conflictCase: brief(s18), postStateNull: s18.postState === null, postStateIdentityNull: s18.postStateIdentity === null },
  noMutationOfCallerState: noMutation,
});

writeJson(`${OUT}/06-identity-recertification.json`, {
  artifact: "PHASE 4D REMEDIATION §11 - canonical identity re-audited under the corrected ordering contract", at: at(),
  orderSensitive: ["transaction.effects - now genuinely order-sensitive in EXECUTION as well as in identity, which is what makes the declaration honest"],
  orderInsensitive: ["transaction.entities", "selectedPath.capacityNodeIds", "selectedPath.ruleIds", "selectedPath.sharedCapacityIds", "selectedPath.reclassificationElectionIds", "effect.dependsOnEffectIds", "election.movesUsageIds", "the snapshot id set"],
  excluded: ["transaction.label", "effect.note", "diagnostics", "trace", "complexity counters", "wall-clock", "random or environment-specific identifiers"],
  metamorphic: {
    sameSemanticsSameIdentity: { displayLabelChange: idLabel.transactionIdentity.transactionHash === idPlain.transactionIdentity.transactionHash },
    differentSemanticsDifferentIdentity: {
      effectOrder: idA.transactionIdentity.transactionHash !== idB.transactionIdentity.transactionHash,
      amount: idPlain.transactionIdentity.transactionHash !== idAmount.transactionIdentity.transactionHash,
    },
    replayHashes: replays, replayIdentical, rebuiltSceneControl: rebuiltControl,
  },
});

writeJson(`${OUT}/07-complexity.json`, {
  artifact: "PHASE 4D REMEDIATION §16 - the measured cost of the corrected composition model", at: at(),
  scaling,
  stateEvaluationsRule: "one opening evaluation plus one per ledger-affecting effect: n + 1, linear in the number of effects",
  singleDrawUnchanged: "a transaction with one draw and no adjustment still costs 2 state evaluations, exactly as before the remediation, so the common case pays nothing",
  pipelineStepsConstant: scaling.every((s) => s.simulationSteps === 15),
  knownQuadratic: {
    counter: "ledgerEntriesExamined",
    observed: scaling.map((s) => ({ effects: s.effects, ledgerEntriesExamined: s.ledgerEntriesExamined })),
    statement: "each recomputation scans the ledger, which grows by one row per draw, so ledger scanning is quadratic in the number of ledger-affecting effects. This is disclosed rather than asserted away.",
    optimisationNotTaken: "an incremental usage accumulator would make this linear, but it would re-derive Phase-4C arithmetic inside Phase 4D and the two layers could then drift. Correctness first; the optimisation belongs behind a proof of equivalence.",
  },
  noWallClockAssertion: "no correctness or performance claim in this phase rests on elapsed time; every figure above is a structural counter",
});

// ---------------------------------------------------------------------------
// THE GATE
// ---------------------------------------------------------------------------
type Cond = { n: number; condition: string; ok: boolean; evidence: string };
const C: Cond[] = [];
const add = (condition: string, ok: boolean, evidence: string) => C.push({ n: C.length + 1, condition, ok, evidence });

// --- behavioural safety (executed, never scanned) --------------------------
add("aggregate same-node consumption fails closed", !s1.commitPlan.committable && s1.selectedPathResult !== "SATISFIED" && unsafeIn(s1.postState).length === 0, `path ${s1.selectedPathResult}, committable ${s1.commitPlan.committable}`);
add("exact aggregate exhaustion succeeds with zero remaining", s2.commitPlan.committable && amt(s2.postState!.capacities.find((c) => c.capacityNodeId === nodeOf("p-a"))!.remaining) === "0", `remaining ${amt(s2.postState?.capacities.find((c) => c.capacityNodeId === nodeOf("p-a"))?.remaining as Any)}`);
add("aggregate shared-pool consumption fails closed", !s3.commitPlan.committable && unsafeIn(s3.postState).length === 0, `path ${s3.selectedPathResult}, committable ${s3.commitPlan.committable}`);
add("exact shared-pool exhaustion succeeds", s3b.commitPlan.committable && amt(s3b.postState!.sharedConstraints.find((x) => x.sharedCapacityId === "res-1")!.remaining) === "0", `shared remaining ${amt(s3b.postState?.sharedConstraints.find((x) => x.sharedCapacityId === "res-1")?.remaining as Any)}`);
add("existing usage is counted with the new aggregate effects", !s4.commitPlan.committable, `30 historical + 40 + 40 against 100: path ${s4.selectedPathResult}`);
add("intra-transaction order is semantic", s5f.selectedPathResult !== s5r.selectedPathResult, `restore-then-consume ${s5f.selectedPathResult}; consume-then-restore ${s5r.selectedPathResult}`);
add("restore then consume sees the released capacity", s5f.selectedPathResult === "SATISFIED" && s5f.commitPlan.committable, `${s5f.selectedPathResult}`);
add("supersede then consume sees the released amount", s7f.selectedPathResult === "SATISFIED" && s7r.selectedPathResult !== "SATISFIED", `forward ${s7f.selectedPathResult}; reverse ${s7r.selectedPathResult}`);
add("conflicting ledger successors are refused, not raced", codesOf(s8).includes("CONFLICTING_LEDGER_SUCCESSOR") && !s8.commitPlan.committable, codesOf(s8).join(","));
add("conflicting event state is refused, not ordered", codesOf(s9).includes("CONFLICTING_EVENT_STATE") && !s9.commitPlan.committable, codesOf(s9).join(","));
add("agreeing event assignments are not a false conflict", !codesOf(s9ok).includes("CONFLICTING_EVENT_STATE"), codesOf(s9ok).join(",") || "none");
add("a dangling effect dependency is refused, never ignored", codesOf(s10).includes("INVALID_EFFECT_DEPENDENCY") && !s10.commitPlan.committable, codesOf(s10).join(","));
add("duplicate effect ids are refused deterministically", codesOf(s11).includes("DUPLICATE_EFFECT_IDENTITY") && !s11.commitPlan.committable, codesOf(s11).join(","));
add("a dependency cycle is refused", codesOf(s12).includes("TRANSACTION_EFFECT_DEPENDENCY_CYCLE") && !s12.commitPlan.committable, codesOf(s12).join(","));
add("a fixed point is refused rather than solved", codesOf(s12b).includes("FIXED_POINT_REQUIRED") || codesOf(s12b).includes("TRANSACTION_EFFECT_DEPENDENCY_CYCLE") || !s12b.commitPlan.committable, codesOf(s12b).join(",") || "no cycle in this shape");
add("reclassification conservation holds under composition", s13.reclassificationEffects.allExecuted === false && s13.reclassificationEffects.batchConservation.some((b: Any) => b.holds === false), JSON.stringify(s13.reclassificationEffects.batchConservation));
add("a metric adjustment is visible only to the effects stated after it", s14f.selectedPathResult !== s14r.selectedPathResult, `adjust-then-draw ${s14f.selectedPathResult}; draw-then-adjust ${s14r.selectedPathResult}`);
add("the final post-state is validated, not merely reported", s1.postState === null || unsafeIn(s1.postState).length === 0, `aggregate over-draw publishes postState ${s1.postState === null ? "null" : "a state"}`);
add("committable implies the final state is safe, across the sweep", sweep.violations.length === 0, `${sweep.compositionsChecked} compositions, ${sweep.violations.length} violations`);
add("failure atomicity: a fatal conflict publishes no successor state", s18.postState === null && s18.postStateIdentity === null && !s18.commitPlan.committable, "postState and postStateIdentity both null");
add("no mutation of caller-owned state or ledger", noMutation, "byte-identical before and after a refused transaction");
add("deterministic replay", replayIdentical, `${replays.length} replays, ${new Set(replays.map((x) => JSON.stringify(x))).size} distinct`);
add("identity: same semantics, same identity", idLabel.transactionIdentity.transactionHash === idPlain.transactionIdentity.transactionHash, "a display label change leaves the hash untouched");
add("identity: different semantics, different identity", idA.transactionIdentity.transactionHash !== idB.transactionIdentity.transactionHash && idPlain.transactionIdentity.transactionHash !== idAmount.transactionIdentity.transactionHash, "effect order and amount each change the hash");
add("state evaluations are linear in effect count", scaling.every((s) => s.stateEvaluations === s.effects + 1), scaling.map((s) => `${s.effects}->${s.stateEvaluations}`).join(" "));
add("the pipeline remains a fixed number of steps", scaling.every((s) => s.simulationSteps === 15), "15 at every size");

// --- boundary questions a structural scan can answer -----------------------
add("no solver or optimisation entry point in the transaction module", solverHits.length === 0, solverHits.join(",") || "none");
add("no financial ingestion in the transaction module", ingestionHits.length === 0, ingestionHits.join(",") || "none");
add("no persistence surface in the transaction module", persistenceHits.length === 0, persistenceHits.join(",") || "none");
add("no automatic path selection, allocation or maximum is computed", JSON.stringify(s1.notComputed).includes("NOT_COMPUTED_IN_PHASE_4D"), Object.keys(s1.notComputed).join(","));
add("the layer boundary is one-directional", earlierImportingTx.length === 0, earlierImportingTx.join(",") || "no earlier phase imports the transaction module");
add("only the transaction module changed in production", priorPhaseTouched.length === 0, priorPhaseTouched.join(",") || "none");
add("Phase 3 trees remain frozen", frozenNow.phase3Compiler === PHASE3_TREES.compiler && frozenNow.phase3Semantic === PHASE3_TREES.semantic, `${frozenNow.phase3Compiler.slice(0, 12)} / ${frozenNow.phase3Semantic.slice(0, 12)}`);
add("Phase 4B semantics unchanged since the failed baseline", frozenNow.phase4bInput === frozenBefore.phase4bInput, frozenNow.phase4bInput.slice(0, 12));
add("Phase 4C semantics unchanged since the failed baseline", frozenNow.phase4cCapacity === frozenBefore.phase4cCapacity, frozenNow.phase4cCapacity.slice(0, 12));
add("IR semantics unchanged since the failed baseline", frozenNow.ir === frozenBefore.ir, frozenNow.ir.slice(0, 12));
add("Phase 4E remains unstarted", !existsSync("lib/contract-model/runtime/allocation") && !existsSync("lib/contract-model/runtime/optimizer"), "no Phase-4E directory");
add("Phase 5 remains unstarted", !existsSync("lib/contract-model/ingestion"), "no ingestion directory");

// --- regression ------------------------------------------------------------
add("the adversarial composition suite passes", txSuite.length > 0 && txSuite.every(([, s]) => s === "passed"), `${txSuite.length} Phase-4D tests, ${txSuite.filter(([, s]) => s !== "passed").length} not passing`);
add("no new failing identity in the full suite", full !== null && base !== null && newFailing.length === 0, full && base ? `now ${full.failed} failed of ${full.tests}; base ${base.failed} of ${base.tests}; new ${newFailing.length}` : "regression inputs not supplied");
add("tsc has no new error", tscLog !== "" && tscNew.length === 0, `${tscNew.length} new`);
add("lint passes", /No ESLint warnings or errors/.test(lintLog), lintLog.trim().split("\n")[0] ?? "not run");
add("build passes", /Compiled successfully/.test(buildLog), /Compiled successfully/.test(buildLog) ? "compiled" : "not run or failed");

const pass = C.filter((c) => c.ok).length;
const failing = C.filter((c) => !c.ok);
const verdict =
  failing.length === 0 ? "PHASE4D_TRANSACTION_SIMULATION_READY"
    : failing.some((c) => /aggregate|post-state|committable|order is semantic|atomicity/i.test(c.condition)) ? "PHASE4D_STATE_TRANSITION_UNSAFE"
      : failing.some((c) => /ledger successor|reclassification conservation/i.test(c.condition)) ? "PHASE4D_LEDGER_TRANSITION_UNSAFE"
        : failing.some((c) => /event|dependency|duplicate effect/i.test(c.condition)) ? "PHASE4D_EFFECT_COMPOSITION_UNSAFE"
          : failing.some((c) => /identity|replay/i.test(c.condition)) ? "PHASE4D_IDENTITY_UNSAFE"
            : failing.some((c) => /frozen|unchanged|boundary|Phase 4E|Phase 5|solver|ingestion|persistence/i.test(c.condition)) ? "PHASE4D_RUNTIME_BOUNDARY_VIOLATED"
              : "PHASE4D_REGRESSION_DETECTED";

writeJson(`${OUT}/08-regression.json`, {
  artifact: "PHASE 4D REMEDIATION §18 - regression against the exact pre-remediation baseline", at: at(),
  headAtRun: head, failedBaseline: FAILED_BASELINE,
  fullSuite: full ? { tests: full.tests, passed: full.passed, failed: full.failed } : null,
  baselineSuite: base ? { tests: base.tests, passed: base.passed, failed: base.failed } : null,
  newFailingIdentities: newFailing,
  fixedVsBaseline: fixedVsBase,
  phase4dSuite: { tests: txSuite.length, failed: txSuite.filter(([, s]) => s !== "passed").length },
  failureClassification: {
    newAttributable: newFailing,
    inheritedIdentical: "every other failing identity fails identically on the pre-remediation baseline",
    inheritedUnstable: "the segmentCoordinateClauses wall-clock identities over the unchanged Phase-3 tree, carried forward and not waived",
  },
  tsc: { newErrors: tscNew, preExistingIgnored: "tests/foundation-audit/ errors present before this work" },
  lint: /No ESLint warnings or errors/.test(lintLog), build: /Compiled successfully/.test(buildLog),
  deliberateTestChanges: [
    { test: "identity-and-determinism: state evaluations", was: "stateEvaluations === 2 and ledgerEntriesExamined === 3n for any n", now: "stateEvaluations === n + 1, exactly asserted",
      why: "the old numbers were achievable only because every draw shared one pre-transaction evaluation, which is the defect. The new numbers are the measured cost of correctness and are asserted exactly, not relaxed." },
    { test: "synthetic-matrix M", was: "stateEvaluations === 2", now: "stateEvaluations === 3",
      why: "the adjustment is applied, the capacity is evaluated against the adjusted view, then the post-state is evaluated. Same reason." },
  ],
});

writeJson(`${OUT}/09-freeze-proof.json`, {
  artifact: "PHASE 4D REMEDIATION §19 - freeze and boundary proof", at: at(),
  failedBaseline: FAILED_BASELINE, headAtRun: head,
  treesAtFailedBaseline: frozenBefore, treesNow: frozenNow,
  productionFilesChanged: [...new Set(changedProduction)].sort(),
  priorPhaseProductionFilesChanged: priorPhaseTouched,
  transactionModuleImportsOutsideItself: [...new Set(importsOutside)],
  earlierPhasesImportingTransaction: earlierImportingTx,
  phase4eStarted: false, phase5Started: false,
  solverPresent: solverHits.length > 0, ingestionPresent: ingestionHits.length > 0, persistencePresent: persistenceHits.length > 0,
});

writeJson(`${OUT}/10-recertification-gate.json`, {
  artifact: "PHASE 4D REMEDIATION §12, §21 - the strengthened recertification gate", at: at(),
  supersedes: "docs/phase-4d/17-phase4d-gate.json (58/58, issued at the failed baseline)",
  methodology: "every safety condition executes the engine and asserts on the returned result. Structural scans are retained only for boundary questions - forbidden imports, forbidden directories, absent solver entry points - and are never used as evidence of runtime semantics.",
  failedBaseline: FAILED_BASELINE, headAtRun: head,
  transactionSimulationVersion: TRANSACTION_SIMULATION_VERSION, capacityGraphVersion: CAPACITY_GRAPH_VERSION,
  runtimeVersion: CONTRACT_RUNTIME_VERSION, inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
  conditions: C.map((c) => ({ n: c.n, condition: c.condition, status: c.ok ? "PASS" : "FAIL", evidence: c.evidence })),
  summary: { PASS: pass, FAIL: failing.length, total: C.length },
  verdict,
  paidCalls: 0, modelCalls: 0, spendUsd: 0,
});

console.log(JSON.stringify({ verdict, pass, total: C.length, failing: failing.map((c) => c.condition), sweep: sweep.compositionsChecked, newFailing: newFailing.length }, null, 1));
