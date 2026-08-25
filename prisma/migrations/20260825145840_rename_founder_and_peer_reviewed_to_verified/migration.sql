-- Founder's 2026-08-25 "Final legal review status instruction" simplifies the
-- review-status model: for Headroom's internal product/development purposes,
-- the founder's own review is the complete legal-verification standard - no
-- second-attorney/peer/outside-counsel/independent-counsel requirement.
--
-- This is a pure ENUM VALUE RENAME (PostgreSQL ALTER TYPE ... RENAME VALUE),
-- not a data migration: every golden_tests/legal_review_records row
-- previously carrying FOUNDER_AND_PEER_REVIEWED now carries VERIFIED
-- automatically, with zero data loss and zero rows touched by hand. Safe to
-- run inside a normal transaction (unlike ADD VALUE, RENAME VALUE has no
-- same-transaction restriction).
ALTER TYPE "golden_test_status" RENAME VALUE 'FOUNDER_AND_PEER_REVIEWED' TO 'VERIFIED';
ALTER TYPE "legal_review_status" RENAME VALUE 'FOUNDER_AND_PEER_REVIEWED' TO 'VERIFIED';
