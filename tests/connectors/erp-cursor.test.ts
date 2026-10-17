/**
 * ERP sync cursor - versioned opaque encoding, strict fail-closed decode
 * (a malformed or foreign cursor throws; it NEVER silently resets to a
 * full resync), and the overlap-window math delta syncs query with.
 */
import { describe, expect, it } from "vitest";
import { cursorWindowStart, decodeErpCursor, encodeErpCursor, ErpCursorError, ERP_CURSOR_OVERLAP_MS } from "../../lib/connectors/erp/cursor";
import type { ErpSyncCursor } from "../../lib/connectors/erp/types";

const TXN_CURSOR: ErpSyncCursor = {
  version: 1,
  provider: "NETSUITE",
  stream: "TRANSACTIONS",
  modifiedSince: "2026-10-17T14:30:00.000Z",
  lastExternalId: "98765",
};

describe("encodeErpCursor / decodeErpCursor", () => {
  it("round-trips a full cursor", () => {
    const encoded = encodeErpCursor(TXN_CURSOR);
    expect(encoded.startsWith("erp-cursor.")).toBe(true);
    expect(decodeErpCursor(encoded, { provider: "NETSUITE", stream: "TRANSACTIONS" })).toEqual(TXN_CURSOR);
  });

  it("round-trips an in-flight page cursor carrying an offset", () => {
    const inFlight: ErpSyncCursor = { version: 1, provider: "NETSUITE", stream: "TRANSACTIONS", modifiedSince: "2026-10-01T00:00:00.000Z", offset: 2000 };
    expect(decodeErpCursor(encodeErpCursor(inFlight), { provider: "NETSUITE", stream: "TRANSACTIONS" })).toEqual(inFlight);
  });

  it("rejects a value without the erp-cursor prefix", () => {
    expect(() => decodeErpCursor("aGVsbG8=", { provider: "NETSUITE", stream: "TRANSACTIONS" })).toThrow(ErpCursorError);
  });

  it("rejects a payload that is not JSON", () => {
    const bogus = "erp-cursor." + Buffer.from("not json at all", "utf8").toString("base64url");
    expect(() => decodeErpCursor(bogus, { provider: "NETSUITE", stream: "TRANSACTIONS" })).toThrow(ErpCursorError);
  });

  it("rejects an unsupported version", () => {
    const v2 = "erp-cursor." + Buffer.from(JSON.stringify({ version: 2, provider: "NETSUITE", stream: "TRANSACTIONS", modifiedSince: "2026-10-17T00:00:00.000Z" }), "utf8").toString("base64url");
    expect(() => decodeErpCursor(v2, { provider: "NETSUITE", stream: "TRANSACTIONS" })).toThrow(ErpCursorError);
  });

  it("rejects a cursor minted for a different provider", () => {
    const encoded = encodeErpCursor(TXN_CURSOR);
    expect(() => decodeErpCursor(encoded, { provider: "QUICKBOOKS_ONLINE", stream: "TRANSACTIONS" })).toThrow(ErpCursorError);
  });

  it("rejects a cursor minted for a different stream", () => {
    const encoded = encodeErpCursor(TXN_CURSOR);
    expect(() => decodeErpCursor(encoded, { provider: "NETSUITE", stream: "FINANCIAL_FACTS" })).toThrow(ErpCursorError);
  });

  it("rejects an unparseable watermark", () => {
    const bad = "erp-cursor." + Buffer.from(JSON.stringify({ version: 1, provider: "NETSUITE", stream: "TRANSACTIONS", modifiedSince: "yesterday-ish" }), "utf8").toString("base64url");
    expect(() => decodeErpCursor(bad, { provider: "NETSUITE", stream: "TRANSACTIONS" })).toThrow(ErpCursorError);
  });

  it("rejects a negative offset", () => {
    const bad = "erp-cursor." + Buffer.from(JSON.stringify({ version: 1, provider: "NETSUITE", stream: "TRANSACTIONS", modifiedSince: "2026-10-17T00:00:00.000Z", offset: -1 }), "utf8").toString("base64url");
    expect(() => decodeErpCursor(bad, { provider: "NETSUITE", stream: "TRANSACTIONS" })).toThrow(ErpCursorError);
  });
});

describe("cursorWindowStart", () => {
  it("returns the epoch for a first sync (null cursor)", () => {
    expect(cursorWindowStart(null, "2000-01-01T00:00:00.000Z")).toBe("2000-01-01T00:00:00.000Z");
  });

  it("subtracts exactly the overlap window from the stored watermark", () => {
    const start = cursorWindowStart(TXN_CURSOR, "2000-01-01T00:00:00.000Z");
    expect(Date.parse(start)).toBe(Date.parse(TXN_CURSOR.modifiedSince) - ERP_CURSOR_OVERLAP_MS);
  });
});
