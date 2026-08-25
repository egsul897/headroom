/**
 * Interest / debt-service engine (architecture §H), Phase 4.
 *
 * Pragmatic model, per the architecture: FIXED = principal x coupon;
 * FLOATING = principal x (benchmark + spread), floored where modeled. No
 * live SOFR feed (task §9) - the caller supplies explicit rate assumptions
 * per `referenceRate`. A FLOATING instrument whose referenceRate has no
 * matching assumption is surfaced as MISSING_BENCHMARK_ASSUMPTION, never
 * silently defaulted to zero or to the fixed-side rate.
 */

import { computeOutstandingPrincipal, sortFacilities } from "./capital-structure";
import type { DebtEvent, Facility, InstrumentInterestResult, InterestResult } from "./types";

export interface RateAssumption {
  referenceRate: string;
  assumedRatePct: number;
}

function effectiveRatePct(facility: Facility, assumptions: Map<string, number>): { ratePct: number; status: InstrumentInterestResult["status"]; detail?: string } {
  if (facility.couponType === "FIXED") {
    return { ratePct: facility.couponPct ?? 0, status: "OK" };
  }
  const benchmark = facility.referenceRate ? assumptions.get(facility.referenceRate) : undefined;
  if (benchmark === undefined) {
    return { ratePct: 0, status: "MISSING_BENCHMARK_ASSUMPTION", detail: `No rate assumption supplied for benchmark "${facility.referenceRate ?? "(unspecified)"}".` };
  }
  const spreadPct = (facility.marginBps ?? 0) / 100;
  const raw = benchmark + spreadPct;
  const floored = facility.rateFloorPct !== undefined ? Math.max(raw, facility.rateFloorPct) : raw;
  return { ratePct: floored, status: "OK" };
}

export function computeInterestResult(companyId: string, facilities: Facility[], events: DebtEvent[], asOfDate: Date, assumptions: RateAssumption[]): InterestResult {
  const assumptionMap = new Map(assumptions.map((a) => [a.referenceRate, a.assumedRatePct]));
  const sorted = sortFacilities(facilities);

  const perInstrument: InstrumentInterestResult[] = sorted.map((facility) => {
    const outstandingPrincipal = computeOutstandingPrincipal(facility, events, asOfDate);
    if (outstandingPrincipal === 0) {
      return { facilityId: facility.id, facilityName: facility.name, outstandingPrincipal: 0, effectiveRatePct: null, annualizedCashInterest: 0, status: "OK", detail: "No outstanding balance." };
    }
    const { ratePct, status, detail } = effectiveRatePct(facility, assumptionMap);
    if (status === "MISSING_BENCHMARK_ASSUMPTION") {
      return { facilityId: facility.id, facilityName: facility.name, outstandingPrincipal, effectiveRatePct: null, annualizedCashInterest: null, status, detail };
    }
    return {
      facilityId: facility.id,
      facilityName: facility.name,
      outstandingPrincipal,
      effectiveRatePct: ratePct,
      annualizedCashInterest: outstandingPrincipal * (ratePct / 100),
    status: "OK",
    };
  });

  const totalAnnualizedCashInterest = perInstrument.reduce((s, i) => s + (i.annualizedCashInterest ?? 0), 0);
  const hasMissingBenchmarkAssumption = perInstrument.some((i) => i.status === "MISSING_BENCHMARK_ASSUMPTION");

  return {
    companyId,
    asOfDate,
    perInstrument,
    totalAnnualizedCashInterest,
    assumptions,
    hasMissingBenchmarkAssumption,
  };
}

/**
 * Company-wide weighted-average coupon (architecture §D's WAC), using each
 * instrument's own effective rate (fixed coupon or floating benchmark+
 * spread) - the single source of truth for WAC (see capital-structure.ts's
 * own comment on why it does not compute this itself). Returns `null` when
 * there is zero outstanding debt, OR when any outstanding instrument's rate
 * is unresolvable (fail closed - never silently excludes an unpriced
 * instrument from the denominator, which would understate the true balance
 * the rate is meant to describe).
 */
export function computeWeightedAverageRatePct(interest: InterestResult): number | null {
  const outstanding = interest.perInstrument.filter((i) => i.outstandingPrincipal > 0);
  if (outstanding.length === 0) return null;
  if (outstanding.some((i) => i.effectiveRatePct === null || typeof i.effectiveRatePct !== "number")) return null;
  const totalPrincipal = outstanding.reduce((s, i) => s + i.outstandingPrincipal, 0);
  const weighted = outstanding.reduce((s, i) => s + i.outstandingPrincipal * (i.effectiveRatePct as number), 0);
  return weighted / totalPrincipal;
}
