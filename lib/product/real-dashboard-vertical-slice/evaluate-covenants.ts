/**
 * Produce source-backed covenant calculations through the existing
 * covenant-engine leaf evaluator — no parallel capacity engine.
 */

import {
  computeLeverageMetrics,
  evaluateProvision,
  type CovenantProvisionInput,
  type EvaluatedProvision,
  type FinancialSnapshotInput,
  type LeverageMetrics,
} from "@/lib/covenant-engine";
import {
  TRUSTED_ISSUER_ACTIVATION,
  buildVerifiedCapacityInputHandoff,
  computeVerifiedRemaining,
  mayUseAsProductionCapacityInput,
  normalizeFinancialStatementEvidence,
  reconstructUtilizationEvidence,
  toVerifiedUtilizationHandoffInput,
  type VerifiedRemainingResult,
} from "@/lib/capacity";
import {
  MATTHEWS_GOVERNING_DOCUMENTS,
  MATTHEWS_NOTES_OUTSTANDING_MM,
  loadMatthewsAuthenticFixture,
  matthewsCovenantProvisions,
  matthewsFinancialSnapshot,
  type MatthewsSliceFixture,
} from "./package-matthews";

export type CovenantAuthorityStatus =
  | "MODELED_AUTHENTIC_EVIDENCE"
  | "GROSS_ONLY_UTILIZATION_INCOMPLETE"
  | "PRODUCTION_REMAINING_REFUSED"
  | "STRUCTURAL_ZERO";

export interface VerifiedCovenantCalculation {
  code: string;
  basketName: string;
  governingDocumentId: string;
  governingDocumentName: string;
  operativeSection: string;
  formulaType: CovenantProvisionInput["formulaType"];
  formulaDescription: string;
  applicableDefinitions: string[];
  exceptionsOrCaveats: string[];
  financialSource: string;
  reportingPeriod: string;
  /** Gross / modeled capacity from evaluateProvision ($M). */
  modeledCapacityMm: number | null;
  evaluationStatus: EvaluatedProvision["status"];
  evaluationReason?: string;
  /**
   * Remaining capacity claim when attribution + math support it.
   * Null when utilization incomplete or structural refusal — never fabricated zero for UNKNOWN.
   */
  remainingCapacityMm: number | null;
  historicalUtilizationMm: number | null;
  utilizationKnowledge: "ATTRIBUTED" | "UNKNOWN" | "NOT_APPLICABLE";
  authorityStatus: CovenantAuthorityStatus;
  provenance: string[];
  confidenceNote: string;
  independentExpectedMm: number | null;
}

export interface FinancialEvidenceCoverage {
  metricsPresent: string[];
  metricsMissing: string[];
  authenticity: string;
  verificationStatus: string;
  totalConsolidatedAssetsSubstituted: boolean;
}

export interface UtilizationCoverage {
  attributedEventCount: number;
  attributedAmountMm: number | null;
  supportsRemainingClaim: boolean;
  unknownHistoricalActivity: boolean;
  completenessCertificatePresent: boolean;
  trustedIssuerActivation: string;
}

export interface VerticalSliceEvaluation {
  packageKey: string;
  companyId: string;
  asOf: string;
  financials: FinancialSnapshotInput;
  leverage: LeverageMetrics;
  covenants: VerifiedCovenantCalculation[];
  verifiedCovenantsCount: number;
  financialEvidence: FinancialEvidenceCoverage;
  utilization: UtilizationCoverage;
  productionHandoffRefused: boolean;
  productionHandoffReasons: string[];
  missingEvidence: string[];
  indentureSecuredCompositionMm: number | null;
  /**
   * Secured composition of Debt Facilities flat room + FCCR room is a solver-native
   * Indenture debt-incurrence stacking figure only. It is NOT verified secured remaining:
   * CA §6.01(j) blocks NEW Loan-Party secured liens, and Indenture lien links for
   * first priority attach to Debt Facilities — not Ratio Debt. See PR #304 acceptance.
   */
  securedCompositionAuthority: "HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION";
}

function docName(documentId: string): string {
  return MATTHEWS_GOVERNING_DOCUMENTS.find((d) => d.id === documentId)?.name ?? documentId;
}

