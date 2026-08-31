# Phase 3F.2 Resume — Final Report

**Verdict: `PHASE_3F_2_UNSEEN_PACKAGE_VALIDATION_FAILED`**

This supersedes the prior content of this document, which recorded
`PHASE_3F_2_ENVIRONMENT_BLOCKED` from the first resume attempt (the Vercel
AI Gateway account was at HTTP 402 insufficient_funds at that time). After
the account was topped up, this second resume attempt executed the real,
funded validation described below.

## Scope

This session resumed the frozen Riot Platforms, Inc. unseen-package
validation exactly as instructed: the same 3-document package (CIK
0001167419), the same validation contract (`00-validation-contract.json`,
unmodified), no re-selection, no threshold changes, no production changes.

## Sequence executed

1. **Prior evidence audit** — all required artifacts from the original run
   and Resume #1 confirmed present, valid, and consistent.
2. **Provider precondition** — a real probe against the Vercel AI Gateway
   returned **HTTP 200** (`resolvedProvider: claudeaws`), confirming the
   account had genuinely been topped up. Real cost: $0.000072.
3. **Preserved execution state audit** — recomputed (not blindly trusted)
   candidate/eligible-population counts from the preserved Stage 1–5
   fixtures.
4. **Cost forecast** — derived per-candidate cost from the 3 real prior
   successes plus an explicit margin (not a naive total÷3 split), forecast
   comfortably inside the frozen $15 total ceiling.
5. **Ground-truth reconciliation, committed before any comparison** — an
   adjudicator with no access to any Headroom pipeline output reconciled
   Reviewer A (100 claims) and Reviewer B (84 claims) into 117 canonical
   claims (54 CRITICAL / 59 MATERIAL / 4 BENIGN). Frozen at commit
   `a3cbd4e`, which precedes every commit touching the resumed semantic
   output — Git history itself proves the ordering.
6. **Resumed real semantic execution** — reused 3 prior successes, retried
   12 prior failures, and compiled 35 new candidates via a deterministic
   stratified sample (licensed by the validation contract's own precommitted
   cap-policy fallback), for 38 combined compiled / 37 verified / **0 fully
   verified**. Total cost: **$7.238268** of the $15 ceiling.
7. **Targeted S16 special check** — one additional, mission-mandated
   compile+verify call on the pre-identified doc-a Section 6.01(d)
   Event-of-Default carve-out (the provision both blind reviewers flagged as
   present in doc-a/doc-b and silently deleted in doc-c).
8. **Claim-level comparison** (117 claims, three-category framework:
   IN_SAMPLE / DISCOVERED_NOT_SAMPLED / NOT_DISCOVERED) and **pipeline
   attribution** of every NO_CREDIT claim.

## What the evidence shows

**Hard safety gates: ALL MET.** Zero critical dangerous silent omissions,
zero persisted false-VERIFIED or false-trusted material claims, zero
stale-as-current assertions, zero cross-tenant contamination, and 100%
material claim-specific safe-failure recall (7/7 on the measurable IN_SAMPLE
subset). The targeted carve-out check confirmed Headroom did **not** treat
the deleted 5.02(g)/6.01(d) carve-out as current trusted truth — it
extracted the provision honestly, attributed it to doc-a, and flagged the
dangling "Section 5.02(g)" cross-reference rather than resolving or
inventing a target for it.

**Discovery-recall gates: MET.** 95.6% material covenant-bearing section
recall (108/113) and 98.1% CRITICAL/MATERIAL claim discovery recall (53/54),
both measured against the full 887-candidate real discovery population.

**Two generalization gates: NOT MET.**

- **Material substantive credit rate: 46.2%** (6/13 IN_SAMPLE material
  claims) against a required ≥85%. The dominant cause (4/7 NO_CREDIT
  claims, 57%) is the semantic compiler partially under-extracting
  definition-heavy sections — dropping one defined term from an otherwise
  successful multi-definition batch, or truncating a definition with an
  ellipsis exactly over a required qualifier — never a wholesale failure.
  Verification correctly flagged non-confident status on every one of the 7.
- **Operative-state correctness: 0/1.** Both human reviewers agree doc-c is
  the operative document; Headroom's operative-state stage produced an
  empty, non-committal result (0 tracked provisions, no document
  designated), traced to both RESTATE_AGREEMENT amendment effects being
  stuck at `REVIEW_REQUIRED` because their restated target document could
  not be resolved — a PACKAGE_GRAPH-layer defect. This failed safely (no
  wrong document was asserted) but still misses the package's one
  operative-state question.

A smaller, related finding: doc-b's own verbatim copy of the carve-out
sentence was never discovered (though doc-a's copy was, and doc-c correctly
shows no match), a narrow discovery-layer gap found via zero-cost inspection
of the preserved discovery population.

## Verdict

**`PHASE_3F_2_UNSEEN_PACKAGE_VALIDATION_FAILED`.** Not contaminated
(production freeze held empty throughout), not environment-blocked
(execution completed for real), not cost-control-blocked ($7.24 of $15
spent). Phase 4 readiness: **`NO_GENERALIZATION_NOT_YET_SUFFICIENT`** —
explicitly distinguished from a trust-boundary blocker, since the frozen
system never exhibited dangerous silent certainty anywhere in this real,
funded execution. It knew what it did not know; it did not yet automate
enough of the material package, or resolve this package's operative-document
question, to clear the bar this phase set for building deterministic
contract computation on top of it.

Per the governing anti-endless-loop rule, this session stops here: no
production code is patched, no 3F.2.1 sub-phase is created, Riot is not
re-run or re-tuned, and no other unseen package is started. The evidence is
returned for a human architecture decision on the two identified
generalization gaps.
