# Phase 2 coordination — WS-EHB / WS-CKF

- **WS-EHB** (`cursor/edgar-historical-backfill-c45c`): metadata-first `acquisition-queue.json` consumed; no second registry; fair-access UA shared pattern.
- **WS-CKF** (`cursor/covenant-knowledge-factory-7327`): novelty handoff via `05-knowledge-factory-import.json` (`knowledge-factory.novelty-import.v1`) and companion `08-knowledge-factory-source-records.json` (`KnowledgeSourceRecord`-aligned). Bytes stay under gitignored `data/rare-covenant-drafting-discovery/`.
- **WS-RCD** owns only `lib|scripts|tests|docs/rare-covenant-drafting-discovery/**` and `lib/drafting-novelty/**`.
- No production legal-rule edits, paid inference, merges, or certification changes.
