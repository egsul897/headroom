/**
 * Covenant calendar — READ-ONLY projection of obligations extraction has already
 * persisted (contract_event_obligations). Nothing is extracted or inferred here.
 * Shape matches #414 `CalendarItem` ({id, kind: test|reporting|cure, label, date}),
 * grouped as {testDates, reportingDeadlines, cureEndDates}.
 *
 * - FIXED_DATE with a stored deadlineDate ⇒ date (YYYY-MM-DD).
 * - DAYS_AFTER_EVENT ⇒ date null + relativeRule ("45 days after fiscal quarter end");
 *   never dated from an assumed fiscal calendar.
 * - Anything else ⇒ date null ("not on file").
 * No obligations ⇒ status NEEDS_INPUT (never "nothing due").
 */
export interface ObligationRowLike {
  stableKey: string;
  eventType: string;
  conditionDescription: string | null;
  deadlineKind: string;
  deadlineDays: number | null;
  deadlineDate: Date | null;
  requiredAction: string;
  satisfactionState: string;
  sourceSectionRef: string | null;
  reviewStatus: string;
}

export type CalendarKind = "test" | "reporting" | "cure" | "other";

export interface CalendarItem {
  id: string;
  kind: CalendarKind;
  label: string;
  /** YYYY-MM-DD from a persisted obligation; null is "not on file". */
  date: string | null;
  relativeRule: string | null;
  sectionRef: string | null;
  reviewStatus: string;
  satisfactionState: string;
}

export interface CovenantCalendar {
  companyId: string;
  status: "OK" | "NEEDS_INPUT";
  reason: string | null;
  testDates: CalendarItem[];
  reportingDeadlines: CalendarItem[];
  cureEndDates: CalendarItem[];
  other: CalendarItem[];
  source: "contract_event_obligations (read-only)";
}

export function classifyObligation(o: Pick<ObligationRowLike, "eventType" | "requiredAction" | "conditionDescription">): CalendarKind {
  const t = `${o.eventType} ${o.requiredAction} ${o.conditionDescription ?? ""}`.toLowerCase();
  if (/\bcure\b/.test(t)) return "cure";
  if (/\btest(ing)?[ _](date|period)\b|\bcovenant test\b/.test(t)) return "test";
  if (/\bdeliver|financial statements|compliance certificate|\breport/.test(t)) return "reporting";
  return "other";
}

export function toCalendarItem(o: ObligationRowLike): CalendarItem {
  const kind = classifyObligation(o);
  const base = { id: o.stableKey, kind, label: o.requiredAction, sectionRef: o.sourceSectionRef, reviewStatus: o.reviewStatus, satisfactionState: o.satisfactionState };
  if (o.deadlineKind === "FIXED_DATE" && o.deadlineDate) return { ...base, date: o.deadlineDate.toISOString().slice(0, 10), relativeRule: null };
  if (o.deadlineKind === "DAYS_AFTER_EVENT" && typeof o.deadlineDays === "number") {
    return { ...base, date: null, relativeRule: `${o.deadlineDays} days after ${o.eventType.replace(/_/g, " ").toLowerCase()}` };
  }
  return { ...base, date: null, relativeRule: null };
}

export function buildCovenantCalendar(companyId: string, rows: ObligationRowLike[]): CovenantCalendar {
  const items = rows.map(toCalendarItem).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.id.localeCompare(b.id));
  const of = (k: CalendarKind) => items.filter((i) => i.kind === k);
  return {
    companyId,
    status: items.length ? "OK" : "NEEDS_INPUT",
    reason: items.length ? null : "No test dates, reporting deadlines or cure periods have been extracted for this company yet.",
    testDates: of("test"),
    reportingDeadlines: of("reporting"),
    cureEndDates: of("cure"),
    other: of("other"),
    source: "contract_event_obligations (read-only)",
  };
}

/** Nearest dated test on or after `today` (UTC date); null when none is on file. */
export function nextTest(cal: CovenantCalendar, today: Date): { date: string; daysRemaining: number } | null {
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (const i of cal.testDates) {
    if (!i.date) continue;
    const d = Date.parse(`${i.date}T00:00:00Z`);
    if (d >= t0) return { date: i.date, daysRemaining: Math.round((d - t0) / 86_400_000) };
  }
  return null;
}
