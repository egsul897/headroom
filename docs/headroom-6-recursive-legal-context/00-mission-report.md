# HEADROOM-6 — Recursive Legal Context & Definition Retrieval

## Identity

| Field | Value |
|---|---|
| Agent | #6 |
| Starting SHA | `6abe42bae6dfe69bb72467daa7f460b727200d1b` (`origin/main` tip incl. #276) |
| Ending SHA | `3b1e2b48c15aab1750b88a9200abcab47d54afb3` |
| Algorithm | `phase-2d-context-retrieval.v6` |
| Holdout | WOR sealed package (diagnostic fixture; legal-reference answers untouched) |

## Dependencies (read-only)

| PR | Role | In main? |
|---|---|---|
| #276 | WOR independent evaluation + sealed holdout | Yes (starting tip) |
| #266 | PP002 / greater-of vertical slice | Open — not assumed |
| #274 | Package graph identity + operative handoff | Open — not assumed |

## Problem (before)

WOR Layer C (denom=10, body anchors):

| Metric | Before |
|---|---|
| SUFFICIENT | **0/10** |
| BUDGET_EXCEEDED | **9/10** |
| INCOMPLETE | **1/10** |
| Naive first-match body spans | **0/10** (TOC collisions 10/10) |

## Changes

1. **Canonical body anchors** (`body-anchor.ts`) — rank TOC/furniture vs operative body using structure, span length, gap-to-next-section, covenant/economic signals. Preserve all candidates as ambiguity evidence. Never emission-order first-match.
2. **Ambiguous cross-ref resolution** — self/ancestor TOC collisions → LOW disclosure; distinguishable body → retrieve body + preserve candidates; unresolved only when ranking fails.
3. **Definition-section narrowing** — `DEFINED_TERM:` evidence hints narrow §1.01-scale dumps to a single definition unit before budget burn.
4. **Priority-aware budget** — secondary definition-text Section mentions and deep nested overflow become continuation signals (REVIEW_REQUIRED), not hard BUDGET_EXCEEDED after closure has started. Tight budgets (`maxDefinitionDepth ≤ 2`, `maxItems`) still hard-stop. Defaults: depth 6, items 100.
5. **Context completeness manifest** — machine-readable proof on every bundle (`contextManifest`).

## After (WOR diagnostic, denom=10)

| Metric | After |
|---|---|
| SUFFICIENT | **1/10** (WOR-B-6.01) |
| REVIEW_REQUIRED | **9/10** |
| BUDGET_EXCEEDED | **0/10** |
| INCOMPLETE | **0/10** |

Remaining REVIEW_REQUIRED causes (honest, not false SUFFICIENT):

- Missing schedules/exhibits not present as structural nodes (`Schedule 1.02`, `6.03`, `2.01`)
- Nested definition continuation past depth bound
- Undeclared Title-Case morphology (`Equivalent Amount` — detector requires quote immediately before `means`; WOR drafts `"Equivalent Amount" of any currency … means`)
- Soft text-budget continuation on large historical docs

## Guardrails honored

- No paid inference
- No production Neon writes / migrations
- No sealed WOR legal-reference edits
- No issuer-specific selectors / clause-ID hardcoding in retrieval
- No covenant compiler / package identity / financial authority / UI changes

## Tests

- `tests/contract-model/context-retrieval-body-anchor.test.ts`
- `tests/contract-model/context-retrieval-recursive-closure.test.ts`
- Existing Phase 2D + foundation-audit context suites green

## Limitations / handoff

1. Definition detector still misses post-quote qualifiers before `means` (Equivalent Amount family).
2. Schedules/exhibits absent from structural index correctly force REVIEW_REQUIRED.
3. Restatement → operativeDocument resolution remains #274 / Layer D (out of scope).
4. WOR is now an exposed diagnostic fixture, not a fresh unseen holdout.
