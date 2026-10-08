# Independent Remediation Replay — Amendment-Chain Research

**Role:** Independent legal challenger (replay; not source-author)  
**Research PR:** #150  
**Remediated SHA reviewed:** `50eb36b9116fee788fe89eaa588875ccb5c2681e`  
**Original reviewed SHA:** `ce07b1525972d1dea00792a2058900fa56291163`  
**Prior challenge PR:** #156  
**This branch:** `cursor/amendment-chain-remediation-replay-2926`  
**Constraints:** No edits to PR #150 research content; no frozen certification fixtures; no production legal-rule code; no paid inference; no merge; no certification advancement.

---

## Overall verdict

**REMEDIATION SUBSTANTIALLY SUCCESSFUL for previously blocking artifact defects.**  
**NOT INDEPENDENTLY LEGALLY VERIFIED.**  
**No executable amendment state is legally verified.**  
**Safe for non-promoting research integration only** (research corpus under fail-closed ED / missing-wrapper discipline). **Not safe to treat as certified operative law.**

Prior AMBIGUOUS VCs (VC-005, VC-008) are now **PASS** on their controlling labeling/before-text claims. Remaining blockers are expressly unresolved authority (ED calendars, DSGR Am2 wrapper, Internap Am1–Am6 propagation, AZZ pre-Am4 hashes), not dual-truth or wrong defined-term identity.

---

## 1. Exact reviewed SHA

`50eb36b9116fee788fe89eaa588875ccb5c2681e`

---

## 2. Defect-by-defect dispositions

### D1 — CONMED / Internap acquisition-ledger vs manifest contradictions — **CLOSED**

| Check | Evidence |
|---|---|
| CONMED Seventh manifest | `retrievalStatus: RETRIEVED`, accession `0001193125-21-217426`, exhibit EX-10.1; `authorityLayerStates.SOURCE_ACQUIRED=true`, `OPERATIVE_STATE_RESOLVED=false`, `INDEPENDENTLY_LEGALLY_VERIFIED=false` |
| CONMED ledger | `ACQUIRED` filename `d170717dex101.htm` sha256 `c0c901d6…` **MATCH** local bytes |
| Internap manifest | orig + Am1–Am7 all `RETRIEVED` / `SOURCE_ACQUIRED=true`; **no** `retrievalStatus: MISSING` in chain manifests |
| Layer discipline | Am1–Am6 `AMENDMENT_EFFECT_MODELED=false`; Am7 modeled true; none claim operative-state resolved |

Dual-truth hazard eliminated. Acquisition completeness ≠ operative reconstruction (correctly separated).

### D2 — AZZ Applicable Rate vs Applicable Margin — **CLOSED**

| Check | Evidence |
|---|---|
| Signed Am4 body | `Clause (a)(ii) of the definition of "Applicable Rate" is hereby amended and restated…` (local sha256 **MATCH** ledger `4cc27f8f…`) |
| Recital | Colloquial `Applicable Margin` still present — correctly labeled non-controlling in research |
| VC-005 / before-after / export | `definedTerm` / `definedTermAmended` = **Applicable Rate** |

Residual filename `azz-am4-applicable-margin.json` is an alias with corrected content — not a legal mislabel.

### D3 — AZZ omission from canonical export — **CLOSED** (with residual hash gap)

| Check | Evidence |
|---|---|
| `chainIdentities` | contains `azz-2022-05-13-credit-agreement` |
| `azz-am4` document | `ACQUIRED`, 64-char `originalBytesHash`, `effectiveDateStatus: CONDITIONAL_UNRESOLVED` |
| orig/Am1–Am3 | present as `PHASE1_RETRIEVED_HASH_PENDING` — **not** falsely hashed |

Export omission closed. Pre-Am4 byte-hash pending remains in `missingAuthority` (honest).

### D4 — Internap orig before-text and Am1–Am6 propagation — **PARTIALLY_REMEDIATED**

