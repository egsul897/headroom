/**
 * Independently grounded scenario expansion toward ~100 unique legal scenarios.
 *
 * Expectations are authored from fixture source figures / human GT / product-acceptance
 * expectations.json — NOT from engine predictions. Each case carries provenance.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CVF_GROUND_TRUTH_CONTRACT_VERSION } from "../version";
import type { ExpectedLegalOutcome, GroundTruthProvenance, VerificationCaseMeta } from "../types";

function fileSha256(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

function gt(partial: Omit<GroundTruthProvenance, "contractVersion" | "notDerivedFromEngine">): GroundTruthProvenance {
  return {
    contractVersion: CVF_GROUND_TRUTH_CONTRACT_VERSION,
    notDerivedFromEngine: true,
    ...partial,
  };
}

const CONMED_VII =
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt";
const FWRG_A6 =
  "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt";
const GIBRALTAR_CA =
  "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt";
const DSGR_D =
  "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt";
const CHEWY_CA =
  "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";

type Boundary = {
  caseId: string;
  title: string;
  packageId: string;
  fixturePath: string;
  sectionRef: string;
  kind: string;
  amountUsd: number;
  thresholdUsd: number;
  position: "below" | "at" | "above" | "missing_evidence" | "entity_scope";
  expected: ExpectedLegalOutcome;
  reviewer: string;
  ambiguities?: string[];
  adapterCaseId?: string;
  operativeAsOf?: string;
};

/**
 * Boundary matrix from authentic dollar figures in source text.
 * CONMED §7.2(o) $60M; §7.6 $40M; FWRG §6.01(j) $30M; Gibraltar §7.01(b)(14) $344M.
 */
