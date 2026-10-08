/**
 * Independent extraction-quality sampling against source text.
 * Does NOT use generated output as its own ground truth.
 * Structural quality ≠ legal-semantic accuracy.
 * Soft gate. IMPLEMENTED ≠ CERTIFIED. No LLM.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "../../extraction/parse";
import { parseDocumentStructure } from "../../contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../contract-model/compiler/structural-references";
import type { SourceDocumentRef } from "../phase2/types";

export interface QualitySampleDocResult {
  sourceDocumentId: string;
  cik: string;
  documentKind: string;
  exhibitType: string;
  filename: string;
  charCount: number;
  nodeCount: number;
  sectionNodeCount: number;
  articleNodeCount: number;
  definitionCount: number;
  referenceCount: number;
  resolvedReferenceCount: number;
  /** Fraction of heading-like source markers covered by at least one structural node label/number. */
  structuralCoverage: number;
  /** Nodes whose label/number cannot be found near their span in source text. */
  falseStructuralNodes: number;
  missingSections: number;
  missingDefinitionsEstimate: number;
  incorrectReferenceTargets: number;
  documentTypeClassificationPlausible: boolean;
  notes: string[];
}

export interface QualitySampleReport {
  status: "COMPUTE_ASSESSMENT_PHASE3_QUALITY_NOT_CERTIFIED";
  generatedAt: string;
  sampleSize: number;
  targetSampleSize: number;
  distinctIssuers: number;
  exhibitTypeCounts: Record<string, number>;
  documentKindCounts: Record<string, number>;
  aggregates: {
    meanStructuralCoverage: number;
    totalFalseStructuralNodes: number;
    totalMissingSections: number;
    totalMissingDefinitionsEstimate: number;
    totalIncorrectReferenceTargets: number;
    classificationPlausibleRate: number;
  };
  disclaimer: string;
  documents: QualitySampleDocResult[];
}

function guessCT(filename: string, uri: string): string {
  const ext = (filename.split(".").pop() ?? uri.split(".").pop() ?? "").toLowerCase();
  if (ext === "htm" || ext === "html") return "text/html";
  if (ext === "txt") return "text/plain";
  if (ext === "pdf") return "application/pdf";
  return "text/html";
}

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._:-]/g, "_");
}

function stratifiedSample<T extends { source: SourceDocumentRef }>(
  items: T[],
  n: number,
): T[] {
  if (items.length <= n) return [...items];
  const byKind = new Map<string, T[]>();
  for (const it of items) {
    const k = it.source.documentKind;
    const arr = byKind.get(k) ?? [];
    arr.push(it);
    byKind.set(k, arr);
  }
  const kinds = [...byKind.keys()].sort();
  const out: T[] = [];
  const per = Math.max(1, Math.floor(n / kinds.length));
  for (const k of kinds) {
    const arr = byKind.get(k)!;
    // stable pseudo-random: every k-th by id hash
    const sorted = [...arr].sort((a, b) =>
      a.source.sourceDocumentId.localeCompare(b.source.sourceDocumentId),
    );
    const step = Math.max(1, Math.floor(sorted.length / per));
    for (let i = 0; i < sorted.length && out.length < n; i += step) {
      out.push(sorted[i]!);
      if (out.filter((x) => x.source.documentKind === k).length >= per && kinds.length > 1) break;
    }
  }
  // fill remainder round-robin
  const used = new Set(out.map((x) => x.source.sourceDocumentId));
  for (const it of items.sort((a, b) => a.source.sourceDocumentId.localeCompare(b.source.sourceDocumentId))) {
    if (out.length >= n) break;
    if (!used.has(it.source.sourceDocumentId)) out.push(it);
  }
  return out.slice(0, n);
}

