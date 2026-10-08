# Independent Amendment-Chain Legal Challenge

**Challenger role:** Independent legal challenger (not source-author)  
**Research PR:** #150  
**Reviewed SHA:** `ce07b1525972d1dea00792a2058900fa56291163`  
**Branch tip at challenge:** same (PR head)  
**Challenger branch:** `cursor/amendment-chain-legal-challenge-cc29`  
**Constraints honored:** no edits to research VC expectations / test-spec `sourceAuthorExpectation` / frozen certification evidence; no paid inference; no production legal-rule edits; no certification advancement.

---

## Overall legal-safety verdict

**NOT INDEPENDENTLY LEGALLY VERIFIED for promotion.**

Core fail-closed disciplines (conditional Effective Dates, wrong-parent guards, 10-Q ≠ operative text, waiver ≠ amendment) are largely source-supported. Six of eight VCs affirm on their controlling operative claims. Two VCs are **AMBIGUOUS** because research labeling/completeness claims conflict with signed exhibits. Several Phase-1 manifests still say `MISSING` while Phase-2 ledger/export show `ACQUIRED` — an export/integration hazard if CKF treats manifests as authority.

Source-author expectations remain `notLegalGroundTruth`; this report does **not** promote them to ground truth.

---

## 1. Exact reviewed SHA

`ce07b1525972d1dea00792a2058900fa56291163`

---

## 2. Source completeness by chain (independent)

| Chain | Challenger status | Notes |
|---|---|---|
| CONMED Seventh→Eighth→Omnibus | **COMPLETE for Seventh-era cash-netting + Am2 + Omnibus raw/curated split** | Seventh EX-10.1 + Am1 EX-10.25 re-fetched; sha256 matched ledger. Am2 + Omnibus fixture raw present. Eighth curated present; Omnibus blacklines in raw EX-10.1, omitted from curated. ED calendars unresolved. |
| Matthews Third A&R Am1–Am6 | **COMPLETE for §6.01(j) / §5.14 numeric claims** | Base + Am5 + Am6 re-fetched; sha256 matched. Am1–Am4 ledger-acquired (not all re-hashed this pass). ED calendars unresolved. Post-Am6 Seventh/Eighth out of scope. |
| Coherent 2022 CA Am1–Am5 | **COMPLETE for Am4/Am5 same-day ordering + basket after-text** | Am4/Am5 sha256 matched. ED condition satisfaction unproven. |
| DSGR 2022 A&R | **PARTIAL** | Am3/Am4 fixtures SOURCE_BACKED. Am2 EX-10.1 is conformed Exhibit A (no “THIS SECOND AMENDMENT” wrapper). 10-Q narrative acquired, correctly non-operative. Prior §6.08(a)(v) before-text exists in Doc B but research left `beforeText: null`. |
| AZZ 2022 CA | **PARTIAL / EXPORT-ABSENT** | Am4 body retrieved this challenge (`fourthamendmenttocreditagr.htm`). Phase-1 bodies claimed; **absent from Knowledge Factory `chainIdentities` and `documents`**. |
| Internap 2017 CA Am1–Am7 | **BODIES ACQUIRED; RESEARCH ARTIFACTS STALE** | Orig + Am7 re-fetched; sha256 matched. Ledger lists Am1–Am7 ACQUIRED. Manifest/`before-after` still treat orig/Am1–6 as MISSING and basket before-text as 8-K-only — contradicted by orig CA text. |

---

## 3. VC-001–008 independent verdicts

### VC-001 — Coherent Am4/Am5 same-day — **PASS**

