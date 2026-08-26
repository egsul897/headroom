/**
 * CSV financial-figures connector (docs/autonomous-retrieval-phase-a-foundation.md,
 * unit handling per docs/autonomous-ingestion-production-readiness.md).
 *
 * A PUSH-based connector: there is no remote source to poll, only bytes the
 * caller already has (an uploaded CSV file). "Discovery" is parsing every
 * row; each valid row becomes one DiscoveredSourceItem/RawSourceArtifact of
 * artifactType FINANCIAL_RECORD. A malformed row FAILS CLOSED - skipped and
 * reported via getLastParseErrors(), never silently coerced (e.g. a blank
 * `value` cell is never treated as 0) and never treated as though the row
 * simply didn't exist without a trace.
 *
 * Expected header row: metricName,value,asOfDate,unit,notes. `unit` is
 * REQUIRED (one of lib/connectors/units.ts's FINANCIAL_UNITS) - a value with
 * no declared unit, or a unit incompatible with the metric's own canonical
 * kind (e.g. PERCENT declared for a dollar metric), is a parse error, not a
 * guess. The declared (value, unit) is normalized into the metric's
 * canonical unit at parse time (normalizeFinancialValue) - never left for a
 * later stage to reinterpret, and never inferred from magnitude.
 */

import { z } from "zod";
import { parseCsvObjects } from "./csv-parse";
import { canonicalizeFinancialRecord, computeContentHash } from "./dedup";
import { FINANCIAL_UNITS, IncompatibleUnitError, UnrecognizedMetricError, normalizeFinancialValue, type FinancialUnit } from "./units";
import type { ConnectorCapability, ConnectorHealth, DiscoverOptions, DiscoveredSourceItem, RawSourceArtifact, SourceConnector, SourceDelta } from "./types";

