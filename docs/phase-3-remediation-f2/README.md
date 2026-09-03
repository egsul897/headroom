# Phase 3 Chewy Remediation 2: F-2 structural sub-clause mis-nesting

Starting SHA `a942558715b206757d1e518638969e1b760efbc9`. Zero paid calls.

## Root cause

`buildClauseTree` inferred structural level purely from token shape and
sequence index. Any parenthesised token was a candidate label, so inline
cross-references ("clauses (i) through (iv) above", "this clause (b) shall
not include", "minus (i)", "sixty (60) days") opened or resumed lists. In
Chewy 6.08 this promoted builder items to subsections, produced a false
`6.08(i)`, and silently dropped the true `6.08(b)`.

## Invariant enforced

A local label such as (a), (b), (1), (A) does not determine structural
level by itself. Level is decided from positive context: reference grammar
around the token, paragraph structure between labels, and the nearest open
list of the same marker family. No document, section, or offset is
special-cased.

## Artifacts

| File | Content |
|---|---|
| 01-before-hierarchy-6.08.json | reproduced before-state around 6.08 |
| 02-after-hierarchy-6.08.json | after-state around 6.08 |
| 03-root-parser-mechanism.json | root mechanism and earliest divergence |
| 04-invariant-and-fix.json | invariant and the four mechanisms of the fix |
| 05-corpus-delta-table.txt, 05-same-root-search.json | same-root search across the corpora |
| 06a/06b/06-*.json | deterministic downstream re-link before and after |
| 07-tests-and-results.json | test matrix, suite results, harness deltas, verdict |

Only `lib/contract-model/compiler/clause-hierarchy.ts` changed in
production. Tests: `tests/contract-model/clause-hierarchy-f2-nesting.test.ts`.
Scripts: `scripts/f2-structure-snapshot.ts`, `scripts/f2-chewy-relink.ts`.

Verdict: **F2_CLOSED**.
