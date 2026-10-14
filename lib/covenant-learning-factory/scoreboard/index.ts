/**
 * Sweep self-check scoreboard (deterministic, read-only).
 *
 * Runs the exact sweep path (buildComputationPackage → runCovenantComputation →
 * selfCheckComputation) per source, without any Neon writes, and counts the
 * error classes that measure extraction quality:
 *   COVERAGE_GAP, DISCOVERY_GAP, UNSUPPORTED_SEMANTICS.
 *
 * Sources are split into DEV (checked-in manifest of dev / fixture-derived
 * sources that code has been tuned against) and HELDOUT (everything else).
 * The gate fails when HELDOUT errors increase versus a committed baseline.
 * No AI / LLM calls. No per-issuer logic.
 */

import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { runCovenantComputation } from "../../contract-model/covenant-computation";
import type { LearnedRuleSet } from "../learned-rules/types";
import { buildComputationPackage, type PrecedentSourceRow } from "../sweep/build-package";
import { candidatesAsRows } from "../sweep/neon-load";
import { buildTreeLocator } from "../sweep/tree-locator";
import { classifyDocType, IN_SCOPE, type DocType } from "./doc-type";
import {
  selfCheckComputation,
  type PrecedentCandidate,
  type PrecedentCondition,
  type PrecedentDefinition,
} from "../sweep/self-check";

export const SCOREBOARD_CLASSES = ["COVERAGE_GAP", "DISCOVERY_GAP", "UNSUPPORTED_SEMANTICS"] as const;
export type ScoreboardClass = (typeof SCOREBOARD_CLASSES)[number];
export type ClassCounts = Record<ScoreboardClass, number>;
export type Split = "DEV" | "HELDOUT";

export interface ScoreboardSourceInput {
  source: PrecedentSourceRow;
  documentText: string | null;
  candidates: PrecedentCandidate[];
  definitions: PrecedentDefinition[];
  conditions: PrecedentCondition[];
}

export interface SourceScore {
  sourceId: string;
  split: Split;
  docType?: DocType;
  /** Set when this source duplicates another; excluded from totals and the gate. */
  duplicateOf?: string | null;
  counts: ClassCounts;
  total: number;
  /** DOCUMENT = scored over stored document text; COMPOSITE = no text, candidate excerpts only. */
  textBasis?: "DOCUMENT" | "COMPOSITE";
  /** Candidate-level errors (only written via --write-findings; stripped from the report). */
  findings?: ScoreFinding[];
}

export interface ScoreFinding {
  class: ScoreboardClass;
  /** Stable key for diffing runs: candidateId / definitionId / message. */
  key: string;
  family: string | null;
  sectionRef: string | null;
  excerpt: string;
  message: string;
}

export interface ScoreboardReport {
  schema: "clf-scoreboard/v1";
  mode: "neon" | "snapshot";
  rulesetVersion: number;
  sourceCount: number;
  totals: Record<Split, ClassCounts & { total: number; sources: number }>;
  /** Same totals restricted to in-scope document types (credit agreements, indentures/notes, credit support, unknown). */
  inScopeTotals?: Record<Split, ClassCounts & { total: number; sources: number }>;
  /** Out-of-scope sources (doc type OTHER): reported, never silently dropped. */
  excluded?: { sourceId: string; split: Split; total: number }[];
  /** Duplicates: scored and listed, never counted. */
  duplicates?: { sourceId: string; duplicateOf: string; total: number }[];
  perSource: SourceScore[];
}

export interface DevManifest {
  description: string;
  /** Exact sourceIds treated as DEV (fixtures / fixture-derived packages). */
  sourceIds: string[];
  /** SEC CIKs of issuers with DEV fixtures: every source with one of these issuerCik values is DEV.
   *  Split by CIK (never ticker / hand-listed sourceIds — tickers are null on many rows). */
  devIssuerCiks?: { cik: string; issuer: string; evidence: string }[];
  /** Exact duplicates of another source: scored and listed, excluded from totals and the gate. */
  duplicates?: { sourceId: string; duplicateOf: string; evidence: string }[];
}

export function emptyCounts(): ClassCounts {
  return { COVERAGE_GAP: 0, DISCOVERY_GAP: 0, UNSUPPORTED_SEMANTICS: 0 };
}

/** Normalized issuer ticker ("CHWY_ALT" → "CHWY"). */
export function issuerOf(ticker: string | null | undefined): string | null {
  if (!ticker) return null;
  return ticker.toUpperCase().replace(/_(?:ALT|SEL)$/, "");
}

