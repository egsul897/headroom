/**
 * ERP financial-facts ingestion (ERP-1 push path).
 *
 * One delivery = one ErpFinancialFactsPayload (lib/erp/types.ts) posted by
 * an ERP or middleware to one connection. This function is the whole
 * pipeline; the HTTP route is a thin wrapper. Steps, in order:
 *
 *   1. AUTHENTICATE - the connection (from the URL, never from the body)
 *      must exist, be an ERP connection, be enabled, and the presented
 *      token must hash-match CompanySourceConnection.inboundSecretHash
 *      (lib/erp/secret.ts). Company scope comes FROM the connection row:
 *      a token can only ever write its own company's data. Failures are
 *      audited (when a connection was identified) and refused.
 *   2. VALIDATE SHAPE - malformed payloads are refused as a whole
 *      (REFUSED_VALIDATION) with the raw body retained on the audit row.
 *      Shape errors are contract violations; MEANING problems (unmapped
 *      key, incompatible unit, conflicting value) are per-fact outcomes,
 *      never whole-delivery refusals.
 *   3. IDEMPOTENCY - (connectionId, idempotencyKey) was already processed:
 *      identical payload hash -> DUPLICATE, a no-op that returns the
 *      original outcome; different payload -> REFUSED_IDEMPOTENCY_MISMATCH,
 *      the original stands. Both are audited as their own event rows.
 *   4. STAGE + PROMOTE - every fact is written to ErpFinancialFact with its
 *      full provenance BEFORE promotion is attempted (nothing is ever only
 *      in flight). Promotable facts for the delivery's (connection,
 *      asOfDate) - this delivery's PLUS any still-withheld facts from
 *      earlier deliveries for the same date (a real-time feed posts
 *      incrementally; the union is the batch, exactly the rationale
 *      lib/onboarding/financial.ts documents for batching) - go through
 *      upsertFinancialFactsForDate, the SAME writer the manual and
 *      promotion paths use. No parallel writer exists.
 *
 * IDENTITY SAFETY - inherited from that writer, not re-implemented:
 * promotion resolves (companyId, asOfDate) through
 * resolveCanonicalFinancialIdentity; duplicate same-date rows resolve
 * AMBIGUOUS and fail closed; a value that disagrees with the existing
 * same-date canonical row is CONFLICTING_FINANCIAL_FACTS (refused, fact
 * marked CONFLICT, needs-attention) - a restatement NEVER silently
 * supersedes, and an identical value corroborates without a rewrite.
 * This module therefore can never create a second same-date FinancialState:
 * the worst an ERP delivery can do to canonical state is create the ONE
 * row for a new date (only when the union of staged facts covers every
 * required field) or leave everything untouched.
 *
 * Steps 4's writes (event, facts, canonical rows, cursor) run in ONE
 * transaction: a delivery is applied atomically or not at all, while its
 * audit row commits with it - an event row is never visible in a
 * provisional state outside the transaction.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { computeContentHash } from "../connectors/dedup";
import {
  CANONICAL_UNIT_BY_METRIC,
  FINANCIAL_UNITS,
  IncompatibleUnitError,
  normalizeFinancialValue,
  UnrecognizedMetricError,
  type FinancialUnit,
} from "../connectors/units";
import { CONFLICTING_FINANCIAL_FACTS, FINANCIAL_METRIC_FIELD_MAP, upsertFinancialFactsForDate } from "../onboarding/financial";
import { FINANCIAL_IDENTITY_AMBIGUOUS } from "../financial-identity";
import { verifyErpSecret } from "./secret";
import { storeErpSyncCursor } from "./connections";
import type { ErpFinancialFactInput, ErpFinancialFactsPayload, ErpIngestionResult } from "./types";

const ZERO_COUNTS = { applied: 0, conflicted: 0, unmapped: 0, withheld: 0 };

// ---------------------------------------------------------------------------
// Payload shape validation
// ---------------------------------------------------------------------------

/**
 * Structural validation ONLY (see this file's header for the shape/meaning
 * split): the payload must be an object with a parseable asOfDate and a
 * non-empty facts array whose entries carry a non-empty string key, a
 * finite numeric value, and a declared unit from FINANCIAL_UNITS.
 */
