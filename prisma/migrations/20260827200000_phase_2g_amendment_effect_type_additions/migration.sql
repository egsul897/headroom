-- AlterEnum
-- Phase 2G: fine-grained amendment-effect-type additions. Additive-only
-- (ALTER TYPE ADD VALUE), no existing row affected. PostgreSQL requires
-- each new enum value added in its own statement when adding more than
-- one value in a single migration.
ALTER TYPE "amendment_effect_type" ADD VALUE 'ADD_DEFINITION';
ALTER TYPE "amendment_effect_type" ADD VALUE 'DELETE_DEFINITION';
ALTER TYPE "amendment_effect_type" ADD VALUE 'REPLACE_DEFINITION';
ALTER TYPE "amendment_effect_type" ADD VALUE 'RESTATE_AGREEMENT';
ALTER TYPE "amendment_effect_type" ADD VALUE 'REAFFIRM';
ALTER TYPE "amendment_effect_type" ADD VALUE 'NO_TEXTUAL_CHANGE';
