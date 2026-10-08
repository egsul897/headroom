/**
 * Phase 3 corpus validation — dedupe, overlap, span audit, controlling context.
 *
 * Duplicate / overlapping extracts are not counted as distinct comparable provisions.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isHeldOutEval, type PrecedentCorpus } from "../corpus";
import { normalizeText } from "../knowledge";
import { validateSourceSpan } from "../source-span";
import type { PrecedentProvision } from "../types";

export interface SpanCluster {
  clusterId: string;
  memberProvisionIds: string[];
  representativeProvisionId: string;
  reason: "IDENTICAL_HASH" | "SAME_PATH_OVERLAP" | "NEAR_DUPLICATE_TEXT";
}

export interface CorpusAuditReport {
  schemaVersion: "precedent-comparison-corpus-audit.v1";
  generatedAt: string;
  rawProvisionCount: number;
  distinctSourceDocuments: number;
  distinctIssuers: number;
  distinctProvisionSpans: number;
  duplicateOrOverlappingSpanCount: number;
  deduplicatedComparableProvisionCount: number;
  provisionsWithCompleteControllingContext: number;
  provisionsMissingControllingContext: number;
  heldOutProvisionCount: number;
  clusters: SpanCluster[];
  spanAudit: {
    sampleSize: number;
    exactMatchCount: number;
    exactMatchRate: number;
    contextCompleteCount: number;
    contextCompletenessRate: number;
    byIssuer: Record<string, { sampled: number; exactMatch: number; contextComplete: number }>;
    byFamily: Record<string, { sampled: number; exactMatch: number; contextComplete: number }>;
    failures: Array<{ provisionId: string; reason: string }>;
  };
  notes: string[];
}

function textHash(text: string): string {
  return createHash("sha256").update(normalizeText(text), "utf8").digest("hex");
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function nearDuplicate(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return true;
  if (na.length < 80 || nb.length < 80) return false;
  // Containment of a long distinctive prefix/suffix
  const pref = na.slice(0, 120);
  const suf = na.slice(-120);
  return (nb.includes(pref) && nb.includes(suf)) || (na.includes(nb.slice(0, 120)) && na.includes(nb.slice(-120)));
}

/** Heuristic: controlling context present if definitions family OR financial terms OR amends link OR parent assembled. */
export function hasCompleteControllingContext(p: PrecedentProvision, corpus: PrecedentCorpus): boolean {
  if (p.covenantFamily === "DEFINITIONS_CALCULATION_RULES") return true;
  if (p.financialDefinitionTerms.length > 0) return true;
  if (p.amendsProvisionId && corpus.get(p.amendsProvisionId)) return true;
  // Same-package definition available for a capitalized financial term in text
  const defs = corpus.list().filter(
    (d) =>
      d.locator.packageId === p.locator.packageId &&
      d.covenantFamily === "DEFINITIONS_CALCULATION_RULES" &&
      d.sourceText.length > 40,
  );
  const needs = [
    "Consolidated EBITDA",
    "Indebtedness",
    "Permitted Lien",
    "Restricted Subsidiary",
    "Available Amount",
    "Total Net Leverage",
  ];
  const text = p.sourceText;
  const referenced = needs.filter((t) => text.includes(t));

  // Short basket: complete if parent section is present in corpus (Phase 4 assembly).
  if (p.tags.includes("basket") && p.sourceText.length < 400) {
    const parentRef = p.locator.sourceSectionRef.replace(/\([a-z0-9]+\)$/i, "");
    const parent = corpus.list().find(
      (x) =>
        x.locator.packageId === p.locator.packageId &&
        x.locator.sourceSectionRef === parentRef &&
        x.provisionId !== p.provisionId &&
        x.sourceText.length >= 200,
    );
    if (!parent) return false;
    // Parent present — still require defs for referenced heavy terms if any
    if (referenced.length === 0) return true;
    if (defs.length === 0) return false;
    return referenced.every((t) => defs.some((d) => d.sourceText.includes(t) || d.locator.sourceSectionRef.includes(t)));
  }

  if (defs.length === 0) return referenced.length === 0;
  if (referenced.length === 0) return true;
  return referenced.every((t) => defs.some((d) => d.sourceText.includes(t) || d.locator.sourceSectionRef.includes(t)));
}

