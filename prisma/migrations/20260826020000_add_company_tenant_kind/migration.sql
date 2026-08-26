-- CreateEnum
CREATE TYPE "company_tenant_kind" AS ENUM ('CUSTOMER', 'EVALUATION');

-- AlterTable: add tenantKind defaulting to CUSTOMER (the one company-creation
-- path in the product, /companies/new, is real-customer provisioning), then
-- immediately backfill every row that already exists as of this migration to
-- EVALUATION - Coherent, Matthews, and every synthetic/test/live-acceptance
-- fixture company predate the customer-workspace concept and must never be
-- silently reclassified as a customer by the column's own default.
ALTER TABLE "companies" ADD COLUMN "tenantKind" "company_tenant_kind" NOT NULL DEFAULT 'CUSTOMER';

UPDATE "companies" SET "tenantKind" = 'EVALUATION';
