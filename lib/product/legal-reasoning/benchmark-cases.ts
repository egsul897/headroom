/**
 * Durable legal-analysis benchmark case catalog (authentic-source oriented).
 * Expected outcomes for the adjudicated subset are independently specified —
 * AI-generated answers are never treated as ground truth.
 */

export type BenchmarkCaseKind =
  | "STRAIGHTFORWARD_PERMISSION"
  | "MULTI_BASKET"
  | "SHARED_CAPACITY"
  | "AMENDMENT_CONFLICT"
  | "NESTED_DEFINITIONS"
  | "ENTITY_SCOPE_CONFLICT"
  | "RATIO_DEPENDENT"
  | "MISSING_FINANCIAL_INPUTS"
  | "RECLASSIFICATION"
  | "MULTI_DOCUMENT_RESTRICTION"
  | "COMPETING_INTERPRETATIONS"
  | "NO_VALID_PATH";

export type BenchmarkMetric =
  | "relevant_provision_recall"
  | "missing_restriction_rate"
  | "incorrect_permission_rate"
  | "definition_resolution_accuracy"
  | "amendment_correctness"
  | "condition_completeness"
  | "unsupported_conclusion_rate"
  | "citation_accuracy"
  | "path_enumeration_completeness";

export interface LegalBenchmarkCase {
  caseId: string;
  kind: BenchmarkCaseKind;
  title: string;
  /** Authentic package / fixture key when bound; null until corpus-linked. */
  packageKey: string | null;
  question: string;
  /** Independently adjudicated expected outcomes — omit until human-adjudicated. */
  adjudicated?: {
    mustRetrieveSectionRefs: string[];
    mustNotClaimPermissions: string[];
    requiredDefinitions: string[];
    expectedOutcome:
      | "PERMISSION_AVAILABLE"
      | "CONDITIONAL"
      | "NO_VALID_PATH"
      | "AMENDMENT_UNRESOLVED"
      | "MISSING_INPUTS";
    adjudicator: string;
    adjudicatedAt: string;
  };
  metrics: BenchmarkMetric[];
}

export const LEGAL_BENCHMARK_CASES: LegalBenchmarkCase[] = [
  {
    caseId: "bench.permission.fixed_basket",
    kind: "STRAIGHTFORWARD_PERMISSION",
    title: "Fixed-dollar debt basket permission",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "Can the Borrower incur $25 million of unsecured Indebtedness under a general basket?",
    metrics: ["relevant_provision_recall", "citation_accuracy", "unsupported_conclusion_rate"],
  },
  {
    caseId: "bench.multi_basket.debt",
    kind: "MULTI_BASKET",
    title: "Multi-basket debt stacking question",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "Can the Borrower combine ratio debt and a fixed basket for one incurrence?",
    metrics: ["path_enumeration_completeness", "incorrect_permission_rate", "missing_restriction_rate"],
  },
  {
    caseId: "bench.shared_capacity.lien",
    kind: "SHARED_CAPACITY",
    title: "Shared debt/lien capacity",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "Does secured debt under the incremental facility share capacity with the general lien basket?",
    metrics: ["relevant_provision_recall", "condition_completeness", "unsupported_conclusion_rate"],
  },
  {
    caseId: "bench.amendment.conflict",
    kind: "AMENDMENT_CONFLICT",
    title: "Amendment conflicts with base agreement",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "Which version of Section 7.03 controls after the second amendment?",
    metrics: ["amendment_correctness", "citation_accuracy"],
  },
  {
    caseId: "bench.definitions.nested",
    kind: "NESTED_DEFINITIONS",
    title: "Nested Available Amount / Consolidated Net Income",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "What components feed Available Amount for a Restricted Payment?",
    metrics: ["definition_resolution_accuracy", "condition_completeness"],
  },
  {
    caseId: "bench.entity.scope",
    kind: "ENTITY_SCOPE_CONFLICT",
    title: "Non-guarantor subsidiary debt",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "Can a non-guarantor Restricted Subsidiary incur Indebtedness not guaranteed by the Borrower?",
    metrics: ["relevant_provision_recall", "missing_restriction_rate"],
  },
  {
    caseId: "bench.ratio.dependent",
    kind: "RATIO_DEPENDENT",
    title: "Ratio-conditioned lien permission",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "Is a lien permitted if pro forma Secured Net Leverage does not exceed 3.50 to 1.00?",
    metrics: ["relevant_provision_recall", "definition_resolution_accuracy", "condition_completeness"],
  },
  {
    caseId: "bench.missing.financials",
    kind: "MISSING_FINANCIAL_INPUTS",
    title: "Capacity without EBITDA",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "How much grower basket capacity remains?",
    metrics: ["unsupported_conclusion_rate", "missing_restriction_rate"],
    adjudicated: {
      mustRetrieveSectionRefs: [],
      mustNotClaimPermissions: ["any remaining dollar capacity without EBITDA"],
      requiredDefinitions: [],
      expectedOutcome: "MISSING_INPUTS",
      adjudicator: "product-policy",
      adjudicatedAt: "2026-10-06",
    },
  },
  {
    caseId: "bench.reclass",
    kind: "RECLASSIFICATION",
    title: "Reclassification of prior basket usage",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "May prior Indebtedness under the general basket be reclassified as ratio debt?",
    metrics: ["path_enumeration_completeness", "condition_completeness", "citation_accuracy"],
  },
  {
    caseId: "bench.multi_doc",
    kind: "MULTI_DOCUMENT_RESTRICTION",
    title: "Cross-document restriction",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "Do indenture notes and the credit agreement jointly restrict a Restricted Payment?",
    metrics: ["relevant_provision_recall", "amendment_correctness", "missing_restriction_rate"],
  },
  {
    caseId: "bench.competing",
    kind: "COMPETING_INTERPRETATIONS",
    title: "Competing permission readings",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "Is the acquisition debt basket available when the target becomes an Unrestricted Subsidiary?",
    metrics: ["path_enumeration_completeness", "incorrect_permission_rate", "unsupported_conclusion_rate"],
  },
  {
    caseId: "bench.no_path",
    kind: "NO_VALID_PATH",
    title: "No valid contractual pathway",
    packageKey: "customer:demo-customer-workflow:demo-customer-workflow-ca",
    question: "Can the Borrower pay a dividend while an Event of Default is continuing and no RP exception applies?",
    metrics: ["missing_restriction_rate", "incorrect_permission_rate", "unsupported_conclusion_rate"],
    adjudicated: {
      mustRetrieveSectionRefs: [],
      mustNotClaimPermissions: ["unconditional RP permission during Event of Default"],
      requiredDefinitions: [],
      expectedOutcome: "NO_VALID_PATH",
      adjudicator: "product-policy",
      adjudicatedAt: "2026-10-06",
    },
  },
];

