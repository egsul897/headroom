/**
 * ERP connection provisioning (lib/erp/types.ts's contract, write side).
 *
 * An ERP connection is a CompanySourceConnection row with connectorType ERP -
 * the SAME connection table EDGAR/CSV/upload use, so listCompanySourceConnections,
 * source priority, status and the sync cursor all work uniformly. What is
 * ERP-specific lives here: provider-kind validation, the explicit
 * metricKeyMap, the external account reference, and the inbound ingestion
 * secret (generated here, stored only as a hash - lib/erp/secret.ts).
 *
 * Creation deliberately does NOT go through lib/connectors/registry.ts's
 * connectSource: that path manages pull/push-file connectors with no secret
 * material, and silently upserting over an existing ERP connection would
 * orphan the previously issued token's hash without an audit trail. A second
 * ERP connection for the same company fails closed here (the table's
 * @@unique([companyId, connectorType]) is the backstop) - rotate the secret
 * on the existing connection instead.
 */

import { Prisma, type CompanySourceConnection, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { CANONICAL_UNIT_BY_METRIC } from "../connectors/units";
import { generateErpSecret } from "./secret";
import { ERP_DEFAULT_CAPABILITIES, isErpProviderKind, type ErpProviderKind } from "./types";

type ErpDbClient = PrismaClient | Prisma.TransactionClient;

export class ErpConnectionExistsError extends Error {}
export class UnsupportedErpConfigError extends Error {}
export class ErpConnectionNotFoundError extends Error {}

export interface CreateErpConnectionParams {
  companyId: string;
  providerKind: ErpProviderKind;
  /** Provider-side account/tenant identifier (e.g. a NetSuite account id) - reference data, stored verbatim, never a credential. */
  externalAccountRef?: string;
  /**
   * Explicit ERP-key -> canonical-metric mapping provisioned by a human
   * (e.g. { "1000": "cash", "2100": "total_debt" }). This is CONFIGURATION,
   * reviewed at provisioning time - the only mapping authority besides a key
   * already being a canonical metric name. Ingestion never invents entries.
   */
  metricKeyMap?: Record<string, string>;
  sourcePriority?: number;
  /** The provisioning user's id, from a real session - recorded on the row; omit rather than fabricate when no identity exists. */
  createdBy?: string;
}

export interface CreatedErpConnection {
  connection: CompanySourceConnection;
  /** The raw inbound ingestion token - shown ONCE here; only its sha256 is stored. */
  secret: string;
}

function validateMetricKeyMap(metricKeyMap: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, metric] of Object.entries(metricKeyMap ?? {})) {
    if (!key.trim()) {
      throw new UnsupportedErpConfigError("createErpConnection: metricKeyMap contains an empty source key.");
    }
    if (!(metric in CANONICAL_UNIT_BY_METRIC)) {
      throw new UnsupportedErpConfigError(
        `createErpConnection: metricKeyMap maps "${key}" to "${metric}", which is not a canonical metric name (lib/connectors/units.ts CANONICAL_UNIT_BY_METRIC) - refusing to store a mapping ingestion would have to guess at.`,
      );
    }
    out[key] = metric;
  }
  return out;
}

export async function createErpConnection(params: CreateErpConnectionParams, client: ErpDbClient = prisma): Promise<CreatedErpConnection> {
  if (!isErpProviderKind(params.providerKind)) {
    throw new UnsupportedErpConfigError(`createErpConnection: providerKind "${String(params.providerKind)}" is not one of NETSUITE, SAP, ORACLE, DYNAMICS, GENERIC.`);
  }
  const metricKeyMap = validateMetricKeyMap(params.metricKeyMap);

  const existing = await client.companySourceConnection.findUnique({
    where: { companyId_connectorType: { companyId: params.companyId, connectorType: "ERP" } },
  });
  if (existing) {
    throw new ErpConnectionExistsError(
      `createErpConnection: company ${params.companyId} already has an ERP connection (${existing.id}). Rotate its secret or update its config instead of creating a second one.`,
    );
  }

  const { secret, secretHash } = generateErpSecret();
  const connection = await client.companySourceConnection.create({
    data: {
      companyId: params.companyId,
      connectorType: "ERP",
      provider: params.providerKind,
      status: "CONNECTED",
      capabilities: [...ERP_DEFAULT_CAPABILITIES],
      sourcePriority: params.sourcePriority ?? 0,
      externalAccountRef: params.externalAccountRef ?? null,
      inboundSecretHash: secretHash,
      createdBy: params.createdBy ?? null,
      updatedBy: params.createdBy ?? null,
      config: {
        providerKind: params.providerKind,
        ...(Object.keys(metricKeyMap).length > 0 ? { metricKeyMap } : {}),
      } as Prisma.InputJsonValue,
    },
  });
  return { connection, secret };
}

export interface RotateErpSecretResult {
  connection: CompanySourceConnection;
  /** The NEW raw token - shown once. The previous token stops working the moment this returns. */
  secret: string;
}

/**
 * Replaces the connection's inbound secret. The old hash is overwritten in
 * the same write - there is no grace window with two live tokens (a leaked
 * token is the reason to rotate; a window would defeat it). Facts/events
 * already ingested are untouched - provenance references the connection,
 * not the token.
 */
export async function rotateErpConnectionSecret(
  params: { connectionId: string; updatedBy?: string },
  client: ErpDbClient = prisma,
): Promise<RotateErpSecretResult> {
  const existing = await client.companySourceConnection.findUnique({ where: { id: params.connectionId } });
  if (!existing || existing.connectorType !== "ERP") {
    throw new ErpConnectionNotFoundError(`rotateErpConnectionSecret: no ERP connection with id ${params.connectionId}.`);
  }
  const { secret, secretHash } = generateErpSecret();
  const connection = await client.companySourceConnection.update({
    where: { id: params.connectionId },
    data: { inboundSecretHash: secretHash, updatedBy: params.updatedBy ?? null },
  });
  return { connection, secret };
}

/**
 * Persists the sync cursor (lib/erp/types.ts's cursor contract: opaque,
 * adapter-owned). Core calls this after an accepted push delivery with the
 * delivery's externalEventId; ERP-3's pull adapters call it with the cursor
 * their sync returns. Never called for refused deliveries.
 */
export async function storeErpSyncCursor(params: { connectionId: string; cursor: string }, client: ErpDbClient = prisma): Promise<void> {
  await client.companySourceConnection.update({
    where: { id: params.connectionId },
    data: { cursor: params.cursor, lastSuccessfulSyncAt: new Date() },
  });
}
