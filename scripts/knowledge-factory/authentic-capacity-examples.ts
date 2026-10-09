/**
 * Authentic-agreement calculation examples with independently established
 * expected formulas (development population only — not Gibraltar holdout).
 *
 * Path: fixture operative text → independent formula parse → labeled finance
 * → evaluateProvision. Numerical capacity ≠ legal permission.
 *
 *   npx tsx scripts/knowledge-factory/authentic-capacity-examples.ts
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  independentFormulaFromOperative,
} from "../../lib/knowledge-factory/activation/independent-audit";
import {
  computeLeverageMetrics,
  evaluateProvision,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
} from "../../lib/covenant-engine";

interface AuthenticExampleSpec {
  exampleId: string;
  packageId: string;
  sourcePath: string;
  /** Unique substring locating one operative basket inside multi-basket sections. */
  operativeAnchor: string;
  windowPadBefore: number;
  windowPadAfter: number;
  sectionRef: string;
  expectedFormulaType: string;
  expectedThresholdMillions: number;
  expectedPct?: number;
  expectedPctParam?: "pctEbitda" | "pctTotalAssets";
  financials: FinancialSnapshotInput;
  expectedCapacityMillions: number;
  notes: string;
}

const EXAMPLES: AuthenticExampleSpec[] = [
  {
    exampleId: "fwrg-6-01-non-loan-party-debt-greater-of",
    packageId: "fwrg-2021-credit-agreement",
    sourcePath:
      "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
    operativeAnchor:
      "Indebtedness of Restricted Subsidiaries that are not Loan Parties; provided that the aggregate outstanding principal amount of such Indebtedness shall not exceed the greater of $30,000,000 and 50% of Consolidated Adjusted EBITDA",
    windowPadBefore: 40,
    windowPadAfter: 220,
    sectionRef: "6.01",
    expectedFormulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    expectedThresholdMillions: 30,
    expectedPct: 0.5,
    expectedPctParam: "pctEbitda",
    financials: {
      ebitda: 100,
      cash: 40,
      interestExpense: 30,
      cumulativeNetIncome: 100,
      equityProceedsSinceIssue: 0,
      assumedNewDebtRatePct: 7,
      totalDebt: 700,
      securedDebt: 400,
      totalAssets: 1500,
    },
    // max(30, 0.50*100) = 50
    expectedCapacityMillions: 50,
    notes: "FWRG development GT — §6.01 non-Loan-Party debt greater-of; capacity under SYNTHETIC labeled inputs.",
  },
  {
    exampleId: "conmed-7-2-assets-grower",
    packageId: "conmed-2025-credit-facility",
    sourcePath:
      "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
    operativeAnchor:
      "greater of (x) $50,000,000 and (y) 3.0% of Consolidated Total Assets (measured on the date of incurrence of such Indebtedness)",
    windowPadBefore: 120,
    windowPadAfter: 80,
    sectionRef: "7.2",
    expectedFormulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
    expectedThresholdMillions: 50,
    expectedPct: 0.03,
    expectedPctParam: "pctTotalAssets",
    financials: {
      ebitda: 420,
      cash: 80,
      interestExpense: 55,
      cumulativeNetIncome: 200,
      equityProceedsSinceIssue: 50,
      assumedNewDebtRatePct: 6.5,
      totalDebt: 1100,
      securedDebt: 750,
      totalAssets: 2800,
    },
    expectedCapacityMillions: 84, // max(50, 0.03*2800)
    notes: "CONMED §7.2 — aligns with PR #227 Neon E2E proof shape; synthetic assets labeled.",
  },
  {
    exampleId: "lsb-6-01-assets-grower",
    packageId: "lsb-2023-abl-credit-agreement",
    sourcePath:
      "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
    operativeAnchor:
      "other Indebtedness in an aggregate principal amount outstanding at any time not to exceed the greater of $70,000,000 and\n5.5% of the total consolidated assets",
    windowPadBefore: 40,
    windowPadAfter: 200,
    sectionRef: "6.01",
    expectedFormulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
    expectedThresholdMillions: 70,
    expectedPct: 0.055,
    expectedPctParam: "pctTotalAssets",
    financials: {
      ebitda: 300,
      cash: 25,
      interestExpense: 20,
      cumulativeNetIncome: 50,
      equityProceedsSinceIssue: 0,
      assumedNewDebtRatePct: 7,
      totalDebt: 500,
      securedDebt: 350,
      totalAssets: 2000,
    },
    expectedCapacityMillions: 110, // max(70, 0.055*2000)=110
    notes: "LSB development package — assets grower (PR #225 holdout proof uses similar).",
  },
];

