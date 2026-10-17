/**
 * Server-side plan gate for a workspace. Use before a gated feature:
 *   const gate = await checkWorkspacePlan(companyId);
 *   if (!gate.allowed) return 402 / upsell.
 * Enforcement is OFF unless HEADROOM_BILLING_ENFORCE=1; when ON and Stripe is
 * not configured, every gated feature is denied (fail closed).
 */
import { prisma } from "@/lib/prisma";
import { getBillingConfig } from "./config";
import { evaluatePlanGate, type PlanGateDecision } from "./plan-gate";
import { loadWorkspaceSubscription } from "./prisma-store";

export async function checkWorkspacePlan(companyId: string, opts: { requiredPlans?: string[] } = {}): Promise<PlanGateDecision> {
  const config = getBillingConfig();
  if (!config.enforce) return evaluatePlanGate(null, config, opts);
  let sub: Awaited<ReturnType<typeof loadWorkspaceSubscription>> = null;
  try {
    sub = await loadWorkspaceSubscription(prisma, companyId);
  } catch {
    // Infrastructure error while enforcing: deny, never open the gate.
    return { allowed: false, reason: "STORE_UNAVAILABLE", plan: null };
  }
  return evaluatePlanGate(
    sub ? { plan: sub.plan, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd } : null,
    config,
    opts,
  );
}