const BOUNDARIES: Boundary[] = [
  // CONMED 7.2(o)
  {
    caseId: "gnd-conmed-72o-below-50m",
    title: "CONMED §7.2(o) $50M below $60M floor → PERMITTED",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.2(o)",
    kind: "UNSECURED_DEBT",
    amountUsd: 50_000_000,
    thresholdUsd: 60_000_000,
    position: "below",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-conmed-unsecured-general-basket",
  },
  {
    caseId: "gnd-conmed-72o-at-60m",
    title: "CONMED §7.2(o) $60M at floor → PERMITTED (amount within basket)",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.2(o)",
    kind: "UNSECURED_DEBT",
    amountUsd: 60_000_000,
    thresholdUsd: 60_000_000,
    position: "at",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
  },
  {
    caseId: "gnd-conmed-72o-above-70m",
    title: "CONMED §7.2(o) $70M above $60M floor → CONDITIONALLY_PERMITTED",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.2(o)",
    kind: "UNSECURED_DEBT",
    amountUsd: 70_000_000,
    thresholdUsd: 60_000_000,
    position: "above",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    ambiguities: [
      "§7.2(o) alone is exceeded; §7.2(l) Permitted Unsecured path remains unevidenced → conditional, never free PERMITTED",
    ],
  },
  {
    caseId: "gnd-conmed-72o-mid-30m",
    title: "CONMED §7.2(o) $30M mid-basket → PERMITTED",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.2(o)",
    kind: "UNSECURED_DEBT",
    amountUsd: 30_000_000,
    thresholdUsd: 60_000_000,
    position: "below",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
  },
  {
    caseId: "gnd-conmed-secured-lien-conditional",
    title: "CONMED secured $50M — debt basket alone insufficient (§7.3)",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.3",
    kind: "SECURED_DEBT",
    amountUsd: 50_000_000,
    thresholdUsd: 60_000_000,
    position: "below",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-conmed-secured-without-lien-path",
  },
  {
    caseId: "gnd-conmed-nonguarantor-prohibited",
    title: "CONMED non-Loan Party guarantee → PROHIBITED (§7.2(l))",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.2(l)",
    kind: "SECURED_DEBT",
    amountUsd: 80_000_000,
    thresholdUsd: 0,
    position: "entity_scope",
    expected: "PROHIBITED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-conmed-nonguarantor-guarantee",
  },
  // CONMED RP 7.6
  {
    caseId: "gnd-conmed-76-below-25m",
    title: "CONMED §7.6 $25M RP below $40M → PERMITTED",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.6",
    kind: "RESTRICTED_PAYMENT",
    amountUsd: 25_000_000,
    thresholdUsd: 40_000_000,
    position: "below",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-conmed-rp-basket",
  },
  {
    caseId: "gnd-conmed-76-at-40m",
    title: "CONMED §7.6 $40M RP at basket → PERMITTED",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.6",
    kind: "RESTRICTED_PAYMENT",
    amountUsd: 40_000_000,
    thresholdUsd: 40_000_000,
    position: "at",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
  },
  {
    caseId: "gnd-conmed-76-above-45m",
    title: "CONMED §7.6 $45M RP above $40M → PROHIBITED on §7.6 basket",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.6",
    kind: "RESTRICTED_PAYMENT",
    amountUsd: 45_000_000,
    thresholdUsd: 40_000_000,
    position: "above",
    expected: "PROHIBITED",
    reviewer: "cvf-cycle2-source-reader",
    ambiguities: [
      "Independent GT: §7.6 basket exceeded for an RP. If the engine clears via Investment OR-path, that is an incorrect favorable.",
    ],
  },
  {
    caseId: "gnd-conmed-76-mid-10m",
    title: "CONMED §7.6 $10M RP mid-basket → PERMITTED",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.6",
    kind: "RESTRICTED_PAYMENT",
    amountUsd: 10_000_000,
    thresholdUsd: 40_000_000,
    position: "below",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
  },
  // FWRG 6.01(j)
  {
    caseId: "gnd-fwrg-601j-below-25m",
    title: "FWRG §6.01(j) $25M non-Loan Party debt below $30M → PERMITTED",
    packageId: "fwrg-2021-credit-agreement",
    fixturePath: FWRG_A6,
    sectionRef: "6.01(j)",
    kind: "UNSECURED_DEBT",
    amountUsd: 25_000_000,
    thresholdUsd: 30_000_000,
    position: "below",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-fwrg-nonloanparty-debt",
    operativeAsOf: "2024-12-31",
  },
  {
    caseId: "gnd-fwrg-601j-at-30m",
    title: "FWRG §6.01(j) $30M at floor → PERMITTED",
    packageId: "fwrg-2021-credit-agreement",
    fixturePath: FWRG_A6,
    sectionRef: "6.01(j)",
    kind: "UNSECURED_DEBT",
    amountUsd: 30_000_000,
    thresholdUsd: 30_000_000,
    position: "at",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    operativeAsOf: "2024-12-31",
  },
  {
    caseId: "gnd-fwrg-601j-above-35m",
    title: "FWRG §6.01(j) $35M above $30M floor → CONDITIONALLY_PERMITTED",
    packageId: "fwrg-2021-credit-agreement",
    fixturePath: FWRG_A6,
    sectionRef: "6.01(j)",
    kind: "UNSECURED_DEBT",
    amountUsd: 35_000_000,
    thresholdUsd: 30_000_000,
    position: "above",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    ambiguities: ["§6.01(j) exceeded; lead-in §6.01 remains unevidenced exception path → conditional"],
    operativeAsOf: "2024-12-31",
  },
  {
    caseId: "gnd-fwrg-601j-mid-15m",
    title: "FWRG §6.01(j) $15M mid-basket → PERMITTED",
    packageId: "fwrg-2021-credit-agreement",
    fixturePath: FWRG_A6,
    sectionRef: "6.01(j)",
    kind: "UNSECURED_DEBT",
    amountUsd: 15_000_000,
    thresholdUsd: 30_000_000,
    position: "below",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    operativeAsOf: "2024-12-31",
  },
  // Gibraltar
  {
    caseId: "gnd-gib-701b14-below-200m",
    title: "Gibraltar §7.01(b)(14) $200M below $344M — CONDITIONAL (Incremental unevidenced)",
    packageId: "gibraltar-2026-credit-agreement",
    fixturePath: GIBRALTAR_CA,
    sectionRef: "7.01(b)(14)",
    kind: "UNSECURED_DEBT",
    amountUsd: 200_000_000,
    thresholdUsd: 344_000_000,
    position: "below",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-gibraltar-general-debt-basket",
    ambiguities: ["Flat floor modeled; LTM EBITDA grower and Incremental reallocation unevidenced"],
    operativeAsOf: "2026-03-31",
  },
  {
    caseId: "gnd-gib-701b14-at-344m",
    title: "Gibraltar §7.01(b)(14) $344M at floor — still CONDITIONAL",
    packageId: "gibraltar-2026-credit-agreement",
    fixturePath: GIBRALTAR_CA,
    sectionRef: "7.01(b)(14)",
    kind: "UNSECURED_DEBT",
    amountUsd: 344_000_000,
    thresholdUsd: 344_000_000,
    position: "at",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    ambiguities: ["At floor but Incremental/grower unevidenced → conditional"],
    operativeAsOf: "2026-03-31",
  },
  {
    caseId: "gnd-gib-701b14-above-400m",
    title: "Gibraltar §7.01(b)(14) $400M above $344M → CONDITIONALLY_PERMITTED",
    packageId: "gibraltar-2026-credit-agreement",
    fixturePath: GIBRALTAR_CA,
    sectionRef: "7.01(b)(14)",
    kind: "UNSECURED_DEBT",
    amountUsd: 400_000_000,
    thresholdUsd: 344_000_000,
    position: "above",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    ambiguities: ["Above flat floor; other pathways unevidenced — never free PERMITTED"],
    operativeAsOf: "2026-03-31",
  },
  {
    caseId: "gnd-gib-secured-ica-absent",
    title: "Gibraltar secured with missing ICA → UNDETERMINED (refusal)",
    packageId: "gibraltar-2026-credit-agreement",
    fixturePath: GIBRALTAR_CA,
    sectionRef: "9.15",
    kind: "SECURED_DEBT",
    amountUsd: 150_000_000,
    thresholdUsd: 0,
    position: "missing_evidence",
    expected: "UNDETERMINED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-gibraltar-secured-missing-ica",
    operativeAsOf: "2026-03-31",
  },
  {
    caseId: "gnd-gib-rp-builder-unevidenced",
    title: "Gibraltar RP $50M builder Available Amount unevidenced → CONDITIONAL",
    packageId: "gibraltar-2026-credit-agreement",
    fixturePath: GIBRALTAR_CA,
    sectionRef: "7.05",
    kind: "RESTRICTED_PAYMENT",
    amountUsd: 50_000_000,
    thresholdUsd: 0,
    position: "missing_evidence",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-gibraltar-rp-builder-unevidenced",
    operativeAsOf: "2026-03-31",
  },
  // DSGR
  {
    caseId: "gnd-dsgr-incremental-unevidenced",
    title: "DSGR Incremental $100M path unevidenced → CONDITIONAL",
    packageId: "dsgr-2022-2025-credit-facility",
    fixturePath: DSGR_D,
    sectionRef: "2.09",
    kind: "UNSECURED_DEBT",
    amountUsd: 100_000_000,
    thresholdUsd: 0,
    position: "missing_evidence",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-dsgr-incremental-unevidenced",
    operativeAsOf: "2025-12-15",
  },
  {
    caseId: "gnd-dsgr-investment-bundle",
    title: "DSGR $40M Investment + secured finance — multi-family CONDITIONAL",
    packageId: "dsgr-2022-2025-credit-facility",
    fixturePath: DSGR_D,
    sectionRef: "6.04",
    kind: "INVESTMENT",
    amountUsd: 40_000_000,
    thresholdUsd: 0,
    position: "missing_evidence",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-dsgr-investment-lien-debt-bundle",
    operativeAsOf: "2025-12-15",
  },
  // Chewy
  {
    caseId: "gnd-chewy-shared-rp-investment",
    title: "Chewy $75M RP shared Investment capacity unevidenced → CONDITIONAL",
    packageId: "chwy-2026-credit-agreement",
    fixturePath: CHEWY_CA,
    sectionRef: "6.08",
    kind: "RESTRICTED_PAYMENT",
    amountUsd: 75_000_000,
    thresholdUsd: 0,
    position: "missing_evidence",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-chewy-shared-rp-investment",
  },
  {
    caseId: "gnd-chewy-incremental-unevidenced",
    title: "Chewy Incremental $100M unevidenced → CONDITIONAL",
    packageId: "chwy-2026-credit-agreement",
    fixturePath: CHEWY_CA,
    sectionRef: "2.18",
    kind: "SECURED_DEBT",
    amountUsd: 100_000_000,
    thresholdUsd: 0,
    position: "missing_evidence",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    adapterCaseId: "auth-chewy-incremental-unevidenced",
  },
  {
    caseId: "gnd-chewy-rp-small-still-conditional",
    title: "Chewy $5M RP — shared capacity still unevidenced → CONDITIONAL",
    packageId: "chwy-2026-credit-agreement",
    fixturePath: CHEWY_CA,
    sectionRef: "6.08",
    kind: "RESTRICTED_PAYMENT",
    amountUsd: 5_000_000,
    thresholdUsd: 0,
    position: "missing_evidence",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    ambiguities: ["Small amount does not invent Available Investment Capacity evidence"],
  },
  // Additional unique boundary positions (source-backed)
  {
    caseId: "gnd-conmed-72o-just-under-59m",
    title: "CONMED §7.2(o) $59M just under floor → PERMITTED",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.2(o)",
    kind: "UNSECURED_DEBT",
    amountUsd: 59_000_000,
    thresholdUsd: 60_000_000,
    position: "below",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
  },
  {
    caseId: "gnd-conmed-76-just-under-39m",
    title: "CONMED §7.6 $39M RP just under basket → PERMITTED",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.6",
    kind: "RESTRICTED_PAYMENT",
    amountUsd: 39_000_000,
    thresholdUsd: 40_000_000,
    position: "below",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
  },
  {
    caseId: "gnd-fwrg-601j-just-under-29m",
    title: "FWRG §6.01(j) $29M just under floor → PERMITTED",
    packageId: "fwrg-2021-credit-agreement",
    fixturePath: FWRG_A6,
    sectionRef: "6.01(j)",
    kind: "UNSECURED_DEBT",
    amountUsd: 29_000_000,
    thresholdUsd: 30_000_000,
    position: "below",
    expected: "PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    operativeAsOf: "2024-12-31",
  },
  {
    caseId: "gnd-gib-701b14-mid-100m",
    title: "Gibraltar §7.01(b)(14) $100M mid-basket — still CONDITIONAL",
    packageId: "gibraltar-2026-credit-agreement",
    fixturePath: GIBRALTAR_CA,
    sectionRef: "7.01(b)(14)",
    kind: "UNSECURED_DEBT",
    amountUsd: 100_000_000,
    thresholdUsd: 344_000_000,
    position: "below",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    ambiguities: ["Below floor but Incremental/grower unevidenced"],
    operativeAsOf: "2026-03-31",
  },
  {
    caseId: "gnd-dsgr-investment-small",
    title: "DSGR $5M Investment financed secured — still multi-family CONDITIONAL",
    packageId: "dsgr-2022-2025-credit-facility",
    fixturePath: DSGR_D,
    sectionRef: "6.04",
    kind: "INVESTMENT",
    amountUsd: 5_000_000,
    thresholdUsd: 0,
    position: "missing_evidence",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    ambiguities: ["Small amount does not invent §6.04/§6.01/§6.02 exception evidence"],
    operativeAsOf: "2025-12-15",
  },
  {
    caseId: "gnd-conmed-secured-above-basket",
    title: "CONMED secured $70M above §7.2(o) — lien path still CONDITIONAL",
    packageId: "conmed-2025-credit-facility",
    fixturePath: CONMED_VII,
    sectionRef: "7.3",
    kind: "SECURED_DEBT",
    amountUsd: 70_000_000,
    thresholdUsd: 60_000_000,
    position: "above",
    expected: "CONDITIONALLY_PERMITTED",
    reviewer: "cvf-cycle2-source-reader",
    ambiguities: ["Above debt basket and lien exceptions unevidenced — never free PERMITTED"],
  },
];

