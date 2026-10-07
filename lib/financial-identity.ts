/**
 * Canonical financial identity before a schema @@unique([companyId, asOfDate]).
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. invent-absence forever.
 * PINNED_OFFLINE ≠ CERTIFIED.
 *
 * Matching rows for the caller's existing filter:
 *   0 → UNKNOWN (no fabricated row)
 *   1 → that row
 *   >1 in the exact set, or in the latest asOfDate cohort → AMBIGUOUS
 *
 * `latest-cohort` is the same "latest row matching this where" read
 * findFirst + orderBy asOfDate desc already performed. It does not add a
 * dating rule. Ties on that latest asOfDate are not broken by findFirst.
 *
 * Schema @@unique and the write-side financial.ts findFirst remain HOLD.
 */

export const FINANCIAL_IDENTITY_UNKNOWN = "FINANCIAL_IDENTITY_UNKNOWN";
export const FINANCIAL_IDENTITY_AMBIGUOUS = "FINANCIAL_IDENTITY_AMBIGUOUS";

export class FinancialIdentityError extends Error {
  readonly code: "UNKNOWN" | "AMBIGUOUS";
  readonly matchCount: number;

  constructor(code: "UNKNOWN" | "AMBIGUOUS", matchCount: number, detail: string) {
    const label = code === "UNKNOWN" ? FINANCIAL_IDENTITY_UNKNOWN : FINANCIAL_IDENTITY_AMBIGUOUS;
    super(`${label}: ${detail}`);
    this.name = "FinancialIdentityError";
    this.code = code;
    this.matchCount = matchCount;
  }
}

export type FinancialIdentityResolution<T> =
  | { status: "UNKNOWN"; code: typeof FINANCIAL_IDENTITY_UNKNOWN; matchCount: 0 }
  | { status: "UNIQUE"; code: "UNIQUE"; matchCount: 1; row: T }
  | { status: "AMBIGUOUS"; code: typeof FINANCIAL_IDENTITY_AMBIGUOUS; matchCount: number };

export async function resolveCanonicalFinancialIdentity<T extends { asOfDate: Date }>(
  findMany: (args: any) => Promise<T[]>,
  query: { where: unknown; selection: "exact" | "latest-cohort" },
): Promise<FinancialIdentityResolution<T>> {
  const rows = await findMany({ where: query.where });
  if (rows.length === 0) {
    return { status: "UNKNOWN", code: FINANCIAL_IDENTITY_UNKNOWN, matchCount: 0 };
  }
  if (query.selection === "exact") {
    if (rows.length === 1) return { status: "UNIQUE", code: "UNIQUE", matchCount: 1, row: rows[0]! };
    return { status: "AMBIGUOUS", code: FINANCIAL_IDENTITY_AMBIGUOUS, matchCount: rows.length };
  }

  let maxTime = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const time = row.asOfDate.getTime();
    if (time > maxTime) maxTime = time;
  }
  const cohort = rows.filter((row) => row.asOfDate.getTime() === maxTime);
  if (cohort.length === 1) return { status: "UNIQUE", code: "UNIQUE", matchCount: 1, row: cohort[0]! };
  return { status: "AMBIGUOUS", code: FINANCIAL_IDENTITY_AMBIGUOUS, matchCount: cohort.length };
}