export function normCik(cik: string | null | undefined): string | null {
  if (!cik) return null;
  const d = cik.replace(/\D/g, "").replace(/^0+/, "");
  return d.length ? d : null; // "0000000000" (fixture placeholder) → null
}

export function splitFor(sourceId: string, manifest: DevManifest, issuerCik?: string | null): Split {
  if (manifest.sourceIds.includes(sourceId) || /^(fixture|fdp):/.test(sourceId)) return "DEV";
  const cik = normCik(issuerCik);
  if (cik && manifest.devIssuerCiks?.some((d) => normCik(d.cik) === cik)) return "DEV";
  return "HELDOUT";
}

export function duplicateOf(sourceId: string, manifest: DevManifest): string | null {
  return manifest.duplicates?.find((d) => d.sourceId === sourceId)?.duplicateOf ?? null;
}

const FIXED_NOW = "1970-01-01T00:00:00.000Z";

/** Score one source exactly as the sweep does (dry run, fixed clock). */
export function scoreSource(input: ScoreboardSourceInput, rules: LearnedRuleSet, manifest: DevManifest): SourceScore {
  const sourceId = input.source.sourceId;
  const pkg = buildComputationPackage({
    source: input.source,
    documentText: input.documentText,
    candidates: candidatesAsRows(input.candidates),
    rules,
  });
  const result = runCovenantComputation(pkg, { rules, createdAt: FIXED_NOW });
  const errors = selfCheckComputation({
    packageKey: `clf-sweep:${sourceId}`,
    runId: `scoreboard:${sourceId}`,
    sourceId,
    result,
    candidates: input.candidates,
    definitions: input.definitions,
    conditions: input.conditions,
    now: FIXED_NOW,
    // Tree locator is OPT-IN (CLF_SCOREBOARD_TREE=1): it did not lower HELDOUT honestly (see docs/clf-scoreboard/section-tree-findings.md).
    locator: process.env.CLF_SCOREBOARD_TREE !== "1" ? undefined : buildTreeLocator({ documentText: input.documentText, candidates: input.candidates }),
  });
  const counts = emptyCounts();
  for (const e of errors) {
    if ((SCOREBOARD_CLASSES as readonly string[]).includes(e.class)) counts[e.class as ScoreboardClass] += 1;
  }
  const total = SCOREBOARD_CLASSES.reduce((a, c) => a + counts[c], 0);
  const docType = classifyDocType({
    sourceId,
    title: input.source.title,
    text: input.documentText,
    excerpts: input.candidates.map((c) => c.excerpt ?? ""),
  }).type;
  return {
    sourceId,
    split: splitFor(sourceId, manifest, input.source.issuerCik),
    duplicateOf: duplicateOf(sourceId, manifest),
    docType,
    counts,
    total,
    textBasis: input.documentText && input.documentText.trim() ? "DOCUMENT" : "COMPOSITE",
    findings: errors
      .filter((e) => (SCOREBOARD_CLASSES as readonly string[]).includes(e.class))
      .map((e) => {
        const ev = ((e as unknown as { evidence?: Record<string, unknown> }).evidence ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === "string" ? v : null);
        return {
          class: e.class as ScoreboardClass,
          key: str(ev.candidateId) ?? str(ev.definitionId) ?? str(ev.stableKey) ?? e.message,
          family: str(ev.expectedFamily) ?? str(ev.family),
          sectionRef: str(ev.sectionRef),
          excerpt: (str(ev.citationExcerpt) ?? "").slice(0, 200),
          message: e.message,
        };
      }),
  };
}

export function aggregate(
  perSource: SourceScore[],
  meta: { mode: ScoreboardReport["mode"]; rulesetVersion: number },
): ScoreboardReport {
  const totals = {
    DEV: { ...emptyCounts(), total: 0, sources: 0 },
    HELDOUT: { ...emptyCounts(), total: 0, sources: 0 },
  };
  const sorted = [...perSource].sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
  const duplicates: { sourceId: string; duplicateOf: string; total: number }[] = [];
  for (const s of sorted) {
    if (s.duplicateOf) {
      duplicates.push({ sourceId: s.sourceId, duplicateOf: s.duplicateOf, total: s.total });
      continue;
    }
    const t = totals[s.split];
    t.sources += 1;
    t.total += s.total;
    for (const c of SCOREBOARD_CLASSES) t[c] += s.counts[c];
  }
  const inScopeTotals = {
    DEV: { ...emptyCounts(), total: 0, sources: 0 },
    HELDOUT: { ...emptyCounts(), total: 0, sources: 0 },
  };
  const excluded: { sourceId: string; split: Split; total: number }[] = [];
  for (const s of sorted) {
    if (s.duplicateOf) continue;
    if (s.docType && !IN_SCOPE.has(s.docType)) {
      excluded.push({ sourceId: s.sourceId, split: s.split, total: s.total });
      continue;
    }
    const t = inScopeTotals[s.split];
    t.sources += 1;
    t.total += s.total;
    for (const c of SCOREBOARD_CLASSES) t[c] += s.counts[c];
  }
  return {
    schema: "clf-scoreboard/v1",
    mode: meta.mode,
    rulesetVersion: meta.rulesetVersion,
    sourceCount: sorted.length,
    totals,
    inScopeTotals,
    excluded,
    duplicates,
    perSource: sorted,
  };
}

