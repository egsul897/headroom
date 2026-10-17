/**
 * ERP application layer — shared core.
 *
 * Validation, tenant/connection checks, and the idempotency protocol
 * every ERP fact goes through before it touches product state. The
 * protocol, in order:
 *
 *  1. Keyability: a fact without connectionId/externalId cannot be
 *     audited against the unique (companyId, connectionId, externalId)
 *     key, so it is REJECTED with no row — there is nothing durable to
 *     attach the refusal to.
 *  2. Re-delivery of a recorded key:
 *     - identical payload (canonical-hash equal, same kind): a
 *       DUPLICATE. deliveryCount bumps on the existing row; no second
 *       ledger write, ever. (A prior REJECTED row is the one exception:
 *       a refusal committed nothing, so an identical re-delivery is
 *       re-processed — e.g. the connection was registered after the
 *       first attempt.)
 *     - different payload or different kind: a CONFLICT. Fail closed —
 *       the row flips to CONFLICT with the new payload preserved in
 *       conflictPayload; no new ledger write; an earlier application is
 *       left in place (never silently unwound) and named in the detail
 *       for a human to resolve.
 *  3. Fresh fact: validated fail-closed (shape, amount, tenant,
 *     connection ownership) before any matching or writing.
 */

import { createHash } from "node:crypto";
import type {
  ErpApplicationDb,
  ErpApplicationResult,
  ErpDisposition,
  ErpFactApplicationRow,
  ErpFactKind,
  ErpNormalizedFact,
} from "./types";

/** Run `fn` inside the client's transaction when it offers one; the writes of one application must land together or not at all. */
export async function withErpTx<T>(db: ErpApplicationDb, fn: (tx: ErpApplicationDb) => Promise<T>): Promise<T> {
  return db.$transaction ? db.$transaction(fn) : fn(db);
}

/** Canonical JSON: recursively key-sorted, undefined dropped. Two deliveries are "identical" iff their canonical forms hash equal. */
export function canonicalFactJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalFactJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalFactJson(v)}`).join(",")}}`;
}

export function factPayloadHash(fact: ErpNormalizedFact): string {
  return createHash("sha256").update(canonicalFactJson(fact), "utf8").digest("hex");
}

export function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim() === "";
}

