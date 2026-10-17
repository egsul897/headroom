-- Additive generalization metrics for mechanically replayed learned rules.
-- Nullable so existing proposals stay valid. Never DROP / DELETE / TRUNCATE.

ALTER TABLE "learning_improvement_proposals"
  ADD COLUMN IF NOT EXISTS "trainFixed" INTEGER;

ALTER TABLE "learning_improvement_proposals"
  ADD COLUMN IF NOT EXISTS "heldoutFixed" INTEGER;

ALTER TABLE "learning_improvement_proposals"
  ADD COLUMN IF NOT EXISTS "sourcesSpanned" INTEGER;