| Sub-issue | Disposition | Evidence |
|---|---|---|
| Orig before-text for §6.04(m)/§6.01(k) | **CLOSED** | before-after `SOURCE_BACKED` quotes `$25,000,000`/`30%` and `$15,000,000`/`18%`; orig CA bytes MATCH ledger and contain those spans |
| Am7 after-text | **CLOSED** (prior pass retained) | Am7 exhibit still SOURCE_BACKED |
| Exhaustive Am1–Am6 propagation | **STILL_OPEN** | `completeOperativeStateReconstruction: false`; `UNRESOLVED_DEPENDENCY` in export `missingAuthority` |
| Am7 ED calendar | **STILL_OPEN** | `CONDITIONAL_UNRESOLVED` |

No false claim of complete Am1–Am7 operative reconstruction observed.

### D5 — DSGR $10M before-text and Am2 wrapper — **PARTIALLY_REMEDIATED**

| Sub-issue | Disposition | Evidence |
|---|---|---|
| `$10M` before-text | **CLOSED** | before-after cites Doc B quote `not to exceed $10,000,000`; fixture Doc B contains that phrase; after-text `$25,000,000`; Doc C deemed-effect language present |
| Am2 operative wrapper | **STILL_OPEN** | export `dsgr-am2-wrapper-text: MISSING_DOCUMENT` |
| 10-Q substitution guard | **CLOSED** (discipline) | `dsgr-am2-10q` link `authorityStatus: NOT_OPERATIVE` |

### D6 — CONMED Seventh/Eighth parentage — **CLOSED**

| Check | Evidence |
|---|---|
| Cash-netting chain | `$25M` → `$75M` → `$100M` timeline intact |
| Export parent link | `cnmd-second-am-2022` → parent `cnmd-seventh-ar` with `intermediateState: cnmd-am1-2022` |
| WP-002 / WP-003 | retained in wrong-parent proofs |
| Layers | Seventh `OPERATIVE_STATE_RESOLVED=false` (ED / Eighth separation preserved) |

### D7 — Matthews / Coherent sequencing — **CLOSED** (prior PASS affirmed)

| Check | Evidence |
|---|---|
| Coherent Am5 recital | signed “Amendment No. 4, dated as of September 26, 2025” in Am5 body |
| Matthews Am6 | “Section 6.01 … deleted in its entirety”; `2024 Note Offering` present; targetsVerified `6.01(j)` |
| Matthews Am5 §5.14 | date-era note retained; numeric-cap discipline (WP-008) retained |

### D8 — Conditional ED / deemed retroactive — **CLOSED** (discipline) / **STILL_OPEN** (calendars)

| Check | Evidence |
|---|---|
| Fail-closed ED | All VC specs remain `PENDING_INDEPENDENT_REVIEW`; export `verificationStatus: PENDING_INDEPENDENT_REVIEW` |
| Named calendars | Still in `missingAuthority` as `CONDITIONAL_UNRESOLVED` (Matthews, Coherent, AZZ, Internap Am7, etc.) |
| DSGR deemed | Doc C “deemed effect … January 1, 2025” + `$25M`; attaches only with Fourth Amendment ED (still unresolved) |
| False satisfaction | No research claim observed that execution/filing date satisfies ED conditions |

Discipline **CLOSED**; calendar proof **STILL_OPEN** (correct).

### D9 — Canonical export consistency / unresolved authority preservation — **CLOSED**

| Check | Evidence |
|---|---|
| Competing schema | `competingProductionSchema: false` |
| Unresolved rows | wrapper MISSING; ED CONDITIONAL_UNRESOLVED; Internap propagation UNRESOLVED_DEPENDENCY; AZZ hash HASH_PENDING |
| Ground truth | not promoted |

### D10 — VC-001–008 regression outcomes — see §3

---

## 3. VC-001–008 independent replay verdicts