export function clusterDuplicateSpans(provisions: PrecedentProvision[]): {
  clusters: SpanCluster[];
  representatives: PrecedentProvision[];
  duplicateMemberCount: number;
} {
  const byHash = new Map<string, PrecedentProvision[]>();
  for (const p of provisions) {
    const h = p.sourceVersionHash || textHash(p.sourceText);
    const list = byHash.get(h) ?? [];
    list.push(p);
    byHash.set(h, list);
  }

  const clusters: SpanCluster[] = [];
  const claimed = new Set<string>();
  const representatives: PrecedentProvision[] = [];

  for (const [h, members] of byHash) {
    if (members.length > 1) {
      const rep = members[0]!;
      clusters.push({
        clusterId: `hash:${h.slice(0, 12)}`,
        memberProvisionIds: members.map((m) => m.provisionId),
        representativeProvisionId: rep.provisionId,
        reason: "IDENTICAL_HASH",
      });
      for (const m of members) claimed.add(m.provisionId);
      representatives.push(rep);
    }
  }

  // Path+overlap clustering among remaining
  const remaining = provisions.filter((p) => !claimed.has(p.provisionId));
  const byPath = new Map<string, PrecedentProvision[]>();
  for (const p of remaining) {
    const key = `${p.locator.sourcePath}`;
    const list = byPath.get(key) ?? [];
    list.push(p);
    byPath.set(key, list);
  }

  for (const [, group] of byPath) {
    const sorted = [...group].sort((a, b) => a.locator.charStart - b.locator.charStart || b.sourceText.length - a.sourceText.length);
    const localReps: PrecedentProvision[] = [];
    for (const p of sorted) {
      const overlapParent = localReps.find(
        (r) =>
          rangesOverlap(r.locator.charStart, r.locator.charEnd, p.locator.charStart, p.locator.charEnd) &&
          (nearDuplicate(r.sourceText, p.sourceText) ||
            (p.locator.charStart >= r.locator.charStart && p.locator.charEnd <= r.locator.charEnd)),
      );
      if (overlapParent) {
        clusters.push({
          clusterId: `overlap:${overlapParent.provisionId}:${p.provisionId}`,
          memberProvisionIds: [overlapParent.provisionId, p.provisionId],
          representativeProvisionId: overlapParent.provisionId,
          reason: nearDuplicate(overlapParent.sourceText, p.sourceText) ? "NEAR_DUPLICATE_TEXT" : "SAME_PATH_OVERLAP",
        });
        claimed.add(p.provisionId);
      } else {
        localReps.push(p);
        representatives.push(p);
        claimed.add(p.provisionId);
      }
    }
  }

  // Any still unclaimed
  for (const p of provisions) {
    if (!claimed.has(p.provisionId)) {
      representatives.push(p);
      claimed.add(p.provisionId);
    }
  }

  const duplicateMemberCount = provisions.length - representatives.length;
  return { clusters, representatives, duplicateMemberCount };
}

/**
 * Stratified sample across issuers and covenant families (≥ minSample).
 */
export function stratifiedSample(provisions: PrecedentProvision[], minSample = 100): PrecedentProvision[] {
  const byKey = new Map<string, PrecedentProvision[]>();
  for (const p of provisions) {
    const key = `${p.issuerId}|${p.covenantFamily}`;
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }
  const keys = [...byKey.keys()].sort();
  const out: PrecedentProvision[] = [];
  let round = 0;
  while (out.length < minSample && round < 50) {
    let added = false;
    for (const k of keys) {
      const list = byKey.get(k)!;
      if (round < list.length) {
        out.push(list[round]!);
        added = true;
        if (out.length >= minSample) break;
      }
    }
    if (!added) break;
    round += 1;
  }
  return out;
}

