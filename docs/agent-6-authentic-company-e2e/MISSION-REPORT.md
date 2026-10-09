# Agent 6 — Real Company End-to-End Validation

**Verdict:** Authentic packages can be onboarded through a company-agnostic deterministic pipeline with **honest missing-evidence Position reports** and **zero critical false permissions**. Three generalizable extraction/structure defects were found and fixed. Full covenant→rulebook→ratio→basket certification remains blocked without LLM credentials (not faked).

**Branch:** `cursor/agent6-authentic-company-e2e-aebc`  
**PR:** https://github.com/egsul897/headroom/pull/226  
**Evidence SHA:** `1d0455eb123d339293701d5d8059d3fe76f52b28` (fixtures, harness, generalizable fixes)
**Branch tip:** see `git rev-parse origin/cursor/agent6-authentic-company-e2e-aebc`
**Cost:** `$0.00` (no provider calls; credential gate `BLOCKED_BY_MISSING_CREDENTIAL`)

## Packages (genuinely unseen at selection)

| Company | Key | Docs | Why |
|---|---|---:|---|
| Knife River Corporation | `knife-river-2023-2026` | 3 | Lane-7 rank 2 — CA + two amendments |
| Insulet Corporation | `insulet-2021-2026` | 3 | Lane-7 rank 1 — CA + indenture + 9th amendment (1–8 omitted) |
| Benchmark Electronics | `benchmark-2025` | 3 | Lightweight-unseen pool — Second A&R + Am. 1/3 (prior A&R missing) |

Independent expected outcomes authored from source text **before** engine runs; hashes pinned in `00-expectation-pins.json`.

## End-to-end scorecard (aggregate)

| Metric | Total |
|---|---:|
| Documents ingested | 9 |
| Covenants discovered (LLM) | 0 |
| Rules verified | 0 |
| Ratios calculated | 0 |
| Baskets calculated | 0 |
| Transactions evaluated | 9 |
| Correct outcomes | 9 |
| Incorrect outcomes | 0 |
| Correct refusals | 6 |
| Manual interventions | 0 |
| Critical false permissions | **0** |
| Cost (USD) | **0.00** |

Per-company JSON: `04-scorecards/`. Runs: `03-runs/<company>/`.

### What each company proved

- **Ingest + structure + package graph** ran company-agnostically (no issuer branches in production code).
- **Role classification** matched independent expectations **3/3** on every package.
- **Operative base** identified correctly for expected bases.
- **Utilization** established as `NONE` — no completed officer certificates with filled utilization (correct; not invented).
- **Position reports** conclude `MISSING_EVIDENCE`, `favorableCapacityClaimed=false`, listing missing certificate / snapshot / VEP / ledger (and missing package docs where applicable).
- **Proposed transactions** expecting `MISSING_EVIDENCE` or `REVIEW_REQUIRED` all matched.

### Credential honesty

LLM discovery / semantic compile / verify were **not** run with a synthetic caller pretending success. Scorecard cells for covenants/rules/ratios/baskets remain 0 with explicit `BLOCKED_BY_MISSING_CREDENTIAL`.

## Generalizable defects (priority)

| ID | Defect | Status |
|---|---|---|
| A6-D1 | Hex HTML entities (`&#x201c;`) not decoded | **FIXED** + regression |
| A6-D2 | CP1252 C1 curly quotes (U+0093/94) not normalized | **FIXED** + regression |
| A6-D3 | BofA bare-decimal sections + ARTICLE-before-`1.01` lookahead — Benchmark collapsed to 3 ARTICLEs / 0 SECTIONs | **FIXED** + regression (remeasure: ARTICLE=10, SECTION=123) |
| A6-D4 | REVIEW_REQUIRED AMENDS not grouped into base instrument (Knife River) | OPEN documented |
| A6-D5 | Missing LLM credentials | Honest environment blocker |

## Regressions added

- `tests/agent6/html-entity-hex-decode.test.ts`
- `tests/agent6/benchmark-bofa-structure.test.ts`
- `tests/agent6/authentic-e2e-scorecard.test.ts` (pins fail-closed invariants)
- Harness: `scripts/agent6/run-authentic-company-e2e.ts`

## How to re-run

```bash
npx tsx scripts/agent6/run-authentic-company-e2e.ts
npx vitest run tests/agent6/
```

With provider credentials, the same harness records real discovery/compile costs instead of the credential blocker; do not invent utilization or certificates.
