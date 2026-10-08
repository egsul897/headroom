/**
 * Phase 3 — independent legal-safety metrics with denominators.
 * Never converts unavailable ground truth into PASS.
 */
import fs from "node:fs";
import path from "node:path";
import { buildExpandedCorpus, measureExtractionAndSafety } from "./phase2-corpus";
import { runFalsePermissionAdversarialControls } from "./phase3-adversarial";
import { buildPackageGraph } from "../../contract-model/compiler/package-graph/pipeline";
import { classifyDocument } from "../../contract-model/compiler/package-graph/document-classifier";

const ROOT = process.cwd();

export type MetricStatus = "MEASURED" | "UNVERIFIED" | "FAIL" | "PASS";

export interface LegalSafetyMetric {
  metricId: string;
  name: string;
  status: MetricStatus;
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
  uncertainty: string;
  groundTruthBasis: string;
  notes: string;
}

export interface DatasetSplitReport {
  development: string[];
  regression: string[];
  heldOut: string[];
  blind: string[];
  partialExcerptsExcludedFromCompleteAgreementCounts: string[];
  note: string;
}

export function buildDatasetSplits(): DatasetSplitReport {
  const corpus = buildExpandedCorpus();
  const development = corpus.documents
    .filter((d) => d.role === "PHASE1_SAMPLE" || d.packageId.includes("gibraltar"))
    .map((d) => d.docId);
  const regression = corpus.documents
    .filter((d) => d.role === "REGRESSION_AUTHENTIC" || d.usedForCompilerTuning)
    .map((d) => d.docId);
  const heldOut = corpus.documents
    .filter((d) => d.role === "EXPANSION_AUTHENTIC" && !d.usedForCompilerTuning)
    .map((d) => d.docId);
  const blind = corpus.documents
    .filter((d) => d.role === "BLIND_RESERVED_UNREAD")
    .map((d) => d.docId);
  const partial = corpus.documents
    .filter((d) => d.role === "PARTIAL_EXCERPT" || d.agreementType === "PARTIAL_EXCERPT")
    .map((d) => d.docId);

  // Ensure Knife River only appears under blind
  if (!blind.includes("knife-river-blind") && corpus.blindReservation.status === "BLIND_BODY_UNREAD") {
    blind.push("knife-river-blind(reserved)");
  }

  return {
    development: [...new Set(development)],
    regression: [...new Set(regression)],
    heldOut: [...new Set(heldOut)],
    blind: [...new Set(blind)],
    partialExcerptsExcludedFromCompleteAgreementCounts: [...new Set(partial)],
    note:
      "Partial excerpts never counted as complete financing agreements. Knife River BLIND body unread. Held-out = expansion authentic not used for compiler tuning when present.",
  };
}

function rate(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Number((n / d).toFixed(4));
}

