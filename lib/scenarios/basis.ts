/**
 * What a saved scenario was computed against, and whether that is still current.
 *
 * A saved scenario stores display values exactly as the CFO saw them. Those values are only
 * meaningful against the financial state and engine build that produced them, so each save
 * records its BASIS (server-resolved, never client-supplied):
 *   - asOfDate / financialStateId / financialStateUpdatedAt: the workspace's canonical latest
 *     FinancialState at save time (same latest-cohort identity rule the overview uses);
 *   - engineVersion: the deployed build (VERCEL_GIT_COMMIT_SHA).
 * Any part that cannot be resolved is stored as null and the scenario then reads as
 * UNKNOWN basis, never as current.
 */
import { resolveCanonicalFinancialIdentity } from "@/lib/financial-identity";

export interface ScenarioBasis {
  asOfDate: Date | null;
  financialStateId: string | null;
  financialStateUpdatedAt: Date | null;
  engineVersion: string | null;
}

export type ScenarioFreshness = {
  status: "CURRENT" | "STALE" | "UNKNOWN";
  /** Which parts differ (STALE) or are missing (UNKNOWN). Empty for CURRENT. */
  reasons: ("AS_OF_DATE" | "FINANCIAL_STATE" | "FINANCIALS_EDITED" | "ENGINE_VERSION")[];
  savedAsOfDate: string | null;
  savedEngineVersion: string | null;
  label: string;
};

type Env = Readonly<Record<string, string | undefined>>;

export function currentEngineVersion(env: Env = process.env): string | null {
  const v = env.VERCEL_GIT_COMMIT_SHA?.trim();
  return v ? v : null;
}

type FinancialStateReader = {
  financialState: { findMany(args: unknown): Promise<{ id: string; asOfDate: Date; updatedAt: Date }[]> };
};

/** The basis a save made now would record. Not-unique / missing financial state ⇒ nulls (no guess). */
export async function resolveScenarioBasis(db: FinancialStateReader, companyId: string, env: Env = process.env): Promise<ScenarioBasis> {
  const res = await resolveCanonicalFinancialIdentity(
    (args: { where: unknown }) => db.financialState.findMany({ ...args, select: { id: true, asOfDate: true, updatedAt: true } }),
    { where: { companyId }, selection: "latest-cohort" },
  );
  const row = res.status === "UNIQUE" ? res.row : null;
  return {
    asOfDate: row?.asOfDate ?? null,
    financialStateId: row?.id ?? null,
    financialStateUpdatedAt: row?.updatedAt ?? null,
    engineVersion: currentEngineVersion(env),
  };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const t = (d: Date | null) => (d ? d.getTime() : null);

/** Compare a saved basis with the current one. CURRENT only when every part is known and equal. */
export function scenarioFreshness(saved: ScenarioBasis & { savedAt: Date }, current: ScenarioBasis): ScenarioFreshness {
  const parts: [ScenarioFreshness["reasons"][number], unknown, unknown][] = [
    ["AS_OF_DATE", t(saved.asOfDate), t(current.asOfDate)],
    ["FINANCIAL_STATE", saved.financialStateId, current.financialStateId],
    ["FINANCIALS_EDITED", t(saved.financialStateUpdatedAt), t(current.financialStateUpdatedAt)],
    ["ENGINE_VERSION", saved.engineVersion, current.engineVersion],
  ];
  const differ = parts.filter(([, a, b]) => a !== null && b !== null && a !== b).map(([k]) => k);
  const missing = parts.filter(([, a, b]) => a === null || b === null).map(([k]) => k);
  const savedOn = `Saved on ${day(saved.savedAt)}`;
  const against = saved.asOfDate ? ` against financials as of ${day(saved.asOfDate)}` : "";
  const base = {
    savedAsOfDate: saved.asOfDate ? day(saved.asOfDate) : null,
    savedEngineVersion: saved.engineVersion,
  };
  if (differ.length > 0) {
    const what = differ.includes("ENGINE_VERSION") && differ.length === 1 ? "the covenant engine has changed since" : "the financials have changed since";
    return { status: "STALE", reasons: differ, ...base, label: `${savedOn}${against}; not current: ${what}.` };
  }
  if (missing.length > 0) {
    return { status: "UNKNOWN", reasons: missing, ...base, label: `${savedOn}${against}; cannot confirm it is current.` };
  }
  return { status: "CURRENT", reasons: [], ...base, label: `${savedOn}${against}; current.` };
}
