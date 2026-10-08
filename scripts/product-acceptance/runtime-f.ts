/**
 * Package F runtime cases: a hand-built IR (exactly the rules the manifest states for Summit Ridge Foods) evaluated
 * through the production Phase-4 runtime (snapshotInputResolver → buildCapacityGraph → evaluateCapacityState →
 * simulateTransaction). The IR is hand-built because the certified compiler path is MOCKED in this run; the runtime
 * stage is therefore PRODUCTION code over FIXTURE IR, which is stated in the report.
 */
import type { IRRule, IRSharedCapacity, IRExpression, IRCapacityExpression, IRDefinition } from "../../lib/contract-model/ir/types";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";
import { EMPTY_RESOLVER } from "../../lib/contract-model/runtime/input-resolver";
import type { FinancialInput, FinancialSnapshot } from "../../lib/contract-model/runtime/input/types";
import { rationalFromString } from "../../lib/contract-model/runtime/decimal";
import { buildCapacityGraph } from "../../lib/contract-model/runtime/capacity/graph";
import { evaluateCapacityState } from "../../lib/contract-model/runtime/capacity/state";
import type { CapacityAmount, CapacityState, LedgerUsageRecord } from "../../lib/contract-model/runtime/capacity/types";
import { simulateTransaction } from "../../lib/contract-model/runtime/transaction/simulate";
import type { CorpusPackage } from "./corpus";
import { Ledger } from "./auditor";

const ORG = "company:summit-ridge", INST = "summit-ridge-credit-agreement-2026", DOC = "credit-agreement";
let n = 0; const id = () => `pa-expr-${++n}`;
const MONEY = (amount: number, currency = "USD"): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency, exprId: id() });
const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: id() });
const TERM = (termName: string): IRExpression => ({ kind: "DEFINED_TERM_REFERENCE", type: "MONEY", termName, companyId: ORG, instrumentKey: INST, resolvedDefinitionId: null, exprId: id() } as IRExpression);
const MUL = (...operands: IRExpression[]): IRExpression => ({ kind: "MULTIPLY", type: "MONEY", operands, exprId: id() });

function rule(ruleId: string, sourceSectionRef: string, family: IRRule["covenantFamily"], action: IRRule["action"], capacityExpression: IRCapacityExpression | null, excerpt: string): IRRule {
  return { ruleId, irSchemaVersion: "product-acceptance-fixture", companyId: ORG, instrumentKey: INST, sourceDocumentId: DOC, sourceSectionRef, covenantFamily: family, ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action, entityScope: ["BORROWER"], entityScopeExcluded: [], transactionScope: null, capacityExpression, conditions: [], exceptions: [], dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: { documentId: DOC, sourceNodeKey: null, sourceCitation: `Section ${sourceSectionRef}`, excerpt }, compilerVersion: null, sourceContentVersion: null };
}

