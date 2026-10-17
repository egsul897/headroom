import type { PrismaClient } from "@prisma/client";
import type { BillingStore, SubscriptionPatch } from "./webhook-events";

export function createPrismaBillingStore(db: PrismaClient): BillingStore {
  return {
    async recordEvent(e) {
      try {
        await db.stripeWebhookEvent.create({ data: { id: e.id, type: e.type, companyId: e.companyId } });
        return true;
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") return false;
        throw err;
      }
    },
    async markEventProcessed(id, outcome) {
      await db.stripeWebhookEvent.update({ where: { id }, data: { processedAt: new Date(), outcome } });
    },
    async companyExists(companyId) {
      return (await db.company.count({ where: { id: companyId } })) > 0;
    },
    async findCompanyIdBySubscription(stripeSubscriptionId) {
      const row = await db.workspaceSubscription.findUnique({ where: { stripeSubscriptionId }, select: { companyId: true } });
      return row?.companyId ?? null;
    },
    async getLastEventCreated(companyId) {
      const row = await db.workspaceSubscription.findUnique({ where: { companyId }, select: { lastEventCreated: true } });
      return row?.lastEventCreated ?? null;
    },
    async upsertSubscription(p: SubscriptionPatch) {
      const data = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as SubscriptionPatch;
      const { companyId, ...rest } = data;
      await db.workspaceSubscription.upsert({ where: { companyId }, create: { companyId, ...rest }, update: rest });
    },
  };
}

export async function loadWorkspaceSubscription(db: PrismaClient, companyId: string) {
  return db.workspaceSubscription.findUnique({ where: { companyId } });
}
