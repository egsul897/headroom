# HEADROOM — Neon Massive Corpus Expansion — Mission Report

**Branch:** `cursor/neon-massive-corpus-expansion-8a8b`  
**PR:** https://github.com/egsul897/headroom/pull/219  
**Starting SHA:** `967d54e1d50cc8745f45ba0f3de7df5237de2896`  
**Generated:** 2026-10-09

## 1. Actual Neon corpus baseline (pre-expand)

Source: `docs/knowledge-factory/continuous/baseline-pre-expand.json`

| Inventory item | Count / status |
|---|---|
| Companies (all tenants) | 16 (9 CUSTOMER incl. debug/SaaS loops) |
| Financing packages (DebtInstrument proxy) | 6 instruments; 15 companies with Documents |
| Authentic KnowledgeSource rows | 730 total; **681 PUBLIC_SEC_EDGAR** |
| Document BYTEA objects | 711 |
| Distinct issuers (CIK) | 200 |
| Distinct tickers | 186 |
| Amendments / version edges (KnowledgeRelationship) | 8,193 discovered edges |
| Parsed structural nodes (meta) | 213,142 across sources with analysis |
| Covenant summary items (v2) | ~30,051 |
| Covenant candidates (meta) | ~40,518 |
| Defined terms (meta) | ~46,533 |
| Basket formulas | In summary `materialBasketsThresholds` / CBCFL peer corpus — not a separate Neon formula table |
| Cross-document relationships | 8,193 KnowledgeRelationshipEdge |
| Financial snapshots / states | 8 / 8 |
| Officer / compliance certificates | Sparse; customer demo uploads only — **explicitly missing** for public corpus |
| Ledger / utilization | 6 ledger entries (demo) — **not** public contractual utilization |
| Verified precedent / certified rules | Representation CERTIFIED = **0**; REVIEWER_VERIFIED = **0** |
| Golden / calculation tests | 48 GoldenTest rows; new synthetic library = 13 cases |
| Retrieval indexes | Mass-precedent JSON + covenantSummary metadata (no vector replace) |

**Quality classification:** Nearly all public rows are `DISCOVERED_CANDIDATE` or `STRUCTURALLY_INDEXED`. Volume ≠ legal accuracy. No automatic promotion to certified legal truth.

## 2. Database size and practical storage limits

| Metric | Value |
|---|---|
| Pre-expand DB size | ~207 MB |
| Post-batch DB size | ~257 MB |
| Dominant tables | `knowledge_sources` (~metadata), `document_byte_objects` (BYTEA) |
| Practical BYTEA planning bound | ~5–10 GiB before preferring object storage (`docs/knowledge-factory/durability/postgres-bytea-cost-scale.md`) |
| Headroom | Large — current corpus ≪ planning bound |

## 3. Existing ingestion pipeline capabilities

Reused (not rewritten):

- `EdgarKnowledgeClient` (fair-access UA, rate limit ≤8 req/s, cache, retries)
- `processAcquiredDocument` structural + candidate pipeline (deterministic; paid AI disabled)
- `persistDurableKnowledgeSource` → Postgres BYTEA + KnowledgeSource
- Amendment / provision relationship graphs
- v2 `buildDocumentCovenantSummary`
- `KnowledgeImportBatch` checkpoints
- CBCFL committed bytes + EHB handoff consumers

**New:** `lib/knowledge-factory/continuous/*` + `npm run kf:neon-massive-expand` / `kf:neon-baseline`

## 4. Current document and covenant counts (post-batch)

| Metric | Pre | Post |
|---|---|---|
| KnowledgeSource total | 730 | **769** |
| PUBLIC_SEC_EDGAR | 681 | **716** |
| Document BYTEA | 711 | **746** |
| Distinct issuers | 200 | **212–213** |
| Covenant summary items | ~30,051 | **~30,469–31,689** (stats vs live snapshot) |
| KnowledgeRelationshipEdge | 8,193 | **48,226** |
| Continuous-expand provenance docs | 0 | **35** |
| CERTIFIED auto-promotions | 0 | **0** |

New live issuers/docs include GPK, SON, URI/HTZ/CAR, WYNN, NET, AXP, TDG, WHR, BWA, GT, LUV, CHEF, CZR, HLT, LYV (among others) — not limited to CONMED/Chewy.

## 5. Source acquisition strategy

