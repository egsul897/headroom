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
import { bandFor, type BandName, type CovenantBand, type RatioRowInput, type ThresholdRow } from "./bands";
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
  /** One page of tracked companies ordered by id ascending, strictly after afterId. */
  listTrackedCompanies(page: { afterId: string | null; take: number }): Promise<TrackedCompany[]>;
  /** Round-robin position: id of the last company swept by the previous run (null = start). */
  getSweepCursor(): Promise<string | null>;
  setSweepCursor(lastCompanyId: string | null): Promise<void>;
  fetchFilings(cik: string | null): Promise<SubmissionsResult>;
  seenAccessions(companyId: string): Promise<Set<string>>;
  recordFilings(companyId: string, cik: string, filings: SecFiling[]): Promise<void>;
  ebitdaDocuments(companyId: string): Promise<string[]>;
  refreshEbitdaBox(companyId: string, documentId: string): Promise<{ status: string; totalEbitda: string | null } | null>;
  /** Ratio rows + as-of from the existing covenant overview; null when the engine cannot load. */
  loadRatioRows(companyId: string): Promise<{ asOfDate: string; rows: RatioRowInput[] } | null>;
  thresholds(companyId: string): Promise<ThresholdRow[]>;
  /** Latest recorded band event per covenant: toBand (Healthy|Moderate|Danger|NOT_EVALUATED) + actual. */
  lastBands(companyId: string): Promise<Map<string, { toBand: string; actual: number | null }>>;
  appendBandEvent(companyId: string, band: CovenantBand, fromBand: string | null, toBand: string, asOfDate: string): Promise<void>;
  /** Insert unless dedupeKey exists; returns true when created. */
  createNotification(n: NotificationInput): Promise<boolean>;
  /** Email recipients: opted-in finance members of the workspace only (never every user). */
  recipients(companyId: string): Promise<string[]>;
  sendEmail(msg: { to: string[]; subject: string; text: string }): Promise<EmailStatus>;
  setEmailStatus(dedupeKey: string, status: EmailStatus): Promise<void>;
}

