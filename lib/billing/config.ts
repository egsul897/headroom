/**
 * Billing configuration — read from env only, never invented.
 *
 * Billing is OFF unless ALL of these are set:
 *   STRIPE_SECRET_KEY      sk_live_… / sk_test_…
 *   STRIPE_WEBHOOK_SECRET  whsec_…
 *   STRIPE_PRICE_IDS       "planKey:price_…[,planKey:price_…]"
 *   HEADROOM_APP_URL       absolute https URL used for checkout return links
 * A malformed value counts as unset. When OFF, checkout and webhook routes
 * answer 503 BILLING_DISABLED and nothing calls Stripe.
 *
 * Enforcement of the plan gate is a separate, explicit switch
 * (HEADROOM_BILLING_ENFORCE=1). Enforce ON + billing OFF ⇒ gated features
 * are DENIED (fail closed), never silently open.
 */

type Env = Record<string, string | undefined>;

export interface BillingPlan {
  key: string;
  priceId: string;
}

export type BillingConfig =
  | {
      enabled: true;
      secretKey: string;
      webhookSecret: string;
      plans: BillingPlan[];
      appUrl: string;
      enforce: boolean;
    }
  | { enabled: false; missing: string[]; enforce: boolean };

export function parsePriceIds(raw: string | undefined): BillingPlan[] | null {
  if (!raw || !raw.trim()) return null;
  const plans: BillingPlan[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const m = /^\s*([a-z][a-z0-9_-]{0,31})\s*:\s*(price_[A-Za-z0-9]+)\s*$/.exec(part);
    if (!m) return null;
    if (seen.has(m[1]!)) return null;
    seen.add(m[1]!);
    plans.push({ key: m[1]!, priceId: m[2]! });
  }
  return plans.length ? plans : null;
}

export function getBillingConfig(env: Env = process.env): BillingConfig {
  const enforce = env.HEADROOM_BILLING_ENFORCE === "1";
  const missing: string[] = [];
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey || !/^sk_(live|test)_[A-Za-z0-9]+$/.test(secretKey)) missing.push("STRIPE_SECRET_KEY");
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret || !/^whsec_[A-Za-z0-9+/=]+$/.test(webhookSecret)) missing.push("STRIPE_WEBHOOK_SECRET");
  const plans = parsePriceIds(env.STRIPE_PRICE_IDS);
  if (!plans) missing.push("STRIPE_PRICE_IDS");
  let appUrl: string | null = null;
  try {
    const u = new URL(env.HEADROOM_APP_URL ?? "");
    if (u.protocol === "https:" || (u.protocol === "http:" && u.hostname === "localhost")) appUrl = u.origin;
  } catch {
    appUrl = null;
  }
  if (!appUrl) missing.push("HEADROOM_APP_URL");
  if (missing.length) return { enabled: false, missing, enforce };
  return { enabled: true, secretKey: secretKey!, webhookSecret: webhookSecret!, plans: plans!, appUrl: appUrl!, enforce };
}

export function planForPrice(config: BillingConfig, priceId: string | null | undefined): string | null {
  if (!config.enabled || !priceId) return null;
  return config.plans.find((p) => p.priceId === priceId)?.key ?? null;
}
