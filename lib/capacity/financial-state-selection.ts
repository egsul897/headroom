/**
 * Financial-state selection for verified remaining capacity (Agent 2).
 *
 * Selects caller-supplied financial evidence by company/entity, reporting
 * period, as-of, currency, metric definition, source document, approval
 * status, and supersession history.
 *
 * Missing or stale inputs are NEVER coerced to zero.
 * Persistence alone never establishes approval.
 */

import {
  validateAuthenticatedFinancialSnapshot,
  validateFinancialMetricEvidence,
  type AmendmentRestatementStatus,
  type AuthenticatedFinancialSnapshotEvidence,
  type FinancialEvidenceValidationResult,
  type FinancialMetricEvidence,
  type FinancialMetricKey,
  type FinancialVerificationStatus,
} from "./financial-evidence";
import type { TrustedIssuerAuthorizationContext } from "./completeness-issuer-auth";

/** Explicit approval posture — persisted ≠ approved. */
export type FinancialApprovalStatus =
  | "UNAPPROVED"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REVOKED"
  | "UNKNOWN";

/**
 * Authentic approval-event provenance for a catalogued financial row.
 * Selection completeness alone never manufactures this — callers must supply
 * the real reviewer / approval reference when projecting APPROVED snapshots.
 */
export interface FinancialApprovalProvenance {
  reviewedBy: string;
  reviewedAt: string;
  approvalRef: string;
}

/** One selectable financial evidence candidate in a catalog. */
export interface FinancialEvidenceCandidate {
  evidenceId: string;
  metric: FinancialMetricEvidence;
  /**
   * Explicit approval status for this persisted/catalogued row.
   * Must not be inferred from verificationStatus alone.
   */
  approvalStatus: FinancialApprovalStatus;
  /**
   * Authentic approval provenance. Required to project an APPROVED
   * FinancialSnapshot — never invented by selectFinancialState.
   */
  approvalProvenance?: FinancialApprovalProvenance | null;
  /** When this candidate was superseded by a later restatement / amendment. */
  supersededByEvidenceId?: string | null;
  /** When this candidate supersedes a prior row. */
  supersedesEvidenceId?: string | null;
  /** Optional legal-entity key distinct from companyId (e.g. borrower subsidiary). */
  legalEntityKey?: string | null;
  /** Catalog persistence marker — never treated as approval. */
  persisted?: boolean;
}

export interface FinancialEvidenceCatalog {
  companyId: string;
  candidates: readonly FinancialEvidenceCandidate[];
}

export interface FinancialStateSelectionQuery {
  companyId: string;
  /** Legal entity / reporting entity filter when set. */
  legalEntityKey?: string | null;
  reportingPeriod?: string | null;
  asOf: string;
  currency?: string | null;
  metricKeys: readonly FinancialMetricKey[];
  /** Metric accounting-definition substring that must appear when set. */
  metricDefinitionIncludes?: string | null;
  sourceDocumentId?: string | null;
  /** Required approval statuses (default: APPROVED only for authoritative selection). */
  allowedApprovalStatuses?: readonly FinancialApprovalStatus[];
  /**
   * When true (default), exclude SUPERSEDED / RESTATED rows that have an active
   * successor in the catalog. Missing successors keep the row but mark incompleteness.
   */
  excludeSuperseded?: boolean;
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  allowSynthetic?: boolean;
  allowCallerStipulated?: boolean;
}

export type FinancialSelectionOutcome =
  | "SELECTED"
  | "MISSING"
  | "STALE"
  | "UNAPPROVED"
  | "SUPERSEDED"
  | "WRONG_ENTITY"
  | "WRONG_CURRENCY"
  | "WRONG_PERIOD"
  | "AMBIGUOUS"
  | "REFUSED";

export interface FinancialMetricSelection {
  metricKey: FinancialMetricKey;
  outcome: FinancialSelectionOutcome;
  candidate: FinancialEvidenceCandidate | null;
  validation: FinancialEvidenceValidationResult | null;
  /** Numeric value only when selected and validated — never invented zero. */
  value: number | null;
  blockers: string[];
}

