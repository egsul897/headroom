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

## Headroom Answer (product parity)

Headroom Answer = paths / capacity / conditions / provenance.

## Canonical map honesty (first-target)

Canonical map currently tags `discovery-candidate:565fd64640e534d8a46bbe7a` with historical `CANDIDATE_COMPILE_REVIEW_REQUIRED` / `MATERIAL_DISCREPANCY`. Offline pin remains valid. Later live `CERTIFIED` must clear production blockers honestly — map REVIEW is **not** pre-credit.

---

## Offline pin-matrix packet (append — ADR-1)

**Status:** `OFFLINE_PIN_MATRIX_PARTIAL`  
**Base SHA:** `d5ac8beebc9e02117cbf9344ac7d13929e54e217` (main after #66 ADR-1 ACCEPTED + #64 stratified design)  
**ADR-1:** `docs/architecture/EVIDENCE-PACKET-VERSIONING-ADR.md` — append-only; `first-target/` identity frozen (BASELINE_PINNED).  
**Soft gate:** offline pins ONLY. No live/paid. No NS-4. No related-series A/C. No A/B seal reopen.

| artifact | role |
|---|---|
| `01-pin-matrix.json` | Thin strata × cross-cuts matrix: PINNED_OFFLINE / BASELINE_PINNED / DEFERRED / BLOCKED |
| `pins/chewy-2.18c-vii-incremental-shared-cap/` | First **Chewy** offline pin + **WITH_SHARED_CAPS** (DEBT Incremental Cap) |
| `first-target/` | Unchanged CONMED §7.6(c) RP baseline (WITHOUT_SHARED_CAPS) |

### Why this Chewy pin

- Prefer Chewy + WITH_SHARED_CAPS before more CONMED-only heroes.
- Sealed discovery `discovery-candidate:cf3d8d9492aeca04392b5172` role `SHARED_CAP` on `doc-a::2.18(c)(vii)` (842 chars, single occurrence).
- Remaining strata rows are DEFERRED/BLOCKED stubs with sealed-tree hints — follow-on pin folders, not invented IDs.

### Review owners

Architect · Product · COO — PASS/FAIL the Chewy pin + thin matrix. Live/paid **not** authorized hereby.
