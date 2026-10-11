/**
 * HEADROOM-9 — financial statement → Agent #2 verified financial-evidence pathway.
 *
 * Normalizes authentic-source statement line items into
 * `AuthenticatedFinancialSnapshotEvidence` (verified-input-contract.v1 on main).
 * Does NOT create a second evidence contract or capacity engine, and does NOT
 * modify canonical `financial-evidence.ts`.
 *
 * Invariants:
 * - Extraction ≠ verification.
 * - GAAP face values are distinct from contract-adjusted metrics.
 * - GAAP Total Assets never silently substitutes for covenant Total Consolidated Assets.
 * - Statement balances never invent basket attribution (utilization is a separate pathway).
 * - Values are never invented; missing required fields refuse normalization.
 */

import type {
  AuthenticatedFinancialSnapshotEvidence,
  FinancialMetricEvidence,
  FinancialMetricKey,
  FinancialVerificationStatus,
} from "./financial-evidence";
import type { CompletenessIssuerRole } from "./utilization-types";

/** GAAP face-value statement line vs contract-defined adjusted metric. */
export type AccountingDefinitionBasis = "GAAP_STATEMENT" | "CONTRACT_ADJUSTED";

/** Statement family for bounded authentic-source ingestion. */
export type FinancialStatementFamily =
  | "BALANCE_SHEET"
  | "INCOME_STATEMENT"
  | "DEBT_SCHEDULE"
  | "CONTRACT_CERTIFICATE"
  | "OTHER";

export interface FinancialMetricAdjustment {
  label: string;
  amount: number;
  sourceCitation: string;
}

/**
 * Ingestion-layer metric targets. `TOTAL_CONSOLIDATED_ASSETS` is intentionally
 * NOT a FinancialMetricKey on the Agent #2 contract — it is preserved here so
 * GAAP Total Assets cannot silently stand in for the covenant-defined term.
 * When normalized, it is emitted as Agent #2 `OTHER` with an explicit covenant
 * term marker in `accountingDefinition`.
 */
export type StatementCapacityMetricKey = FinancialMetricKey | "TOTAL_CONSOLIDATED_ASSETS";

const COVENANT_CONSOLIDATED_ASSETS_MARKER =
  "[COVENANT_TERM:TOTAL_CONSOLIDATED_ASSETS]";

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
  metricKey: StatementCapacityMetricKey;
  /**
   * When true, allow TOTAL_ASSETS and TOTAL_CONSOLIDATED_ASSETS to share amount
   * and consolidation perimeter (explicit attestation only).
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
  /**
   * Ingestion-layer roles successfully mapped (includes TOTAL_CONSOLIDATED_ASSETS
   * even though Agent #2 emits it as OTHER).
   */
  mappedRoles: readonly StatementCapacityMetricKey[];
}

export interface StatementNormalizationTraceEntry {
  lineId: string;
  metricKey: StatementCapacityMetricKey | null;
  stage: "OBSERVED" | "MAPPED" | "REFUSED" | "NORMALIZED";
  detail: string;
}

function toAgent2MetricKey(key: StatementCapacityMetricKey): FinancialMetricKey {
  if (key === "TOTAL_CONSOLIDATED_ASSETS") return "OTHER";
  return key;
}

