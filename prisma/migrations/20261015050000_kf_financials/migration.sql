-- SEC XBRL financial inputs for covenant capacity compute. ADDITIVE ONLY: no DROP / DELETE / TRUNCATE.
-- One row per (issuer, Headroom input, concept, period, source accession). Derived TTM rows name every accession
-- ("FY|YTD|prior YTD") and carry the derivation text. Values are exact whole USD (XBRL facts).
CREATE TABLE IF NOT EXISTS "kf_financials" (
  "cik" TEXT NOT NULL, "entityName" TEXT, "metric" TEXT NOT NULL, "concept" TEXT NOT NULL, "periodType" TEXT NOT NULL,
  "periodStart" DATE, "periodEnd" DATE NOT NULL, "value" NUMERIC(24,0) NOT NULL, "unit" TEXT NOT NULL,
  "accession" TEXT NOT NULL, "form" TEXT NOT NULL, "filed" DATE NOT NULL, "derivation" TEXT NOT NULL,
  "fetchedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "kf_financials_pkey" PRIMARY KEY ("cik", "metric", "concept", "periodType", "periodEnd", "accession"));
CREATE INDEX IF NOT EXISTS "kf_financials_cik" ON "kf_financials" ("cik", "metric");
