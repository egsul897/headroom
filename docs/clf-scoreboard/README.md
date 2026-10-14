# CLF scoreboard gate

`npm run clf:scoreboard -- --neon` (live, read-only) or `--snapshot=scripts/covenant-learning-factory/scoreboard/snapshot.json.gz` (offline, CI).
Add `--baseline=scripts/covenant-learning-factory/scoreboard/baseline.json` to gate: exit 1 when HELDOUT
COVERAGE_GAP + DISCOVERY_GAP + UNSUPPORTED_SEMANTICS rises, or a HELDOUT source disappears.

## Two different "held-out" counts (do not conflate)

| Name | Definition | Count (2026-10-14) |
|---|---|---|
| Scoreboard DEV | `dev-manifest.json`: every `fixture:*` (30) and `fdp:*` (6) knowledge_sources row | 36 |
| Scoreboard HELDOUT | every other knowledge_sources row (`edgar:*` 128, `ehb:*` 13, `research:*` 12) | 153 |
| Sweep `heldoutPackages` (#361) | deterministic SHA split of package keys, 25% held out, used by the rule-promotion generalization gate | 23 (166 train) |

The task brief said 34 / 155; the actual prefix rule yields 36 / 153 (the 6 `fdp:*` rows are fixture-derived).

## Matcher
Uses the strict matcher (`strictCandidateMatch`): non-generic text anchor AND same section number,
or (no section on a side) same canonical family (never OTHER/UNKNOWN). Fails closed otherwise.

## CI
The GitHub token on the box lacks `workflow` scope, so the workflow is checked in at
`docs/clf-scoreboard/clf-scoreboard-gate.workflow.yml`; copy it to `.github/workflows/` to activate.
It is not path-filtered. Snapshot replay reproduced live Neon exactly (0 per-source deltas).
