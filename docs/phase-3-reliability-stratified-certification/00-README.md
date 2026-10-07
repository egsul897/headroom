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

---

## WITH_BUILDERS emitter honesty (append — pin HOLD)

**Status:** `DEFERRED` · pin **HOLD** · not `PINNED_OFFLINE` · not CERTIFIED  
**Chunk:** P3-WB1 · plan sha256 `02df6672bc9b6c33c73132b75863092562d2b7cef4925feaa7ced5f279fe712c`  
**Base SHA:** `990e8f891f1fdbd47d77dec8e27ca86e8896cee4`

Sealed `role === "BUILDER"` now derives `WITH_BUILDERS` (text heuristic supplemental only when role is not `BUILDER`). Chewy `discovery-candidate:f62db8ebcda9d35c4fc03b2a` (§6.01(b)(4)(a)(i), 285 chars) is UNIQUE and emits `WITH_BUILDERS`, but `eligible:false` (`UNRESOLVED_OPERATIVE_EVIDENCE`). No pin folder was written. Sibling §6.08 `discovery-candidate:6ffcfd3794d39597caa7b83b` stays unpinned (`AMBIGUOUS`). `IMPLEMENTED` ≠ `CERTIFIED`.

---

## Offline Chewy FinCov EXCEPTION (append — ADR-1)

**Status:** `PINNED_OFFLINE` · `eligible:true` · role **EXCEPTION** (soft gate — **not** CERTIFIED)  
**Chunk:** P3-CF2 · plan sha256 `0d2fa52ec22e192ef370d67896b9af01420a6390cd9db8461ff73e2696549ddd`  
**Base SHA:** `6c2009993a50f2496f4074ed8069d2fded41ba0a`  
**ADR-1:** append-only under `pins/chwy-2026-credit-agreement/1.08(d)(ii)--5be40987/v1/`. CF1 CONDITION packet `1.08(d)(i)--c2018498/v1/` untouched.

| artifact | role |
|---|---|
| `pins/chwy-2026-credit-agreement/1.08(d)(ii)--5be40987/v1/` | Emitter-produced Chewy §1.08(d)(ii) EXCEPTION (`eligible:true`) |
| `01-pin-matrix.json` | FinCov `chewyFollowOn.exceptionFollowOn` cites this cell; Chewy `FINANCIAL_TEST` stays deferred |

Primary `discovery-candidate:5be40987571c84b616abb07e` sealed UNIQUE (252 chars, single occurrence, identity assertions true, interim-B clean, `eligible:true`). The sealed role is EXCEPTION under the `FINANCIAL_COVENANTS` family. This pin is not a claim that a Chewy `FINANCIAL_TEST` became `eligible:true`. Fallback §1.08(g) `discovery-candidate:c3708f1e7541fd0456804118` stays unpinned. `WITH_BUILDERS` stays DEFERRED / pin HOLD. `PINNED_OFFLINE` ≠ `CERTIFIED`. `IMPLEMENTED` ≠ `CERTIFIED`.

### Review owners

Architect COMMENT (not APPROVE) · Notes/Cert · Trust (+IR as needed) · tip CI · COO MERGE AUTHORIZED. Merge HOLD. Do not self-merge. Live/paid **not** authorized hereby.

---

## Offline Chewy FinCov §1.08(g) EXCEPTION (append — ADR-1)

**Status:** `PINNED_OFFLINE` · `eligible:true` · role **EXCEPTION** (soft gate — **not** CERTIFIED)  
**Chunk:** P3-CF3 · plan sha256 `3b7085d44e81bf171aa7a0e753c01baba4250fb6cd0c9231a21967bde71f516f`  
**Base SHA:** `e5905c4e1c0981b4f5691e284171d50ea40387b2`  
**ADR-1:** append-only under `pins/chwy-2026-credit-agreement/1.08(g)--c3708f1e/v1/`. CF1 CONDITION packet `1.08(d)(i)--c2018498/v1/` and CF2 EXCEPTION packet `1.08(d)(ii)--5be40987/v1/` untouched.

| artifact | role |
|---|---|
| `pins/chwy-2026-credit-agreement/1.08(g)--c3708f1e/v1/` | Emitter-produced Chewy §1.08(g) EXCEPTION (`eligible:true`) |
| `01-pin-matrix.json` | FinCov `chewyFollowOn.exception108g` cites this cell; Chewy `FINANCIAL_TEST` stays deferred |

