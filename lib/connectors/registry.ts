/**
 * Source-connection registry (docs/autonomous-retrieval-phase-a-foundation.md).
 *
 * `getConnectorForConnection` is the ONE place that branches on
 * ConnectorType to instantiate a concrete SourceConnector - mirroring
 * lib/document-storage/index.ts's `getDocumentStorageProvider()` and
 * lib/extraction/get-provider.ts's `getExtractionProvider()`'s own
 * established "one factory function, branch on config once" pattern.
 * Everything else in this codebase programs against the SourceConnector
 * interface only (lib/connectors/types.ts).
 */

import { type CompanySourceConnection, type ConnectorType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { EdgarConnector, resolveCikForTicker } from "./edgar-connector";
import { CsvFinancialConnector } from "./csv-financial-connector";
import { UploadConnector } from "./upload-connector";
import type { ConnectorCapability, SourceConnector } from "./types";

const DEFAULT_CAPABILITIES: Record<ConnectorType, ConnectorCapability[]> = {
  EDGAR: ["DOCUMENTS"],
  CSV_FINANCIAL: ["FINANCIAL_FACTS", "DEBT_BALANCES", "CASH_BALANCES"],
  DOCUMENT_UPLOAD: ["DOCUMENTS"],
};

export class UnknownTickerError extends Error {}
export class UnsupportedConnectorConfigError extends Error {}

export interface ConnectSourceParams {
  companyId: string;
  connectorType: ConnectorType;
  /** Connector-specific NON-SECRET config - e.g. EDGAR requires { ticker }. Never a credential value - see CompanySourceConnection.credentialRef's own schema comment. */
  config?: Record<string, unknown>;
  sourcePriority?: number;
  credentialRef?: string;
}

/**
 * Creates a CompanySourceConnection row, validating `config` per connector
 * type and, for EDGAR, resolving+storing the CIK at connect time via a REAL
 * healthCheck-adjacent call (resolveCikForTicker) - failing closed with a
 * clear error if the ticker doesn't resolve, rather than storing an
 * unvalidated ticker and discovering the problem later during a job run.
 */
export async function connectSource(params: ConnectSourceParams): Promise<CompanySourceConnection> {
  const { companyId, connectorType } = params;

  let provider: string;
  let resolvedConfig: Record<string, unknown> = params.config ?? {};

  if (connectorType === "EDGAR") {
    const ticker = typeof resolvedConfig.ticker === "string" ? resolvedConfig.ticker : undefined;
    if (!ticker) {
      throw new UnsupportedConnectorConfigError("connectSource: EDGAR requires config.ticker.");
    }
    const { cik, title } = await resolveCikForTicker(ticker);
    resolvedConfig = { ticker: ticker.toUpperCase(), cik, title };
    provider = "SEC EDGAR";
  } else if (connectorType === "CSV_FINANCIAL") {
    provider = "CSV upload (financial figures)";
  } else {
    provider = "Manual document upload";
  }

  return prisma.companySourceConnection.upsert({
    where: { companyId_connectorType: { companyId, connectorType } },
    create: {
      companyId,
      connectorType,
      provider,
      status: "CONNECTED",
      capabilities: DEFAULT_CAPABILITIES[connectorType],
      sourcePriority: params.sourcePriority ?? 0,
      credentialRef: params.credentialRef ?? null,
      config: resolvedConfig as Prisma.InputJsonValue,
    },
    update: {
      status: "CONNECTED",
      config: resolvedConfig as Prisma.InputJsonValue,
      errorState: null,
    },
  });
}

export async function listCompanySourceConnections(companyId: string): Promise<CompanySourceConnection[]> {
  return prisma.companySourceConnection.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
}

/**
 * Every company must have exactly one DOCUMENT_UPLOAD-type connection - this
 * is how manual upload "converges into the same ingestion system" per the
 * task brief: a first-class source connection like any other, not a special
 * case. Lazily created on first use (rather than forced at Company-creation
 * time) so this phase never had to touch app/companies/new/actions.ts's own
 * company-creation transaction - the very first call to
 * uploadDocumentThroughIngestion or the onboarding wizard's Documents stage
 * creates it, and every call after that reuses the same row (upsert, per the
 * @@unique([companyId, connectorType]) constraint).
 */
export async function getOrCreateUploadConnection(companyId: string): Promise<CompanySourceConnection> {
  return prisma.companySourceConnection.upsert({
    where: { companyId_connectorType: { companyId, connectorType: "DOCUMENT_UPLOAD" } },
    create: {
      companyId,
      connectorType: "DOCUMENT_UPLOAD",
      provider: "Manual document upload",
      status: "CONNECTED",
      capabilities: DEFAULT_CAPABILITIES.DOCUMENT_UPLOAD,
    },
    update: {},
  });
}

/**
 * The one factory function that branches on connectorType. EDGAR reads its
 * resolved { cik, ticker } straight from the connection's own stored config
 * (set once, at connectSource() time - see above); CSV_FINANCIAL/
 * DOCUMENT_UPLOAD are push-based and need per-call bytes that don't live on
 * the persisted connection row at all, so this factory returns an EMPTY
 * instance for those two (no rawCsv/data bound) - the caller (lib/connectors/
 * ingestion.ts's FETCH stage, or lib/connectors/upload-connector.ts's own
 * direct integration path) is responsible for constructing a bytes-bound
 * instance itself when it actually has bytes in hand. Documented here rather
 * than silently surprising a caller that expected every connector from this
 * factory to be immediately usable.
 */
export function getConnectorForConnection(connection: CompanySourceConnection): SourceConnector {
  switch (connection.connectorType) {
    case "EDGAR": {
      const config = (connection.config as { cik?: string; ticker?: string } | null) ?? {};
      if (!config.cik) {
        throw new UnsupportedConnectorConfigError(`getConnectorForConnection: EDGAR connection ${connection.id} has no resolved cik in its config.`);
      }
      return new EdgarConnector({ cik: config.cik, ticker: config.ticker });
    }
    case "CSV_FINANCIAL":
      return new CsvFinancialConnector();
    case "DOCUMENT_UPLOAD":
      return new UploadConnector({ filename: "" });
    default: {
      const exhaustive: never = connection.connectorType;
      throw new UnsupportedConnectorConfigError(`getConnectorForConnection: unhandled connectorType ${String(exhaustive)}.`);
    }
  }
}
