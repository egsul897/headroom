/**
 * HEADROOM-9 — financial statement → Agent #2 verified financial-evidence pathway.
 *
 * Normalizes authentic-source statement line items into
 * `AuthenticatedFinancialSnapshotEvidence` (verified-input-contract.v1).
 * Does NOT create a second evidence contract or capacity engine.
 *
 * Invariants:
 * - Extraction ≠ verification.
 * - GAAP face values are distinct from contract-adjusted metrics.
 * - TOTAL_ASSETS is never auto-equated to TOTAL_CONSOLIDATED_ASSETS.
 * - Values are never invented; missing required fields refuse normalization.
 */

import type {
  AccountingDefinitionBasis,
  AuthenticatedFinancialSnapshotEvidence,
  FinancialMetricAdjustment,
  FinancialMetricEvidence,
  FinancialMetricKey,
  FinancialStatementFamily,
  FinancialVerificationStatus,
} from "./financial-evidence";
import type { CompletenessIssuerRole } from "./utilization-types";

/** Observed statement line before capacity-metric mapping. */
export interface RawFinancialStatementLine {
  /** Stable id within the source filing / pack. */
  lineId: string;
  statementFamily: FinancialStatementFamily;
  /** Human label as printed (e.g. "Total assets", "Interest expense"). */
  label: string;
  /** Numeric amount as reported — never invented here. */
  amount: number;
  currency: string;
  units: string;
  reportingPeriod: string;
  measurementDate: string;
  consolidationPerimeter: string;
  definitionBasis: AccountingDefinitionBasis;
  accountingDefinition: string;
  sourceDocumentId: string;
  exactLocation: string;
  excerpt?: string | null;
  restatementStatus: FinancialMetricEvidence["amendmentRestatementStatus"];
  adjustments?: readonly FinancialMetricAdjustment[];
}

/**
 * Explicit mapping from a statement line to a capacity metric key.
 * Mapping is never inferred from label text alone.
 */
export interface StatementMetricDefinitionMapping {
  lineId: string;
  metricKey: FinancialMetricKey;
  /**
   * When true, refuse if this line is mapped as TOTAL_CONSOLIDATED_ASSETS while
   * another line is mapped as TOTAL_ASSETS with an identical amount AND identical
   * consolidation perimeter without an explicit same-perimeter attestation.
   * Default behavior already forbids silent equivalence across different keys.
   */
  allowIdenticalAmountAcrossAssetKeys?: boolean;
}

export interface FinancialStatementIngestionInput {
  companyId: string;
  entityName: string | null;
  asOf: string;
  reportingPeriod: string;
  currency: string;
  provenanceId: string;
  lines: readonly RawFinancialStatementLine[];
  mappings: readonly StatementMetricDefinitionMapping[];
  /**
   * Verification status applied to normalized metrics.
   * Extraction alone must remain UNVERIFIED_EXTRACTION / REVIEW_REQUIRED.
   */
  verificationStatus: FinancialVerificationStatus;
  authenticity: FinancialMetricEvidence["authenticity"];
  issuer?: {
    role: CompletenessIssuerRole;
    actorId: string;
    attestedAt?: string;
  };
  maxAgeDays?: number | null;
}

export type StatementIngestionRefusalReason =
  | "MISSING_LINE"
  | "MISSING_MAPPING"
  | "CURRENCY_MISMATCH"
  | "PERIOD_MISMATCH"
  | "ENTITY_PERIMETER_MISSING"
  | "TOTAL_ASSETS_EQUATED_TO_CONSOLIDATED"
  | "GAAP_CONTRACT_BASIS_MISMATCH"
  | "DUPLICATE_METRIC_MAPPING"
  | "NON_FINITE_AMOUNT";

export interface FinancialStatementIngestionResult {
  ok: boolean;
  snapshot: AuthenticatedFinancialSnapshotEvidence | null;
  blockers: string[];
  refusalReasons: StatementIngestionRefusalReason[];
  /** Lines observed but not mapped to a capacity metric (retained for audit). */
  unmappedLineIds: string[];
  /** Trace for reproducible source → normalized evidence. */
  trace: readonly StatementNormalizationTraceEntry[];
}

