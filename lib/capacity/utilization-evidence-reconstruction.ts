/**
 * HEADROOM-9 — historical utilization reconstruction → Agent #2 utilization evidence.
 *
 * Builds reproducible attributed usage from historical transaction evidence
 * (issuances, liens, restricted payments, investments, asset sales,
 * reclassifications, repayments, amendments, ledger rows) without inventing
 * unobserved zeros.
 *
 * Completeness layers are separated:
 *   EVIDENCE_OBSERVED / USAGE_ATTRIBUTED / USAGE_UNALLOCATED /
 *   UNKNOWN_HISTORICAL_ACTIVITY / REVIEWER_CONFIRMED_COMPLETENESS
 *
 * Only a trusted authorized completeness certificate (Agent #2 / utilization
 * authority path) may establish REVIEWER_CONFIRMED_COMPLETENESS for remaining.
 */

import { evidenceFromAttributedLedger } from "./utilization-resolver";
import type {
  UtilizationCompletenessCertificate,
  UtilizationEvidenceRecord,
  UtilizationRecordKind,
} from "./utilization-types";

/** Historical activity kinds that may feed utilization attribution. */
export type HistoricalUtilizationEventKind =
  | "DEBT_ISSUANCE"
  | "LIEN"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "ASSET_SALE"
  | "RECLASSIFICATION"
  | "REPAYMENT"
  | "AMENDMENT"
  | "LEDGER_EVIDENCE";

export type SupersessionTreatment =
  | "NONE"
  | "SUPERSEDES_PRIOR"
  | "SUPERSEDED_BY_SUCCESSOR"
  | "RECLASSIFIED_AWAY"
  | "RECLASSIFIED_INTO";

/** One observed historical transaction / ledger fact (source-backed). */
export interface HistoricalUtilizationEvent {
  eventId: string;
  kind: HistoricalUtilizationEventKind;
  /** Signed amount in event currency (repayments typically negative or tagged). */
  amount: number;
  currency: string;
  effectiveDate: string;
  /** Applicable provision / permission / rule id when known. */
  applicableProvisionId: string | null;
  sharedCapacityId?: string | null;
  entityKey: string;
  sourceLabel: string;
  authenticity: "AUTHENTIC" | "SYNTHETIC_LABELED";
  approvalState: "APPROVED" | "UNAPPROVED" | "UNKNOWN";
  supersession: SupersessionTreatment;
  /** Prior event id when this event supersedes or reclassifies another. */
  supersedesEventId?: string | null;
  /** Optional legacy basket family when provision attribution is unavailable. */
  legacyBasketFamily?: string | null;
  notes?: string | null;
}

export type UtilizationCompletenessLayer =
  | "EVIDENCE_OBSERVED"
  | "USAGE_ATTRIBUTED"
  | "USAGE_UNALLOCATED"
  | "UNKNOWN_HISTORICAL_ACTIVITY"
  | "REVIEWER_CONFIRMED_COMPLETENESS";

export interface UtilizationReconstructionInput {
  companyId: string;
  capacityRuleId: string;
  asOf: string;
  currency: string;
  events: readonly HistoricalUtilizationEvent[];
  /**
   * Affirmative completeness certificate from a trusted authorized approver.
   * Without this, REVIEWER_CONFIRMED_COMPLETENESS is never claimed.
   */
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  /**
   * When true, reconstruction acknowledges that the event set may omit
   * historical activity (default true — unobserved ≠ zero).
   */
  acknowledgeUnknownHistory?: boolean;
}

export interface AttributedUtilizationUsage {
  usageId: string;
  amount: number;
  date: string;
  applicableProvision: string | null;
  source: string;
  entity: string;
  currency: string;
  supersessionTreatment: SupersessionTreatment;
  eventKind: HistoricalUtilizationEventKind;
  record: UtilizationEvidenceRecord;
}