const CsvRowSchema = z.object({
  metricName: z.string().min(1, "metricName is required"),
  value: z
    .string()
    .min(1, "value is required")
    .refine((v) => Number.isFinite(Number(v)), "value must be a finite number")
    .transform((v) => Number(v)),
  asOfDate: z
    .string()
    .min(1, "asOfDate is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), "asOfDate must be a parseable date"),
  unit: z
    .string()
    .min(1, `unit is required - one of: ${FINANCIAL_UNITS.join(", ")}. A value with no declared unit is never accepted, and never silently assumed to already be in this codebase's internal convention.`)
    .refine((v) => (FINANCIAL_UNITS as readonly string[]).includes(v), `unit must be one of: ${FINANCIAL_UNITS.join(", ")}`),
  notes: z.string().optional(),
});

export interface CsvParseError {
  rowIndex: number;
  raw: Record<string, string>;
  error: string;
}

export interface ParsedFinancialRow {
  rowIndex: number;
  metricName: string;
  /** The declared value, converted into the metric's canonical unit - this is what a candidate's proposedValue.value carries forward. */
  value: number;
  asOfDate: string;
  canonicalUnit: FinancialUnit;
  originalValue: number;
  originalUnit: FinancialUnit;
  withinSanityBounds: boolean;
  sanityNote?: string;
  notes?: string;
}

/**
 * Parses raw CSV text into validated, UNIT-NORMALIZED rows + a fail-closed
 * error list for any row that didn't validate or declared an unrecognized
 * metric / an incompatible unit for its metric - exported standalone so
 * tests (and the ingestion EXTRACT stage) can inspect exactly what happened
 * without instantiating a connector. A row that normalizes successfully but
 * fails the extreme-magnitude sanity check is still returned in `rows` (not
 * `errors`) with `withinSanityBounds: false` - the caller (lib/connectors/ingestion.ts)
 * is responsible for flagging the resulting candidate REVIEW_REQUIRED rather
 * than treating it as an ordinary PENDING fact.
 */
export function parseFinancialCsv(text: string): { rows: ParsedFinancialRow[]; errors: CsvParseError[] } {
  const { rows: rawRows } = parseCsvObjects(text);
  const rows: ParsedFinancialRow[] = [];
  const errors: CsvParseError[] = [];
  rawRows.forEach((raw, idx) => {
    const parsed = CsvRowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ rowIndex: idx, raw, error: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ") });
      return;
    }
    let normalization;
    try {
      normalization = normalizeFinancialValue(parsed.data.metricName, parsed.data.value, parsed.data.unit as FinancialUnit);
    } catch (err) {
      const message = err instanceof UnrecognizedMetricError || err instanceof IncompatibleUnitError ? err.message : `unexpected unit-normalization error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push({ rowIndex: idx, raw, error: message });
      return;
    }
    rows.push({
      rowIndex: idx,
      metricName: parsed.data.metricName,
      value: normalization.normalizedValue,
      asOfDate: parsed.data.asOfDate,
      canonicalUnit: normalization.canonicalUnit,
      originalValue: normalization.originalValue,
      originalUnit: normalization.originalUnit,
      withinSanityBounds: normalization.withinSanityBounds,
      sanityNote: normalization.sanityNote,
      notes: parsed.data.notes || undefined,
    });
  });
  return { rows, errors };
}

export interface CsvFinancialConnectorConfig {
  /** The uploaded file's raw bytes, provided at construction time (a push-based connector - see this file's own header comment) or per-discover() call via DiscoverOptions.rawInput. */
  rawCsv?: Buffer;
  sourceLabel?: string;
}

export class CsvFinancialConnector implements SourceConnector {
  private readonly rawCsv?: Buffer;
  private readonly sourceLabel: string;
  private lastParseErrors: CsvParseError[] = [];
  private lastParsedRows: ParsedFinancialRow[] = [];

  constructor(config: CsvFinancialConnectorConfig = {}) {
    this.rawCsv = config.rawCsv;
    this.sourceLabel = config.sourceLabel ?? "csv-upload";
  }

  capabilities(): ConnectorCapability[] {
    return ["FINANCIAL_FACTS", "DEBT_BALANCES", "CASH_BALANCES"];
  }

  /** Every skipped row from the most recent discover() call - fail-closed reporting, never silent. */
  getLastParseErrors(): CsvParseError[] {
    return this.lastParseErrors;
  }

  async discover(options: DiscoverOptions): Promise<DiscoveredSourceItem[]> {
    const bytes = options.rawInput ?? this.rawCsv;
    if (!bytes) {
      throw new Error("CsvFinancialConnector.discover: no CSV bytes available - pass rawCsv at construction or rawInput via DiscoverOptions.");
    }
    const text = bytes.toString("utf-8");
    const { rows, errors } = parseFinancialCsv(text);
    this.lastParsedRows = rows;
    this.lastParseErrors = errors;

    return rows.map((row) => ({
      id: `row-${row.rowIndex}`,
      artifactType: "FINANCIAL_RECORD" as const,
      sourceIdentifier: `${this.sourceLabel}:row-${row.rowIndex}`,
      effectiveDate: row.asOfDate,
      summary: `${row.metricName} = ${row.originalValue} ${row.originalUnit} (normalized: ${row.value} ${row.canonicalUnit}) as of ${row.asOfDate}${row.withinSanityBounds ? "" : " [FLAGGED: exceeds sanity ceiling]"}`,
    }));
  }

  async fetch(item: DiscoveredSourceItem): Promise<RawSourceArtifact> {
    const row = this.lastParsedRows.find((r) => `row-${r.rowIndex}` === item.id);
    if (!row) {
      throw new Error(`CsvFinancialConnector.fetch: no parsed row matches item id ${item.id} - call discover() first, in the same connector instance.`);
    }
    const rawPayload: Record<string, unknown> = {
      metricName: row.metricName,
      value: row.value,
      asOfDate: row.asOfDate,
      canonicalUnit: row.canonicalUnit,
      originalValue: row.originalValue,
      originalUnit: row.originalUnit,
      withinSanityBounds: row.withinSanityBounds,
      sanityNote: row.sanityNote ?? null,
      notes: row.notes ?? null,
    };
    const data = canonicalizeFinancialRecord(rawPayload);
    return { item, data, rawPayload, contentHash: computeContentHash(data), mimeType: "application/json" };
  }

  /** A CSV upload is a one-shot batch, not a pollable feed - `cursor` is accepted for interface conformity but ignored; every call returns the full current parse as NEW. Ingestion only calls syncSince for a SYNC-kind job, which a CSV_FINANCIAL connection re-runs against a freshly re-uploaded file, not this same in-memory instance. */
  async syncSince(_cursor: string | null): Promise<SourceDelta[]> {
    const items = await this.discover({});
    return items.map((item) => ({ changeType: "NEW" as const, item }));
  }

  /** Purely local parsing, no external dependency - always healthy unless constructed with genuinely no bytes at all, which discover()/fetch() already surface loudly. */
  async healthCheck(): Promise<ConnectorHealth> {
    return { ok: true };
  }
}