function formulaDescription(p: CovenantProvisionInput): string {
  switch (p.formulaType) {
    case "FLAT_NET_OF_DEBT":
      return `max(0, $${p.thresholdValue}M − ${p.params?.netOfBasis ?? "total"} debt outstanding)`;
    case "COVERAGE_RATIO_ROOM":
      return `max(0, (EBITDA/${p.thresholdValue} − InterestExpense) / assumedNewDebtRate)`;
    case "LEVERAGE_RATIO_ROOM":
      return `max(0, ${p.thresholdValue}×EBITDA − net ${p.params?.debtBasis ?? "total"} debt)`;
    case "FLAT_AMOUNT":
      return `flat $${p.thresholdValue}M`;
    default:
      return p.formulaType;
  }
}

/**
 * Independent arithmetic (not read from evaluateProvision) for acceptance.
 * Formulas cited from Indenture / populate script provenance.
 */
export function independentExpectedRemaining(
  code: string,
  fin: FinancialSnapshotInput,
  metrics: LeverageMetrics,
): number | null {
  switch (code) {
    case "ind_permitted_debt_1a_flat":
      return Math.max(0, 1300 - fin.securedDebt);
    case "ind_ratio_debt_fccr": {
      const rate = fin.assumedNewDebtRatePct / 100;
      return Math.max(0, (fin.ebitda / 2.0 - fin.interestExpense) / rate);
    }
    case "ind_permitted_debt_1b_ratio_secured":
      return Math.max(0, 3.5 * fin.ebitda - metrics.netSecured);
    case "ind_permitted_debt_2_notes":
      // Grandfather: Issue-Date Notes outstanding ($294.799M of $300M) → $0 NEW capacity.
      // Incremental room under the grandfather is not a growth basket.
      return 0;
    case "ca_lien_601j_2024notes":
      return 0;
    default:
      return null;
  }
}

