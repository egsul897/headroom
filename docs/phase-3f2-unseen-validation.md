# Phase 3F.2 — Second Genuinely Unseen Whole-Package Validation

**Verdict: `PHASE_3F_2_ENVIRONMENT_BLOCKED`** (mid-run, after substantial real progress)

## Mission

Can the current frozen Headroom contract-intelligence system process a second
genuinely unseen, real-world, multi-document debt package and produce a
trustworthy whole-package contract state without package-specific
engineering? This phase set out to answer that with a fresh, objectively
selected package, a frozen validation contract, and two independent
source-first ground-truth reviewers.

## What happened

**Selection.** A candidate pool of 10 eligible issuers was built from SEC
EDGAR full-text search (metadata only — filing dates, exhibit counts/sizes,
never covenant content). A deterministic SHA256-hash selection (not a manual
pick) selected **Riot Platforms, Inc.** (NASDAQ: RIOT) — a Bitcoin-mining
company borrowing against digital-asset collateral from Coinbase Credit,
Inc., a genuinely novel domain never touched by this codebase. A
contamination check found only a bare, unopened company name in a prior
phase's candidate-pool log — not disqualifying.

**Acquisition.** Three real SEC-filed documents were downloaded and
preserved: the original Credit Agreement (2025-04-22, $100M), the Amended
and Restated Credit Agreement (2025-05-19, $200M), and the Second Amended
and Restated Credit Agreement (2026-04-21, $200M) — a genuine
base+amendment+restatement chain between Riot Platforms and Coinbase
Credit.

**Ground truth.** Two independent subagents, each blind to the other and to
any Headroom output, read all three source documents in full and built
claim-level inventories: Reviewer A found 100 claims (53 CRITICAL), Reviewer
B found 84 claims (43 CRITICAL). Both independently concluded the same
document is operative, and both independently caught the same non-obvious
finding — a Section 5.02(g)/6.01(d) carve-out present in the first two
documents that is silently deleted in the third — a strong sign both
reviews were genuine, careful reads.

**Pipeline execution.** The production pipeline ran end-to-end in its
normal dependency order with zero manual section selection. Stages 1–5
(structural indexing, 3-document discovery, package graph, context
retrieval, amendment pipeline + operative state) completed in full: 1,372
structural nodes, 887 discovered candidates (all three documents
`DISCOVERY_HEALTHY`), operative state resolved to the most recent document
— consistent with both ground-truth reviewers. Total real cost through
this point: $0.056.

**The block.** Stage 6 (compilation) began succeeding — 3 real compile
attempts, each landing on a conservative `REVIEW_REQUIRED` rather than a
confident answer, at a real cost of $0.82 — and then the Vercel AI Gateway
account ran out of funds (`HTTP 402 insufficient_funds`) on the remaining
12 of 15 pre-committed compilation attempts. A fresh probe run immediately
after confirmed the account is still out of funds. This is a genuine,
live-confirmed infrastructure funding failure, not a compiler defect: none
of the 12 blocked candidates was ever actually evaluated by the model.

**What the 3 real attempts do show.** All 3 compiled candidates landed on
`REVIEW_REQUIRED` at compile time and `VERIFICATION_FAILED` at verify time
— conservative, non-committal outcomes, never a false confident answer.
One of the three surfaced a genuine, correctly-caught defect: the
deterministic Layer 1 reconciliation engine flagged a compiled IR value
($100,000,000) fabricated with no matching source-side figure, before any
AI review was even needed. Even where the funding failure reached into
verification's own AI-backed steps, the system never silently marked a
starved candidate as VERIFIED — it correctly propagated the failure.

## Why this stops here rather than reporting a score

Only 3 of 755 eligible candidates (0.4%) ever received a real semantic
answer. Computing a "material claim credit rate" or "dangerous silent
omission rate" against the 184-claim, two-reviewer ground truth from a
sample this small would not merely be imprecise — it would misrepresent
either a genuinely conservative system as a failing one, or extrapolate
false confidence from too little evidence. Per this validation's own core
principle, the system "may not silently pretend that it does [know]" — and
neither may this report on its behalf.

## What is real and complete

- The validation contract, candidate pool, selection proof, contamination
  check, package manifest, and source acquisition (00–07).
- Full structural, discovery, package-graph, and operative-state results
  (08–13) — all real, all consistent with independent ground truth where
  comparable.
- Two independent, complete, blind ground-truth inventories (18–20).
- 14/14 permanent false-credit controls PASS; known-package regression
  (FWRG/LSB/CONMED/DSGR) unchanged from baseline; production-freeze proof
  empty on `lib/**`, `app/**`, `prisma/**` (25–27).

## What is blocked

- Claim-level comparison, semantic/safe-failure/trust metrics, and the
  threshold gate all read `NOT_EVALUABLE` rather than PASS or FAIL (14–16,
  21, 23–24) — insufficient real sample, not a measured shortfall.

## Findings

Four findings recorded (28-findings.json): one **ENVIRONMENTAL** (the
funds exhaustion itself — requires a human to top up the Gateway account,
no code change), two positive **safe-failure-working-as-designed**
observations, and one **evaluation defect of this run** (the pre-committed
compile cap combined with the funding failure leaves the core question
unanswered).

## Phase 4 readiness

**Cannot be answered this run.** None of the four precommitted options
(YES / YES_WITH_NONBLOCKING_BACKLOG / NO_TRUST_BOUNDARY_BLOCKER /
NO_GENERALIZATION_NOT_YET_SUFFICIENT) fit an untested case — selecting a
NO answer would misrepresent absence of evidence as evidence of failure.

## Resumption path

Everything expensive and hard-won is preserved: the frozen package, the
884-candidate discovery output, and both complete ground-truth inventories.
Once a human tops up the Vercel AI Gateway account, resume from Stage 6
candidate #4 (or re-run the full cap), complete Stage 7/8, reconcile the
two ground-truth inventories into one canonical list, and complete the
claim-level comparison. No re-selection, no re-acquisition, no re-review
needed.