export function parseFactDate(iso: string): Date | null {
  if (isBlank(iso)) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shape/amount/date problems that refuse a fact before tenant checks. Empty array = well-formed. */
export function validateCommonFact(fact: ErpNormalizedFact): string[] {
  const problems: string[] = [];
  if (fact.source !== "ERP") problems.push(`source must be "ERP", got ${JSON.stringify(fact.source)}`);
  if (isBlank(fact.companyId)) problems.push("companyId is missing");
  if (isBlank(fact.connectionId)) problems.push("connectionId is missing");
  if (isBlank(fact.externalId)) problems.push("externalId is missing");
  if (isBlank(fact.factKey)) problems.push("factKey is missing");
  if (typeof fact.amount !== "number" || !Number.isFinite(fact.amount) || fact.amount <= 0) {
    problems.push(`amount must be a finite number > 0, got ${JSON.stringify(fact.amount)}`);
  }
  if (isBlank(fact.currency)) problems.push("currency is missing");
  if (!parseFactDate(fact.asOf)) problems.push(`asOf is not a valid ISO date: ${JSON.stringify(fact.asOf)}`);
  return problems;
}

/**
 * Tenant + connection ownership. A fact is only ever applied to the
 * company the call is scoped to, and only over a connection that
 * belongs to that same company. Anything else is a cross-company
 * delivery and is refused — ERP data never crosses tenants.
 */
export async function validateFactTenancy(
  db: ErpApplicationDb,
  companyId: string,
  fact: ErpNormalizedFact,
): Promise<string[]> {
  const problems: string[] = [];
  if (!isBlank(fact.companyId) && fact.companyId !== companyId) {
    problems.push(`fact claims company ${fact.companyId} but was delivered for company ${companyId}`);
  }
  if (!isBlank(fact.connectionId)) {
    const connection = await db.companySourceConnection.findUnique({ where: { id: fact.connectionId } });
    if (!connection) {
      problems.push(`connection ${fact.connectionId} is not a registered source connection`);
    } else if (connection.companyId !== companyId) {
      problems.push(`connection ${fact.connectionId} belongs to a different company`);
    }
  }
  return problems;
}

export type BeginOutcome =
  | { action: "process"; existing: ErpFactApplicationRow | null }
  | { action: "done"; result: ErpApplicationResult };

/**
 * The idempotency preamble. Runs inside the caller's transaction.
 * `existing` on a "process" outcome is a prior REJECTED row to
 * overwrite in place (its key is already reserved), else null.
 */
export async function beginErpFactApplication(
  db: ErpApplicationDb,
  companyId: string,
  kind: ErpFactKind,
  fact: ErpNormalizedFact,
): Promise<BeginOutcome> {
  if (isBlank(fact.connectionId) || isBlank(fact.externalId)) {
    return {
      action: "done",
      result: {
        disposition: "REJECTED",
        applicationId: null,
        ledgerEntryId: null,
        duplicate: false,
        reasons: ["connectionId and externalId are required to record an ERP fact; without them the delivery cannot be audited or deduplicated. Refused."],
      },
    };
  }

  const existing = await db.erpFactApplication.findUnique({
    where: { companyId_connectionId_externalId: { companyId, connectionId: fact.connectionId, externalId: fact.externalId } },
  });
  if (!existing) return { action: "process", existing: null };

  const hash = factPayloadHash(fact);
  if (existing.payloadHash === hash && existing.kind === kind) {
    if (existing.disposition === "REJECTED") {
      // A refusal committed nothing; let the re-delivery be re-processed.
      return { action: "process", existing };
    }
    await db.erpFactApplication.update({
      where: { id: existing.id },
      data: { deliveryCount: existing.deliveryCount + 1, lastDeliveredAt: new Date() },
    });
    return {
      action: "done",
      result: {
        disposition: existing.disposition,
        applicationId: existing.id,
        ledgerEntryId: existing.ledgerEntryId,
        duplicate: true,
        reasons: [`Identical re-delivery of ERP fact ${fact.externalId} (delivery #${existing.deliveryCount + 1}); already recorded as ${existing.disposition}. No state written twice.`],
      },
    };
  }

  const kindNote = existing.kind !== kind ? ` It was first delivered as ${existing.kind}, now as ${kind}.` : "";
  const appliedNote = existing.ledgerEntryId
    ? ` The earlier application wrote ledger entry ${existing.ledgerEntryId}, which is left in place — resolve the conflict before relying on it.`
    : "";
  const detail =
    `Conflicting re-delivery: external id ${fact.externalId} on connection ${fact.connectionId} was already recorded with a different payload ` +
    `(was ${existing.disposition}). The new payload is preserved on this row as conflictPayload; nothing new was applied.${kindNote}${appliedNote}`;
  await db.erpFactApplication.update({
    where: { id: existing.id },
    data: { disposition: "CONFLICT", conflictPayload: fact as unknown as object, detail, deliveryCount: existing.deliveryCount + 1, lastDeliveredAt: new Date() },
  });
  return {
    action: "done",
    result: { disposition: "CONFLICT", applicationId: existing.id, ledgerEntryId: existing.ledgerEntryId, duplicate: false, reasons: [detail] },
  };
}

export interface ErpRowWrite {
  disposition: ErpDisposition;
  detail: string;
  ledgerEntryId?: string | null;
  matchedProvisionId?: string | null;
  matchedPermissionId?: string | null;
  matchedDocumentId?: string | null;
  reviewStatus?: string | null;
}

/** Create the audit row for a fresh fact, or overwrite a prior REJECTED row in place. */
export async function writeErpApplicationRow(
  db: ErpApplicationDb,
  companyId: string,
  kind: ErpFactKind,
  fact: ErpNormalizedFact,
  existing: ErpFactApplicationRow | null,
  write: ErpRowWrite,
): Promise<ErpFactApplicationRow> {
  const asOf = parseFactDate(fact.asOf);
  const data = {
    companyId,
    connectionId: fact.connectionId,
    externalId: fact.externalId,
    kind,
    disposition: write.disposition,
    factKey: fact.factKey,
    payload: fact as unknown as object,
    payloadHash: factPayloadHash(fact),
    amount: typeof fact.amount === "number" && Number.isFinite(fact.amount) ? fact.amount : null,
    currency: isBlank(fact.currency) ? null : fact.currency,
    asOf,
    ledgerEntryId: write.ledgerEntryId ?? null,
    matchedProvisionId: write.matchedProvisionId ?? null,
    matchedPermissionId: write.matchedPermissionId ?? null,
    matchedDocumentId: write.matchedDocumentId ?? null,
    reviewStatus: write.reviewStatus ?? null,
    detail: write.detail,
    conflictPayload: null,
    lastDeliveredAt: new Date(),
  };
  if (existing) {
    return db.erpFactApplication.update({ where: { id: existing.id }, data: { ...data, deliveryCount: existing.deliveryCount + 1 } });
  }
  return db.erpFactApplication.create({ data });
}

/** Surfacing read: every recorded application for a company, optionally narrowed to one disposition (UNMATCHED / CONFLICT queues). */
export async function listErpFactApplications(
  db: ErpApplicationDb,
  companyId: string,
  disposition?: ErpDisposition,
): Promise<ErpFactApplicationRow[]> {
  return db.erpFactApplication.findMany({
    where: disposition ? { companyId, disposition } : { companyId },
    orderBy: { createdAt: "asc" },
  });
}
