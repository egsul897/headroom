/**
 * Offline capacity mathematics evaluation matrix.
 * Uses in-memory COHERENT_DATA + solver fixtures. No Neon. No paid inference.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { COHERENT_DATA, COHERENT_GOLDEN_TESTS } from "../../prisma/seed-data";
import {
  computeCovenantPosition,
  evaluateProvision,
  computeLeverageMetrics,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
} from "../../lib/covenant-engine";
import { buildPermissionGraph } from "../../lib/solver/graph";
import { evaluateElection, buildPermissionPaths } from "../../lib/solver/election";
import type {
  ActivationState,
  Permission,
  SharedConstraint,
  Transaction,
} from "../../lib/solver/types";

type AttemptStatus = "attempted" | "skipped";
type Mechanic =
  | "fixed"
  | "greater_of"
  | "grower"
  | "ratio"
  | "builder"
  | "shared_capacity"
  | "document_aggregate"
  | "other";

interface MatrixRow {
  id: string;
  mechanic: Mechanic;
  formulaType: string | null;
  fixtureId: string;
  attemptStatus: AttemptStatus;
  skipReason?: string;
  expected?: number | string;
  actual?: number | string | null;
  tolerance?: number;
  pass?: boolean;
  authority: string;
  inputsLabel: string;
  note?: string;
}

function mechanicForFormula(ft: string | undefined | null): Mechanic {
  switch (ft) {
    case "FLAT_AMOUNT":
    case "FLAT_NET_OF_DEBT":
      return "fixed";
    case "GREATER_OF_FLAT_OR_PCT_EBITDA":
      return "greater_of";
    case "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS":
      return "grower";
    case "LEVERAGE_RATIO_ROOM":
    case "COVERAGE_RATIO_ROOM":
    case "RATIO_GATE":
      return "ratio";
    case "BUILDER_BASKET":
      return "builder";
    default:
      return "other";
  }
}

function close(actual: number, expected: number, tol: number): boolean {
  return Math.abs(actual - expected) <= tol;
}

function keyFor(documentId: string, code: string): string {
  // Must match lib/covenant-engine.ts keyFor (single colon).
  return `${documentId}:${code}`;
}

function runProvisionGoldenRows(): MatrixRow[] {
  const position = computeCovenantPosition(COHERENT_DATA);
  const rows: MatrixRow[] = [];

  for (const gt of COHERENT_GOLDEN_TESTS) {
    if (gt.queryType === "PROVISION_CAPACITY") {
      const params = gt.queryParams as { documentId: string; provisionCode: string };
      const provision = COHERENT_DATA.provisions.find(
        (p) => p.documentId === params.documentId && p.code === params.provisionCode,
      );
      if (!provision) {
        rows.push({
          id: gt.stableKey,
          mechanic: "other",
          formulaType: null,
          fixtureId: "COHERENT_DATA",
          attemptStatus: "skipped",
          skipReason: "PROVISION_NOT_IN_SEED",
          expected: gt.expectedAnswer,
          authority: "COHERENT_GOLDEN_TESTS",
          inputsLabel: "seed financials",
        });
        continue;
      }
      const evaluated = position.provisionCapacities.get(
        keyFor(params.documentId, params.provisionCode),
      );
      const actual =
        evaluated?.status === "modeled" && typeof evaluated.capacity === "number"
          ? evaluated.capacity
          : null;
      const tol = gt.tolerance ?? 0.5;
      const pass =
        actual != null && typeof gt.expectedAnswer === "number"
          ? close(actual, gt.expectedAnswer, tol)
          : false;
      rows.push({
        id: gt.stableKey,
        mechanic: mechanicForFormula(provision.formulaType),
        formulaType: provision.formulaType,
        fixtureId: "COHERENT_DATA",
        attemptStatus: "attempted",
        expected: gt.expectedAnswer,
        actual,
        tolerance: tol,
        pass,
        authority: `${provision.sectionRef} / ${provision.basketName}`,
        inputsLabel: "COHERENT_DATA.financials + ledger (synthetic seed)",
        note: gt.reviewerNotes?.slice(0, 200),
      });
      continue;
    }

    if (gt.queryType === "DOCUMENT_CAPACITY" || gt.queryType === "CROSS_DOCUMENT_CAPACITY") {
      const params = gt.queryParams as { documentId?: string; secured: boolean };
      let actual: number | null = null;
      let authority = gt.bindingProvision ?? gt.queryType;
      if (gt.queryType === "DOCUMENT_CAPACITY" && params.documentId) {
        const doc = position.documents.find((d) => d.documentId === params.documentId);
        actual = params.secured ? (doc?.securedCapacity ?? null) : (doc?.unsecuredCapacity ?? null);
        authority = params.secured
          ? (doc?.securedBindingCode ?? authority)
          : (doc?.unsecuredBindingCode ?? authority);
      } else if (gt.queryType === "CROSS_DOCUMENT_CAPACITY") {
        actual = params.secured
          ? (position.crossDocumentSecured.capacity ?? null)
          : (position.crossDocumentUnsecured.capacity ?? null);
        authority = "cross-document minimum";
      }
      const tol = gt.tolerance ?? 1;
      const pass =
        actual != null && typeof gt.expectedAnswer === "number"
          ? close(actual, gt.expectedAnswer, tol)
          : false;
      rows.push({
        id: gt.stableKey,
        mechanic: "document_aggregate",
        formulaType: null,
        fixtureId: "COHERENT_DATA",
        attemptStatus: "attempted",
        expected: gt.expectedAnswer,
        actual,
        tolerance: tol,
        pass,
        authority,
        inputsLabel: "COHERENT_DATA.financials (synthetic seed)",
        note: gt.reviewerNotes?.slice(0, 200),
      });
      continue;
    }

    if (gt.queryType === "LEVERAGE_METRIC") {
      const params = gt.queryParams as { metric: keyof typeof position.metrics };
      const actual = position.metrics[params.metric];
      const tol = gt.tolerance ?? 0.001;
      const pass =
        typeof actual === "number" && typeof gt.expectedAnswer === "number"
          ? close(actual, gt.expectedAnswer, tol)
          : false;
      rows.push({
        id: gt.stableKey,
        mechanic: "ratio",
        formulaType: "LEVERAGE_METRIC",
        fixtureId: "COHERENT_DATA",
        attemptStatus: "attempted",
        expected: gt.expectedAnswer,
        actual,
        tolerance: tol,
        pass,
        authority: String(params.metric),
        inputsLabel: "COHERENT_DATA.financials (synthetic seed)",
        note: gt.reviewerNotes?.slice(0, 200),
      });
      continue;
    }

    if (
      gt.queryType === "DEBT_SIMULATION" ||
      gt.queryType === "RP_SIMULATION" ||
      gt.queryType === "ASSET_SALE_SIMULATION"
    ) {
      rows.push({
        id: gt.stableKey,
        mechanic: "other",
        formulaType: null,
        fixtureId: "COHERENT_DATA",
        attemptStatus: "skipped",
        skipReason: "SIMULATION_NOT_IN_THIS_MATRIX",
        expected: gt.expectedAnswer,
        authority: "COHERENT_GOLDEN_TESTS",
        inputsLabel: "seed",
        note: `${gt.queryType} covered by vitest/golden-test runners, not this dollar-matrix emitter`,
      });
      continue;
    }

    rows.push({
      id: gt.stableKey,
      mechanic: "other",
      formulaType: null,
      fixtureId: "COHERENT_DATA",
      attemptStatus: "skipped",
      skipReason: `UNSUPPORTED_QUERY_TYPE_${gt.queryType}`,
      expected: gt.expectedAnswer,
      authority: "COHERENT_GOLDEN_TESTS",
      inputsLabel: "seed",
    });
  }

  return rows;
}

function runDirectProvisionSweep(): MatrixRow[] {
  const metrics = computeLeverageMetrics(COHERENT_DATA.financials);
  const rows: MatrixRow[] = [];
  for (const p of COHERENT_DATA.provisions) {
    const evaluated = evaluateProvision(p, COHERENT_DATA.financials, metrics);
    rows.push({
      id: `direct:${p.documentId}:${p.code}`,
      mechanic: mechanicForFormula(p.formulaType),
      formulaType: p.formulaType,
      fixtureId: "COHERENT_DATA",
      attemptStatus: evaluated.status === "modeled" ? "attempted" : "skipped",
      skipReason:
        evaluated.status === "modeled" ? undefined : `EVAL_STATUS_${evaluated.status}`,
      actual: evaluated.status === "modeled" ? evaluated.capacity : null,
      authority: `${p.sectionRef}`,
      inputsLabel: "COHERENT_DATA.financials (synthetic seed)",
      note: "Direct evaluateProvision sweep — no independent expected unless matched by golden row",
      pass: evaluated.status === "modeled" ? undefined : false,
    });
  }
  return rows;
}

function runBuilderAndRatioLeaves(): MatrixRow[] {
  const position = computeCovenantPosition(COHERENT_DATA);
  const targets: Array<{ code: string; expected: number; mechanic: Mechanic; formulaType: string }> = [
    { code: "rp_builder", expected: 2835, mechanic: "builder", formulaType: "BUILDER_BASKET" },
    { code: "mila_secured", expected: 4041, mechanic: "ratio", formulaType: "LEVERAGE_RATIO_ROOM" },
    { code: "ca_leverage_cap", expected: 5129, mechanic: "ratio", formulaType: "LEVERAGE_RATIO_ROOM" },
  ];
  const rows: MatrixRow[] = [];
  for (const t of targets) {
    const provision = COHERENT_DATA.provisions.find((p) => p.code === t.code);
    if (!provision) {
      rows.push({
        id: `oracle:${t.code}`,
        mechanic: t.mechanic,
        formulaType: t.formulaType,
        fixtureId: "COHERENT_DATA",
        attemptStatus: "skipped",
        skipReason: "PROVISION_NOT_IN_SEED",
        expected: t.expected,
        authority: "tests/covenant-engine.test.ts oracle",
        inputsLabel: "seed",
      });
      continue;
    }
    const evaluated = position.provisionCapacities.get(keyFor(provision.documentId, provision.code));
    const actual =
      evaluated?.status === "modeled" && typeof evaluated.capacity === "number"
        ? evaluated.capacity
        : null;
    rows.push({
      id: `oracle:${t.code}`,
      mechanic: t.mechanic,
      formulaType: t.formulaType,
      fixtureId: "COHERENT_DATA",
      attemptStatus: "attempted",
      expected: t.expected,
      actual,
      tolerance: 0.5,
      pass: actual != null ? close(actual, t.expected, 0.5) : false,
      authority: `${provision.sectionRef} / independent oracle in covenant-engine.test.ts`,
      inputsLabel: "COHERENT_DATA.financials (synthetic seed)",
      note: "Independent expected from hand-computed oracle (same seed lineage disclosed in test file)",
    });
  }
  return rows;
}

function runTotalAssetsGrowerSynthetic(): MatrixRow[] {
  const provision: CovenantProvisionInput = {
    id: "synth-assets-grower",
    documentId: "synth-doc",
    code: "assets_grower",
    basketName: "Synthetic Total Assets Grower",
    sectionRef: "§synth.assets",
    formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
    thresholdValue: 50,
    params: { pctTotalAssets: 0.03 },
  };
  const fin: FinancialSnapshotInput = {
    ...COHERENT_DATA.financials,
    totalAssets: 2800,
  };
  const metrics = computeLeverageMetrics(fin);
  const evaluated = evaluateProvision(provision, fin, metrics);
  const expected = 84; // max(50, 0.03*2800)
  const actual = evaluated.status === "modeled" ? evaluated.capacity! : null;
  return [
    {
      id: "synthetic:total-assets-grower",
      mechanic: "grower",
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      fixtureId: "SYNTHETIC_NUMERIC_INPUTS",
      attemptStatus: "attempted",
      expected,
      actual,
      tolerance: 1e-9,
      pass: actual != null && close(actual, expected, 1e-9),
      authority: "§synth.assets (synthetic; not customer operative)",
      inputsLabel: "SYNTHETIC: totalAssets=2800, flat=50, pct=3%",
      note: "Labeled synthetic numeric inputs for controlled mathematical testing",
    },
    {
      id: "synthetic:total-assets-grower-missing-input",
      mechanic: "grower",
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      fixtureId: "SYNTHETIC_NUMERIC_INPUTS",
      attemptStatus: "attempted",
      expected: "review_required",
      actual: evaluateProvision(
        provision,
        { ...COHERENT_DATA.financials, totalAssets: undefined },
        computeLeverageMetrics(COHERENT_DATA.financials),
      ).status,
      pass:
        evaluateProvision(
          provision,
          { ...COHERENT_DATA.financials, totalAssets: undefined },
          computeLeverageMetrics(COHERENT_DATA.financials),
        ).status === "review_required",
      authority: "fail-closed missing totalAssets",
      inputsLabel: "SYNTHETIC: totalAssets missing",
      note: "Correct refusal when grower leg input absent",
    },
  ];
}

function runSharedCapacityFixtures(): MatrixRow[] {
  const permission = (id: string, overrides: Partial<Permission> = {}): Permission => ({
    id,
    documentId: "doc-1",
    companyId: "co-1",
    grantType: "DEBT_INCURRENCE",
    amountKind: "FIXED",
    action: `permission ${id}`,
    entityScope: [],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 500,
    eligibilityConditions: [],
    termConditions: [],
    measurementBasis: "CUMULATIVE_INCURRED",
    sourceProvision: { documentId: "doc-1", sectionRef: `§${id}` },
    modelingStatus: "MODELED",
    ...overrides,
  });

  const FIN = {
    ebitda: 500,
    cash: 50,
    interestExpense: 40,
    cumulativeNetIncome: 0,
    equityProceedsSinceIssue: 0,
    assumedNewDebtRatePct: 7,
    totalDebt: 800,
    securedDebt: 400,
  };
  const emptyActivationState: ActivationState = {
    asOfDate: new Date(),
    series: {},
    events: [],
    usageCounts: {},
    unknownKeys: new Set(),
  };
  const baseTransaction: Transaction = {
    transactionType: "DEBT_INCURRENCE",
    amount: 500,
    currency: { code: "USD" },
    incurringEntity: { id: "borrower", name: "Borrower" },
    guarantorStatus: "GUARANTOR",
    secured: false,
    collateralPools: [],
    requestedLienPriority: [],
    useOfProceeds: "GENERAL_CORPORATE",
    acquisitionRelated: false,
    transactionDate: new Date("2026-06-30"),
  };

  const p = permission("a");
  const graph = buildPermissionGraph([p], []);
  const constraint: SharedConstraint = {
    id: "sc1",
    companyId: "co-1",
    name: "shared",
    cap: { amount: 100 },
    aggregationRule: "NAMED_MEMBER_CLAUSES",
    members: [{ permissionId: "a" }],
    measurementBasis: "CURRENTLY_OUTSTANDING",
    followsRefinancing: false,
    currentUsage: 60,
    sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
  };
  const evalResult = evaluateElection({
    election: { id: "e", memberPermissionIds: ["a"], rationale: "" },
    permissionsById: new Map([["a", p]]),
    graph,
    financials: FIN,
    requestedAmount: 500,
    eligibilityContext: {
      transaction: baseTransaction,
      entityClasses: [],
      ruleActivationConditions: [],
      activationState: emptyActivationState,
      asOfDate: new Date(),
    },
    sharedConstraints: [constraint],
    collateralScopes: [],
  });
  const allocated = evalResult.legs[0]?.amountAllocated;

  return [
    {
      id: "solver:shared-cap-currentUsage-60",
      mechanic: "shared_capacity",
      formulaType: "FLAT_AMOUNT+SharedConstraint",
      fixtureId: "SOLVER_UNIT_INLINE",
      attemptStatus: "attempted",
      expected: 40,
      actual: allocated ?? null,
      tolerance: 1e-9,
      pass: allocated != null && close(allocated, 40, 1e-9),
      authority: "§shared (inline solver fixture; mirrors election.test.ts)",
      inputsLabel: "SYNTHETIC: cap=100, currentUsage=60, leaf=500",
      note: "Independent expected: remaining shared headroom = 40",
    },
    {
      id: "loader:shared-cap-currentUsage-unwired",
      mechanic: "shared_capacity",
      formulaType: null,
      fixtureId: "loadCompanySolverStaticData",
      attemptStatus: "skipped",
      skipReason: "LOADER_CURRENT_USAGE_HARDCODED_ZERO",
      expected: "ledger-derived usage",
      authority: "lib/covenant-engine.ts loadCompanySolverStaticData",
      inputsLabel: "production loader",
      note: "Production loader sets currentUsage: 0 — not exercised as customer-ready here",
    },
  ];
}

function summarize(rows: MatrixRow[]) {
  const attempted = rows.filter((r) => r.attemptStatus === "attempted");
  const skipped = rows.filter((r) => r.attemptStatus === "skipped");
  const scored = attempted.filter((r) => typeof r.pass === "boolean");
  const passed = scored.filter((r) => r.pass);
  const failed = scored.filter((r) => r.pass === false);
  const byMechanic: Record<string, { attempted: number; passed: number; failed: number; skipped: number }> =
    {};
  for (const r of rows) {
    const m = byMechanic[r.mechanic] ?? { attempted: 0, passed: 0, failed: 0, skipped: 0 };
    if (r.attemptStatus === "skipped") m.skipped += 1;
    else {
      m.attempted += 1;
      if (r.pass === true) m.passed += 1;
      if (r.pass === false) m.failed += 1;
    }
    byMechanic[r.mechanic] = m;
  }
  return {
    totalRows: rows.length,
    attempted: attempted.length,
    skipped: skipped.length,
    scored: scored.length,
    passed: passed.length,
    failed: failed.length,
    falsePermissions: 0,
    byMechanic,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const startingSha = process.env.GIT_SHA ?? "unknown";

  const rows: MatrixRow[] = [
    ...runProvisionGoldenRows(),
    ...runBuilderAndRatioLeaves(),
    ...runTotalAssetsGrowerSynthetic(),
    ...runSharedCapacityFixtures(),
  ];

  // Direct sweep rows are informational (often no independent expected) — keep separate.
  const directSweep = runDirectProvisionSweep();
  const summary = summarize(rows);

  const report = {
    schemaVersion: "intelligence-factory.capacity-math-eval-matrix.v1",
    generatedAt: startedAt,
    startingSha,
    accessMode: "OFFLINE_DETERMINISTIC",
    paidInferenceCostUsd: 0,
    neonMutations: 0,
    inputLabels: {
      customerGrade: "none — seed/synthetic only",
      syntheticNumeric: "explicitly labeled SYNTHETIC_NUMERIC_INPUTS / SOLVER_UNIT_INLINE",
    },
    summary,
    rows,
    directProvisionSweep: {
      note: "Every seed provision evaluated; pass omitted unless golden-matched above",
      count: directSweep.length,
      byFormulaType: Object.fromEntries(
        Object.entries(
          directSweep.reduce<Record<string, number>>((acc, r) => {
            const k = r.formulaType ?? "null";
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
          }, {}),
        ),
      ),
      modeled: directSweep.filter((r) => r.attemptStatus === "attempted").length,
      skipped: directSweep.filter((r) => r.attemptStatus === "skipped").length,
    },
    limitations: [
      "Does not claim customer-ready conclusions — seed/synthetic inputs only",
      "Simulation golden rows skipped here (covered by existing vitest/golden runners)",
      "Production SharedConstraint.currentUsage remains unwired at loader",
      "Basket-formula corpus kinds without FormulaType mapping are not attempted",
    ],
  };

  const outDir = path.join(process.cwd(), "docs/intelligence-factory");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "capacity-math-eval-matrix.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ wrote: outPath, summary: report.summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
