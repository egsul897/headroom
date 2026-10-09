/**
 * Promotion-safety acceptance for WS-CCA (soft gate).
 * IMPLEMENTED ≠ CERTIFIED. Zero paid calls.
 */
import { describe, expect, it } from "vitest";
import {
  assertCannotPromoteIncompleteStructure,
  assertComputeOutputRemainsSourceOnly,
  structureSuccessIsNotLegalVerification,
  ComputePromotionSafetyError,
} from "../../lib/cursor-cloud-compute/promotion-guards";
import { refuseIllegalPromotion, toCkfCompatibleSourceView } from "../../lib/cursor-cloud-compute/phase3/ckf-compat";
import type { HandoffDocumentRecord } from "../../lib/cursor-cloud-compute/phase3/handoff-contract";
import { HANDOFF_CONTRACT_VERSION, PROCESSING_VERSION } from "../../lib/cursor-cloud-compute/phase3/handoff-contract";

function sampleRecord(status: HandoffDocumentRecord["extractionStatus"]): HandoffDocumentRecord {
  return {
    sourceHash: "a".repeat(64),
    normalizedTextHash: "b".repeat(64),
    structuralOutputHash: "c".repeat(64),
    sourceIdentity: {
      sourceDocumentId: "doc-1",
      sourceUri: "https://www.sec.gov/Archives/edgar/data/1/x.htm",
      cik: "0000000001",
      accessionNumber: "0000000001-26-000001",
      filename: "x.htm",
      documentKind: "CREDIT_AGREEMENT",
      exhibitType: "EX-10.1",
      filingDate: "2026-01-01",
      agreementIdentityKey: "k",
      ehbRunDir: "/tmp/ehb",
    },
    extractionStatus: status,
    failureDiagnostics: null,
    provenance: {
      producer: "WS-CCA",
      consumers: ["WS-CKF", "WS-EHB"],
      acquiredVia: "WS-EHB",
      processedAt: new Date().toISOString(),
      checkpointId: "ckpt",
    },
    processingVersion: PROCESSING_VERSION,
    contractVersion: HANDOFF_CONTRACT_VERSION,
    metrics: {
      byteLength: 10,
      charCount: 10,
      nodeCount: status === "STRUCTURE_EMPTY" ? 0 : 5,
      definitionCount: 0,
      referenceCount: 0,
      resolvedReferenceCount: 0,
      passACandidateCount: 0,
    },
    artifactRefs: {
      rawBytesRel: "cas/raw/aa/aaa",
      structuralJsonRel: "cas/structural/cc/ccc",
      metaJsonRel: "cas/meta/dd/ddd",
    },
  };
}

describe("WS-CCA promotion guards", () => {
  it("blocks STRUCTURE_EMPTY from legal / capacity promotion", () => {
    expect(() =>
      assertCannotPromoteIncompleteStructure({
        extractionStatus: "STRUCTURE_EMPTY",
        verificationStatus: "SOURCE_ONLY",
        proposedLegalStatus: "CERTIFIED",
      }),
    ).toThrow(ComputePromotionSafetyError);

    expect(() =>
      assertCannotPromoteIncompleteStructure({
        extractionStatus: "STRUCTURE_EMPTY",
        target: "Permission",
      }),
    ).toThrow(/Permission/);
  });

  it("blocks MISSING_DEFINITIONS and refuses CERTIFIED even on OK structure", () => {
    expect(() =>
      assertCannotPromoteIncompleteStructure({
        extractionStatus: "MISSING_DEFINITIONS",
      }),
    ).toThrow(ComputePromotionSafetyError);

    expect(() =>
      refuseIllegalPromotion(sampleRecord("OK"), "CERTIFIED"),
    ).toThrow(/CERTIFIED/);
  });

  it("keeps compute outputs SOURCE_ONLY; structure success ≠ legal verification", () => {
    expect(() => assertComputeOutputRemainsSourceOnly("CERTIFIED")).toThrow(ComputePromotionSafetyError);
    assertComputeOutputRemainsSourceOnly("SOURCE_ONLY");
    const v = structureSuccessIsNotLegalVerification({
      nodeCount: 12,
      extractionStatus: "OK",
    });
    expect(v.legallyVerified).toBe(false);
    expect(v.affirmativeCovenantConclusion).toBe(false);
  });

  it("maps handoff to CKF-compatible SOURCE_ONLY view with promotion blocked", () => {
    const view = toCkfCompatibleSourceView(sampleRecord("STRUCTURE_EMPTY"));
    expect(view.verificationStatus).toBe("SOURCE_ONLY");
    expect(view.representationLevel).toBe("DISCOVERED_CANDIDATE");
    expect(view.legalPromotionBlocked).toBe(true);
    expect(view.extractionStatus).toBe("STRUCTURE_EMPTY");
  });
});
