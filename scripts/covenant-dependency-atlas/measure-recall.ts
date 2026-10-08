/**
 * Recall / precision measurement against the frozen Phase-3 independent GT.
 *
 * Phase 4 corrects a Phase-3 harness artifact: when `termName` is absent,
 * matching is kind-only (toLabel is a human label, not an identity key).
 * The frozen 135-edge benchmark is never mutated here.
 */

import type { AtlasDocument } from "./schema";

export interface ExpectedEdge {
  edgeId: string;
  documentId: string;
  issuer?: string;
  split: "development" | "evaluation" | "blind";
  kind: string;
  toLabel?: string;
  termName?: string;
  connective?: string;
}

export interface RecallRow {
  edgeId: string;
  documentId: string;
  split: string;
  kind: string;
  hit: boolean;
  hitMode: "TERM" | "KIND_ONLY" | "MISS";
}

function wilson(successes: number, n: number): { low: number; high: number } | null {
  if (n === 0) return null;
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return { low: Math.max(0, (centre - margin) / denom), high: Math.min(1, (centre + margin) / denom) };
}

function pack(expected: number, truePositives: number, fp: number) {
  const w = wilson(truePositives, expected);
  return {
    expected,
    truePositives,
    falseNegatives: expected - truePositives,
    precisionProbeFalsePositives: fp,
    recall: expected === 0 ? null : truePositives / expected,
    precision: truePositives + fp === 0 ? null : truePositives / (truePositives + fp),
    wilsonRecallLow: w?.low ?? null,
    wilsonRecallHigh: w?.high ?? null,
  };
}

/** Phase-3 harness: used termName ?? toLabel (over-filtered). */
export function measureRecallPhase3Harness(docs: AtlasDocument[], expected: ExpectedEdge[]) {
  return measureRecall(docs, expected, { useToLabelAsTerm: true });
}

/** Phase-4 corrected harness: termName only when present; else kind-only. */
export function measureRecallCorrected(docs: AtlasDocument[], expected: ExpectedEdge[]) {
  return measureRecall(docs, expected, { useToLabelAsTerm: false });
}

function measureRecall(
  docs: AtlasDocument[],
  expected: ExpectedEdge[],
  opts: { useToLabelAsTerm: boolean },
) {
  const details: RecallRow[] = [];
  let tp = 0;
  let fpProbe = 0;
  const splitAcc: Record<string, { expected: number; tp: number; fp: number }> = {
    development: { expected: 0, tp: 0, fp: 0 },
    evaluation: { expected: 0, tp: 0, fp: 0 },
    blind: { expected: 0, tp: 0, fp: 0 },
  };
  const familyAcc: Record<string, { expected: number; tp: number }> = {};

  for (const exp of expected) {
    splitAcc[exp.split]!.expected += 1;
    familyAcc[exp.kind] ??= { expected: 0, tp: 0 };
    familyAcc[exp.kind]!.expected += 1;
    const doc = docs.find((d) => d.documentId === exp.documentId);
    let hit = false;
    let hitMode: RecallRow["hitMode"] = "MISS";
    if (doc) {
      const term = opts.useToLabelAsTerm ? (exp.termName ?? exp.toLabel) : exp.termName;
      for (const e of doc.edges) {
        if (e.kind !== exp.kind) continue;
        if (!term) {
          hit = true;
          hitMode = "KIND_ONLY";
          break;
        }
        const termOk =
          e.toNodeId.includes(term.toLowerCase().replace(/\s+/g, "_")) ||
          e.rationale.toLowerCase().includes(term.toLowerCase()) ||
          e.sourceSpans.some((s) => (s.excerpt ?? "").toLowerCase().includes(term.toLowerCase().slice(0, 24)));
        if (termOk) {
          hit = true;
          hitMode = "TERM";
          break;
        }
      }
    }
    if (hit) {
      tp += 1;
      splitAcc[exp.split]!.tp += 1;
      familyAcc[exp.kind]!.tp += 1;
    }
    details.push({ edgeId: exp.edgeId, documentId: exp.documentId, split: exp.split, kind: exp.kind, hit, hitMode });
  }

  const coveredIds = new Set(expected.map((e) => e.documentId));
  for (const doc of docs.filter((d) => coveredIds.has(d.documentId))) {
    const n = doc.edges.filter(
      (e) =>
        (e.kind === "RECLASSIFICATION" || e.kind === "COVENANT_TO_SHARED_BASKET") &&
        e.evidenceClass !== "STRUCTURAL_CROSS_REFERENCE" &&
        e.evidenceClass !== "EXPLICIT_SOURCE_CONNECTIVE" &&
        e.evidenceClass !== "STRUCTURAL_DEFINITION_OCCURRENCE",
    ).length;
    fpProbe += n;
    const split = expected.find((e) => e.documentId === doc.documentId)?.split ?? "development";
    splitAcc[split]!.fp += n;
  }

  return {
    overall: pack(expected.length, tp, fpProbe),
    bySplit: {
      development: pack(splitAcc.development!.expected, splitAcc.development!.tp, splitAcc.development!.fp),
      evaluation: pack(splitAcc.evaluation!.expected, splitAcc.evaluation!.tp, splitAcc.evaluation!.fp),
      blind: pack(splitAcc.blind!.expected, splitAcc.blind!.tp, splitAcc.blind!.fp),
    },
    byFamily: Object.fromEntries(
      Object.entries(familyAcc).map(([k, v]) => [
        k,
        {
          expected: v.expected,
          truePositives: v.tp,
          falseNegatives: v.expected - v.tp,
          recall: v.expected === 0 ? null : v.tp / v.expected,
        },
      ]),
    ),
    details,
    harness: opts.useToLabelAsTerm ? "PHASE3_TO_LABEL_OVERFILTER" : "PHASE4_TERMNAME_OR_KIND",
  };
}