export interface CompanySweepResult {
  companyId: string;
  filings: { status: "OK" | "BASELINE" | "SKIPPED"; reason?: string; newCount: number };
  ebitda: { refreshed: number; failed: number; deferred: number; skipped: string | null };
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

export interface SweepContext {
  /** ms timestamp after which no new EBITDA refresh starts (deferred to the next run). */
  deadline: number;
  now: () => number;
  /** Set once SEC rate-limits us; later companies skip polling for the rest of the run. */
  secBackoff: boolean;
}

export async function sweepCompany(
  deps: MonitoringDeps,
  c: TrackedCompany,
  ctx: SweepContext = { deadline: Number.POSITIVE_INFINITY, now: Date.now, secBackoff: false },
): Promise<CompanySweepResult> {
  const out: CompanySweepResult = {
    companyId: c.id,
    filings: { status: "SKIPPED", newCount: 0 },
    ebitda: { refreshed: 0, failed: 0, deferred: 0, skipped: "no new financial filing" },
    bands: { status: "NOT_DETERMINABLE", evaluated: 0, changes: 0 },
    notifications: 0,
  };

  // 1. Filings
  const res: SubmissionsResult = ctx.secBackoff ? { ok: false, reason: "SEC_RATE_LIMITED" } : await deps.fetchFilings(c.cik);
  if (!res.ok && res.reason === "SEC_RATE_LIMITED") ctx.secBackoff = true;
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
      // Financial filings are recorded only after their EBITDA refresh was attempted (below),
      // so a refresh deferred by the time budget is retried next run, not lost.
      await deps.recordFilings(c.id, c.cik!, fresh.filter((f) => !FINANCIAL_FORMS.has(f.form)));
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
      if (ctx.now() > ctx.deadline) {
        out.ebitda.deferred++;
        continue;
      }
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

  if (newFinancial.length && out.ebitda.deferred === 0) await deps.recordFilings(c.id, c.cik!, newFinancial);
  if (out.ebitda.deferred) out.ebitda.skipped = "time budget: deferred to the next run";

  // 3. Bands — only covenants with CFO-set cutoffs can change band; no cutoffs ⇒ NEEDS_INPUT, no events.
  const loaded = await deps.loadRatioRows(c.id).catch(() => null);
  if (loaded) {
    const thresholds = await deps.thresholds(c.id);
    const last = await deps.lastBands(c.id);
    out.bands.status = "OK";
    for (const row of loaded.rows) {
      const prevRec = last.get(row.stableKey) ?? null;
      const prevBand = prevRec && prevRec.toBand !== "NOT_EVALUATED" ? (prevRec.toBand as BandName) : null;
      const b = bandFor(row, thresholds, { band: prevBand, actual: prevRec?.actual ?? null });
      out.bands.evaluated++;
      let toBand: string | null = null;
      if (b.status === "EVALUATED") toBand = b.band!;
      else if (b.status === "NOT_EVALUATED" && prevBand) toBand = "NOT_EVALUATED"; // lost the actual: a real change
      if (toBand === null) continue; // NEEDS_INPUT (no cutoffs) or never evaluated: nothing to record
      const prev = prevRec?.toBand ?? null;
      if (prev === toBand && (prevRec?.actual ?? null) === b.actual) continue;
      await deps.appendBandEvent(c.id, b, prev, toBand, loaded.asOfDate);
      if (prev === null || prev === toBand) continue; // baseline or same band with a new actual: history only
      out.bands.changes++;
      const label = (x: string) => (x === "NOT_EVALUATED" ? "Not evaluated" : x);
      out.notifications += await notify(deps, {
        companyId: c.id,
        kind: "BAND_CHANGE",
        title: `${b.name}: ${label(prev)} to ${label(toBand)}`,
        body:
          toBand === "NOT_EVALUATED"
            ? `${b.name} (${b.documentName} ${b.sectionRef}) can no longer be evaluated: ${b.reason}`
            : `${b.name} (${b.documentName} ${b.sectionRef}) is ${b.actualLabel} of ${b.thresholds!.limitLabel} as of ${loaded.asOfDate}${b.pastLimit ? " — beyond the maintenance covenant's cited level (engine actual vs the agreement's limit; not a compliance determination)" : ""}. Band cutoffs are your settings (Healthy within ${b.thresholds!.healthyUntil.toFixed(2)}x, Moderate within ${b.thresholds!.moderateUntil.toFixed(2)}x).`,
        link: `/${c.id}/covenants`,
        dedupeKey: `band:${c.id}:${b.covenantKey}:${loaded.asOfDate}:${prev}->${toBand}`,
      });
    }
  }
  return out;
}

export interface SweepOptions {
  pageSize?: number;
  /** Stop starting new companies after this long (cron maxDuration is 300 s). */
  budgetMs?: number;
  now?: () => number;
}

/**
 * Round-robin over ALL tracked companies via cursor pagination. Starts after the previous
 * run's cursor, wraps to the start, stops at the time budget, and saves the last company
 * swept, so every company is reached over successive runs (no first-200 starvation).
 */
export async function runMonitoringSweep(deps: MonitoringDeps, opts: SweepOptions = {}): Promise<CompanySweepResult[]> {
  const now = opts.now ?? Date.now;
  const start = now();
  const budget = opts.budgetMs ?? 240_000;
  const take = opts.pageSize ?? 100;
  const ctx: SweepContext = { deadline: start + budget, now, secBackoff: false };
  const cursor = await deps.getSweepCursor().catch(() => null);
  const results: CompanySweepResult[] = [];
  let last: string | null = null;

  const runOne = async (c: TrackedCompany) => {
    try {
      results.push(await sweepCompany(deps, c, ctx));
    } catch (err) {
      results.push({
        companyId: c.id,
        filings: { status: "SKIPPED", reason: `SWEEP_ERROR: ${err instanceof Error ? err.name : "unknown"}`, newCount: 0 },
        ebitda: { refreshed: 0, failed: 0, deferred: 0, skipped: "sweep error" },
        bands: { status: "NOT_DETERMINABLE", evaluated: 0, changes: 0 },
        notifications: 0,
      });
    }
    last = c.id;
  };

  // Phase 1: after the cursor to the end; phase 2: from the start up to the cursor (inclusive).
  outer: for (const phase of cursor === null ? [1] : [1, 2]) {
    let after: string | null = phase === 1 ? cursor : null;
    for (;;) {
      const page = await deps.listTrackedCompanies({ afterId: after, take });
      if (!page.length) break;
      for (const c of page) {
        if (phase === 2 && cursor !== null && c.id > cursor) break outer;
        if (now() - start > budget) break outer;
        await runOne(c);
      }
      after = page[page.length - 1]!.id;
      if (page.length < take) break;
    }
  }
  if (last !== null) await deps.setSweepCursor(last).catch(() => {});
  return results;
}
