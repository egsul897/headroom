/**
 * Source connector abstraction (docs/autonomous-retrieval-phase-a-foundation.md).
 *
 * The one interface every downstream caller (ingestion, dedup, extraction)
 * programs against - never against a concrete connector (EdgarConnector/
 * CsvFinancialConnector/UploadConnector) directly. Mirrors the exact "one
 * interface, one factory that branches on config once" discipline
 * lib/document-storage/**'s DocumentStorageProvider and
 * lib/extraction/provider.ts's ContractExtractionProvider already established
 * in this codebase - see lib/connectors/registry.ts's getConnectorForConnection
 * for this phase's own factory.
 */

/**
 * Mirrors the schema's CompanySourceConnection.capabilities column (stored as
 * a plain String[], not a Prisma enum array - see that model's own comment
 * for why). What kinds of source material a connector instance can produce.
 */
export type ConnectorCapability = "DOCUMENTS" | "FINANCIAL_FACTS" | "DEBT_BALANCES" | "CASH_BALANCES" | "TRANSACTIONS" | "RATES" | "COMPLIANCE_INPUTS";

export type ConnectorArtifactType = "DOCUMENT" | "FINANCIAL_RECORD";

/**
 * Enough for a review UI to list "found: 2024 10-K Exhibit 10.1" before
 * fetching any bytes - discovery is deliberately cheap and side-effect-free
 * relative to fetch(). `id` is a connector-defined identifier, stable across
 * repeated discover() calls for the same underlying item (not a database id -
 * the ingestion FETCH stage uses it only to correlate a DiscoveredSourceItem
 * back to the fetch() call it drives).
 */
export interface DiscoveredSourceItem {
  id: string;
  artifactType: ConnectorArtifactType;
  sourceIdentifier: string;
  sourceUri?: string;
  /** ISO date string. */
  effectiveDate?: string;
  summary: string;
}

/**
 * The discovered item's actual bytes/rawPayload plus dedup/storage
 * provenance. `data` always carries real bytes (a document's file contents,
 * or a canonical JSON encoding of a financial record row - see
 * lib/connectors/dedup.ts's computeContentHash, which this is built to feed
 * directly). `rawPayload` is populated for FINANCIAL_RECORD artifacts only -
 * the parsed, JSON-safe source row (SourceArtifact.rawPayload's own shape).
 */
export interface RawSourceArtifact {
  item: DiscoveredSourceItem;
  data: Buffer;
  rawPayload?: unknown;
  contentHash: string;
  mimeType?: string;
}

export type SourceDeltaChangeType = "NEW" | "UPDATED";

export interface SourceDelta {
  changeType: SourceDeltaChangeType;
  item: DiscoveredSourceItem;
}

export interface ConnectorHealth {
  ok: boolean;
  message?: string;
}

/**
 * `since`/`limit` are optional, connector-specific-interpretation filters -
 * e.g. EdgarConnector treats `since` as a filing-date lower bound and `limit`
 * as a cap on how many filings' index pages it will open in one discover()
 * call (each is a real network request - see that file's own comment).
 *
 * `rawInput` is a deliberate, pragmatic extension beyond the brief's literal
 * `discover(options)` signature: a PUSH-based connector (CsvFinancialConnector,
 * UploadConnector) has no remote source to poll - its "discovery" is parsing
 * bytes the caller already has in hand (an uploaded file). Rather than
 * inventing a second, parallel interface for push-based connectors, this
 * field lets discover() accept those bytes through the SAME SourceConnector
 * contract every other connector implements; EdgarConnector (a genuine
 * pull-based connector) simply ignores it. Documented here rather than left
 * as an undocumented surprise.
 */
export interface DiscoverOptions {
  since?: string;
  limit?: number;
  rawInput?: Buffer;
}

/**
 * Every source connector this codebase will ever have (EDGAR today; a
 * future NetSuite/SAP/ERP connector later - none of which are implemented in
 * this phase, see docs/autonomous-retrieval-phase-a-foundation.md's own scope
 * boundary) implements exactly this shape. Downstream ingestion code
 * (lib/connectors/ingestion.ts) never branches on which concrete connector
 * it holds - it only ever calls these five methods.
 */
export interface SourceConnector {
  capabilities(): ConnectorCapability[];
  discover(options: DiscoverOptions): Promise<DiscoveredSourceItem[]>;
  fetch(item: DiscoveredSourceItem): Promise<RawSourceArtifact>;
  syncSince(cursor: string | null): Promise<SourceDelta[]>;
  healthCheck(): Promise<ConnectorHealth>;
}
