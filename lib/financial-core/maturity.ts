/**
 * Maturity analytics (architecture §I), Phase 4.
 *
 * Built from Facility.maturityDate/outstanding principal (via
 * capital-structure.ts's event replay). This slice models bullet maturities
 * only (no AmortizationSchedule table - see schema.prisma's deferral note),
 * so WAL degenerates to "years to the facility's own maturity date",
 * weighted by outstanding principal - the standard WAL definition applied to
 * a single-payment-date instrument. All calculations use the supplied
 * `asOfDate`, never `Date.now()` (task §10).
 */

import { computeOutstandingPrincipal, sortFacilities } from "./capital-structure";
import type { DebtEvent, Facility, MaturityAnalytics, MaturityWallEntry } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

export function computeMaturityAnalytics(companyId: string, facilities: Facility[], events: DebtEvent[], asOfDate: Date): MaturityAnalytics {
  const sorted = sortFacilities(facilities);
  const outstanding = sorted
    .map((facility) => ({ facility, principal: computeOutstandingPrincipal(facility, events, asOfDate) }))
    .filter((f) => f.principal > 0 && f.facility.maturityDate !== undefined && f.facility.maturityDate.getTime() >= asOfDate.getTime());

  const next = outstanding[0];

  const monthsBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / MS_PER_DAY / (DAYS_PER_YEAR / 12);
  const within = (months: number) => outstanding.filter((f) => monthsBetween(asOfDate, f.facility.maturityDate!) <= months).reduce((s, f) => s + f.principal, 0);

  // Deterministic annual maturity-wall buckets (task §24): keyed by calendar
  // year of maturityDate, sorted ascending.
  const byYear = new Map<number, { principal: number; facilityIds: string[] }>();
  for (const f of outstanding) {
    const year = f.facility.maturityDate!.getUTCFullYear();
    const entry = byYear.get(year) ?? { principal: 0, facilityIds: [] };
    entry.principal += f.principal;
    entry.facilityIds.push(f.facility.id);
    byYear.set(year, entry);
  }
  const maturityWall: MaturityWallEntry[] = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, { principal, facilityIds }]) => ({ periodLabel: String(year), year, principalMaturing: principal, facilityIds: [...facilityIds].sort() }));

  const totalOutstanding = outstanding.reduce((s, f) => s + f.principal, 0);
  const weightedAverageMaturityYears =
    totalOutstanding > 0
      ? outstanding.reduce((s, f) => s + f.principal * ((f.facility.maturityDate!.getTime() - asOfDate.getTime()) / MS_PER_DAY / DAYS_PER_YEAR), 0) / totalOutstanding
      : null;

  return {
    companyId,
    asOfDate,
    nextMaturity: next ? { facilityId: next.facility.id, facilityName: next.facility.name, date: next.facility.maturityDate!, principal: next.principal } : undefined,
    dueWithin12Months: within(12),
    dueWithin24Months: within(24),
    dueWithin36Months: within(36),
    maturityWall,
    weightedAverageMaturityYears,
  };
}
