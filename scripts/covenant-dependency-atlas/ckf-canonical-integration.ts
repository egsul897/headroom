/**
 * Phase 4: validate consumption of Knowledge Factory canonical export.
 * Reports infrastructure blockers rather than claiming integration.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { runCkfImportDemo } from "./ckf-import-demo";
import type { KnowledgeFactoryExport } from "./schema";

const ROOT = resolve(__dirname, "../..");
const LOCAL = join(ROOT, ".local-dependency-atlas");

export interface CkfIntegrationReport {
  status: "OK" | "PARTIAL" | "BLOCKED";
  canonicalExportFound: boolean;
  canonicalExportPath: string | null;
  documentCountInExport: number | null;
  claimed113CorpusAccessible: boolean;
  infrastructureBlocker: string | null;
  idempotentImport: boolean | null;
  unresolvedPreserved: number | null;
  sourceVersionId: string | null;
  promotedToLegalTruth: number | null;
  competingSourceRegistryCreated: false;
  notes: string[];
  peerBranch: string;
}

function findCanonicalExport(): { path: string; docCount: number | null } | null {
  const candidates = [
    join(LOCAL, "ckf-canonical", "knowledge-factory-dataset.json"),
    join(LOCAL, "ckf-canonical", "canonical-export.json"),
    join(LOCAL, "exports", "ckf-canonical-export.json"),
    join(LOCAL, "exports", "structural-knowledge-factory-dataset.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const kf = JSON.parse(readFileSync(p, "utf-8")) as KnowledgeFactoryExport & { documents?: unknown[] };
      const docCount =
        typeof kf.counts?.edges === "number"
          ? new Set((kf.edges ?? []).flatMap((e) => e.sourceSpans?.map((s) => s.documentId) ?? [])).size
          : null;
      return { path: p, docCount };
    } catch {
      return { path: p, docCount: null };
    }
  }
  return null;
}

function corpus113Accessible(): { accessible: boolean; detail: string } {
  const dirs = [
    join(LOCAL, "ckf-corpus"),
    join(LOCAL, "corpus"),
    join(LOCAL, "ckf-canonical", "documents"),
  ];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    let count = 0;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(txt|htm|html|json)$/i.test(name)) count += 1;
      }
    };
    walk(d);
    if (count >= 100) return { accessible: true, detail: `${count} files under ${d}` };
    return { accessible: false, detail: `Directory ${d} exists but only ${count} files (need ~113)` };
  }
  return {
    accessible: false,
    detail:
      "No CKF 113-document corpus materialized under .local-dependency-atlas/{ckf-corpus,corpus,ckf-canonical}. Peer branch cursor/covenant-knowledge-factory-7327 not imported into this workspace.",
  };
}

export function validateCkfCanonicalIntegration(): CkfIntegrationReport {
  const notes: string[] = [];
  const found = findCanonicalExport();
  const corpus = corpus113Accessible();
  notes.push(corpus.detail);

  let idempotentImport: boolean | null = null;
  let unresolvedPreserved: number | null = null;
  let sourceVersionId: string | null = null;
  let promotedToLegalTruth: number | null = null;

  if (found) {
    try {
      const demo = runCkfImportDemo(found.path);
      idempotentImport = demo.pass2.idempotent;
      unresolvedPreserved = demo.pass2.unresolvedPreserved;
      sourceVersionId = demo.pass1.sourceVersionId;
      promotedToLegalTruth = demo.pass2.promotedToLegalTruth;
      notes.push(`Import demo against ${found.path}: idempotent=${String(idempotentImport)}`);
    } catch (err) {
      notes.push(`Import demo failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    notes.push("No CKF canonical export file found; used Atlas structural KF export path as fallback if present after rebuild.");
  }

  const structuralFallback = join(LOCAL, "exports", "structural-knowledge-factory-dataset.json");
  const canonicalExportFound = Boolean(found) || existsSync(structuralFallback);
  const canonicalExportPath = found?.path ?? (existsSync(structuralFallback) ? structuralFallback : null);

  if (!found && existsSync(structuralFallback) && idempotentImport == null) {
    const demo = runCkfImportDemo(structuralFallback);
    idempotentImport = demo.pass2.idempotent;
    unresolvedPreserved = demo.pass2.unresolvedPreserved;
    sourceVersionId = demo.pass1.sourceVersionId;
    promotedToLegalTruth = demo.pass2.promotedToLegalTruth;
    notes.push("Fell back to Atlas-produced structural KF export for idempotent-import proof (not CKF canonical 113-doc corpus).");
  }

  let status: CkfIntegrationReport["status"] = "OK";
  let infrastructureBlocker: string | null = null;
  if (!corpus.accessible) {
    status = "BLOCKED";
    infrastructureBlocker = corpus.detail;
  } else if (!found) {
    status = "PARTIAL";
    infrastructureBlocker = "CKF canonical export JSON not present locally";
  }

  return {
    status,
    canonicalExportFound,
    canonicalExportPath: canonicalExportPath ? canonicalExportPath.replace(`${ROOT}/`, "") : null,
    documentCountInExport: found?.docCount ?? null,
    claimed113CorpusAccessible: corpus.accessible,
    infrastructureBlocker,
    idempotentImport,
    unresolvedPreserved,
    sourceVersionId,
    promotedToLegalTruth,
    competingSourceRegistryCreated: false,
    notes,
    peerBranch: "cursor/covenant-knowledge-factory-7327",
  };
}