Primary `discovery-candidate:c3708f1e7541fd0456804118` sealed UNIQUE (904 chars, single occurrence, identity assertions true, interim-B clean, `eligible:true`). The sealed role is EXCEPTION under the `FINANCIAL_COVENANTS` family. This pin is not a claim that a Chewy `FINANCIAL_TEST` became `eligible:true`. `WITH_BUILDERS` stays DEFERRED / pin HOLD. CONMED is not rebound this cycle. `PINNED_OFFLINE` ≠ `CERTIFIED`. `IMPLEMENTED` ≠ `CERTIFIED`.

### Review owners

Architect COMMENT (not APPROVE) · Notes/Cert · Trust (+IR as needed) · tip CI · COO MERGE AUTHORIZED. Merge HOLD. Do not self-merge. Live/paid **not** authorized hereby.

---

## Offline CONMED INVESTMENTS §7.8(d) (append — ADR-1)

**Status:** `PINNED_OFFLINE` · `eligible:true` · role **BASKET** (soft gate — **not** CERTIFIED)  
**Chunk:** P3-CI2 · plan sha256 `1b84020d4e5f1acdf21a65278c3afca09995ced4730f859b63b63432154dbb7f`  
**Frozen plan base:** `ceb419bf772854ce67a4008713e4f91b0de20b1a`  
**PR base:** `129724b3f3b945a5c06f87f9630c9d3c6b87cb73` (main after #95; file-disjoint)  
**ADR-1:** append-only under `pins/conmed-2025-credit-facility/7.8(d)--8aaa7b74/v1/`. §7.8(l) packet `7.8(l)--3476b082/v1/` byte-untouched.

| artifact | role |
|---|---|
| `pins/conmed-2025-credit-facility/7.8(d)--8aaa7b74/v1/` | Emitter-produced CONMED §7.8(d) BASKET (`eligible:true`) |
| `01-pin-matrix.json` | INVESTMENTS cites this cell; `conmed78dStillUnpinned` false; Chewy INVESTMENTS stays DEFERRED |

`discovery-candidate:8aaa7b743717492d1a9fa0b2` sealed UNIQUE (389 chars, single occurrence, identity assertions true, interim-B clean, `eligible:true`). Sealed role is BASKET. The span is dirtier than §7.8(l): PDF page footer `103`, key-man-insurance proviso, discovery `multipleRulesLikely` true. The span was not narrowed. Those facts are machine-visible on the eligibility packet as `dirtySpanDiagnostics`. They are not `eligibilityBlockers`. Empty `eligibilityBlockers` means no eligible=false predicate (`eligible === (eligibilityBlockers.length === 0)`), not a clean window. Chewy INVESTMENTS remains DEFERRED. `PINNED_OFFLINE` ≠ `CERTIFIED`. `IMPLEMENTED` ≠ `CERTIFIED`.

### Review owners

Architect COMMENT (not APPROVE) · Notes/Cert · Trust (+IR as needed) · tip CI · COO MERGE AUTHORIZED. Merge HOLD. Do not self-merge. Live/paid **not** authorized hereby.

---

## Fresh-blind package prep (append — discovery only)

**Verdict:** `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`  
**Status:** `DISCOVERY_ONLY` · soft gate · not a pin · not CERTIFIED · not a Phase-3 grant  
**Tip inspected:** `1acdff345fff655f602fd61ff20c395028b6f140`  
**Report:** `06-fresh-blind-package-prep.md`  
**Lane 7 source:** PR #107. That rank is unchanged.

Prep order under the four criteria: Knife River, then Gibraltar. Insulet stays #107 rank 1 and is outside that pair because the recorded builder/reclass hits are on the indenture exhibit. The block is specific: amendment document form, unrecorded builder-phrase results, unverified HTML wrappers, the Gibraltar 2026 "dated as of" line, the Gibraltar 2022 builder-phrase window, and the absence of a frozen fresh-blind metric. No exhibit body was opened. No fixture was added. No discovery id was minted. `IMPLEMENTED` ≠ `CERTIFIED`. Rank ≠ ingestion.