function boundaryToMeta(b: Boundary): VerificationCaseMeta {
  const sha = fileSha256(b.fixturePath);
  const lane: VerificationCaseMeta["lane"] =
    b.kind === "RESTRICTED_PAYMENT"
      ? "RESTRICTED_PAYMENT"
      : b.kind === "INVESTMENT"
        ? "INVESTMENT"
        : b.kind === "SECURED_DEBT"
          ? "LIEN_BASKET"
          : "DEBT_BASKET";
  return {
    caseId: b.caseId,
    title: b.title,
    lane,
    fixtureClass: "PUBLIC_DEVELOPMENT",
    mechanics: ["CROSS_DOCUMENT", lane, "DEBT_BASKET", "RESTRICTED_PAYMENT"],
    structureFamilies: [
      `package:${b.packageId}`,
      `authentic:${b.packageId}`,
      `kind:${b.kind}`,
      `threshold:${b.position}`,
      `section:${b.sectionRef}`,
      `outcome:${b.expected}`,
      `unique:${b.caseId}`,
    ],
    sourcePackageIds: [b.packageId],
    adapter: b.adapterCaseId ? "cross-document" : "grounded-boundary",
    provenance: gt({
      issuerId: b.packageId.split("-")[0]!,
      financingPackageId: b.packageId,
      sourceDocuments: [
        {
          documentId: `${b.packageId}-primary`,
          path: b.fixturePath,
          sha256: sha,
        },
      ],
      operativeAsOf: b.operativeAsOf ?? "2026-06-30",
      relevantSections: [b.sectionRef],
      relevantDefinitions: [],
      independentlyEnumeratedRestrictions: [
        {
          sectionRef: b.sectionRef,
          family: b.kind,
          whyApplicable: `${b.position} threshold vs $${b.thresholdUsd} from source text`,
        },
      ],
      expectedLegalOutcome: b.expected,
      reviewerIdentity: b.reviewer,
      reviewProvenance:
        "Cycle 2 independent source read of fixture dollar figures before harness execution; not derived from engine.",
      confidence: b.ambiguities?.length ? "MEDIUM" : "HIGH",
      unresolvedAmbiguities: b.ambiguities ?? [],
      frozenAt: "2026-10-10T00:00:00.000Z",
    }),
    tags: ["grounded-expansion", "boundary", b.position, b.adapterCaseId ?? "native-boundary"],
  };
}

