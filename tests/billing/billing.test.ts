import { describe, expect, it, vi } from "vitest";
import { getBillingConfig, parsePriceIds, planForPrice } from "@/lib/billing/config";
import { evaluatePlanGate, mapStripeStatus } from "@/lib/billing/plan-gate";
import { signStripePayload, verifyStripeSignature } from "@/lib/billing/webhook-signature";
import { applyStripeEvent, parseStripeEvent, type BillingStore, type StripeEvent, type SubscriptionPatch } from "@/lib/billing/webhook-events";
import { createCheckoutSession, formEncode } from "@/lib/billing/stripe-api";

const FULL_ENV = {
  STRIPE_SECRET_KEY: "sk_test_abc123",
  STRIPE_WEBHOOK_SECRET: "whsec_testsecret",
  STRIPE_PRICE_IDS: "standard:price_111,pro:price_222",
  HEADROOM_APP_URL: "https://app.example.com/whatever",
};

describe("billing config fails closed", () => {
  it("is OFF with every missing key listed when nothing is set", () => {
    const c = getBillingConfig({});
    expect(c.enabled).toBe(false);
    if (!c.enabled) expect(c.missing).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_IDS", "HEADROOM_APP_URL"]);
  });
  it("is OFF when any single key is missing or malformed", () => {
    for (const k of Object.keys(FULL_ENV)) {
      expect(getBillingConfig({ ...FULL_ENV, [k]: undefined }).enabled).toBe(false);
      expect(getBillingConfig({ ...FULL_ENV, [k]: "garbage value" }).enabled).toBe(false);
    }
  });
  it("is ON only with all four valid; appUrl normalised to origin", () => {
    const c = getBillingConfig(FULL_ENV);
    expect(c.enabled).toBe(true);
    if (c.enabled) {
      expect(c.appUrl).toBe("https://app.example.com");
      expect(c.plans.map((p) => p.key)).toEqual(["standard", "pro"]);
    }
  });
  it("rejects duplicate plan keys and malformed price ids", () => {
    expect(parsePriceIds("a:price_1,a:price_2")).toBeNull();
    expect(parsePriceIds("a:prod_1")).toBeNull();
  });
  it("unknown price maps to no plan (never guessed)", () => {
    expect(planForPrice(getBillingConfig(FULL_ENV), "price_999")).toBeNull();
    expect(planForPrice(getBillingConfig({}), "price_111")).toBeNull();
  });
});

describe("plan gate", () => {
  const on = getBillingConfig({ ...FULL_ENV, HEADROOM_BILLING_ENFORCE: "1" });
  const active = { plan: "standard", status: "ACTIVE" as const, currentPeriodEnd: new Date("2099-01-01") };
  it("not enforced ⇒ allowed with NOT_ENFORCED", () => {
    expect(evaluatePlanGate(null, getBillingConfig(FULL_ENV)).reason).toBe("NOT_ENFORCED");
  });
  it("enforced but Stripe unconfigured ⇒ DENY (fail closed)", () => {
    const d = evaluatePlanGate(active, getBillingConfig({ HEADROOM_BILLING_ENFORCE: "1" }));
    expect(d).toMatchObject({ allowed: false, reason: "BILLING_NOT_CONFIGURED" });
  });
  it("enforced: no row / inactive / UNKNOWN / ended period / wrong plan all deny", () => {
    expect(evaluatePlanGate(null, on).reason).toBe("NO_SUBSCRIPTION");
    expect(evaluatePlanGate({ ...active, status: "PAST_DUE" }, on).reason).toBe("SUBSCRIPTION_INACTIVE");
    expect(evaluatePlanGate({ ...active, status: "UNKNOWN" }, on).reason).toBe("SUBSCRIPTION_INACTIVE");
    expect(evaluatePlanGate({ ...active, currentPeriodEnd: new Date("2000-01-01") }, on).reason).toBe("PERIOD_ENDED");
    expect(evaluatePlanGate(active, on, { requiredPlans: ["pro"] }).reason).toBe("PLAN_NOT_ELIGIBLE");
  });
  it("enforced + active ⇒ allowed", () => {
    expect(evaluatePlanGate(active, on)).toMatchObject({ allowed: true, reason: "SUBSCRIPTION_ACTIVE" });
    expect(evaluatePlanGate({ ...active, status: "TRIALING" }, on).allowed).toBe(true);
  });
  it("unknown Stripe status maps to UNKNOWN", () => {
    expect(mapStripeStatus("something_new")).toBe("UNKNOWN");
    expect(mapStripeStatus("incomplete_expired")).toBe("INCOMPLETE");
  });
});

