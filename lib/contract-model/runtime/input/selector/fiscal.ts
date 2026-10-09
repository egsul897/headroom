/**
 * Deterministic fiscal quarter / year boundaries from an explicit FiscalCalendar.
 * No timezone, no locale, no "latest available" heuristics.
 */
import type { FiscalCalendar } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(iso: string, label: string): void {
  if (!ISO.test(iso)) throw new Error(`${label}: expected YYYY-MM-DD, got "${iso}"`);
}

function daysInMonth(year: number, month: number): number {
  // month 1–12; UTC-free calendar arithmetic
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(clampDay(year, month, day))}`;
}

export function parseIso(iso: string): { y: number; m: number; d: number } {
  assertIsoDate(iso, "date");
  const [y, m, d] = iso.split("-").map((x) => Number.parseInt(x, 10)) as [number, number, number];
  return { y, m, d };
}

/** Compare ISO dates lexicographically (valid for YYYY-MM-DD). */
export function isoCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface FiscalPeriodEnd {
  /** e.g. FY2026-Q2 or FY2026 */
  reportingPeriodKey: string;
  asOfIsoDate: string;
  fiscalYearLabel: number;
  quarter: 1 | 2 | 3 | 4 | null;
}

/**
 * Four quarter-end dates for the fiscal year that ends in calendar year `fyEndYear`
 * on the calendar's fiscalYearEndMonth/Day.
 *
 * Q4 ends on FYE; Q1–Q3 end three/six/nine months earlier (same day-of-month, clamped).
 */
export function quarterEndsForFiscalYear(cal: FiscalCalendar, fyEndYear: number): FiscalPeriodEnd[] {
  const endMonth = cal.fiscalYearEndMonth;
  const endDay = cal.fiscalYearEndDay;
  const q4 = isoDate(fyEndYear, endMonth, endDay);

  const ends: FiscalPeriodEnd[] = [];
  for (let q = 1; q <= 4; q++) {
    // months before FYE: Q1 = 9 months before, Q2 = 6, Q3 = 3, Q4 = 0
    const monthsBefore = (4 - q) * 3;
    let m = endMonth - monthsBefore;
    let y = fyEndYear;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const asOf = isoDate(y, m, endDay);
    ends.push({
      reportingPeriodKey: `FY${fyEndYear}-Q${q}`,
      asOfIsoDate: asOf,
      fiscalYearLabel: fyEndYear,
      quarter: q as 1 | 2 | 3 | 4,
    });
  }
  // ensure Q4 matches
  ends[3] = { ...ends[3]!, asOfIsoDate: q4, reportingPeriodKey: `FY${fyEndYear}-Q4` };
  return ends;
}

export function fiscalYearEnd(cal: FiscalCalendar, fyEndYear: number): FiscalPeriodEnd {
  return {
    reportingPeriodKey: `FY${fyEndYear}`,
    asOfIsoDate: isoDate(fyEndYear, cal.fiscalYearEndMonth, cal.fiscalYearEndDay),
    fiscalYearLabel: fyEndYear,
    quarter: null,
  };
}

/**
 * Most recently ended fiscal quarter on or before evaluationDate.
 * Uses only the fiscal calendar — does not consult snapshots or deliveries.
 */
export function mostRecentlyEndedFiscalQuarter(cal: FiscalCalendar, evaluationDate: string): FiscalPeriodEnd {
  assertIsoDate(evaluationDate, "evaluationDate");
  const { y } = parseIso(evaluationDate);
  // Candidate FY labels: evaluation year and neighbors cover non-calendar FYEs.
  const candidates: FiscalPeriodEnd[] = [];
  for (const fy of [y - 1, y, y + 1]) {
    candidates.push(...quarterEndsForFiscalYear(cal, fy));
  }
  const ended = candidates
    .filter((c) => isoCompare(c.asOfIsoDate, evaluationDate) <= 0)
    .sort((a, b) => isoCompare(b.asOfIsoDate, a.asOfIsoDate));
  if (ended.length === 0) {
    // Extremely early evaluation date — fall back to earliest known Q1 of y-1 (still explicit).
    const q1 = quarterEndsForFiscalYear(cal, y - 1)[0]!;
    return q1;
  }
  return ended[0]!;
}

export function mostRecentlyEndedFiscalYear(cal: FiscalCalendar, evaluationDate: string): FiscalPeriodEnd {
  assertIsoDate(evaluationDate, "evaluationDate");
  const { y } = parseIso(evaluationDate);
  const candidates = [y + 1, y, y - 1, y - 2].map((fy) => fiscalYearEnd(cal, fy));
  const ended = candidates
    .filter((c) => isoCompare(c.asOfIsoDate, evaluationDate) <= 0)
    .sort((a, b) => isoCompare(b.asOfIsoDate, a.asOfIsoDate));
  return ended[0] ?? fiscalYearEnd(cal, y - 1);
}

/**
 * Trailing four fiscal quarters most recently ended → period key naming the TTM window
 * ending at the most recent quarter-end, with as-of = that quarter-end.
 */
export function fourConsecutiveQuartersMostRecentlyEnded(cal: FiscalCalendar, evaluationDate: string): {
  trailing: FiscalPeriodEnd;
  quarters: FiscalPeriodEnd[];
} {
  const latest = mostRecentlyEndedFiscalQuarter(cal, evaluationDate);
  const { y } = parseIso(evaluationDate);
  const all: FiscalPeriodEnd[] = [];
  for (const fy of [y - 2, y - 1, y, y + 1]) {
    all.push(...quarterEndsForFiscalYear(cal, fy));
  }
  const ended = all
    .filter((c) => isoCompare(c.asOfIsoDate, latest.asOfIsoDate) <= 0)
    .sort((a, b) => isoCompare(b.asOfIsoDate, a.asOfIsoDate));
  const quarters = ended.slice(0, 4).reverse();
  return {
    trailing: {
      reportingPeriodKey: `TTM-ending-${latest.reportingPeriodKey}`,
      asOfIsoDate: latest.asOfIsoDate,
      fiscalYearLabel: latest.fiscalYearLabel,
      quarter: latest.quarter,
    },
    quarters,
  };
}
