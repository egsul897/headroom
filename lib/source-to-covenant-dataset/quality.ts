import { detectDuplicates } from "./dedup";
import type { ProvenanceManifest, QualityReport, SourceToCovenantRecord } from "./types";
import { DATASET_SCHEMA_VERSION } from "./types";
import { validateCorpus } from "./validate";

export function buildQualityReport(
  records: readonly SourceToCovenantRecord[],
  provenance: ProvenanceManifest,
): QualityReport {
  const checks: QualityReport["checks"] = [];
  const problems = validateCorpus(records);
  checks.push({
    id: "schema-validation",
    status: problems.length === 0 ? "PASS" : "FAIL",
    detail: problems.length === 0 ? "all records valid" : `${problems.length} validation problems: ${problems.slice(0, 5).map((p) => `${p.exampleId}:${p.code}`).join(", ")}`,
  });

  const dup = detectDuplicates(records);
  checks.push({
    id: "exact-duplicates",
    status: dup.exactDuplicatePairs.length === 0 ? "PASS" : "WARN",
    detail: dup.exactDuplicatePairs.length === 0 ? "no exact duplicate windows" : `${dup.exactDuplicatePairs.length} exact duplicate pair(s) recorded`,
  });
  checks.push({
    id: "near-duplicates",
    status: "PASS",
    detail: `${dup.nearDuplicateClusters.length} near-duplicate cluster(s) detected and tracked`,
  });
  checks.push({
    id: "heldout-issuer-separation",
    status: dup.heldOutContamination.length === 0 ? "PASS" : "FAIL",
    detail: dup.heldOutContamination.length === 0 ? "no train/dev issuer or window leakage into held-out" : `${dup.heldOutContamination.length} contamination finding(s)`,
  });

  const hasPositive = records.some((r) => r.polarity === "POSITIVE");
  const hasNegative = records.some((r) => r.polarity === "NEGATIVE");
  checks.push({
    id: "positive-and-negative",
    status: hasPositive && hasNegative ? "PASS" : "FAIL",
    detail: `positive=${hasPositive} negative=${hasNegative}`,
  });

  const hasUnresolved = records.some((r) => r.output.verificationStatus === "UNRESOLVED" || r.output.verificationStatus === "UNSUPPORTED" || r.role === "UNSUPPORTED_SEMANTICS");
  checks.push({
    id: "unresolved-or-unsupported",
    status: hasUnresolved ? "PASS" : "FAIL",
    detail: hasUnresolved ? "unresolved/unsupported examples present" : "missing unresolved/unsupported examples",
  });

  const independentlyVerified = records.filter((r) => r.output.verificationStatus === "HUMAN_SOURCE_VERIFIED");
  const hypotheses = records.filter((r) =>
    r.output.verificationStatus === "HUMAN_HYPOTHESIS" || r.output.verificationStatus === "MODEL_HYPOTHESIS",
  );
  // Phase 2 integrity: do NOT require HUMAN_SOURCE_VERIFIED counts. Require that
  // hypothesis/unresolved labels exist and that any HUMAN_SOURCE_VERIFIED claim
  // would need independent evidence (enforced in phase2 promote; here we only
  // assert hypotheses are present and we do not silently equate author checks to VERIFIED).
  checks.push({
    id: "verified-vs-hypothesis-distinction",
    status: hypotheses.length > 0 ? "PASS" : "FAIL",
    detail: `independentlyClaimedVerified=${independentlyVerified.length} hypotheses=${hypotheses.length} (Phase-2: independent VERIFIED requires verification_record_id; author source-checks are hypotheses)`,
  });
  checks.push({
    id: "no-unearned-independent-verified",
    status: independentlyVerified.length === 0 ? "PASS" : "WARN",
    detail:
      independentlyVerified.length === 0
        ? "no HUMAN_SOURCE_VERIFIED claims without demonstrated independent review"
        : `${independentlyVerified.length} HUMAN_SOURCE_VERIFIED remain — confirm verificationEvidence.verificationRecordId before treating as GT`,
  });

  const heldOutIssuers = new Set(records.filter((r) => r.split === "eval-heldout").map((r) => r.document.issuerId));
  checks.push({
    id: "heldout-issuer-set",
    status: heldOutIssuers.size >= 2 ? "PASS" : "FAIL",
    detail: `held-out issuers: ${[...heldOutIssuers].sort().join(", ") || "(none)"}`,
  });

  checks.push({
    id: "version-pins-recorded",
    status: provenance.toolVersions.pinsAreNotLabelAuthority ? "PASS" : "FAIL",
    detail: `compiler=${provenance.toolVersions.semanticCompilerAlgorithmVersion}; ir=${provenance.toolVersions.irSchemaVersion}`,
  });

  checks.push({
    id: "safety-no-paid-inference",
    status: provenance.safety.noPaidInferenceUsed ? "PASS" : "FAIL",
    detail: "dataset build used fixture text + human catalog only",
  });

  checks.push({
    id: "safety-no-compiler-as-gt",
    status: provenance.safety.compilerOutputNotUsedAsGroundTruth ? "PASS" : "FAIL",
    detail: "labels authored from source reading; compiler pins are provenance only",
  });

  checks.push({
    id: "claude-acceptance-exclusion",
    status: provenance.safety.claudeAcceptanceCorpusNotContaminated &&
      records.every((r) => r.contaminationRestrictions.excludeFromClaudeAcceptanceCorpus)
      ? "PASS"
      : "FAIL",
    detail: "every record excludes Claude acceptance / verifier / compiler few-shot corpora",
  });

  const completeContext = records.every((r) => r.input.exactText.length >= 40 || r.role === "BOILERPLATE_OR_RESERVED");
  checks.push({
    id: "complete-controlling-context",
    status: completeContext ? "PASS" : "WARN",
    detail: completeContext ? "windows meet minimum controlling-context length" : "one or more windows may be too short",
  });

  const failed = checks.some((c) => c.status === "FAIL");
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    builtAt: new Date().toISOString(),
    checks,
    summary: {
      totalRecords: records.length,
      verifiedLabelCount: independentlyVerified.length,
      hypothesisLabelCount: hypotheses.length,
      unresolvedOrUnsupportedCount: records.filter((r) =>
        r.output.verificationStatus === "UNRESOLVED" ||
        r.output.verificationStatus === "UNSUPPORTED" ||
        r.role === "UNSUPPORTED_SEMANTICS",
      ).length,
      negativeExampleCount: records.filter((r) => r.polarity === "NEGATIVE").length,
      heldOutIssuerCount: heldOutIssuers.size,
      exactDuplicateCount: dup.exactDuplicatePairs.length,
      nearDuplicateClusterCount: dup.nearDuplicateClusters.length,
      readyForImport: !failed,
    },
  };
}