export interface StatementNormalizationTraceEntry {
  lineId: string;
  metricKey: FinancialMetricKey | null;
  stage: "OBSERVED" | "MAPPED" | "REFUSED" | "NORMALIZED";
  detail: string;
}

/**
 * Normalize authentic statement lines into Agent #2 snapshot evidence.
 * Fail-closed: never manufactures values or silently equates asset definitions.
 */
export function normalizeFinancialStatementEvidence(
  input: FinancialStatementIngestionInput,
): FinancialStatementIngestionResult {
  const blockers: string[] = [];
  const refusalReasons: StatementIngestionRefusalReason[] = [];
  const trace: StatementNormalizationTraceEntry[] = [];
  const lineById = new Map(input.lines.map((l) => [l.lineId, l]));
  const mappedLineIds = new Set<string>();
  const metricKeysSeen = new Set<FinancialMetricKey>();
  const metrics: FinancialMetricEvidence[] = [];

  for (const line of input.lines) {
    trace.push({
      lineId: line.lineId,
      metricKey: null,
      stage: "OBSERVED",
      detail: `${line.statementFamily} / ${line.label} = ${line.amount} ${line.currency}`,
    });
  }

  for (const mapping of input.mappings) {
    const line = lineById.get(mapping.lineId);
    if (!line) {
      blockers.push(`mapping references missing statement line "${mapping.lineId}"`);
      refusalReasons.push("MISSING_LINE");
      trace.push({
        lineId: mapping.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "line missing from observed statement evidence",
      });
      continue;
    }
    mappedLineIds.add(mapping.lineId);

    if (!Number.isFinite(line.amount)) {
      blockers.push(`line ${line.lineId} amount is not finite`);
      refusalReasons.push("NON_FINITE_AMOUNT");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "non-finite amount",
      });
      continue;
    }

    if (line.currency !== input.currency) {
      blockers.push(
        `line ${line.lineId} currency "${line.currency}" ≠ snapshot currency "${input.currency}"`,
      );
      refusalReasons.push("CURRENCY_MISMATCH");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "currency mismatch",
      });
      continue;
    }

    if (line.reportingPeriod !== input.reportingPeriod) {
      blockers.push(
        `line ${line.lineId} reportingPeriod "${line.reportingPeriod}" ≠ snapshot "${input.reportingPeriod}"`,
      );
      refusalReasons.push("PERIOD_MISMATCH");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "reporting period mismatch",
      });
      continue;
    }

    if (!line.consolidationPerimeter?.trim()) {
      blockers.push(`line ${line.lineId} missing consolidation perimeter`);
      refusalReasons.push("ENTITY_PERIMETER_MISSING");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "missing consolidation perimeter",
      });
      continue;
    }

    // Contract-adjusted metrics must declare basis; GAAP lines must not pretend to be adjusted.
    if (
      mapping.metricKey === "CONSOLIDATED_EBITDA" &&
      line.definitionBasis !== "CONTRACT_ADJUSTED"
    ) {
      blockers.push(
        `metric CONSOLIDATED_EBITDA from line ${line.lineId} requires CONTRACT_ADJUSTED definitionBasis (GAAP ≠ Indenture Consolidated EBITDA)`,
      );
      refusalReasons.push("GAAP_CONTRACT_BASIS_MISMATCH");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "GAAP/contract basis mismatch for Consolidated EBITDA",
      });
      continue;
    }

    if (metricKeysSeen.has(mapping.metricKey)) {
      blockers.push(`duplicate mapping for metric ${mapping.metricKey}`);
      refusalReasons.push("DUPLICATE_METRIC_MAPPING");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "duplicate metric mapping",
      });
      continue;
    }
    metricKeysSeen.add(mapping.metricKey);

    trace.push({
      lineId: line.lineId,
      metricKey: mapping.metricKey,
      stage: "MAPPED",
      detail: `definitionBasis=${line.definitionBasis}; restatement=${line.restatementStatus}`,
    });

    metrics.push({
      metricKey: mapping.metricKey,
      value: line.amount,
      currency: line.currency,
      units: line.units,
      entity: {
        companyId: input.companyId,
        entityName: input.entityName,
        consolidationPerimeter: line.consolidationPerimeter,
      },
      sourceDocument: {
        documentId: line.sourceDocumentId,
        exactLocation: line.exactLocation,
        excerpt: line.excerpt ?? null,
      },
      reportingPeriod: line.reportingPeriod,
      measurementDate: line.measurementDate,
      accountingDefinition: line.accountingDefinition,
      definitionBasis: line.definitionBasis,
      adjustments: line.adjustments,
      statementFamily: line.statementFamily,
      amendmentRestatementStatus: line.restatementStatus,
      verificationStatus: input.verificationStatus,
      authenticity: input.authenticity,
      issuer: input.issuer,
      provenanceId: `${input.provenanceId}:${line.lineId}:${mapping.metricKey}`,
      maxAgeDays: input.maxAgeDays,
    });

    trace.push({
      lineId: line.lineId,
      metricKey: mapping.metricKey,
      stage: "NORMALIZED",
      detail: `verificationStatus=${input.verificationStatus}; authenticity=${input.authenticity}`,
    });
  }

  // TOTAL_ASSETS ≠ TOTAL_CONSOLIDATED_ASSETS — refuse silent equivalence.
  const totalAssets = metrics.find((m) => m.metricKey === "TOTAL_ASSETS");
  const consolidatedAssets = metrics.find((m) => m.metricKey === "TOTAL_CONSOLIDATED_ASSETS");
  if (totalAssets && consolidatedAssets) {
    const mappingAllows =
      input.mappings.find((m) => m.metricKey === "TOTAL_CONSOLIDATED_ASSETS")
        ?.allowIdenticalAmountAcrossAssetKeys === true ||
      input.mappings.find((m) => m.metricKey === "TOTAL_ASSETS")
        ?.allowIdenticalAmountAcrossAssetKeys === true;
    const sameAmount = totalAssets.value === consolidatedAssets.value;
    const samePerimeter =
      totalAssets.entity.consolidationPerimeter ===
      consolidatedAssets.entity.consolidationPerimeter;
    if (sameAmount && samePerimeter && !mappingAllows) {
      blockers.push(
        "TOTAL_ASSETS and TOTAL_CONSOLIDATED_ASSETS share amount and consolidation perimeter without explicit allowIdenticalAmountAcrossAssetKeys — refuse silent equivalence (definitions may still differ by contract)",
      );
      refusalReasons.push("TOTAL_ASSETS_EQUATED_TO_CONSOLIDATED");
    }
    // Different keys with different perimeters are fine even if amounts match.
  } else if (totalAssets && !consolidatedAssets) {
    // Presenting only TOTAL_ASSETS must not be treated as consolidated assets elsewhere.
    // Recorded as a note in blockers only when a mapping asked for consolidated and missed.
    const askedConsolidated = input.mappings.some(
      (m) => m.metricKey === "TOTAL_CONSOLIDATED_ASSETS",
    );
    if (askedConsolidated) {
      blockers.push(
        "TOTAL_CONSOLIDATED_ASSETS mapping present but metric missing after normalization — Total Assets is not a substitute",
      );
      refusalReasons.push("TOTAL_ASSETS_EQUATED_TO_CONSOLIDATED");
    }
  }

  const unmappedLineIds = input.lines
    .map((l) => l.lineId)
    .filter((id) => !mappedLineIds.has(id));

  if (input.mappings.length === 0) {
    blockers.push("no statement→metric definition mappings supplied");
    refusalReasons.push("MISSING_MAPPING");
  }

  const ok = refusalReasons.length === 0 && metrics.length > 0;
  if (!ok) {
    return {
      ok: false,
      snapshot: null,
      blockers: [...new Set(blockers)],
      refusalReasons: [...new Set(refusalReasons)],
      unmappedLineIds,
      trace,
    };
  }

  return {
    ok: true,
    snapshot: {
      companyId: input.companyId,
      asOf: input.asOf,
      reportingPeriod: input.reportingPeriod,
      currency: input.currency,
      metrics,
      provenanceId: input.provenanceId,
    },
    blockers: [],
    refusalReasons: [],
    unmappedLineIds,
    trace,
  };
}
