/**
 * Phase 2 — expand authentic EDGAR evaluation across shared fixture corpus.
 * Subject to availability. Keeps Blind set unread. Marks tuning packages as
 * REGRESSION_AUTHENTIC (not blind generalization evidence).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();

export type CorpusRole =
  | "PHASE1_SAMPLE"
  | "EXPANSION_AUTHENTIC"
  | "REGRESSION_AUTHENTIC"
  | "PARTIAL_EXCERPT"
  | "BLIND_RESERVED_UNREAD";

export interface CorpusDocument {
  docId: string;
  packageId: string;
  issuer: string;
  agreementType: "CREDIT_AGREEMENT" | "AMENDED_AND_RESTATED_AGREEMENT" | "AMENDMENT" | "GUARANTEE" | "INTERCREDITOR" | "PARTIAL_EXCERPT";
  instrumentClass: "ORIGINAL" | "RESTATEMENT" | "AMENDMENT" | "ANCILLARY" | "EXCERPT";
  complexity: "LOW" | "MEDIUM" | "HIGH";
  role: CorpusRole;
  path: string;
  chars: number;
  sha256: string;
  covenantFamilyHints: string[];
  definedTermDensityProxy: number;
  crossDocument: boolean;
  usedForCompilerTuning: boolean;
  phase1Evaluated: boolean;
}

function sha256File(abs: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

function probe(text: string): { families: string[]; defDensity: number } {
  const families: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["INDEBTEDNESS", /\bIndebtedness\b/],
    ["LIENS", /\bLiens?\b/],
    ["RESTRICTED_PAYMENTS", /Restricted Payments?/i],
    ["INVESTMENTS", /\bInvestments?\b/],
    ["ASSET_SALES", /Asset (Sales?|Dispositions?)/i],
    ["FUNDAMENTAL_CHANGES", /Fundamental Changes/i],
    ["FINANCIAL_COVENANTS", /Financial Covenants?/i],
  ];
  for (const [fam, re] of checks) if (re.test(text)) families.push(fam);
  const defHits = (text.match(/”\s*means\b|\"\s*means\b|means,\s+as of/gi) ?? []).length;
  const defDensity = text.length > 0 ? defHits / (text.length / 10000) : 0;
  return { families, defDensity: Number(defDensity.toFixed(3)) };
}

function addDoc(
  list: CorpusDocument[],
  spec: Omit<CorpusDocument, "chars" | "sha256" | "covenantFamilyHints" | "definedTermDensityProxy"> & {
    abs?: string;
  },
): void {
  const abs = path.join(ROOT, spec.path);
  if (!fs.existsSync(abs)) return;
  const buf = fs.readFileSync(abs);
  // For HTML, still hash; for probes use text if .txt else limited decode
  const text =
    abs.endsWith(".txt") ? buf.toString("utf8") : buf.toString("utf8").slice(0, 500_000);
  const { families, defDensity } = probe(text);
  list.push({
    docId: spec.docId,
    packageId: spec.packageId,
    issuer: spec.issuer,
    agreementType: spec.agreementType,
    instrumentClass: spec.instrumentClass,
    complexity: spec.complexity,
    role: spec.role,
    path: spec.path,
    chars: buf.length,
    sha256: sha256File(abs),
    covenantFamilyHints: families,
    definedTermDensityProxy: defDensity,
    crossDocument: spec.crossDocument,
    usedForCompilerTuning: spec.usedForCompilerTuning,
    phase1Evaluated: spec.phase1Evaluated,
  });
}

export function buildExpandedCorpus(): {
  documents: CorpusDocument[];
  availability: {
    targetAdditionalDistinctAgreements: 25;
    additionalDistinctAvailable: number;
    totalAuthenticDocuments: number;
    phase1Documents: number;
    availabilityGap: number;
    note: string;
  };
  stratifiedCounts: Record<string, Record<string, number>>;
  blindReservation: { issuer: string; status: string; inspected: false };
} {
  const documents: CorpusDocument[] = [];

  // Phase-1 (4)
  addDoc(documents, {
    docId: "gib-doc-a",
    packageId: "gibraltar-2026-credit-agreement",
    issuer: "Gibraltar Industries, Inc.",
    agreementType: "CREDIT_AGREEMENT",
    instrumentClass: "ORIGINAL",
    complexity: "HIGH",
    role: "PHASE1_SAMPLE",
    path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
    crossDocument: false,
    usedForCompilerTuning: false,
    phase1Evaluated: true,
  });
  addDoc(documents, {
    docId: "sup-doc-a",
    packageId: "superior-2022-2025-credit-facility",
    issuer: "Superior Industries International, Inc.",
    agreementType: "CREDIT_AGREEMENT",
    instrumentClass: "ORIGINAL",
    complexity: "HIGH",
    role: "PHASE1_SAMPLE",
    path: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt",
    crossDocument: true,
    usedForCompilerTuning: false,
    phase1Evaluated: true,
  });
  addDoc(documents, {
    docId: "sup-doc-b",
    packageId: "superior-2022-2025-credit-facility",
    issuer: "Superior Industries International, Inc.",
    agreementType: "AMENDED_AND_RESTATED_AGREEMENT",
    instrumentClass: "RESTATEMENT",
    complexity: "HIGH",
    role: "PHASE1_SAMPLE",
    path: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt",
    crossDocument: true,
    usedForCompilerTuning: false,
    phase1Evaluated: true,
  });
  addDoc(documents, {
    docId: "sup-doc-c",
    packageId: "superior-2022-2025-credit-facility",
    issuer: "Superior Industries International, Inc.",
    agreementType: "AMENDMENT",
    instrumentClass: "AMENDMENT",
    complexity: "MEDIUM",
    role: "PHASE1_SAMPLE",
    path: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-c-2025-03-31-first-amendment.txt",
    crossDocument: true,
    usedForCompilerTuning: false,
    phase1Evaluated: true,
  });

  // Expansion / regression authentic
  const extras: Array<Parameters<typeof addDoc>[1]> = [
    {
      docId: "chwy-doc-a",
      packageId: "chwy-2026-credit-agreement",
      issuer: "Chewy, Inc.",
      agreementType: "CREDIT_AGREEMENT",
      instrumentClass: "ORIGINAL",
      complexity: "HIGH",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
      crossDocument: false,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "dsgr-doc-a",
      packageId: "dsgr-2022-2025-credit-facility",
      issuer: "Distribution Solutions Group, Inc.",
      agreementType: "AMENDED_AND_RESTATED_AGREEMENT",
      instrumentClass: "RESTATEMENT",
      complexity: "HIGH",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "dsgr-doc-b",
      packageId: "dsgr-2022-2025-credit-facility",
      issuer: "Distribution Solutions Group, Inc.",
      agreementType: "AMENDMENT",
      instrumentClass: "AMENDMENT",
      complexity: "HIGH",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "dsgr-doc-c",
      packageId: "dsgr-2022-2025-credit-facility",
      issuer: "Distribution Solutions Group, Inc.",
      agreementType: "AMENDMENT",
      instrumentClass: "AMENDMENT",
      complexity: "MEDIUM",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-c-2025-fourth-amendment.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "dsgr-doc-d",
      packageId: "dsgr-2022-2025-credit-facility",
      issuer: "Distribution Solutions Group, Inc.",
      agreementType: "AMENDED_AND_RESTATED_AGREEMENT",
      instrumentClass: "RESTATEMENT",
      complexity: "HIGH",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "riot-doc-a",
      packageId: "riot-2025-2026-credit-facility",
      issuer: "Riot Platforms, Inc.",
      agreementType: "CREDIT_AGREEMENT",
      instrumentClass: "ORIGINAL",
      complexity: "HIGH",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "riot-doc-b",
      packageId: "riot-2025-2026-credit-facility",
      issuer: "Riot Platforms, Inc.",
      agreementType: "AMENDED_AND_RESTATED_AGREEMENT",
      instrumentClass: "RESTATEMENT",
      complexity: "HIGH",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "riot-doc-c",
      packageId: "riot-2025-2026-credit-facility",
      issuer: "Riot Platforms, Inc.",
      agreementType: "AMENDED_AND_RESTATED_AGREEMENT",
      instrumentClass: "RESTATEMENT",
      complexity: "HIGH",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "conmed-eighth-ar",
      packageId: "conmed-2025-credit-facility",
      issuer: "CONMED Corporation",
      agreementType: "AMENDED_AND_RESTATED_AGREEMENT",
      instrumentClass: "RESTATEMENT",
      complexity: "HIGH",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-1-eighth-ar-credit-agreement-2025-06-16.htm",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "conmed-omnibus-2026",
      packageId: "conmed-2025-credit-facility",
      issuer: "CONMED Corporation",
      agreementType: "AMENDMENT",
      instrumentClass: "AMENDMENT",
      complexity: "HIGH",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-1-first-omnibus-amendment-2026-06-01.htm",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "conmed-guarantee",
      packageId: "conmed-2025-credit-facility",
      issuer: "CONMED Corporation",
      agreementType: "GUARANTEE",
      instrumentClass: "ANCILLARY",
      complexity: "MEDIUM",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-2-ar-guarantee-and-collateral-agreement-2025-06-16.htm",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "conmed-second-amend-2022",
      packageId: "conmed-2025-credit-facility",
      issuer: "CONMED Corporation",
      agreementType: "AMENDMENT",
      instrumentClass: "AMENDMENT",
      complexity: "MEDIUM",
      role: "REGRESSION_AUTHENTIC",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-2-second-amendment-2022-08-02.htm",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "conmed-curated-neg-cov",
      packageId: "conmed-2025-credit-facility",
      issuer: "CONMED Corporation",
      agreementType: "PARTIAL_EXCERPT",
      instrumentClass: "EXCERPT",
      complexity: "MEDIUM",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
      crossDocument: false,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "conmed-curated-definitions",
      packageId: "conmed-2025-credit-facility",
      issuer: "CONMED Corporation",
      agreementType: "PARTIAL_EXCERPT",
      instrumentClass: "EXCERPT",
      complexity: "MEDIUM",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt",
      crossDocument: false,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "conmed-curated-omnibus",
      packageId: "conmed-2025-credit-facility",
      issuer: "CONMED Corporation",
      agreementType: "AMENDMENT",
      instrumentClass: "AMENDMENT",
      complexity: "MEDIUM",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/first-omnibus-amendment-2026-curated.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "conmed-curated-guarantee",
      packageId: "conmed-2025-credit-facility",
      issuer: "CONMED Corporation",
      agreementType: "GUARANTEE",
      instrumentClass: "ANCILLARY",
      complexity: "MEDIUM",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/guarantee-and-collateral-agreement-full.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "conmed-curated-second-amend",
      packageId: "conmed-2025-credit-facility",
      issuer: "CONMED Corporation",
      agreementType: "AMENDMENT",
      instrumentClass: "AMENDMENT",
      complexity: "MEDIUM",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/second-amendment-2022-full.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "fwrg-article-6",
      packageId: "fwrg-2021-credit-agreement",
      issuer: "First Watch Restaurant Group, Inc.",
      agreementType: "PARTIAL_EXCERPT",
      instrumentClass: "EXCERPT",
      complexity: "MEDIUM",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
      crossDocument: false,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "fwrg-definitions",
      packageId: "fwrg-2021-credit-agreement",
      issuer: "First Watch Restaurant Group, Inc.",
      agreementType: "PARTIAL_EXCERPT",
      instrumentClass: "EXCERPT",
      complexity: "LOW",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt",
      crossDocument: false,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "lsb-article-6",
      packageId: "lsb-2023-abl-credit-agreement",
      issuer: "LakeShore Bancorp / LSB",
      agreementType: "PARTIAL_EXCERPT",
      instrumentClass: "EXCERPT",
      complexity: "MEDIUM",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "lsb-definitions",
      packageId: "lsb-2023-abl-credit-agreement",
      issuer: "LakeShore Bancorp / LSB",
      agreementType: "PARTIAL_EXCERPT",
      instrumentClass: "EXCERPT",
      complexity: "LOW",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt",
      crossDocument: false,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
    {
      docId: "lsb-intercreditor-joinder",
      packageId: "lsb-2023-abl-credit-agreement",
      issuer: "LakeShore Bancorp / LSB",
      agreementType: "INTERCREDITOR",
      instrumentClass: "ANCILLARY",
      complexity: "LOW",
      role: "PARTIAL_EXCERPT",
      path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/intercreditor-joinder.txt",
      crossDocument: true,
      usedForCompilerTuning: true,
      phase1Evaluated: false,
    },
  ];
  for (const e of extras) addDoc(documents, e);

  const phase1 = documents.filter((d) => d.phase1Evaluated).length;
  const additional = documents.filter((d) => !d.phase1Evaluated).length;
  const targetAdditional = 25;
  const availabilityGap = Math.max(0, targetAdditional - additional);

  const stratifiedCounts: Record<string, Record<string, number>> = {
    issuer: {},
    agreementType: {},
    instrumentClass: {},
    complexity: {},
    role: {},
  };
  for (const d of documents) {
    for (const [dim, key] of [
      ["issuer", d.issuer],
      ["agreementType", d.agreementType],
      ["instrumentClass", d.instrumentClass],
      ["complexity", d.complexity],
      ["role", d.role],
    ] as const) {
      stratifiedCounts[dim][key] = (stratifiedCounts[dim][key] ?? 0) + 1;
    }
  }

  return {
    documents,
    availability: {
      targetAdditionalDistinctAgreements: 25,
      additionalDistinctAvailable: additional,
      totalAuthenticDocuments: documents.length,
      phase1Documents: phase1,
      availabilityGap,
      note:
        availabilityGap > 0
          ? `Shared fixture corpus contains ${additional} additional authentic documents beyond Phase-1 (target was 25). Gap of ${availabilityGap} disclosed; no fabricated documents; Knife River BLIND unread.`
          : "Target additional count met.",
    },
    stratifiedCounts,
    blindReservation: {
      issuer: "Knife River",
      status: "BLIND_BODY_UNREAD",
      inspected: false,
    },
  };
}

/** Lightweight extraction/legal probes on expansion docs — UNVERIFIED without independent GT. */
export function measureExtractionAndSafety(documents: CorpusDocument[]): {
  extractionMetrics: Record<string, unknown>;
  legalSafetyFindings: Array<Record<string, unknown>>;
} {
  const withText = documents.filter((d) => d.path.endsWith(".txt") || d.path.endsWith(".htm"));
  let tocBodyRisk = 0;
  let amendedRestatedCaption = 0;
  let creditAgreementCaption = 0;
  let greaterOfHits = 0;
  let sharedCapacityPhrase = 0;
  let aggregateAmountHits = 0;
  let financialCovenantHits = 0;

  const legalSafetyFindings: Array<Record<string, unknown>> = [];

  for (const d of withText) {
    const abs = path.join(ROOT, d.path);
    const text = fs.readFileSync(abs, "utf8");
    const lower = text.toLowerCase();
    if ((text.match(/ARTICLE\s+I\b/g) ?? []).length >= 2) tocBodyRisk += 1;
    if (/AMENDED AND RESTATED/i.test(text.slice(0, 2500))) amendedRestatedCaption += 1;
    if (/CREDIT AGREEMENT/i.test(text.slice(0, 2500))) creditAgreementCaption += 1;
    const go = (text.match(/greater of/gi) ?? []).length;
    greaterOfHits += go;
    if (lower.includes("shared capacity")) sharedCapacityPhrase += 1;
    const agg = (text.match(/aggregate amount/gi) ?? []).length;
    aggregateAmountHits += agg;
    if (/Financial Covenants?/i.test(text)) financialCovenantHits += 1;

    // Heuristic legal-safety flags (not confirmed defects unless independent GT)
    if (d.docId === "gib-doc-a" && agg > 20 && !lower.includes("shared capacity")) {
      legalSafetyFindings.push({
        kind: "CONFIRMED_DEFECT",
        defectId: "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP",
        issue: "false_affirmative_shared_capacity_signal_risk",
        docId: d.docId,
        status: "FAIL",
        note: "Confirmed in Phase-1 + adjudicated; aggregate-amount mass without shared-capacity phrase.",
      });
    }
    if (d.docId === "sup-doc-b") {
      legalSafetyFindings.push({
        kind: "CONFIRMED_DEFECT",
        defectId: "LCQG-SUP-AMEND-RESTATES-MISSING",
        issue: "wrong_operative_version_risk_via_missing_restates",
        docId: d.docId,
        status: "FAIL",
        note: "Confirmed historical dangerous silence on RESTATES.",
      });
    }
    if (d.role === "REGRESSION_AUTHENTIC" || d.role === "PARTIAL_EXCERPT") {
      legalSafetyFindings.push({
        kind: "HEURISTIC_FLAG",
        issue: "expansion_doc_no_independent_gt_this_gate",
        docId: d.docId,
        status: "UNVERIFIED",
        note: "Present in expansion corpus; no fresh independent legal GT adjudication in Phase-2 unpaid gate.",
      });
    }
  }

  // Gibraltar structure metrics where available
  const gibStructure = path.join(
    ROOT,
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure/structure-summary.json",
  );
  let gibStructural: Record<string, unknown> | null = null;
  if (fs.existsSync(gibStructure)) {
    const s = JSON.parse(fs.readFileSync(gibStructure, "utf8"));
    gibStructural = {
      totalNodes: s.totalNodes,
      definitionsDetected: s.definitionsDetected,
      referencesDetected: s.referencesDetected,
      referencesResolved: s.referencesResolved,
      referencesUnresolved: s.referencesUnresolved,
      resolveRate:
        s.referencesDetected > 0 ? s.referencesResolved / s.referencesDetected : null,
      passACandidates: s.passACandidates,
      tocBodySeparation: "UNVERIFIED_PARTIAL — operative-article-vii recovers long spans; bare refs AMBIGUOUS",
      structuralNodePrecisionRecall: "UNVERIFIED — no full independent node-level GT for Gibraltar",
      covenantDiscoveryRecallSectionLevel: "PASS for Article VII section heads (Phase-1 legally_verified)",
      provisoAttachment: "UNVERIFIED — Pass B not run",
      entityScopeExtraction: "UNVERIFIED for IR population; source phrase present for §7.08",
      amendmentRelationshipAccuracy: "PASS for single-document ORIGINAL absence; FAIL on SUP RESTATES historical",
    };
  }

  return {
    extractionMetrics: {
      documentsProbed: withText.length,
      tocBodyDuplicationRiskDocs: tocBodyRisk,
      amendedRestatedCaptionDocs: amendedRestatedCaption,
      creditAgreementCaptionDocs: creditAgreementCaption,
      greaterOfMentionsTotal: greaterOfHits,
      sharedCapacityPhraseDocs: sharedCapacityPhrase,
      aggregateAmountMentionsTotal: aggregateAmountHits,
      financialCovenantHeadingDocs: financialCovenantHits,
      gibraltarStructural: gibStructural,
      note: "Metrics are offline probes. Precision/recall labeled UNVERIFIED unless independent GT exists.",
    },
    legalSafetyFindings,
  };
}
