/**
 * Provenance/staleness helpers (architecture §M/§O), Phase 2.
 *
 * `ProvencancedFact<T>` (types.ts) is the one wrapper reused everywhere; this
 * module supplies the small set of pure functions every downstream engine
 * needs to reason about a fact's trust/age without duplicating the wrapper
 * shape or inventing a second aggregation rule.
 */

import type { ProvencancedFact } from "./types";

/**
 * Revives a ProvencancedFact whose `asOfDate` (and any nested staleness) has
 * round-tripped through JSON (a Prisma JSONB column, or JSON.stringify for
 * an in-memory deep-clone) as a plain string. Centralized here so
 * lib/financial-core-db/adapter.ts and scenario.ts's deep-clone both use the
 * same revival logic rather than two near-duplicate implementations.
 */
export function reviveProvencancedFact<T>(raw: {
  value: T;
  sourceType: "REPORTED" | "RECONSTRUCTED" | "ASSUMED" | "EXTERNAL_CERTIFICATE";
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "DISPUTED";
  asOfDate: string | Date;
  notes?: string;
  staleness?: { maxAgeDays: number };
}): ProvencancedFact<T> {
  return { ...raw, asOfDate: raw.asOfDate instanceof Date ? raw.asOfDate : new Date(raw.asOfDate) };
}

/** architecture §O.1 - a fact is stale once its own natural refresh window has elapsed, evaluated as of a given date. Facts with no `staleness` window are never considered stale (their cadence is undefined, not infinite). */
export function isStale(fact: ProvencancedFact<unknown>, evaluationDate: Date): boolean {
  if (!fact.staleness) return false;
  const maxAgeMs = fact.staleness.maxAgeDays * 24 * 60 * 60 * 1000;
  return fact.asOfDate.getTime() + maxAgeMs < evaluationDate.getTime();
}

export function stalenessDays(fact: ProvencancedFact<unknown>, evaluationDate: Date): number {
  return Math.floor((evaluationDate.getTime() - fact.asOfDate.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * architecture §M.2 - a derived fact is never "more certain" than its
 * least-certain input; mirrors `evalExpr`'s existing `worstStatus`
 * aggregation discipline rather than inventing a second rule. Rank:
 * DISPUTED worst, then UNVERIFIED, then VERIFIED best.
 */
const REVIEW_RANK: Record<ProvencancedFact<unknown>["reviewStatus"], number> = { DISPUTED: 0, UNVERIFIED: 1, VERIFIED: 2 };

export function worstReviewStatus(statuses: ProvencancedFact<unknown>["reviewStatus"][]): ProvencancedFact<unknown>["reviewStatus"] {
  if (statuses.length === 0) return "UNVERIFIED";
  return statuses.reduce((worst, s) => (REVIEW_RANK[s] < REVIEW_RANK[worst] ? s : worst));
}

/**
 * Whether a fact should block a *contractual* dependent requirement
 * (architecture §O.2/§P.1: stale or disputed facts feeding the solver
 * resolve that requirement to UNKNOWN, never silently reused). Facts
 * consumed only by dashboard-only analytics use `isStale` directly and
 * surface a badge instead - never call this for that path.
 */
export function blocksContractualDependent(f: ProvencancedFact<unknown>, evaluationDate: Date): boolean {
  return f.reviewStatus === "DISPUTED" || isStale(f, evaluationDate);
}
