-- DB-assigned monotonic sequence on EBITDA boxes and confirmations: the tie-breaker for "latest box", the box
-- generation, and "latest confirmation per key" (createdAt can tie; a BIGSERIAL cannot). All writers hold the
-- per-document advisory lock, so per document seq order is commit order.
-- ADDITIVE and IDEMPOTENT (safe to re-run). Like 20261017030000 and 20261017050000 it has never been applied to any
-- shared database (Neon has neither earlier EBITDA migration). Existing rows, if any, are numbered in
-- ("createdAt", "id") order before the sequence takes over. Rollback: down.sql in this directory.

CREATE SEQUENCE IF NOT EXISTS "customer_ebitda_boxes_seq_seq" AS BIGINT;
ALTER TABLE "customer_ebitda_boxes" ADD COLUMN IF NOT EXISTS "seq" BIGINT;
UPDATE "customer_ebitda_boxes" AS t SET "seq" = o.n
  FROM (SELECT "id", (SELECT COALESCE(MAX("seq"), 0) FROM "customer_ebitda_boxes") + ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS n
        FROM "customer_ebitda_boxes" WHERE "seq" IS NULL) AS o
  WHERE t."id" = o."id";
SELECT setval('"customer_ebitda_boxes_seq_seq"', x.m) FROM (SELECT MAX("seq") AS m FROM "customer_ebitda_boxes") AS x
  WHERE x.m IS NOT NULL AND x.m > (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM "customer_ebitda_boxes_seq_seq");
ALTER SEQUENCE "customer_ebitda_boxes_seq_seq" OWNED BY "customer_ebitda_boxes"."seq";
ALTER TABLE "customer_ebitda_boxes" ALTER COLUMN "seq" SET DEFAULT nextval('"customer_ebitda_boxes_seq_seq"');
ALTER TABLE "customer_ebitda_boxes" ALTER COLUMN "seq" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "customer_ebitda_boxes_seq_key" ON "customer_ebitda_boxes" ("seq");
CREATE INDEX IF NOT EXISTS "customer_ebitda_boxes_companyId_documentId_seq_idx" ON "customer_ebitda_boxes" ("companyId", "documentId", "seq");

CREATE SEQUENCE IF NOT EXISTS "customer_ebitda_confirmations_seq_seq" AS BIGINT;
ALTER TABLE "customer_ebitda_confirmations" ADD COLUMN IF NOT EXISTS "seq" BIGINT;
UPDATE "customer_ebitda_confirmations" AS t SET "seq" = o.n
  FROM (SELECT "id", (SELECT COALESCE(MAX("seq"), 0) FROM "customer_ebitda_confirmations") + ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS n
        FROM "customer_ebitda_confirmations" WHERE "seq" IS NULL) AS o
  WHERE t."id" = o."id";
SELECT setval('"customer_ebitda_confirmations_seq_seq"', x.m) FROM (SELECT MAX("seq") AS m FROM "customer_ebitda_confirmations") AS x
  WHERE x.m IS NOT NULL AND x.m > (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM "customer_ebitda_confirmations_seq_seq");
ALTER SEQUENCE "customer_ebitda_confirmations_seq_seq" OWNED BY "customer_ebitda_confirmations"."seq";
ALTER TABLE "customer_ebitda_confirmations" ALTER COLUMN "seq" SET DEFAULT nextval('"customer_ebitda_confirmations_seq_seq"');
ALTER TABLE "customer_ebitda_confirmations" ALTER COLUMN "seq" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "customer_ebitda_confirmations_seq_key" ON "customer_ebitda_confirmations" ("seq");
CREATE INDEX IF NOT EXISTS "customer_ebitda_confirmations_companyId_documentId_seq_idx" ON "customer_ebitda_confirmations" ("companyId", "documentId", "seq");
