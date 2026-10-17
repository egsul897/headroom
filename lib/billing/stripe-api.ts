/**
 * Minimal Stripe REST client (fetch, form-encoded). Only the calls the
 * checkout flow needs. The key always comes from BillingConfig (env).
 */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function formEncode(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") out.push(...formEncode(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      out.push(...formEncode(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export class StripeApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function stripePost(
  secretKey: string,
  path: string,
  params: Record<string, unknown>,
  opts: { fetchImpl?: FetchLike; idempotencyKey?: string } = {},
): Promise<Record<string, unknown>> {
  const f = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await f(`https://api.stripe.com/v1/${path}`, { method: "POST", headers, body: formEncode(params).join("&") });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string } | undefined;
    // Stripe's message never contains our key; do not echo request params.
    throw new StripeApiError(res.status, err?.message?.slice(0, 300) ?? `Stripe error ${res.status}`);
  }
  return body;
}

export async function createCheckoutSession(args: {
  secretKey: string;
  priceId: string;
  companyId: string;
  customerEmail: string | null;
  existingCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
  fetchImpl?: FetchLike;
  idempotencyKey?: string;
}): Promise<{ id: string; url: string }> {
  const params: Record<string, unknown> = {
    mode: "subscription",
    line_items: [{ price: args.priceId, quantity: 1 }],
    client_reference_id: args.companyId,
    metadata: { companyId: args.companyId },
    subscription_data: { metadata: { companyId: args.companyId } },
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  };
  if (args.existingCustomerId) params.customer = args.existingCustomerId;
  else if (args.customerEmail) params.customer_email = args.customerEmail;
  const s = await stripePost(args.secretKey, "checkout/sessions", params, { fetchImpl: args.fetchImpl, idempotencyKey: args.idempotencyKey });
  if (typeof s.id !== "string" || typeof s.url !== "string") throw new StripeApiError(502, "Stripe returned no checkout URL");
  return { id: s.id, url: s.url };
}
