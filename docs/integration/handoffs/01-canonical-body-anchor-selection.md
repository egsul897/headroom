# Handoff 01 — Canonical body-anchor selection over TOC stubs

**Priority:** 1 (from WOR holdout)  
**Owner:** next bounded remediation agent (not this integration agent)  
**Source:** HEADROOM-5 scorecard — `spanCompleteNaiveFirstMatch: 0/10`, `tocCollisionCount: 10`, `spanCompleteBestNode: 10/10` when longest body node is chosen.

## Problem

Structure/discovery often binds to TOC stub `sectionRef` nodes. Naive first-match yields empty/incomplete operative spans. Body-ranked selection already works in the holdout scorer but is not the production default path for compiler consumers.

## In scope

- Make longest-body / non-TOC section node the canonical anchor for operative text extraction when TOC collisions exist.
- Propagate the chosen node id through discovery → context → offline compile.
- Add adversarial tests: TOC stub vs body section for WOR-like fixtures (without unsealing or rewriting legal refs).
- Preserve fail-closed behavior when no body node can be uniquely selected.

## Out of scope

- Paid Pass B discovery
- Operative restatement authority (handoff 02)
- Context budget tuning (handoff 03)
- Production Neon writes

## Acceptance

- On sealed WOR holdout offline eval: `spanCompleteNaiveFirstMatch` path either deprecated or equal to body-ranked path; no TOC-stub-only operative text for the 10 GT clauses.
- No change to sealed source hashes or legal-reference chronology.
- `$0` paid inference for validation.
