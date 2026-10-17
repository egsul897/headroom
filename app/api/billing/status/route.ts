/**
 * GET /api/billing/status — the signed-in workspace's own billing state.
 * Reports what is stored; never invents a plan or status.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/guard";
import { getBillingConfig } from "@/lib/billing/config";
import { checkWorkspacePlan } from "@/lib/billing/gate";
import { loadWorkspaceSubscription } from "@/lib/billing/prisma-store";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const config = getBillingConfig();
  const gate = await checkWorkspacePlan(user.companyId);
  let sub: Awaited<ReturnType<typeof loadWorkspaceSubscription>> = null;
  if (config.enabled) {
    try {
      sub = await loadWorkspaceSubscription(prisma, user.companyId);
    } catch {
      // A store failure is "unknown", never "no subscription".
      return NextResponse.json({ error: "BILLING_STORE_UNAVAILABLE", billingEnabled: true, subscription: null, gate }, { status: 503 });
    }
  }
  return NextResponse.json({
    billingEnabled: config.enabled,
    enforced: config.enforce,
    plans: config.enabled ? config.plans.map((p) => p.key) : [],
    subscription: sub
      ? { plan: sub.plan, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd }
      : null,
    gate,
  });
}
