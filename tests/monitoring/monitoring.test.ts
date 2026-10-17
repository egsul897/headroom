import { describe, expect, it, vi } from "vitest";
import { bandFor, cutoffsFor, validateCutoffOrder, withHistory, type RatioRowInput, type ThresholdRow } from "@/lib/monitoring/bands";
import { buildCovenantCalendar, nextTest, type ObligationRowLike } from "@/lib/monitoring/calendar";
import { buildMorningBrief, goodBoxItemStatuses } from "@/lib/monitoring/brief";
import { assertMonitoringCronAuthorized } from "@/lib/monitoring/cron-auth";
import { createThrottle, diffNewFilings, fetchRecentFilings, normalizeCik, parseRetryAfter } from "@/lib/monitoring/filings";
import { emailConfig, sendAlertEmail } from "@/lib/monitoring/email";
import { runMonitoringSweep, type MonitoringDeps, type NotificationInput } from "@/lib/monitoring/sweep";
import { parseSince } from "@/lib/monitoring/feed";
import type { SecFiling } from "@/lib/monitoring/filings";

const lev = (actual: number | null, over: Partial<RatioRowInput> = {}): RatioRowInput => ({
  stableKey: "d:LEV", name: "Max total net leverage", documentName: "Credit Agreement", sectionRef: "§7.11(a)",
  currentRatio: actual, ratioLimit: 4.5, comparisonDirection: "at_or_below", status: "MODELED", testKind: "MAINTENANCE", ...over,
});

const CUT: ThresholdRow[] = [{ covenantKey: "d:LEV", healthyUntil: 3.5, moderateUntil: 4.2 }];
const fccr = (actual: number | null): RatioRowInput => ({
  stableKey: "d:FCCR", name: "Min fixed charge coverage", documentName: "Credit Agreement", sectionRef: "§7.11(b)",
  currentRatio: actual, ratioLimit: 1.25, comparisonDirection: "at_or_above", status: "MODELED", testKind: "MAINTENANCE",
});

describe("bands (PR 414 BandCutoffs / BandReading)", () => {
  it("NO default cutoffs: without CFO settings the band is NEEDS_INPUT, never Healthy", () => {
    const b = bandFor(lev(3.0), []);
    expect(b).toMatchObject({ status: "NEEDS_INPUT", band: null, thresholds: null, reason: "Band thresholds not set" });
    expect(b.actual).toBe(3.0); // the engine actual is still shown
  });
  it("CFO cutoffs on the ratio's own scale: Healthy / Moderate / Danger for a max test", () => {
    expect(bandFor(lev(3.0), CUT)).toMatchObject({ status: "EVALUATED", band: "Healthy", thresholdSource: "CFO_SETTINGS" });
    expect(bandFor(lev(3.8), CUT).band).toBe("Moderate");
    expect(bandFor(lev(4.3), CUT)).toMatchObject({ band: "Danger", pastLimit: false });
    expect(bandFor(lev(4.6), CUT)).toMatchObject({ band: "Danger", pastLimit: true });
    expect(bandFor(lev(3.0), CUT).thresholds).toEqual({ direction: "lower-is-safer", healthyUntil: 3.5, moderateUntil: 4.2, limit: 4.5, limitLabel: "4.50x max" });
  });
  it("min test (higher-is-safer) uses mirrored ordering", () => {
    const t = [{ covenantKey: "d:FCCR", healthyUntil: 1.6, moderateUntil: 1.4 }];
    expect(bandFor(fccr(2.0), t).band).toBe("Healthy");
    expect(bandFor(fccr(1.5), t).band).toBe("Moderate");
    expect(bandFor(fccr(1.3), t).band).toBe("Danger");
  });
  it("invalid ordering or cutoffs beyond the limit are refused (NEEDS_INPUT), not repaired", () => {
    expect(validateCutoffOrder("lower-is-safer", 4.2, 3.5)).toBeNull();
    expect(validateCutoffOrder("higher-is-safer", 1.4, 1.6)).toBeNull();
    expect(validateCutoffOrder("lower-is-safer", "x", 3)).toBeNull();
    expect(cutoffsFor(lev(3), { covenantKey: "d:LEV", healthyUntil: 3.5, moderateUntil: 5.0 })).toBeNull();
    expect(bandFor(lev(3), [{ covenantKey: "d:LEV", healthyUntil: 3.5, moderateUntil: 5.0 }]).status).toBe("NEEDS_INPUT");
  });
  it("no computed actual or not MODELED ⇒ NOT_EVALUATED", () => {
    expect(bandFor(lev(null), CUT)).toMatchObject({ status: "NOT_EVALUATED", band: null });
    expect(bandFor(lev(1.0, { status: "REVIEW_REQUIRED" }), CUT).status).toBe("NOT_EVALUATED");
  });
  it("previousBand and trendingToward come from recorded history only", () => {
    const b = withHistory(bandFor(lev(3.8), CUT), [{ toBand: "Healthy", actual: 3.2 }]);
    expect(b).toMatchObject({ band: "Moderate", previousBand: "Healthy", trendingToward: "Danger" });
    expect(withHistory(bandFor(lev(3.8), CUT), [])).toMatchObject({ previousBand: null, trendingToward: null });
    expect(withHistory(bandFor(lev(3.0), []), [{ toBand: "Healthy", actual: 3.2 }])).toMatchObject({ previousBand: null, trendingToward: null });
  });
});

