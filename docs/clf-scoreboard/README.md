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
