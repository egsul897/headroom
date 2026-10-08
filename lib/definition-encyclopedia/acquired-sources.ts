/**
 * Load Phase-2 acquired EDGAR documents into encyclopedia source specs.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EncyclopediaSourceSpec } from "./sources";
import type { AcquiredDocumentMeta } from "./sec-acquire";

export function loadAcquiredSourceSpecs(repoRoot: string): {
  specs: EncyclopediaSourceSpec[];
  metas: AcquiredDocumentMeta[];
} {
  const dir = resolve(repoRoot, "data/definition-encyclopedia/acquired");
  if (!existsSync(dir)) return { specs: [], metas: [] };
  const metas: AcquiredDocumentMeta[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".meta.json")) continue;
    try {
      const meta = JSON.parse(readFileSync(join(dir, name), "utf8")) as AcquiredDocumentMeta;
      if (meta.textPath && existsSync(resolve(repoRoot, meta.textPath))) metas.push(meta);
    } catch {
      // skip corrupt meta
    }
  }
  metas.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const specs: EncyclopediaSourceSpec[] = metas.map((m) => ({
    sourceId: m.sourceId,
    packageKey: m.packageKey,
    documentId: m.documentId,
    documentLabel: m.documentLabel,
    agreementVersion: m.agreementVersion,
    documentType: m.documentType,
    retrievalPath: m.textPath,
  }));
  return { specs, metas };
}

export function distinctIssuerCount(metas: AcquiredDocumentMeta[]): number {
  return new Set(metas.map((m) => m.issuerCik)).size;
}
