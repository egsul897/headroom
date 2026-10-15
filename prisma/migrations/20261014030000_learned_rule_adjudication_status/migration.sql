-- Additive honesty: separate mechanical replay from independent verification.
-- Does not weaken production authority gates. Never ContractRule.

ALTER TABLE "learning_improvement_proposals"
  ADD COLUMN IF NOT EXISTS "adjudicationStatus" TEXT NOT NULL DEFAULT 'PROPOSED';

CREATE INDEX IF NOT EXISTS "learning_improvement_proposals_adjudicationStatus_idx"
  ON "learning_improvement_proposals"("adjudicationStatus");

ALTER TABLE "flywheel_runs"
  ADD COLUMN IF NOT EXISTS "proposalsMechanicallyReplayed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "learning_rulesets"
  ADD COLUMN IF NOT EXISTS "mechanicallyReplayedCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "learning_rulesets"
  ADD COLUMN IF NOT EXISTS "independentlyVerifiedCount" INTEGER NOT NULL DEFAULT 0;
