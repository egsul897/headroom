# Phase 4C forensic remediation and recertification

Remediation starting SHA `779d4103300758390a8795194b5082d87a1625d6` (the head the independent audit
falsified). Zero paid, model or provider calls. Phase 3, Phase 4A and Phase 4B are unchanged; every
production change is inside `lib/contract-model/runtime/capacity/`.

## What the audit found and what changed

| finding | defect | remediation |
|---|---|---|
| F1 | two elections of 25 + 25 on 40 of usage both executed (capacity created) | conservation aggregated by source over the whole batch against the before-state; atomic apply; `AGGREGATE_SOURCE_USAGE_EXCEEDED`, `BLOCKED_BY_BATCH_ATOMICITY`, `batchConservation` |
| F2 | duplicate usage ids both counted, capacity AVAILABLE | every claimant quarantined at index time; touched capacities fail closed with `DUPLICATE_LEDGER_USAGE_IDENTITY`; never deduplicated |
| F3 | duplicate pool id: last wins | duplicate rule and pool ids refused as a set before any node is built; `DUPLICATE_SHARED_CAPACITY_IDENTITY` / `DUPLICATE_RULE_IDENTITY`; duplicate Phase-3 edges collapse to one canonical edge |
| F4 | eval slope 1.81 while artifact 11 claimed linear | ledger indexed once by path, selection memoized per (path, currency), membership/component/dependency lookups indexed; counters extended and exactly linear; wall-clock re-measured (supplemental) |
| F5 | sufficiency UNSUPPORTED published AVAILABLE | `SUFFICIENCY_DOMINANCE`: a `Record` over every `RepresentationSufficiency` value with a fail-closed default; unsafe scope REVIEW_REQUIRED; arithmetic under `provisional` |
| F6 | unresolved usage with no candidates silently dropped | `ALLOCATION_INFORMATION_MISSING` blocks every capacity in scope; candidates outside the graph reported as `USAGE_NOT_ATTRIBUTABLE_IN_GRAPH` |
| F7 | `ambiguous` = snapshot count | `ambiguous` derives from Phase-4B `AMBIGUOUS_INPUT` / `SNAPSHOT_SET_UNSAFE`; `multiSnapshot` and `conflictingInputKeys` added |
| F8 | every Phase-3 relationship fed cycle detection | `LEGAL_RELATIONSHIP` edge kind; `DEPENDS_ON` only from RULE_REFERENCE; cycles over evaluation edges only; frozen corpus now 0 cycles |
| F9 | unquantified share left the member AVAILABLE | both ends REVIEW_REQUIRED with `effectiveRemaining` NOT_DETERMINED and local arithmetic provisional |
| F10 | duplicate-id test asserted codes only | rewritten to assert status, code, applied ids, usage, remaining and forbidden amounts |
| U8 | supplied negative usage created capacity | `USAGE_AMOUNT_NOT_REPRESENTABLE`; a negative row is representable only as the source half of a conserved reclassification pair |
| U10 | duplicate election ids executed | `DUPLICATE_ELECTION_IDENTITY`, `ELECTION_ALREADY_APPLIED` |
| U11, U16 | documentation | produced vs reserved kinds split; `PATH_NOT_THIS_CAPACITY` removed; gate-32 change disclosed |

## Original tests that changed

Four original tests encoded the incorrect behaviour the audit found and were replaced, each with
the prior expectation, why it was wrong and the governing requirement stated in the test file and in
`02-remediation-plan.json` (cycle test F; duplicate-usage test; three scope-rejection tests; the
`ledgerEntriesApplied === 2n` counter assertion). No snapshot or expected value was updated silently.

## Suites

- `tests/contract-model/runtime/capacity/forensic-regression.test.ts` - every audit probe (P3, P7,
  P8, P12, P13, P15, P16, P18, P19, P19b, P20, P21, P22) asserting the governing invariant.
- `tests/contract-model/runtime/capacity/remediation-matrices.test.ts` - R4 A-J, R5, R7, R8 (every
  sufficiency value and unsafe scope), R9, R10 (six cases), R11 (six cases), R12 A-E, R13.
- The five original files, with the four replacements above.

## Artifacts

| # | file |
|---|---|
| 00 | `00-pre-remediation-closure-package/` - the falsified package, verbatim |
| 01 | `01-independent-audit-findings.json` |
| 02 | `02-remediation-plan.json` - scope, freeze identities, design decisions, changed tests |
| 03 | `03-reclassification-conservation.json` - R4 A-J executed through production code |
| 04 | `04-ledger-identity.json` |
| 05 | `05-shared-capacity-identity.json` |
| 06 | `06-legal-state-dominance.json` - the table, executed over every value |
| 07 | `07-unquantified-shared-capacity.json` |
| 08 | `08-allocation-and-snapshot.json` |
| 09 | `09-cycle-semantics.json` - synthetic A-E and the frozen corpus |
| 10 | `10-complexity-remediation.json` - algorithmic sources, counters, supplemental wall-clock |
| 11 | `11-adversarial-regression.json` |
| 12 | `12-real-fixture-retest.json` - 0 quantified pools, 0 executable reclassification edges, kept explicit |
| 13 | `13-full-regression.json` - full vs base, targeted, isolation runs, direct measurement, tsc/lint/build |
| 14 | `14-recertification.json` - the 32 conditions and the verdict |
| 15 | `15-phase4d-handoff.json` - written only after recertification, with the Phase-4D starting SHA |

## Inherited instability

The two wall-clock identities over `segmentCoordinateClauses` remain INHERITED FLAKY / UNSTABLE.
They are not waived and not called passing. `13-full-regression.json` carries the isolation runs
on the unchanged Phase-3 tree and the direct log-log measurement for this run.

Regenerate with `scripts/phase-4c-recertification.ts` (inputs by environment variable, as the
header documents); the handoff artifact with `--handoff <sha>`.
