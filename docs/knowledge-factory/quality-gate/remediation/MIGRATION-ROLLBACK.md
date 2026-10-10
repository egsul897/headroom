# Deduplication migration — rollback strategy

**Status:** DESIGN ONLY. Do not apply `MIGRATION-dedupe-discovery-key.sql` to production Neon without explicit authorization.

## Affected tables

| Table | Change |
| --- | --- |
| `knowledge_relationship_edges` | Add nullable `discoveryKey`; unique index; delete duplicate + self-loop rows |
| `knowledge_relationship_edge_duplicate_archive` | **New** provenance vault for collapsed / self-loop rows |

Unaffected (must stay untouched by this migration):

- `knowledge_sources` representation levels (`DISCOVERED_CANDIDATE` / `STRUCTURALLY_INDEXED` vs `REVIEWER_VERIFIED` / `CERTIFIED`)
- `document_byte_objects`
- Financial / contract-model tables

## Forward effects (when authorized)

1. Exact `discoveryId` duplicate rows move to archive; earliest `createdAt` kept live.
2. Invalid `AGREEMENT_*` self-loops removed from live graph and archived with reason `INVALID_AGREEMENT_SELF_LOOP`.
3. `UNIQUE(discoveryKey)` prevents silent re-amplification on batch rebuild / retry.
4. Evidence status and confidence on kept rows are unchanged.

## Rollback (authorized reverse)

Run inside a transaction only after verifying archive row counts.

```sql
BEGIN;

-- 1) Restore archived rows that are missing from live
INSERT INTO knowledge_relationship_edges (
  id, "sourceRecordId", "targetSourceId", kind, "evidenceStatus",
  rationale, confidence, metadata, "createdAt", "discoveryKey"
)
SELECT
  a.original_edge_id,
  a.source_record_id,
  a.target_source_id,
  a.kind::knowledge_relationship_kind,
  a.evidence_status::knowledge_relationship_evidence_status,
  a.rationale,
  a.confidence,
  a.metadata,
  a.original_created_at,
  a.discovery_key
FROM knowledge_relationship_edge_duplicate_archive a
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_relationship_edges e WHERE e.id = a.original_edge_id
)
ON CONFLICT (id) DO NOTHING;

-- 2) Drop uniqueness (re-enables amplification — only for emergency rollback)
DROP INDEX IF EXISTS knowledge_relationship_edges_discoveryKey_key;
DROP INDEX IF EXISTS knowledge_relationship_edges_agreement_triple_key;

-- 3) Optional: drop discoveryKey column and archive table after restore verified
-- ALTER TABLE knowledge_relationship_edges DROP COLUMN IF EXISTS "discoveryKey";
-- DROP TABLE IF EXISTS knowledge_relationship_edge_duplicate_archive;

COMMIT;
```

## Safety invariants

- Archive retains full rationale / metadata / confidence — conflicting source evidence is not discarded.
- Rollback re-inserts by original edge id; does not invent new legal relationships.
- Representation / certification labels are never rewritten by forward or reverse paths.
- Prefer restore-then-drop-index over drop-archive-first.

## Authorization gate

Require written owner approval naming:

1. Target Neon branch / database name (must not be production until approved)
2. Expected archive counts from dry-run `SELECT`
3. Confirmation that expand / graph promotion remains paused
