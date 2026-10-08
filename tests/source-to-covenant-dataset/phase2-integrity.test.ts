import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPhase2Dataset } from "../../lib/source-to-covenant-dataset/phase2-build";
import { auditVerificationClaim } from "../../lib/source-to-covenant-dataset/verification-audit";
import { EXAMPLE_CATALOG } from "../../lib/source-to-covenant-dataset/catalog";
import { buildRecord } from "../../lib/source-to-covenant-dataset/build";
import type { Phase2IntegrityReport, SourceToCovenantRecordV2 } from "../../lib/source-to-covenant-dataset/types-v2";

const REPO = resolve(__dirname, "../..");

describe("phase-2 ground-truth integrity", () => {
  let records: SourceToCovenantRecordV2[];
  let integrityReport: Phase2IntegrityReport;

  beforeAll(() => {
    const built = buildPhase2Dataset(REPO);
    records = built.records;
    integrityReport = built.integrityReport;
  }, 120_000);

  it("demotes HUMAN_SOURCE_VERIFIED when independent review cannot be demonstrated", () => {
    const verifiedSpec = EXAMPLE_CATALOG.find((s) => s.output.verificationStatus === "HUMAN_SOURCE_VERIFIED");
    expect(verifiedSpec).toBeTruthy();
    const record = buildRecord(REPO, verifiedSpec!);
    const audit = auditVerificationClaim(record);
    expect(audit.demoted).toBe(true);
    expect(audit.status).toBe("HUMAN_HYPOTHESIS");
    expect(audit.deliveryVerificationStatus).toBe("HYPOTHESIS");
    expect(audit.verificationEvidence.verificationRecordId).toBeNull();
    expect(audit.verificationEvidence.reviewerId).toBeNull();
    expect(audit.verificationHistory[0]?.fromStatus).toBe("HUMAN_SOURCE_VERIFIED");
  });

  it("builds phase-2 corpus with blocked SFT and zero independently verified labels", () => {
    expect(records.length).toBeGreaterThan(21);
    expect(integrityReport.verificationClaims.independentlyVerifiedAfterAudit).toBe(0);
    expect(integrityReport.verificationClaims.lackingIndependentReview).toBe(records.length);
    expect(integrityReport.eligibility.sftExportBlocked).toBe(true);
    expect(integrityReport.eligibility.sftExportRecordCount).toBe(0);
    expect(integrityReport.eligibility.trainingEligibleCount).toBe(0);
    expect(integrityReport.evaluationBenchmark.compilerOrModelExecuted).toBe(false);
    expect(integrityReport.evaluationBenchmark.performanceMetricsReported).toBe(false);
    expect(integrityReport.importResults.recordsAcceptedForImport).toBe(0);
    expect(integrityReport.expansion.authenticExamplesAdded).toBeGreaterThanOrEqual(200);
  });

  it("separates SOURCE_WINDOW_PRESENT from CONTROLLING_CONTEXT_COMPLETE", () => {
    expect(records.every((r) => r.controllingContextAudit.sourceWindowPresent)).toBe(true);
    expect(records.every((r) => r.controllingContextAudit.completenessNotInferredFromExtractionAlone)).toBe(true);
    const statuses = new Set(records.map((r) => r.controllingContextAudit.status));
    expect(
      statuses.has("SOURCE_WINDOW_PRESENT") || statuses.has("CONTEXT_INCOMPLETE") || statuses.has("CONTROLLING_CONTEXT_COMPLETE"),
    ).toBe(true);
  });

  it("documents duplicate decisions without silent removal", () => {
    expect(integrityReport.duplicates.decisions.length).toBeGreaterThan(0);
    const probe = integrityReport.duplicates.decisions.find((d) => d.classification === "INTENTIONAL_DEDUP_PROBE");
    expect(probe).toBeTruthy();
    expect(records.some((r) => r.exampleId.includes("near-dup-probe"))).toBe(true);
  });

  it("keeps held-out issuer separation and expands authentic examples only", () => {
    const heldIssuers = new Set(records.filter((r) => r.split === "eval-heldout").map((r) => r.document.issuerId));
    const trainIssuers = new Set(records.filter((r) => r.split !== "eval-heldout").map((r) => r.document.issuerId));
    for (const id of heldIssuers) expect(trainIssuers.has(id)).toBe(false);
    expect(integrityReport.expansion.authenticExamplesAdded).toBeGreaterThan(0);
    expect(integrityReport.expansion.issuerTargetMet).toBe(false);
    expect(integrityReport.expansion.issuerGapReason).toMatch(/EDGAR|issuers available/i);
  });

  it("does not invent reviewers", () => {
    for (const r of records) {
      expect(r.verificationEvidence.reviewerId).toBeNull();
      expect(r.independentlyReviewedGroundTruth).toBeNull();
      expect(r.deliveryVerificationStatus).not.toBe("VERIFIED");
    }
  });
});
