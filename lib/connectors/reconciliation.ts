/**
 * Multi-source financial-fact reconciliation (Phase B,
 * docs/autonomous-information-retrieval-v1.md §"Reconciliation").
 *
 * A PURE function - no DB access, no side effects - so it is trivially
 * testable and re-runnable against the same inputs any number of times
 * without touching the database. lib/connectors/ingestion.ts's RECONCILE
 * stage is the one caller that loads real ExtractionCandidate/
 * SourcePriorityRule rows and feeds them in; lib/company-state/canonical-state.ts
 * re-runs it fresh (see that file's own header comment for why) purely from
 * already-loaded data.
 *
 * ---------------------------------------------------------------------------
 * Design decisions (documented per the task's own "you choose, document it"
 * instructions):
 *
 * PERIOD = the calendar month of `asOfDate`, encoded "YYYY-MM" in UTC (never
 * local time zone, to keep this pure function's output deterministic
 * regardless of the machine it runs on). Two facts for the same metric dated
 * anywhere in the same UTC month are considered "the same period" and grouped
 * together - the natural granularity for the financial facts this pipeline
 * ingests (EDGAR filings, CSV uploads, compliance certificates), which are
 * reported monthly/quarterly, never daily.
 *
 * TOLERANCE = 1% relative difference (DEFAULT_RELATIVE_TOLERANCE below).
 * Two values are "the same" (MATCH) when every pairwise relative difference
 * within a group is <= this tolerance. A small, sensible default for
 * financial figures that may be rounded/restated slightly differently by
 * different sources without being a genuine conflict.
 *
 * STALENESS = a per-metric "how old is too old" threshold
 * (STALENESS_DAYS_BY_METRIC below) - CONFIGURATION, not universal truth,
 * exactly as the task's own brief instructs: these are reasonable defaults
 * for this product, tunable later, never hardcoded business logic disguised
 * as a constant. Checked against `now` (an explicit, injectable parameter -
 * never `Date.now()` read directly inside the pure function - so this stays
 * genuinely pure/testable).
 *
 * CLASSIFICATION PRECEDENCE (documented, since a group can technically
 * qualify for more than one condition): STALE_SOURCE is checked FIRST. A
 * value that all sources happen to agree on is still worth flagging if the
 * newest available figure is older than what this metric's own staleness
 * policy tolerates - agreement between two stale sources is not the same as
 * a current, trustworthy figure. Only once no candidate in the group is
 * stale do we classify by value agreement (MATCH) or disagreement
 * (MATERIAL_DIFFERENCE / CONFLICTING_SOURCE, resolved by SourcePriorityRule).
 *
 * MISSING_SOURCE - per the task's own explicit "reasonable v1 simplification"
 * allowance: detecting "a connector with FINANCIAL_FACTS capability is
 * connected but produced NOTHING for an expected metric" would require
 * inventing an "expected metrics registry" this codebase has no other reason
 * to have (which metrics SHOULD exist for a given company is not knowable
 * from the data itself - it would be a fabricated expectation, not a
 * fail-closed inference). The type is defined for forward-compatibility;
 * this function never produces it. Documented here, not silently omitted.
 *
 * SCOPE - only groups with 2+ candidates from DIFFERENT sourceConnectionIds
 * are classified and returned. A metric/period with a single source has
 * nothing to reconcile against; it is not an error, it is simply not
 * reconciliation's concern (it flows through the ordinary PENDING review
 * path untouched, per lib/connectors/ingestion.ts's RECONCILE stage).
 * ---------------------------------------------------------------------------
 */

import type { ConnectorType } from "@prisma/client";

export const DEFAULT_RELATIVE_TOLERANCE = 0.01;

/**
 * Per-metric staleness policy, in days - CONFIGURATION (task's own explicit
 * instruction), not a universal truth about any real company. Keys match the
 * small fixed FINANCIAL_METRIC_FIELD_MAP vocabulary
 * (lib/onboarding/promotion.ts §"Source mapping"). Values reflect the task's
 * own worked examples: cash moves daily (~1 day tolerance), debt balances
 * change on a roughly monthly cadence (~30 days), and EBITDA/income-statement-
 * derived figures are reported quarterly and can reasonably lag ~90 days.
 * Any metricName not listed here defaults to DEFAULT_STALENESS_DAYS - a
 * generous catch-all, never a silent "never stale."
 */
