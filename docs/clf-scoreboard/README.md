# CLF scoreboard gate

`npm run clf:scoreboard -- --neon` (live, read-only) or `--snapshot=scripts/covenant-learning-factory/scoreboard/snapshot.json.gz` (offline, CI).
Add `--baseline=scripts/covenant-learning-factory/scoreboard/baseline.json` to gate: exit 1 when HELDOUT
COVERAGE_GAP + DISCOVERY_GAP + UNSUPPORTED_SEMANTICS rises, or a HELDOUT source disappears.

## Two different "held-out" counts (do not conflate)

| Name | Definition | Count (2026-10-14) |
|---|---|---|
| Scoreboard DEV | split **by issuer**: all `fixture:*`/`fdp:*` rows (36) + every row of an issuer with DEV fixtures: CNMD 6, ROCK 3 (incl. ef20064499), CHWY 2, DSGR 2 (null ticker; filer CIK 0000703604) | 49 rows, 47 scored |
| Duplicates (listed, not counted) | CHWY doc-a-2026-06-23 (= fixture:chwy), research chwy_alt (= doc-a) | 2 |
| Scoreboard HELDOUT | every other knowledge_sources row | 140 |
| Sweep `heldoutPackages` (#361) | deterministic SHA split of package keys, 25% held out, used by the rule-promotion generalization gate | 23 (166 train) |

Rules: baseline is scored with the **live Neon ruleset v2** (2682 rules), read with a SELECT only and pinned to
`scoreboard/ruleset.json` so offline CI replays it exactly (`--rules-file`). Live (`--neon --rules=neon`) and the
snapshot replay agree with 0 per-source deltas.

| split | sources | COVERAGE_GAP | DISCOVERY_GAP | UNSUPPORTED_SEMANTICS | total |
|---|---|---|---|---|---|
| DEV | 47 | 202 | 347 | 15 | 564 |
| HELDOUT | 140 | 933 | 2784 | 26 | 3743 |

## Matcher
Uses the strict matcher (`strictCandidateMatch`): non-generic text anchor AND same section number,
or (no section on a side) same canonical family (never OTHER/UNKNOWN). Fails closed otherwise.

## CI
The GitHub token on the box lacks `workflow` scope, so the workflow is checked in at
`docs/clf-scoreboard/clf-scoreboard-gate.workflow.yml`; copy it to `.github/workflows/` to activate.
It is not path-filtered. Snapshot replay reproduced live Neon exactly (0 per-source deltas).

## Benchmark integrity (owner directive, 2026-10-14)

Implemented in `lib/covenant-learning-factory/scoreboard/integrity.ts`, enforced by `compareToBaseline` and the CLI
whenever `--baseline` is given. Tests: `tests/covenant-learning-factory/scoreboard-integrity.test.ts`.

1. **Frozen membership** — `scoreboard/heldout-membership.json` freezes every HELDOUT source by `sourceId`,
   `contentSha256` and issuer (`issuerCik`, normalized `ticker`). The gate fails if a frozen source is moved to DEV,
   dropped (absent, or re-marked as a duplicate), re-hashed or re-issued, unless `scoreboard/benchmark-migrations.json`
   carries a complete record `{ id, date, change: HELDOUT_TO_DEV | DROP_HELDOUT | SOURCE_HASH_CHANGE | ISSUER_CHANGE,
   sourceIds, reason, approver }` for that source and that change. Incomplete records fail the gate.
2. **Comparability** — every report carries `identity` = ruleset version + sha256 of the canonical ruleset JSON,
   per-source input sha256 (source row, document text, candidates, definitions, conditions), the snapshot sha256
   over those, and (where relevant) the scorer config (section-tree on/off, mode). `compareToBaseline` refuses
   (`IncomparableEvaluationError`, CLI exit 3) when any of them differ or are missing.
3. **Append-only history** — `scoreboard/baseline-history.json` is a hash-chained list; each entry points to an
   immutable file under `scoreboard/baselines/` with its sha256. `baseline.json` must be byte-identical to the
   latest entry. Earlier baselines (including the pre-integrity ones, marked `legacy`, approver UNRECORDED) are
   kept as evidence. In CI the base branch's history must be an unchanged prefix (`--history-base`).
   Thresholds live in the history: changing them, or accepting a baseline with a higher HELDOUT total or higher
   HELDOUT UNSUPPORTED_SEMANTICS than the previous identity-bound entry, requires `thresholdMigration { reason, approver }`.
   To rebaseline: add the new report as the next `baselines/NNNN-*.json`, copy it to `baseline.json`, append an
   entry (seq, prevEntrySha256 = sha256 of the previous entry's canonical JSON, reason, approver), never edit old ones.
4. **Regressions beyond the aggregate** (recorded thresholds, current values): fail when HELDOUT total rises
   (`heldoutTotalMaxIncrease` 0); when aggregate HELDOUT UNSUPPORTED_SEMANTICS rises (`heldoutUnsupportedMaxIncrease` 0)
   or any single HELDOUT source's UNSUPPORTED_SEMANTICS rises; and on a **material per-source regression**: a HELDOUT
   source whose total rises by ≥ max(2, ceil(10% × before)) — e.g. 0→2 fails, 0→1 passes, 50→55 fails, 50→54 passes —
   even when aggregate errors go down.

**CI status: NOT ENFORCED.** Installing `.github/workflows/clf-scoreboard-gate.yml` was attempted on 2026-10-14 and
rejected by GitHub: `refusing to allow an OAuth App to create or update workflow .github/workflows/clf-scoreboard-gate.yml
without workflow scope`. The workflow stays parked in this folder; the gate runs only when invoked locally until a
token with `workflow` scope installs it and it has run green at the exact PR tip.

## Self-credit guard and the no-learned-rules score (owner directive, 2026-10-17)

Learned PHRASE_PATTERN rules are synthesized from the scoreboard's own precedent items: the pattern is an item's opening
text and the family is its label. Matching that item again re-finds memorized text, so it is not discovery. The 2026-10-17
bisect (4878ed02) showed that 2272 of 2316 candidates credited only by learned captures were matched by a rule built from
that same candidate.

- **Seed provenance** (`scoreboard/rule-seed-provenance.json`, schema `clf-rule-seed-provenance/v3`, written by
  `scoreboard/derive-seed-provenance.ts`) uses exact text, not a regex. The seed comes from the rule's
  `provenance.packageKeys` when recorded. Otherwise it is the synthesizer's exact `seed="..."` text: seed items are
  precedent items whose collapsed excerpt starts with it, falling back to documents whose collapsed text contains it.
  The file is bound to the ruleset sha256 and the whole-snapshot sha256.
- **The committed file is never trusted as data.** The CLI re-derives provenance from the ruleset and snapshot and
  accepts the committed file only if it is byte-identical to that re-derivation. A tampered, stale or corrupt file is
  rejected: every learned capture rule counts as `NO_PROVENANCE`, the reason is printed, the no-rules score is still
  printed, and the CLI exits 4. The guard also requires every seed sourceId to be a scored source, and recomputes
  completeness and the seed identities (sha, CIK, ticker) from the scored sources.
- **Completeness is an identity check.** A rule is complete only if:
  - its distinct seed documents reach the recorded `sourcesSpanned`, else the cluster size (several matches inside one
    document do not stand in for a missing cluster member);
  - every recorded packageKey names a scored source.
  On the committed ruleset 2657 of 2675 rules are complete; 18 fail closed.
- **Guard (always on; identity `scorerConfig` ends in `selfCredit=guard-v2`).** A `learned-*` basket earns no match
  credit (candidate, definition or condition):
  - in a seed document or a byte-identical copy (`SELF_SEEDED`);
  - in any document of a seed issuer, matched by CIK or ticker (`SAME_ISSUER`): a company's other filings repeat its
    own drafting.
  Refused baskets still run every sanity check. Kept credit is reported as `LEARNED_CROSS_ISSUER` or
  `LEARNED_OTHER_DOCUMENT_ISSUER_UNKNOWN`.
- **Fail closed**: incomplete or underivable provenance, or a missing, unreadable, differing or unbound file, means no
  learned credit anywhere (`NO_PROVENANCE`). `--neon` mode is always unbound. Reports carry
  `selfCredit.rulesWithoutProvenance`, `selfCredit.unboundReason`, and refused and kept counts by split.
- **Protected path:** `rule-seed-provenance.json` should be on the owner-label protected list
  (`scripts/platform/protected-paths.mjs`, which lives on #409). It is noted there rather than edited here.
- **No-learned-rules score**: every source is also scored with an empty ruleset. Each report and merged shard carries
  `noRulesTotals`, the CLI prints `NO-RULES` lines, and the gate JSON shows `noRules` before and after. It is report-only
  and never gates; it bounds how much of the number comes from learned rules at all.
- The sweep, the rule-promotion replay gate and the product never pass the guard, so their behaviour is unchanged.
  Follow-up: the replay gate (`learned-rules/replay-gate.ts`) still accepts a rule because it re-finds its own seed.
