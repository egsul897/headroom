# Cursor continuous engineering ledger

Branch: `cursor/architecture-remediation-7cc2`
Base: `cursor/gibraltar-haiku-verify-7cc2`
PR: https://github.com/egsul897/headroom/pull/136 (draft)
Claude-owned paths are not edited. DEVELOPMENT is not CERTIFIED. Paid provider spend this session: $0.

## Repository reconciliation

- Starting SHA for this session: `bb9bfd4bd6f426a7f5f8e26019a872e04264a1c0` (in sync with `origin/cursor/architecture-remediation-7cc2`). CI on that SHA: 9 checks passed.
- `origin/main` was `9de4e5737166fcec84a35fdc9a3404870549211f`. Not merged. Merge-base with this branch remains `554698a`.
- Independent acceptance PR #137 head observed at `d780414` on `claude/independent-product-validation`. Read only.

## P0-A — Entity-scope widening

- Status: PUSHED (see commit on this branch after `bb9bfd4`).
- Severity: P0 false permission.
- Reproduction: frozen replay `tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json`, rule `ir-rule:01c9a005fd9c7649ddc26012`, section `6.01(a)`, posture PERMISSION. Submitted scope `[BORROWER]`, sufficiency COMPLETE. Own excerpt is a ratio basket with no obligor words. Cited-unit lead-in is the section prohibition (`the Borrowers shall not, and shall not permit any of their Restricted Subsidiaries`).
- Root cause: when that lead-in was verbatim operative text, `ownDerived` became `[BORROWER, GUARANTOR_RS, NON_GUARANTOR_RS]`. The unmet-signal branch adopted that wider set, left `SOURCE_SCOPE_DERIVED` (`safeToRely` true) and COMPLETE. A second pass over the cleared scope used the empty-submission fill and wrote the same set back.
- Fix: a submitted scope that is narrower than, or different from, the clause's own derived set is reset to empty, `UNDERINCLUSIVE_VS_SOURCE`, and PARTIAL. Tags the submission did not carry are not added. An empty submission is filled only from an authenticated governing chain when the clause itself binds no obligor. Replaying a cleared permission does not restore the prohibition's obligors.
- Preserved: a submitted scope that already equals the prohibition stays `SOURCE_MATCH_CONFIRMED`. A clause that names only the Borrower still narrows a wider submission (`MODEL_WIDER`). Governing-scope inheritance when the clause binds no obligor still outranks a narrower model scope (GS5).
- Tests: `tests/contract-model/entity-scope-guard.test.ts` (frozen replay, prohibition-must-not-widen, different-class refusal, replay does not refill). `npm run test:phase3-certification` 459 passed. `npx tsc --noEmit -p .` clean. `tests/contract-model/entity-scope.test.ts` skipped (no `DATABASE_URL`).
- False-permission implication: the ratio permission is no longer confirmed for guarantor and non-guarantor restricted subsidiaries. Empty scope on replay is `UNSPECIFIED`, which the transaction simulator reports as `SCOPE_UNSPECIFIED` (review), not `CONFIRMED_APPLICABLE`.

## Queue

| Id | Severity | Status | Next action |
| --- | --- | --- | --- |
| P0-A entity-scope widening | P0 | VERIFIED locally | Watch CI on the push SHA |
| P0-B IPV-19 definition amendment replaces all of Section 1.01 | P0 | QUEUED | Definition-level target; do not `REPLACE_TEXT` the section |
| P0-B IPV-20 retrieval ignores operative definition | P0 | QUEUED | After IPV-19, hand the compiler the operative definition |
| P0-C IPV-16 notwithstanding side letter | P0 | QUEUED | Unresolved override must block `OPERATIVE_STATE_RESOLVED` |
| P0-D IPV-02 / IPV-03 | P0 | VERIFIED on `bb9bfd4` | Re-check only if those files change |
| P0-E source authentication | P0 | VERIFIED on `bb9bfd4` | Do not reopen |

## Blockers

None for the queued P0 items. Do not merge. Do not spend. Do not edit Claude-owned fixtures.