export interface UtilizationReconstructionResult {
  ok: boolean;
  companyId: string;
  capacityRuleId: string;
  asOf: string;
  /** Completeness layers present on this reconstruction. */
  layers: UtilizationCompletenessLayer[];
  evidenceObserved: HistoricalUtilizationEvent[];
  usageAttributed: AttributedUtilizationUsage[];
  usageUnallocated: HistoricalUtilizationEvent[];
  unknownHistoricalActivity: boolean;
  reviewerConfirmedCompleteness: boolean;
  /** Records ready for Agent #2 resolveUtilization / verified-input handoff. */
  utilizationRecords: UtilizationEvidenceRecord[];
  completenessCertificate: UtilizationCompletenessCertificate | null;
  blockers: string[];
  note: string;
  /** Reproducible reconstruction trace. */
  trace: readonly UtilizationReconstructionTraceEntry[];
}

export interface UtilizationReconstructionTraceEntry {
  eventId: string | null;
  stage: UtilizationCompletenessLayer | "REFUSED" | "SUPERSEDED_EXCLUDED";
  detail: string;
}

function mapKindToRecordKind(
  event: HistoricalUtilizationEvent,
): UtilizationRecordKind {
  if (event.supersession === "SUPERSEDED_BY_SUCCESSOR") return "SUPERSEDED";
  if (event.supersession === "RECLASSIFIED_AWAY") return "RECLASSIFICATION_SOURCE";
  if (event.supersession === "RECLASSIFIED_INTO") return "RECLASSIFICATION_DESTINATION";
  if (event.sharedCapacityId) return "ATTRIBUTED_SHARED_POOL";
  if (event.applicableProvisionId) return "ATTRIBUTED_RULE";
  if (event.legacyBasketFamily) return "LEGACY_BASKET_FAMILY";
  return "ATTRIBUTED_RULE";
}

function mapStatus(
  event: HistoricalUtilizationEvent,
): UtilizationEvidenceRecord["status"] {
  if (event.supersession === "SUPERSEDED_BY_SUCCESSOR") return "SUPERSEDED";
  if (
    event.supersession === "RECLASSIFIED_AWAY" ||
    event.supersession === "RECLASSIFIED_INTO"
  ) {
    return "RECLASSIFICATION_ELECTION";
  }
  return "ACTIVE";
}

/**
 * Reconstruct attributed utilization evidence from historical events.
 * Never infers that unobserved usage equals zero.
 */
