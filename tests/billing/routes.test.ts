import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { current: { id: "u1", email: "cfo@x.co", companyId: "co_1", role: "USER" as "USER" | "ADMIN" } };
const db = { workspaceBillingOwner: { count: vi.fn() }, workspaceSubscription: { findUnique: vi.fn() } };
const createCheckoutSession = vi.fn(async () => ({ id: "cs_1", url: "https://checkout.stripe.com/x" }));
vi.mock("@/lib/auth/guard", () => ({ getSessionUser: vi.fn(async () => user.current) }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/billing/stripe-api", () => ({ createCheckoutSession: (...a: unknown[]) => (createCheckoutSession as (...x: unknown[]) => unknown)(...a), StripeApiError: class extends Error {} }));

const ENV = { STRIPE_SECRET_KEY: "sk_test_abc123", STRIPE_WEBHOOK_SECRET: "whsec_testsecret", STRIPE_PRICE_IDS: "standard:price_111", HEADROOM_APP_URL: "https://app.example.com" };
const post = (body: unknown) => new Request("http://x/api/billing/checkout", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  Object.assign(process.env, ENV);
  user.current = { id: "u1", email: "cfo@x.co", companyId: "co_1", role: "USER" };
  db.workspaceBillingOwner.count.mockReset();
  db.workspaceSubscription.findUnique.mockReset();
  createCheckoutSession.mockClear();
});

describe("checkout: billing owner or ADMIN only (N5)", () => {
  it("an ordinary workspace user without a billing-owner row gets 403 and no Stripe call", async () => {
    db.workspaceBillingOwner.count.mockResolvedValue(0);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post({ plan: "standard" }));
    expect(res.status).toBe(403);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
  it("a designated billing owner can start checkout; the owner lookup is scoped to the session's workspace", async () => {
    db.workspaceBillingOwner.count.mockResolvedValue(1);
    db.workspaceSubscription.findUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/billing/checkout/route");
    expect((await POST(post({ plan: "standard" }))).status).toBe(200);
    expect(db.workspaceBillingOwner.count.mock.calls[0]![0]).toEqual({ where: { companyId: "co_1", userId: "u1" } });
  });
  it("platform ADMIN is allowed without an owner row", async () => {
    user.current = { ...user.current, role: "ADMIN" };
    db.workspaceSubscription.findUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/billing/checkout/route");
    expect((await POST(post({ plan: "standard" }))).status).toBe(200);
    expect(db.workspaceBillingOwner.count).not.toHaveBeenCalled();
  });
});

describe("store errors are 'unavailable', never 'no subscription' (N4)", () => {
  it("checkout: subscription read failure ⇒ 503 and NO Stripe call (no second customer)", async () => {
    db.workspaceBillingOwner.count.mockResolvedValue(1);
    db.workspaceSubscription.findUnique.mockRejectedValue(new Error("db down"));
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post({ plan: "standard" }));
    expect(res.status).toBe(503);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
  it("checkout: owner lookup failure ⇒ 503, not 403/200", async () => {
    db.workspaceBillingOwner.count.mockRejectedValue(new Error("db down"));
    const { POST } = await import("@/app/api/billing/checkout/route");
    expect((await POST(post({ plan: "standard" }))).status).toBe(503);
  });
  it("status: read failure ⇒ 503 BILLING_STORE_UNAVAILABLE, not subscription: null with 200", async () => {
    db.workspaceSubscription.findUnique.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/billing/status/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("BILLING_STORE_UNAVAILABLE");
  });
  it("gate while enforcing: read failure ⇒ deny with STORE_UNAVAILABLE (not NO_SUBSCRIPTION)", async () => {
    process.env.HEADROOM_BILLING_ENFORCE = "1";
    db.workspaceSubscription.findUnique.mockRejectedValue(new Error("db down"));
    const { checkWorkspacePlan } = await import("@/lib/billing/gate");
    expect(await checkWorkspacePlan("co_1")).toEqual({ allowed: false, reason: "STORE_UNAVAILABLE", plan: null });
    delete process.env.HEADROOM_BILLING_ENFORCE;
  });
});
