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


---

## Offline LIENS pin (append — ADR-1)

**Status:** `PINNED_OFFLINE` · `eligible:true` (Certification preference)  
**Base SHA:** `7a06e70d5701147fb775061b81e924054a403e29` (main after #73 ASSET_SALES)  
**ADR-1:** append-only under `pins/conmed-2025-credit-facility/`; `first-target/` + #68 hand pin + #73 ASSET_SALES packet untouched.

| artifact | role |
|---|---|
| `pins/conmed-2025-credit-facility/7.3(m)--b5bb07b0/v1/` | Emitter-produced CONMED LIENS general Lien BASKET (`eligible:true`) |
| `01-pin-matrix.json` | LIENS stratum → PINNED_OFFLINE; Chewy LIENS/INVESTMENTS scout honesty refresh |
| `00-selection-contract.json` | `matrixRowsTbd` LIENS synced → PINNED_OFFLINE (pinAuthority `01-pin-matrix.json`; Chewy LIENS DEFERRED) |
| `05-pin-pipeline-emitter-design.md` | Living-design **append** amendment (prior Status/priority list retained verbatim — not ADR-1 evidence mutate) |

### Why this pin

- Goal preferred **eligible:true** Chewy LIENS or INVESTMENTS. Sealed Chewy scout: 1.01 BASKET/SHARED_CAP AMBIGUOUS (353k chars); body §6.02 AMBIGUOUS; modest pure-LIENS/INVESTMENTS spans that seal identity emit `eligible:false` (`UNRESOLVED_OPERATIVE_EVIDENCE`). Fail-closed: do not invent narrower Chewy IDs or dress ineligible as CERTIFIED.
- CONMED §7.3(m) is selection-contract named; seals cleanly offline (458 chars, single occurrence, all identity assertions true, interim-B clean, `eligible:true`).
- Map honesty `COMPILE_FAILED` is **not** pre-credit.
- Soft gate unchanged: offline only; no live/paid; no NS-4; no related-series A/C; no first-target/#68/#73 mutation.

### Review owners

Architect · Product · COO — PASS/FAIL the LIENS eligible:true pin + matrix update. Live/paid **not** authorized hereby.

---

## Offline INVESTMENTS pin (append — ADR-1)

**Status:** `PINNED_OFFLINE` · `eligible:true` (soft gate — **not** CERTIFIED)  
**Base SHA:** `8214c6c477c5a28369a855ebf1fb78a654c85763` (main after #76 LIENS and #77 clear() removal)  
**ADR-1:** append-only under `pins/conmed-2025-credit-facility/`; `first-target/` + #68 hand pin + #73 ASSET_SALES + #76 LIENS packets untouched.

| artifact | role |
|---|---|
| `pins/conmed-2025-credit-facility/7.8(l)--3476b082/v1/` | Emitter-produced CONMED INVESTMENTS general basket (`eligible:true`) |
| `01-pin-matrix.json` | INVESTMENTS stratum → PINNED_OFFLINE; Chewy INVESTMENTS + unpinned §7.8(d) honesty |
| `00-selection-contract.json` | `matrixRowsTbd` INVESTMENTS synced → PINNED_OFFLINE (pinAuthority `01-pin-matrix.json`; Chewy INVESTMENTS DEFERRED; §7.8(d) unpinned) |
| `05-pin-pipeline-emitter-design.md` | Living-design **append** amendment (prior Status/priority/LIENS amendment retained verbatim) |

### Why this pin

- Both authorized CONMED scouts seal `eligible:true` UNIQUE offline. Primary pin is §7.8(l) `discovery-candidate:3476b082d53dec709a3dca23` (427 chars, single occurrence, all identity assertions true, interim-B clean, `multipleRulesLikely: false`, no page-footer artifact).
- §7.8(d) `discovery-candidate:8aaa7b743717492d1a9fa0b2` stays **unpinned**: 389 chars is smaller, but the operative window embeds PDF page footer `103` and a key-man proviso. Eligible scout, not the cleaner span.
- Chewy INVESTMENTS remains **DEFERRED** (1.01 AMBIGUOUS; modest spans `eligible:false`). Do not invent IDs.
- Map honesty `UNSERVED` is **not** pre-credit. PINNED_OFFLINE ≠ CERTIFIED.
- Soft gate unchanged: offline only; no live/paid; no NS-4; no related-series A/C; no first-target/#68/#73/#76 mutation.

### Review owners

Architect · Product · COO — PASS/FAIL the INVESTMENTS eligible:true pin + matrix update. Live/paid **not** authorized hereby. Merge HOLD until Architect+Trust+COO+CI.

---

## Offline FINANCIAL_COVENANTS pin (append — ADR-1)

**Status:** `PINNED_OFFLINE` · `eligible:true` (soft gate — **not** CERTIFIED)  
**Base SHA:** `8b48921c1f300bab2f0617c81fa6f7ab9446ae63` (main after #78 INVESTMENTS)  
**ADR-1:** append-only under `pins/conmed-2025-credit-facility/`; `first-target/` + #68 hand pin + #73 ASSET_SALES + #76 LIENS + #78 INVESTMENTS packets untouched.

| artifact | role |
|---|---|
| `pins/conmed-2025-credit-facility/7.1(c)--5f83b15e/v1/` | Emitter-produced CONMED Minimum Interest Coverage Ratio FINANCIAL_TEST (`eligible:true`) |
| `01-pin-matrix.json` | FINANCIAL_COVENANTS stratum → PINNED_OFFLINE; leverage-sibling and Chewy scout honesty |
| `00-selection-contract.json` | `matrixRowsTbd` FINANCIAL_COVENANTS synced → PINNED_OFFLINE (pinAuthority `01-pin-matrix.json`) |
| `05-pin-pipeline-emitter-design.md` | Living-design **append** amendment (prior Status/priority/LIENS/INVESTMENTS amendments retained verbatim) |

### Why this pin

- Governing-definition check now run offline. CONMED §7.1(c) `discovery-candidate:5f83b15ed6cd0ea8b06289a0` (234 chars, single occurrence, all identity assertions true, interim-B clean, `multipleRulesLikely: false`) does not name Phase-2 `OPERATIVE_STATE_REVIEW_REQUIRED` leverage definitions and has no governing review provision. `eligible:true`.
- §7.1(a) `discovery-candidate:8fe38049fe62ea9e9e741511` and §7.1(b) `discovery-candidate:cf15af8f5fb1f77bd861a2ac` stay **unpinned**: identity seals, `eligible:false` (`PHASE2_REVIEW_REQUIRED_MENTIONED_IN_OPERATIVE`).
- Chewy hinted FINANCIAL_TEST §1.08(a)(i) and §1.04(b) stay **unpinned**: identity seals, `eligible:false` (`UNRESOLVED_OPERATIVE_EVIDENCE`). Eligible:true Chewy calculation clauses are not `FINANCIAL_TEST` and stay unpinned.
- Map honesty `MAPPED_WITH_REVIEW` / `CANDIDATE_COMPILE_REVIEW_REQUIRED` / `VERIFICATION_INCOMPLETE` is **not** pre-credit. Canonical map certification status remains `NOT_CERTIFIED`. PINNED_OFFLINE ≠ CERTIFIED.
- Soft gate unchanged: offline only; no live/paid; no NS-4; no related-series A/C; no first-target/#68/#73/#76/#78 mutation.

### Review owners

Architect · Product · COO — PASS/FAIL the FINANCIAL_COVENANTS eligible:true pin + matrix update. Live/paid **not** authorized hereby. Merge HOLD until Architect+Trust+COO+CI.

---

## Offline Chewy FinCov follow-on (append — ADR-1)

**Status:** `PINNED_OFFLINE` · `eligible:true` · role **CONDITION** (soft gate — **not** CERTIFIED)  
**Chunk:** P3-CF1 · plan sha256 `6f71e081842913e79ce22dd0a018d891feb5d78a39cd2f14274120a98c130483`  
**Base SHA:** `7351d0fad8d75451b39a6ffb338de41be90518fc`  
**ADR-1:** append-only under `pins/chwy-2026-credit-agreement/1.08(d)(i)--c2018498/v1/`. Prior pins untouched.

| artifact | role |
|---|---|
| `pins/chwy-2026-credit-agreement/1.08(d)(i)--c2018498/v1/` | Emitter-produced Chewy §1.08(d)(i) CONDITION (`eligible:true`) |
| `01-pin-matrix.json` | FinCov `chewyFollowOn` cites this cell; Chewy `FINANCIAL_TEST` stays deferred |

The sealed role is CONDITION under the `FINANCIAL_COVENANTS` family. This pin is not a claim that a Chewy `FINANCIAL_TEST` became `eligible:true`. Hinted `FINANCIAL_TEST` spans stay `eligible:false` and unpinned. `PINNED_OFFLINE` ≠ `CERTIFIED`. `IMPLEMENTED` ≠ `CERTIFIED`.

### Review owners

Architect COMMENT (not APPROVE) · Notes/Cert · Trust · COO · CI. Merge HOLD. Live/paid **not** authorized hereby.