describe("filings", () => {
  const body = { filings: { recent: { form: ["10-Q", "4", "8-K"], accessionNumber: ["a-1", "a-2", "a-3"], filingDate: ["2026-08-01", "2026-08-02", "2026-08-03"] } } };
  it("refuses without a declared SEC User-Agent (no anonymous polling)", async () => {
    const f = vi.fn();
    expect(await fetchRecentFilings("320193", { userAgent: undefined, fetchImpl: f })).toEqual({ ok: false, reason: "SEC_UA_UNSET" });
    expect(f).not.toHaveBeenCalled();
  });
  it("keeps monitored forms only, sends UA, pads CIK", async () => {
    const f = vi.fn(async () => ({ status: 200, json: async () => body }));
    const r = await fetchRecentFilings("320193", { userAgent: "Headroom ops@example.com", fetchImpl: f });
    expect(r).toEqual({ ok: true, filings: [{ accessionNumber: "a-1", form: "10-Q", filingDate: "2026-08-01" }, { accessionNumber: "a-3", form: "8-K", filingDate: "2026-08-03" }] });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://data.sec.gov/submissions/CIK0000320193.json");
  });
  it("HTTP/malformed errors are reported, not treated as 'no filings'", async () => {
    expect(await fetchRecentFilings("1", { userAgent: "a@b.c", fetchImpl: async () => ({ status: 500, json: async () => ({}) }), throttle: async () => {} })).toMatchObject({ ok: false, reason: "SEC_HTTP_ERROR" });
    expect(await fetchRecentFilings("1", { userAgent: "a@b.c", fetchImpl: async () => ({ status: 200, json: async () => ({}) }) })).toMatchObject({ ok: false, reason: "SEC_MALFORMED" });
    expect(normalizeCik("abc")).toBeNull();
  });
  it("diff returns unseen accessions only", () => {
    expect(diffNewFilings([{ accessionNumber: "x", form: "10-K", filingDate: "d" }, { accessionNumber: "y", form: "8-K", filingDate: "d" }], new Set(["x"])).map((f) => f.accessionNumber)).toEqual(["y"]);
  });
});

describe("email", () => {
  it("OFF unless key and from are set", async () => {
    expect(emailConfig({})).toBeNull();
    expect(await sendAlertEmail({ to: ["a@b.co"], subject: "s", text: "t" }, { env: {} })).toBe("NOT_SENT_DISABLED");
  });
  it("sends when configured; failures are recorded, never thrown", async () => {
    const env = { HEADROOM_ALERT_EMAIL_API_KEY: "k", HEADROOM_ALERT_EMAIL_FROM: "alerts@headroom.example" };
    const ok = vi.fn(async () => ({ ok: true, status: 200 }));
    expect(await sendAlertEmail({ to: ["cfo@x.co"], subject: "s", text: "t" }, { env, fetchImpl: ok })).toBe("SENT");
    expect(await sendAlertEmail({ to: ["cfo@x.co"], subject: "s", text: "t" }, { env, fetchImpl: async () => { throw new Error("x"); } })).toBe("FAILED");
    expect(await sendAlertEmail({ to: [], subject: "s", text: "t" }, { env, fetchImpl: ok })).toBe("NOT_SENT_NO_RECIPIENTS");
  });
});

