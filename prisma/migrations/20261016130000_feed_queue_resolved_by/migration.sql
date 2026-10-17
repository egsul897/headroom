-- Rule 141: feed queue resolutions must record who decided.
-- Additive only; historical rows keep NULL resolvedBy (they predate attribution).
ALTER TABLE "feed_queue_items" ADD COLUMN "resolvedBy" TEXT;
