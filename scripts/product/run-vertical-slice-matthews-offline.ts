/**
 * Vertical-slice covenant intelligence proof (offline).
 *
 * Replays Matthews authentic matrix cases through evaluateProvision with
 * source financial inputs. Neon is not required and must not be written.
 * Production remaining publication stays fail-closed without completeness + IdP.
 *
 * Usage: npx tsx scripts/product/run-vertical-slice-matthews-offline.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  computeLeverageMetrics,
  evaluateProvision,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
  type FormulaType,
} from "@/lib/covenant-engine";
import { assertProductCapacityConsistency, buildSharedProductCapacityViews } from "@/lib/capacity";
import { buildPositionView } from "@/lib/customer-workflow/position-view";
import type { CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import type { RulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";

type MatrixCase = {
  caseId: string;
  companyId: string;
  section: string;
  code: string;
  formulaType: FormulaType;
  formulaNarrative: string;
  authenticity: string;
  financialInputs: Record<string, number | null | undefined>;
  utilization: { attributed: boolean; note: string; ledgerBasketRows: number };
  independentExpected: { status: string; capacityMillions: number | null };
  engineResult: {
    status: string;
    capacityMillions: number | null;
    unlimited?: boolean;
    reason?: string | null;
  };
  outcomeClass: string;
  thresholdValue?: number;
  params?: CovenantProvisionInput["params"];
  verificationStatus?: string;
};

function gitHead(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function toFin(inputs: MatrixCase["financialInputs"]): FinancialSnapshotInput {
  return {
    ebitda: inputs.ebitda ?? null,
    cash: inputs.cash ?? null,
    interestExpense: inputs.interestExpense ?? null,
    cumulativeNetIncome: inputs.cumulativeNetIncome ?? null,
    equityProceedsSinceIssue: inputs.equityProceedsSinceIssue ?? null,
    assumedNewDebtRatePct: inputs.assumedNewDebtRatePct ?? null,
    totalDebt: inputs.totalDebt ?? null,
    securedDebt: inputs.securedDebt ?? null,
  };
}

/**
 * Threshold/params from scripts/populate-matthews-solver-native.ts (source-cited
 * Indenture modeling). Matrix JSON stores results but not full provision params.
 */
const MATTHEWS_PROVISION_SPEC: Record<
  string,
  { thresholdValue: number; params?: CovenantProvisionInput["params"]; sectionRef: string; basketName: string }
> = {
  ind_ratio_debt_fccr: {
    thresholdValue: 2.0,
    sectionRef: "§4.09(a)",
    basketName: "Ratio Debt FCCR",
  },
  ind_permitted_debt_1a_flat: {
    thresholdValue: 1300,
    params: { netOfBasis: "secured" },
    sectionRef: "Permitted Debt def., cl. (1)(a)",
    basketName: "Debt Facilities flat",
  },
  ind_permitted_debt_1b_ratio_secured: {
    thresholdValue: 3.5,
    params: { debtBasis: "secured" },
    sectionRef: "Permitted Debt def., cl. (1)(b)(x)",
    basketName: "Debt Facilities ratio secured",
  },
  ind_permitted_debt_2_notes: {
    thresholdValue: 300,
    sectionRef: "Permitted Debt def., cl. (2)",
    basketName: "Notes grandfather",
  },
  ind_lien_permitted_cl2_creditfacility: {
    thresholdValue: 0,
    params: { automaticLinkOnly: true },
    sectionRef: "§4.10 / Permitted Liens def., cl. (2)",
    basketName: "Credit Facility first-priority lien (linked)",
  },
  ind_lien_second_priority_notes: {
    thresholdValue: 0,
    sectionRef: "Notes second-priority lien (linked)",
    basketName: "Notes second-priority lien (linked)",
  },
  "ca_lien_601j_2024notes": {
    thresholdValue: 0,
    sectionRef: "CA §6.01(j)",
    basketName: "CA 2024 Notes lien (linked)",
  },
  "matw-scc-nonguarantor-ratiodebt": {
    thresholdValue: 125,
    sectionRef: "§4.09(a) Non-Guarantor sub-cap (flat floor)",
    basketName: "Non-Guarantor Ratio Debt sub-cap",
  },
};

