-- Grok lane 1: workspace subscription billing (Stripe). Additive only.
-- NOT applied to Neon by this PR; Egzon applies migrations.
CREATE TYPE "workspace_subscription_status" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED', 'UNKNOWN');

CREATE TABLE "workspace_subscriptions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "plan" TEXT,
    "stripePriceId" TEXT,
    "status" "workspace_subscription_status" NOT NULL DEFAULT 'INCOMPLETE',
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "lastEventCreated" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workspace_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workspace_subscriptions_companyId_key" ON "workspace_subscriptions"("companyId");
CREATE UNIQUE INDEX "workspace_subscriptions_stripeSubscriptionId_key" ON "workspace_subscriptions"("stripeSubscriptionId");
CREATE INDEX "workspace_subscriptions_stripeCustomerId_idx" ON "workspace_subscriptions"("stripeCustomerId");

CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "companyId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "outcome" TEXT,
    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);
