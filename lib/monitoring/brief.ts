/**
 * Morning brief payload: {lastVisitAt, changes[], needsYouCount, nextTest{date, daysRemaining}}.
 * Each field is null when its source could not be read (never 0 / [] by default).
 */
import { buildCovenantCalendar, nextTest, type ObligationRowLike } from "./calendar";

export interface MorningBrief {
  companyId: string;
  lastVisitAt: string | null;
  /** Window start used for `changes` (last visit, else 24h ago). */
  since: string;
  /** null = feed not readable; [] = read and empty. */
  changes: string[] | null;
  /** EBITDA add-back items that need the CFO (PENDING figure or CONDITIONAL lender approval), latest box per agreement. */
  needsYouCount: number | null;
  nextTest: { date: string; daysRemaining: number } | null;
  nextTestStatus: "OK" | "NEEDS_INPUT" | "NOT_DETERMINABLE";
}

export interface BriefSources {
  lastVisitAt(): Promise<Date | null>;
  notificationTitlesSince(since: Date): Promise<string[]>;
  latestBoxItemStatuses(): Promise<string[][]>;
  obligations(): Promise<ObligationRowLike[]>;
}

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; v: T } | { ok: false }> {
  try {
    return { ok: true, v: await fn() };
  } catch {
    return { ok: false };
  }
}

export async function buildMorningBrief(companyId: string, src: BriefSources, now = new Date()): Promise<MorningBrief> {
  const visit = await attempt(() => src.lastVisitAt());
  const lastVisit = visit.ok ? visit.v : null;
  const since = lastVisit ?? new Date(now.getTime() - 24 * 3600 * 1000);
  const [changes, boxes, obligations] = await Promise.all([
    attempt(() => src.notificationTitlesSince(since)),
    attempt(() => src.latestBoxItemStatuses()),
    attempt(() => src.obligations()),
  ]);
  let nt: MorningBrief["nextTest"] = null;
  let ntStatus: MorningBrief["nextTestStatus"] = "NOT_DETERMINABLE";
  if (obligations.ok) {
    nt = nextTest(buildCovenantCalendar(companyId, obligations.v), now);
    ntStatus = nt ? "OK" : "NEEDS_INPUT";
  }
  return {
    companyId,
    lastVisitAt: lastVisit ? lastVisit.toISOString() : null,
    since: since.toISOString(),
    changes: changes.ok ? changes.v : null,
    needsYouCount: boxes.ok ? boxes.v.reduce((n, items) => n + items.filter((s) => s === "PENDING" || s === "CONDITIONAL").length, 0) : null,
    nextTest: nt,
    nextTestStatus: ntStatus,
  };
}