/** The compiler shape for a prose metric (as the golden certified fixtures emit it): an IRDefinition with no calculation expression and sufficiency COMPLETE, satisfied by a supplied TERM_VALUE input that overrides it. A PARTIAL definition makes every dependent capacity AMBIGUOUS (observed). */
const EBITDA_DEF: IRDefinition = { definitionId: "def:f-consolidated-ebitda", irSchemaVersion: "product-acceptance-fixture", companyId: ORG, instrumentKey: INST, sourceDocumentId: DOC, termName: "Consolidated EBITDA", covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: null, dependsOnTerms: ["Consolidated Net Income", "Interest Expense"], sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: { documentId: DOC, sourceNodeKey: null, sourceCitation: "Section 1.01", excerpt: "\"Consolidated EBITDA\" means, for any period, Consolidated Net Income for such period plus Interest Expense, income tax expense and depreciation and amortization expense for such period." }, compilerVersion: null, sourceContentVersion: null };
export function fixtureIR(): { rules: IRRule[]; shared: IRSharedCapacity[]; definitions: IRDefinition[] } {
  const rules = [
    rule("rule:f-7.01(b)", "7.01(b)", "INDEBTEDNESS", "INCUR_DEBT", MONEY(50_000_000), "not to exceed $50,000,000 at any time outstanding"),
    rule("rule:f-7.01(c)", "7.01(c)", "INDEBTEDNESS", "INCUR_DEBT", MUL(PCT(0.2), TERM("Consolidated EBITDA")), "not to exceed 20% of Consolidated EBITDA"),
    rule("rule:f-7.01(f)", "7.01(f)", "INDEBTEDNESS", "INCUR_DEBT", MONEY(10_000_000, "EUR"), "not to exceed EUR 10,000,000 at any time outstanding"),
    rule("rule:f-7.06(b)", "7.06(b)", "RESTRICTED_PAYMENTS", "PAY_DIVIDEND", MONEY(20_000_000), "together with Investments made pursuant to Section 7.08(c), not to exceed $20,000,000"),
    rule("rule:f-7.08(c)", "7.08(c)", "INVESTMENTS", "MAKE_INVESTMENT", MONEY(20_000_000), "together with Restricted Payments made pursuant to Section 7.06(b), not to exceed $20,000,000"),
  ];
  const shared: IRSharedCapacity[] = [{ sharedCapId: "shared:f-7.06b-7.08c", companyId: ORG, instrumentKey: INST, description: "7.06(b)/7.08(c) aggregate $20,000,000", capExpression: MONEY(20_000_000), memberRuleIds: ["rule:f-7.06(b)", "rule:f-7.08(c)"], provenance: { documentId: DOC, sourceNodeKey: null, sourceCitation: "Sections 7.06(b) and 7.08(c)", excerpt: "together with" } }];
  return { rules, shared, definitions: [EBITDA_DEF] };
}

function metric(key: string, amount: number, asOf: string): FinancialInput {
  // the 4B contract (observed through the dependency manifest): a bare DEFINED_TERM_REFERENCE is queried with the EVALUATION
  // date as its exact as-of selector, so the input must be dated exactly at the evaluation date; and a reported value for a term
  // that also has a definition must declare itself an override of that definition.
  return { identity: { companyId: ORG, scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST }, inputKind: "TERM_VALUE", key, identityStrength: "CONTRACT_NAME_ONLY", period: { kind: "NOT_PERIOD_SPECIFIC" }, asOf: { kind: "EXACT_DATE", isoDate: asOf }, valueType: "MONEY", currency: "USD" }, value: { type: "MONEY", amount: rationalFromString(String(amount)), currency: "USD", lineage: { exprId: null, inputKeys: [] } }, sourceVersion: "fixture-1", overridesDefinitionId: key === "Consolidated EBITDA" ? EBITDA_DEF.definitionId : undefined };
}
function snapshot(snapshotId: string, status: FinancialSnapshot["status"], asOf: string, ebitda: number): FinancialSnapshot {
  return { snapshotId, version: "1", companyId: ORG, asOf, reportingPeriod: `period-${asOf}`, status, supersedesSnapshotId: null, inputs: [metric("Consolidated EBITDA", ebitda, asOf)], provenance: { source: "product-acceptance fixture", sourceVersion: "1" }, review: status === "APPROVED" ? { reviewedBy: "fixture-reviewer", reviewedAt: `${asOf}T00:00:00Z`, approvalRef: `approval-${snapshotId}` } : { reviewedBy: null, reviewedAt: null, approvalRef: null } };
}
function usage(usageId: string, amount: number, ruleId: string, effectiveAsOf: string, over: Partial<LedgerUsageRecord> = {}): LedgerUsageRecord {
  return { usageId, companyId: ORG, instrumentKey: INST, effectiveAsOf, amount: { amount: String(amount), currency: "USD" }, capacityPath: { kind: "RULE", ruleId }, transactionRef: `hist-${usageId}`, status: "RECORDED", supersededByUsageId: null, provenance: { source: "fixture ledger", sourceVersion: "1", approvalRef: "fixture-approval", approvalState: "APPROVED" }, ...over };
}

const amt = (a: CapacityAmount | undefined): string => !a ? "undefined" : a.kind === "AMOUNT" ? (a.value.type === "MONEY" ? `${a.value.currency} ${a.value.amount}` : JSON.stringify(a.value)) : a.kind === "NOT_DETERMINED" ? `NOT_DETERMINED(${a.reason.slice(0, 80)})` : a.kind;
const num = (a: CapacityAmount | undefined): number | null => a && a.kind === "AMOUNT" && a.value.type === "MONEY" ? Number(a.value.amount) : null;