function sliceOperative(text: string, spec: AuthenticExampleSpec): string {
  const idx = text.indexOf(spec.operativeAnchor);
  if (idx < 0) {
    // tolerate whitespace collapse
    const collapsed = text.replace(/\s+/g, " ");
    const anchor = spec.operativeAnchor.replace(/\s+/g, " ");
    const j = collapsed.indexOf(anchor);
    if (j < 0) return "";
    return collapsed.slice(Math.max(0, j - spec.windowPadBefore), j + anchor.length + spec.windowPadAfter);
  }
  return text.slice(
    Math.max(0, idx - spec.windowPadBefore),
    idx + spec.operativeAnchor.length + spec.windowPadAfter,
  );
}

function main() {
  const outDir = path.resolve("docs/intelligence-factory/cycle-4");
  mkdirSync(outDir, { recursive: true });
  const results = [];

  for (const spec of EXAMPLES) {
    const abs = path.resolve(spec.sourcePath);
    if (!existsSync(abs)) {
      results.push({
        exampleId: spec.exampleId,
        status: "MISSING_FIXTURE",
        sourcePath: spec.sourcePath,
      });
      continue;
    }
    const text = readFileSync(abs, "utf8");
    const window = sliceOperative(text, spec);
    const indep = independentFormulaFromOperative(window);

    const formulaMatch = indep.formulaType === spec.expectedFormulaType;
    const thresholdMatch =
      indep.thresholdMillions != null &&
      Math.abs(indep.thresholdMillions - spec.expectedThresholdMillions) <= 0.51;
    const pctMatch =
      spec.expectedPct == null ||
      (indep.pct != null && Math.abs(indep.pct - spec.expectedPct) <= 0.005);

    const formulaType = formulaMatch ? indep.formulaType! : spec.expectedFormulaType;
    const threshold = thresholdMatch ? indep.thresholdMillions! : spec.expectedThresholdMillions;
    const pct = pctMatch && indep.pct != null ? indep.pct : spec.expectedPct ?? 0;

    const provision: CovenantProvisionInput = {
      id: spec.exampleId,
      documentId: spec.packageId,
      code: spec.exampleId,
      basketName: spec.exampleId,
      sectionRef: spec.sectionRef,
      formulaType: formulaType as CovenantProvisionInput["formulaType"],
      thresholdValue: threshold,
      params:
        spec.expectedPctParam === "pctTotalAssets"
          ? { pctTotalAssets: pct }
          : { pctEbitda: pct },
    };

    const evaluated = evaluateProvision(
      provision,
      spec.financials,
      computeLeverageMetrics(spec.financials),
    );
    const capacityOk =
      evaluated.status === "modeled" &&
      typeof evaluated.capacity === "number" &&
      Math.abs(evaluated.capacity - spec.expectedCapacityMillions) < 0.1;

    const refusal =
      formulaType === "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS"
        ? evaluateProvision(
            provision,
            { ...spec.financials, totalAssets: undefined },
            computeLeverageMetrics({ ...spec.financials, totalAssets: undefined }),
          )
        : null;

    results.push({
      exampleId: spec.exampleId,
      packageId: spec.packageId,
      sectionRef: spec.sectionRef,
      population: "DEVELOPMENT",
      holdout: false,
      operativeWindowChars: window.length,
      independentParse: indep,
      expected: {
        formulaType: spec.expectedFormulaType,
        thresholdMillions: spec.expectedThresholdMillions,
        pct: spec.expectedPct,
        capacityMillions: spec.expectedCapacityMillions,
      },
      matches: { formulaMatch, thresholdMatch, pctMatch, capacityOk },
      financialInputsLabel: "SYNTHETIC_LABELED_FINANCIAL_INPUTS_NOT_COMPANY_CAPACITY",
      financialInputs: spec.financials,
      evaluationStatus: evaluated.status,
      capacityMillions: evaluated.capacity ?? null,
      refusalWithoutAssets: refusal
        ? { status: refusal.status, reason: refusal.reason ?? null }
        : null,
      legalPermissionDistinctFromCapacity: true,
      certificationStatus: "NOT_CERTIFIED",
      notes: spec.notes,
      path: "Authentic text → independent parse → formula → labeled finance → capacity number",
    });
  }

  const summary = {
    schemaVersion: "intelligence-factory.authentic-capacity-examples.v1",
    generatedAt: new Date().toISOString(),
    paidInferenceCostUsd: 0,
    neonMutations: 0,
    examples: results,
    passed: results.filter((r) => r.matches?.capacityOk && r.matches?.formulaMatch && r.matches?.thresholdMatch).length,
    total: results.length,
  };
  writeFileSync(path.join(outDir, "authentic-capacity-examples.json"), JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify(
      {
        passed: summary.passed,
        total: summary.total,
        ids: results.map((r) => ({
          id: r.exampleId,
          formulaMatch: r.matches?.formulaMatch,
          thresholdMatch: r.matches?.thresholdMatch,
          capacityOk: r.matches?.capacityOk,
          capacity: r.capacityMillions,
        })),
      },
      null,
      2,
    ),
  );
}

main();
