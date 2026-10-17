import { describe, expect, it, vi } from "vitest";
import { bandFor, headroomFraction, resolveThresholds, validateThresholds, type RatioRowInput } from "@/lib/monitoring/bands";
import { diffNewFilings, fetchRecentFilings, normalizeCik } from "@/lib/monitoring/filings";
import { emailConfig, sendAlertEmail } from "@/lib/monitoring/email";
import { runMonitoringSweep, type MonitoringDeps, type NotificationInput } from "@/lib/monitoring/sweep";
import { parseSince } from "@/lib/monitoring/feed";
import type { SecFiling } from "@/lib/monitoring/filings";

const lev = (actual: number | null, over: Partial<RatioRowInput> = {}): RatioRowInput => ({
  stableKey: "d:LEV", name: "Max total net leverage", documentName: "Credit Agreement", sectionRef: "§7.11(a)",
  currentRatio: actual, ratioLimit: 4.5, comparisonDirection: "at_or_below", status: "MODELED", ...over,
});

describe("bands", () => {
  it("headroom fraction respects the covenant's direction", () => {
    expect(headroomFraction(3.6, 4.5, "at_or_below")).toBeCloseTo(0.2);
    expect(headroomFraction(2.75, 2.5, "at_or_above")).toBeCloseTo(0.1);
    expect(headroomFraction(1, 0, "at_or_below")).toBeNull();
  });
  it("product-default thresholds: Healthy / Moderate / Danger / Breach, labelled PRODUCT_DEFAULT", () => {
    expect(bandFor(lev(3.0), []).band).toBe("HEALTHY");
    expect(bandFor(lev(3.8), []).band).toBe("MODERATE");
    expect(bandFor(lev(4.3), [])).toMatchObject({ band: "DANGER", thresholdSource: "PRODUCT_DEFAULT" });
    expect(bandFor(lev(4.6), []).band).toBe("BREACH");
  });
  it("no computed actual or not MODELED ⇒ NOT_DETERMINABLE, never Healthy", () => {
    expect(bandFor(lev(null), []).band).toBe("NOT_DETERMINABLE");
    expect(bandFor(lev(1.0, { status: "REVIEW_REQUIRED" }), []).band).toBe("NOT_DETERMINABLE");
  });
  it("covenant thresholds beat workspace default beat product default; invalid rows ignored", () => {
    const rows = [{ covenantKey: "*", moderateBelow: 0.5, dangerBelow: 0.3 }, { covenantKey: "d:LEV", moderateBelow: 0.15, dangerBelow: 0.05 }];
    expect(resolveThresholds("d:LEV", rows).source).toBe("COVENANT");
    expect(resolveThresholds("other", rows).source).toBe("WORKSPACE_DEFAULT");
    expect(resolveThresholds("d:LEV", [{ covenantKey: "d:LEV", moderateBelow: 0.1, dangerBelow: 0.2 }]).source).toBe("PRODUCT_DEFAULT");
    expect(validateThresholds({ moderateBelow: 1.5, dangerBelow: 0.1 })).toBeNull();
    expect(validateThresholds({ moderateBelow: "x", dangerBelow: 0.1 })).toBeNull();
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
    expect(await fetchRecentFilings("1", { userAgent: "a@b.c", fetchImpl: async () => ({ status: 503, json: async () => ({}) }) })).toMatchObject({ ok: false, reason: "SEC_HTTP_ERROR" });
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
  const last = new Map<string, string>();
  const refreshed: string[] = [];
  let ratio = over.ratio === undefined ? 3.0 : over.ratio;
  let filings = over.filings ?? [{ accessionNumber: "q1", form: "10-Q", filingDate: "2026-05-01" }];
  const deps: MonitoringDeps = {
    listTrackedCompanies: async () => [{ id: "co", name: "Acme", cik: "320193" }],
    fetchFilings: async () => ({ ok: true, filings }),
    seenAccessions: async (c) => new Set(seen.get(c) ?? []),
    recordFilings: async (c, _cik, fs) => { const s = seen.get(c) ?? new Set(); fs.forEach((f) => s.add(f.accessionNumber)); seen.set(c, s); },
    ebitdaDocuments: async () => ["doc1"],
    refreshEbitdaBox: async (_c, d) => { refreshed.push(d); return { status: "READY", totalEbitda: "100" }; },
    loadRatioRows: async () => ({ asOfDate: "2026-06-30", rows: [lev(ratio)] }),
    thresholds: async () => [],
    lastBands: async () => new Map(last),
    appendBandEvent: async (_c, b, from) => { events.push({ key: b.covenantKey, from, to: b.band }); last.set(b.covenantKey, b.band); },
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
    expect(m.events).toEqual([{ key: "d:LEV", from: null, to: "HEALTHY" }]);
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
  it("losing the actual ratio is a change to NOT_DETERMINABLE and is alerted, not hidden", async () => {
    const m = memDeps();
    await runMonitoringSweep(m.deps);
    m.setRatio(null);
    await runMonitoringSweep(m.deps);
    expect(m.notes.at(-1)!.title).toBe("Max total net leverage: Healthy to Not determinable");
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

describe("feed params", () => {
  it("defaults to 24h, rejects junk", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect((parseSince(null, now) as Date).toISOString()).toBe("2026-10-16T12:00:00.000Z");
    expect(parseSince("yesterday")).toBe("INVALID");
  });
});
