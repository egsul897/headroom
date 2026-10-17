# Accuracy re-check at `grok/extraction-hardening` @ a113351a (2026-10-17)

**MEASUREMENT-ONLY. Do not tune against anything in this directory.**

- Engine under test: `grok/extraction-hardening` @ `a113351aa67352a2eeab3144b6807e735e205a5d` (#428, stacked on #432 cap binding → #417).
- Baseline: the #422 scores (`../accuracy-check-20261017/scores.json`).
- Rubric: the #422 rubric, unchanged (5 checks per agreement; classes CORRECT / FAIL-CLOSED-OK / FAIL-CLOSED-OVERCAUTIOUS / WRONG / FALSE-CONFIDENT / N/A).

## Part 1: original 15 (INFORMED)
The #422 sample drove fixes #1 to #4, so it is contaminated. Its re-score is labelled **informed** and reported only as before/after per category. `scores-informed-original15.json` holds the 75 rows. Each changed row carries `before` and a note.

## Part 2: fresh sample #3 (independent)
- Seed `random.Random(2026101703)`. The method was recorded before any download or engine output (see `manifest-sample3.json` → `selection`).
- Pool: EDGAR full-text search, EX-10.* exhibits filed 2025-06-01..2026-10-16, two queries.
- Excluded:
  - the phase-1 exclusion lists (repo, local corpora, DEV/HELDOUT/BLIND, the frozen CIK set, xbrl-cache);
  - the #422 sample and its reserve;
  - the fresh-sample-#2 candidates;
  - the 18-agreement dev set.
- Filtered amendments and fund-like issuers, then kept one exhibit per CIK. Shuffled. Walked in order with eligibility rules: more than 250 KB, contains EBITDA, has ARTICLE/Section structure, not an amendment or joinder.
- `sample3-shuffled-order.tsv` and `sample3-eligibility-log.tsv` record the walk. Two implementation bugs in the amendment check, and one transient 503, were fixed before any engine run. The walk was then re-run in the same seeded order. Details are in `RESULTS.md`.
- No document bytes are committed. Accessions and sha256 are in the manifest.
- Requests used a declared SEC User-Agent (the owner's Gmail).
