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

## P0-B — Definition amendments (IPV-19, IPV-20)

- Status: PUSHED in `ab158c3`.
- Reproduction: `The definition of "Consolidated EBITDA" in Section 1.01 ... is hereby amended and restated ... to read as follows`. The section-restatement pattern matched the locator `Section 1.01 ... is hereby amended and restated` and emitted `REPLACE_TEXT` for the whole section.
- Fix: a definition sentence that names its section is a definition candidate. The section pattern does not reclaim that span. `REPLACE_DEFINITION` captures the quoted replacement. The section's operative text is the base section with that one definition span replaced, when the old span occurs once. Retrieval uses that operative definition text instead of the static base definition.
- Preserved: a real `Section 6.01 is hereby amended and restated` remains a section replacement. `Section 1.01 is hereby amended by amending and restating the definition of ...` stays a section candidate for interpretation and is not captured as a deterministic definition replacement.
- Tests: `tests/contract-model/definition-level-amendment.test.ts` 6 passed. `phase-2g-amendment-precedence.test.ts` 48 passed. `context-retrieval-pipeline.test.ts` 36 passed. `npx tsc --noEmit -p .` clean.
- False-permission implication: an EBITDA amendment that removes an add-back no longer leaves the compiler with the larger base definition, and it no longer deletes the other definitions in the section.

## P0-C — Side letters, consents, and waivers (IPV-16)

- Status: PUSHED in `9c53820`.
- Reproduction: a document captioned `SIDE LETTER` or `CONSENT` says `Notwithstanding Section 7.01(b)` and states a different cap. The amendment pipeline produced no effect. Operative state stayed `OPERATIVE_STATE_RESOLVED` on the base cap.
- Fix: that caption plus a named section records `UNKNOWN_CHANGE` with `newText` null and reason `UNCLASSIFIED_OVERRIDE`. No interpreter call. The named provision is `REVIEW_REQUIRED` and does not keep the base amount as current text. If the section exists in more than one agreement, the effect stays unattached and the instrument is still not `RESOLVED`. A credit agreement's own notwithstanding clause is not an override document.
- Tests: `tests/contract-model/unclassified-override.test.ts` 4 passed. `phase-2g-amendment-precedence.test.ts` 48 passed. `npm run test:phase3-certification` 459 passed.
- Not done: the legal effect of the override is not interpreted. A side letter that names no section is not yet flagged.

## IPV-04 — Section operative text kept superseded clauses

- Status: local tests passed; push follows this entry.
- Severity: P0 wrong operative source. A deleted basket compiled from the parent section is a live permission.
- Reproduction: Amendment 1 restates `7.01(b)` from `$25,000,000` to `$40,000,000`. Amendment 2 deletes `7.01(d)` (`$15,000,000`). Operative state resolves both clauses. `resolveOperativeSource` for section `7.01` returned the base descendants, including both stale amounts.
- Root cause: supersession is recorded on the clause node. The parent section has no provision view, so the candidate-span fallback read `getNodeText(section, DESCENDANTS)`. A definition amendment sourced on the enclosing section could also win that lookup and replace the section with the single new definition.
- Fix: a resolved clause replacement or deletion is spliced into the parent when the old span occurs once. Overlapping or repeated spans, and any descendant amendment that is not resolved, withhold the parent text. A definition provision no longer governs a section candidate. Context retrieval uses the same operative text for the operative-source item, child rules, and definition scan.
- Preserved: a review-required amendment of a node that has no amended descendants still falls back to that node's base text. An unresolved amendment of the section itself does not keep the base section when a child clause was replaced. A real section restatement still wins over its old children.
- Tests: `tests/contract-model/section-operative-splice.test.ts` 6 passed. Context retrieval 36, phase-2g 48, architecture 17, definition-level 6, unclassified-override 4 passed. `npm run test:phase3-certification` plus the new file: 465 passed. `npx tsc --noEmit -p .` clean.
- False-permission implication: the parent section no longer compiles the replaced `$25,000,000` cap or the deleted `$15,000,000` basket. When the splice is not unique, the section text is withheld rather than certified from the base document.

## Queue

| Id | Severity | Status | Next action |
| --- | --- | --- | --- |
| P0-A entity-scope widening | P0 | VERIFIED locally | Watch CI on the push SHA |
| P0-B IPV-19 definition amendment replaces all of Section 1.01 | P0 | VERIFIED locally | Definition target plus section splice; see definition-level-amendment tests |
| P0-B IPV-20 retrieval ignores operative definition | P0 | VERIFIED locally | Bundle excerpt uses the operative definition when one exists |
| P0-C IPV-16 notwithstanding side letter | P0 | VERIFIED locally | Unresolved override; no invented amount; base cap not RESOLVED |
| IPV-04 section candidate compiles superseded clauses | P0 | VERIFIED locally | Parent operative text splices resolved clause replacements and deletions |
| P0-D IPV-02 / IPV-03 | P0 | VERIFIED on `bb9bfd4` | Re-check only if those files change |
| P0-E source authentication | P0 | VERIFIED on `bb9bfd4` | Do not reopen |

## Blockers

None for the queued P0 items. Do not merge. Do not spend. Do not edit Claude-owned fixtures.
