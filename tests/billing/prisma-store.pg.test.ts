/**
 * Real-Postgres checks of the Prisma billing store (B1 atomicity, N2 serialisation, N3 BigInt).
 * Runs only when BILLING_TEST_DATABASE_URL points at a scratch database with the
 * migrations deployed; skipped otherwise (CI has no billing Postgres job yet).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getBillingConfig } from "@/lib/billing/config";
import { createPrismaBillingStore } from "@/lib/billing/prisma-store";
import { applyStripeEvent, type BillingStore, type StripeEvent } from "@/lib/billing/webhook-events";

const url = process.env.BILLING_TEST_DATABASE_URL;
const cfg = getBillingConfig({ STRIPE_SECRET_KEY: "sk_test_abc123", STRIPE_WEBHOOK_SECRET: "whsec_x", STRIPE_PRICE_IDS: "standard:price_111", HEADROOM_APP_URL: "https://a.example.com" });
const ev = (id: string, created: number, status: string, type = "customer.subscription.updated", co = "co_pg"): StripeEvent => ({
  id, type, created,
  data: { object: { id: `sub_${co}`, customer: "cus_1", status, metadata: { companyId: co }, items: { data: [{ price: { id: "price_111" }, current_period_end: 4_000_000_000 }] } } },
});

describe.skipIf(!url)("billing store on real Postgres", () => {
  const db = new PrismaClient({ datasources: { db: { url: url! } } });
  const store = createPrismaBillingStore(db);
  beforeAll(async () => {
    await db.$executeRawUnsafe(`DELETE FROM "stripe_webhook_events"; DELETE FROM "workspace_subscriptions";`).catch(async () => {
      await db.stripeWebhookEvent.deleteMany({});
      await db.workspaceSubscription.deleteMany({});
    });
    for (const id of ["co_pg", "co_pg2", "co_pg3"]) await db.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
  });
  afterAll(async () => db.$disconnect());

  it("B1: a failure after the receipt rolls the receipt back; the retry applies (not DUPLICATE)", async () => {
    let failed = false;
    const flaky: BillingStore = {
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({
            ...tx,
            upsertSubscription: async (p) => {
              if (!failed) { failed = true; throw new Error("db down"); }
              return tx.upsertSubscription(p);
            },
          }),
        ),
    };
    await expect(applyStripeEvent(ev("evt_b1", 100, "past_due"), flaky, cfg)).rejects.toThrow("db down");
    expect(await db.stripeWebhookEvent.findUnique({ where: { id: "evt_b1" } })).toBeNull();
    expect(await applyStripeEvent(ev("evt_b1", 100, "past_due"), flaky, cfg)).toBe("APPLIED");
    expect((await db.workspaceSubscription.findUnique({ where: { companyId: "co_pg" } }))!.status).toBe("PAST_DUE");
    expect(await applyStripeEvent(ev("evt_b1", 100, "past_due"), store, cfg)).toBe("DUPLICATE");
  });

  it("N2: concurrent same-id deliveries apply exactly once", async () => {
    const outs = await Promise.all(Array.from({ length: 6 }, () => applyStripeEvent(ev("evt_dup", 200, "active", "customer.subscription.updated", "co_pg2"), store, cfg)));
    expect(outs.filter((o) => o === "APPLIED")).toHaveLength(1);
    expect(outs.filter((o) => o === "DUPLICATE")).toHaveLength(5);
  });

  it("N2: concurrent older/newer deliveries never leave the older state (8 rounds)", async () => {
    for (let i = 0; i < 8; i++) {
      const base = 1_000 + i * 10;
      await Promise.all([
        applyStripeEvent(ev(`evt_old_${i}`, base, "active", "customer.subscription.updated", "co_pg3"), store, cfg),
        applyStripeEvent(ev(`evt_new_${i}`, base + 1, "past_due", "customer.subscription.updated", "co_pg3"), store, cfg),
      ]);
      const row = await db.workspaceSubscription.findUnique({ where: { companyId: "co_pg3" } });
      expect(row!.status).toBe("PAST_DUE");
      expect(row!.lastEventCreated).toBe(BigInt(base + 1));
    }
  });

  it("N1 + N3: same-second resurrection refused; post-2038 created stored as BIGINT", async () => {
    expect(await applyStripeEvent(ev("evt_del", 4_102_444_800, "canceled", "customer.subscription.deleted"), store, cfg)).toBe("APPLIED");
    expect(await applyStripeEvent(ev("evt_act", 4_102_444_800, "active"), store, cfg)).toBe("STALE");
    const row = await db.workspaceSubscription.findUnique({ where: { companyId: "co_pg" } });
    expect(row).toMatchObject({ status: "CANCELED", lastEventCreated: BigInt(4_102_444_800) });
  });
});