1. Prefer committed authentic bytes (CBCFL phase-2) when not already durable.  
2. Consume EHB handoff fetchables when present.  
3. Live SEC EDGAR diversity targets (ABL/HY/IG/convertible/gaming/transport).  
4. Identifying User-Agent with authorized contact; `HEADROOM_SEC_FETCH_OWNER=WS-CKF`.  
5. Modern indexes often label exhibits only as `EX-10.1` → discovery uses `requireDebtSignal: false` plus size/class pre-filters and post-fetch substantive checks.  
6. No invented documents; no uncontrolled crawl.

## 6. Deduplication strategy

- Exact `sourceId` skip  
- Exact `originalBytesHash` / BYTEA content-addressed reuse  
- Durable store rejects same `sourceId` with different bytes  
- Local corpus hash aliases for discovery ID drift  
- Idempotent relationship edges via discoveryId / (source, target, kind)

## 7. Schema gaps

| Gap | Severity | Action |
|---|---|---|
| No first-class “financing package” table | Medium | Proxied via issuer + instrumentIdentity + relationships |
| Public compliance certificates / ledgers | Expected missing | Keep explicitly unknown — do not fabricate utilization |
| Basket formula rows in Neon vs CBCFL files | Medium | Summaries carry thresholds; full typed formulas remain CBCFL/export |
| Intercreditor / ABL still sparse (3 / 1) | High priority next | Continue targeted batches |
| Customer uploads mixed in KnowledgeSource | Isolation risk | Customer provenance retained; public stats filter `PUBLIC_SEC_EDGAR` |

No destructive migrations introduced.

## 8. Estimated throughput under existing budgets

| Constraint | Estimate |
|---|---|
| SEC rate | ~8 req/s, 120 ms min gap |
| Deep discover / issuer (filingLimit≈150) | ~1–3 min (mostly index GETs; cache helps) |
| Persist + analyze / large HTML exhibit | ~5–30 s |
| Practical new substantive docs / hour | ~20–60 (after pre-filter; avoids EX-99 waste) |
| Paid model cost | **$0** (disabled) |
| Storage cost | Negligible at &lt;1 GB vs Neon BYTEA guidance |

Batch3 without pre-filter fetched 929 bodies (917 non-financing). Batch4/5 pre-filter → fetch≈persist.

## 9. First completed ingestion batches

| Batch | Persisted | Classes (delta) | Notes |
|---|---|---|---|
| batch1 (abort+complete) | 4 | Supplemental indentures (HLT, LYV) | Relationship graph + calc library |
| batch3 | 12 | Amendment/Restatement/CA/Indenture | GPK, SON, WYNN, NET, CZR… |
| batch4 | 11 | Restatement/Indenture/Amendment/CA | AXP, TDG, LUV, CCK*, CHEF… |
| batch5 | 8 | Term loan/CA/Restatement/Amendment | WHR TL, BWA, GT 2L, CAR… |
| **Total new continuous-expand** | **35** | Diversified | *CCK retirement exhibits flagged; filter tightened* |

Artifacts: `docs/knowledge-factory/continuous/neon-massive-batch*.json`, `latest-batch.json`, `calculation-examples.json`.

## 10. Verification and retrieval results

- Representation: DISCOVERED_CANDIDATE / STRUCTURALLY_INDEXED / few DETERMINISTICALLY_VALIDATED — **0 CERTIFIED**  
- Retrieval smoke (`retrieval-smoke.json`): citation rate ≈ 1.0 on summary items; query samples hit restricted payments, available amount, indebtedness, liens, incremental, intercreditor, asset sale  
- Synthetic calculation library: 13 cases, all `inputKind: "synthetic"`, `enginePrediction: null`, expected stored separately  
- Unit tests: `tests/knowledge-factory/continuous-expand.test.ts` — pass  

## 11. Starting / ending SHA

- **Start:** `967d54e1d50cc8745f45ba0f3de7df5237de2896` (main)  
- **End:** see tip of `cursor/neon-massive-corpus-expansion-8a8b` after this report commit  

## 12. PRs, tests, and costs

- PR: https://github.com/egsul897/headroom/pull/219  
- Tests: continuous-expand vitest (3) + `tsc --noEmit`  
- Paid inference: **$0**  
- SEC: fair-access identifying UA; bounded concurrency; checkpoints via `KnowledgeImportBatch` (5 batch rows)

## Continuation priorities

1. Targeted ABL + intercreditor + guarantee discovery (still sparse).  
2. Reclassify UNKNOWN public rows with structural signals.  
3. Expand synthetic calc library anchored to high-quality mechanics (still synthetic-labeled).  
4. Keep customer provenance quarantined from public precedent stats.  
5. Do not equate row growth with executable legal authority.