export function runRuntimeF(pkg: CorpusPackage, L: Ledger): void {
  const rt = pkg.manifest.runtime;
  if (!rt) return;
  const { rules, shared, definitions } = fixtureIR();
  const asOf = "2026-09-30";
  const ledger = [usage("usage-f-1", 12_000_000, "rule:f-7.01(b)", "2026-03-15"), usage("usage-f-2", 6_000_000, "rule:f-7.01(b)", "2026-07-01"), usage("usage-f-3", 4_000_000, "rule:f-7.06(b)", "2026-05-01"), usage("usage-f-4", 9_000_000, "rule:f-7.08(c)", "2026-06-01")];
  const approved = snapshot("snap-f-approved", "APPROVED", "2026-06-30", 80_000_000);
  const draft = snapshot("snap-f-draft", "DRAFT", "2026-09-30", 120_000_000);
  const resolver = (snaps: FinancialSnapshot[]) => snaps.length ? snapshotInputResolver({ snapshots: snaps, rules, definitions, companyId: ORG, instrumentKey: INST }) : EMPTY_RESOLVER;
  const graph = buildCapacityGraph({ rules, sharedCapacities: shared, definitions, companyId: ORG, instrumentKey: INST, asOf });
  const evaluate = (snaps: FinancialSnapshot[], led: LedgerUsageRecord[], at: string = asOf) => evaluateCapacityState({ graph, rules, sharedCapacities: shared, definitions, inputs: resolver(snaps), ledger: led, asOf: at });
  const entry = (state: CapacityState, ruleId: string) => state.capacities.find((c) => c.ruleId === ruleId);
  const MODE = "PRODUCTION" as const;
  const check = (caseId: string, ok: boolean, expected: string, actual: string, severity: Parameters<Ledger["fail"]>[4]["severity"], repro: string, outcome: Parameters<Ledger["fail"]>[4]["outcomeClass"] = "INCORRECT_RESULT") => {
    if (ok) L.pass("RUNTIME_CAPACITY", MODE, "RUNTIME_CASE", `runtime:${caseId}`, actual);
    else L.fail("RUNTIME_CAPACITY", MODE, "RUNTIME_CASE", `runtime:${caseId}`, { severity, outcomeClass: outcome, expected, actual, repro, deterministic: true });
  };
  try {
    const base = evaluate([approved], ledger);
    L.observe(`runtime F base state: ${base.capacities.map((c) => `${c.ruleId.replace("rule:f-", "")}=${c.status}:${amt(c.effectiveRemaining)}`).join(", ")}; snapshotBinding ${JSON.stringify(base.snapshotBinding.snapshotIds)}; ledgerIssues ${base.ledgerIssues.length}`);
    // F-R1
    const r1 = entry(base, "rule:f-7.01(b)")!;
    check("F-R1", r1.status === "AVAILABLE" && num(r1.usage) === 18_000_000 && num(r1.effectiveRemaining) === 32_000_000, "AVAILABLE, used 18,000,000, remaining 32,000,000", `${r1.status}, gross ${amt(r1.grossCapacity)}, used ${amt(r1.usage)}, remaining ${amt(r1.effectiveRemaining)}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.01(b), ledger usage-f-1 + usage-f-2)");
    // F-R2: evaluated at the approved pack's own as-of date
    const q2 = evaluate([approved], ledger, "2026-06-30");
    const r2 = entry(q2, "rule:f-7.01(c)")!;
    check("F-R2", r2.status === "AVAILABLE" && num(r2.effectiveRemaining) === 16_000_000, "AVAILABLE 16,000,000 (20% × approved EBITDA 80,000,000) when evaluated as of 2026-06-30", `${r2.status}, remaining ${amt(r2.effectiveRemaining)}, binding ${JSON.stringify(q2.snapshotBinding.snapshotIds)}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.01(c), approved snapshot, asOf 2026-06-30)");
    // F-R2c: is the 2026-06-30 approved pack carried forward to a 2026-09-30 evaluation without the IR saying so?
    const r2c = entry(base, "rule:f-7.01(c)")!;
    check("F-R2c", r2c.status === "NEEDS_INPUT" && num(r2c.effectiveRemaining) === null, "NEEDS_INPUT when evaluated as of 2026-09-30 with only a pack dated 2026-06-30 (exact as-of policy)", `${r2c.status}, remaining ${amt(r2c.effectiveRemaining)}, binding ${JSON.stringify(base.snapshotBinding.snapshotIds)}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.01(c), approved 2026-06-30 pack, asOf 2026-09-30)");
    // F-R3
    const none = evaluate([], ledger);
    const r3 = entry(none, "rule:f-7.01(c)")!;
    check("F-R3", r3.status === "NEEDS_INPUT" && num(r3.effectiveRemaining) === null, "NEEDS_INPUT, no number", `${r3.status}, remaining ${amt(r3.effectiveRemaining)}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.01(c), no snapshot)");
    // F-R4
    const draftOnly = evaluate([draft], ledger);
    const r4 = entry(draftOnly, "rule:f-7.01(c)")!;
    check("F-R4", r4.status !== "AVAILABLE" && num(r4.effectiveRemaining) === null, "not AVAILABLE under DEFAULT_RESOLUTION_POLICY (APPROVED only); no number", `${r4.status}, remaining ${amt(r4.effectiveRemaining)}, binding ${JSON.stringify(draftOnly.snapshotBinding.snapshotIds)}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.01(c), DRAFT snapshot only)");
    // F-R2b: approved (2026-06-30) + draft (2026-09-30) together, evaluated at 2026-09-30: the draft must not be used
    const both = evaluate([approved, draft], ledger);
    const r2b = entry(both, "rule:f-7.01(c)")!;
    check("F-R2b", num(r2b.effectiveRemaining) !== 24_000_000, "never 24,000,000 (the DRAFT pack must not supply the metric under the APPROVED-only policy)", `${r2b.status}, remaining ${amt(r2b.effectiveRemaining)}, binding ${JSON.stringify(both.snapshotBinding.snapshotIds)} ambiguous=${both.snapshotBinding.ambiguous}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.01(c), APPROVED 2026-06-30 + DRAFT 2026-09-30, asOf 2026-09-30)");
    // F-R5 / F-R6
    const r5 = entry(base, "rule:f-7.06(b)")!, r6 = entry(base, "rule:f-7.08(c)")!;
    const sc = base.sharedConstraints[0];
    check("F-R5", r5.status === "AVAILABLE" && num(r5.effectiveRemaining) === 7_000_000, "AVAILABLE, remaining 7,000,000 (20m − 4m − 9m)", `${r5.status}, own usage ${amt(r5.usage)}, effective remaining ${amt(r5.effectiveRemaining)}; shared ${sc ? `${sc.status} remaining ${amt(sc.remaining)}` : "none"}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.06(b) with shared cap)");
    check("F-R6", r6.status === "AVAILABLE" && num(r6.effectiveRemaining) === 7_000_000 && num(r6.effectiveRemaining) === num(r5.effectiveRemaining), "AVAILABLE, remaining 7,000,000, identical to F-R5", `${r6.status}, effective remaining ${amt(r6.effectiveRemaining)}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.08(c) with shared cap)");
    // F-R7
    const r7 = entry(base, "rule:f-7.01(f)")!;
    const usdFigure = r7.effectiveRemaining.kind === "AMOUNT" && r7.effectiveRemaining.value.type === "MONEY" && r7.effectiveRemaining.value.currency === "USD";
    check("F-R7", !usdFigure, "no USD figure for a EUR basket without FX (EUR figure or NEEDS_INPUT/UNSUPPORTED acceptable)", `${r7.status}, remaining ${amt(r7.effectiveRemaining)}`, "UNSUPPORTED_AS_COMPLETE", "evaluateCapacityState(7.01(f) EUR, no FX input)");
    // F-R8: propose 35,000,000 against 7.01(b)
    const sim = simulateTransaction({ transaction: { transactionId: "tx-f-r8", companyId: ORG, instrumentKey: INST, effectiveAsOf: asOf, category: "debt", label: "incur 35m", entities: ["BORROWER"], effects: [{ effectId: "e1", kind: "CONSUME_CAPACITY", capacityNodeId: "capacity:rule:rule:f-7.01(b)", amount: { type: "MONEY", amount: "35000000", currency: "USD" } }], provenance: { source: "product-acceptance fixture", sourceVersion: "1", approvalRef: null } } as never, currentState: base, capacityGraph: graph, selectedPath: { capacityNodeIds: ["capacity:rule:rule:f-7.01(b)"], ruleIds: ["rule:f-7.01(b)"], sharedCapacityIds: [], reclassificationElectionIds: [] }, inputs: resolver([approved]), context: { rules, sharedCapacities: shared, definitions, ledger, asOf } });
    const ce = sim.capacityEffects[0];
    check("F-R8", sim.selectedPathResult !== "SATISFIED" && (ce?.outcome === "INSUFFICIENT_CAPACITY" || sim.selectedPathResult === "INSUFFICIENT_CAPACITY"), "INSUFFICIENT_CAPACITY (32m remaining < 35m)", `simulation ${sim.simulationStatus}, path ${sim.selectedPathResult}, effect ${ce?.outcome ?? "none"}, shortfall ${ce?.shortfallAmount ? JSON.stringify(ce.shortfallAmount).slice(0, 80) : "null"}`, "CRITICAL_FALSE_PERMISSION", "simulateTransaction(CONSUME 35,000,000 on 7.01(b))");
    // F-R9: supersede usage-f-1 with a 10,000,000 correction
    const corrected = [usage("usage-f-1", 12_000_000, "rule:f-7.01(b)", "2026-03-15", { status: "SUPERSEDED", supersededByUsageId: "usage-f-1b" }), usage("usage-f-1b", 10_000_000, "rule:f-7.01(b)", "2026-03-15"), ledger[1]!, ledger[2]!, ledger[3]!];
    const r9 = entry(evaluate([approved], corrected), "rule:f-7.01(b)")!;
    check("F-R9", num(r9.usage) === 16_000_000 && num(r9.effectiveRemaining) === 34_000_000, "used 16,000,000, remaining 34,000,000 (correction replaces, never adds)", `${r9.status}, used ${amt(r9.usage)}, remaining ${amt(r9.effectiveRemaining)}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.01(b), usage-f-1 SUPERSEDED by usage-f-1b)");
    // F-R10: a duplicate usage identity must be quarantined, never double counted
    const dup = [...ledger, usage("usage-f-2", 6_000_000, "rule:f-7.01(b)", "2026-07-01")];
    const st10 = evaluate([approved], dup);
    const r10 = entry(st10, "rule:f-7.01(b)")!;
    check("F-R10", num(r10.usage) !== 24_000_000 && st10.ledgerIssues.some((i) => i.code === "DUPLICATE_USAGE_ID"), "duplicate usage id quarantined with a ledger issue; never counted twice", `${r10.status}, used ${amt(r10.usage)}, issues ${st10.ledgerIssues.map((i) => i.code).join(",") || "none"}`, "CRITICAL_FALSE_PERMISSION", "evaluateCapacityState(7.01(b), duplicate usage-f-2)");
    // explanation traceability invariant
    const ex = base.explanations.find((e) => e.ruleId === "rule:f-7.01(b)");
    check("F-INV-trace", !!ex && ex.ledgerEntries.length === 2 && ex.sourceRules.length >= 1, "explanation lists the 2 ledger entries and the source rule", ex ? `${ex.ledgerEntries.length} ledger entries, ${ex.sourceRules.length} source rule(s), ${ex.inputsUsed.length} input(s)` : "no explanation", "SOURCE_PROVENANCE_FAILURE", "evaluateCapacityState(...).explanations");
    // determinism
    const again = evaluate([approved], ledger);
    check("F-INV-determinism", again.stateHash === base.stateHash, "identical stateHash on identical inputs", `${base.stateHash.slice(0, 16)} vs ${again.stateHash.slice(0, 16)}`, "EVIDENCE_INCOMPLETE", "evaluateCapacityState twice");
  } catch (e) {
    L.fail("RUNTIME_CAPACITY", MODE, "RUNTIME_CASE", "runtime:F", { severity: "EVIDENCE_INCOMPLETE", outcomeClass: "TEST_INFRASTRUCTURE_FAILURE", expected: "runtime cases evaluate", actual: `threw: ${e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 3).join("\n")}` : String(e)}`, repro: "runtime-f.ts", deterministic: true });
  }
}