| Field | Independent finding |
|---|---|
| Controlling spans | Am4 `0001193125-25-220656` EX-10.1: dated Sept 26, 2025; “Amendment No. 4 Effective Date”; Conditions to Effectiveness; redline `$786,000,000` / `55%` / `$1,428,000,000`. Am5 same accession EX-10.2: dated Sept 26, 2025; recital includes “Amendment No. 4, dated as of September 26, 2025”; carries same basket/Incremental figures. sha256 matched ledger. |
| Expected operative state | Pre either ED: Am3-era. After Am4 ED / before Am5 ED (if separable): Am4 text. After both EDs: Am5-amended instrument. Unproven ED → `CONDITIONAL_UNRESOLVED` / `REVIEW_REQUIRED`. |
| Before/after | Am4 increases General Debt Basket + Cash-Capped Incremental; Am5 does not further change those figures (Term B mechanics). |
| Missing authority | Calendar proof Am4/Am5 conditions satisfied on 2025-09-26. |
| Unsupported research | None material on ordering (Am5 recital is signed parent-order authority, not accession inference). |
| Verdict | **PASS** |

### VC-002 — DSGR Am4 deemed retroactive — **PASS**

| Field | Independent finding |
|---|---|
| Controlling spans | Fixture Doc C §2: amendments as of Fourth Amendment Effective Date, “agreeing to give deemed effect … as of January 1, 2025” (line-broken). §2(b) restates §6.08(a)(v) to `$25,000,000`. Doc B §6.08(a)(v): “not to exceed $10,000,000”. |
| Expected operative state | Attachment requires Fourth Amendment ED; once attached, clauses (a)–(b) deemed as of 2025-01-01. Mid-window as-of without deemed-effect model → `REVIEW_REQUIRED`. |
| Before/after | `$10M` distributions/dividends (v) → `$25M` Restricted Payments (v) under deemed dating. |
| Missing authority | Am4 ED satisfaction; Am2 wrapper. |
| Unsupported research | `beforeText: null` in before-after is a research omission — Doc B supplies it. Does not defeat deemed-effect claim. |
| Verdict | **PASS** |

### VC-003 — CONMED multi-definition Am2 + wrong-parent — **PASS**

| Field | Independent finding |
|---|---|
| Controlling spans | Seventh A&R `0001193125-21-217426` EX-10.1: CSSLR/CTLR cash-netting `$25,000,000`; §7.1(b) 5.25/5.00. Am1 `0001193125-22-169336` EX-10.25: deletes `$25,000,000`→`$75,000,000` on Seventh A&R. Am2 fixture EX-10.2: `$75,000,000`→`$100,000,000`; restates §7.1(b); amends Indebtedness. Eighth: superseding restatement as of Closing Date 2025-06-10. |
| Expected operative state | 2022-06-05: $25M. Post-Am1 ED: $75M. Post-Am2 ED: $100M + Am2 §7.1(b). Post-Eighth Closing: Eighth text only — do not overlay Am1/Am2. |
| Before/after | Definition cash-netting chain $25→$75→$100; §7.1(b) schedule restatement; Eighth supersession. |
| Missing authority | Am1/Am2 ED condition calendars. |
| Unsupported research | Manifest still marks Seventh `MISSING` (stale). VC-003 purpose still frames missing-Seventh fail-closed as primary — still a valid engine test, but parent is no longer missing in Phase 2. VC pointer quote to Eighth is paraphrase, not signed language. |
| Verdict | **PASS** (operative claims); artifact freshness caveats do not defeat WP-003. |

### VC-004 — Matthews §6.01(j) narrowing — **PASS**

| Field | Independent finding |
|---|---|
| Controlling spans | Base `0000063296-20-000040`: Permitted Amount `$50,000,000`; `(j) Liens of any Loan Party securing Indebtedness… shall not at any time exceed the Permitted Amount`. Am6 `0001193125-24-224129` EX-10.2: “Section 6.01 … deleted in its entirety” → restated `(j) Liens securing Indebtedness under the 2024 Note Offering…` with (y)/(z) conditions. ED gate: Am6 provisions effective only after Agent receives listed deliverables. sha256 matched. |
| Expected operative state | Pre-Am6 ED: $50M general basket. Execution date alone ≠ Notes-only text. Post-ED: Notes-only (j); do not stack. |
| Before/after | True permission narrowing by full §6.01 replace (not isolated (j) tweak). |
| Missing authority | Am6 §19 satisfaction calendar. |
| Unsupported research | Purpose understates that Am6 restates all of §6.01. Chronology “Am2 recital-only” (if present) is incorrect — Am2 is blackline annex. Not fatal to VC-004. |
| Verdict | **PASS** |

