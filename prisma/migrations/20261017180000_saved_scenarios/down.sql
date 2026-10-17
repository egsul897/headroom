-- Rollback for 20261017180000_saved_scenarios (manual; Prisma does not run down migrations).
-- Drops the saved_scenarios table and its index, then forgets the migration so
-- `prisma migrate deploy` can re-apply it. Saved scenarios are user data: export first if needed.
DROP TABLE IF EXISTS "saved_scenarios";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261017180000_saved_scenarios';
