# Handoff 03 — Context retrieval sufficiency under bounded budgets

**Priority:** 3  
**Owner:** next bounded remediation agent  
**Source:** WOR holdout — `contextDefsPresent: 10/10` but `contextSufficient: 0/10` (`budgetExceeded: 9`, `incomplete: 1`).

## Problem

Required definition names appear in retrieved bundles, yet `sufficiencyState` never reaches SUFFICIENT under current budgets. Compiler consumers therefore cannot treat context as complete for executable claims.

## In scope

- Diagnose budget accounting vs required dependency set for GT-anchored WOR probes.
- Adjust retrieval ranking / budget policy so necessary operative dependencies fit without truncating governing definitions.
- Keep fail-closed: never mark SUFFICIENT when unresolved dependencies remain.
- Adversarial tests for budget-exceeded vs incomplete vs sufficient.

## Out of scope

- Raising budgets unbounded
- Paid expansion of context via LLM
- Changing sealed legal references

## Acceptance

- Offline WOR eval: material improvement in `sufficiencySufficient` without false SUFFICIENT.
- No false-favorable capacity outcomes.
- `$0` paid inference.
