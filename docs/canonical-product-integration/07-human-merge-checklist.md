# Human Merge Checklist — Canonical Product Integration

**Verdict sought:** `CANONICAL_PRODUCT_INTEGRATION_READY_FOR_HUMAN_REVIEW`  
**Do not self-merge.**

## Pre-merge review

- [ ] Diff is bounded to five workstream merges + minimal wiring + docs/tests listed in the reconciliation register
- [ ] `#246` is **not** included
- [ ] `#281` is **not** included
- [ ] `#286` Round 1 fixtures/hashes are **not** altered
- [ ] Production IdP was **not** invented; activation remains BLOCKED
- [ ] `CONFIRMED_OPERATIVE_WITH_CAVEATS` / unproven CP cannot become PRODUCTION_AUTHORITY_ACTIVE
- [ ] UNKNOWN historical utilization cannot become zero
- [ ] `executeUnifiedVerifiedTransaction` remains the sole verified transaction orchestrator (no new solver)
- [ ] Persistence identity live proof relies on `#291` evidence (no production Neon writes in this PR)
- [ ] CI green on exact tip
- [ ] Typecheck + production build green

## Suggested merge order awareness

Already integrated on this branch via merge commits. Prefer merging **this integration PR** rather than re-merging `#283/#287/#282/#285/#290/#291` individually (avoids duplicate conflict resolution). After merge, close/supersede the five source PRs as integrated.

## Post-merge

- [ ] Kick Round 2 independent acceptance against merged main
- [ ] Open separate IdP/session/membership workstream (P0 blocker)
- [ ] Do not claim production readiness from hypothetical SATISFIED simulations
