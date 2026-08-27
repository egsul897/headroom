-- AlterEnum
-- Phase 2F.3: composite document-type addition. Additive-only, no existing
-- row affected (same ALTER TYPE ADD VALUE safety as every prior DocumentType
-- extension in this migrations directory).
ALTER TYPE "document_type" ADD VALUE 'GUARANTEE_AND_SECURITY_AGREEMENT';
