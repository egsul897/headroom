/**
 * Covenant calendar — READ-ONLY projection of obligations the extraction
 * pipeline has already persisted (ContractEventObligation). Nothing is
 * extracted or inferred here.
 *
 * - FIXED_DATE with a stored deadlineDate ⇒ a dated entry.
 * - DAYS_AFTER_EVENT ⇒ the relative rule only (e.g. "45 days after quarter
 *   end"); the absolute date NEEDS_INPUT (the triggering event date) — never
 *   computed from an assumed fiscal calendar.
 * - PERIODIC / anything else ⇒ NEEDS_INPUT.
 * Cure periods and test dates appear only if they were persisted as
 * obligations; when none are on file the calendar says NEEDS_INPUT, not
 * "nothing due".
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

export interface CalendarEntry {
  key: string;
  kind: "REPORTING_DEADLINE" | "CURE_PERIOD" | "TEST_DATE" | "OTHER_OBLIGATION";
  title: string;
  date: string | null;
  relativeRule: string | null;
  dateStatus: "DATED" | "NEEDS_INPUT";
  needs: string | null;
  satisfactionState: string;
  reviewStatus: string;
  sectionRef: string | null;
}

export interface CovenantCalendar {
  companyId: string;
  status: "OK" | "NEEDS_INPUT";
  reason: string | null;
  entries: CalendarEntry[];
  source: "contract_event_obligations (read-only)";
}

function classify(o: ObligationRowLike): CalendarEntry["kind"] {
  const t = `${o.eventType} ${o.requiredAction} ${o.conditionDescription ?? ""}`.toLowerCase();
  if (/\bcure\b/.test(t)) return "CURE_PERIOD";
  if (/\btest(ing)? (date|period)\b|\bfiscal quarter end\b/.test(t)) return "TEST_DATE";
  if (/\bdeliver|financial statements|compliance certificate|report/.test(t)) return "REPORTING_DEADLINE";
  return "OTHER_OBLIGATION";
}

export function buildCovenantCalendar(companyId: string, rows: ObligationRowLike[]): CovenantCalendar {
  const entries: CalendarEntry[] = rows.map((o) => {
    const base = {
      key: o.stableKey,
      kind: classify(o),
      title: o.requiredAction,
      satisfactionState: o.satisfactionState,
      reviewStatus: o.reviewStatus,
      sectionRef: o.sourceSectionRef,
    };
    if (o.deadlineKind === "FIXED_DATE" && o.deadlineDate) {
      return { ...base, date: o.deadlineDate.toISOString().slice(0, 10), relativeRule: null, dateStatus: "DATED" as const, needs: null };
    }
    if (o.deadlineKind === "DAYS_AFTER_EVENT" && typeof o.deadlineDays === "number") {
      return {
        ...base,
        date: null,
        relativeRule: `${o.deadlineDays} days after ${o.eventType.replace(/_/g, " ").toLowerCase()}`,
        dateStatus: "NEEDS_INPUT" as const,
        needs: "Date of the triggering event",
      };
    }
    return { ...base, date: null, relativeRule: null, dateStatus: "NEEDS_INPUT" as const, needs: "Schedule not represented in extracted obligations" };
  });
  entries.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.key.localeCompare(b.key));
  return {
    companyId,
    status: entries.length ? "OK" : "NEEDS_INPUT",
    reason: entries.length ? null : "No test dates, reporting deadlines or cure periods have been extracted for this company yet.",
    entries,
    source: "contract_event_obligations (read-only)",
  };
}