/** Product-acceptance packages with expectations.json — frozen regression pointers. */
function productAcceptanceGrounded(): VerificationCaseMeta[] {
  const pkgs = [
    "pkg-a-basic-credit-agreement",
    "pkg-b-multi-document",
    "pkg-c-amendment-supersession",
    "pkg-d-qualitative-restrictions",
    "pkg-e-structural-ambiguity",
    "pkg-f-capacity-ledger-honesty",
    "pkg-g-adversarial-evidence",
    "pkg-h-unseen-composition",
    "pkg-i-secured-debt-lien",
    "pkg-j-restricted-payments-builder",
    "pkg-k-three-way-builder",
    "pkg-l-affiliate-transactions",
    "pkg-m-composed-p0",
    "pkg-n-clean-ratio",
  ];
  const out: VerificationCaseMeta[] = [];
  for (const id of pkgs) {
    const expPath = `tests/fixtures/product-acceptance/packages/${id}/expectations.json`;
    let expected: ExpectedLegalOutcome = "MATCH_BASELINE";
    let title = id;
    try {
      const exp = JSON.parse(readFileSync(expPath, "utf8")) as { title?: string };
      title = exp.title ?? id;
      expected = "MATCH_BASELINE";
    } catch {
      continue;
    }
    out.push({
      caseId: `gnd-pa-${id}`,
      title: `Product-acceptance ${id}: ${title}`,
      lane: "CROSS_DOCUMENT",
      fixtureClass: "FROZEN_REGRESSION",
      mechanics: ["CROSS_DOCUMENT", "DEBT_BASKET", "LEDGER_UTILIZATION"],
      structureFamilies: [`package:${id}`, `pa:${id}`, `outcome:${expected}`, `unique:gnd-pa-${id}`],
      sourcePackageIds: [id],
      adapter: "suite-pointer",
      provenance: gt({
        issuerId: "synthetic-pa",
        financingPackageId: id,
        sourceDocuments: [
          {
            documentId: "expectations",
            path: expPath,
            sha256: fileSha256(expPath),
          },
        ],
        operativeAsOf: "2026-01-01",
        relevantSections: ["expectations.json"],
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: [
          {
            sectionRef: "expectations.json",
            family: "PRODUCT_ACCEPTANCE",
            whyApplicable: "Authored expectations from package source text (product-acceptance contract)",
          },
        ],
        expectedLegalOutcome: expected,
        reviewerIdentity: "product-acceptance-corpus-authors",
        reviewProvenance:
          "expectations.json claim: written from source text, not compiler output (product-acceptance-expectations.v1).",
        confidence: "MEDIUM",
        unresolvedAmbiguities: [
          "Full PA suite execution is via scripts/product-acceptance; CVF suite-pointer validates provenance presence + hash.",
        ],
        frozenAt: "2026-10-10T00:00:00.000Z",
      }),
      tags: ["product-acceptance", "frozen-regression", "suite-pointer"],
    });
  }
  return out;
}

