# Pre-Unseen Classifier Closure

## Purpose

The prior post-3F.2 remediation's own Riot regression replay discovered a genuine, independent, pre-existing defect as a byproduct: `document-classifier.ts` misclassified the original Riot Credit Agreement (doc-a) as `COMPLIANCE_CERTIFICATE`, because a table-of-contents/exhibit-list entry ("Form of Compliance Certificate") was matched ahead of the document's own real "CREDIT AGREEMENT" caption. That defect was explicitly disclosed but left unfixed (out of scope for that session's two authorized units). This session closes it, before the final lightweight unseen confirmation the prior session's own readiness verdict requires.

## Root Cause

Independently re-traced from the real, frozen Riot doc-a source text (`docs/pre-unseen-classifier-remediation/01-root-cause.json`): `document-classifier.ts`'s Tier 2 fallback scanned its `RULES` array in a fixed order and returned the type of the *first rule checked* that matched anywhere within the 3000-character preamble window - never comparing *where in the text* each candidate rule's evidence actually appeared. `COMPLIANCE_CERTIFICATE` sits at array index 7; `CREDIT_AGREEMENT` sits at array index 12. In doc-a's real text, `CREDIT_AGREEMENT`'s own caption match occurs at character 276 - 2,328 characters *before* `COMPLIANCE_CERTIFICATE`'s match at character 2604 (a table-of-contents Exhibit E entry) - but because the loop checked rules in array order rather than by text position, the later, weaker TOC mention won.

## Fix

Tier 2 now selects the rule whose evidence appears **earliest in the document's own text**, across all of that rule's alternative patterns - not the rule checked first in array order. This is a structural change (a document's own caption is always textually earliest; any mention of another document type it references, requires, or attaches is necessarily later), not a keyword reorder: the `RULES` array and every pattern in it are byte-for-byte unchanged.

A bounded, overlap-aware ambiguity guard (`DETERMINISTIC_CAPTION_AMBIGUOUS`, one new resolution-method literal) returns safe uncertainty for a genuinely fused, conflicting caption (e.g., "CREDIT AGREEMENT AND SECURITY AGREEMENT..." with no established composite type) rather than an arbitrary confident pick. It is deliberately scoped to fire only when the *winning* match is itself a base facility type (`CREDIT_AGREEMENT`/`INDENTURE`) - an initial, unscoped version of this guard false-positived on 19 previously-passing tests, because every other document type in this system's own design (amendments, guarantees, security agreements, joinders, intercreditor agreements) routinely and legitimately names a base facility or related document within its own caption, by ordinary financing-document drafting convention. That design iteration is documented transparently in `03-implementation-results.json`, not hidden.

No schema change. One pre-existing test that explicitly documented the old, buggy outcome as a "disclosed boundary" is updated to assert the now-corrected behavior, since this fix directly closes that exact gap.

## Verification

- **18/18 generic adversarial tests** (`tests/contract-model/pre-unseen-classifier-remediation.test.ts`, C1-C10 plus 5 regression guards) on wholly synthetic fixtures.
- **Full existing regression suite** (103 package-graph/classifier tests, then the full 3,096-test repository suite) passes with zero new failures.
- **Known-package regression** (FWRG/LSB/CONMED/DSGR): byte-for-byte identical before and after, via a temporary worktree comparison.
- **Real Riot doc-a**, re-classified directly against the frozen source text: now correctly `CREDIT_AGREEMENT`.

## Riot Deterministic Replay

Deterministic only - no AI/semantic call. With the classifier fixed:

- doc-a: `CREDIT_AGREEMENT` (fixed).
- doc-b's restatement target: now correctly resolves to doc-a (`RESOLVED`, 0.95 confidence, direct type+date match) - was incorrectly doc-c before this fix.
- doc-c's restatement target: still correctly resolves to doc-b (`REVIEW_REQUIRED`, 0.7, chronological-predecessor) - unchanged, already correct from the prior remediation session.
- **The operative-document cycle from the prior session's own replay is closed.** `computeOperativeDocument` now resolves the full chain doc-a → doc-b → doc-c, with doc-c correctly identified as the current operative document - purely from the existing, unmodified, generic algorithm now that its input (document classification) is correct.

This matches the expectation the prior session's own governing spec described as plausible "if justified by unchanged evidence" - it was not hardcoded; it falls out of the same generic mechanism used for the synthetic test fixtures.

## Deleted Carve-Out Safety Check

Re-verified against doc-a's own real Section 6.01(d) node (the EXCEPTION carve-out both independent blind ground-truth reviewers flagged as deleted in doc-c). The pre-existing node-supersession mechanism reports this node `CURRENT_OPERATIVE` - **confirmed identical, byte-for-byte, before and after this session's fix** via a temporary pre-fix worktree comparison. This session's change did not cause, worsen, or newly introduce this exposure. It is, however, a genuine, disclosed, pre-existing limitation: `buildNodeSupersessionIndex` does not yet consume the newer whole-document `operativeDocument` concept to mark a predecessor document's own nodes as superseded. That is flagged here for a future, separately-scoped session - not fixed in this one, per this session's own explicit scope boundary (classifier-only).

## Independent Audit

A fresh, adversarial re-read of the full diff against the required checklist (first-match keyword dependence, benchmark-specific strings, title-zone assumptions, TOC/exhibit contamination, amendment misclassification, embedded-form identity confusion, false confidence under ambiguity) found no blocker. See `docs/pre-unseen-classifier-remediation/10-independent-audit.json`.

## Readiness

`READY_FOR_LIGHTWEIGHT_UNSEEN_CONFIRMATION` - every criterion in the required readiness gate is met, with no unmet items (a materially stronger result than the prior remediation session's own gate, whose two unmet, hedged items both traced to this exact defect). This does **not** declare Phase 4 ready - a separate, lightweight, genuinely-unseen package confirmation remains required first and was explicitly not performed in this session.
