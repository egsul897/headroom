/**
 * Monitoring sweep (deterministic; no AI, no paid inference).
 * For each tracked workspace (CUSTOMER company with a CIK):
 *   1. poll EDGAR for new filings (skipped, with reason, when SEC UA is unset);
 *      the first sweep records a baseline and alerts nothing;
 *   2. on a new financial filing (10-K/10-Q/…), refresh every EBITDA box the
 *      workspace has (the add-back tracker), alerting success or failure;
 *   3. evaluate covenant bands from the engine's own actual vs limit and
 *      append a band event + alert on every band change ("Healthy to Moderate").
 * Every notification has a deterministic dedupeKey, so a re-run is a no-op.
 */
import { BAND_LABEL, bandFor, type CovenantBand, type RatioRowInput } from "./bands";
import { diffNewFilings, FINANCIAL_FORMS, type SecFiling, type SubmissionsResult } from "./filings";
import type { EmailStatus } from "./email";

export interface TrackedCompany {
  id: string;
  name: string;
  cik: string | null;
}

export interface NotificationInput {
  companyId: string;
  kind: "FILING_DETECTED" | "EBITDA_REFRESHED" | "EBITDA_REFRESH_FAILED" | "BAND_CHANGE";
  title: string;
  body: string;
  link: string | null;
  dedupeKey: string;
}

export interface MonitoringDeps {
  listTrackedCompanies(): Promise<TrackedCompany[]>;
  fetchFilings(cik: string | null): Promise<SubmissionsResult>;
  seenAccessions(companyId: string): Promise<Set<string>>;
  recordFilings(companyId: string, cik: string, filings: SecFiling[]): Promise<void>;
  ebitdaDocuments(companyId: string): Promise<string[]>;
  refreshEbitdaBox(companyId: string, documentId: string): Promise<{ status: string; totalEbitda: string | null } | null>;
  /** Ratio rows + as-of from the existing covenant overview; null when the engine cannot load. */
  loadRatioRows(companyId: string): Promise<{ asOfDate: string; rows: RatioRowInput[] } | null>;
  thresholds(companyId: string): Promise<Array<{ covenantKey: string; moderateBelow: number; dangerBelow: number }>>;
  lastBands(companyId: string): Promise<Map<string, string>>;
  appendBandEvent(companyId: string, band: CovenantBand, fromBand: string | null, asOfDate: string): Promise<void>;
  /** Insert unless dedupeKey exists; returns true when created. */
  createNotification(n: NotificationInput): Promise<boolean>;
  recipients(companyId: string): Promise<string[]>;
  sendEmail(msg: { to: string[]; subject: string; text: string }): Promise<EmailStatus>;
  setEmailStatus(dedupeKey: string, status: EmailStatus): Promise<void>;
}

export interface CompanySweepResult {
  companyId: string;
  filings: { status: "OK" | "BASELINE" | "SKIPPED"; reason?: string; newCount: number };
  ebitda: { refreshed: number; failed: number; skipped: string | null };
  bands: { status: "OK" | "NOT_DETERMINABLE"; evaluated: number; changes: number };
  notifications: number;
}

async function notify(deps: MonitoringDeps, n: NotificationInput): Promise<number> {
  const created = await deps.createNotification(n);
  if (!created) return 0;
  const to = await deps.recipients(n.companyId).catch(() => []);
  const status = await deps.sendEmail({ to, subject: `Headroom: ${n.title}`, text: `${n.body}${n.link ? `\n\n${n.link}` : ""}` });
  await deps.setEmailStatus(n.dedupeKey, status).catch(() => {});
  return 1;
}

