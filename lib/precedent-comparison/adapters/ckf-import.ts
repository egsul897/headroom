/**
 * Deterministic CKF corpus import (Phase 4).
 *
 * Consumes a published Knowledge Factory export when mounted on disk.
 * Does not download from SEC, does not treat sample fixtures as production
 * integration, and validates identity/hash/dedupe before merge.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadKnowledgeFactoryCorpus } from "./knowledge-factory";
import type { CorpusFile, CorpusProvisionJson } from "../corpus";

export interface CkfImportReport {
  attempted: boolean;
  availability: string;
  note: string;
  recordsSeen: number;
  imported: number;
  skippedDuplicateHash: number;
  skippedMissingText: number;
  skippedInvalidIdentity: number;
  contentHashes: string[];
  documentIds: string[];
  issuerIds: string[];
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function importCkfExportIntoCorpus(
  baseDir: string = process.cwd(),
  opts: { write?: boolean; corpusPath?: string } = {},
): CkfImportReport {
  const kf = loadKnowledgeFactoryCorpus(baseDir);
  const report: CkfImportReport = {
    attempted: true,
    availability: kf.availability,
    note: kf.note,
    recordsSeen: 0,
    imported: 0,
    skippedDuplicateHash: 0,
    skippedMissingText: 0,
    skippedInvalidIdentity: 0,
    contentHashes: [],
    documentIds: [],
    issuerIds: [],
  };

  if (kf.availability !== "AVAILABLE" || !kf.data) {
    report.attempted = true;
    report.note = `${kf.note} — PCI will not fabricate a second SEC downloader or treat adapter samples as production CKF integration.`;
    return report;
  }

  const corpusPath = opts.corpusPath ?? join(baseDir, "lib/precedent-comparison/corpus/public-credit-provisions.json");
  const existing = JSON.parse(readFileSync(corpusPath, "utf8")) as CorpusFile & { provisions: CorpusProvisionJson[] };
  const seenHash = new Set(existing.provisions.map((p) => p.sourceVersionHash ?? sha256(p.sourceText)));
  const seenId = new Set(existing.provisions.map((p) => p.provisionId));

  report.recordsSeen = kf.data.records.length;
  const additions: CorpusProvisionJson[] = [];

  for (const rec of kf.data.records) {
    if (!rec.sourceText || rec.sourceText.trim().length < 80) {
      report.skippedMissingText += 1;
      continue;
    }
    if (!rec.recordId && !rec.documentId) {
      report.skippedInvalidIdentity += 1;
      continue;
    }
    const sourceText = rec.sourceText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2400);
    const hash = sha256(sourceText);
    if (seenHash.has(hash)) {
      report.skippedDuplicateHash += 1;
      continue;
    }
    const provisionId = `ckf:${rec.recordId ?? hash.slice(0, 16)}`;
    if (seenId.has(provisionId)) {
      report.skippedDuplicateHash += 1;
      continue;
    }
    const issuerId = rec.issuerId ?? "ckf-unknown";
    const documentId = rec.documentId ?? `ckf-doc-${rec.recordId ?? hash.slice(0, 12)}`;
    // Version-aware identity: documentId + content hash
    const versionKey = `${documentId}:${hash}`;
    void versionKey;
    additions.push({
      provisionId,
      packageId: `ckf-${issuerId}`,
      documentId,
      sourcePath: `peer://ws-ckf/${rec.recordId ?? provisionId}`,
      sourceSectionRef: rec.sourceSectionRef ?? "unknown",
      covenantFamily: rec.covenantFamily ?? "QUALITATIVE_NEGATIVE_COVENANTS",
      charStart: 0,
      charEnd: sourceText.length,
      sourceText,
      documentRole: /amend/i.test(rec.agreementType ?? "") ? "AMENDMENT" : "ORIGINAL",
      agreementType: (rec.agreementType as CorpusProvisionJson["agreementType"]) ?? "CREDIT_AGREEMENT",
      issuerId,
      amendsProvisionId: null,
      tags: ["ckf-export", "phase4-import"],
      reviewStatus: "SOURCE_ONLY",
      financialDefinitionTerms: [],
      sourceVersionHash: hash,
      evalIsolation: "NONE",
    });
    seenHash.add(hash);
    seenId.add(provisionId);
    report.contentHashes.push(hash);
    report.documentIds.push(documentId);
    report.issuerIds.push(issuerId);
    report.imported += 1;
  }

  if (opts.write && additions.length > 0) {
    const merged = {
      ...existing,
      generatedAt: new Date().toISOString(),
      generator: "lib/precedent-comparison/adapters/ckf-import.ts",
      provisions: [...existing.provisions, ...additions].sort((a, b) => a.provisionId.localeCompare(b.provisionId)),
    };
    writeFileSync(corpusPath, JSON.stringify(merged, null, 2) + "\n");
  }

  report.note = `CKF import: seen=${report.recordsSeen} imported=${report.imported} dupHash=${report.skippedDuplicateHash} missingText=${report.skippedMissingText}`;
  return report;
}

/** Probe-only: report whether a real (non-sample) CKF export path exists. */
export function probeCkfExportMount(baseDir: string = process.cwd()): {
  mounted: boolean;
  pathsTried: string[];
  sampleOnly: boolean;
} {
  const paths = [
    "tests/fixtures/covenant-dependency-atlas/export/knowledge-factory-dataset.json",
    "docs/knowledge-factory/export/corpus.json",
    "lib/knowledge-factory/export/corpus.json",
    "lib/precedent-comparison/adapters/fixtures/knowledge-factory.sample.json",
  ];
  const absTried = paths.map((p) => join(baseDir, p));
  for (const rel of paths) {
    const abs = join(baseDir, rel);
    if (!existsSync(abs)) continue;
    const sampleOnly = rel.includes("adapters/fixtures/");
    return { mounted: !sampleOnly, pathsTried: absTried, sampleOnly };
  }
  return { mounted: false, pathsTried: absTried, sampleOnly: false };
}