### VC-005 — AZZ multi-era pricing — **AMBIGUOUS**

| Field | Independent finding |
|---|---|
| Controlling spans | Am4 `0000008947-24-000205` `fourthamendmenttocreditagr.htm`: “Clause (a)(ii) of the definition of **Applicable Rate** is hereby amended and restated”; eras (A)–(D) ending `(D) … 2.50% / 1.50%`. Recital uses colloquial “Applicable Margin” once — **not** the defined term amended. |
| Expected operative state | Post-Am4 ED: select (A)/(B)/(C)/(D) by query vs First/Third/Fourth EDs. Unresolved ED → do not invent subclause. |
| Before/after | Era grid after-text SOURCE_BACKED. Contemporaneous pre-Am4 as-of must prefer then-current Am1/Am3 text, not only Am4’s historical recount. |
| Missing authority | First/Third/Fourth ED satisfaction; Am2 non-pricing log; **entire AZZ chain missing from KF export**. |
| Unsupported research | Systematic mislabel **Applicable Margin** in VC-005, before-after `definedTerm`, authority-layer `targetsVerified`, chronology. Operative term is **Applicable Rate**. |
| Verdict | **AMBIGUOUS** |

### VC-006 — CONMED Omnibus incorporation — **PASS**

| Field | Independent finding |
|---|---|
| Controlling spans | Omnibus curated: amends Eighth CA + GCA; §1(a)/(c) blackline Exhibits A/B; Term A-2 Commitments on Schedule 1 added to Schedule 1.1; Consenting Lenders; First Amendment Effective Date = conditions; non-waiver. Raw EX-10.1 embeds blacklines (fixture note). |
| Expected operative state | Pre-ED: Eighth unchanged. Post-ED: blackline-amended CA/GCA + Schedule Term A-2. Curated-only load → fail closed on blackline after-text. |
| Before/after | Multi-target amendment + incorporation-by-reference + schedule modify; consents ≠ unrelated permanent waivers. |
| Missing authority | ED satisfaction; curated omits exhibit pages. |
| Unsupported research | None material if fail-closed is scoped to package contents (not “blacklines absent from SEC filing”). |
| Verdict | **PASS** |

### VC-007 — Waiver vs amendment separation — **PASS**

| Field | Independent finding |
|---|---|
| Controlling spans | Doc B / Doc C: “shall not operate as a waiver… nor constitute a waiver of any provision.” |
| Expected operative state | Permanent amendments (and Am4 deemed dating) apply when ED attaches; no WAIVER invented from lender consents alone. |
| Before/after | Targeted amendment ≠ waiver/consent-only instrument. |
| Missing authority | None material for separation principle. |
| Unsupported research | None material. |
| Verdict | **PASS** |

### VC-008 — Internap Am7 basket narrowing — **AMBIGUOUS**

| Field | Independent finding |
|---|---|
| Controlling spans | Am7 `0001140361-19-019513` EX-10.1: after-text `$12,500,000`/`15%` (§6.04(m)), `$5,000,000`/`6%` (§6.01(k)); Seventh Amendment Effective Date = conditions; recitals reference First–Sixth Amendments. **Orig CA** `0001571049-17-003250` EX-10.1 (sha256 matched): before-text `$25,000,000`/`30%` and `$15,000,000`/`18%`. |
| Expected operative state | Pre-Am7 ED: Am6-era (baskets at orig levels absent intervening change). Post-Am7 ED: narrowed baskets + restated §6.10. |
| Before/after | Permission narrowing SOURCE_BACKED on both sides once orig is used. |
| Missing authority | Exhaustive Am1–Am6 definition-propagation diffs; Am7 ED calendar. |
| Unsupported research | `before-after` still marks before as 8-K narrative / `UNRESOLVED_AUTHORITY` / `MISSING_DOCUMENT` while Phase-2 ledger and this challenge acquired orig CA with matching levels. Manifest still `MISSING` for orig/Am1–6. Completeness overclaim (`SOURCE_COMPLETE_AM1_THROUGH_AM7`) vs stale MISSING artifacts. |
| Verdict | **AMBIGUOUS** |