function buildCovenantRow(
  p: CovenantProvisionInput,
  fin: FinancialSnapshotInput,
  metrics: LeverageMetrics,
  fixture: MatthewsSliceFixture,
  utilFor1a: VerifiedRemainingResult | null,
): VerifiedCovenantCalculation {
  const ev = evaluateProvision(p, fin, metrics);
  const independent = independentExpectedRemaining(p.code, fin, metrics);
  const modeled = ev.status === "modeled" && ev.capacity !== undefined && Number.isFinite(ev.capacity)
    ? ev.capacity
    : null;

  let remainingCapacityMm: number | null = null;
  let historicalUtilizationMm: number | null = null;
  let utilizationKnowledge: VerifiedCovenantCalculation["utilizationKnowledge"] = "UNKNOWN";
  let authorityStatus: CovenantAuthorityStatus = "PRODUCTION_REMAINING_REFUSED";

  if (p.code === "ind_permitted_debt_1a_flat") {
    // Engine modeled capacity already nets secured debt (FLAT_NET_OF_DEBT).
    // Attributed events exist but completeness cert is absent → remaining claim refused.
    historicalUtilizationMm =
      fixture.utilizationEvents
        .filter((e) => e.applicableProvisionId === "ind_permitted_debt_1a_flat")
        .reduce((s, e) => s + e.amount, 0) || null;
    utilizationKnowledge = historicalUtilizationMm != null ? "ATTRIBUTED" : "UNKNOWN";
    remainingCapacityMm = null; // production remaining refused without completeness
    authorityStatus = "GROSS_ONLY_UTILIZATION_INCOMPLETE";
    if (utilFor1a) {
      // Preserve engine publication honesty.
      if (utilFor1a.mayPublishAvailable) {
        remainingCapacityMm = utilFor1a.supportedRemaining;
        authorityStatus = "MODELED_AUTHENTIC_EVIDENCE";
      } else {
        // Modeled gross/capacity from evaluateProvision is still shown as modeledCapacityMm.
        authorityStatus = "GROSS_ONLY_UTILIZATION_INCOMPLETE";
      }
    }
  } else if (p.code === "ind_permitted_debt_2_notes") {
    historicalUtilizationMm = MATTHEWS_NOTES_OUTSTANDING_MM;
    utilizationKnowledge = "ATTRIBUTED";
    // NEW incremental = 0 with attributed outstanding; not UNKNOWN→zero.
    remainingCapacityMm = 0;
    authorityStatus = "MODELED_AUTHENTIC_EVIDENCE";
  } else if (p.code === "ca_lien_601j_2024notes") {
    historicalUtilizationMm = null;
    utilizationKnowledge = "NOT_APPLICABLE";
    remainingCapacityMm = 0;
    authorityStatus = "STRUCTURAL_ZERO";
  } else if (p.code === "ind_ratio_debt_fccr" || p.code === "ind_permitted_debt_1b_ratio_secured") {
    // D3b: modeled ratio room is HYPOTHETICAL_MODELED capacity — never publish as remaining.
    // Completeness / trusted-issuer absent → remainingCapacityMm stays null.
    remainingCapacityMm = null;
    utilizationKnowledge = "NOT_APPLICABLE";
    authorityStatus = "MODELED_AUTHENTIC_EVIDENCE";
  }

  const caveats: string[] = [];
  if (p.code === "ind_permitted_debt_1a_flat") {
    caveats.push(
      "FLAT_NET_OF_DEBT nets company-wide secured debt (conservative understatement vs Debt-Facilities-specific outstanding).",
    );
    caveats.push("No reviewer-confirmed utilization completeness certificate — production remaining refused.");
  }
  if (p.code === "ind_permitted_debt_1b_ratio_secured") {
    caveats.push("First Lien Net Leverage ≤ 2.50x sub-test (cl. (1)(b)(y)) is not separately modeled.");
    caveats.push("D3b: modeled Secured Net Leverage room is not published as remainingCapacityMm.");
  }
  if (p.code === "ind_ratio_debt_fccr") {
    caveats.push("D3b: modeled FCCR dollar-converted room is not published as remainingCapacityMm.");
  }
  if (p.code === "ind_permitted_debt_2_notes") {
    caveats.push("Grandfather for Issue-Date Notes — zero NEW capacity while Notes remain outstanding.");
  }
  if (p.code === "ca_lien_601j_2024notes") {
    caveats.push(
      "Sixth Amendment deleted general Loan-Party secured-lien basket; only 2024 Note Offering exception remains.",
    );
  }

  return {
    code: p.code,
    basketName: p.basketName,
    governingDocumentId: p.documentId,
    governingDocumentName: docName(p.documentId),
    operativeSection: p.sectionRef,
    formulaType: p.formulaType,
    formulaDescription: formulaDescription(p),
    applicableDefinitions:
      p.code === "ind_ratio_debt_fccr"
        ? ["Consolidated Fixed Charge Coverage Ratio", "Consolidated EBITDA"]
        : p.code === "ind_permitted_debt_1b_ratio_secured"
          ? ["Secured Net Leverage Ratio", "Consolidated EBITDA"]
          : p.code === "ind_permitted_debt_1a_flat"
            ? ["Debt Facilities", "Qualified Receivables Transactions"]
            : [],
    exceptionsOrCaveats: caveats,
    financialSource: `EDGAR ${fixture.edgarAccession} + Indenture Consolidated EBITDA build-up`,
    reportingPeriod: fixture.reportingPeriod,
    modeledCapacityMm: modeled,
    evaluationStatus: ev.status,
    evaluationReason: ev.reason,
    remainingCapacityMm,
    historicalUtilizationMm,
    utilizationKnowledge,
    authorityStatus,
    provenance: [
      `fixture:${fixture.provenanceId}`,
      `document:${p.documentId}`,
      `section:${p.sectionRef}`,
      `engine:evaluateProvision/${p.formulaType}`,
    ],
    confidenceNote:
      authorityStatus === "PRODUCTION_REMAINING_REFUSED" ||
      authorityStatus === "GROSS_ONLY_UTILIZATION_INCOMPLETE"
        ? "Modeled from authentic evidence; production-authoritative remaining blocked (completeness + trusted-issuer)."
        : authorityStatus === "STRUCTURAL_ZERO"
          ? "Cited structural zero — not an UNKNOWN default."
          : "Modeled from authentic EDGAR-backed inputs via shared covenant-engine; not PRODUCTION_AUTHORITATIVE.",
    independentExpectedMm: independent,
  };
}

