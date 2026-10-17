/**
 * POST /api/billing/checkout  { plan: "<planKey from STRIPE_PRICE_IDS>" }
 * Creates a Stripe Checkout session for the SIGNED-IN user's own workspace.
 * The workspace is taken from the session, never from the request body.
 * Only a platform ADMIN or a designated workspace billing owner may start one (403 otherwise).
 * 401 no session · 403 not a billing owner · 400 unknown plan · 503 BILLING_DISABLED /
 * BILLING_STORE_UNAVAILABLE (no Stripe call when our own store can't be read) · 502 Stripe error.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/guard";
import { getBillingConfig } from "@/lib/billing/config";
import { createCheckoutSession, StripeApiError } from "@/lib/billing/stripe-api";
import { prisma } from "@/lib/prisma";
import { canManageBilling, loadWorkspaceSubscription } from "@/lib/billing/prisma-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const config = getBillingConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "BILLING_DISABLED", detail: "Billing is not configured for this deployment." }, { status: 503 });
  }
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  let allowed: boolean;
  try {
    allowed = await canManageBilling(prisma, user);
  } catch {
    return NextResponse.json({ error: "BILLING_STORE_UNAVAILABLE" }, { status: 503 });
  }
  if (!allowed) return NextResponse.json({ error: "BILLING_OWNER_REQUIRED" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { plan?: unknown };
  const plan = config.plans.find((p) => p.key === body.plan);
  if (!plan) return NextResponse.json({ error: "UNKNOWN_PLAN", plans: config.plans.map((p) => p.key) }, { status: 400 });

  let existing: Awaited<ReturnType<typeof loadWorkspaceSubscription>>;
  try {
    existing = await loadWorkspaceSubscription(prisma, user.companyId);
  } catch {
    // Never treat a read failure as "no subscription": that would mint a second Stripe customer.
    return NextResponse.json({ error: "BILLING_STORE_UNAVAILABLE" }, { status: 503 });
  }
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
