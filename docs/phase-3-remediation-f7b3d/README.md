# F-7B.3D — Unifying the F-7 trust scorer with the current sharded architecture

Zero-cost. No model calls, no spend, no Wave C, no production activation.
Starting SHA `9c97a544634b98eecbd0c5da627ff0f1d59ce24e`. The same 25 frozen real
shard results were replayed; nothing was recompiled and no new evidence was bought.

## What was wrong

The pre-registered scorer in `scripts/f7b-score.ts` predates two architectural
changes it is supposed to measure:

- **F-7B.2** gave definitions three authoritative proof classes
  (`PLANNER_DEFINITION_UNIT`, `OWNED_INVENTORY_LINEAGE`,
  `UNIQUE_PRIMARY_SOURCE_DECLARATION`). The scorer knew only the first two.
- **F-7B.3B** made the losing side of a definition conflict a retained,
  reviewable artifact (`definitionConflicts`). The scorer inspected only the
  canonical IR arrays, so evidence held in conflict variants read as destroyed.

Root cause classification: `STALE_TRUST_SCORER_PRE_CONFLICT_EVIDENCE` and
`STALE_TRUST_SCORER_PRE_SOURCE_ANCHOR_PROOF`. The defect is in the measurement
layer, not the compiler.

## The disagreement, measured before any change

`00-scorer-disagreement.json` records the pre-change scorer run against the same
25 frozen shards. It was produced by checking the starting SHA out into a
detached worktree and running the harness there, so the figures are measured
rather than transcribed:

| Metric | Pre-change scorer | Certified truth (F-7B.3B side audit) |
|---|---|---|
| Owned values lost by stitching | 2 (`MONEY:100000000`, `MONEY:250000000`) | 0 |
| Owned lineage lost | 6 occurrences | 0 distinct owned ids |
| Source-unverifiable surviving IR | 77 | 0 |

All three were false positives of the stale scorer. An earlier copy of this
artifact was overwritten by re-running the harness *after* the fix; it was
regenerated from the pre-change scorer rather than back-filled, and the file
says so in `measurementProvenance`.

## What changed

Only `scripts/f7b-score.ts`, its new test file, and the zero-cost harness.
`git diff --name-only` shows no `lib/`, `app/` or `components/` file — the
stitcher, Pass C and the compiler are untouched.

- **Section B (values)** now counts a value as preserved when it survives in
  first-class conflict evidence. Preserved is not resolved: the conflict stays
  unresolved, review-required, and invisible to Pass C.
- **Section C (lineage)** canonicalizes bare `<digest>` and `inv-item:<digest>`
  into one id space before comparing, scopes expectation to each owner shard's
  own items, and gates on **distinct owned ids**. Occurrence counts survive only
  as a diagnostic: one owned item cited five times and kept once is not four
  losses.
- **Section H (source verifiability)** recognizes all three proof classes.
  `SHARD_FIRST_UNIT` is deliberately not among them — shard position is not
  evidence.
- **§9 dispositions**: every distinct value and every distinct owned lineage id
  now carries exactly one explicit label — `OWNED_PRESERVED`,
  `OWNED_PRESERVED_IN_CONFLICT_EVIDENCE`, `CONTEXTUAL_EXCLUDED` or `OWNED_LOST`
  — so contextual evidence can never be mistaken for owned preservation.

## Result on the frozen 25

`03-authoritative-scorer-replay.json`: every trust counter zero, including
`valuesLostByStitching` 0 and `ownedLineageDistinctLost` 0, with the occurrence
diagnostic still reporting 6. Proof classes 237 / 42 / 77 with `NONE` 0. Lineage
92 expected, 92 preserved, 3 preserved only by conflict evidence. Both disputed
money amounts preserved. The two real conflicts ("Approved Bank", "Annual
Threshold") remain `AMBIGUOUS` and review-required.

Accountability did not move: 93 owned / 53 represented / 1 non-computational /
21 unsupported / 0 ambiguous / 18 missing, 80.65%; global Pass C 63 / 22 / 23.
Had it moved, the mission required stopping with
`F7B_3D_SCORER_CHANGED_SEMANTICS`; it did not.

## Regression

`18-regression.json`. Full suite run at the starting SHA and after the change:
162 pre-existing failures both times, the failing **file sets** identical, plus
the 13 new alignment tests passing. `tsc` clean outside the pre-existing
foundation-audit errors; lint clean.

## Verdict

`09-closure-gate.json` — **17 / 17**, `F7_SCORER_ALIGNED_READY_FOR_WAVE_C`.
Wave C was not executed and no production activation was performed.

## Files

| File | What it is |
|---|---|
| `00-scorer-disagreement.json` | §2 pre-change reproduction, measured at the starting SHA |
| `03-authoritative-scorer-replay.json` | §13 updated scorer over the same 25 frozen shards |
| `09-closure-gate.json` | §20 seventeen-point closure gate |
| `18-regression.json` | §18 regression evidence |
| `scripts/f7b3d-reproduce.ts` | harness that produced `00-` |
| `scripts/f7b3d-replay.ts` | harness that produced `03-` |
| `scripts/f7b3d-gate.ts` | harness that recomputes the gate from the artifacts |