function capacityOf(engine: { capacity?: number; capacityMillions?: number }): number | null {
  if (typeof engine.capacityMillions === "number") return engine.capacityMillions;
  if (typeof engine.capacity === "number") return engine.capacity;
  return null;
}

function main() {
  const matrix = JSON.parse(
    readFileSync("docs/covenant-capacity-mathematics/02-authentic-execution-matrix.json", "utf8"),
  ) as { cases: MatrixCase[]; summary: Record<string, unknown> };
  const finSlice = JSON.parse(
    readFileSync("tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json", "utf8"),
  ) as { asOf: string; completenessLimitations: string[] };

  const matthews = matrix.cases.filter((c) => c.companyId === "matthews");
  const results = matthews.map((c) => {
    const fin = toFin(c.financialInputs);
    const metrics = computeLeverageMetrics(fin);
    const spec = MATTHEWS_PROVISION_SPEC[c.code];
    const provision: CovenantProvisionInput = {
      id: c.caseId,
      documentId: "matthews-indenture-offline",
      code: c.code,
      basketName: spec?.basketName ?? c.section,
      sectionRef: spec?.sectionRef ?? c.section,
      formulaType: c.formulaType,
      thresholdValue: Number(c.thresholdValue ?? spec?.thresholdValue ?? 0),
      params: c.params ?? spec?.params ?? null,
    };

    let offlineEngine: {
      status: string;
      capacity: number | null;
      unlimited?: boolean;
      reason?: string | null;
    } | null = null;
    let offlineError: string | null = null;
    try {
      const engine = evaluateProvision(provision, fin, metrics);
      offlineEngine = {
        status: engine.status,
        capacity: capacityOf(engine),
        unlimited: engine.unlimited,
        reason: engine.reason ?? null,
      };
    } catch (e) {
      offlineError = e instanceof Error ? e.message : String(e);
    }

    const matrixCap = c.engineResult.capacityMillions;
    const offlineCap = offlineEngine?.capacity ?? null;
    const replayMatch =
      c.outcomeClass === "EXECUTABLE_CORRECT" &&
      offlineCap != null &&
      matrixCap != null &&
      Math.abs(offlineCap - matrixCap) < 1e-6;

    return {
      caseId: c.caseId,
      section: c.section,
      formulaType: c.formulaType,
      formulaNarrative: c.formulaNarrative,
      authenticity: c.authenticity,
      financialInputs: c.financialInputs,
      utilization: c.utilization,
      provisionSpecSource: spec
        ? "scripts/populate-matthews-solver-native.ts"
        : "matrix-only (spec missing)",
      thresholdValueUsed: provision.thresholdValue,
      paramsUsed: provision.params,
      matrixOutcome: c.outcomeClass,
      matrixVerificationStatus: c.verificationStatus ?? null,
      matrixEngine: c.engineResult,
      independentExpected: c.independentExpected,
      offlineEngine,
      offlineError,
      offlineReplayMatchesMatrix: replayMatch,
      offlineReplayStatus:
        offlineError != null
          ? "ERROR"
          : c.outcomeClass !== "EXECUTABLE_CORRECT"
            ? "REFUSAL_CASE"
            : !spec
              ? "BLOCKED_MISSING_PROVISION_PARAMS"
              : replayMatch
                ? "MATCH"
                : "MISMATCH",
      publicationAuthority: {
        remainingClaimAllowed: false,
        reason:
          "No attributed utilization completeness certificate; TRUSTED_IDENTITY_PRODUCTION_ACTIVATION BLOCKED",
        completenessLimitations: finSlice.completenessLimitations,
      },
    };
  });

  const executable = results.filter((r) => r.matrixOutcome === "EXECUTABLE_CORRECT");
  const replayMatched = results.filter((r) => r.offlineReplayStatus === "MATCH");

  // Recalculation: prefer a case that offline-replays; else report blocked.
  let recalculation: Record<string, unknown> | null = null;
  const demo = results.find((r) => r.offlineReplayStatus === "MATCH") ?? executable[0];
  if (demo) {
    const src = matthews.find((c) => c.caseId === demo.caseId)!;
    const spec = MATTHEWS_PROVISION_SPEC[src.code];
    const fin0 = toFin(src.financialInputs);
    const fin1 = { ...fin0, ebitda: (fin0.ebitda ?? 0) * 1.1 };
    const p: CovenantProvisionInput = {
      id: src.caseId,
      documentId: "matthews-indenture-offline",
      code: src.code,
      basketName: spec?.basketName ?? src.section,
      sectionRef: spec?.sectionRef ?? src.section,
      formulaType: src.formulaType,
      thresholdValue: Number(src.thresholdValue ?? spec?.thresholdValue ?? 0),
      params: src.params ?? spec?.params ?? null,
    };
    try {
      const before = evaluateProvision(p, fin0, computeLeverageMetrics(fin0));
      const after = evaluateProvision(p, fin1, computeLeverageMetrics(fin1));
      recalculation = {
        caseId: src.caseId,
        change: "EBITDA +10%",
        ebitdaBefore: fin0.ebitda,
        ebitdaAfter: fin1.ebitda,
        capacityBefore: capacityOf(before),
        capacityAfter: capacityOf(after),
        statusBefore: before.status,
        statusAfter: after.status,
        deltaCapacity: (capacityOf(after) ?? 0) - (capacityOf(before) ?? 0),
        note: "Offline recalculation via evaluateProvision + populate-matthews thresholds",
      };
    } catch (e) {
      recalculation = {
        caseId: src.caseId,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const views = buildSharedProductCapacityViews({
    gross: {
      amount: 200_000_000,
      gateSatisfied: true,
      modeled: true,
      capacityRuleId: "matthews-demo-basket",
    },
    utilization: {
      capacityRuleId: "matthews-demo-basket",
      asOf: finSlice.asOf,
      records: [],
    },
  });

  const readiness = {
    status: "NEEDS_INPUT",
    capacityAuthority: "NOT_PRODUCTION_AUTHORITATIVE",
    canEvaluateExecutableCapacity: false,
    hasFinancialSnapshot: true,
    ns4ApprovedSnapshotCount: 0,
    approvedNorthStarSnapshotCount: 0,
    contractLedgerActiveCount: 0,
    unverifiedPermissionCount: 0,
    blockers: [
      "No NS-4 APPROVED financial snapshot in this offline vertical slice",
      "No active attributed utilization ledger rows",
      "Production trusted-identity activation BLOCKED",
    ],
    headline: "Offline vertical slice — gross may model; remaining refused",
  } as unknown as CapacityReadiness;

  const rulebook = {
    stage: "REVIEW_REQUIRED",
    blockers: ["Offline slice — live rulebook not loaded (Neon unreachable)"],
  } as unknown as RulebookReadiness;

  const position = buildPositionView({
    companyId: "matthews",
    dashboard: null,
    readiness,
    rulebook,
    dashboardError: "Neon unreachable — live dashboard not loaded this run",
  });

  const report = {
    schema: "vertical-slice-covenant-intelligence.v1",
    tipSha: gitHead(),
    mainShaAtRun: "4f1a0b81207364373d9a4cb9fe515d4a1a002e56",
    neonReachable: false,
    paidInferenceUsd: 0,
    productionNeonWrites: false,
    package: {
      companyId: "matthews",
      financialEvidence: "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
      legalSource:
        "Matthews Indenture provisions via prior VERIFIED_POPULATION authentic-execution matrix",
      matrixSource: "docs/covenant-capacity-mathematics/02-authentic-execution-matrix.json",
    },
    counts: {
      authenticCovenantsCompiledThisRun: matthews.length,
      matrixExecutableCorrect: executable.length,
      matrixCorrectRefusal: results.filter((r) => r.matrixOutcome === "CORRECT_REFUSAL").length,
      sourceVerifiedNumericalCapacityResults: executable.filter(
        (r) => r.matrixVerificationStatus === "MATCH" || r.matrixOutcome === "EXECUTABLE_CORRECT",
      ).length,
      offlineReplayExactMatches: replayMatched.length,
      realDashboardMetricsPopulatedThisRun: 0,
      targetFiveDistinctCalculations: 5,
      distinctFormulaTypesExecutable: [...new Set(executable.map((r) => r.formulaType))],
      corpusWidePriorMatrixExecutableCorrect: matrix.summary.independentlyCorrectExecutableResults ?? null,
    },
    cases: results,
    recalculation,
    hypotheticalTransaction: {
      note: "Shared Position/Simulate/Ask views refuse remaining without production completeness",
      consistency: assertProductCapacityConsistency(views),
      surfaces: Object.fromEntries(
        (["POSITION", "SIMULATE", "ASK"] as const).map((k) => [
          k,
          {
            supportedRemainingCapacity: views[k].supportedRemainingCapacity,
            mayPublishAvailable: views[k].mayPublishAvailable,
            publicationLabel: views[k].publicationLabel,
            blockers: views[k].blockers.slice(0, 4),
          },
        ]),
      ),
    },
    positionView: {
      overallStatus: position.overallStatus,
      missingInputs: position.missingInputs,
      reviewBlockers: position.reviewBlockers,
      remainingAuthoritative: position.remainingAuthoritative,
      instrumentsLoaded: position.instruments.length,
    },
    missingEvidence: {
      legal: [
        "Live Neon Permission rows unreachable — matrix stores results but not full threshold/params for offline reconstruct",
        "First-lien-specific 2.50x test unmodeled (onboarding §F.1)",
      ],
      financial: finSlice.completenessLimitations,
      utilization: [
        "No attributed utilization to Permission/Provision ids",
        "No VERIFIED_COMPLETE completeness certificate",
        "Point-in-time debt ≠ full historical ledger",
      ],
    },
    topBlockersToCustomerReadyDashboard: [
      "Live DB path for company rulebook + dashboard (Neon unreachable here; disposable Postgres for tests only)",
      "Utilization completeness + trusted issuer before AVAILABLE remaining",
      "NS-4 approved financials + operative authority for production-authoritative Position metrics",
    ],
    nextImplementationPr: {
      title: "Vertical slice: wire Matthews offline proof → Position missing-dependency UX",
      scope: [
        "Export matrix threshold/params alongside results for offline replay",
        "Wire Position to show exact missing deps from buildPositionView (already partial)",
        "Disposable-Postgres fixture company for local dashboard proof without Neon",
      ],
    },
  };

  const outDir = resolve("docs/product/vertical-slice");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "01-matthews-offline-proof.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(outDir, "00-mission-report.md"),
    `# Vertical-slice covenant intelligence (offline)

**Tip:** \`${report.tipSha}\`  
**Main at run:** \`${report.mainShaAtRun}\`  
**Neon reachable:** ${report.neonReachable}  
**Paid inference:** $0 · **Neon writes:** none

## Counts

| Metric | Value |
|---|---|
| Authentic Matthews covenants in matrix | ${report.counts.authenticCovenantsCompiledThisRun} |
| Matrix EXECUTABLE_CORRECT | ${report.counts.matrixExecutableCorrect} |
| Source-verified numerical results (matrix MATCH/executable) | ${report.counts.sourceVerifiedNumericalCapacityResults} |
| Offline exact replay matches | ${report.counts.offlineReplayExactMatches} |
| Real dashboard metrics populated this run | ${report.counts.realDashboardMetricsPopulatedThisRun} |
| Distinct executable formula types | ${report.counts.distinctFormulaTypesExecutable.join(", ") || "(none)"} |
| Prior corpus-wide EXECUTABLE_CORRECT (matrix summary) | ${report.counts.corpusWidePriorMatrixExecutableCorrect} |

## Hypothesis / recalculation

See \`01-matthews-offline-proof.json\` (\`recalculation\`, \`hypotheticalTransaction\`, \`positionView\`).

## Verdict components

- Not \`DASHBOARD_VERTICAL_SLICE_PROVEN\` — live Position not populated (Neon down; remaining refused).
- Partial offline proof of authentic numerical cases from prior verified matrix + fail-closed publication.
`,
  );

  console.log(JSON.stringify(report.counts, null, 2));
  console.log("recalculation", report.recalculation);
  console.log("position.missingInputs", position.missingInputs);
  console.log("wrote docs/product/vertical-slice/");
}

main();