export const STALENESS_DAYS_BY_METRIC: Record<string, number> = {
  cash: 1,
  total_debt: 30,
  secured_debt: 30,
  covenant_ebitda: 90,
  interest_expense: 90,
  cumulative_net_income: 90,
  equity_proceeds: 90,
  assumed_new_debt_rate_pct: 90,
};

export const DEFAULT_STALENESS_DAYS = 180;

export type ReconciliationClassification = "MATCH" | "MATERIAL_DIFFERENCE" | "CONFLICTING_SOURCE" | "STALE_SOURCE" | "MISSING_SOURCE";

/**
 * One FINANCIAL_FACT ExtractionCandidate, pre-joined with the source
 * provenance the brief describes (candidate.proposedValue.sourceRecordRef ->
 * SourceArtifact.id -> SourceArtifact.sourceConnectionId ->
 * CompanySourceConnection.connectorType/sourcePriority) - this file never
 * does that join itself (a pure function has no DB access); the caller
 * (lib/connectors/ingestion.ts, lib/company-state/canonical-state.ts) does it
 * once and hands in this already-flattened shape.
 */
export interface FinancialFactCandidateWithSource {
  candidateId: string;
  metricName: string;
  value: number;
  /** ISO date string - FinancialFactValueSchema's own asOfDate shape. */
  asOfDate: string;
  unit?: string;
  sourceConnectionId: string;
  connectorType: ConnectorType;
  /** CompanySourceConnection.sourcePriority - the fallback when no metric-specific SourcePriorityRule matches (see resolvePriority below). */
  connectionSourcePriority: number;
  reviewStatus: string;
}

/** The subset of SourcePriorityRule this pure function needs - avoids importing the Prisma model type into a file that must stay DB-agnostic. */
export interface SourcePriorityRuleLike {
  companyId: string | null;
  metricName: string;
  connectorType: ConnectorType;
  priority: number;
}

export interface ReconciliationGroup {
  metricName: string;
  /** "YYYY-MM", UTC - see this file's header comment. */
  period: string;
  classification: ReconciliationClassification;
  candidates: FinancialFactCandidateWithSource[];
  /** Set only for MATERIAL_DIFFERENCE - the candidate whose value should be treated as authoritative. */
  winnerCandidateId?: string;
  rationale: string;
  toleranceUsed: number;
  stalenessThresholdDays: number;
}

/** UTC calendar month of an ISO date string - "YYYY-MM". */
function periodOf(asOfDateIso: string): string {
  const d = new Date(asOfDateIso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function relativeDifference(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom;
}

function allWithinTolerance(values: number[], tolerance: number): boolean {
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (relativeDifference(values[i]!, values[j]!) > tolerance) return false;
    }
  }
  return true;
}

/**
 * Resolves one candidate's effective priority (lower = higher priority, the
 * convention SourcePriorityRule/CompanySourceConnection.sourcePriority both
 * already use): a company-specific SourcePriorityRule for this exact
 * (metricName, connectorType) wins if present, else a GLOBAL
 * (companyId: null) rule for the same pair, else the candidate's own
 * connection-level `connectionSourcePriority` as a generic fallback - so
 * reconciliation always has SOME ordering to reason about, never an
 * unresolvable tie purely for lack of a configured rule.
 */
function resolvePriority(candidate: FinancialFactCandidateWithSource, rules: SourcePriorityRuleLike[], companyId: string | undefined): number {
  const matching = rules.filter((r) => r.metricName === candidate.metricName && r.connectorType === candidate.connectorType);
  const companySpecific = companyId ? matching.find((r) => r.companyId === companyId) : undefined;
  if (companySpecific) return companySpecific.priority;
  const global = matching.find((r) => r.companyId === null);
  if (global) return global.priority;
  return candidate.connectionSourcePriority;
}

function stalenessThresholdFor(metricName: string): number {
  return STALENESS_DAYS_BY_METRIC[metricName] ?? DEFAULT_STALENESS_DAYS;
}

function ageDays(asOfDateIso: string, now: Date): number {
  const asOf = new Date(asOfDateIso);
  return (now.getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24);
}

export interface ReconcileOptions {
  /** Injected "current time" for staleness checks - never read from the system clock internally, so this stays a pure function. Defaults to `new Date()` at the call site only if the caller omits it. */
  now?: Date;
  toleranceRelative?: number;
  /** Scopes company-specific SourcePriorityRule resolution (see resolvePriority) - optional, since a caller may already have pre-filtered `priorityRules` to one company. */
  companyId?: string;
}

