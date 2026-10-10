# Knowledge Factory — Corpus Quality Gate Mission Report

**Branch:** `cursor/kf-corpus-quality-gate-8a8b`  
**Parent milestone:** Neon massive corpus expansion (PR #219)  
**Neon mutations this gate:** **none**  
**Paid inference:** **$0**

## Verdict

The massive-corpus expansion is confirmed as a **discovery / structural-ingestion** milestone only. Independent audits show:

1. **Severe relationship-edge duplicate amplification** (~46.8k exact triple duplicates of 48.2k edges) — production-safety blocker before treating the graph as query authority.
2. **Operative resolution correctly fail-closes** in most gold cases, but can **over-resolve** on opaque `EX-10.1` restatement titles.
3. **Retrieval completeness** over covenant summaries is strong for family/citation signals, with **0 false CERTIFIED confidence**.
4. **ABL / intercreditor / guarantee remain sparse**; diversity dry-run queued candidates without writing Neon.
5. **Financing-package registry** proposed as additive, non-destructive, UNRESOLVED-preserving design — **not migrated**.

## 1. Relationship correctness audit

Artifact: `relationship-audit.json`

| Metric | Value |
|---|---|
| Total edges | 48,226 |
| Sampled | 160 (20/kind across amendment + provision kinds) |
| Verdict SUPPORTED | 41 |
| Verdict DUPLICATE | 99 |
| Verdict SELF_LOOP | 18 |
| Verdict CHRONOLOGY_SUSPECT | 2 |
| Supported-or-weak rate (excl. duplicates) | **67.2%** |
| Unsupported-like rate (excl. duplicates) | **32.8%** (mostly self-loops + chronology) |
| Exact triple duplicates (population) | **46,810** |
| Missing base↔amendment issuer hints | 0 in scanned busy issuers |

**Interpretation:** Prior expand batches re-ran `persistProvisionGraph` / amendment graph writes. Provision kinds dominate (`PROVISION_DEFINITION` 34,652). Exact `(sourceRecordId, targetSourceId, kind)` duplicates account for nearly the entire graph — **duplicate amplification**, not new legal coverage.

**Do not** use these edges as operative authority. Recommended authorized follow-up: idempotent dedupe migration / unique index + delete extras (owner approval required).

## 2. Operative-document resolution

Artifact: `operative-audit.json`

| Case | Expected | Engine | Pass |
|---|---|---|---|
| GPK multi-amendment | UNRESOLVED | UNRESOLVED | ✓ |
| WYNN indenture family | UNRESOLVED | UNRESOLVED | ✓ |
| SON credit restatement | UNRESOLVED | **RESOLVED** (`EX-10.1`) | ✗ |
| LUV revolving amendment | UNRESOLVED | UNRESOLVED | ✓ |
| HLT supplemental indentures | UNRESOLVED | UNRESOLVED | ✓ |

**Pass rate: 80%.**  
Compare was intentionally stubbed (no section diffs). Fail-closed preferred. SON failure: engine treated a `RESTATEMENT` class document titled only `EX-10.1` as superseding — **must not infer operative status from class + filing order / opaque exhibit labels alone**.

## 3. Retrieval completeness

Artifact: `retrieval-completeness.json`

| Metric | Value |
|---|---|
| Critical questions | 6 |
| Critical found rate | **1.0** |
| Correct citation pattern rate | **1.0** |
| Stale-document domination rate | **0** |
| False confidence (CERTIFIED/promoted) | **0** |
| Missing critical count | **0** |

Note: metrics measure **summary-index retrieval**, not counsel-certified provision identity. Citation presence ≠ legal correctness.

Intercreditor / ABL soft questions also returned hits, but corpus class counts remain sparse (see §4).

## 4. Corpus diversity (dry-run only)

Artifact: `diversity-dry-run.json`  
`neonWrites: false`

| Class | Public count |
|---|---|
| ABL_AGREEMENT | **1** |
| INTERCREDITOR_AGREEMENT | **3** |
| GUARANTEE_AGREEMENT | **3** |
| SECURITY_AGREEMENT | 26 |
| REVOLVING_CREDIT_AGREEMENT | 9 |

Promising not-yet-in-Neon discovery candidates: **3** (network dry-run; mostly amendment-class predictions under current title signals). Live ingest of these requires explicit write authorization (not performed).

## 5. Financing-package registry proposal

Artifacts:

- `financing-package-registry-PROPOSAL.md`
- `financing-package-registry-PROPOSAL.json`

Additive models: `FinancingPackage`, `FinancingPackageMember`, `FinancingPackageInstrument` with `UNRESOLVED` link status, no auto `REVIEWER_VERIFIED`, customer isolation. **No migrate deploy.**

## 6. Legal authority separation

| Representation level | Count |
|---|---|
| DISCOVERED_CANDIDATE | 702 |
| STRUCTURALLY_INDEXED | 64 |
| DETERMINISTICALLY_VALIDATED | 3 |
| REVIEWER_VERIFIED | **0** |
| CERTIFIED | **0** |

## 7. Operational discipline

- Source hashes / BYTEA provenance preserved (no overwrite path exercised)
- SEC rate limits respected on diversity dry-run
- Idempotent batch checkpoints remain (`KnowledgeImportBatch` = 5)
- Paid inference: **$0**
- This gate: **read-only** Neon

## 8. Actual database effects (from prior expand batches; no new writes)

Artifact: `database-effects.json`

| Batch-aggregated | Value |
|---|---|
| Inserted (persisted) | 31 |
| Reused | 0 |
| Skipped existing | 62 |
| Skipped non-financing | 3,083 |
| Fetched | 952 |
| Failed | 2 |
| Relationship edges claimed persisted | 40,033 (includes duplicate regeneration) |
| Live KS / BYTEA / edges | 769 / 746 / 48,226 |
| DB size | **257 MB** |

Rollback/replay: content-hash idempotent; no destructive rollback executed.

## Production-safety concerns (ordered)

1. **Duplicate relationship graph amplification** — unique constraint / authorized dedupe required before product reliance.
2. **Self-loop amendment edges** — discovery bug when restatement sourceId == targetId.
3. **Opaque restatement operative resolution** (`EX-10.1`) — tighten gates: require title/effective-date evidence, not class alone.
4. **Sparse ABL / intercreditor / guarantee** — do not claim package completeness.
5. **No automatic merge**; no further Neon mutations without owner write token.

## Commands

```bash
npm run kf:neon-quality-gate
npm run kf:neon-quality-gate -- --skip-network
npx vitest run tests/knowledge-factory/quality-gate.test.ts
```

## SHAs

- Base (prior expand tip): `c8d11b7bcb595ce01cfcd3b47217b72f48b7aefe`
- Quality-gate tip: `5e9f0321ef0bc6713962cdb5198b3c46aabe3972`