function memDeps(over: Partial<MonitoringDeps> & { filings?: SecFiling[]; ratio?: number | null } = {}) {
  const seen = new Map<string, Set<string>>();
  const notes: NotificationInput[] = [];
  const events: Array<{ key: string; from: string | null; to: string }> = [];
  const last = new Map<string, { toBand: string; actual: number | null }>();
  const refreshed: string[] = [];
  let ratio = over.ratio === undefined ? 3.0 : over.ratio;
  let filings = over.filings ?? [{ accessionNumber: "q1", form: "10-Q", filingDate: "2026-05-01" }];
  const deps: MonitoringDeps = {
    listTrackedCompanies: async ({ afterId }) => (afterId === null || afterId < "co" ? [{ id: "co", name: "Acme", cik: "320193" }] : []),
    getSweepCursor: async () => null,
    setSweepCursor: async () => {},
    fetchFilings: async () => ({ ok: true, filings }),
    seenAccessions: async (c) => new Set(seen.get(c) ?? []),
    recordFilings: async (c, _cik, fs) => { const s = seen.get(c) ?? new Set(); fs.forEach((f) => s.add(f.accessionNumber)); seen.set(c, s); },
    ebitdaDocuments: async () => ["doc1"],
    refreshEbitdaBox: async (_c, d) => { refreshed.push(d); return { status: "READY", totalEbitda: "100" }; },
    loadRatioRows: async () => ({ asOfDate: "2026-06-30", rows: [lev(ratio)] }),
    thresholds: async () => CUT,
    lastBands: async () => new Map(last),
    appendBandEvent: async (_c, b, from, to) => { events.push({ key: b.covenantKey, from, to }); last.set(b.covenantKey, { toBand: to, actual: b.actual }); },
    createNotification: async (n) => { if (notes.some((x) => x.dedupeKey === n.dedupeKey)) return false; notes.push(n); return true; },
    recipients: async () => ["cfo@acme.co"],
    sendEmail: async () => "NOT_SENT_DISABLED",
    setEmailStatus: async () => {},
    ...over,
  };
  return { deps, notes, events, refreshed, setRatio: (r: number | null) => { ratio = r; }, setFilings: (f: SecFiling[]) => { filings = f; } };
}