/**
 * Groups FINANCIAL_FACT candidates by (metricName, period) and classifies
 * every group with 2+ candidates from different source connections. See this
 * file's header comment for the full design rationale. Deterministic and
 * side-effect-free: the same inputs always produce the same output.
 */
export function reconcileFinancialFacts(candidates: FinancialFactCandidateWithSource[], priorityRules: SourcePriorityRuleLike[], options: ReconcileOptions = {}): ReconciliationGroup[] {
  const now = options.now ?? new Date();
  const tolerance = options.toleranceRelative ?? DEFAULT_RELATIVE_TOLERANCE;

  const groups = new Map<string, FinancialFactCandidateWithSource[]>();
  for (const c of candidates) {
    const key = `${c.metricName}|${periodOf(c.asOfDate)}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const results: ReconciliationGroup[] = [];
  for (const [key, groupCandidates] of groups) {
    const distinctConnections = new Set(groupCandidates.map((c) => c.sourceConnectionId));
    if (distinctConnections.size < 2) continue; // nothing to reconcile - see header comment.

    const [metricName, period] = key.split("|") as [string, string];
    const stalenessThresholdDays = stalenessThresholdFor(metricName);

    const staleCandidates = groupCandidates.filter((c) => ageDays(c.asOfDate, now) > stalenessThresholdDays);
    if (staleCandidates.length > 0) {
      const staleList = staleCandidates.map((c) => `${c.connectorType} value ${c.value} as of ${c.asOfDate} (${ageDays(c.asOfDate, now).toFixed(0)}d old, threshold ${stalenessThresholdDays}d)`).join("; ");
      results.push({
        metricName,
        period,
        classification: "STALE_SOURCE",
        candidates: groupCandidates,
        rationale: `${staleCandidates.length} of ${groupCandidates.length} source(s) for ${metricName}/${period} exceed the ${stalenessThresholdDays}-day staleness threshold: ${staleList}.`,
        toleranceUsed: tolerance,
        stalenessThresholdDays,
      });
      continue;
    }

    const values = groupCandidates.map((c) => c.value);
    if (allWithinTolerance(values, tolerance)) {
      results.push({
        metricName,
        period,
        classification: "MATCH",
        candidates: groupCandidates,
        rationale: `${groupCandidates.length} sources agree on ${metricName}/${period} within ${(tolerance * 100).toFixed(1)}% tolerance.`,
        toleranceUsed: tolerance,
        stalenessThresholdDays,
      });
      continue;
    }

    const withPriority = groupCandidates.map((c) => ({ c, priority: resolvePriority(c, priorityRules, options.companyId) }));
    const bestPriority = Math.min(...withPriority.map((w) => w.priority));
    const winners = withPriority.filter((w) => w.priority === bestPriority);

    if (winners.length === 1) {
      const winner = winners[0]!.c;
      const others = groupCandidates.filter((c) => c.candidateId !== winner.candidateId);
      const othersDesc = others.map((c) => `${c.connectorType} value ${c.value} as of ${c.asOfDate} (priority ${withPriority.find((w) => w.c.candidateId === c.candidateId)!.priority})`).join("; ");
      results.push({
        metricName,
        period,
        classification: "MATERIAL_DIFFERENCE",
        candidates: groupCandidates,
        winnerCandidateId: winner.candidateId,
        rationale: `Sources disagree on ${metricName}/${period} beyond ${(tolerance * 100).toFixed(1)}% tolerance. ${winner.connectorType} value ${winner.value} (priority ${bestPriority}) is authoritative over: ${othersDesc}.`,
        toleranceUsed: tolerance,
        stalenessThresholdDays,
      });
    } else {
      const tiedDesc = winners.map((w) => `${w.c.connectorType} value ${w.c.value} as of ${w.c.asOfDate}`).join("; ");
      results.push({
        metricName,
        period,
        classification: "CONFLICTING_SOURCE",
        candidates: groupCandidates,
        rationale: `Sources disagree on ${metricName}/${period} beyond ${(tolerance * 100).toFixed(1)}% tolerance and no SourcePriorityRule distinguishes them (tied at priority ${bestPriority}): ${tiedDesc}. Human review required - never silently picked.`,
        toleranceUsed: tolerance,
        stalenessThresholdDays,
      });
    }
  }

  return results;
}