export function measureLegalSafetyMetrics(): {
  metrics: LegalSafetyMetric[];
  adversarial: ReturnType<typeof runFalsePermissionAdversarialControls>;
  datasetSplits: DatasetSplitReport;
  newlyEvaluatedAuthenticDocuments: Array<{
    docId: string;
    packageId: string;
    role: string;
    sha256: string;
    phase3Probe: "CLASSIFICATION_ONLY" | "HEURISTIC_EXPANSION" | "GT_BACKED";
  }>;
  remainingUnverified: string[];
} {
  const corpus = buildExpandedCorpus();
  const { legalSafetyFindings, extractionMetrics } = measureExtractionAndSafety(corpus.documents);
  const adversarial = runFalsePermissionAdversarialControls();
  const datasetSplits = buildDatasetSplits();

  const metrics: LegalSafetyMetric[] = [];

  // Dangerous omission recall — GT-backed SUP RESTATES + Gibraltar builder dual-cite honesty
  const supBPath =
    "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt";
  let restatesSurfaced = false;
  if (fs.existsSync(path.join(ROOT, supBPath))) {
    const base = path.dirname(path.join(ROOT, supBPath));
    const files = fs.readdirSync(base).filter((f) => f.endsWith(".txt")).sort();
    const docs = files.map((f) => ({
      documentId: f.startsWith("doc-a")
        ? "sup-doc-a"
        : f.startsWith("doc-b")
          ? "sup-doc-b"
          : "sup-doc-c",
      label: f,
      text: fs.readFileSync(path.join(base, f), "utf8"),
    }));
    const g = buildPackageGraph("metrics", "sup", docs);
    restatesSurfaced = g.relationshipCandidates.some(
      (r) =>
        r.relationshipType === "RESTATES" &&
        r.sourceDocumentId === "sup-doc-b" &&
        r.targetDocumentId === "sup-doc-a" &&
        (r.status === "RESOLVED" || r.status === "REVIEW_REQUIRED"),
    );
  }
  // Denominator: GT dangerous-omission claims independently confirmed in Phase-1/2 for this gate
  // D1 RESTATES + (builder dual-cite is source inconsistency, not omission of a relationship)
  metrics.push({
    metricId: "dangerous_omission_recall",
    name: "Dangerous omission recall",
    status: restatesSurfaced ? "PASS" : "FAIL",
    numerator: restatesSurfaced ? 1 : 0,
    denominator: 1,
    rate: rate(restatesSurfaced ? 1 : 0, 1),
    uncertainty:
      "Denominator limited to GT claim D1 (SUP RESTATES) with independent source GT. Broader dangerous-omission inventory across expansion corpus is UNVERIFIED.",
    groundTruthBasis: "docs/final-lightweight-unseen/07-targeted-ground-truth.json claim D1",
    notes: restatesSurfaced
      ? "SUP RESTATES now surfaced (REVIEW_REQUIRED). Historical Phase-1 omission cured at relationship layer on current tip."
      : "SUP RESTATES still silently omitted.",
  });

  // False affirmative permission rate — GT-backed Gibraltar shared_cap
  const sharedCapFixture = path.join(
    ROOT,
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure/pass-a-shared-cap.json",
  );
  const sharedCapCount = fs.existsSync(sharedCapFixture)
    ? (JSON.parse(fs.readFileSync(sharedCapFixture, "utf8")) as unknown[]).length
    : 0;
  const falseAffirmCases = adversarial.cases.filter(
    (c) =>
      c.category === "shared_capacity_without_affirmative_permission" ||
      c.category === "aggregate_limit_not_shared_basket",
  );
  const falseAffirmFails = falseAffirmCases.filter((c) => c.verdict === "FAIL_UNSAFE").length;
  metrics.push({
    metricId: "false_affirmative_permission_rate",
    name: "False affirmative permission rate",
    status: falseAffirmFails > 0 || sharedCapCount >= 51 ? "FAIL" : "PASS",
    numerator: falseAffirmFails,
    denominator: falseAffirmCases.length,
    rate: rate(falseAffirmFails, falseAffirmCases.length),
    uncertainty: `Adversarial denominator=${falseAffirmCases.length}. Gibraltar shared_cap fixture hits=${sharedCapCount} (signal layer; not certified capacity answers). Expansion corpus capacity answers UNVERIFIED.`,
    groundTruthBasis:
      "Phase-1 adjudication LCQG-GIB-FALSE-AFFIRM-SHARED-CAP + ADV-FP-01/02 synthetic controls",
    notes: "Signal-layer false affirmative risk remains. Not PASS.",
  });

  // Amendment relationship accuracy — SUP package GT
  const supDocs = datasetSplits.development.filter((id) => id.startsWith("sup-"));
  let amendCorrect = 0;
  let amendDenom = 0;
  if (fs.existsSync(path.join(ROOT, supBPath))) {
    const base = path.dirname(path.join(ROOT, supBPath));
    const files = fs.readdirSync(base).filter((f) => f.endsWith(".txt")).sort();
    const docs = files.map((f) => ({
      documentId: f.startsWith("doc-a")
        ? "sup-doc-a"
        : f.startsWith("doc-b")
          ? "sup-doc-b"
          : "sup-doc-c",
      label: f,
      text: fs.readFileSync(path.join(base, f), "utf8"),
    }));
    const classifications = docs.map((d) => classifyDocument(d));
    const g = buildPackageGraph("metrics-amend", "sup", docs);
    // GT: doc-b is A&R, doc-c is AMENDMENT, RESTATES b→a surfaced, AMENDS c→b surfaced
    amendDenom = 4;
    if (classifications.find((c) => c.documentId === "sup-doc-b")?.type === "AMENDED_AND_RESTATED_AGREEMENT")
      amendCorrect += 1;
    if (classifications.find((c) => c.documentId === "sup-doc-c")?.type === "AMENDMENT") amendCorrect += 1;
    if (
      g.relationshipCandidates.some(
        (r) =>
          r.relationshipType === "RESTATES" &&
          r.sourceDocumentId === "sup-doc-b" &&
          r.targetDocumentId === "sup-doc-a",
      )
    )
      amendCorrect += 1;
    if (
      g.relationshipCandidates.some(
        (r) =>
          r.relationshipType === "AMENDS" &&
          r.sourceDocumentId === "sup-doc-c" &&
          r.targetDocumentId === "sup-doc-b",
      )
    )
      amendCorrect += 1;
  }
  metrics.push({
    metricId: "amendment_relationship_accuracy",
    name: "Amendment relationship accuracy",
    status: amendDenom === 0 ? "UNVERIFIED" : amendCorrect === amendDenom ? "PASS" : "FAIL",
    numerator: amendDenom ? amendCorrect : null,
    denominator: amendDenom || null,
    rate: amendDenom ? rate(amendCorrect, amendDenom) : null,
    uncertainty:
      "Denominator = 4 SUP GT checks (2 classifications + RESTATES + AMENDS). DSGR/RIOT/CONMED amendment chains lack fresh independent GT this unpaid gate → UNVERIFIED (not scored as PASS).",
    groundTruthBasis: "SUP final-lightweight-unseen GT C2/D1/D2",
    notes: `SUP development docs considered: ${supDocs.join(", ") || "(none)"}`,
  });

  // Operative-version correctness
  metrics.push({
    metricId: "operative_version_correctness",
    name: "Operative-version correctness",
    status: "UNVERIFIED",
    numerator: null,
    denominator: null,
    rate: null,
    uncertainty:
      "RESTATES edge REVIEW_REQUIRED is necessary but not sufficient for CURRENT_OPERATIVE marking. No independent re-certification of supersession index this phase.",
    groundTruthBasis: "Unavailable for CLOSED operative-state claims this unpaid gate",
    notes: "Never convert unavailable GT into PASS.",
  });

  // Cross-reference precision / recall
  const gib = extractionMetrics.gibraltarStructural as {
    referencesDetected?: number;
    referencesResolved?: number;
    referencesUnresolved?: number;
    resolveRate?: number;
  };
  metrics.push({
    metricId: "cross_reference_precision_recall",
    name: "Cross-reference precision and recall",
    status: "UNVERIFIED",
    numerator: gib.referencesResolved ?? null,
    denominator: gib.referencesDetected ?? null,
    rate: gib.resolveRate ?? null,
    uncertainty:
      "Frozen resolve rate is a coverage proxy, NOT precision/recall vs independent xref GT. Precision/recall remain UNVERIFIED.",
    groundTruthBasis: "No exhaustive independent xref GT for Gibraltar",
    notes: `detected=${gib.referencesDetected} resolved=${gib.referencesResolved} unresolved=${gib.referencesUnresolved}`,
  });

  // Proviso attachment
  metrics.push({
    metricId: "proviso_attachment",
    name: "Proviso attachment",
    status: "UNVERIFIED",
    numerator: null,
    denominator: null,
    rate: null,
    uncertainty: "Pass B semantic compile not executed for Gibraltar DEVELOPMENT batch.",
    groundTruthBasis: "Unavailable",
    notes: "UNVERIFIED — not PASS.",
  });

  // Entity-scope fidelity
  metrics.push({
    metricId: "entity_scope_fidelity",
    name: "Entity-scope fidelity",
    status: "UNVERIFIED",
    numerator: null,
    denominator: null,
    rate: null,
    uncertainty: "Source phrase present for §7.08 facility scope; IR entityScope population absent.",
    groundTruthBasis: "Partial source probe only — insufficient for fidelity rate",
    notes: "UNVERIFIED — not PASS.",
  });

  const newlyEvaluatedAuthenticDocuments = corpus.documents
    .filter((d) => !d.phase1Evaluated && d.role !== "BLIND_RESERVED_UNREAD" && d.role !== "PARTIAL_EXCERPT")
    .map((d) => ({
      docId: d.docId,
      packageId: d.packageId,
      role: d.role,
      sha256: d.sha256,
      phase3Probe: "HEURISTIC_EXPANSION" as const,
    }));

  const remainingUnverified = [
    "Operative-version / supersession CURRENT marking after SUP RESTATES REVIEW_REQUIRED.",
    "Exhaustive Gibraltar definition inventory.",
    "Pass B/C/D semantic IR for Gibraltar.",
    "Cross-reference precision/recall (resolve-rate proxy only).",
    "Proviso attachment accuracy.",
    "Entity-scope IR fidelity.",
    "False-affirmative capacity beyond shared_cap signal + ADV-FP adversarial cases.",
    "Comparator-as-capacity refusal on eval branch (module lives on architecture-remediation).",
    "Builder dual-cite dual-handler production fix.",
    "Expansion/regression docs without fresh independent legal GT.",
    "Knife River BLIND body unread by design.",
    `Availability gap vs 25 additional agreements: ${corpus.availability.availabilityGap} (disclosed).`,
    ...legalSafetyFindings
      .filter((f) => f.status === "UNVERIFIED")
      .slice(0, 5)
      .map((f) => `Heuristic UNVERIFIED: ${f.docId} / ${f.issue}`),
  ];

  return {
    metrics,
    adversarial,
    datasetSplits,
    newlyEvaluatedAuthenticDocuments,
    remainingUnverified,
  };
}