export async function sweepCompany(deps: MonitoringDeps, c: TrackedCompany): Promise<CompanySweepResult> {
  const out: CompanySweepResult = {
    companyId: c.id,
    filings: { status: "SKIPPED", newCount: 0 },
    ebitda: { refreshed: 0, failed: 0, skipped: "no new financial filing" },
    bands: { status: "NOT_DETERMINABLE", evaluated: 0, changes: 0 },
    notifications: 0,
  };

  // 1. Filings
  const res = await deps.fetchFilings(c.cik);
  let newFinancial: SecFiling[] = [];
  if (!res.ok) {
    out.filings = { status: "SKIPPED", reason: res.reason, newCount: 0 };
  } else {
    const seen = await deps.seenAccessions(c.id);
    const fresh = diffNewFilings(res.filings, seen);
    if (seen.size === 0) {
      await deps.recordFilings(c.id, c.cik!, res.filings);
      out.filings = { status: "BASELINE", newCount: 0 };
    } else {
      await deps.recordFilings(c.id, c.cik!, fresh);
      out.filings = { status: "OK", newCount: fresh.length };
      for (const f of fresh) {
        out.notifications += await notify(deps, {
          companyId: c.id,
          kind: "FILING_DETECTED",
          title: `New ${f.form} filed ${f.filingDate}`,
          body: `${c.name} filed a ${f.form} with the SEC on ${f.filingDate} (accession ${f.accessionNumber}).`,
          link: `https://www.sec.gov/Archives/edgar/data/${Number(c.cik)}/${f.accessionNumber.replace(/-/g, "")}/`,
          dedupeKey: `filing:${c.id}:${f.accessionNumber}`,
        });
      }
      newFinancial = fresh.filter((f) => FINANCIAL_FORMS.has(f.form));
    }
  }

  // 2. EBITDA add-back tracker refresh on new financials
  if (newFinancial.length) {
    out.ebitda.skipped = null;
    const trigger = newFinancial.map((f) => f.accessionNumber).sort().join(",");
    for (const documentId of await deps.ebitdaDocuments(c.id)) {
      let r: { status: string; totalEbitda: string | null } | null = null;
      try {
        r = await deps.refreshEbitdaBox(c.id, documentId);
      } catch {
        r = null;
      }
      const ok = r !== null && r.status !== "FAILED";
      if (ok) out.ebitda.refreshed++;
      else out.ebitda.failed++;
      out.notifications += await notify(deps, {
        companyId: c.id,
        kind: ok ? "EBITDA_REFRESHED" : "EBITDA_REFRESH_FAILED",
        title: ok ? "EBITDA add-backs refreshed for new financials" : "EBITDA refresh failed — last good figures kept",
        body: ok
          ? `The add-back tracker re-ran on the new filing. Status: ${r!.status}. Review any items that need you.`
          : "The add-back tracker could not re-run on the new filing. The dashboard keeps the last good figures, marked stale.",
        link: `/${c.id}/dashboard`,
        dedupeKey: `ebitda:${c.id}:${documentId}:${trigger}`,
      });
    }
  }

  // 3. Bands
  const loaded = await deps.loadRatioRows(c.id).catch(() => null);
  if (loaded) {
    const thresholds = await deps.thresholds(c.id);
    const last = await deps.lastBands(c.id);
    out.bands.status = "OK";
    for (const row of loaded.rows) {
      const b = bandFor(row, thresholds);
      out.bands.evaluated++;
      const prev = last.get(b.covenantKey) ?? null;
      if (prev === b.band) continue;
      await deps.appendBandEvent(c.id, b, prev, loaded.asOfDate);
      if (prev === null) continue; // first observation is the baseline, not a change
      out.bands.changes++;
      const from = BAND_LABEL[prev as keyof typeof BAND_LABEL] ?? prev;
      const to = BAND_LABEL[b.band];
      out.notifications += await notify(deps, {
        companyId: c.id,
        kind: "BAND_CHANGE",
        title: `${b.covenantName}: ${from} to ${to}`,
        body:
          b.band === "NOT_DETERMINABLE"
            ? `${b.covenantName} (${b.documentName} ${b.sectionRef}) can no longer be determined: ${b.reason}`
            : `${b.covenantName} (${b.documentName} ${b.sectionRef}) is ${b.actual} against a ${b.comparison === "at_or_below" ? "maximum" : "minimum"} of ${b.limit} — headroom ${(b.headroomPct! * 100).toFixed(1)}% as of ${loaded.asOfDate}. Band thresholds: ${b.thresholdSource.replace(/_/g, " ").toLowerCase()}.`,
        link: `/${c.id}/covenants`,
        dedupeKey: `band:${c.id}:${b.covenantKey}:${loaded.asOfDate}:${prev}->${b.band}`,
      });
    }
  }
  return out;
}

export async function runMonitoringSweep(deps: MonitoringDeps, opts: { maxCompanies?: number } = {}): Promise<CompanySweepResult[]> {
  const companies = (await deps.listTrackedCompanies()).slice(0, opts.maxCompanies ?? 200);
  const results: CompanySweepResult[] = [];
  for (const c of companies) {
    try {
      results.push(await sweepCompany(deps, c));
    } catch (err) {
      results.push({
        companyId: c.id,
        filings: { status: "SKIPPED", reason: `SWEEP_ERROR: ${err instanceof Error ? err.name : "unknown"}`, newCount: 0 },
        ebitda: { refreshed: 0, failed: 0, skipped: "sweep error" },
        bands: { status: "NOT_DETERMINABLE", evaluated: 0, changes: 0 },
        notifications: 0,
      });
    }
  }
  return results;
}