export interface SourceDelta {
  sourceId: string;
  split: Split;
  before: number | null;
  after: number | null;
  delta: number;
  byClass: Partial<Record<ScoreboardClass, number>>;
}

export interface GateResult {
  pass: boolean;
  heldoutBefore: number;
  heldoutAfter: number;
  devBefore: number;
  devAfter: number;
  byClass: Record<Split, Record<ScoreboardClass, { before: number; after: number }>>;
  deltas: SourceDelta[];
  reasons: string[];
}

/**
 * Compare a report against a baseline. Fails (closed) when HELDOUT total errors
 * increase, or when HELDOUT sources disappear (a shrinking denominator could
 * otherwise hide regressions).
 */
export function compareToBaseline(baseline: ScoreboardReport, current: ScoreboardReport): GateResult {
  const reasons: string[] = [];
  const before = new Map(baseline.perSource.map((s) => [s.sourceId, s]));
  const after = new Map(current.perSource.map((s) => [s.sourceId, s]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  const deltas: SourceDelta[] = [];
  for (const id of ids) {
    const b = before.get(id);
    const a = after.get(id);
    const byClass: Partial<Record<ScoreboardClass, number>> = {};
    for (const c of SCOREBOARD_CLASSES) {
      const d = (a?.counts[c] ?? 0) - (b?.counts[c] ?? 0);
      if (d !== 0) byClass[c] = d;
    }
    const delta = (a?.total ?? 0) - (b?.total ?? 0);
    if (delta !== 0 || !a || !b) {
      deltas.push({ sourceId: id, split: (a ?? b)!.split, before: b?.total ?? null, after: a?.total ?? null, delta, byClass });
    }
  }
  const byClass = {
    DEV: Object.fromEntries(SCOREBOARD_CLASSES.map((c) => [c, { before: baseline.totals.DEV[c], after: current.totals.DEV[c] }])),
    HELDOUT: Object.fromEntries(SCOREBOARD_CLASSES.map((c) => [c, { before: baseline.totals.HELDOUT[c], after: current.totals.HELDOUT[c] }])),
  } as GateResult["byClass"];
  const heldoutBefore = baseline.totals.HELDOUT.total;
  const heldoutAfter = current.totals.HELDOUT.total;
  if (heldoutAfter > heldoutBefore) reasons.push(`HELDOUT errors increased ${heldoutBefore} → ${heldoutAfter}`);
  const missing = baseline.perSource.filter((s) => s.split === "HELDOUT" && !s.duplicateOf && !after.has(s.sourceId));
  if (missing.length > 0) reasons.push(`${missing.length} HELDOUT source(s) missing from current run`);
  return {
    pass: reasons.length === 0,
    heldoutBefore,
    heldoutAfter,
    devBefore: baseline.totals.DEV.total,
    devAfter: current.totals.DEV.total,
    byClass,
    deltas: deltas.sort((x, y) => x.delta - y.delta),
    reasons,
  };
}

// ---- snapshot I/O (offline CI mode) ----

export interface ScoreboardSnapshot {
  schema: "clf-scoreboard-snapshot/v1";
  capturedFrom: string;
  sources: ScoreboardSourceInput[];
}

export function writeSnapshotBuffer(snap: ScoreboardSnapshot): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(snap)), { level: 9 });
}

export function readSnapshot(path: string): ScoreboardSnapshot {
  const raw = readFileSync(path);
  const json = path.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const snap = JSON.parse(json) as ScoreboardSnapshot;
  if (snap.schema !== "clf-scoreboard-snapshot/v1") throw new Error(`unsupported snapshot schema ${String(snap.schema)}`);
  return snap;
}
