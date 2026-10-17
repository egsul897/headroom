-- ERP ingestion foundation (lib/erp/**): CompanySourceConnection gains an
-- ERP connector type. The provider kind (NETSUITE/SAP/ORACLE/DYNAMICS/
-- GENERIC) is DATA on the connection's provider/config columns, not an enum
-- value per vendor.
-- Additive only: existing rows are untouched. Postgres ALTER TYPE ADD VALUE
-- cannot run inside a transaction block, so `prisma migrate deploy` handles
-- it as its own statement (same pattern as prior enum-value migrations).
ALTER TYPE "connector_type" ADD VALUE 'ERP';
