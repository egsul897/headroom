/**
 * Multi-company financial capacity + transaction state-change milestone.
 * Uses existing NS-4 / covenant-engine / financial-core / ledger infrastructure.
 * Never invents capacity or promotes unverified material to legal truth.
 */

export type Assessment =
  | "CORRECT_EXECUTABLE"
  | "CORRECT_REFUSAL"
  | "INCORRECT"
  | "MISSING_CAPABILITY"
  | "UNVERIFIED";

export type TransactionKind =
  | "DEBT_INCURRENCE"
  | "DEBT_REPAYMENT"
  | "DIVIDEND"
  | "EQUITY_CONTRIBUTION"
  | "RESTRICTED_INVESTMENT";

export interface BasketCapacityRow {
  key: string;
  documentId: string;
  documentName: string;
  code: string;
  basketName: string;
  formulaType: string;
  sectionRef: string;
  status: string;
  capacity: number | null;
  reason?: string;
  components?: Array<{ label: string; sectionRef: string; value: number }>;
}

export interface CompanyFinancialPositionReport {
  companyId: string;
  companyName: string;
  ticker: string | null;
  tenantKind: string;
  asOfDate: string;
  eligibility: {
    hasFinancialSnapshot: boolean;
    hasFinancialState: boolean;
    hasLedger: boolean;
    hasCovenantProvisions: boolean;
    hasCapacityFormulas: boolean;
    hasPermissions: boolean;
    hasNs4ApprovedSnapshot: boolean;
    hasRpWaterfall: boolean;
    executableCapacity: boolean;
    refusalReasons: string[];
  };
  contractualMetrics: {
    ebitda: number;
    cash: number;
    totalDebt: number;
    securedDebt: number;
    interestExpense: number;
    cumulativeNetIncome: number;
    equityProceedsSinceIssue: number;
    assumedNewDebtRatePct: number;
    netDebt: number;
    totalNetLeverage: number;
    seniorSecuredNetLeverage: number;
    fixedChargeCoverage: number;
  } | null;
  documents: Array<{
    id: string;
    name: string;
    type: string;
    governs: string | null;
    hasSecuredFormula: boolean;
    hasUnsecuredFormula: boolean;
    hasRpWaterfall: boolean;
    provisionCount: number;
    permissionCount: number;
  }>;
  baskets: BasketCapacityRow[];
  ledgerUtilization: Array<{
    basket: string;
    direction: string;
    amount: number;
    known: true;
  }>;
  unknownUtilization: string[];
  remainingCapacity: {
    secured: number | null;
    unsecured: number | null;
    securedBinding: string | null;
    unsecuredBinding: string | null;
    securedMethod: string | null;
    unsecuredMethod: string | null;
  };
  crossDocumentRestrictions: string[];
  certificatesProcessed: number;
  financialStatementsProcessed: number;
}

export interface BasketDelta {
  key: string;
  basketName: string;
  pre: number | null;
  post: number | null;
  effect: "CONSUMED" | "RESTORED" | "INCREASED" | "UNAFFECTED" | "UNKNOWN";
  delta: number | null;
}

export interface TransactionScenarioResult {
  id: string;
  companyId: string;
  kind: TransactionKind;
  title: string;
  amount: number;
  detail: string;
  independent: {
    expectedStatus: "clear" | "blocked" | "review_required" | "not_tested" | "NOT_EXECUTABLE";
    expectedPreCapacity?: number | null;
    expectedPostCapacity?: number | null;
    expectedBasketEffects: Array<{ key: string; effect: BasketDelta["effect"]; delta?: number }>;
    rationale: string;
    source: string;
  };
  observed: {
    status: string;
    pre: Record<string, number | string | null | undefined>;
    post: Record<string, number | string | null | undefined>;
    basketsConsumed: BasketDelta[];
    basketsRestored: BasketDelta[];
    basketsUnaffected: BasketDelta[];
    pathway: string;
    limitations: string[];
  };
  assessment: Assessment;
}

export interface NeonIntelligenceRow {
  sourceId: string;
  companyId: string | null;
  title: string;
  representationLevel: string;
  verificationStatus: "DISCOVERED_NOT_LEGAL_TRUTH";
  promotedToLegalTruth: 0;
  kind: string;
  created: boolean;
}

export interface FinancialCapacityMilestoneReport {
  schemaVersion: "product.financial-capacity-positions.v1";
  generatedAt: string;
  startingSha: string | null;
  paidInferenceCalls: 0;
  promotedToLegalTruth: 0;
  companies: CompanyFinancialPositionReport[];
  scenarios: TransactionScenarioResult[];
  neonIntelligence: NeonIntelligenceRow[];
  metrics: {
    authenticCompaniesProcessed: number;
    agreementsProcessed: number;
    financialStatementsProcessed: number;
    certificatesProcessed: number;
    independentlyCorrectExecutableCalculations: number;
    correctRefusals: number;
    incorrectOutcomes: number;
    transactionsWithValidatedStateChanges: number;
    newReusableCovenantKnowledgeStored: number;
  };
  blockers: Array<{
    id: string;
    generality: "COMPANY_SPECIFIC" | "CLASS_GENERAL" | "PLATFORM";
    statement: string;
  }>;
  conmedRefusalRegressionsPreserved: {
    note: string;
    pr: string;
    scenarioIds: string[];
  };
  customerReportMarkdown: string;
}
