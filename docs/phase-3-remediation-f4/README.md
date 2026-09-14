# Phase 3 Chewy remediation 6 - F-4: verifier authenticated retrieved-source evidence

Starting SHA `5e171383e1ec6e9505ea6812fd3d3ddf0768c696`. Zero paid model calls, $0.00. Chewy not rerun. Verdict: **F4_CLOSED**.

## Root cause (recorded before any change - `00-diagnosis-and-reproduction.json`)
The compiler retrieved the definition of a term outside the candidate's 6.08 operative window through its `getDefinition`
tool and compiled its figures (MONEY 324000000 USD, PERCENT 0.45) into `definitions[2]`. The tool log recorded only a
summary and a char count (classification **A - RETRIEVED_SOURCE_PROVENANCE_NOT_RECORDED**, `semantic/tools.ts`), and the
verifier inventoried the window only (consequence C), so both figures were reported IR_ONLY / UNSUPPORTED_IR_ADDITION
(MATERIAL). The diagnosis located the authentic definition independently at doc-a chars [350042, 350203), sha256
`6c7b20f4...`, outside the window [659042, 697571).

## Architecture (`01-architecture-and-trust-invariants.json`)
compiler retrieves -> evidence-only `RetrievedSourceRecord` on the tool log -> verifier re-resolves every retrieval
request itself (structural index + Phase 2G operative state + package topology) -> authentication checks A-G -> only
AUTHENTICATED text is inventoried (`AUTHENTICATED_RETRIEVED`, scoped to its term/section) -> deterministic reconciliation
and the reviewer prompt consume it. A failed check rejects the evidence; a rejected compiler claim is a
PROVENANCE_MISMATCH review item and forces at least REVIEW_REQUIRED. No global numeric pooling; no term special case.

## Chewy zero-cost replay (`replay-before.json`, `replay-after.json`, `02-finding-replay-classification.json`)
| | before (post-F3) | after (F-4) |
|---|---|---|
| deterministic findings | 18 | 16 |
| MATERIAL | 16 | 14 |
| IR_ONLY | 2 | 0 |
| new findings | - | 0 |

Both F-4 findings: **F4_AUTHENTIC_EVIDENCE_FIXED** (supported by `$324.0 million` / `45%` in the authenticated
definition; all 7 checks passed). 16 other deterministic findings unchanged; 4 SEMANTIC_ONLY findings retained as
CANNOT_REPLAY_WITHOUT_MODEL.

## Tests and gates (`03-test-and-quality-results.json`)
New `tests/contract-model/f4-authenticated-retrieved-evidence.test.ts`: 30/30. Verifier + certification suites: 539
passed, 24 failed (identical pre-existing Postgres-unreachable set). Compiler/accountability suites: 517 passed, 18
failed (identical pre-existing set). tsc: 6 pre-existing errors in tests/foundation-audit, 0 elsewhere. eslint clean.

## Scripts
`scripts/f4-diagnosis.ts`, `scripts/f4-verifier-replay.ts <before|after> <outDir>`, `scripts/f4-replay-classify.py <docsDir>`.