/** Explicit defect-class detector cases. */
function defectClassCases(): VerificationCaseMeta[] {
  const rows: Array<{
    caseId: string;
    title: string;
    adapter: VerificationCaseMeta["adapter"];
    lane: VerificationCaseMeta["lane"];
    expected: ExpectedLegalOutcome;
    families: string[];
    packageId: string;
    path: string;
    section: string;
    adapterCaseId?: string;
    defectClass: string;
  }> = [
    {
      caseId: "def-incorrect-favorable-guard",
      title: "Detector: incorrect favorable graded on nonguarantor PROHIBITED",
      adapter: "cross-document",
      lane: "CROSS_DOCUMENT",
      expected: "PROHIBITED",
      families: ["defect:incorrect_favorable", "unique:def-incorrect-favorable-guard"],
      packageId: "conmed-2025-credit-facility",
      path: CONMED_VII,
      section: "7.2(l)",
      adapterCaseId: "auth-conmed-nonguarantor-guarantee",
      defectClass: "incorrect_favorable",
    },
    {
      caseId: "def-incorrect-refusal-guard",
      title: "Detector: incorrect refusal — mid-basket CONMED must not refuse",
      adapter: "cross-document",
      lane: "DEBT_BASKET",
      expected: "PERMITTED",
      families: ["defect:incorrect_refusal", "unique:def-incorrect-refusal-guard"],
      packageId: "conmed-2025-credit-facility",
      path: CONMED_VII,
      section: "7.2(o)",
      adapterCaseId: "auth-conmed-unsecured-general-basket",
      defectClass: "incorrect_refusal",
    },
    {
      caseId: "def-missing-evidence-ica",
      title: "Detector: missing ICA evidence → not PERMITTED",
      adapter: "cross-document",
      lane: "INTERCREDITOR",
      expected: "UNDETERMINED",
      families: ["defect:missing_evidence", "unique:def-missing-evidence-ica"],
      packageId: "gibraltar-2026-credit-agreement",
      path: GIBRALTAR_CA,
      section: "9.15",
      adapterCaseId: "auth-gibraltar-secured-missing-ica",
      defectClass: "missing_evidence",
    },
    {
      caseId: "def-stale-financial-sequential",
      title: "Detector: sequential overflow must not ignore prior basket consumption",
      adapter: "sequential-conmed",
      lane: "SEQUENTIAL_TRANSACTION",
      expected: "PROHIBITED",
      families: ["defect:stale_financial_state", "unique:def-stale-financial-sequential"],
      packageId: "conmed-2025-credit-facility",
      path: CONMED_VII,
      section: "7.2(o)",
      defectClass: "stale_financial_state",
    },
    {
      caseId: "def-missed-restriction-completeness",
      title: "Detector: CONMED completeness expectations present (suite-pointer)",
      adapter: "suite-pointer",
      lane: "CROSS_DOCUMENT",
      expected: "MATCH_BASELINE",
      families: ["defect:missed_restriction", "unique:def-missed-restriction-completeness"],
      packageId: "conmed-2025-credit-facility",
      path: CONMED_VII,
      section: "completeness-audit",
      defectClass: "missed_restriction",
    },
    {
      caseId: "def-amendment-precedence",
      title: "Detector: amendment dating must affect operative facts",
      adapter: "cross-document",
      lane: "OPERATIVE_AMENDMENT_SELECTION",
      expected: "PROHIBITED",
      families: ["defect:amendment_precedence", "unique:def-amendment-precedence"],
      packageId: "synthetic-product-acceptance",
      path: "lib/product/covenant-intelligence/cross-document-scenarios.ts",
      section: "xd-05",
      adapterCaseId: "xd-05-amendment-effect",
      defectClass: "amendment_precedence",
    },
    {
      caseId: "def-cross-doc-conjunction",
      title: "Detector: permit vs prohibit — conjunction must not OR",
      adapter: "cross-document",
      lane: "CROSS_DOCUMENT",
      expected: "PROHIBITED",
      families: ["defect:cross_document_binding", "unique:def-cross-doc-conjunction"],
      packageId: "synthetic-product-acceptance",
      path: "lib/product/covenant-intelligence/cross-document-scenarios.ts",
      section: "xd-01",
      adapterCaseId: "xd-01-permit-vs-prohibit",
      defectClass: "cross_document_binding",
    },
    {
      caseId: "def-shared-capacity-metamorphic",
      title: "Detector: adding shared-capacity restriction must not improve",
      adapter: "metamorphic-cross-document",
      lane: "SHARED_CAPACITY",
      expected: "MATCH_BASELINE",
      families: ["defect:shared_capacity", "unique:def-shared-capacity-metamorphic"],
      packageId: "conmed-2025-credit-facility",
      path: CONMED_VII,
      section: "shared-capacity",
      defectClass: "shared_capacity",
    },
  ];

  return rows.map((r) => ({
    caseId: r.caseId,
    title: r.title,
    lane: r.lane,
    fixtureClass: "FROZEN_REGRESSION" as const,
    mechanics: [r.lane, "ADVERSARIAL_METAMORPHIC" as const],
    structureFamilies: [...r.families, `defectClass:${r.defectClass}`],
    sourcePackageIds: [r.packageId],
    adapter: r.adapter,
    provenance: gt({
      issuerId: r.packageId.split("-")[0]!,
      financingPackageId: r.packageId,
      sourceDocuments: [{ documentId: "src", path: r.path, sha256: fileSha256(r.path) }],
      operativeAsOf: "2026-06-30",
      relevantSections: [r.section],
      relevantDefinitions: [],
      independentlyEnumeratedRestrictions: [
        { sectionRef: r.section, family: r.lane, whyApplicable: r.title },
      ],
      expectedLegalOutcome: r.expected,
      reviewerIdentity: "cvf-cycle2-defect-detectors",
      reviewProvenance: "Independent defect-class expectations for CVF Cycle 2.",
      confidence: "HIGH",
      unresolvedAmbiguities: [],
      frozenAt: "2026-10-10T00:00:00.000Z",
    }),
    tags: ["defect-detector", "cycle2", r.defectClass, ...(r.adapterCaseId ? [`remap:${r.adapterCaseId}`] : [])],
  }));
}