export interface FinancialStateSelectionResult {
  companyId: string;
  asOf: string;
  reportingPeriod: string | null;
  currency: string | null;
  /** True only when every required metric selected under APPROVED + validation ok. */
  complete: boolean;
  /** True only when every required metric is production-authoritative. */
  productionAuthoritative: boolean;
  metrics: Partial<Record<FinancialMetricKey, FinancialMetricSelection>>;
  /** Snapshot bundle suitable for verified-input handoff when complete enough. */
  snapshot: AuthenticatedFinancialSnapshotEvidence | null;
  missingInputs: string[];
  blockers: string[];
  /** Selection/supersession provenance for audit. */
  provenance: {
    selectedEvidenceIds: string[];
    excludedSupersededIds: string[];
    persistedButUnapprovedIds: string[];
    catalogSize: number;
  };
  note: string;
}

function asOfDay(iso: string): string {
  return iso.slice(0, 10);
}

function isSupersededStatus(status: AmendmentRestatementStatus): boolean {
  return status === "SUPERSEDED" || status === "RESTATED";
}

function approvalAllows(
  status: FinancialApprovalStatus,
  allowed: readonly FinancialApprovalStatus[],
): boolean {
  return allowed.includes(status);
}

/**
 * Select financial evidence for capacity evaluation.
 * Never returns zero for a missing metric. Never treats persisted as approved.
 */
