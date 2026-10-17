/**
 * ERP sync cursor encoding (ERP-3 scaffold).
 *
 * A cursor is an opaque, versioned string so it can live in
 * CompanySourceConnection.cursor (a plain String column ERP-1 owns)
 * without a schema change per provider. Encoding is base64url(JSON) with
 * an `erp-cursor.` prefix that makes a stored value self-identifying in
 * logs and database inspection.
 *
 * FAIL CLOSED: decoding validates the prefix, the version, the provider,
 * the stream, and the watermark timestamp, and throws ErpCursorError on
 * ANY deviation. It never falls back to "start from the beginning" - a
 * silently-reset cursor would re-deliver history that basket-usage
 * accounting might apply twice; whether a full resync is safe is ERP-1's
 * decision to make explicitly, not a parse failure's side effect.
 */

import type { ErpProviderKind, ErpSyncCursor, ErpSyncStream } from "./types";

export class ErpCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErpCursorError";
  }
}

const CURSOR_PREFIX = "erp-cursor.";

const PROVIDER_KINDS: readonly ErpProviderKind[] = [
  "NETSUITE",
  "QUICKBOOKS_ONLINE",
  "SAP_S4HANA",
  "ORACLE_ERP_CLOUD",
  "DYNAMICS_365_FINANCE",
  "DYNAMICS_365_BUSINESS_CENTRAL",
];

const STREAMS: readonly ErpSyncStream[] = ["FINANCIAL_FACTS", "TRANSACTIONS"];

function toBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function fromBase64Url(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf8");
}

export function encodeErpCursor(cursor: ErpSyncCursor): string {
  const payload: ErpSyncCursor = {
    version: 1,
    provider: cursor.provider,
    stream: cursor.stream,
    modifiedSince: cursor.modifiedSince,
    ...(cursor.lastExternalId !== undefined ? { lastExternalId: cursor.lastExternalId } : {}),
    ...(cursor.offset !== undefined ? { offset: cursor.offset } : {}),
  };
  return CURSOR_PREFIX + toBase64Url(JSON.stringify(payload));
}

/**
 * Decode and validate a stored cursor. `expected` pins the provider and
 * stream the caller is syncing: a cursor minted for another provider or
 * stream is a programming error or data corruption, never something to
 * adapt to silently.
 */
export function decodeErpCursor(raw: string, expected: { provider: ErpProviderKind; stream: ErpSyncStream }): ErpSyncCursor {
  if (!raw.startsWith(CURSOR_PREFIX)) {
    throw new ErpCursorError(`decodeErpCursor: value does not carry the "${CURSOR_PREFIX}" prefix - not an ERP sync cursor.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(raw.slice(CURSOR_PREFIX.length)));
  } catch {
    throw new ErpCursorError("decodeErpCursor: cursor payload is not valid base64url-encoded JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ErpCursorError("decodeErpCursor: cursor payload is not an object.");
  }
  const c = parsed as Record<string, unknown>;
  if (c.version !== 1) {
    throw new ErpCursorError(`decodeErpCursor: unsupported cursor version ${JSON.stringify(c.version)} (expected 1).`);
  }
  if (typeof c.provider !== "string" || !PROVIDER_KINDS.includes(c.provider as ErpProviderKind)) {
    throw new ErpCursorError(`decodeErpCursor: unknown provider ${JSON.stringify(c.provider)}.`);
  }
  if (typeof c.stream !== "string" || !STREAMS.includes(c.stream as ErpSyncStream)) {
    throw new ErpCursorError(`decodeErpCursor: unknown stream ${JSON.stringify(c.stream)}.`);
  }
  if (c.provider !== expected.provider || c.stream !== expected.stream) {
    throw new ErpCursorError(
      `decodeErpCursor: cursor is for ${c.provider}/${c.stream} but the caller is syncing ${expected.provider}/${expected.stream}.`,
    );
  }
  if (typeof c.modifiedSince !== "string" || Number.isNaN(Date.parse(c.modifiedSince))) {
    throw new ErpCursorError(`decodeErpCursor: modifiedSince ${JSON.stringify(c.modifiedSince)} is not a parseable timestamp.`);
  }
  if (c.lastExternalId !== undefined && typeof c.lastExternalId !== "string") {
    throw new ErpCursorError("decodeErpCursor: lastExternalId must be a string when present.");
  }
  if (c.offset !== undefined && (typeof c.offset !== "number" || !Number.isInteger(c.offset) || c.offset < 0)) {
    throw new ErpCursorError("decodeErpCursor: offset must be a non-negative integer when present.");
  }
  return {
    version: 1,
    provider: c.provider as ErpProviderKind,
    stream: c.stream as ErpSyncStream,
    modifiedSince: c.modifiedSince,
    ...(c.lastExternalId !== undefined ? { lastExternalId: c.lastExternalId as string } : {}),
    ...(c.offset !== undefined ? { offset: c.offset as number } : {}),
  };
}

/** The watermark a sync should query from: the stored watermark minus a
 * fixed overlap, so records committed by the provider around the previous
 * sync's read instant are re-delivered rather than missed. Overlap
 * duplicates are expected and absorbed by ingestion-side idempotency
 * (externalId-keyed), which is why correctness lives there and not in
 * pretending the provider's clock and ours agree exactly. */
export const ERP_CURSOR_OVERLAP_MS = 5 * 60 * 1000;

export function cursorWindowStart(cursor: ErpSyncCursor | null, epochIso: string): string {
  if (cursor === null) return epochIso;
  const watermarkMs = Date.parse(cursor.modifiedSince);
  return new Date(watermarkMs - ERP_CURSOR_OVERLAP_MS).toISOString();
}