describe("monitoring sweep", () => {
  it("first sweep is a baseline: filings recorded, band baseline recorded, nothing alerted", async () => {
    const m = memDeps();
    const [r] = await runMonitoringSweep(m.deps);
    expect(r!.filings.status).toBe("BASELINE");
    expect(m.notes).toHaveLength(0);
    expect(m.events).toEqual([{ key: "d:LEV", from: null, to: "Healthy" }]);
    expect(m.refreshed).toHaveLength(0);
  });
  it("a new 10-Q alerts, refreshes the EBITDA box, and a band change alerts 'Healthy to Moderate'", async () => {
    const m = memDeps();
    await runMonitoringSweep(m.deps);
    m.setFilings([{ accessionNumber: "q1", form: "10-Q", filingDate: "2026-05-01" }, { accessionNumber: "q2", form: "10-Q", filingDate: "2026-08-01" }]);
    m.setRatio(3.8);
    const [r] = await runMonitoringSweep(m.deps);
    expect(r!.filings).toMatchObject({ status: "OK", newCount: 1 });
    expect(m.refreshed).toEqual(["doc1"]);
    expect(m.notes.map((n) => n.kind)).toEqual(["FILING_DETECTED", "EBITDA_REFRESHED", "BAND_CHANGE"]);
    expect(m.notes[2]!.title).toBe("Max total net leverage: Healthy to Moderate");
    expect(m.notes[2]!.body).toContain("§7.11(a)");
  });
  it("re-running the same sweep creates nothing new (idempotent)", async () => {
    const m = memDeps();
    await runMonitoringSweep(m.deps);
    m.setFilings([{ accessionNumber: "q1", form: "10-Q", filingDate: "x" }, { accessionNumber: "q2", form: "8-K", filingDate: "y" }]);
    await runMonitoringSweep(m.deps);
    const n = m.notes.length;
    await runMonitoringSweep(m.deps);
    expect(m.notes.length).toBe(n);
  });
  it("an 8-K alone alerts but does not refresh EBITDA", async () => {
    const m = memDeps();
    await runMonitoringSweep(m.deps);
    m.setFilings([{ accessionNumber: "q1", form: "10-Q", filingDate: "x" }, { accessionNumber: "e1", form: "8-K", filingDate: "y" }]);
    await runMonitoringSweep(m.deps);
    expect(m.refreshed).toHaveLength(0);
  });
  it("EBITDA refresh failure alerts FAILED and says last good figures are kept", async () => {
    const m = memDeps({ refreshEbitdaBox: async () => ({ status: "FAILED", totalEbitda: null }) });
    await runMonitoringSweep(m.deps);
    m.setFilings([{ accessionNumber: "q1", form: "10-Q", filingDate: "x" }, { accessionNumber: "k1", form: "10-K", filingDate: "y" }]);
    await runMonitoringSweep(m.deps);
    const f = m.notes.find((n) => n.kind === "EBITDA_REFRESH_FAILED")!;
    expect(f.body).toMatch(/last good figures/);
  });
  it("SEC UA unset: filings SKIPPED with reason, bands still evaluated", async () => {
    const m = memDeps({ fetchFilings: async () => ({ ok: false, reason: "SEC_UA_UNSET" }) });
    const [r] = await runMonitoringSweep(m.deps);
    expect(r!.filings).toMatchObject({ status: "SKIPPED", reason: "SEC_UA_UNSET" });
    expect(r!.bands.evaluated).toBe(1);
  });
  it("no CFO cutoffs ⇒ no band events or band alerts at all (NEEDS_INPUT, not a guess)", async () => {
    const m = memDeps({ thresholds: async () => [] });
    await runMonitoringSweep(m.deps);
    m.setRatio(4.4);
    await runMonitoringSweep(m.deps);
    expect(m.events).toHaveLength(0);
    expect(m.notes.filter((n) => n.kind === "BAND_CHANGE")).toHaveLength(0);
  });
  it("a new actual in the same band is history only, no alert", async () => {
    const m = memDeps();
    await runMonitoringSweep(m.deps);
    m.setRatio(3.1);
    await runMonitoringSweep(m.deps);
    expect(m.events).toHaveLength(2);
    expect(m.notes).toHaveLength(0);
  });
  it("losing the actual ratio is a change to Not evaluated and is alerted, not hidden", async () => {
    const m = memDeps();
    await runMonitoringSweep(m.deps);
    m.setRatio(null);
    await runMonitoringSweep(m.deps);
    expect(m.notes.at(-1)!.title).toBe("Max total net leverage: Healthy to Not evaluated");
  });
  it("engine load failure ⇒ bands NOT_DETERMINABLE, no events written", async () => {
    const m = memDeps({ loadRatioRows: async () => { throw new Error("no financial state"); } });
    const [r] = await runMonitoringSweep(m.deps);
    expect(r!.bands.status).toBe("NOT_DETERMINABLE");
    expect(m.events).toHaveLength(0);
  });
  it("a per-company crash is contained and does not leak the message", async () => {
    const m = memDeps({ fetchFilings: async () => { throw new Error("postgres://u:p@h/db down"); } });
    const [r] = await runMonitoringSweep(m.deps);
    expect(r!.filings.reason).toBe("SWEEP_ERROR: Error");
  });
});

