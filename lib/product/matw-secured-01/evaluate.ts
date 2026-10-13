/**
 * MATW-SECURED-01 — evaluate authentic operative debt + lien evidence package.
 *
 * Soft constraints (mission):
 * - Do not modify production financial resolver, simulation engine, UI, or permission semantics.
 * - Do not claim CERTIFIED_4E, verified remaining, or transaction permission.
 * - Hand-encoded excerpts are not automatically verified source text.
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MATTHEWS_CREDIT_AGREEMENT_SOURCE,
  MATTHEWS_INDENTURE_SOURCE,
} from "@/lib/product/real-dashboard-vertical-slice/source-excerpts-matthews";
import {
  MATTHEWS_COMPANY_ID,
  MATTHEWS_GOVERNING_DOCUMENTS,
  MATTHEWS_PACKAGE_KEY,
  loadMatthewsAuthenticFixture,
  matthewsCovenantProvisions,
} from "@/lib/product/real-dashboard-vertical-slice/package-matthews";
import type {
  AdversarialCheckResult,
  CompanionStatus,
  MatwReadinessVerdict,
  PathRole,
} from "./types";
import { MATW_SECURED_01_SCHEMA } from "./types";

const BEFORE_AFTER =
  "docs/amendment-chain-research/before-after/matw-am6-lien-601j.json";
const CHAIN_MANIFEST =
  "docs/amendment-chain-research/chains/matthews-2020-third-ar/manifest.json";
const VC004 =
  "docs/amendment-chain-research/verification-candidates/VC-004-permission-narrowing-matw-601j.json";
const ONBOARDING = "docs/matthews-international-onboarding.md";

export type MatwSecured01Package = {
  schema: typeof MATW_SECURED_01_SCHEMA;
  mission: "MATW-SECURED-01";
  evaluatedAt: string;
  startingMainSha: string;
  endingSha: string;
  evaluationDate: string;
  customerQuestion: string;
  companyId: string;
  packageKey: string;
  documentManifest: Array<{
    docId: string;
    role: string;
    title: string;
    accession: string;
    exhibit: string | null;
    sourceUrl: string | null;
    localFixturePath: string | null;
    authenticity: string;
    completeness: string;
    effectiveDateNote: string;
  }>;
  amendmentPrecedence: {
    chainId: string;
    operativeCaVersionClaim: string;
    sixthAmendment: {
      accession: string;
      exhibit: string;
      changeClass: string;
      beforeText: string;
      afterText: string;
      authorityStatus: string;
      permittedAmountDefinitionFate: string;
    };
    am6EffectiveDateStatus: string;
    postEvalAmendmentsExcluded: string[];
    packageCaExcerptFidelity: "FAIL" | "PASS";
    packageCaExcerptDefects: string[];
  };
  sourceCitations: Array<{
    leafCode: string;
    instrument: string;
    sectionRef: string;
    accession: string;
    formulaEncoding: string;
    exactSourceQuoteOrGap: string;
  }>;
  candidatePathMatrix: Array<{
    leafCode: string;
    pathRole: PathRole;
    debtIncurrenceAuthority: string;
    separateLienAuthority: string;
    companionStatus: CompanionStatus;
    ratioOrFixedConditions: string;
    validForNew50mSecured: false | "DEBT_ONLY_UNRESOLVED_LIEN" | "NO";
    notes: string[];
  }>;
  financialUtilizationDependencies: {
    fixturePath: string;
    authenticity: string;
    asOf: string;
    accession: string;
    ns4ApprovedPresent: false;
    completenessCertificatePresent: false;
    unknownHistoricalActivity: true;
    trustedIssuerActivation: "BLOCKED";
    verifiedRemainingClaimable: false;
    attributionDefects: string[];
  };
  independentSemanticVerification: {
    reviewer: "SECOND_AGENT_ADVERSARIAL";
    checks: Array<{
      id: string;
      label: string;
      result: AdversarialCheckResult;
      evidence: string;
    }>;
    disagreementsResolvedBy: "SOURCE_EVIDENCE";
  };
  missingInputsAndLimitations: Array<{
    code: string;
    severity: "BLOCKING" | "MATERIAL" | "INFORMATIONAL";
    detail: string;
  }>;
  readinessVerdict: MatwReadinessVerdict;
  readinessRationale: string;
  nextStageRecommendation: {
    proposePhase3Compile: false;
    reason: string;
    reusableComponents: string[];
    minimumWorkIfSourceUnblocked: string[];
  };
  constraintsHonored: string[];
  claimsRefused: string[];
};

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), rel), "utf8")) as T;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Build the auditable MATW secured-debt evidence package from in-repo sources.
 * Does not invent full EDGAR exhibits or certifications.
 */
