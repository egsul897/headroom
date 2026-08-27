-- AlterEnum
-- Phase 2G: MODIFY_SCHEDULE addition, added after real CONMED Document D
-- evidence showed a genuine schedule-modification amendment clause that
-- no existing value describes. Additive-only (ALTER TYPE ADD VALUE), no
-- existing row affected.
ALTER TYPE "amendment_effect_type" ADD VALUE 'MODIFY_SCHEDULE';
