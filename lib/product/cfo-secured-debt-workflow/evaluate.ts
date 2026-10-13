/**
 * CFO secured-debt customer workflow — Matthews authentic package.
 *
 * Connects existing canonical modules into one defensible answer for:
 *   “Is a proposed $50M secured debt transaction permitted?”
 *
 * Never fabricates Phase-3 VEP, APPROVED NS-4, utilization completeness,
 * or CERTIFIED_4E paths. Never claims PERMITTED / verified remaining unless
 * those gates genuinely pass (they do not on this package today).
 */

import { execSync } from "node:child_process";
import {
  evaluateMatthewsVerticalSlice,
  runRealDashboardVerticalSlice,
  type VerticalSliceEvaluation,
} from "@/lib/product/real-dashboard-vertical-slice";
import {
  MATTHEWS_COMPANY_ID,
  MATTHEWS_GOVERNING_DOCUMENTS,
  MATTHEWS_PACKAGE_KEY,
  loadMatthewsAuthenticFixture,
} from "@/lib/product/real-dashboard-vertical-slice/package-matthews";
import {
  compileMatthewsVerifiedExecutableBridge,
  matthewsVerifiedExecutableCandidates,
} from "@/lib/product/real-dashboard-vertical-slice/verified-executable-compile-bridge";
import { parseTransactionDraft } from "@/lib/product/north-star-workflow/transaction-analysis";
import { enumerateCertifiedPaths } from "@/lib/product/north-star-workflow/verified-path-enumeration";
import {
  attemptVerifiedSimulate,
  type VerifiedSimulateResult,
} from "@/lib/product/unified-position/certified-simulate-bridge";
import {
  evaluateMatthewsScenario,
  matthewsRefinancing,
} from "@/lib/product/cross-domain-scenarios";
import {
  recipeSecuredBorrowing,
} from "@/lib/product/north-star-workflow/transaction-effect-recipes";
import { TRUSTED_ISSUER_ACTIVATION } from "@/lib/capacity";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";

/** Defensible customer results for this workflow (mission vocabulary). */
export type CfoWorkflowResult =
  | "PERMITTED"
  | "NOT_PERMITTED"
  | "NEEDS_INPUT"
  | "REVIEW_REQUIRED"
  | "UNSUPPORTED";

/**
 * Only Matthews authentic financial fixture period supported for this offline
 * workflow. Other evaluation dates must fail closed — never silently reuse
 * 2024-12-31 inputs.
 */
export const MATTHEWS_CFO_SUPPORTED_FINANCIAL_AS_OF = "2024-12-31";

export type CfoSubsidiaryFinding = {
  code: string;
  kind: "DEBT_ALTERNATIVE" | "LIEN_COMPANION" | "MODELED_SCENARIO" | "DATE_BINDING";
  status: string;
  detail: string;
};

export type CfoSecuredDebtWorkflowArgs = {
  ask: string;
  amountMillions?: number;
  evaluationDate?: string;
  /**
   * When true, omit authentic package binding to demonstrate fail-closed
   * behavior with missing package evidence (still no invented answers).
   */
  omitAuthenticPackage?: boolean;
};

export type ApplicableCovenantRow = {
  code: string;
  family: string;
  governingDocument: string;
  sourceCitation: string;
  formula: string;
  modeledCapacityMm: number | null;
  remainingCapacityMm: null;
  authorityStatus: string;
  caveats: string[];
};

