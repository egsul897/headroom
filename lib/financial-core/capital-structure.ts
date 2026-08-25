/**
 * Capital-structure engine (architecture §D/§E), Phase 3.
 *
 * Pure functions over in-memory FinancialState/Facility/DebtEvent objects -
 * no DB, no solver import, no company-specific branching (task §6/§25).
 * `computeOutstandingPrincipal` is the load-bearing function: per the
 * architecture's §T scope note, a Facility's balance is never a stored
 * "current balance" column - it is reconstructed by replaying DebtEvent rows
 * up to a given date, which is what makes historical/pro-forma state
 * reconstruction possible (task §4.D).
 */

import type { CapitalStructureSummary, DebtEvent, Facility } from "./types";

/**
 * Replays ISSUANCE/REPAYMENT/REFINANCING events for one facility, in
 * chronological order, up to (and including) `asOfDate`. A facility's
 * initial funding is itself expected to be recorded as an ISSUANCE event
 * (by convention, at `facility.issuedDate`) - this function does not fall
 * back to `originalPrincipal` if no such event exists, so a facility with no
 * events at all has zero outstanding principal (fail-visible, not silently
 * defaulted).
 */
export function computeOutstandingPrincipal(facility: Facility, events: DebtEvent[], asOfDate: Date): number {
  const relevant = events
    .filter((e) => e.facilityId === facility.id && e.date.getTime() <= asOfDate.getTime())
    .filter((e) => e.eventType === "ISSUANCE" || e.eventType === "REPAYMENT" || e.eventType === "REFINANCING")
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));

  let balance = 0;
  for (const e of relevant) {
    if (e.eventType === "ISSUANCE") balance += e.amount;
    else balance -= e.amount; // REPAYMENT/REFINANCING retirement: positive-magnitude reduction
  }
  return Math.max(0, balance);
}

/** LC_ISSUANCE/LC_EXPIRATION replay, same convention as principal (architecture §E.1 extension - see schema.prisma DebtEventType comment). */
export function computeLcUsage(facility: Facility, events: DebtEvent[], asOfDate: Date): number {
  const relevant = events
    .filter((e) => e.facilityId === facility.id && e.date.getTime() <= asOfDate.getTime())
    .filter((e) => e.eventType === "LC_ISSUANCE" || e.eventType === "LC_EXPIRATION")
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));

  let usage = 0;
  for (const e of relevant) {
    usage += e.eventType === "LC_ISSUANCE" ? e.amount : -e.amount;
  }
  return Math.max(0, usage);
}

/** Deterministic ordering for facility lists (task §24): by maturity date (undefined last), then by id. */
export function sortFacilities(facilities: Facility[]): Facility[] {
  return [...facilities].sort((a, b) => {
    const am = a.maturityDate?.getTime() ?? Infinity;
    const bm = b.maturityDate?.getTime() ?? Infinity;
    if (am !== bm) return am - bm;
    return a.id.localeCompare(b.id);
  });
}

export function buildCapitalStructureSummary(companyId: string, asOfDate: Date, facilities: Facility[], events: DebtEvent[], cash: number): CapitalStructureSummary {
  const sorted = sortFacilities(facilities);
  const withOutstanding = sorted.map((facility) => ({ facility, outstandingPrincipal: computeOutstandingPrincipal(facility, events, asOfDate) }));

  const grossDebt = withOutstanding.reduce((s, f) => s + f.outstandingPrincipal, 0);
  const securedDebt = withOutstanding.filter((f) => f.facility.secured).reduce((s, f) => s + f.outstandingPrincipal, 0);
  const unsecuredDebt = grossDebt - securedDebt;
  const fixedRateDebt = withOutstanding.filter((f) => f.facility.couponType === "FIXED").reduce((s, f) => s + f.outstandingPrincipal, 0);
  const floatingRateDebt = withOutstanding.filter((f) => f.facility.couponType === "FLOATING").reduce((s, f) => s + f.outstandingPrincipal, 0);

  const netDebt = grossDebt - cash;

  return {
    companyId,
    asOfDate,
    facilities: withOutstanding,
    grossDebt,
    netDebt,
    securedDebt,
    unsecuredDebt,
    fixedRateDebt,
    floatingRateDebt,
    fixedPct: grossDebt > 0 ? (fixedRateDebt / grossDebt) * 100 : null,
    floatingPct: grossDebt > 0 ? (floatingRateDebt / grossDebt) * 100 : null,
    // Left null here by design: a FIXED coupon alone is not a company-wide
    // weighted-average rate (a FLOATING instrument's effective rate needs a
    // benchmark assumption, which this pure capital-structure function has
    // no access to). interest.ts is the single source of truth for WAC -
    // position-service.ts fills this field in from InterestResult once both
    // engines have run, rather than this module computing a partial,
    // potentially-misleading number of its own.
    weightedAverageInterestRatePct: null,
  };
}
