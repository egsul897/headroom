/**
 * Per-workspace plan gate. Pure: callers pass the subscription row (or null)
 * and the billing config. Never reads Stripe; the row is only ever written
 * by the verified webhook.
 */
import type { BillingConfig } from "./config";

export type SubscriptionStatus =
  | "INCOMPLETE"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "PAUSED"
  | "UNKNOWN";

export interface SubscriptionSnapshot {
  plan: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}

export type PlanGateDecision =
  | { allowed: true; reason: "NOT_ENFORCED" | "SUBSCRIPTION_ACTIVE"; plan: string | null }
  | {
      allowed: false;
      reason:
        | "BILLING_NOT_CONFIGURED"
        | "NO_SUBSCRIPTION"
        /** The subscription store could not be read: unknown, denied while enforcing. */
        | "STORE_UNAVAILABLE"
        | "SUBSCRIPTION_INACTIVE"
        | "PERIOD_ENDED"
        | "PLAN_NOT_ELIGIBLE";
      plan: string | null;
    };

const ACTIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["ACTIVE", "TRIALING"]);

export function evaluatePlanGate(
  sub: SubscriptionSnapshot | null,
  config: BillingConfig,
  opts: { requiredPlans?: string[]; now?: Date } = {},
): PlanGateDecision {
  if (!config.enforce) return { allowed: true, reason: "NOT_ENFORCED", plan: sub?.plan ?? null };
  // Enforcement requested but Stripe is not configured: fail closed.
  if (!config.enabled) return { allowed: false, reason: "BILLING_NOT_CONFIGURED", plan: null };
  if (!sub) return { allowed: false, reason: "NO_SUBSCRIPTION", plan: null };
  if (!ACTIVE_STATUSES.has(sub.status)) return { allowed: false, reason: "SUBSCRIPTION_INACTIVE", plan: sub.plan };
  const now = opts.now ?? new Date();
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now.getTime()) {
    return { allowed: false, reason: "PERIOD_ENDED", plan: sub.plan };
  }
  if (opts.requiredPlans && opts.requiredPlans.length) {
    if (!sub.plan || !opts.requiredPlans.includes(sub.plan)) return { allowed: false, reason: "PLAN_NOT_ELIGIBLE", plan: sub.plan };
  }
  return { allowed: true, reason: "SUBSCRIPTION_ACTIVE", plan: sub.plan };
}

export function mapStripeStatus(s: unknown): SubscriptionStatus {
  switch (s) {
    case "incomplete":
    case "incomplete_expired":
      return "INCOMPLETE";
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "paused":
      return "PAUSED";
    default:
      return "UNKNOWN";
  }
}
