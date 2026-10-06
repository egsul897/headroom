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


---

## Pin-pipeline emitter (append — ADR-1)

**Status:** `IMPLEMENTED` (soft gate: offline tooling + emitted pin)  
**Base SHA:** `5cc2378c9f544001617e6ce0b3bce9dbf1e9bef6` (main after #68 offline pin-matrix)  
**Design:** `05-pin-pipeline-emitter-design.md`

| artifact | role |
|---|---|
| `scripts/stratified-cert/pin-candidate.ts` | CLI: `--package` `--discoveryId` `--asOf` `--out`; refuses `--live`/`--paid` |
| `scripts/stratified-cert/lib/emit-pin-packet.ts` | `pinCandidate(...)` → 5 JSON files |
| `pins/chwy-2026-credit-agreement/2.18(c)(vii)--cf3d8d94/v1/` | **Canonical** emitter-produced Chewy WITH_SHARED_CAPS pin |
| `pins/chewy-2.18c-vii-incremental-shared-cap/` | #68 hand golden — **untouched**; superseded as source of truth by emitter folder |
| `first-target/` | CONMED §7.6(c) baseline — **untouched** |

Soft exclusions unchanged: no live/paid, no NS-4, no related-series A/C, no inventing sealed IDs.


---

## Offline ASSET_SALES pin (append — ADR-1)

**Status:** `PINNED_OFFLINE` (identity) · `eligible:false` (fail-closed)  
**Base SHA:** `59e1193a6cca2adeb463bbae5e8d46bc4d800105` (main after #71/#72)  
**ADR-1:** append-only under `pins/chwy-2026-credit-agreement/`; `first-target/` + #68 hand pin untouched.

| artifact | role |
|---|---|
| `pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1/` | Emitter-produced Chewy ASSET_SALES Designated Non-cash Consideration BASKET |
| `01-pin-matrix.json` | ASSET_SALES stratum → PINNED_OFFLINE; honest UNRESOLVED_OPERATIVE_EVIDENCE |

### Why this pin

- Highest-leverage next stratum after Chewy WITH_SHARED_CAPS (#71): fills deferred ASSET_SALES with sealed `discovery-candidate:b54ed7fe4f8f7bb7c224d99b`.
- Modest 857-char window; single structural occurrence; all identity assertions true.
- Not CONMED §7.5(j) (historically live-exhausted / series residuals).
- Fail-closed `eligible:false` — offline bundle AMBIGUOUS_TARGET for Subsidiary / Uniform Commercial Code. Prefer honest blockers over inventing sealed IDs.
- Soft gate unchanged: offline only; no live/paid; no NS-4; no related-series A/C; no first-target/#68 mutation.

### Review owners

Architect · Product · COO — PASS/FAIL the ASSET_SALES identity pin + matrix update. Live/paid **not** authorized hereby.
