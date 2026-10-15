/** kf_financials persistence (public SEC data only). Insert ON CONFLICT DO NOTHING, then read back and compare every row. */
import type { IssuerFinancials } from "./companyfacts";

export interface SqlExecutor { execute(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }

const COLS = ["cik", "entityName", "metric", "concept", "periodType", "periodStart", "periodEnd", "value", "unit", "accession", "form", "filed", "derivation"] as const;

export async function persistFinancials(ex: SqlExecutor, fin: IssuerFinancials): Promise<{ written: number; verified: number }> {
  if (!fin.values.length) return { written: 0, verified: 0 };
  const params: unknown[] = [];
  const rows = fin.values.map((v) => "(" + [fin.cik, fin.entityName, v.metric, v.concept, v.periodType, v.periodStart, v.periodEnd, v.value, v.unit, v.accession, v.form, v.filed, v.derivation]
    .map((x, j) => { params.push(x); const c = COLS[j]; return `$${params.length}${c === "periodStart" || c === "periodEnd" || c === "filed" ? "::date" : c === "value" ? "::numeric" : ""}`; }).join(",") + ")");
  await ex.execute(`INSERT INTO kf_financials (${COLS.map((c) => `"${c}"`).join(",")}) VALUES ${rows.join(",")} ON CONFLICT DO NOTHING`, params);
  const back = await ex.execute(`SELECT "metric","concept","periodType","periodEnd"::text AS "periodEnd","accession","value"::text AS "value" FROM kf_financials WHERE "cik"=$1`, [fin.cik]);
  const key = (r: { metric: unknown; concept: unknown; periodType: unknown; periodEnd: unknown; accession: unknown }) => [r.metric, r.concept, r.periodType, String(r.periodEnd).slice(0, 10), r.accession].join("|");
  const got = new Map(back.map((r) => [key(r as never), String(r.value)]));
  let verified = 0;
  for (const v of fin.values) {
    const g = got.get(key(v));
    if (g !== v.value) throw new Error(`kf_financials read-back mismatch ${fin.cik} ${v.metric} ${v.periodEnd}: stored ${g ?? "none"} vs ${v.value}`);
    verified++;
  }
  return { written: fin.values.length, verified };
}