export function auditExactMatchAndContext(
  sample: PrecedentProvision[],
  corpus: PrecedentCorpus,
  baseDir: string = process.cwd(),
): CorpusAuditReport["spanAudit"] {
  const byIssuer: CorpusAuditReport["spanAudit"]["byIssuer"] = {};
  const byFamily: CorpusAuditReport["spanAudit"]["byFamily"] = {};
  const failures: Array<{ provisionId: string; reason: string }> = [];
  let exact = 0;
  let contextOk = 0;

  for (const p of sample) {
    const v = validateSourceSpan(p, baseDir);
    const exactOk = v.ok && !v.reason.includes("offset drift");
    // Stricter exact: offsets must slice to normalized-equal prefix
    let strictExact = false;
    const abs = join(baseDir, p.locator.sourcePath);
    if (existsSync(abs) && !p.locator.sourcePath.includes("reviewed-examples")) {
      const file = readFileSync(abs, "utf8");
      const slice = file.slice(p.locator.charStart, p.locator.charEnd);
      const a = normalizeText(slice).slice(0, 100);
      const b = normalizeText(p.sourceText).slice(0, 100);
      strictExact = a.length > 0 && a === b;
    } else if (v.ok) {
      strictExact = true; // synthetic
    }
    if (strictExact) exact += 1;
    else if (v.ok) {
      // count soft match separately — still not exact
      failures.push({ provisionId: p.provisionId, reason: `soft-match-only: ${v.reason}` });
    } else {
      failures.push({ provisionId: p.provisionId, reason: v.reason });
    }

    const ctx = hasCompleteControllingContext(p, corpus);
    if (ctx) contextOk += 1;

    const iss = (byIssuer[p.issuerId] ??= { sampled: 0, exactMatch: 0, contextComplete: 0 });
    iss.sampled += 1;
    if (strictExact) iss.exactMatch += 1;
    if (ctx) iss.contextComplete += 1;

    const fam = (byFamily[p.covenantFamily] ??= { sampled: 0, exactMatch: 0, contextComplete: 0 });
    fam.sampled += 1;
    if (strictExact) fam.exactMatch += 1;
    if (ctx) fam.contextComplete += 1;
  }

  const n = sample.length;
  return {
    sampleSize: n,
    exactMatchCount: exact,
    exactMatchRate: n ? exact / n : 0,
    contextCompleteCount: contextOk,
    contextCompletenessRate: n ? contextOk / n : 0,
    byIssuer,
    byFamily,
    failures: failures.slice(0, 40),
  };
}

export function auditCorpus(corpus: PrecedentCorpus, baseDir: string = process.cwd(), minSample = 100): CorpusAuditReport {
  const list = corpus.list();
  const docs = new Set(list.map((p) => p.locator.documentId));
  const issuers = new Set(list.map((p) => p.issuerId));
  const { clusters, representatives, duplicateMemberCount } = clusterDuplicateSpans(list);
  const contextComplete = representatives.filter((p) => hasCompleteControllingContext(p, corpus)).length;
  const sample = stratifiedSample(list, minSample);
  const spanAudit = auditExactMatchAndContext(sample, corpus, baseDir);

  return {
    schemaVersion: "precedent-comparison-corpus-audit.v1",
    generatedAt: new Date().toISOString(),
    rawProvisionCount: list.length,
    distinctSourceDocuments: docs.size,
    distinctIssuers: issuers.size,
    distinctProvisionSpans: representatives.length,
    duplicateOrOverlappingSpanCount: duplicateMemberCount,
    deduplicatedComparableProvisionCount: representatives.length,
    provisionsWithCompleteControllingContext: contextComplete,
    provisionsMissingControllingContext: representatives.length - contextComplete,
    heldOutProvisionCount: list.filter((p) => isHeldOutEval(p)).length,
    clusters: clusters.slice(0, 200),
    spanAudit,
    notes: [
      "Deduplicated count collapses identical hashes and nested/overlapping same-path extracts.",
      "Exact-match requires normalized equality of file[charStart:charEnd] prefix vs stored sourceText.",
      "Context-completeness is a heuristic (same-package definitions / amendment links) — not Atlas closure.",
      "Duplicate extracts are not counted as distinct comparable provisions.",
    ],
  };
}
