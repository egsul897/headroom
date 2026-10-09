/**
 * NS-6 — resolve contractual period/as-of selectors to exact 4B identities.
 *
 * Soft gates:
 * - never default to "latest APPROVED snapshot"
 * - never substitute an undelivered reporting period when policy requires delivery
 * - never carry prior-period values
 * - competing equal-rank deliveries → AMBIGUOUS
 */
import type { AsOfSelector, PeriodSelector } from "../types";
import {
  fourConsecutiveQuartersMostRecentlyEnded,
  mostRecentlyEndedFiscalQuarter,
  mostRecentlyEndedFiscalYear,
  isoCompare,
  assertIsoDate,
} from "./fiscal";
import { lookupNamedSelector } from "./registry";
import type {
  DeliveryKind,
  DeliveryRecord,
  NamedContractualSelector,
  ResolveSelectorRequest,
  SelectorResolutionEvidence,
  SelectorResolutionPolicy,
  SelectorResolutionResult,
} from "./types";
import { DEFAULT_SELECTOR_RESOLUTION_POLICY } from "./types";

function needs(
  reason: string,
  missing: string[],
  evidence: SelectorResolutionEvidence,
): SelectorResolutionResult {
  return { state: "NEEDS_INPUT", reason, missing, evidence };
}

function resolved(
  reportingPeriodKey: string | null,
  asOfIsoDate: string | null,
  evidence: SelectorResolutionEvidence,
  periodOverride?: PeriodSelector,
): SelectorResolutionResult {
  const period: PeriodSelector = periodOverride
    ?? (reportingPeriodKey
      ? { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: reportingPeriodKey }
      : { kind: "NOT_PERIOD_SPECIFIC" });
  const asOf: AsOfSelector = asOfIsoDate
    ? { kind: "EXACT_DATE", isoDate: asOfIsoDate }
    : { kind: "NOT_AS_OF_SPECIFIC" };
  return { state: "RESOLVED", period, asOf, reportingPeriodKey, evidence };
}

function companyDeliveries(
  companyId: string,
  deliveries: readonly DeliveryRecord[] | undefined,
  kind?: DeliveryKind,
): DeliveryRecord[] {
  return (deliveries ?? []).filter((d) => d.companyId === companyId && (kind == null || d.kind === kind));
}

function deliveryForPeriod(
  deliveries: readonly DeliveryRecord[],
  reportingPeriodKey: string,
  evaluationDate: string,
): DeliveryRecord[] {
  return deliveries.filter(
    (d) =>
      d.reportingPeriodKey === reportingPeriodKey &&
      isoCompare(d.deliveredAtIsoDate, evaluationDate) <= 0,
  );
}

function resolveMostRecentlyDelivered(
  companyId: string,
  evaluationDate: string,
  kind: DeliveryKind,
  deliveries: readonly DeliveryRecord[] | undefined,
  policy: SelectorResolutionPolicy,
): SelectorResolutionResult {
  const pool = companyDeliveries(companyId, deliveries, kind).filter(
    (d) => isoCompare(d.deliveredAtIsoDate, evaluationDate) <= 0,
  );
  const evidence: SelectorResolutionEvidence = {
    fiscalCalendarUsed: false,
    deliveryDocumentIds: pool.map((d) => d.documentId),
    method: kind === "FINANCIAL_STATEMENTS" ? "MOST_RECENTLY_DELIVERED_FINANCIAL_STATEMENTS" : "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
  };
  if (pool.length === 0) {
    return needs(
      `no ${kind} delivery on or before ${evaluationDate}; refusing to invent a period`,
      [`delivery:${kind}`],
      evidence,
    );
  }
  const maxDate = pool.reduce((m, d) => (isoCompare(d.deliveredAtIsoDate, m) > 0 ? d.deliveredAtIsoDate : m), pool[0]!.deliveredAtIsoDate);
  const top = pool.filter((d) => d.deliveredAtIsoDate === maxDate);
  // Distinct periods at the same delivery date → AMBIGUOUS (never silent latest pick).
  const periodKeys = [...new Set(top.map((d) => d.reportingPeriodKey))];
  if (periodKeys.length > 1 && policy.onCompetingDeliveries === "AMBIGUOUS") {
    return {
      state: "AMBIGUOUS",
      reason: `competing ${kind} deliveries on ${maxDate} map to different periods; refusing latest-quarter guess`,
      candidates: top.map((d) => ({
        reportingPeriodKey: d.reportingPeriodKey,
        asOfIsoDate: d.asOfIsoDate,
        documentId: d.documentId,
      })),
      evidence,
    };
  }
  const chosen = top[0]!;
  return resolved(chosen.reportingPeriodKey, chosen.asOfIsoDate, {
    ...evidence,
    deliveryDocumentIds: top.map((d) => d.documentId),
    note: `deliveredAt=${chosen.deliveredAtIsoDate}`,
  });
}