export function parseErpPayload(raw: unknown): { ok: true; payload: ErpFinancialFactsPayload; asOfDate: Date } | { ok: false; detail: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, detail: "Payload is not a JSON object." };
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.asOfDate !== "string" || !p.asOfDate) {
    return { ok: false, detail: "Payload.asOfDate is missing or not a string - every delivery describes exactly one period/as-of date." };
  }
  const asOfDate = parseAsOfDate(p.asOfDate);
  if (!asOfDate) {
    return { ok: false, detail: `Payload.asOfDate "${p.asOfDate}" is not a valid ISO date.` };
  }
  if (p.externalEventId !== undefined && typeof p.externalEventId !== "string") {
    return { ok: false, detail: "Payload.externalEventId must be a string when provided." };
  }
  if (!Array.isArray(p.facts) || p.facts.length === 0) {
    return { ok: false, detail: "Payload.facts must be a non-empty array - an empty delivery carries no information and is refused rather than audited as a success." };
  }
  for (let i = 0; i < p.facts.length; i++) {
    const f = p.facts[i] as Record<string, unknown> | null;
    if (!f || typeof f !== "object" || Array.isArray(f)) return { ok: false, detail: `facts[${i}] is not an object.` };
    if (typeof f.key !== "string" || !f.key.trim()) return { ok: false, detail: `facts[${i}].key is missing or empty - the ERP-side key is required verbatim.` };
    if (typeof f.value !== "number" || !Number.isFinite(f.value)) return { ok: false, detail: `facts[${i}] ("${String(f.key)}").value must be a finite number.` };
    if (typeof f.unit !== "string" || !(FINANCIAL_UNITS as readonly string[]).includes(f.unit)) {
      return { ok: false, detail: `facts[${i}] ("${String(f.key)}").unit must be one of ${FINANCIAL_UNITS.join(", ")} - units are declared, never inferred.` };
    }
    if (f.externalId !== undefined && typeof f.externalId !== "string") return { ok: false, detail: `facts[${i}].externalId must be a string when provided.` };
    if (f.label !== undefined && typeof f.label !== "string") return { ok: false, detail: `facts[${i}].label must be a string when provided.` };
  }
  return { ok: true, payload: p as unknown as ErpFinancialFactsPayload, asOfDate };
}

/** Bare ISO dates land at UTC midnight (the manual path's convention); full timestamps keep their instant. Impossible dates (2026-02-31) are rejected, never rolled over. */
function parseAsOfDate(raw: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10) === raw ? d : null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Key resolution + normalization (pure)
// ---------------------------------------------------------------------------

/**
 * The ONLY two mapping authorities: the key already IS a canonical metric
 * name, or the connection's human-provisioned config.metricKeyMap says so.
 * Returns null for unmapped - callers must surface, never guess.
 */
export function resolveCanonicalMetric(sourceKey: string, metricKeyMap: Record<string, string> | undefined): string | null {
  if (sourceKey in CANONICAL_UNIT_BY_METRIC) return sourceKey;
  const mapped = metricKeyMap?.[sourceKey];
  if (mapped && mapped in CANONICAL_UNIT_BY_METRIC) return mapped;
  return null;
}

interface StagedFact {
  input: ErpFinancialFactInput;
  canonicalMetric: string | null;
  canonicalField: string | null;
  normalizedValue: number | null;
  /** Terminal-at-staging status, or "PENDING_PROMOTION" for facts the canonical writer will adjudicate. */
  status: "PENDING_PROMOTION" | "UNMAPPED" | "NOT_PROMOTABLE" | "REFUSED";
  detail: string | null;
}

