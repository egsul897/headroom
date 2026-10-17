-- Rollback for 20261017170000_monitoring_alerts. Run manually; Prisma does not run down files.
-- DESTRUCTIVE: drops monitoring state (filings seen, band cutoffs/history, notifications, visits, finance members, cursor). Owner approval required.
DROP TABLE IF EXISTS "monitoring_sweep_cursors";
DROP TABLE IF EXISTS "workspace_finance_members";
DROP TABLE IF EXISTS "workspace_visits";
DROP TABLE IF EXISTS "workspace_notifications";
DROP TABLE IF EXISTS "covenant_band_events";
DROP TABLE IF EXISTS "covenant_band_thresholds";
DROP TABLE IF EXISTS "monitored_filings";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261017170000_monitoring_alerts';