export function selectFinancialState(
  catalog: FinancialEvidenceCatalog,
  query: FinancialStateSelectionQuery,
): FinancialStateSelectionResult {
  const allowed =
    query.allowedApprovalStatuses ?? (["APPROVED"] as const satisfies readonly FinancialApprovalStatus[]);
  const excludeSuperseded = query.excludeSuperseded !== false;
  const blockers: string[] = [];
  const missingInputs: string[] = [];
  const metrics: Partial<Record<FinancialMetricKey, FinancialMetricSelection>> = {};
  const selectedEvidenceIds: string[] = [];
  const excludedSupersededIds: string[] = [];
  const persistedButUnapprovedIds: string[] = [];

  if (catalog.companyId !== query.companyId) {
    blockers.push(
      `catalog companyId "${catalog.companyId}" ≠ query companyId "${query.companyId}"`,
    );
  }

  const successorIds = new Set(
    catalog.candidates
      .map((c) => c.supersedesEvidenceId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  for (const c of catalog.candidates) {
    if (c.persisted && c.approvalStatus !== "APPROVED") {
      persistedButUnapprovedIds.push(c.evidenceId);
    }
    if (
      excludeSuperseded &&
      (successorIds.has(c.evidenceId) ||
        c.supersededByEvidenceId ||
        isSupersededStatus(c.metric.amendmentRestatementStatus))
    ) {
      excludedSupersededIds.push(c.evidenceId);
    }
  }

  const activeCandidates = catalog.candidates.filter((c) => {
    if (!excludeSuperseded) return true;
    if (successorIds.has(c.evidenceId)) return false;
    if (c.supersededByEvidenceId) return false;
    if (isSupersededStatus(c.metric.amendmentRestatementStatus) && c.supersededByEvidenceId !== null) {
      return false;
    }
    // SUPERSEDED / RESTATED without successor stays visible but will fail validation
    // via RESTATED_OR_SUPERSEDED — never silently selected as current.
    if (isSupersededStatus(c.metric.amendmentRestatementStatus)) return false;
    return true;
  });

  let reportingPeriod: string | null = query.reportingPeriod ?? null;
  let currency: string | null = query.currency ?? null;
  const selectedMetrics: FinancialMetricEvidence[] = [];

  for (const key of query.metricKeys) {
    const pool = activeCandidates.filter((c) => c.metric.metricKey === key);
    const matched = pool.filter((c) => {
      if (c.metric.entity.companyId !== query.companyId) return false;
      if (query.legalEntityKey != null && query.legalEntityKey !== "") {
        const entityKey = c.legalEntityKey ?? c.metric.entity.entityName;
        if (entityKey !== query.legalEntityKey) return false;
      }
      if (query.reportingPeriod != null && c.metric.reportingPeriod !== query.reportingPeriod) {
        return false;
      }
      if (query.currency != null && c.metric.currency !== query.currency) return false;
      if (
        query.sourceDocumentId != null &&
        c.metric.sourceDocument.documentId !== query.sourceDocumentId
      ) {
        return false;
      }
      if (
        query.metricDefinitionIncludes != null &&
        !c.metric.accountingDefinition.includes(query.metricDefinitionIncludes)
      ) {
        return false;
      }
      return true;
    });

    if (matched.length === 0) {
      // Distinguish wrong-entity / wrong-currency pools from true absence.
      const wrongEntity = pool.some((c) => c.metric.entity.companyId !== query.companyId);
      const wrongCurrency =
        query.currency != null && pool.some((c) => c.metric.currency !== query.currency);
      const wrongPeriod =
        query.reportingPeriod != null &&
        pool.some((c) => c.metric.reportingPeriod !== query.reportingPeriod);
      const supersededOnly =
        catalog.candidates.some((c) => c.metric.metricKey === key) && pool.length === 0;

      let outcome: FinancialSelectionOutcome = "MISSING";
      if (supersededOnly) outcome = "SUPERSEDED";
      else if (wrongEntity) outcome = "WRONG_ENTITY";
      else if (wrongCurrency) outcome = "WRONG_CURRENCY";
      else if (wrongPeriod) outcome = "WRONG_PERIOD";

      const msg = `financial metric ${key}: ${outcome} — not treated as zero`;
      missingInputs.push(msg);
      blockers.push(msg);
      metrics[key] = {
        metricKey: key,
        outcome,
        candidate: null,
        validation: null,
        value: null,
        blockers: [msg],
      };
      continue;
    }

    const approved = matched.filter((c) => approvalAllows(c.approvalStatus, allowed));
    if (approved.length === 0) {
      const msg = `financial metric ${key}: UNAPPROVED — persisted rows are not approved by existence`;
      missingInputs.push(msg);
      blockers.push(msg);
      metrics[key] = {
        metricKey: key,
        outcome: "UNAPPROVED",
        candidate: matched[0] ?? null,
        validation: null,
        value: null,
        blockers: [msg],
      };
      continue;
    }

    if (approved.length > 1) {
      // Prefer newest measurementDate; if still tied → AMBIGUOUS.
      const sorted = [...approved].sort((a, b) =>
        b.metric.measurementDate.localeCompare(a.metric.measurementDate),
      );
      const top = sorted[0]!;
      const ties = sorted.filter((c) => c.metric.measurementDate === top.metric.measurementDate);
      if (ties.length > 1) {
        const msg = `financial metric ${key}: AMBIGUOUS — ${ties.length} equally current approved candidates`;
        blockers.push(msg);
        metrics[key] = {
          metricKey: key,
          outcome: "AMBIGUOUS",
          candidate: null,
          validation: null,
          value: null,
          blockers: [msg],
        };
        continue;
      }
    }

    const chosen =
      approved.length === 1
        ? approved[0]!
        : [...approved].sort((a, b) =>
            b.metric.measurementDate.localeCompare(a.metric.measurementDate),
          )[0]!;

    const validation = validateFinancialMetricEvidence({
      evidence: chosen.metric,
      expectedCompanyId: query.companyId,
      expectedCurrency: query.currency,
      expectedReportingPeriod: query.reportingPeriod,
      evaluationAsOf: query.asOf,
      trustedIssuerAuth: query.trustedIssuerAuth,
      allowSynthetic: query.allowSynthetic,
      allowCallerStipulated: query.allowCallerStipulated,
    });

    if (!validation.ok) {
      const stale = validation.refusalReasons.includes("STALE_SNAPSHOT");
      const outcome: FinancialSelectionOutcome = stale
        ? "STALE"
        : validation.refusalReasons.includes("WRONG_ENTITY")
          ? "WRONG_ENTITY"
          : validation.refusalReasons.includes("WRONG_CURRENCY")
            ? "WRONG_CURRENCY"
            : validation.refusalReasons.includes("RESTATED_OR_SUPERSEDED")
              ? "SUPERSEDED"
              : "REFUSED";
      const msg = `financial metric ${key}: ${outcome} — ${validation.blockers.join("; ")}`;
      if (outcome === "STALE") missingInputs.push(msg);
      blockers.push(msg);
      metrics[key] = {
        metricKey: key,
        outcome,
        candidate: chosen,
        validation,
        value: null,
        blockers: [msg, ...validation.blockers],
      };
      continue;
    }

    selectedEvidenceIds.push(chosen.evidenceId);
    selectedMetrics.push(chosen.metric);
    reportingPeriod = reportingPeriod ?? chosen.metric.reportingPeriod;
    currency = currency ?? chosen.metric.currency;
    metrics[key] = {
      metricKey: key,
      outcome: "SELECTED",
      candidate: chosen,
      validation,
      value: chosen.metric.value,
      blockers: [],
    };
  }

  const selectedKeys = query.metricKeys.filter((k) => metrics[k]?.outcome === "SELECTED");
  const complete = selectedKeys.length === query.metricKeys.length;
  const productionAuthoritative =
    complete &&
    query.metricKeys.every((k) => metrics[k]?.validation?.productionAuthoritative === true);

  let snapshot: AuthenticatedFinancialSnapshotEvidence | null = null;
  if (selectedMetrics.length > 0 && reportingPeriod && currency) {
    const candidateSnapshot: AuthenticatedFinancialSnapshotEvidence = {
      companyId: query.companyId,
      asOf: asOfDay(query.asOf),
      reportingPeriod,
      currency,
      metrics: selectedMetrics,
      provenanceId: `financial-state:${query.companyId}:${asOfDay(query.asOf)}:${selectedEvidenceIds.sort().join(",")}`,
    };
    const snapValidation = validateAuthenticatedFinancialSnapshot(candidateSnapshot, {
      requiredMetrics: selectedKeys,
      evaluationAsOf: query.asOf,
      trustedIssuerAuth: query.trustedIssuerAuth,
      allowSynthetic: query.allowSynthetic,
      allowCallerStipulated: query.allowCallerStipulated,
    });
    if (snapValidation.ok || query.allowSynthetic || query.allowCallerStipulated) {
      snapshot = candidateSnapshot;
    } else {
      blockers.push(...snapValidation.blockers);
    }
  }

  const note = complete
    ? `Selected ${selectedKeys.length}/${query.metricKeys.length} financial metrics under approval filter [${allowed.join(",")}].`
    : `Incomplete financial state — ${missingInputs.length} missing/refused inputs; missing values are not zero.`;

  return {
    companyId: query.companyId,
    asOf: asOfDay(query.asOf),
    reportingPeriod,
    currency,
    complete,
    productionAuthoritative,
    metrics,
    snapshot,
    missingInputs,
    blockers: [...new Set(blockers)],
    provenance: {
      selectedEvidenceIds,
      excludedSupersededIds: [...new Set(excludedSupersededIds)],
      persistedButUnapprovedIds: [...new Set(persistedButUnapprovedIds)],
      catalogSize: catalog.candidates.length,
    },
    note,
  };
}

/** Map verification status → approval is forbidden; callers must set approval explicitly. */
export function approvalStatusFromVerification(
  _status: FinancialVerificationStatus,
): FinancialApprovalStatus {
  // Intentionally does not promote verification to approval.
  return "UNKNOWN";
}