const ob = (o: Partial<ObligationRowLike>): ObligationRowLike => ({
  stableKey: "k", eventType: "FISCAL_QUARTER_END", conditionDescription: null, deadlineKind: "DAYS_AFTER_EVENT", deadlineDays: 45, deadlineDate: null,
  requiredAction: "Deliver quarterly financial statements", satisfactionState: "OPEN", sourceSectionRef: "§6.01(b)", reviewStatus: "PENDING_REVIEW", ...o,
});

describe("calendar {testDates, reportingDeadlines, cureEndDates}", () => {
  it("relative deadlines are never dated; fixed dates are; empty is NEEDS_INPUT", () => {
    const cal = buildCovenantCalendar("co", [
      ob({ stableKey: "r" }),
      ob({ stableKey: "t", eventType: "COVENANT_TEST_DATE", requiredAction: "Covenant test", deadlineKind: "FIXED_DATE", deadlineDate: new Date("2026-12-31T00:00:00Z") }),
      ob({ stableKey: "c", eventType: "EQUITY_CURE", requiredAction: "Cure contribution", deadlineDays: 10 }),
    ]);
    expect(cal.reportingDeadlines[0]).toMatchObject({ id: "r", kind: "reporting", date: null, relativeRule: "45 days after fiscal quarter end" });
    expect(cal.testDates[0]).toMatchObject({ id: "t", kind: "test", date: "2026-12-31" });
    expect(cal.cureEndDates[0]).toMatchObject({ kind: "cure", date: null });
    expect(nextTest(cal, new Date("2026-10-17T09:00:00Z"))).toEqual({ date: "2026-12-31", daysRemaining: 75 });
    expect(buildCovenantCalendar("co", []).status).toBe("NEEDS_INPUT");
  });
});

describe("morning brief", () => {
  const now = new Date("2026-10-17T09:00:00Z");
  it("counts needs-you items (PENDING + CONDITIONAL) and lists changes since last visit", async () => {
    const since: Date[] = [];
    const b = await buildMorningBrief("co", {
      lastVisitAt: async () => new Date("2026-10-16T08:00:00Z"),
      notificationTitlesSince: async (s) => { since.push(s); return ["Max total net leverage: Healthy to Moderate"]; },
      latestBoxItemStatuses: async () => [["CONFIRMED", "PENDING", "CONDITIONAL"], ["EVIDENCED", "PENDING"]],
      obligations: async () => [],
    }, now);
    expect(b).toMatchObject({ lastVisitAt: "2026-10-16T08:00:00.000Z", changes: ["Max total net leverage: Healthy to Moderate"], needsYouCount: 3, nextTest: null, nextTestStatus: "NEEDS_INPUT" });
    expect(since[0]!.toISOString()).toBe("2026-10-16T08:00:00.000Z");
  });
  it("unreadable sources are null / NOT_DETERMINABLE, never 0 or []", async () => {
    const boom = async () => { throw new Error("db"); };
    const b = await buildMorningBrief("co", { lastVisitAt: boom, notificationTitlesSince: boom, latestBoxItemStatuses: boom, obligations: boom }, now);
    expect(b).toMatchObject({ lastVisitAt: null, changes: null, needsYouCount: null, nextTest: null, nextTestStatus: "NOT_DETERMINABLE" });
  });
});

