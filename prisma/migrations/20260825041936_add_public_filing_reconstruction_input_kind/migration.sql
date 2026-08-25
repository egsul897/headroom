-- Add PUBLIC_FILING_RECONSTRUCTION to external_input_kind.
--
-- A new, distinct provenance kind for a documented reconstruction built
-- from a company's public SEC filings - valid only for test/regression
-- fixtures, never for a real customer's certified figure. Does not modify
-- or weaken CERTIFIED_EXTERNAL_INPUT's own meaning (see the enum's schema
-- comment). Postgres ALTER TYPE ADD VALUE is additive only - no existing
-- rows are affected.

ALTER TYPE "external_input_kind" ADD VALUE 'PUBLIC_FILING_RECONSTRUCTION';
