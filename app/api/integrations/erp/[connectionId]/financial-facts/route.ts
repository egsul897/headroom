/**
 * ERP push ingestion endpoint (ERP-1): POST a normalized financial-facts
 * delivery (lib/erp/types.ts's ErpFinancialFactsPayload) for ONE connection.
 *
 * Authentication is per-connection and machine-to-machine - NOT the user
 * session: `Authorization: Bearer <token>` (or `x-headroom-erp-token`),
 * verified against the connection's stored token HASH (lib/erp/secret.ts).
 * The company is derived from the connection row, never from the request -
 * there is no companyId input on this route at all, so a token physically
 * cannot write another tenant's data.
 *
 * Send `Idempotency-Key: <key>` with every delivery: re-delivery with the
 * same key + identical body is a no-op returning the original outcome;
 * the same key with a different body is refused (409). All attempts -
 * accepted, duplicate, and refused - are audited in ErpSyncEvent.
 *
 * The route is a thin wrapper: lib/erp/ingest.ts does all the work.
 */

import { NextResponse } from "next/server";
import { ingestErpFinancialFacts } from "@/lib/erp/ingest";
import { erpTokenFromHeaders } from "@/lib/erp/secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const rawBody = await req.text();
  const result = await ingestErpFinancialFacts({
    connectionId,
    rawBody,
    presentedToken: erpTokenFromHeaders(req.headers),
    idempotencyKey: req.headers.get("idempotency-key"),
  });
  return NextResponse.json(
    {
      ok: result.ok,
      eventId: result.eventId,
      ...(result.originalEventId ? { originalEventId: result.originalEventId } : {}),
      outcome: result.outcome,
      detail: result.detail,
      counts: result.counts,
    },
    { status: result.status },
  );
}
