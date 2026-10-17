/**
 * POST /api/billing/checkout  { plan: "<planKey from STRIPE_PRICE_IDS>" }
 * Creates a Stripe Checkout session for the SIGNED-IN user's own workspace.
 * The workspace is taken from the session, never from the request body.
 * 401 no session · 400 unknown plan · 503 BILLING_DISABLED · 502 Stripe error.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/guard";
import { getBillingConfig } from "@/lib/billing/config";
import { createCheckoutSession, StripeApiError } from "@/lib/billing/stripe-api";
import { prisma } from "@/lib/prisma";
import { loadWorkspaceSubscription } from "@/lib/billing/prisma-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const config = getBillingConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "BILLING_DISABLED", detail: "Billing is not configured for this deployment." }, { status: 503 });
  }
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { plan?: unknown };
  const plan = config.plans.find((p) => p.key === body.plan);
  if (!plan) return NextResponse.json({ error: "UNKNOWN_PLAN", plans: config.plans.map((p) => p.key) }, { status: 400 });

  const existing = await loadWorkspaceSubscription(prisma, user.companyId).catch(() => null);
  try {
    const session = await createCheckoutSession({
      secretKey: config.secretKey,
      priceId: plan.priceId,
      companyId: user.companyId,
      customerEmail: user.email ?? null,
      existingCustomerId: existing?.stripeCustomerId ?? null,
      successUrl: `${config.appUrl}/${user.companyId}/dashboard?billing=success`,
      cancelUrl: `${config.appUrl}/${user.companyId}/dashboard?billing=cancelled`,
    });
    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    const status = err instanceof StripeApiError ? 502 : 500;
    return NextResponse.json({ error: "CHECKOUT_FAILED" }, { status });
  }
}