function resolveNamed(
  kind: NamedContractualSelector,
  req: ResolveSelectorRequest,
  policy: SelectorResolutionPolicy,
): SelectorResolutionResult {
  const { companyId, evaluationDate } = req;
  assertIsoDate(evaluationDate, "evaluationDate");

  if (kind === "DATE_OF_TRANSACTION" || kind === "EXACT_MEASUREMENT_DATE") {
    const date = kind === "DATE_OF_TRANSACTION" ? evaluationDate : req.measurementDate;
    if (!date) {
      return needs("exact measurement date required", ["measurementDate"], {
        fiscalCalendarUsed: false,
        deliveryDocumentIds: [],
        method: kind,
      });
    }
    assertIsoDate(date, "measurementDate");
    return resolved(null, date, {
      fiscalCalendarUsed: false,
      deliveryDocumentIds: [],
      method: kind,
    }, { kind: "NOT_PERIOD_SPECIFIC" });
  }

  if (kind === "MOST_RECENTLY_DELIVERED_FINANCIAL_STATEMENTS") {
    return resolveMostRecentlyDelivered(companyId, evaluationDate, "FINANCIAL_STATEMENTS", req.deliveries, policy);
  }
  if (kind === "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE") {
    return resolveMostRecentlyDelivered(companyId, evaluationDate, "COMPLIANCE_CERTIFICATE", req.deliveries, policy);
  }

  const cal = req.fiscalCalendar;
  if (!cal || cal.companyId !== companyId) {
    return needs("fiscal calendar required for this selector", ["fiscalCalendar"], {
      fiscalCalendarUsed: false,
      deliveryDocumentIds: [],
      method: kind,
    });
  }

  let periodKey: string;
  let asOf: string;
  let method: string;
  let note: string | undefined;

  if (kind === "MOST_RECENTLY_ENDED_FISCAL_QUARTER") {
    const q = mostRecentlyEndedFiscalQuarter(cal, evaluationDate);
    periodKey = q.reportingPeriodKey;
    asOf = q.asOfIsoDate;
    method = "MOST_RECENTLY_ENDED_FISCAL_QUARTER";
  } else if (kind === "MOST_RECENTLY_ENDED_FISCAL_YEAR") {
    const y = mostRecentlyEndedFiscalYear(cal, evaluationDate);
    periodKey = y.reportingPeriodKey;
    asOf = y.asOfIsoDate;
    method = "MOST_RECENTLY_ENDED_FISCAL_YEAR";
  } else {
    // FOUR_CONSECUTIVE_FISCAL_QUARTERS_MOST_RECENTLY_ENDED
    const { trailing, quarters } = fourConsecutiveQuartersMostRecentlyEnded(cal, evaluationDate);
    periodKey = trailing.reportingPeriodKey;
    asOf = trailing.asOfIsoDate;
    method = "FOUR_CONSECUTIVE_FISCAL_QUARTERS_MOST_RECENTLY_ENDED";
    note = `quarters=${quarters.map((q) => q.reportingPeriodKey).join(",")}`;
  }

  const stmts = companyDeliveries(companyId, req.deliveries, "FINANCIAL_STATEMENTS");
  const certs = companyDeliveries(companyId, req.deliveries, "COMPLIANCE_CERTIFICATE");
  const matched = [
    ...deliveryForPeriod(stmts, periodKey, evaluationDate),
    // TTM keys won't match a single-quarter delivery — also accept deliveries for the ending quarter
    ...(kind === "FOUR_CONSECUTIVE_FISCAL_QUARTERS_MOST_RECENTLY_ENDED"
      ? deliveryForPeriod(stmts, mostRecentlyEndedFiscalQuarter(cal, evaluationDate).reportingPeriodKey, evaluationDate)
      : []),
    ...deliveryForPeriod(certs, periodKey, evaluationDate),
    ...(kind === "FOUR_CONSECUTIVE_FISCAL_QUARTERS_MOST_RECENTLY_ENDED"
      ? deliveryForPeriod(certs, mostRecentlyEndedFiscalQuarter(cal, evaluationDate).reportingPeriodKey, evaluationDate)
      : []),
  ];

  const evidence: SelectorResolutionEvidence = {
    fiscalCalendarUsed: true,
    deliveryDocumentIds: [...new Set(matched.map((d) => d.documentId))],
    method,
    note,
  };

  if (policy.requireDeliveryEvidence && matched.length === 0) {
    return needs(
      `fiscal period ${periodKey} (asOf ${asOf}) ended on or before ${evaluationDate} but no delivery evidence exists; refusing undelivered / latest-quarter substitution`,
      [`delivery:period:${periodKey}`],
      evidence,
    );
  }

  return resolved(periodKey, asOf, evidence);
}

