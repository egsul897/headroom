import type { Prisma, PrismaClient } from "@prisma/client";
import type { BillingStore, BillingTx, SubscriptionPatch } from "./webhook-events";
import type { SubscriptionStatus } from "./plan-gate";

function txStore(tx: Prisma.TransactionClient): BillingTx {
  return {
    async claimEvent(e) {
      // Insert-if-absent, then row-lock it. A concurrent delivery of the same id blocks
      // on the unique key until this transaction ends; if we roll back it sees no row
      // and becomes FRESH itself. Only a committed processedAt makes it a duplicate.
      await tx.$executeRaw`INSERT INTO "stripe_webhook_events" ("id", "type", "companyId") VALUES (${e.id}, ${e.type}, ${e.companyId}) ON CONFLICT ("id") DO NOTHING`;
      const rows = await tx.$queryRaw<Array<{ processedAt: Date | null }>>`SELECT "processedAt" FROM "stripe_webhook_events" WHERE "id" = ${e.id} FOR UPDATE`;
      return rows[0]?.processedAt ? "DONE" : "FRESH";
    },
    async markEventProcessed(id, outcome) {
      await tx.stripeWebhookEvent.update({ where: { id }, data: { processedAt: new Date(), outcome } });
    },
    async companyExists(companyId) {
      return (await tx.company.count({ where: { id: companyId } })) > 0;
    },
    async findCompanyIdBySubscription(stripeSubscriptionId) {
      const row = await tx.workspaceSubscription.findUnique({ where: { stripeSubscriptionId }, select: { companyId: true } });
      return row?.companyId ?? null;
    },
    async lockCompany(companyId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"billing:" + companyId}, 0))`;
    },
    async getOrderState(companyId) {
      const row = await tx.workspaceSubscription.findUnique({
        where: { companyId },
        select: { lastEventCreated: true, status: true, stripeSubscriptionId: true },
      });
      if (!row) return null;
      return {
        lastEventCreated: row.lastEventCreated === null ? null : Number(row.lastEventCreated),
        status: row.status as SubscriptionStatus,
        stripeSubscriptionId: row.stripeSubscriptionId,
      };
    },
    async upsertSubscription(p: SubscriptionPatch) {
      const data = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as SubscriptionPatch;
      const { companyId, lastEventCreated, ...rest } = data;
      const row = { ...rest, lastEventCreated: BigInt(lastEventCreated) };
      await tx.workspaceSubscription.upsert({ where: { companyId }, create: { companyId, ...row }, update: row });
    },
  };
}

export function createPrismaBillingStore(db: PrismaClient): BillingStore {
  return {
    transaction: (fn) => db.$transaction((tx) => fn(txStore(tx)), { timeout: 15_000 }),
  };
}

export async function loadWorkspaceSubscription(db: PrismaClient, companyId: string) {
  return db.workspaceSubscription.findUnique({ where: { companyId } });
}

/**
 * Who may start a checkout for a workspace: a platform ADMIN, or a user designated
 * as that workspace's billing owner (workspace_billing_owners, provisioned offline
 * like accounts). UserRole has no OWNER value; no designated owner ⇒ nobody but ADMIN.
 */
export async function canManageBilling(db: PrismaClient, user: { id: string; companyId: string; role: string }): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  return (await db.workspaceBillingOwner.count({ where: { companyId: user.companyId, userId: user.id } })) > 0;
}
