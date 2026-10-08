# Covenant Precedent Research Interface — Phase 3 Report

**PR:** #152  
**Branch:** `cursor/covenant-precedent-research-3e8f`  
**Reconciled starting head:** `394adc945dcd3c3f7f5b3cafeb0f63ab36c051ec`  
**Reported Phase 2 tip (prior):** `a44f93623184f6694de6f26b1d8506d590a83f71`  
**Cost:** $0 paid inference / $0 new EDGAR acquisition

## 0. Git reconciliation

| Ref | SHA | Notes |
| --- | --- | --- |
| Phase 2 reported tip | `a44f936` | Pin Phase 2 report SHA reference |
| GitHub-observed / reconciled start | `394adc9` | One commit after `a44f936`: “Record Phase 2 CI green on tip a44f936.” Docs-only; no retrieval code change |
| `origin/main` (at reconcile) | `9de4e57` | Unrelated merges; research branch not merged |

Intervening commit `394adc9` preserved. Research suite rerun on reconciled head: **43/43** before Phase 3 edits; **57/57** after.

## 1. Deduplicated corpus metrics (Phase 3)

| Metric | Phase 2 | Phase 3 |
| --- | ---: | ---: |
| After dedupe | 4,753 | 6,607 |
| Duplicates removed (cumulative report) | 75 | 159 |
| Distinct documents | 21 | 25 |
| Distinct issuers | 8 | 9 |
| Distinct source spans | 2,647 | 3,734 |
| Newly indexed this phase (SUP+Gibraltar+compiled/structure) | — | 1,938 |
| Canonical export rows loaded | 0 | 0 |

**Verification distribution (Phase 3):** FIXTURE 12 · UNVERIFIED 6,429 · HYPOTHESIS 166 · SOURCE_VERIFIED 0 · INDEPENDENTLY_LEGALLY_VERIFIED 0

No status promotion from retrieval, citation, or compilation.

## 2. Independent retrieval precision and recall

**Baseline (Phase 2 held-out on expanded corpus, pre-rerank):** Recall@5 0.9545 · Precision@5 0.3182 · citation 1.0 · version 1.0

**After Phase 3 rerank (same held-out, Phase 2 corpus):** Recall@5 **1.0** · Recall@10 **1.0** · Precision@5 **0.3364** · MRR **1.0** · citation **1.0** · version **1.0** · refusal **1.0**

**Independent issuer-disjoint set (57 queries, SUP-positive labels, Phase 3 corpus):**

| Metric | Value |
| --- | ---: |
| Recall@5 | 0.4314 |
| Recall@10 | 0.5651 |
| Precision@5 | 0.3556 |
| MRR | 0.4049 |
| Citation correctness | 0.5714 |
| Version correctness | 1.0 |
| Unsupported-answer refusal | 1.0 |
| Unanswerable handled | 1.0 |

**Overlap disclosure:** Positive labels target Superior Industries (`SUP`) only. Phase-2 held-out issuers (FWRG, DSGR, CNMD, CHWY, LXU/LSB, RFIC) excluded from positive labels. Broader corpus still contains those issuers. **No indenture package available in-repo** — indenture asks treated as unanswerable.

## 3. False-positive / false-negative analysis

Dominant FP modes on held-out + Phase-2 corpus (post-rerank counts):

| Mode | Count (approx) |
| --- | ---: |
| Weak structural ranking / topical overlap (discovery near-misses) | 31 |
| Wrong or unknown document version | 20 |
| Wrong covenant family | 5 |
| Defined-term collision / definition leak | 3 |
| Overlapping / short extraction window | 2 |
| Query interpretation / topical near-miss | 1 |

Mitigations shipped: source-span consolidation (Jaccard overlap), document+section diversity, soft demotion of unknown/unresolved operative + short TOC stubs, structural-intent boost. Precision@5 +0.0182 vs baseline with Recall@5 improved (not sacrificed).

Independent-set FNs: many SUP queries need exact clause hits among ~1.8k SUP discovery rows; lexical overlap with Phase-2 issuers still competes despite issuer cues in query text.

## 4. Citation and amendment-version correctness

- Held-out citation / version: **1.0 / 1.0**
- Independent citation / version: **0.5714 / 1.0** (citation only scored when `requiredCitationSubstrings` present)
- Amendment fail-closed covered: superseded baskets, unresolved operative state, missing amendment authority, conditional effectiveness without dates, original vs amended RP fixture under as-of

## 5. Canonical-export integrations

Versioned adapters (`ckf-canonical-adapter.v1`) implemented + fixture-probed for 8 surfaces including `CANONICAL_SOURCE_REGISTRY`.

| Maturity | Status |
| --- | --- |
| Adapter implemented | Yes (all probed surfaces) |
| Fixture-tested | Yes |
| Real export tested | **No** — `exports/*` absent |
| Persisted to durable database | **No** |
| Independently verified | **No** |

Blockers retained for all CKF named exports. Fixture reuse of discovery/compiled/structure paths continues (PARTIAL knowledge-factory probes).

## 6. Database integration status

**`DB_INTEGRATION_UNVERIFIED`**

`DATABASE_URL` unset. Adapter projection unit-tested; `tryLoadResearchCorpusFromDb` returns `[]`. No production DB connection. Mock projection is **not** claimed as durable integration.

## 7. New authentic documents represented

| Item | Count |
| --- | ---: |
| Authentic HTML exhibits available under `unseen-packages` | 16 |
| Distinct documents in Phase-2 corpus | 21 |
| Distinct documents in Phase-3 corpus | 25 |
| **Additional distinct documents vs Phase 2** | **4** (SUP doc-a/b/c + Gibraltar EX-10.1) |
| Target “25 additional” | **Not met** — CKF acquisition pipeline / source registry export unavailable; no second SEC downloader created |
| New issuers | SUP (Superior Industries); Gibraltar structure ingest for ROCK (already in curated) |
| New instruments | SUP term loan facility; Gibraltar 2026 credit agreement structure spans |
| New source spans (Phase 3 total distinct) | 3,734 |

## 8. Unresolved legal-safety gaps

- Zero `SOURCE_VERIFIED` / `INDEPENDENTLY_LEGALLY_VERIFIED` rows — none promoted
- Indentures absent from authentic package inventory
- Operative legal state for many discovery rows remains `UNKNOWN` / incomplete amendment lineage
- Missing controlling definitions often disclosed but not resolved
- Side letters / external restrictions generally absent from packages
- Retrieval relevance ≠ legal correctness (disclaimer on every response)

## 9. Tests, CI, PR, cost

- Local: `npm test -- tests/covenant-research` → **57/57 passed**
- GitHub CI on tip `5434ca302f5441a53129e164ced29d78b4822bec`: **6/6 pass**
- Paid inference: **$0**
- Merge: **not performed**
- Certification / production legal-rule changes: **none**
- Claude-owned fixture modifications: **none** (new research eval fixture authored under `tests/fixtures/covenant-research/`)
