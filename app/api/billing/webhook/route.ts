/**
 * POST /api/billing/webhook — Stripe webhook endpoint.
 * 503 BILLING_DISABLED when unconfigured (nothing is recorded) ·
 * 400 on a missing/invalid signature or malformed event ·
 * 200 { outcome } once verified (DUPLICATE/IGNORED_TYPE/UNBOUND/STALE/APPLIED) ·
 * 500 on a store failure so Stripe retries.
 */
import { NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/billing/config";
import { verifyStripeSignature } from "@/lib/billing/webhook-signature";
import { applyStripeEvent, parseStripeEvent } from "@/lib/billing/webhook-events";
import { createPrismaBillingStore } from "@/lib/billing/prisma-store";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const config = getBillingConfig();
  if (!config.enabled) return NextResponse.json({ error: "BILLING_DISABLED" }, { status: 503 });
  const raw = await req.text();
  const sig = verifyStripeSignature(raw, req.headers.get("stripe-signature"), config.webhookSecret);
  if (!sig.ok) return NextResponse.json({ error: "INVALID_SIGNATURE", reason: sig.reason }, { status: 400 });
  const event = parseStripeEvent(raw);
  if (!event) return NextResponse.json({ error: "MALFORMED_EVENT" }, { status: 400 });
  try {
    const outcome = await applyStripeEvent(event, createPrismaBillingStore(prisma), config);
    return NextResponse.json({ received: true, outcome }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "STORE_FAILED" }, { status: 500 });
  }
}