function classificationPlausible(kind: string, text: string, desc: string): boolean {
  const hay = `${desc}\n${text.slice(0, 20000)}`.toLowerCase();
  switch (kind) {
    case "CREDIT_AGREEMENT":
      return /credit agreement|loan agreement|facility agreement/.test(hay);
    case "INDENTURE":
      return /indenture/.test(hay);
    case "AMENDMENT":
      return /amendment/.test(hay);
    case "RESTATEMENT":
      return /restated|amended and restated/.test(hay);
    case "SUPPLEMENTAL_INDENTURE":
      return /supplemental indenture/.test(hay);
    case "SECURITY_AGREEMENT":
      return /security agreement|pledge agreement|collateral/.test(hay);
    case "INTERCREDITOR":
      return /intercreditor/.test(hay);
    default:
      return true;
  }
}

export async function runIndependentQualitySample(params: {
  corpusRoot: string;
  queuePath?: string;
  sampleSize?: number;
}): Promise<QualitySampleReport> {
  const sampleSize = params.sampleSize ?? 50;
  const queuePath = params.queuePath ?? path.join(params.corpusRoot, "processing-queue.json");
  const q = JSON.parse(fs.readFileSync(queuePath, "utf-8")) as {
    items: Array<{
      source: SourceDocumentRef;
      result?: { status?: string; wasDuplicate?: boolean } | null;
    }>;
  };
  const eligible = q.items.filter(
    (i) => i.result?.status === "OK" && !i.result?.wasDuplicate && fs.existsSync(
      path.join(params.corpusRoot, "raw", `${safe(i.source.sourceDocumentId)}.bin`),
    ),
  );
  const sample = stratifiedSample(eligible, sampleSize);
  const documents: QualitySampleDocResult[] = [];

  for (const item of sample) {
    const notes: string[] = [];
    const rp = path.join(params.corpusRoot, "raw", `${safe(item.source.sourceDocumentId)}.bin`);
    const buf = fs.readFileSync(rp);
    const ct = guessCT(item.source.filename, item.source.sourceUri);
    const parsed = await parseDocument(buf, ct);
    const text = parsed.fullText;
    const nodes = parseDocumentStructure({
      documentId: item.source.sourceDocumentId,
      label: item.source.description || item.source.filename,
      text,
    });
    const defs = detectStructuralDefinitions(item.source.sourceDocumentId, text, nodes);
    const refs = detectStructuralReferences(item.source.sourceDocumentId, text, nodes);

    const sourceSectionMarkers = [
      ...(text.match(/\bSection\s+\d+(?:\.\d+)*/gi) ?? []),
      ...(text.match(/\bSECTION\s+\d+(?:\.\d+)*/g) ?? []),
    ];
    // Deduplicate marker strings for coverage denominator
    const uniqueMarkers = [...new Set(sourceSectionMarkers.map((m) => m.replace(/\s+/g, " ").toLowerCase()))];
    const sectionNodes = nodes.filter((n) => n.nodeType === "SECTION");
    const articleNodes = nodes.filter((n) => n.nodeType === "ARTICLE");

    let covered = 0;
    for (const marker of uniqueMarkers) {
      const num = marker.replace(/^(section)\s+/i, "");
      const hit = sectionNodes.some((n) => {
        const ref = (n.sectionRef ?? "").toLowerCase();
        const heading = (n.heading ?? "").toLowerCase();
        return ref.includes(num) || heading.includes(num) || heading.includes(marker);
      });
      if (hit) covered += 1;
    }
    const structuralCoverage = uniqueMarkers.length
      ? covered / uniqueMarkers.length
      : nodes.length > 0
        ? 1
        : 0;

    let falseStructuralNodes = 0;
    for (const n of sectionNodes) {
      const needle = (n.sectionRef || n.heading || "").trim();
      if (!needle) {
        falseStructuralNodes += 1;
        continue;
      }
      const start = Math.max(0, (n.charStart ?? 0) - 40);
      const end = Math.min(text.length, (n.charEnd ?? n.charStart ?? 0) + 120);
      const window = text.slice(start, end);
      const needleHead = needle.toLowerCase().slice(0, Math.min(24, needle.length));
      if (!window.toLowerCase().includes(needleHead)) {
        const owned = text.slice(n.charStart ?? 0, Math.min(text.length, (n.charStart ?? 0) + 200));
        if (!owned.toLowerCase().includes(needleHead)) {
          falseStructuralNodes += 1;
        }
      }
    }

    // Missing sections: source markers with no node — only count strong ARTICLE/SECTION heading shapes
    const headingShapes = (
      text.match(/(?:^|\n)\s*(?:ARTICLE|Section|SECTION)\s+[IVXLC0-9.]+[^\n]{0,80}/g) ?? []
    ).length;
    const missingSections = Math.max(0, headingShapes - (sectionNodes.length + articleNodes.length));

    // Definitions present in source via quoted-means but missed by detector
    const meansInSource = (
      text.match(
        /["“”]\s*[^"“”]{1,100}?\s*["“”]\s*(?:means|shall mean|shall have the meaning|has the meaning)/gi,
      ) ?? []
    ).length;
    const missingDefinitionsEstimate = Math.max(0, meansInSource - defs.length);

    const incorrectReferenceTargets = refs.filter(
      (r) =>
        r.resolved === false &&
        /section\s+\d/i.test(r.referenceText ?? r.normalizedTarget ?? ""),
    ).length;

    const plausible = classificationPlausible(
      item.source.documentKind,
      text,
      item.source.description || "",
    );
    if (!plausible) notes.push("documentKind not corroborated by source head text");
    if (nodes.length === 0) notes.push("zero structural nodes");
    if (missingDefinitionsEstimate > 0) notes.push(`possible missed definitions≈${missingDefinitionsEstimate}`);

    documents.push({
      sourceDocumentId: item.source.sourceDocumentId,
      cik: item.source.cik,
      documentKind: item.source.documentKind,
      exhibitType: item.source.exhibitType,
      filename: item.source.filename,
      charCount: text.length,
      nodeCount: nodes.length,
      sectionNodeCount: sectionNodes.length,
      articleNodeCount: articleNodes.length,
      definitionCount: defs.length,
      referenceCount: refs.length,
      resolvedReferenceCount: refs.filter((r) => r.resolved).length,
      structuralCoverage,
      falseStructuralNodes,
      missingSections,
      missingDefinitionsEstimate,
      incorrectReferenceTargets,
      documentTypeClassificationPlausible: plausible,
      notes,
    });
  }

  const exhibitTypeCounts: Record<string, number> = {};
  const documentKindCounts: Record<string, number> = {};
  for (const d of documents) {
    exhibitTypeCounts[d.exhibitType] = (exhibitTypeCounts[d.exhibitType] ?? 0) + 1;
    documentKindCounts[d.documentKind] = (documentKindCounts[d.documentKind] ?? 0) + 1;
  }

  const meanStructuralCoverage =
    documents.reduce((s, d) => s + d.structuralCoverage, 0) / Math.max(1, documents.length);

  return {
    status: "COMPUTE_ASSESSMENT_PHASE3_QUALITY_NOT_CERTIFIED",
    generatedAt: new Date().toISOString(),
    sampleSize: documents.length,
    targetSampleSize: sampleSize,
    distinctIssuers: new Set(documents.map((d) => d.cik)).size,
    exhibitTypeCounts,
    documentKindCounts,
    aggregates: {
      meanStructuralCoverage,
      totalFalseStructuralNodes: documents.reduce((s, d) => s + d.falseStructuralNodes, 0),
      totalMissingSections: documents.reduce((s, d) => s + d.missingSections, 0),
      totalMissingDefinitionsEstimate: documents.reduce((s, d) => s + d.missingDefinitionsEstimate, 0),
      totalIncorrectReferenceTargets: documents.reduce((s, d) => s + d.incorrectReferenceTargets, 0),
      classificationPlausibleRate:
        documents.filter((d) => d.documentTypeClassificationPlausible).length /
        Math.max(1, documents.length),
    },
    disclaimer:
      "Independent source-text comparison for structural extraction quality only. Not legal-semantic accuracy. Generated output is never used as its own ground truth.",
    documents,
  };
}
