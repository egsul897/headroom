-- =============================================================================
-- PENDING AUTHORIZATION — DO NOT APPLY TO PRODUCTION NEON WITHOUT EXPLICIT OK
-- =============================================================================
-- Headroom KF graph remediation: discoveryKey uniqueness + duplicate collapse
--
-- Affected tables:
--   knowledge_relationship_edges  (primary)
--   knowledge_relationship_edge_duplicate_archive  (new — provenance vault)
--
-- Goals:
--   1. Persist stable discoveryKey (from metadata.discoveryId)
--   2. Collapse exact discoveryId duplicates while preserving provenance
--   3. Enforce UNIQUE(discoveryKey) so rebuilds/retries cannot amplify rows
--   4. Leave evidenceStatus / representationLevel unchanged (DISCOVERED ≠ CERTIFIED)
--
-- Rollback strategy: see MIGRATION-ROLLBACK.md in this directory.
-- =============================================================================

BEGIN;

-- 1) Provenance vault for collapsed duplicate rows (conflicting source evidence retained)
CREATE TABLE IF NOT EXISTS knowledge_relationship_edge_duplicate_archive (
  id              TEXT PRIMARY KEY,
  original_edge_id TEXT NOT NULL,
  discovery_key   TEXT NOT NULL,
  kept_edge_id    TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  target_source_id TEXT NOT NULL,
  kind            TEXT NOT NULL,
  evidence_status TEXT NOT NULL,
  rationale       TEXT NOT NULL,
  confidence      DOUBLE PRECISION NOT NULL,
  metadata        JSONB,
  original_created_at TIMESTAMP(3) NOT NULL,
  archived_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archive_reason  TEXT NOT NULL DEFAULT 'EXACT_DISCOVERY_ID_DUPLICATE'
);

CREATE INDEX IF NOT EXISTS kre_dup_archive_discovery_key_idx
  ON knowledge_relationship_edge_duplicate_archive (discovery_key);
CREATE INDEX IF NOT EXISTS kre_dup_archive_kept_edge_idx
  ON knowledge_relationship_edge_duplicate_archive (kept_edge_id);

-- 2) Add discoveryKey column (nullable during backfill)
ALTER TABLE knowledge_relationship_edges
  ADD COLUMN IF NOT EXISTS "discoveryKey" TEXT;

-- 3) Backfill from metadata
UPDATE knowledge_relationship_edges
SET "discoveryKey" = metadata->>'discoveryId'
WHERE "discoveryKey" IS NULL
  AND metadata->>'discoveryId' IS NOT NULL;

-- 4) For agreement edges missing discoveryId historically, synthesize from triple
UPDATE knowledge_relationship_edges e
SET "discoveryKey" = md5(
  e.kind::text || '|' || e."sourceRecordId" || '|' || e."targetSourceId"
)
WHERE e."discoveryKey" IS NULL
  AND e.kind::text LIKE 'AGREEMENT_%';

UPDATE knowledge_relationship_edges e
SET "discoveryKey" = md5(
  e.kind::text || '|' || e."sourceRecordId" || '|' || e."targetSourceId"
)
WHERE e."discoveryKey" IS NULL
  AND e.kind::text = 'INDENTURE_SUPPLEMENTAL';

-- 5) Archive duplicate rows (keep earliest createdAt per discoveryKey)
WITH ranked AS (
  SELECT
    id,
    "discoveryKey",
    "sourceRecordId",
    "targetSourceId",
    kind::text AS kind,
    "evidenceStatus"::text AS evidence_status,
    rationale,
    confidence,
    metadata,
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "discoveryKey"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY "discoveryKey"
      ORDER BY "createdAt" ASC, id ASC
    ) AS kept_id
  FROM knowledge_relationship_edges
  WHERE "discoveryKey" IS NOT NULL
)
INSERT INTO knowledge_relationship_edge_duplicate_archive (
  id, original_edge_id, discovery_key, kept_edge_id,
  source_record_id, target_source_id, kind, evidence_status,
  rationale, confidence, metadata, original_created_at, archive_reason
)
SELECT
  'arch_' || id,
  id,
  "discoveryKey",
  kept_id,
  "sourceRecordId",
  "targetSourceId",
  kind,
  evidence_status,
  rationale,
  confidence,
  metadata,
  "createdAt",
  'EXACT_DISCOVERY_ID_DUPLICATE'
FROM ranked
WHERE rn > 1
ON CONFLICT (id) DO NOTHING;

-- 6) Delete archived exact-duplicate rows from live table (kept row retained)
DELETE FROM knowledge_relationship_edges e
USING knowledge_relationship_edge_duplicate_archive a
WHERE e.id = a.original_edge_id
  AND a.archive_reason = 'EXACT_DISCOVERY_ID_DUPLICATE'
  AND e.id <> a.kept_edge_id;

-- 7) Invalid invalid AGREEMENT_* self-loops (preserve in archive first)
INSERT INTO knowledge_relationship_edge_duplicate_archive (
  id, original_edge_id, discovery_key, kept_edge_id,
  source_record_id, target_source_id, kind, evidence_status,
  rationale, confidence, metadata, original_created_at, archive_reason
)
SELECT
  'arch_self_' || e.id,
  e.id,
  COALESCE(e."discoveryKey", e.id),
  e.id,
  e."sourceRecordId",
  e."targetSourceId",
  e.kind::text,
  e."evidenceStatus"::text,
  e.rationale,
  e.confidence,
  e.metadata,
  e."createdAt",
  'INVALID_AGREEMENT_SELF_LOOP'
FROM knowledge_relationship_edges e
JOIN knowledge_sources s ON s.id = e."sourceRecordId"
WHERE e.kind::text LIKE 'AGREEMENT_%'
  AND s."sourceId" = e."targetSourceId"
ON CONFLICT (id) DO NOTHING;

DELETE FROM knowledge_relationship_edges e
USING knowledge_sources s
WHERE s.id = e."sourceRecordId"
  AND e.kind::text LIKE 'AGREEMENT_%'
  AND s."sourceId" = e."targetSourceId";

-- 8) Enforce uniqueness (blocks future silent amplification)
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_relationship_edges_discoveryKey_key
  ON knowledge_relationship_edges ("discoveryKey")
  WHERE "discoveryKey" IS NOT NULL;

-- Optional: agreement triple uniqueness (complementary to discoveryKey)
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_relationship_edges_agreement_triple_key
  ON knowledge_relationship_edges ("sourceRecordId", "targetSourceId", kind)
  WHERE kind::text LIKE 'AGREEMENT_%' OR kind::text = 'INDENTURE_SUPPLEMENTAL';

COMMIT;

-- =============================================================================
-- POST-APPLY CHECKS (read-only)
--   SELECT COUNT(*), COUNT(DISTINCT "discoveryKey") FROM knowledge_relationship_edges;
--   SELECT kind, COUNT(*) FROM knowledge_relationship_edge_duplicate_archive GROUP BY 1;
-- =============================================================================
