/**
 * Versioned, content-addressed handoff contract (WS-CCA ↔ WS-CKF / WS-EHB).
 *
 * Soft gate. IMPLEMENTED ≠ CERTIFIED.
 * Does not invent a production DB schema or competing source registry.
 *
 * Durability model:
 * - Git-tracked: handoff index (hashes, provenance, status) under docs/
 * - Artifact store: raw source bytes + structural JSON under /opt/cursor/artifacts
 *   (outside ephemeral workspace disk; reconstructible in a fresh agent workspace
 *   that can read the same artifact volume)
 * - VM-local corpus under data/ is a working cache only — never claimed as durable
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SourceDocumentRef } from "../phase2/types";

export const HANDOFF_CONTRACT_VERSION = "cca-handoff-v1" as const;
export const PROCESSING_VERSION = "cca-phase3-pipeline-v1" as const;

export type ExtractionStatus =
  | "OK"
  | "STRUCTURE_EMPTY"
  | "MISSING_DEFINITIONS"
  | "STRUCTURE_BROKEN_HIERARCHY"
  | "SKIPPED_DUPLICATE"
  | "FAILED"
  | "UNSUPPORTED"
  | "OVERSIZED";

export interface FailureDiagnostic {
  stage: string;
  errorClass: string | null;
  message: string | null;
  rootCauseClass?: string | null;
  evidence?: string[];
  recoverable?: boolean;
}

export interface HandoffDocumentRecord {
  /** Content-addressed identity of the raw source body (sha256 hex). */
  sourceHash: string;
  /** sha256 of Unicode-normalized extracted text (NFKC + whitespace collapse). */
  normalizedTextHash: string;
  /** sha256 of canonical JSON structural output (nodes only). */
  structuralOutputHash: string;
  sourceIdentity: {
    sourceDocumentId: string;
    sourceUri: string;
    cik: string;
    accessionNumber: string;
    filename: string;
    documentKind: string;
    exhibitType: string;
    filingDate: string;
    agreementIdentityKey: string;
    ehbRunDir: string;
  };
  extractionStatus: ExtractionStatus;
  failureDiagnostics: FailureDiagnostic | null;
  provenance: {
    producer: "WS-CCA";
    consumers: Array<"WS-CKF" | "WS-EHB">;
    acquiredVia: string;
    processedAt: string;
    checkpointId: string;
  };
  processingVersion: typeof PROCESSING_VERSION;
  contractVersion: typeof HANDOFF_CONTRACT_VERSION;
  metrics: {
    byteLength: number;
    charCount: number;
    nodeCount: number;
    definitionCount: number;
    referenceCount: number;
    resolvedReferenceCount: number;
    passACandidateCount: number;
  };
  /** Relative paths inside the handoff package (content-addressed). */
  artifactRefs: {
    rawBytesRel: string;
    structuralJsonRel: string;
    metaJsonRel: string;
  };
}

export interface HandoffPackageManifest {
  contractVersion: typeof HANDOFF_CONTRACT_VERSION;
  processingVersion: typeof PROCESSING_VERSION;
  status: "COMPUTE_ASSESSMENT_PHASE3_HANDOFF_NOT_CERTIFIED";
  generatedAt: string;
  checkpointId: string;
  producer: "WS-CCA";
  coordination: {
    ehbOwnsSecAcquisition: true;
    ckfConsumesHandoff: true;
    durableNote: string;
  };
  documentCount: number;
  distinctSourceHashes: number;
  documents: HandoffDocumentRecord[];
}