---

## 4. Confirmed wrong-parent risks

| ID | Risk | Challenger |
|---|---|---|
| WP-003 | Apply Am2 `$75→$100` against unamended Seventh `$25M` | **CONFIRMED** — Am2 token matches post-Am1 only |
| WP-002 | Attach Seventh-era Am1/Am2 onto Eighth A&R | **CONFIRMED** as engine failure mode; Omnibus targets Eighth+GCA only — does not rewrite Seventh-era history |
| Export link | KF link Am2 → Am1 as `parent` | **IMPRECISE** — parent instrument is Seventh A&R; Am1 is intermediate state, not the amended instrument identity |
| VC-003 purpose | “Missing Seventh” wrong-parent test | Still valid as fail-closed test; parent now acquired — do not leave manifest `MISSING` |

---

## 5. Effective-date uncertainties

Universally **CONDITIONAL_UNRESOLVED** (correct fail-closed; blocks as-of certainty):

- CONMED Am1 / Am2 / Omnibus First Amendment Effective Date
- Matthews Am1–Am6 Effective Dates (Am6 §19 Agent deliverables)
- Coherent Am4 / Am5 Effective Dates (same calendar date ≠ proven satisfaction)
- AZZ First / Third / Fourth Amendment Effective Dates
- DSGR Fourth Amendment Effective Date (deemed Jan 1 attaches only once ED occurs)
- Internap Seventh Amendment Effective Date

**Never** treat execution date or EDGAR filing date as condition-satisfaction proof (WP-006 **AFFIRMED**).

---

## 6. Missing operative documents

| Item | Status |
|---|---|
| DSGR Am2 operative wrapper (“THIS SECOND AMENDMENT…”) | **MISSING** — filed EX-10.1 opens as Exhibit A conformed A&R (as amended by First and Second); 10-Q is narrative only |
| AZZ chain in KF export documents | **MISSING from export** (bodies exist Phase-1 / retrieved Am4 here) |
| Condition-satisfaction calendars (all chains) | **MISSING** |
| Internap per-amendment exhaustive before/after beyond Am7 | **NOT DELIVERED** (bodies acquired) |
| Side-letter restrictions | **NONE LOCATED** (correctly unresolved, not asserted absent) |

---

## 7. False / unsupported amendment-effect claims

1. **AZZ “Applicable Margin”** — false defined-term identity; signed amend is **Applicable Rate** (recital colloquialism only).
2. **Internap basket before-text “unresolved / 8-K only”** — false once orig CA is acquired; levels `$25M/30%` and `$15M/18%` are in EX-10.1.
3. **CONMED / Internap manifests `retrievalStatus: MISSING`** — false relative to Phase-2 acquisition ledger (stale Phase-1).
4. **“§5.14 wholly unchanged through Am5”** (if read strictly) — overstated: Am5 shifts Leverage final-tier start date Mar 31, 2021→Dec 31, 2023 (ratio 4.50 unchanged). WP-008 correctly treats this as date-era shift, not ratio rewrite.
5. **DSGR Am4 `beforeText: null`** — unsupported omission; Doc B has `$10,000,000`.
6. No finding that Am6 “does not narrow §6.01(j)” — narrowing **is** supported.

---

## 8. Export integration risks (Knowledge Factory)

Preserved (good):

- `sourceId` / accession / filename / sha256 identity
- Parent/child links with `CONDITIONAL_UNRESOLVED` ED fields
- `missingAuthority` rows (DSGR wrapper; MATW/COHR ED calendars)
- `verificationStatus: PENDING_INDEPENDENT_REVIEW`
- 10-Q link tagged `NOT_OPERATIVE`
- `competingProductionSchema: false`, upsert-by-sourceId

Risks / defects:

1. **AZZ entirely omitted** from `chainIdentities` and `documents` while VC-005 depends on it.
2. **Stale MISSING manifests** can be ingested alongside ACQUIRED ledger rows → dual truth.
3. **CONMED Am2→Am1 parent link** mis-identifies parent instrument (should be Seventh A&R as amended).
4. **Matthews/Internap parent links** use prior-amendment doc as parent (common chain encoding) — consumers must not treat intermediate amendment docs as the governing agreement identity.
5. **Do not promote** export `verificationStatus` or source-author as-of outcomes to independently legally verified.

---

## 9. Test results

### Source-author corpus integrity (unchanged expectations)

```
npx vitest run tests/amendment-chain-research/phase2-corpus-integrity.test.ts
```

Result: **7/7 passed** (2026-10-08 challenge run).

### Independent challenger tests (this challenge; do not alter research expectations)

```
npx vitest run tests/amendment-chain-research/independent-challenger-integrity.test.ts
```

Result: recorded in that file’s run (fixture/export/adversarial checks only).

### Representative source hash inspections (this environment)

| Doc | sha256 match to ledger |
|---|---|
| cnmd-seventh-ar | YES `c0c901d6…` |
| cnmd-am1-2022 | YES `14f18fad…` |
| cohr-am4 / am5 | YES |
| inap-ca-orig / inap-am7 | YES |
| matw-third-ar / am5 / am6 | YES |
| dsgr-am2 exhibit | YES (conformed Exhibit A) |

---

## 10. Blocking defects and remediation ownership

| Blocking defect | Owner | Remediation |
|---|---|---|
| Dual truth: manifests `MISSING` vs ledger `ACQUIRED` (CONMED Seventh, Internap orig/Am1–6) | Research agent (PR #150) | Sync manifests/before-after to Phase-2 acquisitions; extract Internap before-text from orig CA |
| AZZ absent from KF export | Research agent | Add AZZ documents + chainIdentity or explicitly mark export out-of-scope for VC-005 |
| Defined-term mislabel Applicable Margin ≠ Applicable Rate | Research agent | Relabel VC-005 / before-after / authority-layer to **Applicable Rate**; keep recital “Margin” as non-controlling |
| DSGR Am2 wrapper MISSING | Research agent / acquisition | Keep `MISSING_DOCUMENT` / `REVIEW_REQUIRED`; never substitute 10-Q |
| CONMED Am2 parent link → Am1 | Research / CKF consumer | Parent instrument = Seventh A&R; Am1 = intermediate state |
| All ED calendars unproven | Shared (research + engine) | Keep `CONDITIONAL_UNRESOLVED`; no silent execution/filing-date satisfaction |
| Independent ground truth still PENDING in test-specs | Challenger (this report) | Dispositions live here; **do not** flip production certification boards |

**Certification / merge / production legal-rule advancement:** blocked pending remediation of AMBIGUOUS VCs and manifest/export sync. PASS VCs may be used as research specimens only under fail-closed ED rules.

---

## Priority adversarial answers (summary)

**CONMED:** Am1 and Am2 amend the Seventh A&R (Am2 requires post-Am1 `$75M` state). Omnibus amends Eighth+GCA only. Eighth/Omnibus cannot contaminate Seventh-era as-of reconstruction unless the engine wrongly applies them backward or overlays Am1/Am2 onto Eighth.

**Matthews:** Am6 does narrow §6.01(j) (via full §6.01 replace). Numeric §5.14 caps unchanged through Am6; Am5 is date-era blackline (4.50 retained), not a ratio rewrite. Am1/Am3/Am6 do not amend §5.14.

**Coherent:** Am4→Am5 parent order is established by Am5 signed recital; basket/Incremental after-text established; same-day ED *satisfaction* not proven.

**DSGR:** Missing Am2 wrapper requires unresolved/REVIEW_REQUIRED for Am2-specific terms. 10-Q cannot substitute. Am3→Am4 §6.08(a)(v) delta is separately fixture-backed.

**Internap:** Ordering Am1–Am7 is recital-backed; Am7 after-text solid; full definition-propagation application of Am1–Am6 not established in research artifacts; before-text is available in orig CA contrary to stale PARTIAL rows.