describe("Reviewer #420 round 2", () => {
  it("N1: rows the engine does not flag MAINTENANCE are never banded (incurrence tests, unflagged rows)", () => {
    expect(bandFor(lev(4.4, { testKind: "INCURRENCE" }), CUT)).toMatchObject({ status: "NOT_EVALUATED", band: null, actual: null });
    expect(bandFor(lev(4.4, { testKind: undefined }), CUT).reason).toMatch(/maintenance financial covenant/);
  });
  it("N1: sweep records no band event / alert for incurrence rows; past-limit text is not a compliance claim", async () => {
    const m = memDeps({ loadRatioRows: async () => ({ asOfDate: "2026-06-30", rows: [lev(3.0, { testKind: "INCURRENCE" })] }) });
    await runMonitoringSweep(m.deps);
    expect(m.events).toHaveLength(0);
    const k = memDeps();
    await runMonitoringSweep(k.deps);
    k.setRatio(4.6);
    await runMonitoringSweep(k.deps);
    const body = k.notes.find((n) => n.kind === "BAND_CHANGE")!.body;
    expect(body).not.toMatch(/past the covenant limit/);
    expect(body).toMatch(/not a compliance determination/);
  });
  it("N2: throttle spaces requests >= 100 ms (<= 10 req/s)", async () => {
    let t = 0;
    const waits: number[] = [];
    const th = createThrottle(100, () => t, async (ms) => { waits.push(ms); t += ms; });
    for (let i = 0; i < 5; i++) await th();
    expect(waits).toEqual([100, 100, 100, 100]);
  });
  it("N2: 429 honours Retry-After once, then reports SEC_RATE_LIMITED (not 'no filings')", async () => {
    const slept: number[] = [];
    const h = (v: string | null) => ({ get: () => v });
    let n = 0;
    const once = async () => (n++ === 0 ? { status: 429, json: async () => ({}), headers: h("2") } : { status: 200, json: async () => ({ filings: { recent: { form: ["10-Q"], accessionNumber: ["a"], filingDate: ["d"] } } }) });
    expect(await fetchRecentFilings("1", { userAgent: "a@b.c", fetchImpl: once, throttle: async () => {}, sleep: async (ms) => { slept.push(ms); } })).toMatchObject({ ok: true });
    expect(slept).toEqual([2000]);
    const always = async () => ({ status: 429, json: async () => ({}), headers: h("1") });
    expect(await fetchRecentFilings("1", { userAgent: "a@b.c", fetchImpl: always, throttle: async () => {}, sleep: async () => {} })).toMatchObject({ ok: false, reason: "SEC_RATE_LIMITED" });
    const noHeader = async () => ({ status: 429, json: async () => ({}) });
    expect(await fetchRecentFilings("1", { userAgent: "a@b.c", fetchImpl: noHeader, throttle: async () => {}, sleep: async () => {} })).toMatchObject({ reason: "SEC_RATE_LIMITED" });
    expect(parseRetryAfter("120")).toBe(120_000);
    expect(parseRetryAfter("soon")).toBeNull();
  });
  it("N2: once rate-limited, the rest of the run skips SEC polling (bands still run)", async () => {
    const calls: string[] = [];
    const m = memDeps({
      listTrackedCompanies: async ({ afterId }) => ["a", "b", "c"].filter((id) => afterId === null || id > afterId).map((id) => ({ id, name: id, cik: "1" })),
      fetchFilings: async (cik) => { calls.push(String(cik)); return { ok: false, reason: "SEC_RATE_LIMITED" }; },
    });
    const r = await runMonitoringSweep(m.deps);
    expect(calls).toHaveLength(1);
    expect(r.map((x) => x.filings.reason)).toEqual(["SEC_RATE_LIMITED", "SEC_RATE_LIMITED", "SEC_RATE_LIMITED"]);
    expect(r.every((x) => x.bands.status === "OK")).toBe(true);
  });
  it("N2: all companies are reached via cursor pagination + round-robin under a time budget (no first-page starvation)", async () => {
    const ids = Array.from({ length: 7 }, (_, i) => `c${i}`);
    let cursor: string | null = null;
    let t = 0;
    const m = memDeps({
      listTrackedCompanies: async ({ afterId, take }) => ids.filter((id) => afterId === null || id > afterId).slice(0, take).map((id) => ({ id, name: id, cik: "1" })),
      getSweepCursor: async () => cursor,
      setSweepCursor: async (c) => { cursor = c; },
      fetchFilings: async () => { t += 10; return { ok: false, reason: "SEC_UA_UNSET" }; },
    });
    const seen: string[] = [];
    for (let run = 0; run < 3; run++) {
      const r = await runMonitoringSweep(m.deps, { pageSize: 2, budgetMs: 25, now: () => t });
      seen.push(...r.map((x) => x.companyId));
    }
    expect(new Set(seen)).toEqual(new Set(ids));
    expect(seen.slice(0, 3)).toEqual(["c0", "c1", "c2"]);
    expect(seen.slice(3, 6)).toEqual(["c3", "c4", "c5"]);
  });
  it("N2: an EBITDA refresh deferred by the time budget is retried next run (filing not marked seen)", async () => {
    let t = 0;
    const m = memDeps({ refreshEbitdaBox: async () => ({ status: "READY", totalEbitda: "1" }) });
    await runMonitoringSweep(m.deps, { now: () => t });
    m.setFilings([{ accessionNumber: "q1", form: "10-Q", filingDate: "x" }, { accessionNumber: "q2", form: "10-Q", filingDate: "y" }]);
    // budget already exhausted when the refresh would start
    const r1 = await runMonitoringSweep({ ...m.deps, ebitdaDocuments: async () => { t = 1e9; return ["doc1"]; } }, { now: () => t, budgetMs: 1e6 });
    expect(r1[0]!.ebitda).toMatchObject({ deferred: 1, refreshed: 0 });
    t = 0;
    const r2 = await runMonitoringSweep(m.deps, { now: () => t });
    expect(r2[0]!.filings.newCount).toBe(1);
    expect(r2[0]!.ebitda.refreshed).toBe(1);
  });
  it("N4: a FAILED box with no prior good box is unknown (null), not 0", async () => {
    expect(goodBoxItemStatuses([{ status: "FAILED", payload: { items: [] } }])).toBeNull();
    expect(goodBoxItemStatuses([{ status: "FAILED", payload: { items: [] } }, { status: "READY", payload: { items: [{ status: "PENDING" }] } }])).toEqual(["PENDING"]);
    const b = await buildMorningBrief("co", { lastVisitAt: async () => null, notificationTitlesSince: async () => [], latestBoxItemStatuses: async () => [["PENDING"], null], obligations: async () => [] });
    expect(b.needsYouCount).toBeNull();
  });
  it("N5: alert email goes only to opted-in finance members still in the workspace, never every user", async () => {
    const { createPrismaMonitoringDeps } = await import("@/lib/monitoring/prisma-deps");
    const fm = vi.fn(async () => [{ userId: "u_cfo" }]);
    const users = vi.fn(async () => [{ email: "cfo@acme.co" }]);
    const deps = createPrismaMonitoringDeps({ workspaceFinanceMember: { findMany: fm }, user: { findMany: users } } as never, {});
    expect(await deps.recipients("co")).toEqual(["cfo@acme.co"]);
    expect((fm.mock.calls[0] as unknown[])[0]).toEqual({ where: { companyId: "co", alertEmails: true }, select: { userId: true } });
    expect((users.mock.calls[0] as unknown[])[0]).toEqual({ where: { companyId: "co", id: { in: ["u_cfo"] } }, select: { email: true } });
    const none = createPrismaMonitoringDeps({ workspaceFinanceMember: { findMany: async () => [] }, user: { findMany: users } } as never, {});
    expect(await none.recipients("co")).toEqual([]);
  });
  it("N6: cron auth is Bearer-only and constant-time; ?secret= is refused", () => {
    const env = { CRON_SECRET: "s3cret" };
    expect(assertMonitoringCronAuthorized(new Request("http://x/?secret=s3cret"), env)).toMatchObject({ ok: false, status: 401 });
    expect(assertMonitoringCronAuthorized(new Request("http://x/", { headers: { authorization: "Bearer s3cret" } }), env)).toEqual({ ok: true });
    expect(assertMonitoringCronAuthorized(new Request("http://x/", { headers: { authorization: "Bearer s3cre" } }), env)).toMatchObject({ ok: false });
    expect(assertMonitoringCronAuthorized(new Request("http://x/"), {})).toMatchObject({ status: 503 });
  });
});

describe("feed params", () => {
  it("defaults to 24h, rejects junk", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect((parseSince(null, now) as Date).toISOString()).toBe("2026-10-16T12:00:00.000Z");
    expect(parseSince("yesterday")).toBe("INVALID");
  });
});
