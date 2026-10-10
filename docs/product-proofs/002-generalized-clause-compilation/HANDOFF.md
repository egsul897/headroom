# Product Proof 002 — Handoff (primary product bottleneck)

**Status:** Engineering effort redirects here after KF graph remediation PR #246 bounded checks.  
**Not in scope of #246:** corpus expand, Neon dedupe migration, CERTIFIED promotion of DISCOVERED edges.

## Objective

Generalized compilation of **authentic covenant clauses** into **source-backed IR** — the primary product bottleneck now that KF graph quality remediation is conditionally accepted for human merge of code/docs only.

## Constraints carried forward from KF remediation

- Graph expansion / global relationship rebuild remain **code-paused** (`KF_GRAPH_REMEDIATION_RESUME` + mass live-write token).  
- Open KF blockers stay open: TOCTOU without UNIQUE, 18,984 duplicates, 93 self-loops, untested migration rollback.  
- Do not treat DISCOVERED graph edges as CERTIFIED authority.  
- Keep work isolated from unrelated verified-execution churn unless intentionally integrated.

## Starting points in-repo

- Contract-model compiler / semantic layers under `lib/contract-model/`  
- Stratified certification / pin-candidate tests under `tests/stratified-cert/`  
- Covenant intelligence summarization under `lib/product/covenant-intelligence/`

This handoff file is a pointer only — implement PP002 on a dedicated branch, not by expanding Neon corpus writes.
