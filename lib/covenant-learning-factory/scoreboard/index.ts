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
import {
  assertComparable,
  checkMembership,
  DEFAULT_THRESHOLDS,
  evaluationIdentity,
  IncomparableEvaluationError,
  materialRegressionLimit,
  membershipFromReport,
  sourceInputSha256,
  type BenchmarkMembership,
  type BenchmarkMigration,
  type EvaluationIdentity,
  type GateThresholds,
} from "./integrity";
export * from "./integrity";
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
  /** Frozen-membership identity: source hash and issuer (see integrity.ts). */
  contentSha256?: string | null;
  issuerCik?: string | null;
  ticker?: string | null;
  /** sha256 of everything scored for this source (comparability binding). */
  inputSha256?: string | null;
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
  /** Snapshot + per-source input hashes + ruleset version/hash. Comparisons without a matching identity are refused. */
  identity?: EvaluationIdentity | null;
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
    // Tree locator is ON by default (CLF_SCOREBOARD_TREE=0 disables). After the SEC text backfill and the
    // nesting fixes it lowers HELDOUT 3616 -> 2386 (v2) with 16/16 hand-checked flips genuine
    // (docs/clf-scoreboard/section-tree-findings.md). Mode: CLF_SCOREBOARD_TREE_MODE=agree (default) | override.
    locator: process.env.CLF_SCOREBOARD_TREE === "0" ? undefined : buildTreeLocator({ documentText: input.documentText, candidates: input.candidates }),
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
    contentSha256: input.source.contentSha256 ?? null,
    issuerCik: input.source.issuerCik ?? null,
    ticker: input.source.ticker ?? null,
    inputSha256: sourceInputSha256(input),
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
  meta: { mode: ScoreboardReport["mode"]; rulesetVersion: number; rulesetSha256?: string; scorerConfig?: string | null },
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
    identity: meta.rulesetSha256
      ? evaluationIdentity(sorted, { rulesetVersion: meta.rulesetVersion, rulesetSha256: meta.rulesetSha256 }, meta.scorerConfig ?? null)
      : null,
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
export interface GateOptions {
  /** Committed frozen HELDOUT membership (default: derived from the baseline's HELDOUT rows). */
  membership?: Pick<BenchmarkMembership, "heldout">;
  /** Committed benchmark migrations authorizing membership changes. */
  migrations?: BenchmarkMigration[];
  /** Recorded thresholds from the baseline history (default DEFAULT_THRESHOLDS). */
  thresholds?: GateThresholds;
}

export function compareToBaseline(baseline: ScoreboardReport, current: ScoreboardReport, opts: GateOptions = {}): GateResult {
  // Frozen membership first: a moved / dropped / re-hashed HELDOUT source is reported as such.
  const membershipReasons = checkMembership(
    opts.membership ?? membershipFromReport(baseline.perSource, "baseline"),
    current.perSource,
    opts.migrations ?? [],
  );
  // Refuse incomparable evaluations (different snapshot / source hashes / ruleset). If membership already
  // failed, the run fails with both reasons instead of throwing.
  let incomparable: string | null = null;
  try {
    assertComparable(baseline, current);
  } catch (err) {
    if (!(err instanceof IncomparableEvaluationError) || membershipReasons.length === 0) throw err;
    incomparable = err.message;
  }
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
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
  if (heldoutAfter - heldoutBefore > t.heldoutTotalMaxIncrease) reasons.push(`HELDOUT errors increased ${heldoutBefore} → ${heldoutAfter}`);
  const usBefore = baseline.totals.HELDOUT.UNSUPPORTED_SEMANTICS;
  const usAfter = current.totals.HELDOUT.UNSUPPORTED_SEMANTICS;
  if (usAfter - usBefore > t.heldoutUnsupportedMaxIncrease) reasons.push(`HELDOUT UNSUPPORTED_SEMANTICS increased ${usBefore} → ${usAfter}`);
  for (const id of ids) {
    const b = before.get(id);
    const a = after.get(id);
    if (!b || !a || b.split !== "HELDOUT" || a.split !== "HELDOUT" || b.duplicateOf || a.duplicateOf) continue;
    if (a.counts.UNSUPPORTED_SEMANTICS > b.counts.UNSUPPORTED_SEMANTICS) {
      reasons.push(`HELDOUT source ${id} UNSUPPORTED_SEMANTICS ${b.counts.UNSUPPORTED_SEMANTICS} → ${a.counts.UNSUPPORTED_SEMANTICS}`);
    }
    const limit = materialRegressionLimit(b.total, t);
    if (a.total - b.total >= limit) {
      reasons.push(`material per-source regression: ${id} ${b.total} → ${a.total} (+${a.total - b.total} ≥ limit ${limit})`);
    }
  }
  reasons.push(...membershipReasons);
  if (incomparable) reasons.push(incomparable);
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