| VC | Prior | Replay | Notes |
|---|---|---|---|
| VC-001 Coherent same-day | PASS | **PASS** | Am5 recital parent order; ED calendars still unresolved |
| VC-002 DSGR deemed retroactive | PASS | **PASS** | Strengthened by `$10M` Doc B before-text; wrapper still missing (orthogonal) |
| VC-003 CONMED multi-def / wrong-parent | PASS | **PASS** | Manifest/parent freshness fixed; WP-003 intact |
| VC-004 Matthews §6.01(j) | PASS | **PASS** | Am6 delete/restate + Notes-only (j) affirmed |
| VC-005 AZZ multi-era pricing | AMBIGUOUS | **PASS** | Applicable Rate + export inclusion; ED unresolved correctly |
| VC-006 Omnibus incorporation | PASS | **PASS** | Unchanged fail-closed blackline discipline |
| VC-007 Waiver vs amendment | PASS | **PASS** | Non-waiver language retained |
| VC-008 Internap Am7 baskets | AMBIGUOUS | **PASS** | Orig before-text SOURCE_BACKED; intervening Am1–Am6 gap explicit — no false complete state |

**Promotion status:** still `NOT_INDEPENDENTLY_LEGALLY_VERIFIED`.

---

## 4. False operative-state probe

Independent checks for whether remediated artifacts could silently produce a false operative amendment state:

| Probe | Result |
|---|---|
| Any `OPERATIVE_STATE_RESOLVED: true` | **None found** |
| Any `INDEPENDENTLY_LEGALLY_VERIFIED: true` | **None found** |
| `verificationStatus` promoted | **No** — still `PENDING_INDEPENDENT_REVIEW` |
| 10-Q treated as operative | **No** — `NOT_OPERATIVE` |
| Internap complete propagation claimed | **No** — `completeOperativeStateReconstruction: false` |
| ED calendars collapsed to execution/filing | **No** — CONDITIONAL_UNRESOLVED retained |

Fail-closed posture preserved. Research does **not** certify as-of operative law where ED or intervening amendments are unresolved.

---

## 5. Remaining legal blockers

1. Condition-satisfaction calendars for CONDITIONAL_UNRESOLVED Effective Dates (all chains).  
2. DSGR Am2 operative wrapper text (`MISSING_DOCUMENT`).  
3. Internap Am1–Am6 exhaustive basket/definition propagation (`UNRESOLVED_DEPENDENCY`).  
4. AZZ orig/Am1–Am3 content hashes (`HASH_PENDING`).  
5. Independent legal ground-truth still PENDING on VC-001–008 test-specs (by design).

---

## 6. Tests executed

```
npx vitest run \
  tests/amendment-chain-research/phase2-corpus-integrity.test.ts \
  tests/amendment-chain-research/phase3-challenger-remediation.test.ts \
  tests/amendment-chain-research/remediation-replay-integrity.test.ts
```

Source-author Phase 2/3 tests: **16/16 passed** on reviewed tip (pre-replay-test addition).  
Replay integrity tests: added on this challenger branch (assert CLOSED defects stay closed; blockers stay open; no legal-verification promotion).

---

## 7. Current-head CI (research tip)

On `50eb36b9116fee788fe89eaa588875ccb5c2681e`: **SUCCESS** (Vercel + Vercel Preview Comments).

---

## 8. Integration / verification eligibility

| Question | Answer |
|---|---|
| Safe for **non-promoting** research integration into main? | **YES** — dual-truth and defined-term defects closed; unresolved authority explicit; layers distinct |
| Any executable amendment state **legally verified**? | **NO** |
| Certification / merge-as-certified-law? | **BLOCKED** |
| Misrepresent remediation as ED/wrapper certification? | **FORBIDDEN** — this report does not do so |

---

## 9. Distinctions (mandatory)

| Dimension | Status at `50eb36b` |
|---|---|
| Source acquisition completeness | Strong for prioritized chains (AZZ pre-Am4 hashes pending) |
| Amendment reconstruction completeness | Partial — Internap Am1–Am6 propagation open; DSGR Am2 wrapper open |
| Effective-date authority | Named constructs recorded; **calendars unresolved**; fail-closed preserved |
| Independent legal verification | **Not achieved** — PENDING / NOT_INDEPENDENTLY_LEGALLY_VERIFIED |
| Eligibility for non-promoting main integration | **Yes** as research artifacts only |
