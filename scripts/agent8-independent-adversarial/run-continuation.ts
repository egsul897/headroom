/**
 * Agent 8 continuation — post-#229/#237 integrated architecture challenges.
 * Independent of product-readiness feature work. Does not modify production.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildSharedProductCapacityViews,
  assertProductCapacityConsistency,
  computeVerifiedRemaining,
  resolveUtilization,
  evidenceFromAttributedLedger,
  decideSolverUtilizationAuthority,
  assertMayPublishRemaining,
} from "../../lib/capacity";
import { buildCapacityGraph, evaluateCapacityState } from "../../lib/contract-model/runtime/capacity";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input";
import { computeSharedConstraintCurrentUsage } from "../../lib/solver/shared-usage";
import {
  AS_OF,
  CO,
  INST,
  CMP,
  METRIC,
  MONEY,
  RATIO,
  UNLIM,
  approvedSnapshot,
  ratioFact,
  resetIds,
  rule,
} from "./helpers";

type Outcome =
  | "CORRECT_EXECUTABLE"
  | "CORRECT_PROHIBITION"
  | "CORRECT_REFUSAL"
  | "INCORRECT_FAVORABLE"
  | "INCORRECT_REFUSAL"
  | "OBSERVATION";

interface CaseRow {
  id: string;
  title: string;
  source: string;
  expected: string;
  actual: string;
  pass: boolean;
  outcomeClass: Outcome;
  severity: "CRITICAL_FALSE_PERMISSION" | "MATERIAL_OVERSTATEMENT" | "MATERIAL_CONDITION" | "NONE" | "OBSERVATION";
  releaseBlocking: boolean;
  uniqueGroundedScenario: boolean;
  rootCause?: string;
  regressionRecommendation?: string;
  fixRecommendation?: string;
}

const cases: CaseRow[] = [];
const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();

function record(c: CaseRow): void {
  cases.push(c);
}

resetIds();

// --- PSA consistency (Position / Simulate / Ask share one authority) ---
{
  const views = buildSharedProductCapacityViews({
    gross: { amount: 100, gateSatisfied: true, modeled: true, capacityRuleId: "r-psa" },
    utilization: { capacityRuleId: "r-psa", asOf: AS_OF, records: [] },
  });
  const cons = assertProductCapacityConsistency(views);
  const noAvail = !views.POSITION.mayPublishAvailable && views.POSITION.publicationLabel === "GROSS_CONTRACTUAL";
  const pass = cons.ok && noAvail;
  record({
    id: "CONT-01-psa-empty-util-consistency",
    title: "Position/Simulate/Ask agree: empty ledger is GROSS_ONLY, never AVAILABLE remaining",
    source: "Independent utilization authority contract; product surface consistency",
    expected: "identical views; mayPublishAvailable=false; publicationLabel=GROSS_CONTRACTUAL",
    actual: `ok=${cons.ok} label=${views.POSITION.publicationLabel} mayPublish=${views.POSITION.mayPublishAvailable} rem=${views.POSITION.supportedRemainingCapacity}`,
    pass,
    outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
    severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
    releaseBlocking: !pass,
    uniqueGroundedScenario: true,
    rootCause: !pass ? "PSA views diverge or empty util published remaining" : undefined,
    regressionRecommendation: "tests/capacity/utilization-and-remaining.test.ts Position/Simulate/Ask",
    fixRecommendation: "Keep buildSharedProductCapacityViews as sole calculator; never invent zero utilization",
  });
}

// --- Gate failed must not become AVAILABLE on PSA ---
{
  const views = buildSharedProductCapacityViews({
    gross: { amount: 50, gateSatisfied: false, modeled: true, capacityRuleId: "r-gate" },
    utilization: {
      capacityRuleId: "r-gate",
      asOf: AS_OF,
      records: [],
      completenessCertificate: {
        capacityRuleId: "r-gate",
        asOf: AS_OF,
        approvalState: "APPROVED",
        sourceLabel: "should-not-matter",
        kind: "VERIFIED_EMPTY",
      },
    },
    allowSyntheticRemaining: true,
  });
  const pass = !views.POSITION.mayPublishAvailable && views.POSITION.remainingStatus === "GATE_FAILED";
  record({
    id: "CONT-02-psa-gate-failed-not-available",
    title: "Failed gate never publishes AVAILABLE even with completeness cert",
    source: "A8-01 + verified-remaining gateSatisfied guard",
    expected: "mayPublishAvailable=false; remainingStatus=GATE_FAILED",
    actual: `mayPublish=${views.POSITION.mayPublishAvailable} status=${views.POSITION.remainingStatus} label=${views.POSITION.publicationLabel}`,
    pass,
    outcomeClass: pass ? "CORRECT_PROHIBITION" : "INCORRECT_FAVORABLE",
    severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
    releaseBlocking: !pass,
    uniqueGroundedScenario: true,
  });
}

// --- Attributed without completeness → not remaining ---
{
  const util = resolveUtilization({
    capacityRuleId: "r-attr",
    asOf: AS_OF,
    records: [
      evidenceFromAttributedLedger({
        usageId: "u1",
        amount: 25,
        currency: "USD",
        effectiveAsOf: AS_OF,
        capacityRuleId: "r-attr",
        status: "ACTIVE",
        approvalState: "APPROVED",
        sourceLabel: "independent-attr",
        authenticity: "AUTHENTIC",
      }),
    ],
  });
  const v = computeVerifiedRemaining({
    gross: { amount: 100, gateSatisfied: true, modeled: true, capacityRuleId: "r-attr" },
    utilization: util,
  });
  const pass = !v.mayPublishAvailable && v.remainingStatus === "GROSS_ONLY" && util.attributedAmount === 25;
  record({
    id: "CONT-03-attributed-without-completeness",
    title: "Known attributed usage without VERIFIED_COMPLETE cannot publish remaining",
    source: "Utilization authority contract (#237)",
    expected: "GROSS_ONLY; attributedAmount=25; mayPublishAvailable=false",
    actual: `status=${v.remainingStatus} attributed=${util.attributedAmount} mayPublish=${v.mayPublishAvailable}`,
    pass,
    outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
    severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
    releaseBlocking: !pass,
    uniqueGroundedScenario: true,
  });
}

// --- Solver: attributed zero without cert not authoritative ---
{
  const r = computeSharedConstraintCurrentUsage({
    aggregationRule: "NAMED_MEMBER_CLAUSES",
    measurementBasis: "CURRENTLY_OUTSTANDING",
    members: [{ permissionId: "p" }],
    basketUsage: [{ permissionId: "p", cumulativeIncurred: 0, currentlyOutstanding: 0, prepaymentCredit: 0 }],
  });
  const d = decideSolverUtilizationAuthority({
    namedMemberCount: 1,
    attributedMemberCount: 1,
    measuredUsage: 0,
    aggregation: "NAMED_MEMBER_CLAUSES",
  });
  const pass = r.authoritative === false && !assertMayPublishRemaining(d);
  record({
    id: "CONT-04-solver-attributed-zero-incomplete",
    title: "Solver attributed-zero without VERIFIED_EMPTY is not remaining-authoritative",
    source: "Reconciled #232/#234 authority",
    expected: "authoritative=false; assertMayPublishRemaining=false",
    actual: `status=${r.status} authoritative=${r.authoritative} decision=${d.solverStatus}`,
    pass,
    outcomeClass: pass ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE",
    severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
    releaseBlocking: !pass,
    uniqueGroundedScenario: true,
  });
}

// --- Main A8-01 still closed ---
{
  const gate = CMP(METRIC("First Lien Net Leverage Ratio", "RATIO"), "LTE", RATIO(3.75));
  const rules = [
    rule("ratio-debt", UNLIM(gate), {
      conditions: [
        {
          conditionId: "g1",
          conditionType: "RATIO_SATISFIED",
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
  const pass = ratio.status === "NOT_SATISFIED" && general.status === "AVAILABLE";
  record({
    id: "CONT-05-main-a8-01-still-closed",
    title: "On integrated main, failed gate is NOT_SATISFIED; alternate path remains AVAILABLE",
    source: "PR #229 closed defect; main tip verification",
    expected: "ratio=NOT_SATISFIED; general=AVAILABLE",
    actual: `ratio=${ratio.status} general=${general.status} gross=${ratio.grossCapacity.kind}`,
    pass,
    outcomeClass: pass ? "CORRECT_PROHIBITION" : "INCORRECT_FAVORABLE",
    severity: pass ? "NONE" : "CRITICAL_FALSE_PERMISSION",
    releaseBlocking: !pass,
    uniqueGroundedScenario: false,
  });
}

// --- Pending PR #243 tip risk (env worktree) ---
{
  const tip = process.env.A8_TIP_243 ?? "/tmp/a8-wt-243";
  const probe = path.join(tip, "scripts/agent8-independent-adversarial/probe-gate-status.ts");
  const stateFile = path.join(tip, "lib/contract-model/runtime/capacity/state.ts");
  if (fs.existsSync(stateFile)) {
    const hasFloor = fs.readFileSync(stateFile, "utf8").includes("statusForAmount");
    let tipStatus: string | null = null;
    if (fs.existsSync(probe)) {
      const r = spawnSync("npx", ["tsx", probe], { cwd: tip, encoding: "utf8", timeout: 60_000 });
      tipStatus = r.stdout?.match(/"status": "([^"]+)"/)?.[1] ?? null;
    } else {
      // use risk probe from main against tip
      const r = spawnSync(
        "npx",
        ["tsx", path.join(process.cwd(), "scripts/agent8-independent-adversarial/probe-pending-integration-risk.ts")],
        { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, A8_TIP_ROOT: tip }, timeout: 90_000 },
      );
      try {
        const j = JSON.parse(r.stdout || "{}") as { probeOutcome?: { status?: string }; contract?: { falseFavorableRisk?: boolean } };
        tipStatus = j.probeOutcome?.status ?? (j.contract?.falseFavorableRisk ? "AVAILABLE" : null);
      } catch {
        tipStatus = hasFloor ? null : "AVAILABLE";
      }
    }
    const falseFav = tipStatus === "AVAILABLE" || !hasFloor;
    record({
      id: "CONT-06-pending-pr243-reintroduces-a8-01",
      title: "Pending PR #243 tip (pre-rebase) reintroduces AVAILABLE + GATE_NOT_SATISFIED",
      source: "Independent worktree probe of origin/cursor/sequential-verified-boundary-8970 @ 8bc6112e",
      expected: "After rebase onto main: status=NOT_SATISFIED with statusForAmount present",
      actual: `hasStatusForAmount=${hasFloor} tipStatus=${tipStatus} tip=${tip}`,
      pass: !falseFav,
      outcomeClass: falseFav ? "INCORRECT_FAVORABLE" : "CORRECT_PROHIBITION",
      severity: falseFav ? "CRITICAL_FALSE_PERMISSION" : "NONE",
      releaseBlocking: falseFav,
      uniqueGroundedScenario: true,
      rootCause: falseFav
        ? "PR #243 is ~25 commits behind main; capacity/types lack NOT_SATISFIED and statusForAmount floor — bare statusFromEvaluation maps EXECUTABLE→AVAILABLE"
        : undefined,
      regressionRecommendation: "Block merge of #243 until rebased; a8-gate-status-regression + probe-gate-status must pass on tip",
      fixRecommendation:
        "Rebase #243 onto main ≥7f1dd3a2; keep lib/contract-model/runtime/capacity/{state,types}.ts identical to main for A8 semantics; re-apply only sequential verification pool identity edits atop the floor",
    });
  } else {
    record({
      id: "CONT-06-pending-pr243-reintroduces-a8-01",
      title: "Pending PR #243 tip probe skipped (worktree missing)",
      source: "Set A8_TIP_243 or prepare /tmp/a8-wt-243",
      expected: "Worktree available for independent tip challenge",
      actual: `missing ${stateFile}`,
      pass: false,
      outcomeClass: "OBSERVATION",
      severity: "OBSERVATION",
      releaseBlocking: false,
      uniqueGroundedScenario: true,
    });
  }
}

// --- Mutation detection ---
{
  const r = spawnSync("npx", ["tsx", "scripts/agent8-independent-adversarial/mutation-challenge.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120_000,
  });
  let detected = false;
  try {
    const j = JSON.parse(r.stdout || "{}") as { detection?: { detected?: boolean } };
    detected = Boolean(j.detection?.detected);
  } catch {
    detected = false;
  }
  record({
    id: "CONT-07-mutation-detects-a8-01-regression",
    title: "Isolated mutation removing statusForAmount floor is detected as AVAILABLE",
    source: "Agent 8 mutation challenge (temp tree only; production untouched)",
    expected: "detection.detected=true; exit 0",
    actual: `exit=${r.status} detected=${detected} stdoutHead=${(r.stdout || "").slice(0, 200)}`,
    pass: detected && r.status === 0,
    outcomeClass: detected ? "CORRECT_PROHIBITION" : "INCORRECT_REFUSAL",
    severity: detected ? "NONE" : "MATERIAL_CONDITION",
    releaseBlocking: !detected,
    uniqueGroundedScenario: true,
  });
}

const buckets: Record<string, number> = {};
for (const c of cases) buckets[c.outcomeClass] = (buckets[c.outcomeClass] ?? 0) + 1;
const falseFavorable = cases.filter((c) => c.outcomeClass === "INCORRECT_FAVORABLE").length;
const falseRefusal = cases.filter((c) => c.outcomeClass === "INCORRECT_REFUSAL").length;
const releaseBlocking = cases.filter((c) => c.releaseBlocking);
const unique = cases.filter((c) => c.uniqueGroundedScenario);

const outDir = path.resolve("docs/agent8-independent-adversarial");
fs.mkdirSync(outDir, { recursive: true });
const artifact = {
  schemaVersion: "agent8-adversarial-continuation.v1",
  generatedAt: new Date().toISOString(),
  shaTested: sha,
  pendingIntegrationTracked: [
    { pr: 243, role: "certified sequential execution", risk: "A8-01 reintroduction if merged without rebase" },
    { pr: 213, role: "Position / Simulate / Ask unify", risk: "must consume main utilization + capacity status contracts" },
  ],
  summary: {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    falseFavorable,
    falseRefusal,
    materialOmissions: cases.filter((c) => c.severity === "MATERIAL_CONDITION" || c.severity === "MATERIAL_OVERSTATEMENT").length,
    releaseBlockingCount: releaseBlocking.length,
    uniqueGroundedScenarios: unique.length,
    outcomeBuckets: buckets,
    mutationDetectionRate: cases.find((c) => c.id === "CONT-07-mutation-detects-a8-01-regression")?.pass ? 1 : 0,
  },
  cases,
  releaseBlocking,
};

fs.writeFileSync(path.join(outDir, "08-continuation-results.json"), JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ sha, summary: artifact.summary, releaseBlocking: releaseBlocking.map((c) => c.id) }, null, 2));
// Main-integrated cases must pass. CONT-06 documents an open pending-PR defect (expected fail until #243 rebases).
const mainFailed = cases.filter((c) => c.id !== "CONT-06-pending-pr243-reintroduces-a8-01" && !c.pass);
process.exit(mainFailed.length > 0 ? 1 : 0);
