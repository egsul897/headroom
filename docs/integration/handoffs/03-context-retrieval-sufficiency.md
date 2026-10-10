# Handoff 03 — Context retrieval sufficiency under bounded budgets

**Priority:** 3  
**Owner:** completed by HEADROOM-6 (PR #287) — residual coverage → `docs/headroom-6-recursive-legal-context/18-next-legal-context-handoff.md`  
**Source:** WOR holdout — previously `contextSufficient: 0/10` (`budgetExceeded: 9`, `incomplete: 1`).

## Status (Agent #6)

| Metric | Before | After (#287) |
|---|---|---|
| SUFFICIENT | 0/10 | **1/10** (`WOR-B-6.01`) |
| REVIEW_REQUIRED | 0/10 | **9/10** |
| BUDGET_EXCEEDED | 9/10 | **0/10** |
| INCOMPLETE | 1/10 | **0/10** |
| False SUFFICIENT | — | **0** |

Canonical body anchors, recursive definition closure, soft-budget continuation, and `contextManifest` shipped. Fail-closed preserved. Do not reopen this handoff without a demonstrated regression.

## Residual (next workstream — not Agent #6)

- Equivalent Amount / Equivalent Currency definition morphology
- Schedule/exhibit structural coverage when source text includes them
- Consume #283 governing-document binding once that PR merges

## Out of scope (unchanged)

- Raising budgets unbounded / lowering sufficiency thresholds
- Paid expansion of context via LLM
- Changing sealed legal references
- Inventing schedules, definitions, or amendment authority