describe("webhook signature", () => {
  const secret = "whsec_testsecret";
  const body = '{"id":"evt_1"}';
  it("accepts a valid signature within tolerance", () => {
    const h = signStripePayload(body, secret, 1_000_000);
    expect(verifyStripeSignature(body, h, secret, { nowSec: 1_000_100 }).ok).toBe(true);
  });
  it("rejects tampered body, wrong secret, stale timestamp, missing/malformed header", () => {
    const h = signStripePayload(body, secret, 1_000_000);
    expect(verifyStripeSignature(body + " ", h, secret, { nowSec: 1_000_000 })).toMatchObject({ ok: false, reason: "SIGNATURE_MISMATCH" });
    expect(verifyStripeSignature(body, h, "whsec_other", { nowSec: 1_000_000 })).toMatchObject({ ok: false, reason: "SIGNATURE_MISMATCH" });
    expect(verifyStripeSignature(body, h, secret, { nowSec: 1_000_000 + 301 })).toMatchObject({ ok: false, reason: "TIMESTAMP_OUT_OF_TOLERANCE" });
    expect(verifyStripeSignature(body, null, secret)).toMatchObject({ ok: false, reason: "MISSING_HEADER" });
    expect(verifyStripeSignature(body, "t=abc,v1=zz", secret)).toMatchObject({ ok: false, reason: "MALFORMED_HEADER" });
  });
});

function memStore(companies: string[]) {
  const events = new Map<string, string>();
  const subs = new Map<string, SubscriptionPatch & Record<string, unknown>>();
  const store: BillingStore = {
    async recordEvent(e) { if (events.has(e.id)) return false; events.set(e.id, "RECEIVED"); return true; },
    async markEventProcessed(id, o) { events.set(id, o); },
    async companyExists(c) { return companies.includes(c); },
    async findCompanyIdBySubscription(s) { for (const v of subs.values()) if (v.stripeSubscriptionId === s) return v.companyId; return null; },
    async getLastEventCreated(c) { return (subs.get(c)?.lastEventCreated as number | undefined) ?? null; },
    async upsertSubscription(p) {
      const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as SubscriptionPatch;
      subs.set(p.companyId, { ...(subs.get(p.companyId) ?? {}), ...clean });
    },
  };
  return { store, events, subs };
}

const cfg = getBillingConfig(FULL_ENV);
const subEvent = (id: string, created: number, over: Record<string, unknown> = {}, type = "customer.subscription.updated"): StripeEvent => ({
  id, type, created,
  data: { object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { companyId: "co_1" }, items: { data: [{ price: { id: "price_111" }, current_period_end: 4_000_000_000 }] }, ...over } },
});