export function reconstructUtilizationEvidence(
  input: UtilizationReconstructionInput,
): UtilizationReconstructionResult {
  const blockers: string[] = [];
  const trace: UtilizationReconstructionTraceEntry[] = [];
  const acknowledgeUnknown = input.acknowledgeUnknownHistory !== false;

  const evidenceObserved = [...input.events];
  for (const e of evidenceObserved) {
    trace.push({
      eventId: e.eventId,
      stage: "EVIDENCE_OBSERVED",
      detail: `${e.kind} ${e.amount} ${e.currency} @ ${e.effectiveDate} source=${e.sourceLabel}`,
    });
  }

  const usageAttributed: AttributedUtilizationUsage[] = [];
  const usageUnallocated: HistoricalUtilizationEvent[] = [];
  const utilizationRecords: UtilizationEvidenceRecord[] = [];

  // Index supersession successors so superseded events are excluded from attributed usage.
  const supersededIds = new Set(
    evidenceObserved
      .filter((e) => e.supersedesEventId && e.supersession === "SUPERSEDES_PRIOR")
      .map((e) => e.supersedesEventId!),
  );

  for (const event of evidenceObserved) {
    if (event.currency !== input.currency) {
      blockers.push(
        `event ${event.eventId} currency "${event.currency}" ≠ reconstruction currency "${input.currency}"`,
      );
      usageUnallocated.push(event);
      trace.push({
        eventId: event.eventId,
        stage: "USAGE_UNALLOCATED",
        detail: "currency mismatch — not attributed",
      });
      continue;
    }

    if (event.entityKey.trim() === "") {
      blockers.push(`event ${event.eventId} missing entity`);
      usageUnallocated.push(event);
      trace.push({
        eventId: event.eventId,
        stage: "USAGE_UNALLOCATED",
        detail: "missing entity",
      });
      continue;
    }

    if (supersededIds.has(event.eventId) || event.supersession === "SUPERSEDED_BY_SUCCESSOR") {
      const record = evidenceFromAttributedLedger({
        usageId: event.eventId,
        amount: event.amount,
        currency: event.currency,
        effectiveAsOf: event.effectiveDate,
        capacityRuleId: event.applicableProvisionId,
        sharedCapacityId: event.sharedCapacityId ?? null,
        status: "SUPERSEDED",
        approvalState: event.approvalState,
        sourceLabel: event.sourceLabel,
        authenticity: event.authenticity,
        kind: "SUPERSEDED",
      });
      record.entityKey = event.entityKey;
      record.legacyBasketFamily = event.legacyBasketFamily ?? null;
      utilizationRecords.push(record);
      trace.push({
        eventId: event.eventId,
        stage: "SUPERSEDED_EXCLUDED",
        detail: "superseded — retained for audit, excluded from attributed usage sum",
      });
      continue;
    }

    if (!event.applicableProvisionId && !event.sharedCapacityId && !event.legacyBasketFamily) {
      usageUnallocated.push(event);
      blockers.push(
        `event ${event.eventId} has no applicable provision, shared capacity, or legacy basket — unallocated`,
      );
      trace.push({
        eventId: event.eventId,
        stage: "USAGE_UNALLOCATED",
        detail: "no provision attribution",
      });
      continue;
    }

    // Only attribute events that target this capacity path (or shared pool / legacy).
    const targetsPath =
      event.applicableProvisionId === input.capacityRuleId ||
      (event.sharedCapacityId != null && event.sharedCapacityId.length > 0) ||
      (event.legacyBasketFamily != null && !event.applicableProvisionId);

    if (!targetsPath && event.applicableProvisionId != null) {
      // Observed for another provision — not attributed to this path (not "zero").
      usageUnallocated.push(event);
      trace.push({
        eventId: event.eventId,
        stage: "USAGE_UNALLOCATED",
        detail: `targets provision ${event.applicableProvisionId}, not ${input.capacityRuleId}`,
      });
      continue;
    }

    const kind = mapKindToRecordKind(event);
    const record = evidenceFromAttributedLedger({
      usageId: event.eventId,
      amount: event.amount,
      currency: event.currency,
      effectiveAsOf: event.effectiveDate,
      capacityRuleId: event.applicableProvisionId,
      sharedCapacityId: event.sharedCapacityId ?? null,
      status: mapStatus(event),
      approvalState: event.approvalState,
      sourceLabel: event.sourceLabel,
      authenticity: event.authenticity,
      kind,
    });
    record.entityKey = event.entityKey;
    record.legacyBasketFamily = event.legacyBasketFamily ?? null;
    utilizationRecords.push(record);

    if (
      event.applicableProvisionId === input.capacityRuleId ||
      (event.sharedCapacityId != null && kind === "ATTRIBUTED_SHARED_POOL")
    ) {
      usageAttributed.push({
        usageId: event.eventId,
        amount: event.amount,
        date: event.effectiveDate,
        applicableProvision: event.applicableProvisionId,
        source: event.sourceLabel,
        entity: event.entityKey,
        currency: event.currency,
        supersessionTreatment: event.supersession,
        eventKind: event.kind,
        record,
      });
      trace.push({
        eventId: event.eventId,
        stage: "USAGE_ATTRIBUTED",
        detail: `attributed ${event.amount} ${event.currency} → ${event.applicableProvisionId ?? event.sharedCapacityId}`,
      });
    } else {
      usageUnallocated.push(event);
      trace.push({
        eventId: event.eventId,
        stage: "USAGE_UNALLOCATED",
        detail: "legacy / non-path attribution retained but not path-attributed",
      });
    }
  }

  const cert = input.completenessCertificate ?? null;
  const reviewerConfirmed =
    cert != null &&
    cert.approvalState === "APPROVED" &&
    cert.capacityRuleId === input.capacityRuleId &&
    (cert.kind === "VERIFIED_COMPLETE" || cert.kind === "VERIFIED_EMPTY") &&
    cert.authenticity === "AUTHENTIC" &&
    cert.issuer != null;

  if (cert && !reviewerConfirmed) {
    blockers.push(
      "completeness certificate present but not reviewer-confirmed under Agent #2 authenticity/issuer requirements",
    );
    trace.push({
      eventId: null,
      stage: "REFUSED",
      detail: "completeness certificate failed reviewer-confirmation structural checks",
    });
  }

  if (reviewerConfirmed) {
    trace.push({
      eventId: null,
      stage: "REVIEWER_CONFIRMED_COMPLETENESS",
      detail: `certificate ${cert!.kind} source=${cert!.sourceLabel} issuer=${cert!.issuer?.actorId}`,
    });
  }

  const unknownHistoricalActivity = acknowledgeUnknown && !reviewerConfirmed;
  if (unknownHistoricalActivity) {
    blockers.push(
      "unknown historical activity remains — unobserved usage is not treated as zero; reviewer-confirmed completeness required for remaining claims",
    );
    trace.push({
      eventId: null,
      stage: "UNKNOWN_HISTORICAL_ACTIVITY",
      detail: "event set is not completeness-certified; missing history ≠ zero utilization",
    });
  }

  if (evidenceObserved.length === 0 && !reviewerConfirmed) {
    blockers.push(
      "no historical utilization events observed; empty event set is UNKNOWN, not VERIFIED_ZERO",
    );
  }

  const layers: UtilizationCompletenessLayer[] = ["EVIDENCE_OBSERVED"];
  if (usageAttributed.length > 0) layers.push("USAGE_ATTRIBUTED");
  if (usageUnallocated.length > 0) layers.push("USAGE_UNALLOCATED");
  if (unknownHistoricalActivity) layers.push("UNKNOWN_HISTORICAL_ACTIVITY");
  if (reviewerConfirmed) layers.push("REVIEWER_CONFIRMED_COMPLETENESS");

  // Reconstruction "ok" means the pathway ran without structural currency/entity
  // failures that prevent any handoff — unknown history still yields ok:true with
  // unknownHistoricalActivity so callers can demonstrate correct refusal downstream.
  const structuralRefuse = blockers.some((b) =>
    /currency ".*" ≠ reconstruction|missing entity/.test(b),
  );

  const note = reviewerConfirmed
    ? `Utilization reconstruction complete with reviewer-confirmed completeness (${cert!.kind}).`
    : usageAttributed.length > 0
      ? `Attributed ${usageAttributed.length} usage record(s); completeness NOT confirmed — remaining capacity must be refused.`
      : "No path-attributed usage; unknown historical activity — remaining capacity must be refused.";

  return {
    ok: !structuralRefuse,
    companyId: input.companyId,
    capacityRuleId: input.capacityRuleId,
    asOf: input.asOf,
    layers: [...new Set(layers)],
    evidenceObserved,
    usageAttributed,
    usageUnallocated,
    unknownHistoricalActivity,
    reviewerConfirmedCompleteness: reviewerConfirmed,
    utilizationRecords,
    completenessCertificate: reviewerConfirmed ? cert : null,
    blockers: [...new Set(blockers)],
    note,
    trace,
  };
}

/**
 * Build Agent #2 utilization handoff fields from a reconstruction result.
 * Does not invent a completeness certificate.
 */
export function toVerifiedUtilizationHandoffInput(
  reconstruction: UtilizationReconstructionResult,
  currencyHint?: string | null,
): {
  capacityRuleId: string;
  asOf: string;
  currency: string;
  records: UtilizationEvidenceRecord[];
  completenessCertificate: UtilizationCompletenessCertificate | null;
} {
  const fromAttributed = reconstruction.usageAttributed[0]?.currency;
  const fromObserved = reconstruction.evidenceObserved[0]?.currency;
  return {
    capacityRuleId: reconstruction.capacityRuleId,
    asOf: reconstruction.asOf,
    currency: currencyHint ?? fromAttributed ?? fromObserved ?? "USD",
    records: reconstruction.utilizationRecords,
    completenessCertificate: reconstruction.completenessCertificate,
  };
}