export type CfoSecuredDebtWorkflowResult = {
  schema: "cfo-secured-debt-workflow.v1";
  evaluatedAt: string;
  gitSha: string;
  package: {
    key: string;
    companyId: string;
    authenticity: "AUTHENTIC_SOURCE_BACKED" | "NONE";
    asOf: string;
    governingDocuments: typeof MATTHEWS_GOVERNING_DOCUMENTS | [];
  };
  ask: string;
  draft: ReturnType<typeof parseTransactionDraft>;
  /** Mission item 8 — exportable audit trail. */
  auditTrail: {
    sources: Array<{ id: string; label: string; accession?: string; path?: string }>;
    assumptions: string[];
    calculations: Array<{ label: string; detail: string }>;
    unresolvedConditions: string[];
    gates: Array<{ gate: string; status: string; detail: string }>;
  };
  applicableCovenants: ApplicableCovenantRow[];
  operativeAndAmendmentState: {
    documents: Array<{ id: string; name: string; role: string; accession: string }>;
    amendmentNotes: string[];
    operativeStateStatus: "PARTIAL_LEAF_ENCODED" | "MISSING_PACKAGE";
  };
  debtBasketsAndRatioConditions: Array<{
    code: string;
    kind: "FIXED_DOLLAR" | "RATIO" | "STRUCTURAL" | "GRANDFATHER";
    condition: string;
    modeledRoomMm: number | null;
    remainingPublished: null;
  }>;
  approvedFinancialInputs: {
    ns4ApprovedPresent: false;
    fixtureProvenance: string;
    lines: Array<{ metric: string; value: string; authority: string }>;
    note: string;
  };
  utilizationAndRemaining: {
    attributedEventCount: number;
    attributedAmountMm: number | null;
    supportsRemainingClaim: boolean;
    completenessCertificatePresent: boolean;
    unknownHistoricalActivity: boolean;
    trustedIssuerActivation: string;
    verifiedRemainingUsd: null;
    productionHandoffRefused: boolean;
  };
  pathAndSimulation: {
    pathEnumerationAuthority: string;
    pathCount: number;
    selectedPathId: null;
    verifiedSimulateExecutable: false;
    verifiedSimulateInvoked: true;
    simulationOutcome: string | null;
    refusalSummary: string[];
    certifiedBlockers: string[];
    recipeLimitations: Array<{ code: string; message: string }>;
    modeledScenarioOverall: string | null;
  };
  /**
   * Subsidiary path findings (e.g. modeled SSNL blocked). Never alone decide
   * overall NOT_PERMITTED while other debt/lien alternatives remain unevaluated
   * under certified gates.
   */
  subsidiaryFindings: CfoSubsidiaryFinding[];
  financialEvidenceBinding: {
    requestedEvaluationDate: string;
    supportedFixtureAsOf: string;
    matched: boolean;
    status: "BOUND" | "UNSUPPORTED_DATE" | "NO_PACKAGE";
  };
  /** Mission item 7 — defensible result (never PERMITTED without genuine gates). */
  result: CfoWorkflowResult;
  resultRationale: string;
  customerCanDoToday: string[];
  requiredExternalEvidence: Array<{
    evidence: string;
    whyRequired: string;
    status: "ABSENT" | "PARTIAL_FIXTURE_ONLY";
  }>;
  workflowVerdict:
    | "CUSTOMER_WORKFLOW_DEMONSTRATED"
    | "CUSTOMER_WORKFLOW_PARTIAL"
    | "CUSTOMER_WORKFLOW_BLOCKED_BY_EVIDENCE"
    | "CUSTOMER_WORKFLOW_UNSAFE";
  constraintsHonored: string[];
};

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function classifyBasket(code: string): "FIXED_DOLLAR" | "RATIO" | "STRUCTURAL" | "GRANDFATHER" {
  if (code.includes("1a_flat")) return "FIXED_DOLLAR";
  if (code.includes("ratio") || code.includes("fccr")) return "RATIO";
  if (code.includes("lien") || code.includes("601j")) return "STRUCTURAL";
  if (code.includes("notes") || code.includes("_2_")) return "GRANDFATHER";
  return "RATIO";
}

function decideResult(args: {
  verified: VerifiedSimulateResult;
  hasPackage: boolean;
  draftComplete: boolean;
  financialDateMatched: boolean;
  alternativesFullyCertified: boolean;
}): { result: CfoWorkflowResult; rationale: string } {
  if (!args.hasPackage) {
    return {
      result: "UNSUPPORTED",
      rationale:
        "No authentic debt-document package bound — cannot evaluate secured debt permission.",
    };
  }
  if (!args.financialDateMatched) {
    return {
      result: "NEEDS_INPUT",
      rationale: `Requested evaluation date is not bound to authentic Matthews financial evidence (supported as-of ${MATTHEWS_CFO_SUPPORTED_FINANCIAL_AS_OF} only). Headroom will not silently reuse another period's inputs.`,
    };
  }
  if (!args.draftComplete) {
    return {
      result: "NEEDS_INPUT",
      rationale:
        "Transaction draft missing required fields (date, amount, and/or secured kind). Headroom will not invent them.",
    };
  }
  // Certified path absent → never PERMITTED.
  if (args.verified.executable) {
    // Defensive: should not occur without VEP on this package.
    return {
      result: "REVIEW_REQUIRED",
      rationale:
        "Unexpected verified executable without authenticated Matthews VEP — treat as REVIEW_REQUIRED pending human verification.",
    };
  }
  // Do NOT promote overall NOT_PERMITTED from a single modeled SSNL blockage.
  // Debt Facilities (1)(a), FCCR, Notes grandfather, CA lien companion, and
  // certified dual-path remain unevaluated under CERTIFIED_4E gates.
  if (!args.alternativesFullyCertified) {
    return {
      result: "NEEDS_INPUT",
      rationale:
        "Overall permission is NEEDS_INPUT: relevant debt and lien alternatives have not been fully evaluated under CERTIFIED_4E / verified simulate. Modeled SSNL blockage (if any) is a subsidiary finding only — not an overall NOT_PERMITTED determination. Verified remaining stays null; certified simulation unavailable.",
    };
  }
  return {
    result: "REVIEW_REQUIRED",
    rationale:
      "All alternative path gates unexpectedly reported certified without production authority — REVIEW_REQUIRED pending human verification. Never auto-PERMITTED.",
  };
}