/**
 * Resolve a contractual selector to exact period + as-of identity.
 * Does not read APPROVED snapshots to pick "latest"; snapshots are matched later by 4B exact identity.
 */
export function resolveContractualSelector(req: ResolveSelectorRequest): SelectorResolutionResult {
  const policy = req.policy ?? DEFAULT_SELECTOR_RESOLUTION_POLICY;
  let kind: NamedContractualSelector | null;

  if (typeof req.selector === "string") {
    kind = req.selector;
  } else {
    kind = lookupNamedSelector(req.selector.verbatim);
    if (!kind) {
      return needs(
        `unrecognized contractual selector wording; refusing to guess a period (verbatim preserved for counsel)`,
        ["selector.registry"],
        {
          fiscalCalendarUsed: false,
          deliveryDocumentIds: [],
          method: "VERBATIM_UNMAPPED",
          note: req.selector.verbatim,
        },
      );
    }
  }

  return resolveNamed(kind, req, policy);
}

/** Bind a resolved selector to an APPROVED snapshot set by exact period/as-of — never by recency alone. */
export function selectSnapshotForResolvedSelector(
  resolved: Extract<SelectorResolutionResult, { state: "RESOLVED" }>,
  snapshots: readonly { snapshotId: string; status: string; reportingPeriod: string | null; asOf: string | null; companyId: string }[],
  companyId: string,
): { state: "RESOLVED"; snapshotId: string } | { state: "NEEDS_INPUT"; reason: string; missing: string[] } | { state: "AMBIGUOUS"; reason: string; snapshotIds: string[] } {
  const approved = snapshots.filter((s) => s.companyId === companyId && s.status === "APPROVED");
  const matches = approved.filter((s) => {
    const periodOk =
      resolved.reportingPeriodKey == null ||
      s.reportingPeriod === resolved.reportingPeriodKey ||
      // TTM keys: allow ending-quarter match when snapshot stores the quarter key
      (resolved.reportingPeriodKey.startsWith("TTM-ending-") &&
        s.reportingPeriod === resolved.reportingPeriodKey.replace(/^TTM-ending-/, ""));
    const asOfOk =
      resolved.asOf.kind !== "EXACT_DATE" || s.asOf === resolved.asOf.isoDate;
    return periodOk && asOfOk;
  });
  if (matches.length === 0) {
    return {
      state: "NEEDS_INPUT",
      reason: `no APPROVED snapshot for period=${resolved.reportingPeriodKey ?? "-"} asOf=${resolved.asOf.kind === "EXACT_DATE" ? resolved.asOf.isoDate : "-"}`,
      missing: ["approvedSnapshot"],
    };
  }
  if (matches.length > 1) {
    return {
      state: "AMBIGUOUS",
      reason: "multiple APPROVED snapshots match the resolved identity; refusing latest pick",
      snapshotIds: matches.map((m) => m.snapshotId).sort(),
    };
  }
  return { state: "RESOLVED", snapshotId: matches[0]!.snapshotId };
}
