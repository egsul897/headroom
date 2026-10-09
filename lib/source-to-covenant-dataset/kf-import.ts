/**
 * Knowledge-factory / corpus-dataset delivery adapter.
 * Consumes WS-PAR `06-dataset-delivery-contract` fields without creating a
 * competing persistent Prisma schema.
 */
import { createHash } from "crypto";
import type { SourceToCovenantRecordV2 } from "./types-v2";
import { DATASET_SCHEMA_VERSION_V2 } from "./types-v2";

export interface KnowledgeFactoryImportRecord {
  contractVersion: "corpus-dataset-delivery-contract.v1";
  exampleId: string;
  exactSourceProvenance: {
    issuerId: string;
    issuerName: string;
    cik?: string;
    instrumentKey: string;
    documentId: string;
    sourceFixturePath: string;
    filingAccession?: string;
    sourceUrl?: string;
  };
  stableContentIdentities: {
    contentHash: string;
    logicalId: string;
    windowSha256: string;
    sourceTextSha256: string;
  };
  sourceTextHashes: { sourceTextSha256: string; windowSha256: string };
  compilerOrModelVersions: Record<string, unknown>;
  confidenceAndUncertaintyLabels: { level: string; reasons: string[] };
  verificationStatus: string;
  duplicateDetection: { nearDuplicateClusterId: string | null; decision: unknown };
  deterministicReplay: {
    datasetBuilderVersion: string;
    schemaVersion: string;
    sourceFixturePath: string;
    charStart: number | null;
    charEnd: number | null;
  };
  trainingEligibility: string;
  evaluationEligibility: string;
  importable: boolean;
  blockedReasons: string[];
  candidateLegalRepresentation: SourceToCovenantRecordV2["output"];
  controllingContextStatus: string;
}

export function toKnowledgeFactoryImportRecord(r: SourceToCovenantRecordV2): KnowledgeFactoryImportRecord {
  const contentHash = createHash("sha256")
    .update([r.exampleId, r.input.windowSha256, r.document.documentId, r.structural.sectionRef].join("|"), "utf8")
    .digest("hex");
  const blockedReasons = [...r.knowledgeFactoryImport.blockedReasons];
  if (r.deliveryVerificationStatus === "VERIFIED" && !r.verificationEvidence.verificationRecordId) {
    blockedReasons.push("VERIFIED_WITHOUT_verification_record_id");
  }
  if (r.deliveryVerificationStatus !== "VERIFIED") {
    blockedReasons.push(`verificationStatus=${r.deliveryVerificationStatus}`);
  }
  const importable = blockedReasons.length === 0;

  return {
    contractVersion: "corpus-dataset-delivery-contract.v1",
    exampleId: r.exampleId,
    exactSourceProvenance: {
      issuerId: r.document.issuerId,
      issuerName: r.document.issuerName,
      cik: r.document.cik,
      instrumentKey: r.document.instrumentKey,
      documentId: r.document.documentId,
      sourceFixturePath: r.document.sourceFixturePath,
      filingAccession: r.document.filingAccession,
      sourceUrl: r.document.sourceUrl,
    },
    stableContentIdentities: {
      contentHash,
      logicalId: `covenant_candidate:${r.exampleId}`,
      windowSha256: r.input.windowSha256,
      sourceTextSha256: r.input.sourceTextSha256,
    },
    sourceTextHashes: {
      sourceTextSha256: r.input.sourceTextSha256,
      windowSha256: r.input.windowSha256,
    },
    compilerOrModelVersions: { ...r.toolVersions },
    confidenceAndUncertaintyLabels: r.output.uncertainty,
    verificationStatus: r.deliveryVerificationStatus,
    duplicateDetection: {
      nearDuplicateClusterId: r.nearDuplicateClusterId,
      decision: r.duplicateDecision,
    },
    deterministicReplay: {
      datasetBuilderVersion: DATASET_SCHEMA_VERSION_V2,
      schemaVersion: r.schemaVersion,
      sourceFixturePath: r.document.sourceFixturePath,
      charStart: r.input.charStartInFixture,
      charEnd: r.input.charEndInFixture,
    },
    trainingEligibility: r.trainingEligibility,
    evaluationEligibility: r.evaluationEligibility,
    importable,
    blockedReasons: [...new Set(blockedReasons)],
    candidateLegalRepresentation: r.output,
    controllingContextStatus: r.controllingContextAudit.status,
  };
}

export function buildKnowledgeFactoryImportPackage(records: readonly SourceToCovenantRecordV2[]): {
  contractVersion: "corpus-dataset-delivery-contract.v1";
  actualRecordCounts: { total: number; importable: number; blocked: number };
  records: KnowledgeFactoryImportRecord[];
  note: string;
} {
  const mapped = records.map(toKnowledgeFactoryImportRecord);
  const importable = mapped.filter((r) => r.importable);
  return {
    contractVersion: "corpus-dataset-delivery-contract.v1",
    actualRecordCounts: {
      total: mapped.length,
      importable: importable.length,
      blocked: mapped.length - importable.length,
    },
    records: mapped,
    note: "Idempotent import package for CKF. Does not write Prisma tables. Amendment-aware invalidation key = documentId + windowSha256 + operativeVersion.amendmentIdentity.",
  };
}