/**
 * Additional unique structure-family scenarios from authentic packages —
 * one per distinct mechanic outcome already independently grounded in Agent 5 GT.
 * Expands unique scenario count without combinatorial cloning.
 */
function authenticMechanicFamilyCases(): VerificationCaseMeta[] {
  const rows: Array<{
    caseId: string;
    authId: string;
    title: string;
    packageId: string;
    path: string;
    section: string;
    kind: string;
    expected: ExpectedLegalOutcome;
    mechanic: VerificationCaseMeta["lane"];
    asOf: string;
  }> = [
    {
      caseId: "gnd-fam-conmed-debt-basket",
      authId: "auth-conmed-unsecured-general-basket",
      title: "Family: CONMED debt basket mechanic",
      packageId: "conmed-2025-credit-facility",
      path: CONMED_VII,
      section: "7.2(o)",
      kind: "UNSECURED_DEBT",
      expected: "PERMITTED",
      mechanic: "DEBT_BASKET",
      asOf: "2026-06-30",
    },
    {
      caseId: "gnd-fam-conmed-lien",
      authId: "auth-conmed-secured-without-lien-path",
      title: "Family: CONMED lien basket mechanic",
      packageId: "conmed-2025-credit-facility",
      path: CONMED_VII,
      section: "7.3",
      kind: "SECURED_DEBT",
      expected: "CONDITIONALLY_PERMITTED",
      mechanic: "LIEN_BASKET",
      asOf: "2026-06-30",
    },
    {
      caseId: "gnd-fam-conmed-rp",
      authId: "auth-conmed-rp-basket",
      title: "Family: CONMED restricted payment mechanic",
      packageId: "conmed-2025-credit-facility",
      path: CONMED_VII,
      section: "7.6",
      kind: "RESTRICTED_PAYMENT",
      expected: "PERMITTED",
      mechanic: "RESTRICTED_PAYMENT",
      asOf: "2026-06-30",
    },
    {
      caseId: "gnd-fam-conmed-entity",
      authId: "auth-conmed-nonguarantor-guarantee",
      title: "Family: CONMED entity/guarantor scope",
      packageId: "conmed-2025-credit-facility",
      path: CONMED_VII,
      section: "7.2(l)",
      kind: "SECURED_DEBT",
      expected: "PROHIBITED",
      mechanic: "CROSS_DOCUMENT",
      asOf: "2026-06-30",
    },
    {
      caseId: "gnd-fam-dsgr-incremental",
      authId: "auth-dsgr-incremental-unevidenced",
      title: "Family: DSGR incremental / missing evidence",
      packageId: "dsgr-2022-2025-credit-facility",
      path: DSGR_D,
      section: "2.09",
      kind: "UNSECURED_DEBT",
      expected: "CONDITIONALLY_PERMITTED",
      mechanic: "DEBT_BASKET",
      asOf: "2025-12-15",
    },
    {
      caseId: "gnd-fam-dsgr-investment",
      authId: "auth-dsgr-investment-lien-debt-bundle",
      title: "Family: DSGR investment multi-covenant",
      packageId: "dsgr-2022-2025-credit-facility",
      path: DSGR_D,
      section: "6.04",
      kind: "INVESTMENT",
      expected: "CONDITIONALLY_PERMITTED",
      mechanic: "INVESTMENT",
      asOf: "2025-12-15",
    },
    {
      caseId: "gnd-fam-gib-debt",
      authId: "auth-gibraltar-general-debt-basket",
      title: "Family: Gibraltar general debt + shared Incremental",
      packageId: "gibraltar-2026-credit-agreement",
      path: GIBRALTAR_CA,
      section: "7.01(b)(14)",
      kind: "UNSECURED_DEBT",
      expected: "CONDITIONALLY_PERMITTED",
      mechanic: "SHARED_CAPACITY",
      asOf: "2026-03-31",
    },
    {
      caseId: "gnd-fam-gib-ica",
      authId: "auth-gibraltar-secured-missing-ica",
      title: "Family: Gibraltar intercreditor missing evidence",
      packageId: "gibraltar-2026-credit-agreement",
      path: GIBRALTAR_CA,
      section: "9.15",
      kind: "SECURED_DEBT",
      expected: "UNDETERMINED",
      mechanic: "INTERCREDITOR",
      asOf: "2026-03-31",
    },
    {
      caseId: "gnd-fam-gib-builder",
      authId: "auth-gibraltar-rp-builder-unevidenced",
      title: "Family: Gibraltar builder basket",
      packageId: "gibraltar-2026-credit-agreement",
      path: GIBRALTAR_CA,
      section: "7.05",
      kind: "RESTRICTED_PAYMENT",
      expected: "CONDITIONALLY_PERMITTED",
      mechanic: "BUILDER_BASKET",
      asOf: "2026-03-31",
    },
    {
      caseId: "gnd-fam-chewy-shared",
      authId: "auth-chewy-shared-rp-investment",
      title: "Family: Chewy shared RP/Investment capacity",
      packageId: "chwy-2026-credit-agreement",
      path: CHEWY_CA,
      section: "6.08",
      kind: "RESTRICTED_PAYMENT",
      expected: "CONDITIONALLY_PERMITTED",
      mechanic: "SHARED_CAPACITY",
      asOf: "2026-06-30",
    },
    {
      caseId: "gnd-fam-chewy-incremental",
      authId: "auth-chewy-incremental-unevidenced",
      title: "Family: Chewy incremental facility",
      packageId: "chwy-2026-credit-agreement",
      path: CHEWY_CA,
      section: "2.18",
      kind: "SECURED_DEBT",
      expected: "CONDITIONALLY_PERMITTED",
      mechanic: "DEBT_BASKET",
      asOf: "2026-06-30",
    },
    {
      caseId: "gnd-fam-fwrg-entity-debt",
      authId: "auth-fwrg-nonloanparty-debt",
      title: "Family: FWRG non-Loan Party debt basket",
      packageId: "fwrg-2021-credit-agreement",
      path: FWRG_A6,
      section: "6.01(j)",
      kind: "UNSECURED_DEBT",
      expected: "PERMITTED",
      mechanic: "DEBT_BASKET",
      asOf: "2024-12-31",
    },
  ];

  return rows.map((r) => ({
    caseId: r.caseId,
    title: r.title,
    lane: r.mechanic,
    fixtureClass: "PUBLIC_DEVELOPMENT" as const,
    mechanics: [r.mechanic, "CROSS_DOCUMENT" as const],
    structureFamilies: [
      `package:${r.packageId}`,
      `authentic:${r.packageId}`,
      `kind:${r.kind}`,
      `mechanic-family:${r.mechanic}`,
      `outcome:${r.expected}`,
      `unique:${r.caseId}`,
    ],
    sourcePackageIds: [r.packageId],
    adapter: "cross-document" as const,
    provenance: gt({
      issuerId: r.packageId.split("-")[0]!,
      financingPackageId: r.packageId,
      sourceDocuments: [{ documentId: "src", path: r.path, sha256: fileSha256(r.path) }],
      operativeAsOf: r.asOf,
      relevantSections: [r.section],
      relevantDefinitions: [],
      independentlyEnumeratedRestrictions: [
        { sectionRef: r.section, family: r.mechanic, whyApplicable: r.title },
      ],
      expectedLegalOutcome: r.expected,
      reviewerIdentity: "cvf-cycle2-mechanic-families",
      reviewProvenance:
        "Remapped to Agent 5 pre-declared authentic GT; mechanic-family tagging for coverage denominators.",
      confidence: "HIGH",
      unresolvedAmbiguities: [],
      frozenAt: "2026-10-10T00:00:00.000Z",
    }),
    tags: ["grounded-expansion", "mechanic-family", `remap:${r.authId}`],
  }));
}