export function evaluateMatwSecured01Package(args?: {
  startingMainSha?: string;
  evaluationDate?: string;
}): MatwSecured01Package {
  const startingMainSha =
    args?.startingMainSha ?? "14c805c6412ca36bfe753112abac78fa6c3736fa";
  const evaluationDate = args?.evaluationDate ?? "2024-12-31";
  const fixture = loadMatthewsAuthenticFixture();
  const provisions = matthewsCovenantProvisions();
  const beforeAfter = loadJson<{
    chainId: string;
    amendingDocId: string;
    comparisons: Array<{
      changeClass: string;
      beforeText: string;
      afterText: string | null;
      authority: { status: string; gapReason?: string };
      label: string;
    }>;
  }>(BEFORE_AFTER);
  const manifest = loadJson<{
    chainId: string;
    documents: Array<{
      docId: string;
      role: string;
      title: string;
      accession: string;
      exhibit?: string;
      sourceUrl?: string;
      localFixturePath: string | null;
      effectiveDateProvision?: { status: string };
    }>;
  }>(CHAIN_MANIFEST);
  const vc004 = loadJson<{
    expectedFailClosedBehavior?: string;
    purpose?: string;
  }>(VC004);
  void vc004;

  const am6Compare = beforeAfter.comparisons.find((c) => c.changeClass === "PERMISSION_NARROWING")!;
  const permittedAmountCompare = beforeAfter.comparisons.find((c) => c.changeClass === "DEFINITION");

  const packageCaText = MATTHEWS_CREDIT_AGREEMENT_SOURCE.text;
  const verbatimAfter = am6Compare.afterText ?? "";
  const packageCaExcerptFidelity: "FAIL" | "PASS" =
    packageCaText.includes("Prior Security Interest") &&
    packageCaText.includes("2024 Note Intercreditor Agreement") &&
    packageCaText.includes(verbatimAfter.slice(0, 40))
      ? "PASS"
      : "FAIL";

  const packageCaExcerptDefects = [
    !packageCaText.includes("Prior Security Interest")
      ? "Package CA excerpt omits Am6 condition (y) Prior Security Interest / Security Agreement"
      : null,
    !packageCaText.includes("Intercreditor")
      ? "Package CA excerpt omits Am6 condition (z) ICA subordination"
      : null,
    packageCaText.includes("and no other general basket")
      ? "Package CA excerpt inserts non-operative commentary ('and no other general basket…')"
      : null,
    MATTHEWS_CREDIT_AGREEMENT_SOURCE.edgarAccession === "0000063296-20-000040"
      ? "Package CA accession is base 2020 restatement; operative §6.01(j) text lives in Am6 0001193125-24-224129"
      : null,
    MATTHEWS_INDENTURE_SOURCE.text.includes("aggregate principal amount of $300,000,000")
      ? "Indenture excerpt places $300,000,000 inside Permitted Debt (2); EDGAR (2) is Notes on Issue Date without that dollar figure in-clause"
      : null,
  ].filter((x): x is string => Boolean(x));

  const allLocalNull = manifest.documents.every((d) => d.localFixturePath == null);
  const am6Doc = manifest.documents.find((d) => d.docId === "matw-am6");

  const documentManifest: MatwSecured01Package["documentManifest"] = [
    {
      docId: "matw-2027-second-lien-notes-indenture",
      role: "OPERATIVE_INDENTURE",
      title: MATTHEWS_INDENTURE_SOURCE.label,
      accession: "0001193125-24-228450",
      exhibit: "EX-4.1",
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/63296/000119312524228450/d873825dex41.htm",
      localFixturePath: null,
      authenticity: MATTHEWS_INDENTURE_SOURCE.authenticity,
      completeness: "RECONSTRUCTED_EXCERPT_NOT_FULL_EXHIBIT",
      effectiveDateNote: "Indenture dated 2024-09-27; Issue Date Notes",
    },
    {
      docId: "matw-credit-agreement-2020",
      role: "OPERATIVE_CREDIT_AGREEMENT_BASE",
      title: "Third Amended and Restated Loan Agreement",
      accession: "0000063296-20-000040",
      exhibit: "EX-10.1",
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/63296/000006329620000040/ex101loanagreement.htm",
      localFixturePath: null,
      authenticity: "EDGAR_FILED_BASE_RESTATEMENT",
      completeness: "FULL_TEXT_NOT_IN_GIT",
      effectiveDateNote: "Execution 2020-03-27; pre-Am6 §6.01(j) used Permitted Amount $50M",
    },
    {
      docId: "matw-am6",
      role: "OPERATIVE_AMENDMENT_LIEN_RESTATEMENT",
      title: "Sixth Amendment to Third A&R Loan Agreement",
      accession: "0001193125-24-224129",
      exhibit: "EX-10.2",
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/63296/000119312524224129/d872508dex102.htm",
      localFixturePath: am6Doc?.localFixturePath ?? null,
      authenticity: "SOURCE_BACKED_BEFORE_AFTER_QUOTES",
      completeness: "FULL_TEXT_NOT_IN_GIT",
      effectiveDateNote:
        am6Doc?.effectiveDateProvision?.status ??
        "CONDITIONAL_UNRESOLVED (Note Offering / Security Agreement closing conditions)",
    },
    {
      docId: "matw-10q-2024-12-31",
      role: "FINANCIAL_EVIDENCE",
      title: "Form 10-Q quarter ended 2024-12-31",
      accession: "0000063296-25-000006",
      exhibit: null,
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/63296/000006329625000006/matw-20241231.htm",
      localFixturePath:
        "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
      authenticity: fixture.label,
      completeness: "AUTHENTIC_FIXTURE_COMPLETENESS_NOT_REVIEWER_CONFIRMED",
      effectiveDateNote: `Measurement period / asOf ${fixture.asOf}`,
    },
    ...manifest.documents
      .filter((d) => d.docId !== "matw-am6" && d.docId !== "matw-third-ar")
      .map((d) => ({
        docId: d.docId,
        role: d.role,
        title: d.title,
        accession: d.accession,
        exhibit: d.exhibit ?? null,
        sourceUrl: d.sourceUrl ?? null,
        localFixturePath: d.localFixturePath,
        authenticity: "CHAIN_MANIFEST_RETRIEVED_NOT_IN_GIT",
        completeness: "FULL_TEXT_NOT_IN_GIT",
        effectiveDateNote: d.effectiveDateProvision?.status ?? "UNKNOWN",
      })),
  ];

  const candidatePathMatrix: MatwSecured01Package["candidatePathMatrix"] = [
    {
      leafCode: "ind_permitted_debt_1a_flat",
      pathRole: "DEBT_ALTERNATIVE",
      debtIncurrenceAuthority: "Indenture Permitted Debt (1)(a) — Debt Facilities / QRT flat $1,300M",
      separateLienAuthority:
        "Indenture Permitted Liens (2) ties to (1)(a); CA NEW Loan-Party liens post-Am6 do NOT provide a general companion",
      companionStatus: "INDENTURE_LIEN_LINKED",
      ratioOrFixedConditions: "FLAT_NET_OF_DEBT 1300 vs secured debt outstanding",
      validForNew50mSecured: "DEBT_ONLY_UNRESOLVED_LIEN",
      notes: [
        "Debt basket ≠ permission to grant a new CA lien",
        "Incremental draw under existing first-lien Credit Facility liens is a distinct unresolved path",
      ],
    },
    {
      leafCode: "ind_ratio_debt_fccr",
      pathRole: "DEBT_ALTERNATIVE",
      debtIncurrenceAuthority: "Indenture §4.09(a) FCCR ≥ 2.00x",
      separateLienAuthority: "No Debt Facilities / first-lien automatic companion for Ratio Debt",
      companionStatus: "NO_INDENTURE_LIEN_COMPANION",
      ratioOrFixedConditions: "COVERAGE_RATIO_ROOM threshold 2.0",
      validForNew50mSecured: "NO",
      notes: ["Secured composition with FCCR room is HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION"],
    },
    {
      leafCode: "ind_permitted_debt_1b_ratio_secured",
      pathRole: "DEBT_ADDON",
      debtIncurrenceAuthority: "Indenture Permitted Debt (1)(b)(x) SNLR ≤ 3.50x",
      separateLienAuthority:
        "EDGAR Permitted Liens (2) cites (1)(a) only — package auto-link to first-lien for (1)(b) is overstated",
      companionStatus: "FALSE_OR_OVERSTATED_LIEN_LINK",
      ratioOrFixedConditions: "LEVERAGE_RATIO_ROOM 3.5×EBITDA − netSecured; (1)(b)(y) First Lien 2.50x NOT modeled",
      validForNew50mSecured: "NO",
      notes: ["At 2024-12-31 SNLR already above 3.50x → modeled $0 room"],
    },
    {
      leafCode: "ind_permitted_debt_2_notes",
      pathRole: "DEBT_GRANDFATHER",
      debtIncurrenceAuthority: "Indenture Permitted Debt (2) — Issue-Date Notes",
      separateLienAuthority: "Notes second lien + CA §6.01(j) for 2024 Note Offering only",
      companionStatus: "CA_NOTES_ONLY",
      ratioOrFixedConditions: "FLAT_AMOUNT 300 grandfather; NEW capacity 0",
      validForNew50mSecured: "NO",
      notes: ["Not a growth path for additional $50M"],
    },
    {
      leafCode: "ca_lien_601j_2024notes",
      pathRole: "LIEN_COMPANION",
      debtIncurrenceAuthority: "None — lien exception only",
      separateLienAuthority:
        "CA §6.01(j) as restated by Sixth Amendment — 2024 Note Offering only (y)/(z) conditions",
      companionStatus: "CA_NOTES_ONLY",
      ratioOrFixedConditions: "Structural zero for NEW general Loan-Party secured liens (pre-Am6 $50M basket deleted)",
      validForNew50mSecured: "NO",
      notes: [
        "Customer '$50M' echoes superseded Permitted Amount definition — must not be answered from pre-Am6 (j)",
        "Package leaf threshold 0 / STRUCTURAL_ZERO is directionally correct; excerpt fidelity FAIL",
      ],
    },
  ];

  const independentSemanticVerification: MatwSecured01Package["independentSemanticVerification"] =
    {
      reviewer: "SECOND_AGENT_ADVERSARIAL",
      disagreementsResolvedBy: "SOURCE_EVIDENCE",
      checks: [
        {
          id: "WRONG_DOCUMENT",
          label: "Wrong document",
          result: "FAIL",
          evidence:
            "CA package accession is base 2020; operative (j) is Am6. Notes grant historically cited from 8-K Item 1.01 not Indenture granting clause.",
        },
        {
          id: "WRONG_AMENDMENT_VERSION",
          label: "Wrong amendment version",
          result: "PASS",
          evidence:
            "Eval 2024-12-31 is after Am6 (2024-09-23) and Notes (2024-09-27). Treating pre-Am6 $50M basket as live would FAIL.",
        },
        {
          id: "SECTION_NUMBER_COLLISION",
          label: "Same section number in unrelated documents",
          result: "FAIL",
          evidence: "Indenture Article 6 ≠ CA Article 6; instrument-scoped companion validation incomplete for FCCR/(1)(b).",
        },
        {
          id: "MISSING_DEFINITIONS",
          label: "Missing incorporated definitions",
          result: "FAIL",
          evidence:
            "Package excerpts omit full FCCR / Consolidated EBITDA / 2024 Note Offering / Prior Security Interest / Refinancing Debt (17).",
        },
        {
          id: "SUPERSEDED_PROVISION",
          label: "Superseded provision",
          result: "PASS",
          evidence:
            "Research SOURCE_BACKED PERMISSION_NARROWING correctly identifies Am6 restatement deleting general $50M lien basket (VC-004).",
        },
        {
          id: "DEBT_WITHOUT_LIEN",
          label: "Debt basket without valid lien companion",
          result: "FAIL",
          evidence:
            "FCCR has no PL companion; (1)(b) lien auto-link overstated vs EDGAR PL(2)→(1)(a) only; CA NEW liens Notes-only.",
        },
        {
          id: "WRONG_ENTITY",
          label: "Wrong entity or guarantor",
          result: "UNCERTAIN",
          evidence: "Leaves use empty entityScope; Non-Guarantor sub-cap / Loan Party vs Restricted Subsidiary mapping incomplete.",
        },
        {
          id: "STALE_FINANCIALS",
          label: "Stale financial period",
          result: "PASS",
          evidence: `Fixture asOf ${fixture.asOf} matches evaluationDate ${evaluationDate}; accession ${fixture.edgarAccession}.`,
        },
        {
          id: "MISSING_UTILIZATION",
          label: "Missing historical utilization",
          result: "FAIL",
          evidence:
            "No completeness certificate; Notes $294.799M event mis-tagged to ind_permitted_debt_1a_flat in fixture.",
        },
        {
          id: "UNSUPPORTED_CLASSIFICATION",
          label: "Unsupported classification election",
          result: "FAIL",
          evidence:
            "Indenture §4.10 classify/reclassify and Refinancing Debt (17) not among five leaves; secured-capacity election unsupported.",
        },
      ],
    };

  const readinessVerdict: MatwReadinessVerdict = "BLOCKED_BY_SOURCE_EVIDENCE";

  return {
    schema: MATW_SECURED_01_SCHEMA,
    mission: "MATW-SECURED-01",
    evaluatedAt: new Date().toISOString(),
    startingMainSha,
    endingSha: gitSha(),
    evaluationDate,
    customerQuestion:
      "Can Matthews incur or refinance $50 million of additional secured debt as of the selected evaluation date, and under which operative indebtedness and lien provisions?",
    companyId: MATTHEWS_COMPANY_ID,
    packageKey: MATTHEWS_PACKAGE_KEY,
    documentManifest,
    amendmentPrecedence: {
      chainId: beforeAfter.chainId,
      operativeCaVersionClaim: "Third A&R as amended through Sixth Amendment (product hardcode; not live graph resolution)",
      sixthAmendment: {
        accession: "0001193125-24-224129",
        exhibit: "EX-10.2",
        changeClass: am6Compare.changeClass,
        beforeText: am6Compare.beforeText,
        afterText: verbatimAfter,
        authorityStatus: am6Compare.authority.status,
        permittedAmountDefinitionFate:
          permittedAmountCompare?.authority.status === "PARTIAL"
            ? permittedAmountCompare.authority.gapReason ?? "PARTIAL"
            : "UNKNOWN",
      },
      am6EffectiveDateStatus:
        am6Doc?.effectiveDateProvision?.status ?? "CONDITIONAL_UNRESOLVED",
      postEvalAmendmentsExcluded: [
        "Seventh Amendment (post eval; recital-only closing 2025-05-01 per onboarding)",
        "Eighth Amendment accession 0001193125-26-052745 (post eval; not wired)",
      ],
      packageCaExcerptFidelity,
      packageCaExcerptDefects,
    },
    sourceCitations: provisions.map((p) => ({
      leafCode: p.code,
      instrument: p.documentId,
      sectionRef: p.sectionRef,
      accession:
        MATTHEWS_GOVERNING_DOCUMENTS.find((d) => d.id === p.documentId)?.accession ?? "UNKNOWN",
      formulaEncoding: `${p.formulaType}:${p.thresholdValue}`,
      exactSourceQuoteOrGap:
        p.code === "ca_lien_601j_2024notes"
          ? `SOURCE_BACKED Am6 after-text available in ${BEFORE_AFTER}; package excerpt fidelity=${packageCaExcerptFidelity}`
          : p.code === "ind_permitted_debt_1a_flat"
            ? "Indenture excerpt includes (1)(a) $1,300,000,000 — authenticity AUTHENTIC_EDGAR_RECONSTRUCTED_EXCERPT (not full exhibit)"
            : `Encoded from ${ONBOARDING} / package-matthews; reconstructed excerpt — not full EDGAR`,
    })),
    candidatePathMatrix,
    financialUtilizationDependencies: {
      fixturePath: "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
      authenticity: fixture.label,
      asOf: fixture.asOf,
      accession: fixture.edgarAccession,
      ns4ApprovedPresent: false,
      completenessCertificatePresent: false,
      unknownHistoricalActivity: true,
      trustedIssuerActivation: "BLOCKED",
      verifiedRemainingClaimable: false,
      attributionDefects: [
        "2027 Notes outstanding event tagged applicableProvisionId=ind_permitted_debt_1a_flat but Notes are Permitted Debt (2)",
        "Point-in-time balances ≠ attributed issuance/repayment ledger",
      ],
    },
    independentSemanticVerification,
    missingInputsAndLimitations: [
      {
        code: "FULL_EDGAR_EXHIBITS_NOT_IN_GIT",
        severity: "BLOCKING",
        detail: `allLocalFixturePathNull=${allLocalNull}; Indenture/CA/Am6 full HTML not committed`,
      },
      {
        code: "PACKAGE_CA_EXCERPT_FIDELITY_FAIL",
        severity: "BLOCKING",
        detail: packageCaExcerptDefects.join("; "),
      },
      {
        code: "AM6_EFFECTIVE_DATE_CONDITIONAL_UNRESOLVED",
        severity: "MATERIAL",
        detail: "Closing conditions (Security Agreement / Note Offering) not proven from calendar alone",
      },
      {
        code: "DEBT_LIEN_COMPANION_GAPS",
        severity: "BLOCKING",
        detail: "FCCR/(1)(b) lack valid secured companions; CA NEW liens Notes-only after Am6",
      },
      {
        code: "REFINANCING_DEBT_17_UNMODELED",
        severity: "MATERIAL",
        detail: "Indenture Permitted Debt (17) Refinancing Debt exists in EDGAR and is not among the five leaves",
      },
      {
        code: "NO_NS4_APPROVED_OR_UTIL_COMPLETENESS",
        severity: "MATERIAL",
        detail: "Blocks verified remaining — not required to refuse false PERMITTED on lien grounds",
      },
      {
        code: "SECURED_COMPOSITION_HYPOTHETICAL",
        severity: "INFORMATIONAL",
        detail: "Indenture debt rooms must not be published as verified secured remaining",
      },
    ],
    readinessVerdict,
    readinessRationale:
      "Full EDGAR exhibits for Indenture/CA/Am6 are not in-repo; package CA §6.01(j) excerpt fails SOURCE_BACKED fidelity; debt baskets are not valid alternatives for NEW $50M secured without matching lien authority. Independent adversarial review fails multiple required checks. Do not claim Phase-3-ready operative package, CERTIFIED_4E, verified remaining, or PERMITTED.",
    nextStageRecommendation: {
      proposePhase3Compile: false,
      reason: "Operative package not independently verified — Phase E compile proposal withheld per mission gate",
      reusableComponents: [
        "lib/contract-model/compiler (semantic compile / discovery)",
        "lib/contract-model/phase3-certification (certifyCandidate, phase4-adapter)",
        "lib/product/real-dashboard-vertical-slice/verified-executable-compile-bridge (fixed-dollar GROSS only)",
        "lib/product/north-star-workflow/verified-path-enumeration",
        "lib/product/unified-position/certified-simulate-bridge",
        "docs/amendment-chain-research/* (SOURCE_BACKED before/after)",
      ],
      minimumWorkIfSourceUnblocked: [
        "Commit hashed full EDGAR fixtures: Indenture Ex 4.1 + Am6 Ex 10.2 (+ governing CA restatement body)",
        "Replace package CA §6.01(j) excerpt with verbatim Am6 after-text including (y)/(z) — separate future mission; not done here (permission-semantics freeze)",
        "Correct debt/lien companions to EDGAR (PL(2)↔(1)(a) only; no false 1b/FCCR secured companions)",
        "Evidence Am6 effectiveness or carry CONDITIONAL_UNRESOLVED explicitly into IR",
        "Fix utilization attribution (Notes ≠ (1)(a)); include or explicitly refuse Refinancing Debt (17)",
        "Only then: Phase-3 compile authentic debt + lien units → VEP (reuse existing compiler/adapter; no new engine)",
      ],
    },
    constraintsHonored: [
      "no modification of production financial resolver / simulation engine / UI / permission semantics",
      "no synthetic fixture results used as authentic EDGAR exhibits",
      "no CERTIFIED_4E / verified remaining / PERMITTED claim",
      "hand-encoded excerpts not treated as automatically verified source text",
      "no self-merge / no production-authority activation / no parallel architecture",
      `evidence hashes: indentureExcerpt=${sha256(MATTHEWS_INDENTURE_SOURCE.text).slice(0, 16)}… caExcerpt=${sha256(packageCaText).slice(0, 16)}… am6After=${sha256(verbatimAfter).slice(0, 16)}…`,
      `onboardingPresent=${existsSync(join(process.cwd(), ONBOARDING))}`,
    ],
    claimsRefused: [
      "CERTIFIED_4E",
      "verified remaining",
      "transaction PERMITTED",
      "AUTHENTIC_OPERATIVE_PACKAGE_READY_FOR_PHASE3",
      "pre-Am6 $50M Permitted Amount lien basket still available",
    ],
  };
}
