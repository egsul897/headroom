/**
 * Authentic Matthews International demonstration package — data only.
 *
 * Figures and permission formulas are taken from existing in-repo provenance
 * (EDGAR accession 0000063296-25-000006; docs/matthews-international-onboarding.md;
 * scripts/populate-matthews-solver-native.ts). Nothing here invents agreements,
 * balances, historical transactions, or reviewer approvals.
 *
 * Company-specific data lives here so engines remain issuer-agnostic.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CovenantProvisionInput,
  FinancialSnapshotInput,
} from "@/lib/covenant-engine";
import type {
  FinancialMetricKey,
  HistoricalUtilizationEvent,
  RawFinancialStatementLine,
  StatementMetricDefinitionMapping,
} from "@/lib/capacity";

export const MATTHEWS_PACKAGE_KEY = "matthews-international-q1-fy2025";
export const MATTHEWS_COMPANY_ID = "matthews";
export const MATTHEWS_POSITION_COMPANY_ID = "matthews";

const FIXTURE_PATH = join(
  process.cwd(),
  "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
);

export type MatthewsSliceFixture = {
  label: string;
  companyId: string;
  entityName: string;
  edgarAccession: string;
  reportingPeriod: string;
  asOf: string;
  currency: string;
  provenanceId: string;
  statementLines: RawFinancialStatementLine[];
  metricMappings: StatementMetricDefinitionMapping[];
  utilizationEvents: HistoricalUtilizationEvent[];
  capacityRuleId: string;
  requiredFinancialMetrics: FinancialMetricKey[];
  completenessLimitations: string[];
};

let cachedFixture: MatthewsSliceFixture | null = null;

export function loadMatthewsAuthenticFixture(): MatthewsSliceFixture {
  if (cachedFixture) return cachedFixture;
  const parsed = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as MatthewsSliceFixture;
  if (parsed.label !== "AUTHENTIC_SOURCE_BACKED") {
    throw new Error(`Matthews fixture must be AUTHENTIC_SOURCE_BACKED, got ${parsed.label}`);
  }
  cachedFixture = parsed;
  return parsed;
}

/** Indenture + CA governing documents cited for this package (EDGAR-backed). */
export const MATTHEWS_GOVERNING_DOCUMENTS = [
  {
    id: "matw-2027-second-lien-notes-indenture",
    name: "Indenture — 8.625% Senior Secured Second Lien Notes due 2027",
    accession: "0001193125-24-228450",
    role: "OPERATIVE_INDENTURE" as const,
  },
  {
    id: "matw-credit-agreement-2020",
    name: "Third Amended and Restated Loan Agreement (as amended through Sixth Amendment)",
    accession: "0000063296-20-000040",
    role: "OPERATIVE_CREDIT_AGREEMENT" as const,
  },
  {
    id: "matw-10q-2024-12-31",
    name: "Form 10-Q quarter ended 2024-12-31",
    accession: "0000063296-25-000006",
    role: "FINANCIAL_EVIDENCE" as const,
  },
] as const;

/**
 * Solver-native permission rows as CovenantProvisionInput for evaluateProvision.
 * Codes/thresholds/sectionRefs match populate-matthews-solver-native.ts.
 */
export function matthewsCovenantProvisions(): CovenantProvisionInput[] {
  return [
    {
      id: "matw-ind-d-permitted-1a-flat",
      documentId: "matw-2027-second-lien-notes-indenture",
      code: "ind_permitted_debt_1a_flat",
      basketName: "Debt Facilities (flat)",
      sectionRef: "Permitted Debt def., cl. (1)(a)",
      formulaType: "FLAT_NET_OF_DEBT",
      thresholdValue: 1300,
      params: { netOfBasis: "secured" },
    },
    {
      id: "matw-ind-d-ratio-fccr",
      documentId: "matw-2027-second-lien-notes-indenture",
      code: "ind_ratio_debt_fccr",
      basketName: "Ratio Debt (FCCR)",
      sectionRef: "§4.09(a)",
      formulaType: "COVERAGE_RATIO_ROOM",
      thresholdValue: 2.0,
      params: {},
    },
    {
      id: "matw-ind-d-permitted-1b-ratio-secured",
      documentId: "matw-2027-second-lien-notes-indenture",
      code: "ind_permitted_debt_1b_ratio_secured",
      basketName: "Debt Facilities (secured leverage)",
      sectionRef: "Permitted Debt def., cl. (1)(b)(x)",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 3.5,
      params: { debtBasis: "secured" },
    },
    {
      id: "matw-ind-d-notes-fixed",
      documentId: "matw-2027-second-lien-notes-indenture",
      code: "ind_permitted_debt_2_notes",
      basketName: "Issue-Date Notes (grandfather)",
      sectionRef: "Permitted Debt def., cl. (2)",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 300,
      params: {},
    },
    {
      id: "matw-ca-l-2024notes",
      documentId: "matw-credit-agreement-2020",
      code: "ca_lien_601j_2024notes",
      basketName: "CA §6.01(j) 2024 Note Offering lien (only Loan-Party secured exception)",
      sectionRef: "§6.01(j), as restated by Sixth Amendment",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      params: {},
    },
  ];
}

export function matthewsFinancialSnapshot(fixture = loadMatthewsAuthenticFixture()): FinancialSnapshotInput {
  const byKey = new Map<string, number>();
  for (const m of fixture.metricMappings) {
    const line = fixture.statementLines.find((l) => l.lineId === m.lineId);
    if (line) byKey.set(m.metricKey, line.amount);
  }
  const requireMetric = (key: string): number => {
    const v = byKey.get(key);
    if (v === undefined || !Number.isFinite(v)) {
      throw new Error(`Missing authentic financial metric ${key}`);
    }
    return v;
  };
  return {
    ebitda: requireMetric("CONSOLIDATED_EBITDA"),
    totalDebt: requireMetric("TOTAL_DEBT"),
    securedDebt: requireMetric("SECURED_DEBT"),
    cash: requireMetric("CASH_BALANCES"),
    interestExpense: requireMetric("INTEREST_EXPENSE"),
    cumulativeNetIncome: -3.472,
    equityProceedsSinceIssue: 0,
    assumedNewDebtRatePct: 8.625,
    totalAssets: requireMetric("TOTAL_ASSETS"),
  };
}

/** Notes outstanding attributed for grandfather remaining (Issue-Date Notes). */
export const MATTHEWS_NOTES_OUTSTANDING_MM = 294.799;
/** Revolver outstanding attributed to Debt Facilities path. */
export const MATTHEWS_REVOLVER_OUTSTANDING_MM = 484.083;
