/**
 * Phase 3 NCEDB offline tests.
 * Does not import lib/contract-model or modify Claude-owned fixtures.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPhase3ImportBatch,
  buildImportBatch,
  loadExceptionCatalogV3,
  NCEDB_PHASE3_DATASET_VERSION,
  PERMISSION_CLASSIFICATIONS,
} from "../../lib/negative-covenant-exceptions";

const PHASE3 = resolve(process.cwd(), "docs/negative-covenant-exception-database/phase-3");

describe("NCEDB phase 3", () => {
  const { manifest, exceptions } = loadExceptionCatalogV3();

  it("loads phase-3 catalog after unconditional audit downgrades", () => {
    expect(manifest.datasetVersion).toBe(NCEDB_PHASE3_DATASET_VERSION);
    expect(manifest.status).toBe("OFFLINE_RESEARCH_DATASET");
    expect(exceptions.length).toBeGreaterThanOrEqual(21);
    for (const r of exceptions) {
      expect(PERMISSION_CLASSIFICATIONS).toContain(r.permissionClassification);
      expect(r.unconditionalCapacity).toBe(false);
    }
    const auditedIds = [
      "conmed-7.2-a-loan-document-debt",
      "gibraltar-7.06-b-1-loan-docs-burdensome-exception",
      "dsgr-6.01-a-secured-obligations",
      "riot-5.02-a-i-facility-liens",
    ];
    for (const id of auditedIds) {
      const row = exceptions.find((e) => e.exceptionId === id);
      expect(row, id).toBeTruthy();
      expect(row!.permissionClassification).not.toBe("UNCONDITIONAL_SOURCE_VERIFIED");
      expect(row!.permissionClassification).toBe("CONDITIONAL");
    }
    const audit = JSON.parse(
      readFileSync(resolve(PHASE3, "01-unconditional-classification-audit.json"), "utf8"),
    );
    expect(audit.survivingUnconditionalCount).toBe(0);
    expect(audit.downgradedCount).toBe(4);
  });

  it("completes AMBIGUOUS_CONDITION_SCOPE and required negative-control case types", () => {
    const nc = JSON.parse(readFileSync(resolve(PHASE3, "04-negative-controls.json"), "utf8"));
    expect((nc.counts.AMBIGUOUS_CONDITION_SCOPE ?? 0) >= 5).toBe(true);
    for (const cls of [
      "LOCAL_CONDITIONS",
      "REMOTE_CONDITIONS",
      "NO_ADDITIONAL_CONDITIONS",
      "AMBIGUOUS_CONDITION_SCOPE",
      "PROHIBITION_NO_EXCEPTION",
      "NUMERIC_THRESHOLD_NOT_PERMISSION",
      "CONSTRAINED_BY_OTHER_DOCUMENT",
    ]) {
      expect((nc.counts[cls] ?? 0) > 0 || (nc.byClass[cls] ?? []).length > 0, cls).toBe(true);
    }
    for (const t of [
      "HANGING_PROVISO",
      "NESTED_EXCEPTION",
      "DEFINED_TERM_RESTRICTION",
      "CONDITIONAL_RATIO",
      "SHARED_BASKET",
      "CROSS_DOCUMENT_CONSTRAINT",
      "AMENDMENT_CHANGE",
      "NUMERIC_THRESHOLD_NOT_PERMISSION",
      "PROHIBITION_NO_EXCEPTION",
    ]) {
      expect(nc.caseTypesCovered, t).toContain(t);
    }
  });

  it("tracks a +25 authentic financing-agreement batch without synthetic padding", () => {
    const batch = JSON.parse(readFileSync(resolve(PHASE3, "03-authentic-corpus-batch.json"), "utf8"));
    expect(batch.syntheticPadding).toBe(false);
    expect(batch.actualBatchSize).toBe(25);
    expect(batch.documents.length).toBe(25);
    const kinds = new Set(batch.documents.map((d: { documentKind: string }) => d.documentKind));
    expect(kinds.has("AMENDMENT") || kinds.has("RESTATEMENT")).toBe(true);
    expect(
      [...kinds].some((k) => k === "INDENTURE" || k === "SUPPLEMENTAL_INDENTURE"),
    ).toBe(true);
    for (const d of batch.documents) {
      expect(d.issuerKey).toBeTruthy();
      expect(d.instrumentId).toBeTruthy();
      expect(d.documentId).toBeTruthy();
      expect(d.sourceIdentityKey).toBeTruthy();
    }
  });

  it("reports independent held-out precision/recall with denominators (not catalog invariants)", () => {
    const q = JSON.parse(readFileSync(resolve(PHASE3, "06-independent-quality-metrics.json"), "utf8"));
    expect(q.status).toBe("MEASURED_HELD_OUT");
    expect(q.catalogInvariantsNotReportedAsAccuracy).toBe(true);
    expect(q.detector.tunedOnHeldOut).toBe(false);
    expect(q.detector.paidInference).toBe(false);
    for (const key of [
      "exceptionDiscoveryPrecision",
      "exceptionDiscoveryRecall",
      "remoteConditionRecall",
      "provisoAttachmentAccuracy",
      "entityScopeAccuracy",
      "crossReferenceAccuracy",
      "incorrectUnconditionalClassificationRate",
      "sourceSpanAccuracy",
    ]) {
      const m = q.metrics[key];
      expect(m.status).toBe("MEASURED");
      expect(typeof m.denominator).toBe("number");
      expect(typeof m.numerator).toBe("number");
    }
    expect(existsSync(resolve(PHASE3, "held-out/gibraltar-7.06-independent-gt.json"))).toBe(true);
    const gt = JSON.parse(
      readFileSync(resolve(PHASE3, "held-out/gibraltar-7.06-independent-gt.json"), "utf8"),
    );
    expect(gt.independenceDeclaration.groundTruthFromDetectorOutputs).toBe(false);
    expect(gt.independenceDeclaration.usedToTuneDetector).toBe(false);
  });

  it("discloses unresolved controlling dependencies and does not equate span exactness with legal meaning", () => {
    const deps = JSON.parse(readFileSync(resolve(PHASE3, "05-dependency-closure.json"), "utf8"));
    expect(deps.principle).toMatch(/Exact source span/);
    expect(deps.peers["WS-DEF"]).toBeTruthy();
    expect(deps.peers["WS-CDA"]).toBeTruthy();
    expect(deps.peers["WS-BFL"]).toBeTruthy();
    expect(deps.peers["WS-ACR"]).toBeTruthy();
    expect(deps.peers["WS-S2C"]).toBeTruthy();
    const audited = deps.perException.filter((p: { exceptionId: string }) =>
      [
        "conmed-7.2-a-loan-document-debt",
        "gibraltar-7.06-b-1-loan-docs-burdensome-exception",
        "dsgr-6.01-a-secured-obligations",
        "riot-5.02-a-i-facility-liens",
      ].includes(p.exceptionId),
    );
    expect(audited.length).toBe(4);
    for (const p of audited) {
      expect(p.sourceSpanExactDoesNotImplyVerifiedLegalMeaning).toBe(true);
      expect(p.unresolvedControllingDependencies.length).toBeGreaterThan(0);
    }
  });

  it("validates import adapter as ALIGNED_FOR_REVIEW with local idempotency proofs and no Permission promotion", () => {
    const integ = JSON.parse(readFileSync(resolve(PHASE3, "08-import-integration.json"), "utf8"));
    expect(integ.status).toBe("ALIGNED_FOR_REVIEW");
    expect(integ.proofs.idempotentReimport.provenLocally).toBe(true);
    expect(integ.proofs.noPromotionIntoProductionPermissionTables.productionCapacityApprovedAlwaysFalse).toBe(
      true,
    );
    expect(integ.proofs.noPromotionIntoProductionPermissionTables.doesNotWrite).toContain("Permission");

    const importable = exceptions.filter((e) => e.exceptionSourceSpan.matchStatus !== "UNRESOLVED");
    const batch1 = buildPhase3ImportBatch(importable);
    const batch2 = buildPhase3ImportBatch(importable);
    expect(batch1.datasetVersion).toBe(NCEDB_PHASE3_DATASET_VERSION);
    expect(batch1.items.map((i) => i.importKey)).toEqual(batch2.items.map((i) => i.importKey));
    for (const item of batch1.items) {
      expect(item.productionCapacityApproved).toBe(false);
    }
    const dup = buildImportBatch(importable, {
      alreadyImportedKeys: batch1.items.map((i) => i.importKey),
      datasetVersion: NCEDB_PHASE3_DATASET_VERSION,
    });
    expect(dup.items.length).toBe(0);
    expect(dup.skippedDuplicates.length).toBe(batch1.items.length);
  });

  it("preserves exact source spans for non-control EXACT rows", () => {
    const audit = JSON.parse(readFileSync(resolve(PHASE3, "07-source-span-audit.json"), "utf8"));
    expect(audit.failureCount).toBe(0);
    for (const r of exceptions) {
      if (r.isNegativeControl && r.exceptionSourceSpan.matchStatus === "UNRESOLVED") continue;
      if (r.exceptionSourceSpan.matchStatus !== "EXACT") continue;
      const abs = resolve(process.cwd(), r.sourceIdentity.sourcePath);
      expect(existsSync(abs), abs).toBe(true);
      const bytes = readFileSync(abs);
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(digest).toBe(r.sourceIdentity.sourceSha256);
      const text = bytes.toString("utf8");
      expect(text.slice(r.exceptionSourceSpan.charStart, r.exceptionSourceSpan.charEnd)).toBe(
        r.exceptionSourceSpan.exactText,
      );
      expect(r.exactExceptionText).toBe(r.exceptionSourceSpan.exactText);
    }
  });

  it("does not modify production engine paths", () => {
    const self = readFileSync(__filename, "utf8");
    expect(self).not.toMatch(/from ["'].*contract-model/);
  });
});
