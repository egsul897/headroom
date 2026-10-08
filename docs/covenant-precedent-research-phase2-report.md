# Covenant Research Interface Phase 2 — Corpus Integration & Retrieval Quality

**Branch:** `cursor/covenant-precedent-research-3e8f`  
**PR:** https://github.com/egsul897/headroom/pull/152  
**Starting SHA:** `30ee0482f932ea65d1ecb3ec0b9d76d229e0a86c`

## Mandatory return (measured)

| # | Metric | Value |
|---|---|---|
| 1 | Existing records newly indexed | **4,816** (4,659 discovery + 157 compiled-IR) |
| 2 | Distinct documents represented | **21** |
| 3 | Duplicate records removed | **75** (4,828 → 4,753 after dedupe; curated 12 retained) |
| 4 | Verification-status distribution | FIXTURE **12** · UNVERIFIED **4,598** · HYPOTHESIS **143** · VERIFIED **0** · COMPILED **0** |
| 5 | Held-out retrieval metrics (phase2 corpus) | Recall@5 **0.9545** · Recall@10 **0.9545** · Precision@5 **0.3182** · citation **1.0** · version **1.0** · refusal **1.0** · missing-dep disclosure **1.0** |
| 6 | Source & version correctness | Citation substrings correct on measured queries; as-of operative-only query excludes superseded RP basket |
| 7 | Integration blockers | See knowledge-factory table below |
| 8 | SHA / tests / CI / PR | Tip `6b23e950b87561039388a537af3994a57bd08f82`; `npm test -- tests/covenant-research` **43/43**; PR #152 (CI pending at write time) |

**Not claimed:** new SEC acquisitions, production DB integration, legal correctness from retrieval relevance, VERIFIED promotions.

## Knowledge-factory coordination

| Surface | Status | Blocker / consume mode |
|---|---|---|
| EDGAR Backfill | PARTIAL | No `exports/edgar-backfill`; reuse pinned fixtures + edgar-connector |
| Definition Encyclopedia | PARTIAL | No encyclopedia export; stage-1 definition JSON readable |
| Basket Formula Library | UNAVAILABLE | No library export |
| Negative Covenant Exception DB | UNAVAILABLE | No exception-DB export |
| Dependency Atlas | PARTIAL | No atlas export; structural refs + context-retrieval reusable |
| Source-to-Covenant Dataset | PARTIAL | No dataset export package; ingest reads discovery/compiled fixtures |
| Precedent Comparison Intelligence | PARTIAL | 3D semantic-precedent exists; not wired as research export (not duplicated) |

## Safety (read-only)

Interface searches/compares/displays only. Refuses certify / approve / capacity / promote-to-verified / override-unresolved / infer-financial asks. Amendment-aware as-of filtering never silently treats superseded text as current.

## How to run

```bash
npx tsx scripts/covenant-precedent-research.ts --report-corpus
npx tsx scripts/covenant-precedent-research.ts --phase2-corpus --eval-held-out
npx tsx scripts/covenant-precedent-research.ts --phase2-corpus --as-of 2024-06-01 --operative-only "Restricted Payments basket"
npm test -- tests/covenant-research
```