function accountingDefinitionFor(
  line: RawFinancialStatementLine,
  role: StatementCapacityMetricKey,
): string {
  const base = line.accountingDefinition;
  if (role !== "TOTAL_CONSOLIDATED_ASSETS") return base;
  const adjustments =
    line.adjustments && line.adjustments.length > 0
      ? ` adjustments=[${line.adjustments.map((a) => `${a.label}:${a.amount}`).join("; ")}]`
      : "";
  return `${COVENANT_CONSOLIDATED_ASSETS_MARKER} ${base} (definitionBasis=${line.definitionBasis}; statementFamily=${line.statementFamily})${adjustments}`;
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
  const rolesSeen = new Set<StatementCapacityMetricKey>();
  const agent2KeysSeen = new Set<FinancialMetricKey>();
  const metrics: FinancialMetricEvidence[] = [];
  const mappedRoles: StatementCapacityMetricKey[] = [];

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

    // GAAP Total Assets line cannot be mapped as covenant Total Consolidated Assets.
    if (
      mapping.metricKey === "TOTAL_CONSOLIDATED_ASSETS" &&
      line.definitionBasis === "GAAP_STATEMENT" &&
      /total assets/i.test(line.label) &&
      !/consolidated total assets|total consolidated assets/i.test(line.accountingDefinition)
    ) {
      blockers.push(
        `GAAP Total Assets line ${line.lineId} cannot silently map to covenant TOTAL_CONSOLIDATED_ASSETS`,
      );
      refusalReasons.push("TOTAL_ASSETS_EQUATED_TO_CONSOLIDATED");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "GAAP Total Assets refused as Total Consolidated Assets substitute",
      });
      continue;
    }

    if (rolesSeen.has(mapping.metricKey)) {
      blockers.push(`duplicate mapping for metric role ${mapping.metricKey}`);
      refusalReasons.push("DUPLICATE_METRIC_MAPPING");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "duplicate metric mapping",
      });
      continue;
    }

    const agent2Key = toAgent2MetricKey(mapping.metricKey);
    if (agent2KeysSeen.has(agent2Key) && mapping.metricKey !== "TOTAL_CONSOLIDATED_ASSETS") {
      blockers.push(`duplicate Agent #2 metric key ${agent2Key}`);
      refusalReasons.push("DUPLICATE_METRIC_MAPPING");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "duplicate Agent #2 metric key",
      });
      continue;
    }
    // Multiple OTHER rows are allowed only when roles differ; block second OTHER collision.
    if (agent2Key === "OTHER" && agent2KeysSeen.has("OTHER")) {
      blockers.push("duplicate Agent #2 OTHER metric — refuse ambiguous capacity handoff");
      refusalReasons.push("DUPLICATE_METRIC_MAPPING");
      trace.push({
        lineId: line.lineId,
        metricKey: mapping.metricKey,
        stage: "REFUSED",
        detail: "duplicate OTHER metric key",
      });
      continue;
    }

    rolesSeen.add(mapping.metricKey);
    agent2KeysSeen.add(agent2Key);
    mappedRoles.push(mapping.metricKey);

    trace.push({
      lineId: line.lineId,
      metricKey: mapping.metricKey,
      stage: "MAPPED",
      detail: `definitionBasis=${line.definitionBasis}; restatement=${line.restatementStatus}; agent2=${agent2Key}`,
    });

    const definitionParts = [
      accountingDefinitionFor(line, mapping.metricKey),
      `definitionBasis=${line.definitionBasis}`,
      `statementFamily=${line.statementFamily}`,
    ];
    if (line.adjustments?.length) {
      definitionParts.push(
        `adjustments=${line.adjustments.map((a) => `${a.label}:${a.amount}@${a.sourceCitation}`).join("|")}`,
      );
    }

    metrics.push({
      metricKey: agent2Key,
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
      accountingDefinition: definitionParts.join(" | "),
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
  const totalAssetsLine = metrics.find((m) => m.metricKey === "TOTAL_ASSETS");
  const consolidatedRoleMapped = rolesSeen.has("TOTAL_CONSOLIDATED_ASSETS");
  const consolidatedMetric = consolidatedRoleMapped
    ? metrics.find((m) => m.accountingDefinition.includes(COVENANT_CONSOLIDATED_ASSETS_MARKER))
    : undefined;

  if (totalAssetsLine && consolidatedMetric) {
    const mappingAllows =
      input.mappings.find((m) => m.metricKey === "TOTAL_CONSOLIDATED_ASSETS")
        ?.allowIdenticalAmountAcrossAssetKeys === true ||
      input.mappings.find((m) => m.metricKey === "TOTAL_ASSETS")
        ?.allowIdenticalAmountAcrossAssetKeys === true;
    const sameAmount = totalAssetsLine.value === consolidatedMetric.value;
    const samePerimeter =
      totalAssetsLine.entity.consolidationPerimeter ===
      consolidatedMetric.entity.consolidationPerimeter;
    if (sameAmount && samePerimeter && !mappingAllows) {
      blockers.push(
        "TOTAL_ASSETS and TOTAL_CONSOLIDATED_ASSETS share amount and consolidation perimeter without explicit allowIdenticalAmountAcrossAssetKeys — refuse silent equivalence (definitions may still differ by contract)",
      );
      refusalReasons.push("TOTAL_ASSETS_EQUATED_TO_CONSOLIDATED");
    }
  } else if (totalAssetsLine && !consolidatedRoleMapped) {
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
      mappedRoles,
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
    mappedRoles,
  };
}

/**
 * Statement financial metrics never establish basket / provision attribution.
 * Callers must use utilization reconstruction with explicit provision ids.
 */
export function statementBalancesDoNotEstablishBasketAttribution(
  result: FinancialStatementIngestionResult,
): true {
  void result;
  return true;
}
