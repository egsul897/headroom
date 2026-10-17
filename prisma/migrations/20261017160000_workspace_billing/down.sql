-- Rollback for 20261017160000_workspace_billing. Run manually; Prisma does not run down files.
-- DESTRUCTIVE: drops billing state (subscriptions, webhook receipts, billing owners). Owner approval required.
DROP TABLE IF EXISTS "workspace_billing_owners";
DROP TABLE IF EXISTS "stripe_webhook_events";
DROP TABLE IF EXISTS "workspace_subscriptions";
DROP TYPE IF EXISTS "workspace_subscription_status";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261017160000_workspace_billing';
