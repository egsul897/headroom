/**
 * ERP application layer — EBITDA add-back evidence intake (ERP-2).
 *
 * An ERP-reported amount tagged to an add-back category becomes an
 * EVIDENCE item: full provenance (connection, external id, fact key,
 * period), the agreement-definition category it is tagged to, status
 * UNCONFIRMED / reviewStatus UNVERIFIED — the repo's never-auto-verified
 * vocabulary (lib/financial-core's fact() defaults reviewStatus to
 * UNVERIFIED; DefinedTermStatus starts UNVERIFIED for the same reason).
 *
 * Evidence is intake only. This module writes no LedgerEntry, no
 * FinancialSnapshot, no FinancialState, and exposes no totals: an
 * ERP-reported add-back counts toward EBITDA, baskets, and capacity
 * ONLY after the CFO confirmation flow (Workstream E, on PR #398's
 * branch) confirms it — including its separate LENDER_APPROVAL step
 * for conditional add-backs. Whether the category is even a permitted
 * add-back under a given agreement's own EBITDA definition is that
 * flow's question (the definition lives in the EBITDA box, not on this
 * branch); intake records the claim and its provenance, nothing more.
 */

import type { ErpApplicationDb, ErpApplicationResult, ErpNormalizedFact } from "./types";
import {
  beginErpFactApplication,
  isBlank,
  validateCommonFact,
  validateFactTenancy,
  withErpTx,
  writeErpApplicationRow,
} from "./shared";

/** One UNCONFIRMED add-back evidence item, shaped for the CFO confirmation queue. */
export interface ErpAddbackEvidenceItem {
  applicationId: string;
  companyId: string;
  /** The agreement EBITDA-definition category the ERP tagged this amount to (as reported — not yet validated against any definition). */
  addbackCategory: string;
  amount: number;
  currency: string | null;
  /** Period end (the fact's asOf). */
  asOf: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** Always UNCONFIRMED at intake — ERP data is sourced evidence, never auto-verified. */
  status: "UNCONFIRMED";
  /** Repo review vocabulary; always UNVERIFIED at intake. */
  reviewStatus: "UNVERIFIED";
  provenance: {
    source: "ERP";
    connectionId: string;
    externalId: string;
    factKey: string;
  };
}

function amountToNumber(value: number | { toNumber(): number } | null): number {
  if (value == null) return NaN;
  return typeof value === "number" ? value : value.toNumber();
}

export async function recordErpAddbackEvidence(
  db: ErpApplicationDb,
  companyId: string,
  fact: ErpNormalizedFact,
): Promise<ErpApplicationResult> {
  return withErpTx(db, async (tx) => {
    const begin = await beginErpFactApplication(tx, companyId, "EBITDA_ADDBACK_EVIDENCE", fact);
    if (begin.action === "done") return begin.result;
    const existing = begin.existing;

    const problems = [...validateCommonFact(fact), ...(await validateFactTenancy(tx, companyId, fact))];
    if (isBlank(fact.addbackCategory)) {
      problems.push("addbackCategory is missing — an ERP amount with no add-back category tag cannot be recorded as add-back evidence");
    }
    if (problems.length > 0) {
      const row = await writeErpApplicationRow(tx, companyId, "EBITDA_ADDBACK_EVIDENCE", fact, existing, {
        disposition: "REJECTED",
        detail: `Refused: ${problems.join("; ")}`,
        reviewStatus: "UNVERIFIED",
      });
      return { disposition: "REJECTED" as const, applicationId: row.id, ledgerEntryId: null, duplicate: false, reasons: problems };
    }

    const detail =
      `ERP-reported add-back evidence for category "${fact.addbackCategory!.trim()}": ${fact.amount} ${fact.currency} as of ${fact.asOf}, ` +
      `from ERP connection ${fact.connectionId}, external id ${fact.externalId}. Status UNCONFIRMED — recorded as evidence only; ` +
      `it is excluded from EBITDA, basket, and capacity computations until confirmed through the CFO confirmation flow.`;
    const row = await writeErpApplicationRow(tx, companyId, "EBITDA_ADDBACK_EVIDENCE", fact, existing, {
      disposition: "EVIDENCE_RECORDED",
      detail,
      reviewStatus: "UNVERIFIED",
    });
    return { disposition: "EVIDENCE_RECORDED" as const, applicationId: row.id, ledgerEntryId: null, duplicate: false, reasons: [detail] };
  });
}

/**
 * The CFO queue read: every ERP add-back evidence item for a company,
 * oldest first. Only EVIDENCE_RECORDED rows are evidence — UNMATCHED /
 * CONFLICT / REJECTED rows surface through listErpFactApplications
 * instead. Nothing returned here feeds any computation.
 */
export async function listErpAddbackEvidence(db: ErpApplicationDb, companyId: string): Promise<ErpAddbackEvidenceItem[]> {
  const rows = await db.erpFactApplication.findMany({
    where: { companyId, kind: "EBITDA_ADDBACK_EVIDENCE", disposition: "EVIDENCE_RECORDED" },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => {
    const fact = (row.payload ?? {}) as Partial<ErpNormalizedFact>;
    return {
      applicationId: row.id,
      companyId: row.companyId,
      addbackCategory: typeof fact.addbackCategory === "string" ? fact.addbackCategory : "",
      amount: amountToNumber(row.amount as number | { toNumber(): number } | null),
      currency: row.currency,
      asOf: row.asOf ? row.asOf.toISOString() : typeof fact.asOf === "string" ? fact.asOf : null,
      periodStart: typeof fact.periodStart === "string" ? fact.periodStart : null,
      periodEnd: typeof fact.periodEnd === "string" ? fact.periodEnd : null,
      status: "UNCONFIRMED" as const,
      reviewStatus: "UNVERIFIED" as const,
      provenance: {
        source: "ERP" as const,
        connectionId: row.connectionId,
        externalId: row.externalId,
        factKey: row.factKey,
      },
    };
  });
}
