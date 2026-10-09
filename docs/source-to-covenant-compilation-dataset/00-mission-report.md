# Source-to-Covenant Compilation Dataset — Mission Report

**Verdict:** `SOURCE_TO_COVENANT_DATASET_V1_DELIVERED`

**Branch:** `cursor/source-to-covenant-dataset-6502`

**Nature:** Data and evaluation workstream — **not** a replacement compiler.

## Objective

Build a reusable dataset connecting authentic financing-document language to
structured covenant representation candidates, with full provenance,
uncertainty labels, train/dev vs held-out separation, and importable exports
suitable for future SFT/distillation **after** usage-rights review.

## Delivered artifacts

| Artifact | Path |
|---|---|
| Dataset library | `lib/source-to-covenant-dataset/` |
| Human label catalog | `lib/source-to-covenant-dataset/catalog.ts` |
| Builder script | `scripts/source-to-covenant/build-dataset.ts` |
| Per-record JSON | `datasets/source-to-covenant/records/{train,dev,eval-heldout}/` |
| Provenance manifests | `datasets/source-to-covenant/provenance/` |
| Importable package | `datasets/source-to-covenant/exports/importable-records.json` |
| SFT-ready JSONL | `datasets/source-to-covenant/exports/sft-ready.jsonl` |
| Quality / dup / split reports | `datasets/source-to-covenant/reports/` |
| Tests | `tests/source-to-covenant-dataset/dataset.test.ts` |

## Corpus composition (v1 build)

- **21 records** total
- **12 train / 6 dev / 3 eval-heldout**
- Issuers (train/dev): LSB, FWRG, CONMED, DSGR
- Held-out issuers: Chewy, Gibraltar, Riot Platforms
- Includes positive and negative examples
- Includes unresolved and unsupported-semantics examples
- Distinguishes `HUMAN_SOURCE_VERIFIED` from `HUMAN_HYPOTHESIS` /
  `MODEL_HYPOTHESIS`
- Records exact IR / compiler / verifier / dataset builder versions
- Tracks source text hashes and amendment identities
- Detects exact-duplicate windows (intentional Liens dup probe + shared
  §6.01 controlling windows)

## Required behaviors — status

1. Real SEC documents — **PASS** (repo fixtures from EDGAR filings)
2. Complete controlling context — **PASS** (section-scale windows + defs)
3. Positive and negative examples — **PASS**
4. Unresolved / unsupported semantics — **PASS**
5. Verified vs hypothesis distinction — **PASS**
6. Exact compiler and model versions — **PASS** (`version-pins.json`)
7. Source text hashes and amendment identities — **PASS**
8. Duplicate / near-duplicate detection — **PASS**
9. Held-out issuer/instrument eval set — **PASS**
10. Export suitable for future SFT/distillation (review-gated) — **PASS**

## Safety — status

| Rule | Status |
|---|---|
| Do not create GT by copying current compiler answers | **PASS** — labels authored from source reading in `catalog.ts`; pins declare `pinsAreNotLabelAuthority` |
| Do not automatically approve semantic representations | **PASS** — verification statuses are explicit; hypotheses/unresolved retained |
| Do not contaminate Claude’s independent acceptance corpus | **PASS** — every record sets exclusion flags; usage-rights manifest restates |
| No paid inference without authorization | **PASS** — offline fixture + catalog build only |

## Quality gate

`datasets/source-to-covenant/reports/quality-report.json` reports
`readyForImport: true` with all required checks `PASS` (exact-duplicate
tracking is a deliberate `WARN` for shared/intentional windows).

Tests: `npx vitest run tests/source-to-covenant-dataset/dataset.test.ts`
→ 10/10 passed.

## Rebuild

```bash
npx tsx scripts/source-to-covenant/build-dataset.ts
```