function buildAlternativePathFindings(args: {
  covenants: ApplicableCovenantRow[];
  modeledScenarioBlocked: boolean;
  modeledScenarioOverall: string | null;
  amountMillions: number;
}): CfoSubsidiaryFinding[] {
  const findings: CfoSubsidiaryFinding[] = args.covenants.map((c) => {
    const isLien = c.family === "LIENS";
    let status = "MODELED_LEAF_PRESENT_NOT_CERTIFIED";
    if (c.code.includes("1b_ratio_secured") && (c.modeledCapacityMm ?? 0) <= 0) {
      status = "MODELED_ROOM_ZERO_NOT_OVERALL_REFUSAL";
    }
    if (c.code.includes("601j") && (c.modeledCapacityMm ?? 0) <= 0) {
      status = "STRUCTURAL_ZERO_LIEN_COMPANION_NOT_CERTIFIED";
    }
    if (c.code.includes("_2_notes") || c.code.includes("notes")) {
      status = "GRANDFATHER_NO_NEW_CAPACITY_NOT_CERTIFIED";
    }
    return {
      code: c.code,
      kind: isLien ? "LIEN_COMPANION" : "DEBT_ALTERNATIVE",
      status,
      detail: `${c.sourceCitation} · modeledCapacityMm=${c.modeledCapacityMm} · remaining=null · ${c.authorityStatus}`,
    };
  });
  findings.push({
    code: "MODELED_SSNL_REFINANCING_SCENARIO",
    kind: "MODELED_SCENARIO",
    status: args.modeledScenarioBlocked
      ? "MODELED_SSNL_PATH_BLOCKED"
      : `MODELED_SCENARIO_${(args.modeledScenarioOverall ?? "UNKNOWN").toUpperCase()}`,
    detail: args.modeledScenarioBlocked
      ? `Modeled Indenture secured-net-leverage room is $0 for $${args.amountMillions}M as-of (SSNL already above 3.50x). Subsidiary finding only — not overall NOT_PERMITTED while other debt/lien alternatives remain incompletely certified.`
      : `Modeled refinancing scenario overall=${args.modeledScenarioOverall} — subsidiary; not CERTIFIED_4E.`,
  });
  return findings;
}

/**
 * Run the complete CFO secured-debt workflow for Matthews (or fail-closed without package).
 */