export function listBenchmarkCases(filter?: { kind?: BenchmarkCaseKind; adjudicatedOnly?: boolean }): LegalBenchmarkCase[] {
  return LEGAL_BENCHMARK_CASES.filter((c) => {
    if (filter?.kind && c.kind !== filter.kind) return false;
    if (filter?.adjudicatedOnly && !c.adjudicated) return false;
    return true;
  });
}

export interface BenchmarkScorecard {
  caseId: string;
  metrics: Partial<Record<BenchmarkMetric, number>>;
  notes: string[];
}

/**
 * Score a retrieval/analysis result against an adjudicated case.
 * Returns null metrics when the case is not yet independently adjudicated.
 */
export function scoreAgainstAdjudicated(params: {
  caseDef: LegalBenchmarkCase;
  retrievedSectionRefs: string[];
  claimedPermissions: string[];
  claimedCapacityWithoutInputs: boolean;
  unsupportedConclusions: string[];
}): BenchmarkScorecard {
  const notes: string[] = [];
  const metrics: Partial<Record<BenchmarkMetric, number>> = {};
  const adj = params.caseDef.adjudicated;
  if (!adj) {
    notes.push("No independent adjudication — not scored as ground truth.");
    return { caseId: params.caseDef.caseId, metrics, notes };
  }

  if (adj.mustRetrieveSectionRefs.length) {
    const hit = adj.mustRetrieveSectionRefs.filter((s) =>
      params.retrievedSectionRefs.some((r) => r === s || r.endsWith(s)),
    ).length;
    metrics.relevant_provision_recall = hit / adj.mustRetrieveSectionRefs.length;
  }

  const bannedHits = adj.mustNotClaimPermissions.filter((b) =>
    params.claimedPermissions.some((p) => p.toLowerCase().includes(b.toLowerCase().slice(0, 24))),
  );
  metrics.incorrect_permission_rate = bannedHits.length ? 1 : 0;

  if (adj.expectedOutcome === "MISSING_INPUTS") {
    metrics.unsupported_conclusion_rate = params.claimedCapacityWithoutInputs ? 1 : 0;
    notes.push(
      params.claimedCapacityWithoutInputs
        ? "FAIL: claimed capacity without required financial inputs"
        : "PASS: refused inventing capacity without inputs",
    );
  }
  if (adj.expectedOutcome === "NO_VALID_PATH") {
    metrics.incorrect_permission_rate = params.claimedPermissions.length ? 1 : 0;
    notes.push(
      params.claimedPermissions.length
        ? "FAIL: claimed a permission on a no-valid-path case"
        : "PASS: no unsupported permission claimed",
    );
  }

  metrics.unsupported_conclusion_rate =
    metrics.unsupported_conclusion_rate ??
    (params.unsupportedConclusions.length ? Math.min(1, params.unsupportedConclusions.length / 3) : 0);

  return { caseId: params.caseDef.caseId, metrics, notes };
}
