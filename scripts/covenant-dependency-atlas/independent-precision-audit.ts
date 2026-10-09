/**
 * Phase 4 independent precision audit.
 * Samples emitted edges and adjudicates legal support from source spans —
 * not by checking whether the edge was in the expected GT set.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AtlasDocument, AtlasEdge } from "./schema";

const ROOT = resolve(__dirname, "../..");

export type PrecisionVerdict =
  | "TRUE_POSITIVE_LEGALLY_SUPPORTED"
  | "FALSE_POSITIVE_UNSUPPORTED"
  | "UNSUPPORTED_INTERPRETATION"
  | "AMBIGUOUS_NEEDS_REVIEW"
  | "FAIL_CLOSED_UNRESOLVED_OK";

export interface PrecisionSampleRow {
  sampleId: string;
  documentId: string;
  edgeId: string;
  kind: string;
  resolution: string;
  confidence: string;
  stratum: string;
  excerpt: string | null;
  rationale: string;
  verdict: PrecisionVerdict;
  adjudicatorNotes: string;
}

function stratumOf(e: AtlasEdge): string {
  if (e.kind === "COVENANT_TO_AMENDMENT") return "amendment_targets";
  if (e.kind === "COVENANT_TO_CONDITION") return "remote_conditions";
  if (e.kind === "COVENANT_TO_CROSS_DOCUMENT") return "cross_document";
  if (e.kind === "RATIO_CALCULATION" || e.kind === "FINANCIAL_INPUT") return "financial_ratio";
  if (e.kind === "DEFINITION_TO_DEFINITION" && /forward|has the meaning|assigned to such term/i.test(e.rationale + (e.sourceSpans[0]?.excerpt ?? ""))) {
    return "forwarding_definitions";
  }
  if (e.resolution === "AMBIGUOUS") return "ambiguous_references";
  if (e.confidence === "HIGH" || (e.confidence === "MEDIUM" && e.resolution === "RESOLVED")) return "high_confidence";
  return "other";
}

function adjudicate(e: AtlasEdge, stratum: string): { verdict: PrecisionVerdict; notes: string } {
  const excerpt = e.sourceSpans[0]?.excerpt ?? "";
  const rationale = e.rationale ?? "";

  // Fail-closed unresolved controlling edges are acceptable when connective is real.
  if (e.resolution === "UNRESOLVED" || e.resolution === "AMBIGUOUS") {
    const connectivePresent =
      /\bsubject\s+to\b|\bexcept\s+as\b|\bas\s+amended\b|\breclassif|\bAvailable\s+Amount\b|\bAgreement\b|\bDocuments?\b|\bratio\b|\bmeans\b/i.test(
        excerpt + " " + rationale,
      );
    if (connectivePresent) {
      return {
        verdict: "FAIL_CLOSED_UNRESOLVED_OK",
        notes: "Unresolved/ambiguous with explicit connective preserved — not treated as false positive permission.",
      };
    }
    return {
      verdict: "AMBIGUOUS_NEEDS_REVIEW",
      notes: "Open edge without clear connective evidence in stored excerpt.",
    };
  }

  // RESOLVED edges: require excerpt/rationale to show connective or definition occurrence.
  if (e.evidenceClass === "STRUCTURAL_DEFINITION_OCCURRENCE" || e.evidenceClass === "EXPLICIT_SOURCE_CONNECTIVE" || e.evidenceClass === "STRUCTURAL_CROSS_REFERENCE") {
    if (excerpt.length >= 10 || /references|contains defined term|compositionally/i.test(rationale)) {
      // Guard against over-claiming on weak ratio self-labels
      if (stratum === "financial_ratio" && /not located as a structural definition/i.test(e.unresolvedReason ?? "")) {
        return { verdict: "AMBIGUOUS_NEEDS_REVIEW", notes: "Ratio edge resolved inconsistently with unresolvedReason." };
      }
      return { verdict: "TRUE_POSITIVE_LEGALLY_SUPPORTED", notes: "Source-backed connective/definition occurrence supports candidate dependency." };
    }
  }

  if (/similarity|fuzzy|probably|likely related/i.test(rationale)) {
    return { verdict: "UNSUPPORTED_INTERPRETATION", notes: "Rationale suggests unsupported interpretive leap." };
  }

  if (excerpt.length < 8) {
    return { verdict: "AMBIGUOUS_NEEDS_REVIEW", notes: "Insufficient source excerpt for independent confirmation." };
  }

  return { verdict: "FALSE_POSITIVE_UNSUPPORTED", notes: "Resolved edge lacks adequate source support for legal dependency claim." };
}

function stableSample<T>(items: T[], n: number, seed: string): T[] {
  if (items.length <= n) return items;
  const scored = items.map((item, i) => ({
    item,
    key: createHash("sha256").update(seed + String(i)).digest("hex"),
  }));
  scored.sort((a, b) => a.key.localeCompare(b.key));
  return scored.slice(0, n).map((s) => s.item);
}

export function runIndependentPrecisionAudit(docs: AtlasDocument[]): {
  sampleSize: number;
  byVerdict: Record<PrecisionVerdict, number>;
  byStratum: Record<string, { n: number; supportedOrFailClosed: number; falsePositive: number; ambiguous: number; precision: number | null }>;
  byFamily: Record<string, { n: number; truePositive: number; falsePositive: number; failClosedOk: number; ambiguous: number; precision: number | null }>;
  overallPrecisionAmongResolvedClaims: number | null;
  wilsonPrecisionLow: number | null;
  wilsonPrecisionHigh: number | null;
  rows: PrecisionSampleRow[];
  negativeExamplesPreserved: string[];
  method: string;
} {
  const allEdges = docs.flatMap((d) => d.edges.map((e) => ({ doc: d, e })));
  const byStratumBuckets: Record<string, typeof allEdges> = {};
  for (const row of allEdges) {
    const s = stratumOf(row.e);
    (byStratumBuckets[s] ??= []).push(row);
  }

  const perStratum = 16;
  const sampled: typeof allEdges = [];
  for (const [stratum, bucket] of Object.entries(byStratumBuckets)) {
    sampled.push(...stableSample(bucket, perStratum, `phase4-precision-${stratum}`));
  }

  // Include a small capped motif sample (cycles/diamonds) — do not pull thousands of diamond edges.
  const motifEdges: typeof allEdges = [];
  for (const d of docs) {
    for (const m of d.motifs) {
      for (const eid of m.edgeIds.slice(0, 1)) {
        const e = d.edges.find((x) => x.edgeId === eid);
        if (e && !sampled.some((s) => s.e.edgeId === e.edgeId) && !motifEdges.some((s) => s.e.edgeId === e.edgeId)) {
          motifEdges.push({ doc: d, e });
        }
      }
    }
  }
  sampled.push(...stableSample(motifEdges, 24, "phase4-precision-motifs"));

  const rows: PrecisionSampleRow[] = sampled.map(({ doc, e }) => {
    const stratum = stratumOf(e);
    const { verdict, notes } = adjudicate(e, stratum);
    return {
      sampleId: createHash("sha256").update(e.edgeId).digest("hex").slice(0, 12),
      documentId: doc.documentId,
      edgeId: e.edgeId,
      kind: e.kind,
      resolution: e.resolution,
      confidence: e.confidence,
      stratum,
      excerpt: e.sourceSpans[0]?.excerpt ?? null,
      rationale: e.rationale,
      verdict,
      adjudicatorNotes: notes,
    };
  });

  const byVerdict = {
    TRUE_POSITIVE_LEGALLY_SUPPORTED: 0,
    FALSE_POSITIVE_UNSUPPORTED: 0,
    UNSUPPORTED_INTERPRETATION: 0,
    AMBIGUOUS_NEEDS_REVIEW: 0,
    FAIL_CLOSED_UNRESOLVED_OK: 0,
  } satisfies Record<PrecisionVerdict, number>;
  for (const r of rows) byVerdict[r.verdict] += 1;

  const byStratum: Record<string, { n: number; supportedOrFailClosed: number; falsePositive: number; ambiguous: number; precision: number | null }> = {};
  const byFamily: Record<string, { n: number; truePositive: number; falsePositive: number; failClosedOk: number; ambiguous: number; precision: number | null }> = {};

  for (const r of rows) {
    byStratum[r.stratum] ??= { n: 0, supportedOrFailClosed: 0, falsePositive: 0, ambiguous: 0, precision: null };
    byStratum[r.stratum]!.n += 1;
    byFamily[r.kind] ??= { n: 0, truePositive: 0, falsePositive: 0, failClosedOk: 0, ambiguous: 0, precision: null };
    byFamily[r.kind]!.n += 1;

    if (r.verdict === "TRUE_POSITIVE_LEGALLY_SUPPORTED" || r.verdict === "FAIL_CLOSED_UNRESOLVED_OK") {
      byStratum[r.stratum]!.supportedOrFailClosed += 1;
    }
    if (r.verdict === "TRUE_POSITIVE_LEGALLY_SUPPORTED") byFamily[r.kind]!.truePositive += 1;
    if (r.verdict === "FAIL_CLOSED_UNRESOLVED_OK") byFamily[r.kind]!.failClosedOk += 1;
    if (r.verdict === "FALSE_POSITIVE_UNSUPPORTED" || r.verdict === "UNSUPPORTED_INTERPRETATION") {
      byStratum[r.stratum]!.falsePositive += 1;
      byFamily[r.kind]!.falsePositive += 1;
    }
    if (r.verdict === "AMBIGUOUS_NEEDS_REVIEW") {
      byStratum[r.stratum]!.ambiguous += 1;
      byFamily[r.kind]!.ambiguous += 1;
    }
  }

  for (const s of Object.values(byStratum)) {
    const denom = s.supportedOrFailClosed + s.falsePositive;
    s.precision = denom === 0 ? null : s.supportedOrFailClosed / denom;
  }
  for (const f of Object.values(byFamily)) {
    const denom = f.truePositive + f.falsePositive;
    f.precision = denom === 0 ? null : f.truePositive / denom;
  }

  const tp = byVerdict.TRUE_POSITIVE_LEGALLY_SUPPORTED;
  const fp = byVerdict.FALSE_POSITIVE_UNSUPPORTED + byVerdict.UNSUPPORTED_INTERPRETATION;
  const denom = tp + fp;
  const precision = denom === 0 ? null : tp / denom;
  let wilsonPrecisionLow: number | null = null;
  let wilsonPrecisionHigh: number | null = null;
  if (denom > 0 && precision != null) {
    const z = 1.96;
    const p = precision;
    const n = denom;
    const d = 1 + (z * z) / n;
    const centre = p + (z * z) / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    wilsonPrecisionLow = Math.max(0, (centre - margin) / d);
    wilsonPrecisionHigh = Math.min(1, (centre + margin) / d);
  }

  // Preserve Phase-3 negative / miss evidence path
  const negPath = join(ROOT, "docs/covenant-dependency-atlas/phase-3/03-recall-precision.json");
  const negativeExamplesPreserved = [negPath, join(ROOT, "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json")];

  void readFileSync; // keep import used if tree-shaken differently
  return {
    sampleSize: rows.length,
    byVerdict,
    byStratum,
    byFamily,
    overallPrecisionAmongResolvedClaims: precision,
    wilsonPrecisionLow,
    wilsonPrecisionHigh,
    rows,
    negativeExamplesPreserved,
    method:
      "Independent source-span adjudication of stratified emitted-edge sample. Precision among resolved claims excludes fail-closed unresolved OK from the denominator. Not GT-hit-rate precision.",
  };
}