export async function evaluateCfoSecuredDebtWorkflow(
  args: CfoSecuredDebtWorkflowArgs,
): Promise<CfoSecuredDebtWorkflowResult> {
  const ask = args.ask;
  const draft = parseTransactionDraft(ask);
  const amountMillions = args.amountMillions ?? draft.amountMillions ?? 50;
  // Default only to the supported fixture period — never invent another as-of.
  const evaluationDate =
    args.evaluationDate ?? draft.evaluationDate ?? MATTHEWS_CFO_SUPPORTED_FINANCIAL_AS_OF;
  const draftComplete =
    draft.evaluationDate != null &&
    draft.amountMillions != null &&
    (draft.kind === "SECURED_DEBT" || draft.kind === "ACQUISITION") &&
    draft.missingConfirmations.length === 0;

  if (args.omitAuthenticPackage) {
    const verified = await attemptVerifiedSimulate({
      companyId: "unknown-issuer",
      evaluationDate,
      amountMillions,
      kind: "SECURED_DEBT",
      secured: true,
      verifiedPackage: null,
    });
    const pathEnum = enumerateCertifiedPaths({
      verifiedPackage: null,
      transactionKind: "SECURED_DEBT",
      secured: true,
    });
    const decision = decideResult({
      verified,
      hasPackage: false,
      draftComplete,
      financialDateMatched: false,
      alternativesFullyCertified: false,
    });
    return {
      schema: "cfo-secured-debt-workflow.v1",
      evaluatedAt: new Date().toISOString(),
      gitSha: gitSha(),
      package: {
        key: "NONE",
        companyId: "unknown-issuer",
        authenticity: "NONE",
        asOf: evaluationDate,
        governingDocuments: [],
      },
      ask,
      draft,
      auditTrail: {
        sources: [],
        assumptions: ["No authentic package supplied — fail closed."],
        calculations: [],
        unresolvedConditions: ["MISSING_AUTHENTIC_PACKAGE"],
        gates: [
          { gate: "PACKAGE_BINDING", status: "FAIL", detail: "omitAuthenticPackage=true" },
          {
            gate: "CERTIFIED_4E",
            status: pathEnum.authority,
            detail: pathEnum.incompleteReasons.join(",") || "no VEP",
          },
        ],
      },
      applicableCovenants: [],
      operativeAndAmendmentState: {
        documents: [],
        amendmentNotes: ["No governing documents bound."],
        operativeStateStatus: "MISSING_PACKAGE",
      },
      debtBasketsAndRatioConditions: [],
      approvedFinancialInputs: {
        ns4ApprovedPresent: false,
        fixtureProvenance: "none",
        lines: [],
        note: "No financial inputs without a package.",
      },
      utilizationAndRemaining: {
        attributedEventCount: 0,
        attributedAmountMm: 0,
        supportsRemainingClaim: false,
        completenessCertificatePresent: false,
        unknownHistoricalActivity: true,
        trustedIssuerActivation: TRUSTED_ISSUER_ACTIVATION.status,
        verifiedRemainingUsd: null,
        productionHandoffRefused: true,
      },
      pathAndSimulation: {
        pathEnumerationAuthority: pathEnum.authority,
        pathCount: 0,
        selectedPathId: null,
        verifiedSimulateExecutable: false,
        verifiedSimulateInvoked: true,
        simulationOutcome: null,
        refusalSummary: verified.refusalSummary,
        certifiedBlockers: verified.certified.blockers,
        recipeLimitations: [],
        modeledScenarioOverall: null,
      },
      subsidiaryFindings: [],
      financialEvidenceBinding: {
        requestedEvaluationDate: evaluationDate,
        supportedFixtureAsOf: MATTHEWS_CFO_SUPPORTED_FINANCIAL_AS_OF,
        matched: false,
        status: "NO_PACKAGE",
      },
      result: decision.result,
      resultRationale: decision.rationale,
      customerCanDoToday: [
        "See an explicit UNSUPPORTED / fail-closed answer when no authentic package is bound.",
      ],
      requiredExternalEvidence: [
        {
          evidence: "Authentic debt-document package (Indenture + Credit Agreement + financials)",
          whyRequired: "No covenant evaluation without source-backed package binding",
          status: "ABSENT",
        },
      ],
      workflowVerdict: "CUSTOMER_WORKFLOW_BLOCKED_BY_EVIDENCE",
      constraintsHonored: [
        "no fabricated VEP / Phase-3 artifacts",
        "no PERMITTED without genuine gates",
        "verified remaining null",
        "fail-closed on missing package",
      ],
    };
  }

  const fixture = loadMatthewsAuthenticFixture();
  const supportedAsOf = fixture.asOf || MATTHEWS_CFO_SUPPORTED_FINANCIAL_AS_OF;
  const financialDateMatched = evaluationDate === supportedAsOf;

  // Fail closed on unsupported dates BEFORE treating fixture figures as bound.
  if (!financialDateMatched) {
    const verified = await attemptVerifiedSimulate({
      companyId: MATTHEWS_COMPANY_ID,
      evaluationDate,
      amountMillions,
      kind: "SECURED_DEBT",
      secured: true,
      verifiedPackage: null,
    });
    const pathEnum = enumerateCertifiedPaths({
      verifiedPackage: null,
      transactionKind: "SECURED_DEBT",
      secured: true,
    });
    const decision = decideResult({
      verified,
      hasPackage: true,
      draftComplete,
      financialDateMatched: false,
      alternativesFullyCertified: false,
    });
    return {
      schema: "cfo-secured-debt-workflow.v1",
      evaluatedAt: new Date().toISOString(),
      gitSha: gitSha(),
      package: {
        key: MATTHEWS_PACKAGE_KEY,
        companyId: MATTHEWS_COMPANY_ID,
        authenticity: "AUTHENTIC_SOURCE_BACKED",
        asOf: supportedAsOf,
        governingDocuments: MATTHEWS_GOVERNING_DOCUMENTS,
      },
      ask,
      draft,
      auditTrail: {
        sources: MATTHEWS_GOVERNING_DOCUMENTS.map((d) => ({
          id: d.id,
          label: d.name,
          accession: d.accession,
        })),
        assumptions: [
          `Requested evaluationDate=${evaluationDate} does not match fixture asOf=${supportedAsOf}.`,
          "Fail closed — December 31, 2024 financial inputs were NOT silently reused.",
        ],
        calculations: [],
        unresolvedConditions: [
          "FINANCIAL_EVIDENCE_PERIOD_MISMATCH",
          `REQUESTED_EVALUATION_DATE=${evaluationDate}`,
          `SUPPORTED_FIXTURE_AS_OF=${supportedAsOf}`,
        ],
        gates: [
          {
            gate: "FINANCIAL_EVIDENCE_DATE_BINDING",
            status: "FAIL",
            detail: `requested=${evaluationDate}; supported=${supportedAsOf}`,
          },
          {
            gate: "CERTIFIED_4E_PATH_ENUMERATION",
            status: pathEnum.authority,
            detail: pathEnum.incompleteReasons.join("; ") || pathEnum.note,
          },
        ],
      },
      applicableCovenants: [],
      operativeAndAmendmentState: {
        documents: MATTHEWS_GOVERNING_DOCUMENTS.map((d) => ({
          id: d.id,
          name: d.name,
          role: d.role,
          accession: d.accession,
        })),
        amendmentNotes: [
          "Financial period mismatch — covenant arithmetic not evaluated against unbound date.",
        ],
        operativeStateStatus: "PARTIAL_LEAF_ENCODED",
      },
      debtBasketsAndRatioConditions: [],
      approvedFinancialInputs: {
        ns4ApprovedPresent: false,
        fixtureProvenance: `${fixture.label} · accession ${fixture.edgarAccession} · period ${fixture.reportingPeriod} · asOf ${supportedAsOf}`,
        lines: [],
        note: `Fail closed: requested ${evaluationDate} ≠ supported fixture asOf ${supportedAsOf}. Inputs for another period were not applied.`,
      },
      utilizationAndRemaining: {
        attributedEventCount: 0,
        attributedAmountMm: null,
        supportsRemainingClaim: false,
        completenessCertificatePresent: false,
        unknownHistoricalActivity: true,
        trustedIssuerActivation: TRUSTED_ISSUER_ACTIVATION.status,
        verifiedRemainingUsd: null,
        productionHandoffRefused: true,
      },
      pathAndSimulation: {
        pathEnumerationAuthority: pathEnum.authority,
        pathCount: 0,
        selectedPathId: null,
        verifiedSimulateExecutable: false,
        verifiedSimulateInvoked: true,
        simulationOutcome: null,
        refusalSummary: verified.refusalSummary,
        certifiedBlockers: verified.certified.blockers,
        recipeLimitations: [],
        modeledScenarioOverall: null,
      },
      subsidiaryFindings: [
        {
          code: "FINANCIAL_EVIDENCE_PERIOD_MISMATCH",
          kind: "DATE_BINDING",
          status: "UNSUPPORTED_DATE",
          detail: `requested=${evaluationDate}; supportedFixtureAsOf=${supportedAsOf}`,
        },
      ],
      financialEvidenceBinding: {
        requestedEvaluationDate: evaluationDate,
        supportedFixtureAsOf: supportedAsOf,
        matched: false,
        status: "UNSUPPORTED_DATE",
      },
      result: decision.result,
      resultRationale: decision.rationale,
      customerCanDoToday: [
        "See fail-closed NEEDS_INPUT when the requested evaluation date is not the supported Matthews financial evidence period.",
      ],
      requiredExternalEvidence: [
        {
          evidence: `Authentic APPROVED / fixture financial evidence for evaluation date ${evaluationDate}`,
          whyRequired: "Cannot bind covenant arithmetic to an unsupported period",
          status: "ABSENT",
        },
      ],
      workflowVerdict: "CUSTOMER_WORKFLOW_BLOCKED_BY_EVIDENCE",
      constraintsHonored: [
        "no silent reuse of 2024-12-31 inputs for other dates",
        "no PERMITTED without genuine gates",
        "verified remaining forced null",
        "no fabricated Phase-3 / VEP / CERTIFIED_4E",
      ],
    };
  }

  const slice: VerticalSliceEvaluation = evaluateMatthewsVerticalSlice();
  const run = runRealDashboardVerticalSlice();
  const veCandidates = matthewsVerifiedExecutableCandidates();
  const veBridge = compileMatthewsVerifiedExecutableBridge();
  const scenario = evaluateMatthewsScenario(matthewsRefinancing(amountMillions));
  const modeledScenarioBlocked = scenario.overallStatus === "blocked";

  const pathEnum = enumerateCertifiedPaths({
    verifiedPackage: null,
    transactionKind: "SECURED_DEBT",
    secured: true,
  });

  const verified = await attemptVerifiedSimulate({
    companyId: MATTHEWS_COMPANY_ID,
    evaluationDate,
    amountMillions,
    kind: "SECURED_DEBT",
    secured: true,
    verifiedPackage: null,
  });

  const identity = {
    companyId: MATTHEWS_COMPANY_ID,
    instrumentKey: MATTHEWS_PACKAGE_KEY,
    transactionId: `cfo-secured-debt-${amountMillions}m`,
    effectiveAsOf: evaluationDate,
    provenance: {
      source: "cfo-secured-debt-workflow",
      sourceVersion: "cfo-secured-debt.v1",
      approvalRef: null,
    },
    approvalStatus: "HYPOTHETICAL" as const,
  };
  const recipe = recipeSecuredBorrowing(identity, {
    draws: [],
    label: "Secured borrowing without authentic CERTIFIED capacity node ids",
  });

  const applicableCovenants: ApplicableCovenantRow[] = slice.covenants.map((c) => ({
    code: c.code,
    family: c.code.startsWith("ca_lien") ? "LIENS" : "INDEBTEDNESS",
    governingDocument: c.governingDocumentName,
    sourceCitation: `${c.governingDocumentName} — ${c.operativeSection}`,
    formula: c.formulaDescription,
    modeledCapacityMm: c.modeledCapacityMm,
    remainingCapacityMm: null,
    authorityStatus: c.authorityStatus,
    caveats: c.exceptionsOrCaveats ?? [],
  }));

  const subsidiaryFindings = buildAlternativePathFindings({
    covenants: applicableCovenants,
    modeledScenarioBlocked,
    modeledScenarioOverall: scenario.overallStatus,
    amountMillions,
  });

  // Alternatives are never fully CERTIFIED_4E on this package today.
  const alternativesFullyCertified = false;

  const decision = decideResult({
    verified,
    hasPackage: true,
    draftComplete,
    financialDateMatched: true,
    alternativesFullyCertified,
  });

  const unresolvedConditions = [
    "NO_MATTHEWS_VERIFIED_EXECUTION_PACKAGE",
    "NO_UTILIZATION_COMPLETENESS_CERTIFICATE",
    `TRUSTED_ISSUER_ACTIVATION=${TRUSTED_ISSUER_ACTIVATION.status}`,
    `TRUSTED_IDENTITY_PRODUCTION=${TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status}`,
    "CA_LIEN_601J_STRUCTURAL_ZERO_BLOCKS_NEW_LOAN_PARTY_SECURED_LIENS",
    "SECURED_COMPOSITION_HYPOTHETICAL_UNVERIFIED",
    "NS4_APPROVED_SNAPSHOT_ABSENT_FOR_MATTHEWS_OFFLINE_SLICE",
    "DUAL_PATH_DEBT_PLUS_LIEN_NOT_CERTIFIED_4E",
    "ALTERNATIVE_DEBT_LIEN_PATHS_NOT_FULLY_CERTIFIED",
    ...(modeledScenarioBlocked ? ["SUBSIDIARY_MODELED_SSNL_PATH_BLOCKED"] : []),
    ...draft.missingConfirmations.map((m) => `DRAFT_MISSING:${m}`),
  ];

  const requiredExternalEvidence: CfoSecuredDebtWorkflowResult["requiredExternalEvidence"] = [
    {
      evidence: "Phase-3 CERTIFIED IR → VerifiedExecutionPackage for Indenture debt + CA lien companion",
      whyRequired: "CERTIFIED_4E path enumeration and verified simulate require authentic VEP",
      status: "ABSENT",
    },
    {
      evidence: "NS-4 APPROVED financial snapshot bound to evaluation cutoff",
      whyRequired: "Production capacity / ratio recompute under verified gates",
      status: "PARTIAL_FIXTURE_ONLY",
    },
    {
      evidence: "Reviewer-confirmed utilization completeness certificate + trusted issuer activation",
      whyRequired: "Verified remaining publication (UNKNOWN util must not become zero)",
      status: "ABSENT",
    },
    {
      evidence: "Certified as-amended operative state for CA through Sixth Amendment (not leaf-only)",
      whyRequired: "Operative amendment precedence for lien companion",
      status: "PARTIAL_FIXTURE_ONLY",
    },
  ];

  return {
    schema: "cfo-secured-debt-workflow.v1",
    evaluatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    package: {
      key: MATTHEWS_PACKAGE_KEY,
      companyId: MATTHEWS_COMPANY_ID,
      authenticity: "AUTHENTIC_SOURCE_BACKED",
      asOf: slice.asOf,
      governingDocuments: MATTHEWS_GOVERNING_DOCUMENTS,
    },
    ask,
    draft,
    auditTrail: {
      sources: [
        ...MATTHEWS_GOVERNING_DOCUMENTS.map((d) => ({
          id: d.id,
          label: d.name,
          accession: d.accession,
        })),
        {
          id: "matthews-q1-fy2025-slice",
          label: "Authentic financial/utilization fixture",
          path: "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
          accession: fixture.edgarAccession,
        },
        {
          id: "source-excerpts-matthews",
          label: "In-repo reconstructed operative excerpts",
          path: "lib/product/real-dashboard-vertical-slice/source-excerpts-matthews.ts",
        },
      ],
      assumptions: [
        "Evaluation uses AUTHENTIC_SOURCE_BACKED Matthews Q1 FY2025 fixture — not NS-4 APPROVED.",
        "Modeled leaf rooms are NOT verified remaining.",
        "verifiedPackage intentionally null — no Matthews VEP on main.",
        "Secured dual-path CERTIFIED_4E not claimed; CA lien structural zero is leaf-encoded.",
        "Recipe draws empty — capacity node ids not invented.",
        `Vertical-slice verdict: ${run.verdict}`,
      ],
      calculations: [
        ...slice.covenants.map((c) => ({
          label: `${c.code} modeled capacity`,
          detail: `${c.formulaDescription} → modeled=${c.modeledCapacityMm} mm; remaining published=null; authority=${c.authorityStatus}`,
        })),
        {
          label: "VE fixed-dollar bridge (Permitted Debt 1a)",
          detail: `candidates=${veCandidates.length}; compile units feeding Position GROSS only; production remaining refused`,
        },
        {
          label: "Cross-domain modeled refinancing scenario",
          detail: `overallStatus=${scenario.overallStatus} for $${amountMillions}M secured (SSNL room probe)`,
        },
      ],
      unresolvedConditions,
      gates: [
        {
          gate: "FINANCIAL_EVIDENCE_DATE_BINDING",
          status: "BOUND",
          detail: `requested=${evaluationDate}; supported=${supportedAsOf}`,
        },
        {
          gate: "CERTIFIED_4E_PATH_ENUMERATION",
          status: pathEnum.authority,
          detail: pathEnum.incompleteReasons.join("; ") || pathEnum.note,
        },
        {
          gate: "VERIFIED_SIMULATE",
          status: verified.executable ? "EXECUTABLE" : "REFUSED",
          detail: verified.refusalSummary.slice(0, 4).join(" | "),
        },
        {
          gate: "UTILIZATION_COMPLETENESS",
          status: slice.utilization.completenessCertificatePresent ? "PRESENT" : "ABSENT",
          detail: `supportsRemainingClaim=${slice.utilization.supportsRemainingClaim}`,
        },
        {
          gate: "TRUSTED_ISSUER",
          status: TRUSTED_ISSUER_ACTIVATION.status,
          detail: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.reason,
        },
        {
          gate: "NS4_APPROVED_FINANCIALS",
          status: "ABSENT",
          detail: "Offline slice uses UNVERIFIED_EXTRACTION / PUBLIC_FILING_RECONSTRUCTION — not APPROVED",
        },
        {
          gate: "VE_FIXED_DOLLAR_GROSS",
          status: "PARTIAL",
          detail: `Bridge compile present for discovery candidates; feeds SOURCE_BACKED_COMPILED_GROSS only (units=${veBridge.verifiedExecutableUnits.length})`,
        },
        {
          gate: "MODELED_SSNL_SUBSIDIARY",
          status: modeledScenarioBlocked ? "BLOCKED_SUBSIDIARY_ONLY" : String(scenario.overallStatus),
          detail: "Does not alone decide overall NOT_PERMITTED",
        },
      ],
    },
    applicableCovenants,
    operativeAndAmendmentState: {
      documents: MATTHEWS_GOVERNING_DOCUMENTS.map((d) => ({
        id: d.id,
        name: d.name,
        role: d.role,
        accession: d.accession,
      })),
      amendmentNotes: [
        "CA §6.01(j) leaf cites Sixth Amendment restatement (structural zero for NEW Loan-Party liens other than 2024 Notes) — source-backed caveat on modeled leaf.",
        "Full as-amended operative IR package for the credit agreement is NOT product-bound; amendment precedence libraries exist but are not CERTIFIED for this package.",
        "Indenture operative excerpts are AUTHENTIC_EDGAR_RECONSTRUCTED — not a Phase-3 certified operative-state seal.",
      ],
      operativeStateStatus: "PARTIAL_LEAF_ENCODED",
    },
    debtBasketsAndRatioConditions: slice.covenants.map((c) => ({
      code: c.code,
      kind: classifyBasket(c.code),
      condition: c.formulaDescription,
      modeledRoomMm: c.modeledCapacityMm,
      remainingPublished: null,
    })),
    approvedFinancialInputs: {
      ns4ApprovedPresent: false,
      fixtureProvenance: `${fixture.label} · accession ${fixture.edgarAccession} · period ${fixture.reportingPeriod}`,
      lines: (fixture.statementLines ?? []).slice(0, 12).map((l) => ({
        metric: l.label,
        value: String(l.amount),
        authority: "AUTHENTIC_FIXTURE_UNVERIFIED_EXTRACTION",
      })),
      note: "APPROVED NS-4 snapshot not present for this offline demonstration. Fixture figures are shown with non-APPROVED authority labels only.",
    },
    utilizationAndRemaining: {
      attributedEventCount: slice.utilization.attributedEventCount,
      attributedAmountMm: slice.utilization.attributedAmountMm,
      supportsRemainingClaim: slice.utilization.supportsRemainingClaim,
      completenessCertificatePresent: slice.utilization.completenessCertificatePresent,
      unknownHistoricalActivity: slice.utilization.unknownHistoricalActivity,
      trustedIssuerActivation: String(slice.utilization.trustedIssuerActivation),
      verifiedRemainingUsd: null,
      productionHandoffRefused: slice.productionHandoffRefused,
    },
    pathAndSimulation: {
      pathEnumerationAuthority: pathEnum.authority,
      pathCount: pathEnum.paths.length,
      selectedPathId: null,
      verifiedSimulateExecutable: false,
      verifiedSimulateInvoked: true,
      simulationOutcome: null,
      refusalSummary: verified.refusalSummary,
      certifiedBlockers: verified.certified.blockers,
      recipeLimitations: recipe.limitations.map((l) => ({ code: l.code, message: l.message })),
      modeledScenarioOverall: scenario.overallStatus,
    },
    subsidiaryFindings,
    financialEvidenceBinding: {
      requestedEvaluationDate: evaluationDate,
      supportedFixtureAsOf: supportedAsOf,
      matched: true,
      status: "BOUND",
    },
    result: decision.result,
    resultRationale: decision.rationale,
    customerCanDoToday: [
      "Select the authentic Matthews package and ask a dated $50M secured-debt question with structured draft parsing.",
      "Receive every applicable modeled covenant with document name + section citation + formula + authority label.",
      "See operative documents (Indenture + CA + 10-Q) and explicit amendment-state limitations (Sixth Amendment leaf-encoded).",
      "Inspect debt baskets and ratio conditions with modeled rooms and remaining forced null.",
      "Read financial fixture provenance labeled non-APPROVED (never as NS-4 APPROVED).",
      "See utilization completeness absent and verified remaining null — UNKNOWN not treated as zero.",
      "Run verified simulate (REQUIRE bridge) and get an explicit REFUSED outcome with blockers — no silent path invent.",
      "Export a single audit trail JSON covering sources, assumptions, calculations, gates, and unresolved conditions.",
      "Receive NEEDS_INPUT overall until debt/lien alternatives are CERTIFIED — modeled SSNL blockage is subsidiary only; never false PERMITTED.",
      "See fail-closed NEEDS_INPUT when the requested evaluation date is not the supported fixture as-of.",
    ],
    requiredExternalEvidence,
    workflowVerdict: "CUSTOMER_WORKFLOW_PARTIAL",
    constraintsHonored: [
      "no fabricated Phase-3 / VEP / CERTIFIED_4E",
      "no PERMITTED without genuine gates",
      "no overall NOT_PERMITTED from modeled SSNL alone",
      "financial evidence date bound — unsupported dates fail closed",
      "verified remaining forced null",
      "no competing engine — reused vertical slice, VE bridge, path enum, verified simulate, recipes, cross-domain modeled scenario",
      "no Neon writes / no paid inference",
      "no self-merge",
    ],
  };
}