function stageFact(input: ErpFinancialFactInput, metricKeyMap: Record<string, string> | undefined): StagedFact {
  const canonicalMetric = resolveCanonicalMetric(input.key, metricKeyMap);
  if (!canonicalMetric) {
    return { input, canonicalMetric: null, canonicalField: null, normalizedValue: null, status: "UNMAPPED", detail: `Source key "${input.key}" maps to no canonical metric (not a canonical metric name, no config.metricKeyMap entry). Stored verbatim; never guessed into a canonical field.` };
  }
  let normalizedValue: number;
  try {
    const normalized = normalizeFinancialValue(canonicalMetric, input.value, input.unit as FinancialUnit);
    if (!normalized.withinSanityBounds) {
      return {
        input,
        canonicalMetric,
        canonicalField: null,
        normalizedValue: null,
        status: "REFUSED",
        detail: `Value ${input.value} ${input.unit} for "${canonicalMetric}" normalizes to ${normalized.normalizedValue} ${normalized.canonicalUnit}, outside the sanity ceiling for that unit (${normalized.sanityNote ?? "see lib/connectors/units.ts"}). Refused rather than promoted - a unit-scale error must never reach canonical state silently.`,
      };
    }
    normalizedValue = normalized.normalizedValue;
  } catch (err) {
    if (err instanceof IncompatibleUnitError || err instanceof UnrecognizedMetricError) {
      return { input, canonicalMetric, canonicalField: null, normalizedValue: null, status: "REFUSED", detail: err.message };
    }
    throw err;
  }
  const canonicalField = FINANCIAL_METRIC_FIELD_MAP[canonicalMetric] ?? null;
  if (!canonicalField) {
    return {
      input,
      canonicalMetric,
      canonicalField: null,
      normalizedValue,
      status: "NOT_PROMOTABLE",
      detail: `Metric "${canonicalMetric}" is recognized but deliberately has no canonical FinancialSnapshot/FinancialState field (see lib/connectors/units.ts) - stored as evidence, never promoted into the capacity engine.`,
    };
  }
  return { input, canonicalMetric, canonicalField, normalizedValue, status: "PENDING_PROMOTION", detail: null };
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export interface IngestErpFinancialFactsParams {
  connectionId: string;
  /** The raw request body, byte-for-byte as received - hashed verbatim for the payload hash / idempotency comparison. */
  rawBody: string;
  presentedToken: string | null;
  /** Idempotency-Key header value; falls back to a string `idempotencyKey` field in the payload body. */
  idempotencyKey?: string | null;
  client?: PrismaClient;
}

export async function ingestErpFinancialFacts(params: IngestErpFinancialFactsParams): Promise<ErpIngestionResult> {
  const client = params.client ?? prisma;
  const payloadHash = computeContentHash(Buffer.from(params.rawBody, "utf8"));

  const connection = await client.companySourceConnection.findUnique({ where: { id: params.connectionId } });
  if (!connection || connection.connectorType !== "ERP") {
    return { ok: false, status: 404, eventId: null, outcome: "NOT_FOUND", detail: "No ERP connection with that id.", counts: ZERO_COUNTS };
  }
  const companyId = connection.companyId;

  const auditRefusal = async (
    outcome: "REFUSED_AUTH" | "REFUSED_VALIDATION" | "REFUSED_IDEMPOTENCY_MISMATCH",
    detail: string,
    status: number,
    extra?: { payload?: Prisma.InputJsonValue | null; duplicateOfEventId?: string; originalEventId?: string },
  ): Promise<ErpIngestionResult> => {
    const event = await client.erpSyncEvent.create({
      data: {
        companyId,
        connectionId: connection.id,
        provider: connection.provider,
        payloadHash,
        payload: extra?.payload ?? undefined,
        outcome,
        detail,
        needsAttention: outcome === "REFUSED_IDEMPOTENCY_MISMATCH",
        duplicateOfEventId: extra?.duplicateOfEventId ?? null,
      },
    });
    return { ok: false, status, eventId: event.id, originalEventId: extra?.originalEventId, outcome, detail, counts: ZERO_COUNTS };
  };

  // 1. Authenticate. A disabled connection refuses even with a valid token -
  // disabling is the operator's kill switch and must not depend on rotation.
  if (!connection.enabled || connection.status === "DISCONNECTED" || !verifyErpSecret(params.presentedToken, connection.inboundSecretHash)) {
    const detail = !connection.enabled
      ? "Connection is disabled - ingestion refused (re-enable the connection to resume)."
      : connection.status === "DISCONNECTED"
        ? "Connection status is DISCONNECTED - ingestion refused."
        : "Missing or invalid ingestion token for this connection.";
    return auditRefusal("REFUSED_AUTH", detail, 401);
  }

  // 2. Parse + validate shape.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(params.rawBody);
  } catch {
    return auditRefusal("REFUSED_VALIDATION", "Request body is not valid JSON.", 400);
  }
  const parsed = parseErpPayload(parsedJson);
  if (!parsed.ok) {
    return auditRefusal("REFUSED_VALIDATION", parsed.detail, 400, { payload: parsedJson as Prisma.InputJsonValue });
  }
  const { payload, asOfDate } = parsed;

  const idempotencyKey =
    params.idempotencyKey ?? (typeof (parsedJson as Record<string, unknown>).idempotencyKey === "string" ? ((parsedJson as Record<string, string>).idempotencyKey as string) : null);

  // 3. Idempotency.
  if (idempotencyKey) {
    const prior = await client.erpSyncEvent.findUnique({
      where: { connectionId_idempotencyKey: { connectionId: connection.id, idempotencyKey } },
    });
    if (prior) {
      if (prior.payloadHash === payloadHash) {
        const event = await client.erpSyncEvent.create({
          data: {
            companyId,
            connectionId: connection.id,
            provider: connection.provider,
            externalEventId: payload.externalEventId ?? null,
            payloadHash,
            payload: parsedJson as Prisma.InputJsonValue,
            outcome: "DUPLICATE",
            detail: `Re-delivery of event ${prior.id} with an identical payload - no-op; the original outcome stands.`,
            duplicateOfEventId: prior.id,
            appliedCount: prior.appliedCount,
            conflictCount: prior.conflictCount,
            unmappedCount: prior.unmappedCount,
            withheldCount: prior.withheldCount,
          },
        });
        return {
          ok: true,
          status: 200,
          eventId: event.id,
          originalEventId: prior.id,
          outcome: "DUPLICATE",
          detail: `Re-delivery of event ${prior.id} with an identical payload - no-op; the original outcome stands.`,
          counts: { applied: prior.appliedCount, conflicted: prior.conflictCount, unmapped: prior.unmappedCount, withheld: prior.withheldCount },
        };
      }
      return auditRefusal(
        "REFUSED_IDEMPOTENCY_MISMATCH",
        `Idempotency key "${idempotencyKey}" was already used for event ${prior.id} with a DIFFERENT payload. The original delivery stands; this one applied nothing. Re-deliver the original payload, or use a new idempotency key for a genuinely new delivery.`,
        409,
        { payload: parsedJson as Prisma.InputJsonValue, duplicateOfEventId: prior.id, originalEventId: prior.id },
      );
    }
  }

  // 4. Stage + promote, atomically.
  const config = (connection.config as { metricKeyMap?: Record<string, string> } | null) ?? {};
  const result = await client.$transaction(async (tx) => {
    const event = await tx.erpSyncEvent.create({
      data: {
        companyId,
        connectionId: connection.id,
        provider: connection.provider,
        externalEventId: payload.externalEventId ?? null,
        idempotencyKey: idempotencyKey ?? null,
        payloadHash,
        payload: parsedJson as Prisma.InputJsonValue,
        outcome: "WITHHELD", // provisional - finalized below, before commit; never visible outside this transaction
      },
    });

    const staged = payload.facts.map((fact) => stageFact(fact, config.metricKeyMap));
    const factRows = [];
    for (const s of staged) {
      factRows.push(
        await tx.erpFinancialFact.create({
          data: {
            companyId,
            connectionId: connection.id,
            syncEventId: event.id,
            externalId: s.input.externalId ?? null,
            sourceKey: s.input.key,
            sourceLabel: s.input.label ?? null,
            asOfDate,
            declaredUnit: s.input.unit,
            declaredValue: s.input.value,
            canonicalMetric: s.canonicalMetric,
            canonicalField: s.canonicalField,
            normalizedValue: s.normalizedValue,
            status: s.status === "PENDING_PROMOTION" ? "WITHHELD_INCOMPLETE" : s.status,
            detail: s.detail,
          },
        }),
      );
    }

    // The promotion batch: every still-pending promotable fact for this
    // (connection, asOfDate) - this delivery's plus earlier deliveries'
    // withheld ones. Facts are adjudicated by the canonical writer as one
    // batch (see this file's header for why the union is the batch).
    const pending = await tx.erpFinancialFact.findMany({
      where: { connectionId: connection.id, asOfDate, status: "WITHHELD_INCOMPLETE", canonicalMetric: { not: null } },
      orderBy: { createdAt: "asc" },
    });

    if (pending.length > 0) {
      const promotion = await upsertFinancialFactsForDate(
        companyId,
        asOfDate,
        pending.map((f) => ({ key: f.id, metricName: f.canonicalMetric!, value: Number(f.normalizedValue) })),
        `ERP ingestion via connection ${connection.id} (${connection.provider})${payload.externalEventId ? `, external event ${payload.externalEventId}` : ""}, sync event ${event.id}`,
        tx,
      );
      const byKey = new Map(promotion.perFact.map((p) => [p.key, p]));
      for (const fact of pending) {
        const outcome = byKey.get(fact.id);
        if (!outcome) continue;
        if (outcome.applied) {
          await tx.erpFinancialFact.update({
            where: { id: fact.id },
            data: { status: "APPLIED", detail: null, financialSnapshotId: outcome.financialSnapshotId ?? null, financialStateId: outcome.financialStateId ?? null },
          });
        } else if (outcome.skipReason && (outcome.skipReason.includes(CONFLICTING_FINANCIAL_FACTS) || outcome.skipReason.includes(FINANCIAL_IDENTITY_AMBIGUOUS))) {
          await tx.erpFinancialFact.update({ where: { id: fact.id }, data: { status: "CONFLICT", detail: outcome.skipReason } });
        } else {
          // The canonical writer withheld the batch (incomplete coverage of
          // a new date): the fact stays WITHHELD_INCOMPLETE with the reason
          // recorded, and is retried by the next delivery for this date.
          await tx.erpFinancialFact.update({ where: { id: fact.id }, data: { detail: outcome.skipReason ?? null } });
        }
      }
    }

    const finalFacts = await tx.erpFinancialFact.findMany({ where: { syncEventId: event.id } });
    const applied = finalFacts.filter((f) => f.status === "APPLIED").length;
    const conflicted = finalFacts.filter((f) => f.status === "CONFLICT").length;
    const refused = finalFacts.filter((f) => f.status === "REFUSED").length;
    const unmapped = finalFacts.filter((f) => f.status === "UNMAPPED" || f.status === "NOT_PROMOTABLE").length;
    const withheld = finalFacts.filter((f) => f.status === "WITHHELD_INCOMPLETE").length;

    let outcome: ErpIngestionResult["outcome"];
    let detail: string;
    if (conflicted > 0 || refused > 0) {
      outcome = applied > 0 ? "PARTIALLY_APPLIED" : "NEEDS_ATTENTION";
      detail = `Delivery processed with items needing attention: ${applied} applied, ${conflicted} conflicted (fail closed - no winner picked), ${refused} refused, ${unmapped} unmapped/not-promotable, ${withheld} withheld. See this event's facts for per-item reasons.`;
    } else if (applied > 0) {
      outcome = "APPLIED";
      detail = `${applied} fact(s) applied to canonical financial state for ${asOfDate.toISOString().slice(0, 10)}${pending.length > applied ? ` (the promotion batch held ${pending.length} pending facts for this date, including earlier deliveries' withheld facts)` : ""}. ${unmapped} unmapped/not-promotable, ${withheld} withheld.`;
    } else if (withheld > 0) {
      outcome = "WITHHELD";
      detail = `No canonical row exists for ${asOfDate.toISOString().slice(0, 10)} and the pending fact set does not yet cover every required field - facts are staged and will be promoted when a later delivery for this date completes the set. Nothing was fabricated and no prior date was copied. ${unmapped} unmapped/not-promotable.`;
    } else {
      outcome = "NEEDS_ATTENTION";
      detail = `Delivery carried no promotable facts (${unmapped} unmapped/not-promotable). Facts are stored verbatim with provenance; map their keys via the connection's metricKeyMap to make them promotable.`;
    }
    const needsAttention = conflicted > 0 || refused > 0 || unmapped > 0;

    await tx.erpSyncEvent.update({
      where: { id: event.id },
      data: { outcome, detail, needsAttention, appliedCount: applied, conflictCount: conflicted, unmappedCount: unmapped, withheldCount: withheld },
    });

    // Push-path cursor convention (lib/erp/types.ts): an accepted delivery
    // advances the cursor to its external event id. Refused deliveries
    // never reach this point.
    if (payload.externalEventId) {
      await storeErpSyncCursor({ connectionId: connection.id, cursor: payload.externalEventId }, tx);
    }

    return {
      ok: true,
      status: conflicted > 0 || refused > 0 ? 409 : 200,
      eventId: event.id,
      outcome,
      detail,
      counts: { applied, conflicted, unmapped, withheld },
    } satisfies ErpIngestionResult;
  });

  return result;
}