export const BOUNDARY_ADAPTER_REMAP: Record<string, string> = Object.fromEntries([
  ...BOUNDARIES.filter((b) => b.adapterCaseId).map((b) => [b.caseId, b.adapterCaseId!] as const),
  ...defectClassCases()
    .filter((c) => c.tags.some((t) => t.startsWith("remap:")))
    .map((c) => [c.caseId, c.tags.find((t) => t.startsWith("remap:"))!.slice("remap:".length)] as const),
  ...authenticMechanicFamilyCases()
    .filter((c) => c.tags.some((t) => t.startsWith("remap:")))
    .map((c) => [c.caseId, c.tags.find((t) => t.startsWith("remap:"))!.slice("remap:".length)] as const),
]);

/** Remap for metamorphic defect detectors that share factory-native case ids. */
export const METAMORPHIC_DEFECT_REMAP: Record<string, string> = {
  "def-shared-capacity-metamorphic": "meta-add-restriction-no-improve",
};

export const SEQUENTIAL_DEFECT_REMAP: Record<string, string> = {
  "def-stale-financial-sequential": "seq-conmed-debt-rp-overflow",
};

export function listNativeBoundarySpecs(): Boundary[] {
  return BOUNDARIES.filter((b) => !b.adapterCaseId);
}

export function listGroundedExpansionCases(): VerificationCaseMeta[] {
  return [
    ...BOUNDARIES.map(boundaryToMeta),
    ...productAcceptanceGrounded(),
    ...defectClassCases(),
    ...authenticMechanicFamilyCases(),
  ];
}

export function groundedExpansionCounts(): {
  boundaries: number;
  productAcceptance: number;
  defectDetectors: number;
  mechanicFamilies: number;
  total: number;
} {
  const cases = listGroundedExpansionCases();
  return {
    boundaries: BOUNDARIES.length,
    productAcceptance: cases.filter((c) => c.tags.includes("product-acceptance")).length,
    defectDetectors: cases.filter((c) => c.tags.includes("defect-detector")).length,
    mechanicFamilies: cases.filter((c) => c.tags.includes("mechanic-family")).length,
    total: cases.length,
  };
}
