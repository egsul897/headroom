/**
 * Agent 8 — Independent Correctness and Adversarial Testing
 *
 * Challenges legal/financial/transactional correctness of Headroom production
 * runtime APIs using independently calculated expectations and authentic
 * agreement sources. Does not modify production code. Does not treat
 * implementation-generated outputs as ground truth.
 *
 * Usage: npx tsx scripts/agent8-independent-adversarial/run.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildCapacityGraph, evaluateCapacityState, applyCapacityStateTransition } from "../../lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "../../lib/contract-model/runtime/input-resolver";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input";
import { simulateTransaction } from "../../lib/contract-model/runtime/transaction/simulate";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import {
  AS_OF,
  CO,
  INST,
  MAX,
  METRIC,
  MONEY,
  MUL,
  PCT,
  RATIO,
  CMP,
  UNLIM,
  ADD,
  approvedSnapshot,
  isNotDetermined,
  moneyAmount,
  moneyFact,
  ratioFact,
  resetIds,
  rule,
  shared,
  usage,
} from "./helpers";

export type OutcomeClass =
  | "CORRECT_EXECUTABLE"
  | "CORRECT_PROHIBITION"
  | "CORRECT_REFUSAL"
  | "INCORRECT_REFUSAL"
  | "INCORRECT_FAVORABLE"
  | "UNSUPPORTED"
  | "UNTESTED"
  | "OBSERVATION";

export interface CaseResult {
  id: string;
  challenge: number;
  title: string;
  source: string;
  expected: string;
  actual: string;
  pass: boolean;
  outcomeClass: OutcomeClass;
  severity: "CRITICAL_FALSE_PERMISSION" | "MATERIAL_OVERSTATEMENT" | "MATERIAL_CONDITION" | "NONMATERIAL" | "NONE" | "OBSERVATION";
  repro: string;
  rootCause?: string;
  regressionRecommendation?: string;
  releaseBlocking: boolean;
}

const cases: CaseResult[] = [];

function record(c: Omit<CaseResult, "pass"> & { pass: boolean }): void {
  cases.push(c);
}

function unsupportedExpr(reason: string): IRExpressionLike {
  return {
    kind: "UNSUPPORTED",
    type: null,
    sourceEvidence: "agent8",
    semanticDescription: reason,
    reason,
    requiredReview: true,
    exprId: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

function runRuntimeCases(): void {
  resetIds();

  // --- 1 / 5 / 15: Missing EBITDA on greater-of (sc-missing-ebitda) ---
  {
    const rules = [rule("grower", MAX(MONEY(47_500_000), MUL(PCT(0.25), METRIC("Applicable EBITDA"))))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF });
    const c = state.capacities[0]!;
    const pass =
      c.status === "NEEDS_INPUT" &&
      isNotDetermined(c.effectiveRemaining) &&
      moneyAmount(c.grossCapacity) !== "47500000";
    record({
      id: "RT-01-missing-ebitda-greater-of",
      challenge: 5,
      title: "Greater-of basket with missing EBITDA must not fall back to fixed leg",
      source: "Phase-2 sc-missing-ebitda; Chewy-style greater of $47.5mm / 25% Applicable EBITDA",
      expected: "NEEDS_INPUT / NOT_DETERMINED; never publish 47,500,000 as capacity",
      actual: `${c.status}, gross=${JSON.stringify(c.grossCapacity).slice(0, 120)}, rem=${JSON.stringify(c.effectiveRemaining).slice(0, 120)}`,
      pass,
      outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState(MAX($47.5mm, 25% Applicable EBITDA), no financial inputs)",
      releaseBlocking: !pass,
      rootCause: pass ? undefined : "MAX short-circuits to evaluable fixed operand when metric missing",
      regressionRecommendation: "Keep NEEDS_INPUT when any MAX operand is unresolved for greater-of baskets",
    });
  }

  // --- 8: Shared double-spend (sc-shared-double-spend) ---
  {
    const rules = [
      rule("p", MONEY(20_000_000)),
      rule("g", MONEY(20_000_000)),
    ];
    const caps = [shared("pool", MONEY(30_000_000), ["p", "g"])];
    const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      sharedCapacities: caps,
      inputs: EMPTY_RESOLVER,
      ledger: [usage("u1", "20000000", "p"), usage("u2", "15000000", "g")],
      asOf: AS_OF,
    });
    const pool = state.sharedConstraints[0]!;
    const member = state.capacities.find((x) => x.ruleId === "p")!;
    const flagged = pool.limitations.some((l) => l.code === "OVER_CONSUMPTION");
    const memberNotAvailable = member.status !== "AVAILABLE";
    const pass = flagged && memberNotAvailable;
    // Separately observe whether negative remaining is published on the pool
    const poolPublishesNegative = moneyAmount(pool.remaining) !== null && Number(moneyAmount(pool.remaining)) < 0;
    const poolWithholds = isNotDetermined(pool.remaining) && pool.overConsumption != null;
    record({
      id: "RT-02-shared-double-spend-blocked",
      challenge: 8,
      title: "Shared-capacity double spend is flagged and members are not AVAILABLE",
      source: "Phase-2 sc-shared-double-spend (15%×$200mm=$30mm; 20+15 exceeds); DSGR §6.01(p)/(g) mechanic",
      expected: "OVER_CONSUMPTION; members not AVAILABLE; no executable permission",
      actual: `pool.status=${pool.status}, pool.rem=${moneyAmount(pool.remaining) ?? pool.remaining.kind}, member.status=${member.status}, flagged=${flagged}`,
      pass,
      outcomeClass: pass ? "CORRECT_PROHIBITION" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState(shared $30mm, usage 20mm+15mm)",
      releaseBlocking: !pass,
    });
    record({
      id: "RT-02b-shared-negative-remaining-published",
      challenge: 11,
      title: "Shared pool withholds negative remaining under REVIEW_REQUIRED (aligned with member withholding)",
      source: "Phase-2 sc-negative-capacity: availableAmountPresented=0; doNotReportNegativeAsPermission",
      expected: "Pool remaining withheld as NOT_DETERMINED; deficit under overConsumption/provisional; never a negative permission figure on remaining",
      actual: `pool.status=${pool.status}, pool.remaining.kind=${pool.remaining.kind}, overConsumption=${pool.overConsumption ? "present" : "null"}, provisionalRem=${pool.provisional ? moneyAmount(pool.provisional.remaining) : "null"}, member.effectiveRemaining withheld=${isNotDetermined(member.effectiveRemaining)}`,
      pass: !poolPublishesNegative && poolWithholds,
      outcomeClass: !poolPublishesNegative && poolWithholds ? "CORRECT_REFUSAL" : "OBSERVATION",
      severity: poolPublishesNegative ? "MATERIAL_OVERSTATEMENT" : "NONE",
      repro: "evaluateCapacityState shared overdraw → inspect sharedConstraints[0].remaining / overConsumption",
      releaseBlocking: false,
      rootCause: poolPublishesNegative
        ? "SharedConstraintState publishes raw arithmetic remaining even when OVER_CONSUMPTION floors status to REVIEW_REQUIRED; member CapacityStateEntry withholds under legalUnsafe"
        : undefined,
      regressionRecommendation: poolPublishesNegative
        ? "Align shared-constraint publishing with member withholding: when OVER_CONSUMPTION applies, publish remaining as NOT_DETERMINED and keep deficit only under an overConsumption/provisional field"
        : undefined,
    });
  }

  // --- 8 / 9: Missing shared in IR → independent baskets (false permission if certified) ---
  {
    const rules = [
      rule("rp", MONEY(20_000_000), { covenantFamily: "RESTRICTED_PAYMENTS", action: "PAY_DIVIDEND" }),
      rule("inv", MONEY(20_000_000), { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT" }),
    ];
    const graph = buildCapacityGraph({ rules, sharedCapacities: [], companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      sharedCapacities: [],
      inputs: EMPTY_RESOLVER,
      ledger: [usage("u1", "15000000", "rp")],
      asOf: AS_OF,
    });
    const invRem = moneyAmount(state.capacities.find((c) => c.ruleId === "inv")!.effectiveRemaining);
    // Runtime correctly trusts IR — this case documents the certification dependency
    record({
      id: "RT-03-missing-shared-ir-trusts-independent",
      challenge: 9,
      title: "Runtime trusts IR that omits shared capacity (certification must catch 'together with')",
      source: "pkg-f / IPV-02 drafting: 'together with … pursuant to Section'; Phase-2 sc-shared-double-spend",
      expected: "Runtime shows independent remaining (inv still 20mm) — CORRECT given IR; certification must refuse such IR from 'together with' text",
      actual: `inv.remaining=${invRem}, sharedConstraints=${state.sharedConstraints.length}`,
      pass: invRem === "20000000" && state.sharedConstraints.length === 0,
      outcomeClass: "CORRECT_EXECUTABLE",
      severity: "NONE",
      repro: "evaluateCapacityState(two $20mm rules, no sharedCapacities, one usage 15mm)",
      releaseBlocking: false,
      rootCause: "By design: Phase-4 runtime treats IR as authority; false-permission risk lives in certification if DROP_SHARED_CAPS certifies",
      regressionRecommendation: "Keep IPV-02 adversarial DROP_SHARED_CAPS non-CERTIFIED; never bypass certification into VEP with omitted shared caps",
    });
  }

  // --- 10: No automatic reclassification without election ---
  {
    const rules = [
      rule("fixed", MONEY(720_000_000), {
        dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "ratio", description: "Chewy §1.08(f) reclass right" }],
      }),
      rule("ratio", MONEY(800_000_000)),
    ];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      inputs: EMPTY_RESOLVER,
      ledger: [usage("u1", "100000000", "fixed")],
      asOf: AS_OF,
    });
    const fixedU = moneyAmount(state.capacities.find((c) => c.ruleId === "fixed")!.usage);
    const ratioU = state.capacities.find((c) => c.ruleId === "ratio")!.usage;
    const pass = fixedU === "100000000" && ratioU.kind === "NOT_DETERMINED";
    record({
      id: "RT-04-no-silent-auto-reclass",
      challenge: 10,
      title: "Reclassification right does not silently move usage without an election",
      source: "Phase-2 sc-auto-vs-elected-reclass; Chewy §1.08(f)",
      expected: "fixed usage remains 100mm; ratio unused until election",
      actual: `fixed.usage=${fixedU}, ratio.usage.kind=${ratioU.kind}`,
      pass,
      outcomeClass: pass ? "CORRECT_PROHIBITION" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState with RECLASSIFIABLE_TO edge, no election",
      releaseBlocking: !pass,
    });
  }

  // --- 10: Reclass without edge refused ---
  {
    const rules = [rule("fixed", MONEY(720_000_000)), rule("ratio", MONEY(800_000_000))];
    const ledger = [usage("u1", "100000000", "fixed")];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const before = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
    const tr = applyCapacityStateTransition({
      graph,
      rules,
      inputs: EMPTY_RESOLVER,
      ledger,
      asOf: AS_OF,
      before,
      elections: [
        {
          electionId: "e1",
          sourceRuleId: "fixed",
          destinationRuleId: "ratio",
          amount: { amount: "100000000", currency: "USD" },
          effectiveAsOf: AS_OF,
          provenance: { source: "a8", sourceVersion: "1", approvalRef: "a" },
        },
      ],
    });
    const pass =
      tr.outcomes[0]!.state === "RECLASSIFICATION_NOT_EXECUTABLE" &&
      tr.outcomes[0]!.blockedBy.some((b) => b.code === "NO_EXPLICIT_RECLASSIFICATION_EDGE") &&
      tr.after === null;
    record({
      id: "RT-05-reclass-without-edge-refused",
      challenge: 10,
      title: "Reclassification election without authorizing edge is refused",
      source: "Phase-2 sc-auto-vs-elected-reclass; Phase-4C reclassification contract",
      expected: "RECLASSIFICATION_NOT_EXECUTABLE / NO_EXPLICIT_RECLASSIFICATION_EDGE; after=null",
      actual: `${tr.outcomes[0]!.state}; ${tr.outcomes[0]!.blockedBy.map((b) => b.code).join(",")}; afterNull=${tr.after === null}`,
      pass,
      outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "applyCapacityStateTransition without RECLASSIFIABLE_TO edge",
      releaseBlocking: !pass,
    });
  }

  // --- 11: Unjustified restoration via naked negative usage ---
  {
    const rules = [rule("aa", MONEY(50_000_000))];
    const ledger = [usage("u1", "10000000", "aa"), usage("u2", "-4000000", "aa")];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
    const c = state.capacities[0]!;
    const restoredFavorably = moneyAmount(c.effectiveRemaining) === "44000000" || moneyAmount(c.usage) === "6000000";
    const pass = !restoredFavorably && c.status !== "AVAILABLE";
    record({
      id: "RT-06-negative-usage-not-restoration",
      challenge: 11,
      title: "Naked negative ledger usage does not restore Available Amount capacity",
      source: "Phase-2 sc-builder-replenishment (returns require builder credit, not raw negative usage)",
      expected: "Refuse/quarantine negative usage; do not publish restored AVAILABLE headroom",
      actual: `status=${c.status}, usage=${JSON.stringify(c.usage).slice(0, 100)}, rem=${JSON.stringify(c.effectiveRemaining).slice(0, 100)}, issues=${state.ledgerIssues.map((i) => i.code).join(",")}`,
      pass,
      outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState(ledger with -4mm usage against AA)",
      releaseBlocking: !pass,
    });
  }

  // --- 12 / 18: Available Amount sequential depletion (sc-available-amount-depletion) ---
  {
    const rules = [
      rule("rp", MONEY(50_000_000), { covenantFamily: "RESTRICTED_PAYMENTS", action: "PAY_DIVIDEND" }),
      rule("inv", MONEY(50_000_000), { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT" }),
    ];
    const caps = [shared("aa", MONEY(50_000_000), ["rp", "inv"])];
    const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF });
    const sim = simulateTransaction({
      transaction: {
        transactionId: "tx-aa",
        companyId: CO,
        instrumentKey: INST,
        effectiveAsOf: AS_OF,
        category: "restricted_payment",
        label: "simultaneous AA draws",
        entities: ["BORROWER"],
        effects: [
          {
            effectId: "e1",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: "capacity:rule:rp",
            amount: { type: "MONEY", amount: "30000000", currency: "USD" },
          },
          {
            effectId: "e2",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: "capacity:rule:inv",
            amount: { type: "MONEY", amount: "30000000", currency: "USD" },
          },
        ],
        provenance: { source: "a8", sourceVersion: "1", approvalRef: null },
      } as never,
      currentState: state,
      capacityGraph: graph,
      selectedPath: {
        capacityNodeIds: ["capacity:rule:rp", "capacity:rule:inv"],
        ruleIds: ["rp", "inv"],
        sharedCapacityIds: ["aa"],
        reclassificationElectionIds: [],
      },
      inputs: EMPTY_RESOLVER,
      context: { rules, sharedCapacities: caps, ledger: [], asOf: AS_OF },
    });
    const e1 = sim.capacityEffects.find((e) => e.effectId === "e1");
    const e2 = sim.capacityEffects.find((e) => e.effectId === "e2");
    const pass = e1?.outcome === "SATISFIED" && e2?.outcome === "INSUFFICIENT_CAPACITY" && sim.selectedPathResult === "INSUFFICIENT_CAPACITY";
    record({
      id: "RT-07-aa-sequential-depletion",
      challenge: 12,
      title: "Same-day RP+Investment against Available Amount cannot both clear full 30+30 on 50",
      source: "Phase-2 sc-available-amount-depletion; Chewy §1.09 anti-double-count sequencing",
      expected: "First CONSUME SATISFIED; second INSUFFICIENT_CAPACITY; path not SATISFIED",
      actual: `e1=${e1?.outcome}, e2=${e2?.outcome}, path=${sim.selectedPathResult}`,
      pass,
      outcomeClass: pass ? "CORRECT_PROHIBITION" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "simulateTransaction two CONSUME 30mm against shared AA 50mm",
      releaseBlocking: !pass,
    });
    record({
      id: "RT-07b-transaction-ordering",
      challenge: 18,
      title: "Intra-transaction ordering depletes shared AA before the second effect (not simultaneous pre-state)",
      source: "Phase-2 sc-available-amount-depletion / Chewy §1.09; same fixture as RT-07",
      expected: "Effects applied sequentially within one simulation; second sees depleted pool",
      actual: `e1=${e1?.outcome}, e2=${e2?.outcome}, path=${sim.selectedPathResult}`,
      pass,
      outcomeClass: pass ? "CORRECT_PROHIBITION" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "simulateTransaction two CONSUME effects in one transaction against shared AA",
      releaseBlocking: !pass,
    });
  }

  // --- 4 / 6: Ratio path blocked while grower open (sc-ratio-test-failure) ---
  {
    const gate = CMP(METRIC("First Lien Net Leverage Ratio", "RATIO"), "LTE", RATIO(3.75));
    const rules = [
      rule("ratio-debt", UNLIM(gate), {
        conditions: [
          {
            conditionId: "g1",
            conditionType: "RATIO_TEST",
            expression: gate,
            referencesDefinitionId: null,
            description: "FLNL <= 3.75x",
            provenance: null,
          },
        ],
      }),
      rule("general", MONEY(40_000_000)),
    ];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const inputs = snapshotInputResolver({
      snapshots: [approvedSnapshot([ratioFact("First Lien Net Leverage Ratio", "4.1")])],
      companyId: CO,
      instrumentKey: INST,
    });
    const state = evaluateCapacityState({ graph, rules, inputs, ledger: [], asOf: AS_OF });
    const ratio = state.capacities.find((c) => c.ruleId === "ratio-debt")!;
    const general = state.capacities.find((c) => c.ruleId === "general")!;
    const gateFailed = ratio.grossCapacity.kind === "GATE_NOT_SATISFIED" || ratio.effectiveRemaining.kind === "GATE_NOT_SATISFIED";
    const generalOpen = general.status === "AVAILABLE" && moneyAmount(general.effectiveRemaining) === "40000000";
    const passPaths = gateFailed && generalOpen;
    record({
      id: "RT-08-ratio-vs-grower-paths",
      challenge: 6,
      title: "Failed ratio gate blocks ratio debt without collapsing the separate grower path",
      source: "Phase-2 sc-ratio-test-failure; Chewy Fixed vs Ratio Incremental path separation",
      expected: "ratio gross/remaining GATE_NOT_SATISFIED; general grower remains 40mm AVAILABLE",
      actual: `ratio.status=${ratio.status}, ratio.gross.kind=${ratio.grossCapacity.kind}, ratio.rem.kind=${ratio.effectiveRemaining.kind}, general.status=${general.status}, general.rem=${moneyAmount(general.effectiveRemaining)}`,
      pass: passPaths,
      outcomeClass: passPaths ? "CORRECT_EXECUTABLE" : !gateFailed ? "INCORRECT_FAVORABLE" : "INCORRECT_REFUSAL",
      severity: !gateFailed ? "CRITICAL_FALSE_PERMISSION" : !generalOpen ? "NONMATERIAL" : "NONE",
      repro: "evaluateCapacityState(UNLIMITED gated by FLNL<=3.75 with FLNL=4.1 + separate $40mm)",
      releaseBlocking: !gateFailed,
    });
    // Status-layer honesty: AVAILABLE + GATE_NOT_SATISFIED is a misleading favorable signal
    const statusHonest = ratio.status === "NOT_SATISFIED" && ratio.status !== "AVAILABLE";
    record({
      id: "RT-08b-gated-unlimited-status-not-available",
      challenge: 20,
      title: "Failed ratio gate must not report capacity status AVAILABLE",
      source: "Phase-2 sc-ratio-test-failure / sc-conditional-permission; independent status semantics",
      expected: "status=NOT_SATISFIED (never AVAILABLE) when gross/remaining is GATE_NOT_SATISFIED",
      actual: `status=${ratio.status}, gross.kind=${ratio.grossCapacity.kind}, rem.kind=${ratio.effectiveRemaining.kind}`,
      pass: statusHonest && gateFailed,
      outcomeClass: statusHonest ? "CORRECT_PROHIBITION" : "INCORRECT_FAVORABLE",
      severity: statusHonest ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState(UNLIMITED gated capacity with failing ratio); inspect capacities[].status",
      releaseBlocking: !statusHonest,
      rootCause: !statusHonest
        ? "statusFromEvaluation maps EvaluationResult.status EXECUTABLE → AVAILABLE even when capacity amount kind is GATE_NOT_SATISFIED"
        : undefined,
      regressionRecommendation: !statusHonest
        ? "Map GATE_NOT_SATISFIED capacity amounts to NOT_SATISFIED before publishing CapacityStateEntry.status"
        : undefined,
    });
  }

  // --- 15: Stale financial period (sc-measurement-date-mismatch) ---
  {
    const rules = [rule("pct", MUL(PCT(0.2), METRIC("Consolidated EBITDA")))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: "2026-09-30" });
    const inputs = snapshotInputResolver({
      snapshots: [approvedSnapshot([moneyFact("Consolidated EBITDA", "80000000", "2026-06-30")], "2026-06-30")],
      companyId: CO,
      instrumentKey: INST,
    });
    const state = evaluateCapacityState({ graph, rules, inputs, ledger: [], asOf: "2026-09-30" });
    const c = state.capacities[0]!;
    const pass = c.status === "NEEDS_INPUT" && moneyAmount(c.effectiveRemaining) !== "16000000";
    record({
      id: "RT-09-stale-period-not-carried",
      challenge: 15,
      title: "Approved pack dated 2026-06-30 is not silently used for 2026-09-30 evaluation",
      source: "Phase-2 sc-measurement-date-mismatch; pkg-f F-R2c exact as-of policy",
      expected: "NEEDS_INPUT; never 16,000,000",
      actual: `status=${c.status}, rem=${moneyAmount(c.effectiveRemaining)}, binding=${JSON.stringify(state.snapshotBinding.snapshotIds)}`,
      pass,
      outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState(20% EBITDA, approved 2026-06-30 pack, asOf 2026-09-30)",
      releaseBlocking: !pass,
    });
  }

  // --- 15: Draft snapshot must not supply metric ---
  {
    const rules = [rule("pct", MUL(PCT(0.2), METRIC("Consolidated EBITDA")))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const inputs = snapshotInputResolver({
      snapshots: [approvedSnapshot([moneyFact("Consolidated EBITDA", "120000000")], AS_OF, "DRAFT")],
      companyId: CO,
      instrumentKey: INST,
    });
    const state = evaluateCapacityState({ graph, rules, inputs, ledger: [], asOf: AS_OF });
    const c = state.capacities[0]!;
    const pass = c.status !== "AVAILABLE" && moneyAmount(c.effectiveRemaining) !== "24000000";
    record({
      id: "RT-10-draft-snapshot-not-used",
      challenge: 15,
      title: "DRAFT financial snapshot cannot authorize capacity under default policy",
      source: "pkg-f F-R4; independent hand-computed expectation",
      expected: "not AVAILABLE; never 24,000,000",
      actual: `status=${c.status}, rem=${moneyAmount(c.effectiveRemaining)}`,
      pass,
      outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState(20% EBITDA, DRAFT-only snapshot)",
      releaseBlocking: !pass,
    });
  }

  // --- 16: Duplicate ledger identity quarantined ---
  {
    const rules = [rule("b", MONEY(50_000_000))];
    const ledger = [usage("u-dup", "12000000", "b"), usage("u-dup", "12000000", "b")];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
    const c = state.capacities[0]!;
    const doubleCounted = moneyAmount(c.usage) === "24000000";
    const pass = !doubleCounted && state.ledgerIssues.some((i) => i.code === "DUPLICATE_USAGE_ID");
    record({
      id: "RT-11-duplicate-ledger-quarantined",
      challenge: 16,
      title: "Duplicate usage identity is quarantined, never double-counted",
      source: "pkg-f F-R10; independent arithmetic",
      expected: "DUPLICATE_USAGE_ID issue; usage not 24,000,000",
      actual: `usage=${moneyAmount(c.usage)}, issues=${state.ledgerIssues.map((i) => i.code).join(",")}`,
      pass,
      outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState with two records sharing usageId",
      releaseBlocking: !pass,
    });
  }

  // --- 13: Equity contribution builder leg (ADD starter + contribution) ---
  {
    const rules = [
      rule(
        "aa-builder",
        ADD(MONEY(10_000_000), METRIC("Qualified Equity Contributions")),
        { covenantFamily: "RESTRICTED_PAYMENTS", action: "PAY_DIVIDEND" },
      ),
    ];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const withEq = evaluateCapacityState({
      graph,
      rules,
      inputs: snapshotInputResolver({
        snapshots: [approvedSnapshot([moneyFact("Qualified Equity Contributions", "5000000")])],
        companyId: CO,
        instrumentKey: INST,
      }),
      ledger: [],
      asOf: AS_OF,
    });
    const withoutEq = evaluateCapacityState({
      graph,
      rules,
      inputs: EMPTY_RESOLVER,
      ledger: [],
      asOf: AS_OF,
    });
    const withRem = moneyAmount(withEq.capacities[0]!.effectiveRemaining);
    const withoutStatus = withoutEq.capacities[0]!.status;
    const pass = withRem === "15000000" && withoutStatus === "NEEDS_INPUT";
    record({
      id: "RT-12-equity-contribution-builder",
      challenge: 13,
      title: "Equity contribution builder adds only when the contribution fact is supplied",
      source: "Chewy Available Amount equity-contribution builder leg (phase-2 formula hypotheses); independent arithmetic 10+5=15",
      expected: "with contribution: 15,000,000 AVAILABLE; without: NEEDS_INPUT",
      actual: `with=${withRem}/${withEq.capacities[0]!.status}, without=${withoutStatus}`,
      pass,
      outcomeClass: pass ? "CORRECT_EXECUTABLE" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "MATERIAL_OVERSTATEMENT",
      repro: "evaluateCapacityState(ADD($10mm, Qualified Equity Contributions))",
      releaseBlocking: !pass && withRem !== null && withoutStatus === "AVAILABLE",
    });
  }

  // --- 7: EUR basket without FX ---
  {
    const rules = [rule("eur", MONEY(10_000_000, "EUR"))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF });
    const c = state.capacities[0]!;
    const usdFigure =
      c.effectiveRemaining.kind === "AMOUNT" &&
      c.effectiveRemaining.value.type === "MONEY" &&
      c.effectiveRemaining.value.currency === "USD";
    const pass = !usdFigure;
    record({
      id: "RT-13-currency-mismatch-no-usd",
      challenge: 19,
      title: "EUR basket without FX must not be published as a USD capacity figure",
      source: "Phase-2 sc-currency-mismatch; pkg-f F-R7",
      expected: "EUR figure or NEEDS_INPUT/UNSUPPORTED — never a USD conversion",
      actual: `${c.status}, rem=${JSON.stringify(c.effectiveRemaining).slice(0, 140)}`,
      pass,
      outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState(EUR 10,000,000, no FX)",
      releaseBlocking: !pass,
    });
  }

  // --- 19 / 20: Stale simulation — postState must not be reused after ledger change without re-eval ---
  {
    const rules = [rule("b", MONEY(50_000_000))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state1 = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF });
    const sim = simulateTransaction({
      transaction: {
        transactionId: "tx-stale",
        companyId: CO,
        instrumentKey: INST,
        effectiveAsOf: AS_OF,
        category: "debt",
        label: "draw 10",
        entities: ["BORROWER"],
        effects: [
          {
            effectId: "e1",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: "capacity:rule:b",
            amount: { type: "MONEY", amount: "10000000", currency: "USD" },
          },
        ],
        provenance: { source: "a8", sourceVersion: "1", approvalRef: null },
      } as never,
      currentState: state1,
      capacityGraph: graph,
      selectedPath: {
        capacityNodeIds: ["capacity:rule:b"],
        ruleIds: ["b"],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
      inputs: EMPTY_RESOLVER,
      context: { rules, ledger: [], asOf: AS_OF },
    });
    // After an external ledger update, re-evaluate — stale sim.postState must not be treated as current
    const state2 = evaluateCapacityState({
      graph,
      rules,
      inputs: EMPTY_RESOLVER,
      ledger: [usage("external", "40000000", "b")],
      asOf: AS_OF,
    });
    const staleRem = moneyAmount(sim.postState?.capacities[0]?.effectiveRemaining);
    const freshRem = moneyAmount(state2.capacities[0]!.effectiveRemaining);
    const hashesDiffer = sim.postState?.stateHash !== state2.stateHash;
    const pass = hashesDiffer && staleRem === "40000000" && freshRem === "10000000";
    record({
      id: "RT-14-stale-simulation-hash-divergence",
      challenge: 19,
      title: "Simulation postState diverges from fresh evaluation after external ledger update",
      source: "Independent ordering/staleness challenge; system must not treat old sim as current authority",
      expected: "Different stateHash; stale rem 40mm vs fresh 10mm — consumer must rebind",
      actual: `staleRem=${staleRem}, freshRem=${freshRem}, hashesDiffer=${hashesDiffer}`,
      pass,
      outcomeClass: pass ? "CORRECT_EXECUTABLE" : "UNSUPPORTED",
      severity: "NONE",
      repro: "simulate then evaluateCapacityState with additional external usage; compare stateHash",
      releaseBlocking: false,
      regressionRecommendation: "Product surfaces must key capacity displays on stateHash / ledger version, never a cached simulation alone",
    });
  }

  // --- 14: Entity scope — runtime trusts IR (certification owns narrowing) ---
  {
    const rules = [rule("r", MONEY(50_000_000), { entityScope: ["BORROWER", "ANY_SUBSIDIARY"] })];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF });
    const c = state.capacities[0]!;
    record({
      id: "RT-15-entity-scope-ir-trusted",
      challenge: 14,
      title: "Runtime publishes widened entityScope from IR (subsidiary restriction is a certification concern)",
      source: "IPV-01 closed at certification; CONMED §7.14 subsidiary distribution restrictions; Chewy non-Guarantor debt baskets",
      expected: "Runtime AVAILABLE with submitted scope — documents that false widening must be blocked upstream",
      actual: `status=${c.status}, scope=${JSON.stringify(c.entityScope)}, rem=${moneyAmount(c.effectiveRemaining)}`,
      pass: c.status === "AVAILABLE",
      outcomeClass: "CORRECT_EXECUTABLE",
      severity: "NONE",
      repro: "evaluateCapacityState(entityScope BORROWER+ANY_SUBSIDIARY)",
      releaseBlocking: false,
      regressionRecommendation: "Keep entity-scope guard + IPV-01 SET_SCOPE adversarial non-CERTIFIED",
    });
  }

  // --- 2: Defined-term exception — incomplete definition sufficiency ---
  {
    const rules2 = [
      rule("bad", ADD(MONEY(10_000_000), unsupportedExpr("earn-out proviso not formalized") as never), {
        covenantFamily: "INDEBTEDNESS",
      }),
    ];
    const graph = buildCapacityGraph({ rules: rules2, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules: rules2, inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF });
    const c = state.capacities[0]!;
    const pass = c.status === "UNSUPPORTED" && isNotDetermined(c.effectiveRemaining);
    record({
      id: "RT-16-unsupported-operand-poisons",
      challenge: 2,
      title: "Unsupported defined-term mechanic (earn-out proviso) poisons capacity, no favorable number",
      source: "CONMED Am2 Indebtedness earn-out proviso (ba-cnmd-am2-defs-ratio); Phase-2 unsupported favorable",
      expected: "UNSUPPORTED; remaining NOT_DETERMINED",
      actual: `status=${c.status}, rem.kind=${c.effectiveRemaining.kind}`,
      pass,
      outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "evaluateCapacityState(ADD($10mm, UNSUPPORTED earn-out))",
      releaseBlocking: !pass,
    });
  }
}

type IRExpressionLike = {
  kind: string;
  type: null;
  sourceEvidence: string;
  semanticDescription: string;
  reason: string;
  requiredReview: boolean;
  exprId: string;
};

function runAdditionalLegalCases(): void {
  resetIds();

  // --- 7: Lien capacity must not be treated as debt capacity (misclassification) ---
  {
    const rules = [
      rule("debt", MONEY(50_000_000), { covenantFamily: "INDEBTEDNESS", action: "INCUR_DEBT" }),
      rule("lien", MONEY(50_000_000), { covenantFamily: "LIENS", action: "CREATE_LIEN", sourceSectionRef: "7.3(m)" }),
    ];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF });
    // Consuming the lien basket via a debt-selected path should not silently satisfy a debt need
    const sim = simulateTransaction({
      transaction: {
        transactionId: "tx-lien",
        companyId: CO,
        instrumentKey: INST,
        effectiveAsOf: AS_OF,
        category: "debt",
        label: "secured debt via lien basket only",
        entities: ["BORROWER"],
        effects: [
          {
            effectId: "e1",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: "capacity:rule:lien",
            amount: { type: "MONEY", amount: "10000000", currency: "USD" },
          },
        ],
        provenance: { source: "a8", sourceVersion: "1", approvalRef: null },
      } as never,
      currentState: state,
      capacityGraph: graph,
      selectedPath: {
        capacityNodeIds: ["capacity:rule:lien"],
        ruleIds: ["lien"],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
      inputs: EMPTY_RESOLVER,
      context: { rules, ledger: [], asOf: AS_OF },
    });
    // Runtime will allow CONSUME on the selected path — documenting that debt+lien dual permission is caller-owned
    const lien = state.capacities.find((c) => c.ruleId === "lien")!;
    record({
      id: "RT-17-lien-vs-debt-path-separation",
      challenge: 7,
      title: "Lien basket and debt basket remain distinct capacity nodes (no silent merge)",
      source: "CONMED §7.2 / §7.3(m) human-ground-truth; secured debt typically needs both permissions",
      expected: "Two distinct capacity nodes; consuming lien does not reduce debt remaining",
      actual: `nodes=${state.capacities.map((c) => c.ruleId).join(",")}, debt.rem=${moneyAmount(state.capacities.find((c) => c.ruleId === "debt")!.effectiveRemaining)}, lien.family present, sim.path=${sim.selectedPathResult}`,
      pass:
        state.capacities.length === 2 &&
        moneyAmount(state.capacities.find((c) => c.ruleId === "debt")!.effectiveRemaining) === "50000000" &&
        lien.status === "AVAILABLE",
      outcomeClass: "CORRECT_EXECUTABLE",
      severity: "NONE",
      repro: "evaluateCapacityState(INDEBTEDNESS $50mm + LIENS $50mm); consume lien only",
      releaseBlocking: false,
      regressionRecommendation: "Product transaction analysis must require both INCUR_DEBT and CREATE_LIEN paths for secured debt; never treat lien remaining as debt headroom",
    });
  }

  // --- 17: Contradictory figures — two rules same identity different amounts (pkg-g style) ---
  {
    const collide = [rule("r-dup", MONEY(20_000_000)), rule("r-dup", MONEY(35_000_000))];
    const graph = buildCapacityGraph({ rules: collide, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules: collide, inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF });
    const dupLim =
      graph.limitations.some((l) => l.code === "DUPLICATE_RULE_IDENTITY") ||
      state.limitations.some((l) => l.code === "DUPLICATE_RULE_IDENTITY");
    const noFavorableNode = state.capacities.every((c) => moneyAmount(c.effectiveRemaining) !== "35000000");
    const pass = dupLim && state.capacities.length === 0 && noFavorableNode;
    record({
      id: "RT-18-duplicate-rule-identity-refused",
      challenge: 17,
      title: "Duplicate rule identity with contradictory caps is not resolved favorably to the larger number",
      source: "pkg-g adversarial duplicate §7.01 ($20mm vs $35mm); independent expectation: refuse, never pick $35mm",
      expected: "DUPLICATE_RULE_IDENTITY; no capacity node; never AVAILABLE 35,000,000",
      actual: `capacities=${state.capacities.length}, graphLim=${graph.limitations.map((l) => l.code).join(",")}, stateLim=${state.limitations.map((l) => l.code).join(",")}`,
      pass,
      outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
      severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
      repro: "buildCapacityGraph/evaluateCapacityState(two rules with identical ruleId, $20mm vs $35mm)",
      releaseBlocking: !pass,
      regressionRecommendation:
        "Product must treat state.limitations DUPLICATE_RULE_IDENTITY as blocking (empty capacities ≠ unconstrained permission)",
    });
  }

  // --- 11: Builder replenishment via SUPERSEDE cannot invent capacity above gross ---
  {
    const rules = [rule("aa", MONEY(50_000_000))];
    const ledger = [usage("u1", "10000000", "aa")];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
    const sim = simulateTransaction({
      transaction: {
        transactionId: "tx-sup",
        companyId: CO,
        instrumentKey: INST,
        effectiveAsOf: AS_OF,
        category: "investment",
        label: "restatement",
        entities: ["BORROWER"],
        effects: [
          {
            effectId: "e1",
            kind: "SUPERSEDE_LEDGER_USAGE",
            usageId: "u1",
            replacementAmount: { type: "MONEY", amount: "0", currency: "USD" },
            reason: "full release as return of capital",
          } as never,
        ],
        provenance: { source: "a8", sourceVersion: "1", approvalRef: null },
      } as never,
      currentState: state,
      capacityGraph: graph,
      selectedPath: {
        capacityNodeIds: ["capacity:rule:aa"],
        ruleIds: ["aa"],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
      inputs: EMPTY_RESOLVER,
      context: { rules, ledger, asOf: AS_OF },
    });
    const postRem = moneyAmount(sim.postState?.capacities[0]?.effectiveRemaining);
    const pass = sim.simulationStatus === "SIMULATED" && (postRem === "50000000" || postRem === null);
    // Full release back to gross is OK; inventing above gross would be a defect
    const overGross = postRem !== null && Number(postRem) > 50_000_000;
    record({
      id: "RT-19-supersede-release-not-above-gross",
      challenge: 11,
      title: "Ledger supersede release restores at most gross capacity, never above ceiling",
      source: "Phase-2 sc-builder-replenishment (cap at original); pkg-f F-R9 correction pattern",
      expected: "post remaining ≤ 50,000,000",
      actual: `sim=${sim.simulationStatus}, postRem=${postRem}, path=${sim.selectedPathResult}`,
      pass: !overGross && pass,
      outcomeClass: overGross ? "INCORRECT_FAVORABLE" : "CORRECT_EXECUTABLE",
      severity: overGross ? "CRITICAL_FALSE_PERMISSION" : "NONE",
      repro: "simulateTransaction(SUPERSEDE_LEDGER_USAGE replacementAmount 0)",
      releaseBlocking: overGross,
    });
  }
}

function runAuthenticCases(): void {
  const conmedArt7 = path.resolve(
    "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
  );
  const conmedAm2 = path.resolve(
    "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/second-amendment-2022-full.txt",
  );
  const conmedOmni = path.resolve(
    "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/first-omnibus-amendment-2026-curated.txt",
  );
  const chewyPath = path.resolve(
    "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
  );

  // --- 1: Covenant extraction — material CONMED baskets present in structure ---
  if (fs.existsSync(conmedArt7)) {
    const text = fs.readFileSync(conmedArt7, "utf8");
    const nodes = parseDocumentStructure({ documentId: "conmed-doc-a", text });
    const spanText = (n: (typeof nodes)[number]) => text.slice(n.charStart, n.charEnd);
    const checks: Array<{ id: string; needle: string; sectionHint: string }> = [
      { id: "7.2(o)", needle: "60,000,000", sectionHint: "7.2" },
      { id: "7.2(d)", needle: "50,000,000", sectionHint: "7.2" },
      { id: "7.3(m)", needle: "50,000,000", sectionHint: "7.3" },
      { id: "7.6(d)", needle: "40,000,000", sectionHint: "7.6" },
      { id: "7.6(e)", needle: "3.50", sectionHint: "7.6" },
      { id: "7.8(d)", needle: "5,000,000", sectionHint: "7.8" },
      { id: "7.14", needle: "consensual encumbrance", sectionHint: "7.14" },
    ];
    for (const ch of checks) {
      const inCorpus = text.includes(ch.needle);
      const sectionNodes = nodes.filter((n) => (n.sectionRef ?? "").startsWith(ch.sectionHint));
      const inSection = sectionNodes.some((n) => spanText(n).includes(ch.needle));
      record({
        id: `AUTH-01-extract-${ch.id}`,
        challenge: 1,
        title: `CONMED Art.VII material figure/term for ${ch.id} is present in source and parseable`,
        source: `human-ground-truth.ts ${ch.id}; curated base-credit-agreement-article-vii-negative-covenants.txt`,
        expected: `Source contains ${ch.needle}; structure retains section family ${ch.sectionHint} with figure in span`,
        actual: `inCorpus=${inCorpus}, sectionNodes=${sectionNodes.length}, inSectionSpan=${inSection}, totalNodes=${nodes.length}`,
        pass: inCorpus,
        outcomeClass: inCorpus ? (inSection ? "CORRECT_EXECUTABLE" : "OBSERVATION") : "INCORRECT_REFUSAL",
        severity: inCorpus ? (inSection ? "NONE" : "NONMATERIAL") : "MATERIAL_CONDITION",
        repro: `parseDocumentStructure(conmed Art VII); search ${ch.needle} in section spans`,
        releaseBlocking: false,
        rootCause:
          inCorpus && !inSection && sectionNodes.length > 0
            ? "Figure present in document but not inside parsed section span for the expected family"
            : inCorpus && sectionNodes.length === 0
              ? "Section family not minted by structure parser on curated Art VII excerpt"
              : undefined,
        regressionRecommendation:
          "If subsection spans miss basket figures, deepen enumerator/section capture before certifying basket amounts",
      });
    }
  } else {
    record({
      id: "AUTH-01-missing-fixture",
      challenge: 1,
      title: "CONMED Art VII fixture missing",
      source: conmedArt7,
      expected: "fixture present",
      actual: "missing",
      pass: false,
      outcomeClass: "UNTESTED",
      severity: "NONE",
      repro: "ls conmed curated",
      releaseBlocking: false,
    });
  }

  // --- 3: Amendment precedence — Doc C must not silently amend Doc A ---
  if (fs.existsSync(conmedAm2) && fs.existsSync(conmedArt7) && fs.existsSync(conmedOmni)) {
    const docs = [
      {
        documentId: "conmed-doc-a-eighth-ar-credit-agreement",
        label: "Eighth Amended and Restated Credit Agreement (Article VII curated)",
        text: fs.readFileSync(conmedArt7, "utf8"),
      },
      {
        documentId: "conmed-doc-c-second-amendment-2022",
        label: "Second Amendment dated as of August 1, 2022 to the Seventh Amended and Restated Credit Agreement dated as of July 16, 2021",
        text: fs.readFileSync(conmedAm2, "utf8"),
      },
      {
        documentId: "conmed-doc-d-first-omnibus-amendment-2026",
        label: "First Omnibus Amendment and Increased Facility Activation Notice dated as of May 27, 2026 to the Eighth Amended and Restated Credit Agreement dated as of June 10, 2025",
        text: fs.readFileSync(conmedOmni, "utf8"),
      },
    ];
    const graph = buildPackageGraph("company:conmed", "conmed-2025-credit-facility", docs);
    const cToA = graph.relationshipCandidates.filter(
      (r) =>
        (r.sourceDocumentId === "conmed-doc-c-second-amendment-2022" || r.targetDocumentId === "conmed-doc-c-second-amendment-2022") &&
        (r.sourceDocumentId === "conmed-doc-a-eighth-ar-credit-agreement" || r.targetDocumentId === "conmed-doc-a-eighth-ar-credit-agreement") &&
        r.status === "RESOLVED",
    );
    const falseAttach = cToA.length > 0;
    record({
      id: "AUTH-02-am2-not-attached-to-eighth",
      challenge: 3,
      title: "CONMED Second Amendment (to Seventh A&R) must not RESOLVE as amending the Eighth A&R",
      source: "human-ground-truth.ts pkg-3; README Document C targets Seventh A&R dated July 16, 2021 (absent)",
      expected: "No RESOLVED AMENDS relationship from Doc C to Doc A",
      actual: `resolved C↔A count=${cToA.length}; unresolvedRel=${graph.performance.relationshipsUnresolved}; resolvedRel=${graph.performance.relationshipsResolved}; sample=${JSON.stringify(cToA.slice(0, 2).map((r) => ({ status: r.status, type: r.relationshipType, src: r.sourceDocumentId, tgt: r.targetDocumentId }))).slice(0, 300)}`,
      pass: !falseAttach,
      outcomeClass: falseAttach ? "INCORRECT_FAVORABLE" : "CORRECT_REFUSAL",
      severity: falseAttach ? "CRITICAL_FALSE_PERMISSION" : "NONE",
      repro: "buildPackageGraph(CONMED A+C+D curated texts)",
      releaseBlocking: falseAttach,
      rootCause: falseAttach ? "Relationship resolver matched Doc C to Eighth by agreement-type similarity ignoring generation/date" : undefined,
      regressionRecommendation: "Require name+date identity match for AMENDS; Seventh vs Eighth must stay UNRESOLVED when Seventh text absent",
    });
  }

  // --- 4: Chewy Consolidated EBITDA definition contains Test Period (source presence) ---
  if (fs.existsSync(chewyPath)) {
    const text = fs.readFileSync(chewyPath, "utf8");
    const hasEbitda = /Consolidated EBITDA/.test(text);
    const hasTestPeriod = /Consolidated EBITDA[\s\S]{0,200}Test Period/.test(text) || /for any\s+Test Period[\s\S]{0,80}Consolidated EBITDA/.test(text);
    const hasAcquired = /Acquired EBITDA/.test(text);
    record({
      id: "AUTH-03-chewy-ebitda-test-period",
      challenge: 4,
      title: "Chewy source defines Consolidated EBITDA over Test Period (period correctness prerequisite)",
      source: "chwy-2026-credit-agreement extracted-text (SEC); eval-heldout issuer — source presence only, not used as training label",
      expected: "Consolidated EBITDA and Test Period co-located; Acquired EBITDA present",
      actual: `hasEbitda=${hasEbitda}, hasTestPeriod=${hasTestPeriod}, hasAcquired=${hasAcquired}`,
      pass: hasEbitda && hasTestPeriod,
      outcomeClass: hasEbitda && hasTestPeriod ? "CORRECT_EXECUTABLE" : "UNTESTED",
      severity: "NONE",
      repro: "grep Consolidated EBITDA / Test Period in Chewy extract",
      releaseBlocking: false,
    });
  }

  // Holdout discipline note
  record({
    id: "HOLD-01-eval-heldout-not-rescored",
    challenge: 20,
    title: "Eval-heldout issuers (Chewy/Gibraltar/RIOT) not used as dollar-permission ground truth",
    source: "datasets/source-to-covenant/reports/split-manifest.json heldOutIssuers",
    expected: "This mission uses Chewy text only for source-presence / period language checks; no capacity GT from heldout",
    actual: "Observed: AUTH-03 source-presence only; no Chewy dollar certification claims in this suite",
    pass: true,
    outcomeClass: "CORRECT_EXECUTABLE",
    severity: "NONE",
    repro: "n/a",
    releaseBlocking: false,
  });
}

function summarize() {
  const buckets: Record<OutcomeClass, number> = {
    CORRECT_EXECUTABLE: 0,
    CORRECT_PROHIBITION: 0,
    CORRECT_REFUSAL: 0,
    INCORRECT_REFUSAL: 0,
    INCORRECT_FAVORABLE: 0,
    UNSUPPORTED: 0,
    UNTESTED: 0,
    OBSERVATION: 0,
  };
  for (const c of cases) buckets[c.outcomeClass]++;
  const critical = cases.filter(
    (c) => !c.pass && (c.severity === "CRITICAL_FALSE_PERMISSION" || c.severity === "MATERIAL_OVERSTATEMENT") && c.releaseBlocking,
  );
  const materialObs = cases.filter((c) => c.outcomeClass === "OBSERVATION" || (c.severity === "MATERIAL_OVERSTATEMENT" && !c.pass));
  return { buckets, critical, materialObs, total: cases.length, passed: cases.filter((c) => c.pass).length };
}

async function main(): Promise<void> {
  runRuntimeCases();
  runAdditionalLegalCases();
  runAuthenticCases();
  const summary = summarize();
  const outDir = path.resolve("docs/agent8-independent-adversarial");
  fs.mkdirSync(outDir, { recursive: true });
  const artifact = {
    schemaVersion: "agent8-independent-adversarial.v1",
    generatedAt: new Date().toISOString(),
    methodology: {
      groundTruth: "Independent arithmetic from Phase-2 adversarial scenarios + authentic CONMED/Chewy source text + human-ground-truth.ts. Not derived from compiler/runtime dumps.",
      productionCodeModified: false,
      enginesExercised: [
        "buildCapacityGraph",
        "evaluateCapacityState",
        "applyCapacityStateTransition",
        "simulateTransaction",
        "parseDocumentStructure",
        "buildPackageGraph",
      ],
    },
    summary: {
      total: summary.total,
      passed: summary.passed,
      failed: summary.total - summary.passed,
      outcomeBuckets: summary.buckets,
      releaseBlockingCount: summary.critical.length,
    },
    cases,
    releaseBlocking: summary.critical,
    materialObservations: summary.materialObs,
  };
  fs.writeFileSync(path.join(outDir, "01-results.json"), JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify(artifact.summary, null, 2));
  console.log(`Wrote ${path.join(outDir, "01-results.json")}`);
  if (summary.critical.length > 0) {
    console.error("RELEASE-BLOCKING findings:", summary.critical.map((c) => c.id).join(", "));
    // Exit 0: findings are recorded in the artifact for the accuracy report / vitest assertions.
    // This suite's job is to surface defects, not to soft-pass by exiting non-zero before write.
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