export function sha256Buffer(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function normalizeTextForHash(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function contentAddressedRel(kind: "raw" | "structural" | "meta", hash: string): string {
  return path.posix.join("cas", kind, hash.slice(0, 2), hash);
}

export function handoffPackagePaths(root: string): {
  root: string;
  cas: string;
  manifest: string;
} {
  return {
    root,
    cas: path.join(root, "cas"),
    manifest: path.join(root, "handoff-manifest.json"),
  };
}

export function writeCasBytes(packageRoot: string, kind: "raw" | "structural" | "meta", hash: string, body: Buffer | string): string {
  const rel = contentAddressedRel(kind, hash);
  const abs = path.join(packageRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) {
    fs.writeFileSync(abs, body);
  }
  return rel;
}

export function buildHandoffRecord(params: {
  source: SourceDocumentRef;
  rawBytes: Buffer;
  normalizedText: string;
  structuralNodes: unknown;
  extractionStatus: ExtractionStatus;
  failureDiagnostics: FailureDiagnostic | null;
  acquiredVia: string;
  checkpointId: string;
  metrics: HandoffDocumentRecord["metrics"];
}): HandoffDocumentRecord {
  const sourceHash = sha256Buffer(params.rawBytes);
  const normalizedTextHash = sha256Buffer(normalizeTextForHash(params.normalizedText));
  const structuralJson = JSON.stringify(params.structuralNodes);
  const structuralOutputHash = sha256Buffer(structuralJson);
  return {
    sourceHash,
    normalizedTextHash,
    structuralOutputHash,
    sourceIdentity: {
      sourceDocumentId: params.source.sourceDocumentId,
      sourceUri: params.source.sourceUri,
      cik: params.source.cik,
      accessionNumber: params.source.accessionNumber,
      filename: params.source.filename,
      documentKind: params.source.documentKind,
      exhibitType: params.source.exhibitType,
      filingDate: params.source.filingDate,
      agreementIdentityKey: params.source.agreementIdentityKey,
      ehbRunDir: params.source.ehbRunDir,
    },
    extractionStatus: params.extractionStatus,
    failureDiagnostics: params.failureDiagnostics,
    provenance: {
      producer: "WS-CCA",
      consumers: ["WS-CKF", "WS-EHB"],
      acquiredVia: params.acquiredVia,
      processedAt: new Date().toISOString(),
      checkpointId: params.checkpointId,
    },
    processingVersion: PROCESSING_VERSION,
    contractVersion: HANDOFF_CONTRACT_VERSION,
    metrics: params.metrics,
    artifactRefs: {
      rawBytesRel: contentAddressedRel("raw", sourceHash),
      structuralJsonRel: contentAddressedRel("structural", structuralOutputHash),
      metaJsonRel: contentAddressedRel("meta", sha256Buffer(`${sourceHash}:${normalizedTextHash}:${structuralOutputHash}`)),
    },
  };
}

export function persistHandoffPackage(params: {
  packageRoot: string;
  checkpointId: string;
  records: Array<{
    record: HandoffDocumentRecord;
    rawBytes: Buffer;
    structuralNodes: unknown;
  }>;
}): HandoffPackageManifest {
  const paths = handoffPackagePaths(params.packageRoot);
  fs.mkdirSync(paths.root, { recursive: true });

  for (const { record, rawBytes, structuralNodes } of params.records) {
    writeCasBytes(params.packageRoot, "raw", record.sourceHash, rawBytes);
    writeCasBytes(params.packageRoot, "structural", record.structuralOutputHash, JSON.stringify(structuralNodes));
    writeCasBytes(
      params.packageRoot,
      "meta",
      path.basename(record.artifactRefs.metaJsonRel),
      JSON.stringify(record, null, 2),
    );
  }

  const manifest: HandoffPackageManifest = {
    contractVersion: HANDOFF_CONTRACT_VERSION,
    processingVersion: PROCESSING_VERSION,
    status: "COMPUTE_ASSESSMENT_PHASE3_HANDOFF_NOT_CERTIFIED",
    generatedAt: new Date().toISOString(),
    checkpointId: params.checkpointId,
    producer: "WS-CCA",
    coordination: {
      ehbOwnsSecAcquisition: true,
      ckfConsumesHandoff: true,
      durableNote:
        "Source bytes live in content-addressed artifact CAS (and/or re-fetchable from SEC via WS-EHB). Git tracks the manifest/index of hashes only. VM-local data/ is not durable proof.",
    },
    documentCount: params.records.length,
    distinctSourceHashes: new Set(params.records.map((r) => r.record.sourceHash)).size,
    documents: params.records.map((r) => r.record),
  };
  fs.writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Export a handoff package directory as a single durable tarball.
 * Prefer this for /opt/cursor/artifacts — many small CAS writes on that
 * volume are slow and have been observed to EIO under burst load.
 */
export function exportHandoffTarball(packageRoot: string, tarballPath: string): { bytesWritten: number; sha256: string } {
  fs.mkdirSync(path.dirname(tarballPath), { recursive: true });
  execFileSync("tar", ["-czf", tarballPath, "-C", packageRoot, "."], { stdio: "pipe" });
  const body = fs.readFileSync(tarballPath);
  return { bytesWritten: body.length, sha256: sha256Buffer(body) };
}

/** Extract a handoff tarball into an independent root and verify CAS hashes. */
export function proveTarballReconstruction(params: {
  tarballPath: string;
  reconstructRoot: string;
  sampleLimit?: number;
}): DurabilityProofResult {
  if (!fs.existsSync(params.tarballPath)) {
    return {
      proved: false,
      mode: "artifact-cas-reconstruct",
      documentsChecked: 0,
      hashMatches: 0,
      structuralMatches: 0,
      failures: [{ sourceDocumentId: "*", reason: `tarball missing: ${params.tarballPath}` }],
      notes: ["Durable proof requires the artifact tarball, not a VM-local working corpus."],
    };
  }
  fs.mkdirSync(params.reconstructRoot, { recursive: true });
  execFileSync("tar", ["-xzf", params.tarballPath, "-C", params.reconstructRoot], { stdio: "pipe" });
  return proveArtifactReconstruction({
    sourcePackageRoot: params.reconstructRoot,
    reconstructRoot: fs.mkdtempSync(path.join(os.tmpdir(), "cca-handoff-verify-")),
    sampleLimit: params.sampleLimit,
  });
}

export interface DurabilityProofResult {
  proved: boolean;
  mode: "artifact-cas-reconstruct" | "sec-refetch-hash-match";
  documentsChecked: number;
  hashMatches: number;
  structuralMatches: number;
  failures: Array<{ sourceDocumentId: string; reason: string }>;
  notes: string[];
}

/**
 * Reconstruct handoff into an independent directory and verify content hashes.
 * This proves the CAS package (not the VM working corpus) is sufficient.
 */
export function proveArtifactReconstruction(params: {
  sourcePackageRoot: string;
  reconstructRoot: string;
  sampleLimit?: number;
}): DurabilityProofResult {
  const manifestPath = handoffPackagePaths(params.sourcePackageRoot).manifest;
  if (!fs.existsSync(manifestPath)) {
    return {
      proved: false,
      mode: "artifact-cas-reconstruct",
      documentsChecked: 0,
      hashMatches: 0,
      structuralMatches: 0,
      failures: [{ sourceDocumentId: "*", reason: `manifest missing at ${manifestPath}` }],
      notes: ["Source package must exist outside the working corpus (artifact CAS)."],
    };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as HandoffPackageManifest;
  fs.mkdirSync(params.reconstructRoot, { recursive: true });
  // Copy CAS + manifest into independent root
  const copyDir = (src: string, dst: string) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, ent.name);
      const d = path.join(dst, ent.name);
      if (ent.isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  };
  copyDir(params.sourcePackageRoot, params.reconstructRoot);

  const docs = manifest.documents.slice(0, params.sampleLimit ?? manifest.documents.length);
  const failures: DurabilityProofResult["failures"] = [];
  let hashMatches = 0;
  let structuralMatches = 0;

  for (const doc of docs) {
    const rawAbs = path.join(params.reconstructRoot, doc.artifactRefs.rawBytesRel);
    const structAbs = path.join(params.reconstructRoot, doc.artifactRefs.structuralJsonRel);
    if (!fs.existsSync(rawAbs)) {
      failures.push({ sourceDocumentId: doc.sourceIdentity.sourceDocumentId, reason: "raw CAS object missing after reconstruct" });
      continue;
    }
    const raw = fs.readFileSync(rawAbs);
    const rawHash = sha256Buffer(raw);
    if (rawHash !== doc.sourceHash) {
      failures.push({
        sourceDocumentId: doc.sourceIdentity.sourceDocumentId,
        reason: `sourceHash mismatch expected=${doc.sourceHash} got=${rawHash}`,
      });
      continue;
    }
    hashMatches += 1;
    if (!fs.existsSync(structAbs)) {
      failures.push({ sourceDocumentId: doc.sourceIdentity.sourceDocumentId, reason: "structural CAS object missing" });
      continue;
    }
    const structHash = sha256Buffer(fs.readFileSync(structAbs));
    if (structHash !== doc.structuralOutputHash) {
      failures.push({
        sourceDocumentId: doc.sourceIdentity.sourceDocumentId,
        reason: `structuralOutputHash mismatch`,
      });
      continue;
    }
    structuralMatches += 1;
  }

  return {
    proved: failures.length === 0 && hashMatches === docs.length && structuralMatches === docs.length,
    mode: "artifact-cas-reconstruct",
    documentsChecked: docs.length,
    hashMatches,
    structuralMatches,
    failures,
    notes: [
      `Independent reconstruct root: ${params.reconstructRoot}`,
      "Git-tracked summary alone is not claimed as corpus durability; CAS bytes were required for this proof.",
      `Manifest checkpointId=${manifest.checkpointId}`,
    ],
  };
}