describe("applyStripeEvent", () => {
  it("checkout.session.completed binds customer+subscription to the workspace, sets no status/plan", async () => {
    const { store, subs } = memStore(["co_1"]);
    const e: StripeEvent = { id: "evt_c", type: "checkout.session.completed", created: 10, data: { object: { mode: "subscription", client_reference_id: "co_1", customer: "cus_1", subscription: "sub_1" } } };
    expect(await applyStripeEvent(e, store, cfg)).toBe("APPLIED");
    expect(subs.get("co_1")).toMatchObject({ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
    expect(subs.get("co_1")!.status).toBeUndefined();
    expect(subs.get("co_1")!.plan).toBeUndefined();
  });
  it("subscription.updated sets plan from configured price and status from Stripe", async () => {
    const { store, subs } = memStore(["co_1"]);
    expect(await applyStripeEvent(subEvent("evt_1", 10), store, cfg)).toBe("APPLIED");
    expect(subs.get("co_1")).toMatchObject({ plan: "standard", status: "ACTIVE", stripePriceId: "price_111" });
    expect((subs.get("co_1")!.currentPeriodEnd as Date).getTime()).toBe(4_000_000_000_000);
  });
  it("unconfigured price ⇒ plan null", async () => {
    const { store, subs } = memStore(["co_1"]);
    await applyStripeEvent(subEvent("evt_1", 10, { items: { data: [{ price: { id: "price_999" } }] } }), store, cfg);
    expect(subs.get("co_1")!.plan).toBeNull();
  });
  it("replayed event id is a no-op", async () => {
    const { store } = memStore(["co_1"]);
    await applyStripeEvent(subEvent("evt_1", 10), store, cfg);
    expect(await applyStripeEvent(subEvent("evt_1", 10), store, cfg)).toBe("DUPLICATE");
  });
  it("older event never overwrites newer state", async () => {
    const { store, subs } = memStore(["co_1"]);
    await applyStripeEvent(subEvent("evt_2", 20, { status: "canceled" }), store, cfg);
    expect(await applyStripeEvent(subEvent("evt_1", 10, { status: "active" }), store, cfg)).toBe("STALE");
    expect(subs.get("co_1")!.status).toBe("CANCELED");
  });
  it("event for an unknown workspace or with no binding changes nothing", async () => {
    const { store, subs } = memStore(["co_1"]);
    expect(await applyStripeEvent(subEvent("evt_x", 10, { metadata: { companyId: "co_evil" } }), store, cfg)).toBe("UNBOUND");
    expect(await applyStripeEvent(subEvent("evt_y", 10, { id: "sub_other", metadata: {} }), store, cfg)).toBe("UNBOUND");
    expect(subs.size).toBe(0);
  });
  it("subscription.deleted ⇒ CANCELED; unhandled types ignored", async () => {
    const { store, subs } = memStore(["co_1"]);
    await applyStripeEvent(subEvent("evt_d", 30, {}, "customer.subscription.deleted"), store, cfg);
    expect(subs.get("co_1")!.status).toBe("CANCELED");
    expect(await applyStripeEvent({ ...subEvent("evt_i", 40), type: "invoice.paid" }, store, cfg)).toBe("IGNORED_TYPE");
  });
  it("parseStripeEvent rejects malformed payloads", () => {
    expect(parseStripeEvent("nope")).toBeNull();
    expect(parseStripeEvent('{"id":"e","type":"t"}')).toBeNull();
  });
});

describe("checkout session request", () => {
  it("sends the workspace id as client_reference_id + metadata, the configured price, bearer key", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "cs_1", url: "https://checkout.stripe.com/x" }) }));
    const r = await createCheckoutSession({ secretKey: "sk_test_abc123", priceId: "price_111", companyId: "co_1", customerEmail: "cfo@x.com", existingCustomerId: null, successUrl: "https://a/s", cancelUrl: "https://a/c", fetchImpl });
    expect(r.url).toBe("https://checkout.stripe.com/x");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.headers.Authorization).toBe("Bearer sk_test_abc123");
    const body = decodeURIComponent(init.body);
    expect(body).toContain("client_reference_id=co_1");
    expect(body).toContain("metadata[companyId]=co_1");
    expect(body).toContain("subscription_data[metadata][companyId]=co_1");
    expect(body).toContain("line_items[0][price]=price_111");
    expect(body).toContain("mode=subscription");
  });
  it("Stripe error surfaces without echoing the key", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "No such price" } }) }));
    await expect(createCheckoutSession({ secretKey: "sk_test_abc123", priceId: "price_1", companyId: "c", customerEmail: null, existingCustomerId: null, successUrl: "s", cancelUrl: "c", fetchImpl })).rejects.toThrow(/No such price/);
  });
  it("formEncode handles nested arrays/objects", () => {
    expect(formEncode({ a: [{ b: 1 }], c: { d: "e" } }).map(decodeURIComponent)).toEqual(["a[0][b]=1", "c[d]=e"]);
  });
});

describe("route source pins", () => {
  it("checkout takes the workspace from the session, never the body", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/billing/checkout/route.ts", "utf8");
    expect(src).toMatch(/companyId: user\.companyId/);
    expect(src).not.toMatch(/body\.companyId/);
  });
  it("webhook verifies the signature before parsing/applying", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/billing/webhook/route.ts", "utf8");
    expect(src.indexOf("verifyStripeSignature(")).toBeLessThan(src.indexOf("parseStripeEvent(raw)"));
  });
});