export function evaluateMatthewsVerticalSlice(
  financialOverride?: Partial<FinancialSnapshotInput>,
): VerticalSliceEvaluation {
  const fixture = loadMatthewsAuthenticFixture();
  const baseFin = matthewsFinancialSnapshot(fixture);
  const fin: FinancialSnapshotInput = { ...baseFin, ...financialOverride };
  const leverage = computeLeverageMetrics(fin);
  const provisions = matthewsCovenantProvisions();

  const statements = normalizeFinancialStatementEvidence({
    companyId: fixture.companyId,
    entityName: fixture.entityName,
    asOf: fixture.asOf,
    reportingPeriod: fixture.reportingPeriod,
    currency: fixture.currency,
    provenanceId: fixture.provenanceId,
    lines: fixture.statementLines,
    mappings: fixture.metricMappings,
    verificationStatus: "UNVERIFIED_EXTRACTION",
    authenticity: "AUTHENTIC",
    maxAgeDays: 400,
  });

  const utilRecon = reconstructUtilizationEvidence({
    companyId: fixture.companyId,
    capacityRuleId: fixture.capacityRuleId,
    asOf: fixture.asOf,
    currency: fixture.currency,
    events: fixture.utilizationEvents,
    completenessCertificate: null,
    acknowledgeUnknownHistory: true,
  });

  const utilHandoff = utilRecon.ok ? toVerifiedUtilizationHandoffInput(utilRecon) : null;

  const oneAProvision = provisions.find((p) => p.code === "ind_permitted_debt_1a_flat")!;
  const oneAEval = evaluateProvision(oneAProvision, fin, leverage);
  const utilFor1a =
    utilHandoff && oneAEval.status === "modeled" && oneAEval.capacity !== undefined
      ? computeVerifiedRemaining({
          gross: {
            amount: oneAEval.capacity,
            gateSatisfied: true,
            modeled: true,
            capacityRuleId: fixture.capacityRuleId,
            formulaLabel: oneAProvision.basketName,
            sectionRef: oneAProvision.sectionRef,
            currency: "USD",
          },
          utilization: utilHandoff,
          sourceCitations: [`EDGAR ${fixture.edgarAccession}`],
          certificationStatus: "NOT_CERTIFIED",
        })
      : null;

  const handoff =
    statements.ok && statements.snapshot && utilHandoff
      ? buildVerifiedCapacityInputHandoff({
          companyId: fixture.companyId,
          evaluationAsOf: fixture.asOf,
          financial: statements.snapshot,
          requiredFinancialMetrics: fixture.requiredFinancialMetrics,
          utilization: utilHandoff,
          trustedIssuerAuth: null,
        })
      : null;

  const covenants = provisions.map((p) => buildCovenantRow(p, fin, leverage, fixture, utilFor1a));

  // Indenture secured composition = Debt Facilities flat room + FCCR room (golden q01).
  const flat = covenants.find((c) => c.code === "ind_permitted_debt_1a_flat");
  const fccr = covenants.find((c) => c.code === "ind_ratio_debt_fccr");
  const indentureSecuredCompositionMm =
    flat?.modeledCapacityMm != null && fccr?.modeledCapacityMm != null
      ? flat.modeledCapacityMm + fccr.modeledCapacityMm
      : null;

  const missingEvidence = [...fixture.completenessLimitations];
  if (!statements.ok) missingEvidence.push(...statements.refusalReasons);
  if (TRUSTED_ISSUER_ACTIVATION.status === "BLOCKED") {
    missingEvidence.push("Production HostIdentityProvider / trusted-issuer activation BLOCKED.");
  }

  const productionOk = handoff ? mayUseAsProductionCapacityInput(handoff) : false;

  return {
    packageKey: "matthews-international-q1-fy2025",
    companyId: "matthews",
    asOf: fixture.asOf,
    financials: fin,
    leverage,
    covenants,
    verifiedCovenantsCount: covenants.filter(
      (c) => c.evaluationStatus === "modeled" && c.modeledCapacityMm != null,
    ).length,
    financialEvidence: {
      metricsPresent: statements.snapshot?.metrics.map((m) => m.metricKey) ?? [],
      metricsMissing: fixture.requiredFinancialMetrics.filter(
        (k) => !(statements.snapshot?.metrics.some((m) => m.metricKey === k) ?? false),
      ),
      authenticity: "AUTHENTIC",
      verificationStatus: "UNVERIFIED_EXTRACTION",
      totalConsolidatedAssetsSubstituted: false,
    },
    utilization: {
      attributedEventCount: utilRecon.usageAttributed?.length ?? 0,
      attributedAmountMm: utilRecon.ok
        ? utilRecon.usageAttributed.reduce((s, u) => s + u.amount, 0)
        : null,
      supportsRemainingClaim: utilFor1a?.utilization.supportsRemainingClaim ?? false,
      unknownHistoricalActivity: true,
      completenessCertificatePresent: false,
      trustedIssuerActivation: TRUSTED_ISSUER_ACTIVATION.status,
    },
    productionHandoffRefused: !productionOk,
    productionHandoffReasons: handoff
      ? [
          `financialTrustClass=${handoff.financial.trustClass}`,
          `utilizationSupportsRemaining=${handoff.utilization.supportsRemainingClaim}`,
          `productionAuthority=${handoff.productionAuthority}`,
        ]
      : ["capacity input handoff unavailable"],
    missingEvidence,
    indentureSecuredCompositionMm,
    securedCompositionAuthority: "HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION",
  };
}
