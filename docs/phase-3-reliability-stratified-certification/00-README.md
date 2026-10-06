# Phase 3 reliability — stratified real-provision certification (DESIGN)

**Status:** `DESIGN_DRAFT`  
**Base SHA:** `9c5f57664f3416769cf29d72d6d1f35b572a97e5` (main after related-series interim B / PR #63)  
**Roadmap:** `docs/headroom-north-star-reconciliation/06-revised-roadmap.md` steps **1→2** (stratified set); step 3 semantic freeze is **after** this cert set lands.  
**Soft gate:** freeze + design / offline pin ONLY. No live certification runs. No provider / paid §7.5(j) calls. No NS-4. No additive related-series IR A/C. Do not reopen sealed A/B (`semantic-accountability.v8`). localRef gap CLOSED_OFFLINE.

## Packet contents

| artifact | role |
|---|---|
| `00-selection-contract.json` | Frozen selection contract: strata, deterministic pick rules, cost ceiling, acceptance, exclusions |
| `first-target/` | Offline-pinned **first** live-cert candidate (identity + operative-state + eligibility + as-of preflight only) |

## Review owners

Architect · Product · COO — sign off on the selection contract and first-target pin before any live/paid chunk is authorized. Grok Bot opens/merges the docs PR through the usual gate after PASS.

## After PASS

Implementation / live stratified certification is a **later authorized chunk** (not this PR). First live attempt, if later authorized, must use the pinned `first-target` identity artifacts and the cost ceiling in the selection contract — never a silent target swap.
