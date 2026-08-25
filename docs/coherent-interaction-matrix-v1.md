# Coherent Debt & Lien Permission Interaction Matrix — v1

**Source-grounded, not inferred from seed data or engine behavior.** Every citation below is to the actual executed documents, fetched from SEC EDGAR in this session:

- **Indenture**: `INDENTURE Dated as of December 10, 2021`, II-VI Incorporated (now Coherent Corp.) and U.S. Bank National Association, as trustee. Filed as Exhibit 4.1 to Coherent's Form 8-K filed December 10, 2021 (accession 0001193125-21-353969). *This is the actual base Indenture — not one of the guarantor-joinder supplemental indentures previously supplied.*
- **Credit Agreement**: `CREDIT AGREEMENT dated as of July 1, 2022`, among II-VI Incorporated, as Borrower, the lenders party thereto, and JPMorgan Chase Bank, N.A., as Administrative Agent and Collateral Agent. Filed as Exhibit 10.1 to Coherent's Form 8-K filed July 1, 2022 (accession 0001193125-22-186770).

Both are the **original, as-executed** agreements. Five subsequent Credit Agreement amendments (Nos. 1–5, per the FY2026 10-K) and three Indenture supplemental indentures (guarantor joinders only, previously supplied and reviewed — they contain no covenant amendments) are **not** in hand as full amendment/restatement text. Where the original text conflicts with a fact disclosed in the FY2026 10-K, both are stated and the conflict is flagged rather than resolved by guessing which amendment changed what.

Every dollar/percentage/ratio figure below is quoted or closely paraphrased directly from the source; nothing is carried over from `prisma/seed-data.ts` or `lib/covenant-engine.ts`.

---

## A. Permission inventory

### Indenture (December 10, 2021)

| # | Permission | Section/Clause | Type | Fixed vs. Incurrence-Based | Formula (source language) | Measurement basis | Current code (if any) |
|---|---|---|---|---|---|---|---|
| I-1 | Ratio Debt | §3.3(a) | Debt | Incurrence-Based | "Fixed Charge Coverage Ratio... would have been 2.00 to 1.00 or greater" — unlimited if satisfied | Point-in-time ratio test at incurrence | `ratio_debt_fccr` |
| I-2 | Senior Credit Agreement basket — component (A) | §3.3(b)(i)(A) | Debt | Fixed | "$4,000.0 million" | Outstanding-based (ceiling on amount outstanding under the Senior Credit Agreement specifically, not total secured debt) | `facility_flat` (currently modeled as net of *all* secured debt — see §H) |
| I-3 | Senior Credit Agreement basket — component (B) | §3.3(b)(i)(B) | Debt | Fixed (EBITDA-linked) | "greater of (x) $1,320.0 million and (y) 100.0% of Four Quarter Consolidated EBITDA" | Not outstanding-based (EBITDA-linked, doesn't net against a balance) | `facility_grower` |
| I-4 | Senior Credit Agreement basket — component (C), "Maximum Incremental Leverage Amount" | §3.3(b)(i)(C) | Debt | Incurrence-Based | "an unlimited amount... so long as the Maximum Leverage Requirement is satisfied": secured → SSNL ≤ 3.00x (or pre-transaction SSNL for acquisition debt); unsecured → TNL ≤ 5.00x **OR** FCCR ≥ 2.00x | Point-in-time ratio test at incurrence | Not separately modeled — currently conflated into `mila_secured`/`mila_unsecured` |
| I-5 | General debt basket | §3.3(b)(xii) | Debt | Fixed (EBITDA-linked) | "greater of (x) $530.0 million and (y) 40.0% of Four Quarter Consolidated EBITDA... at any one time outstanding" | Outstanding-based | `general_debt` |
| I-6 | Permitted Liens cl. (6) | Permitted Liens def., cl. (6) | Lien | Fixed (unconditional — no dollar/ratio cap of its own) | "Liens Incurred to secure Obligations in respect of Indebtedness permitted to be Incurred pursuant to Section 3.3(b)(i) or 3.3(b)(iv)" | N/A — automatic, tied to the underlying debt permission | **Not modeled at all** |
| I-7 | Permitted Liens cl. (24) | Permitted Liens def., cl. (24) | Lien | Incurrence-Based | "Liens securing Indebtedness permitted to be Incurred pursuant to Section 3.3... if... the Consolidated Senior Secured Net Leverage Ratio does not exceed... 3.00 to 1.00" | Point-in-time ratio test at incurrence | `lien_ratio` |
| I-8 | Permitted Liens cl. (25) | Permitted Liens def., cl. (25) | Lien | Fixed (EBITDA-linked) | "other Liens securing obligations... not exceed the greater of (x) $530.0 million and (y) 40.0% of Four Quarter Consolidated EBITDA at any one time outstanding" | Outstanding-based | `lien_general` |

Ratio definitions actually used above (§1.1): SSNL = (Consolidated Funded Senior Secured Indebtedness − Unrestricted Cash Amount) / Four Quarter Consolidated EBITDA. TNL = (Consolidated Funded Indebtedness − Unrestricted Cash Amount) / Four Quarter Consolidated EBITDA. FCCR = Consolidated EBITDA / Consolidated Cash Interest Expense, for the Test Period, on a Pro Forma Basis.

### Credit Agreement (July 1, 2022)

| # | Permission | Section/Clause | Type | Fixed vs. Incurrence-Based | Formula (source language) | Measurement basis | Current code (if any) |
|---|---|---|---|---|---|---|---|
| C-1 | General debt basket | §6.01(k) | Debt | Fixed (EBITDA-linked) | "greater of $530,000,000 and 40% of Adjusted Consolidated EBITDA... outstanding pursuant to this Section 6.01(k)" | Outstanding-based | `ca_leverage_cap`/`ca_coverage_cap` do **not** correspond to this — this basket is **not modeled at all** |
| C-2 | Incremental Amount — Cash-Capped Incremental Facility | Incremental Amount def. | Debt | Fixed (EBITDA-linked) | "greater of (i) $1,320 million and (ii) 100% of Adjusted Consolidated EBITDA" | Not outstanding-based | **Not modeled** |
| C-3 | Incremental Amount — Ratio-Based Incremental Facility | Incremental Amount def. | Debt | Incurrence-Based | "unlimited amount... so long as... (i) in the case of any Incremental Facility secured by Liens on the Collateral that rank pari passu with the Liens... securing the Initial Term Loans and the Revolving Facility, the First Lien Secured Net Leverage Ratio is equal to or less than 2.75:1.00 or (ii) in the case of any Incremental Facility that is unsecured or that is secured by [junior] Liens... [Total Net Leverage Ratio test per §6.11(i)]" | Point-in-time ratio test | **Not modeled** |
| C-4 | Incremental Amount — Prepayment-Based Incremental Facility | Incremental Amount def. | Debt | Fixed, but tied to a *transaction history* measure, not a balance or EBITDA | "an amount equal to all voluntary prepayments and repurchases of Term Loans... and voluntary prepayments of Revolving Facility Loans" | **A third, distinct measurement basis** — see §G | **Not modeled** |
| C-5 | General Permitted Debt (catch-all) | §6.01(p) | Debt | Incurrence-Based | "so long as... the Total Net Leverage Ratio on a Pro Forma Basis is not greater than the applicable ratio in the Financial Covenant set forth in Section 6.11(i)" | Point-in-time ratio test | **Not modeled** — note this cites `§6.11(i)`, a *different* sub-clause reference than C-6 below |
| C-6 | Acquired-entity debt | §6.01(h) | Debt | Incurrence-Based | "the Total Net Leverage Ratio shall not be greater than (A) the then applicable ratio in the Financial Covenant set forth in Section 6.11(a) or (B) the Total Net Leverage Ratio in effect immediately prior thereto" | Point-in-time ratio test, alternative-relief for leverage-neutral deals | **Not modeled** — cites `§6.11(a)` specifically |
| C-7 | Liens — automatic permission for facility/incremental debt | §6.02(hh) | Lien | Fixed (unconditional) | "Liens on Collateral that are Other First Liens or Junior Liens, so long as such... secure Indebtedness permitted by Section 6.01(b) or 6.01(v)" | N/A — automatic, tied to the underlying debt permission | **Not modeled** |
| C-8 | Liens — fixed basket | §6.02(kk) | Lien | Fixed (EBITDA-linked) | "greater of $530,000,000 and 40% of Adjusted Consolidated EBITDA" | Outstanding-based | **Not modeled** — no `lien_*` provisions exist under the CA document in seed data at all |
| C-9 | Financial Covenant — Total Net Leverage Ratio | §6.11(a) | *Maintenance covenant, not a debt-incurrence permission* | N/A | "**With respect to the Revolving Facility and Term A Facility only**" — step-down schedule: 5.25x (Closing Date–9/30/22) → 4.75x (12/31/22–3/31/23) → 4.25x (6/30/23–9/30/23) → **4.00x (12/31/23 and all periods thereafter)** | Quarterly maintenance test | `ca_leverage_cap` (currently hardcoded at 4.25x — **does not match either the original step-down schedule's current step (4.00x) or the FY2026 10-K's disclosed current figure (4.25x "through maturity")** — see §H |
| C-10 | Financial Covenant — Interest Coverage Ratio | §6.11(b) | *Maintenance covenant* | N/A | "not... less than 2.50 to 1.00" | Quarterly maintenance test | `ca_coverage_cap` (2.50x — matches) |

**Explicitly excluded from this inventory** per instructions: Restricted Payments (Indenture §3.4, CA §6.06), Investments (CA §6.04), Asset Sales (Indenture §3.7, CA §6.05), LME/priority/intercreditor mechanics, and Restricted/Unrestricted Subsidiary redesignation (Indenture §3.13) — none of these were reviewed except where a debt/lien calculation directly references them (none did).

---

## B. Pairwise interaction matrix

Scope: pairs *within the same document* whose relationship is governed by §13.1 (Indenture) or §1.07 (Credit Agreement), or by explicit stacking language elsewhere in the same covenant. Cross-document combination (Indenture vs. Credit Agreement) is a different mechanism entirely (independent covenant packages, combined via the engine's existing cross-document `MIN`) and is not a §13.1/§1.07 stacking question — not included here.

**Category definitions** (as used below):
- **CONCURRENT_DISREGARDED**: both permissions may be used at once; when used "substantially concurrently," the Fixed member's amount is excluded from the Incurrence-Based member's ratio-denominator calculation.
- **CONCURRENT_COUNTED**: both may be used at once, but no disregard applies — the Fixed member's usage counts toward the Incurrence-Based member's ratio denominator (in practice, contributes no *additional* headroom beyond what the ratio test alone would allow, unless it independently caps the same dollars lower).
- **ALTERNATIVE**: mutually exclusive, OR semantics — either path independently sufficient.
- **MUTUALLY_EXCLUSIVE**: cannot be used together at all.
- **INDEPENDENT**: the two permissions answer genuinely different questions (e.g., one governs debt incurrence, the other governs whether that debt may be secured) and don't "stack" against each other in the §13.1/§1.07 sense — each is evaluated on its own terms.
- **UNKNOWN_REVIEW_REQUIRED**: the source text doesn't resolve the relationship on the facts available.

| Permission A | Permission B | Relationship | Governing source | Explanation | Confidence | Assumption |
|---|---|---|---|---|---|---|
| I-2+I-3+I-4 (§3.3(b)(i), the whole Senior Credit Agreement basket) | *(internal, not a pair)* | — | §3.3(b)(i): "(A)... plus (B)... plus (C)" | Components (A), (B), (C) are explicitly, textually additive within one Permitted Debt clause — this is not a §13.1 stacking question at all, it's one basket with three internal components. | High | None |
| I-1 (Ratio Debt, FCCR≥2.00x) | I-2/I-3/I-5 (Fixed baskets) | CONCURRENT_DISREGARDED | §13.1(a): Fixed Amounts "disregarded in the calculation of the financial ratio or test applicable to the Incurrence Based Amounts... in connection with such incurrence" | I-1 requires no compliance with a ratio/test-free covenant provision — wait, correction: I-1 itself *is* the ratio-requiring provision (an Incurrence Based Amount); I-2/I-3/I-5 are Fixed Amounts. Using them concurrently disregards I-2/I-3/I-5's dollars from I-1's FCCR calculation. | High | None — directly on point |
| I-1 (Ratio Debt) | I-4 (MILA, component C) | INDEPENDENT (both Incurrence-Based, distinct baskets) | §3.3(c): the Company may "divide, classify or reclassify" debt among any Permitted Debt clause it qualifies for | Both are ratio-tested, but they are alternative *classification* choices for the same dollar of debt — a given incurrence tests under whichever provision the Company elects, not both simultaneously in a stacking sense. This is closer to ALTERNATIVE than to a disregard relationship, since §13.1's disregard mechanic specifically concerns a **Fixed** Amount being excluded from an Incurrence Based ratio — it does not describe two Incurrence Based Amounts being tested together. | Medium | Assumes "divide, classify or reclassify" implies free election between I-1 and I-4 for a given tranche, not simultaneous dual-counting — reasonable but not tested against a concrete numeric example in the source text |
| I-2 (component A, $4,000M) | I-4 (component C, MILA) | CONCURRENT_COUNTED, with an explicit ordering carve-out | §3.3(b)(i) proviso: "any calculation under subclause (C) will give pro forma effect to the Incurrence... under subclause (A)... but not to any other Incurrence... on such date in reliance on any non-ratio-based basket" | This is a **narrower, more specific rule than plain §13.1 disregard**: when sizing how much is available under (C) [MILA], pro forma effect is given to amounts drawn under (A) specifically (i.e., (A)'s usage **counts against** the ratio test for (C), the opposite of disregard) — but NOT to usage under any *other* non-ratio-based basket. This is a documented, explicit exception to the general §13.1 disregard rule for this one specific pair. | High | None — explicit proviso text |
| I-5 (§3.3(b)(xii), general debt) | I-1 or I-4 (ratio-based debt) | CONCURRENT_DISREGARDED | §13.1(a) general rule; no carve-out proviso applies to (xii) the way one applies to (A) | (xii) is a Fixed Amount with no special proviso — the general §13.1(a) disregard rule governs its interaction with any ratio-tested basket. | High | None |
| I-6 (Permitted Liens cl. 6) | I-7 (cl. 24, SSNL≤3.00x) | INDEPENDENT | Permitted Liens def.: "(x) a Lien need not be Incurred solely by reference to one basket... but may be Incurred under any combination of such baskets" | Cl. (6) automatically permits liens on I-2/I-4-sourced debt with **no dollar or ratio cap of its own** — it doesn't compete with or draw down cl. (24)'s capacity at all. A lien on debt sourced from (b)(i)/(b)(iv) simply doesn't need cl. (24) or (25). | High | None |
| I-7 (cl. 24) | I-8 (cl. 25) | CONCURRENT_DISREGARDED, explicitly stackable | Permitted Liens def. "(x)... may be Incurred under any combination of such baskets"; §13.1(a) applies generally to "any covenant" including the Permitted Liens definition (cl. 24 requires a ratio test [SSNL], cl. 25 does not) | Directly confirms the seed data's existing `SUM(lien_ratio, lien_general)` — this pairing genuinely is additive. | High | None |
| C-1 (§6.01(k), $530M) | C-3/C-5/C-6 (ratio-based CA debt) | CONCURRENT_DISREGARDED | §1.07(b): "Fixed Amounts... shall be disregarded in the calculation of the financial ratio or test applicable to the Incurrence Based Amounts... in connection with such substantially concurrent incurrence" | Same structure as the Indenture's §13.1(a), confirmed near-verbatim in the CA. | High | None |
| C-2 (Cash-Capped Incremental) | C-3 (Ratio-Based Incremental) | CONCURRENT_COUNTED, with an **explicit and unusual ordering rule** | Incremental Amount def.: "the Borrower shall be deemed to have used amounts under the Ratio-Based Incremental Facility (to the extent permitted thereby) **prior to** utilization of the Cash-Capped Incremental Facility and the Prepayment-Based Incremental Facility" | This is a mandatory *default ordering*, not a free election: draws are deemed to hit the Ratio-Based bucket first. This is narrower/more specific than — and appears to **supersede** — the general §1.07(b) disregard rule for this specific trio, since it dictates sequencing rather than disregard. | High | Text is explicit; not independently cross-checked against whether §1.07(b) or this specific ordering rule controls in the event of tension (they don't appear to conflict — ordering determines *which bucket* a dollar is deemed to come from; §1.07(b) then determines whether that bucket's Fixed/Incurrence-Based amounts are disregarded from *other* concurrent tests) |
| C-3 (Ratio-Based Incremental) | C-4 (Prepayment-Based Incremental) | Ordered, not a disregard relationship | Same Incremental Amount def. sentence as above: Ratio-Based first, **then** Prepayment-Based "prior to utilization of the Cash-Capped Incremental Facility" | Confirms a 3-way explicit priority: Ratio-Based → Prepayment-Based → Cash-Capped. | High | None |
| C-7 (§6.02(hh), auto lien) | C-3/C-8 | INDEPENDENT | §6.02(hh): ties automatic lien permission to §6.01(b)/(v) debt specifically — no separate ratio/dollar test | Structurally identical logic to I-6/I-7's independence, for the CA. | High | None |
| C-8 (§6.02(kk), $530M lien) | *(no CA equivalent of Indenture cl. 24 found)* | UNKNOWN_REVIEW_REQUIRED | Not found in §6.02(a)–(oo) | The CA does **not** appear to have a freestanding ratio-based lien basket analogous to the Indenture's clause (24) — its ratio-based secured capacity (First Lien Secured Net Leverage Ratio ≤ 2.75x) lives *inside* the Incremental Amount debt definition (C-3) and is automatically paired with a lien via C-7, not offered as an independent lien basket a *different* debt tranche could separately draw on. This is a genuine structural asymmetry between the two documents, not an oversight — flagged for confirmation rather than assumed. | Medium | Assumes the review of §6.02(a)–(oo) was complete and exhaustive; a targeted defined-term search (`grep`) was used rather than a clause-by-clause manual read of all 41 clauses, so a missed clause is possible |
| C-9 (§6.11(a), TNL maintenance) | C-5 (§6.01(p)) | Same numeric provision, different role | §6.01(p): "§6.11(i)" | **C-5 cites `§6.11(i)`, not `§6.11(a)`** — the maintenance-covenant clause is `(a)`; `(i)` is a *different, unseen* sub-clause of §6.11 not disclosed in the portion of §6.11 read (the read text only went through clause (b), "Interest Coverage Ratio," before the article ended — meaning §6.11 as originally executed may not have had a clause `(i)` at all, and this reference is almost certainly to a **post-amendment** renumbered or added §6.11(i)). | Low | **This is the single largest open item in this matrix** — see §H |

---

## C. Indenture debt-path map

For a hypothetical secured debt incurrence, the valid **debt-side** paths (any one sufficient on its own; multiple may combine per §B):

| Path | Basis | Formula | Notes |
|---|---|---|---|
| D-1 | §3.3(a) Ratio Debt | FCCR ≥ 2.00x, unlimited | General — secured or unsecured |
| D-2 | §3.3(b)(i)(A) | $4,000M, outstanding-based | Part of the combined SCA basket |
| D-3 | §3.3(b)(i)(B) | Greater of $1,320M / 100% EBITDA | Part of the combined SCA basket, additive with D-2 |
| D-4 | §3.3(b)(i)(C) MILA | Unlimited if SSNL≤3.00x (secured) or TNL≤5.00x OR FCCR≥2.00x (unsecured), with the special counting proviso vs. D-2 (see §B) | Additive with D-2+D-3 |
| D-5 | §3.3(b)(xii) | Greater of $530M / 40% EBITDA, outstanding-based | Disregarded from D-1/D-4's ratio calc if concurrent |

D-2+D-3+D-4 is **one basket** (§3.3(b)(i)), not three separately-stackable baskets — internally additive by explicit "plus" language, not by inference.

## D. Indenture lien-path map

| Path | Basis | Formula | Interaction |
|---|---|---|---|
| L-1 | Cl. (6) | Automatic for debt sourced under D-2/D-3/D-4 (§3.3(b)(i)) — **no separate dollar or ratio test** | Independent of L-2/L-3 |
| L-2 | Cl. (24) | Unlimited if SSNL≤3.00x, for debt sourced under *any* §3.3 provision | Stacks with L-3 (concurrent, disregarded) |
| L-3 | Cl. (25) | Greater of $530M / 40% EBITDA | Stacks with L-2 |

**Example combined paths** (illustrative labels only, per the instruction not to hardcode these into the engine):
- *Debt path D-2+D-3+D-4, Lien path L-1*: debt sourced entirely from the §3.3(b)(i) basket secures automatically via cl. (6), with **no lien-side dollar ceiling of its own** beyond D-4's own SSNL≤3.00x incurrence condition (when D-4 is the component relied on).
- *Debt path D-5, Lien path L-2+L-3*: debt sourced from the general debt basket needs an independent lien permission — bounded by SSNL≤3.00x (disregarding any concurrent D-5/D-2/D-3 Fixed usage) plus the separate $530M/40%EBITDA fixed lien basket.

**This is the most consequential finding in this document**: because L-1 has no cap of its own, debt sourced under D-2+D-3+D-4 can be secured **without being bounded by the SSNL≤3.00x test at all**, except to the extent D-4 itself (as one path among D-2/D-3/D-4) was relied on and is therefore already subject to that ratio as its own incurrence condition. The current seed model's `MIN(nominal-debt-SUM, lien-capacity-SUM, mila_secured-alone)` structure applies the 3.00x SSNL ceiling as if it caps *all* secured debt — it does not, on this text. This directly changes the methodology (not yet the number — see §G) for Q1.

## E. Credit Agreement debt/lien path map

| Path | Basis | Formula | Interaction |
|---|---|---|---|
| D-6 | §6.01(k) | Greater of $530M / 40% Adjusted Consolidated EBITDA | Disregarded from ratio-based paths if concurrent |
| D-7 | Incremental — Cash-Capped | Greater of $1,320M / 100% Adjusted Consolidated EBITDA | Used **last**, after D-8 and D-9 (explicit ordering) |
| D-8 | Incremental — Ratio-Based | Unlimited if First Lien SNLR≤2.75x (pari passu secured) or TNL test per §6.11(i) (unsecured/junior) | Used **first** |
| D-9 | Incremental — Prepayment-Based | Tied to voluntary prepayment history | Used **second** |
| D-10 | §6.01(p) General Permitted Debt | Unlimited if TNL ≤ §6.11(i) ratio | — |
| D-11 | §6.01(h) Acquired debt | Unlimited if TNL ≤ §6.11(a)'s current step **or** pre-transaction TNL | Leverage-neutral alternative test |
| L-4 | §6.02(hh) | Automatic for debt sourced under §6.01(b)/(v) (i.e., D-7/D-8/D-9) — no separate cap | Independent |
| L-5 | §6.02(kk) | Greater of $530M / 40% Adjusted Consolidated EBITDA | No confirmed ratio-based counterpart (see §B, UNKNOWN_REVIEW_REQUIRED) |

Distinguishing the required categories:
- **Maintenance covenant**: §6.11(a)/(b) — tested quarterly, **applies only to the Revolving Facility and Term A Facility** ("With respect to the Revolving Facility and Term A Facility only"), and a breach doesn't accelerate the Term B Facility unless the Term A/RCF lenders have already accelerated (§7.01(d)).
- **Incremental Amount**: D-7/D-8/D-9 above.
- **Cash-capped incremental capacity**: D-7.
- **Ratio-based incremental capacity**: D-8.
- **General Debt Basket**: D-6 (§6.01(k)).
- **Permitted Debt** (as a defined term): not found as a single defined term the way the Indenture uses it — §6.01 instead directly enumerates clauses (a)–(dd); "Permitted Debt" per se (capital-P defined term) appears only inside the Incremental Amount definition's cross-reference ("any Permitted Debt secured by Other First Liens or Junior Liens... pursuant to Section 6.01(v)"), suggesting it may be a defined term whose full definition wasn't reached in this pass (§6.01(v) itself uses lowercase "Permitted Debt" descriptively) — flagged, not resolved.
- **§6.11 as maintenance vs. incurrence condition**: §6.11(a) is the maintenance-tested clause. It is **separately, expressly incorporated as an incurrence condition** by D-11/§6.01(h) ("the then applicable ratio in the Financial Covenant set forth in Section 6.11(a)"). D-10/§6.01(p) and D-8's unsecured/junior prong instead reference `§6.11(i)` — a sub-clause not located in the text read (§H).

---

## F. Alternative-path specification (true contractual ORs)

Every genuine OR found in the Phase 1 (debt/lien) scope:

### F-1. MILA unsecured prong (Indenture §3.3(b)(i)(C), "Maximum Leverage Requirement" clause (b))
**TNL ≤ 5.00x OR FCCR ≥ 2.00x.** Source: "(b) for any such Indebtedness... that is unsecured, either (i) the Consolidated Total Net Leverage Ratio does not exceed... 5.00 to 1.00... or (ii) the Fixed Charge Coverage Ratio is not less than... 2.00 to 1.00." Either independently satisfied path is sufficient — explicit "either... or."

### F-2. Incremental Amount, Ratio-Based Incremental Facility (CA)
**Secured (pari passu): First Lien SNLR ≤ 2.75x. OR Unsecured/junior-secured: TNL test per §6.11(i).** These are not alternatives *to each other* for the same transaction — which one applies is determined by whether the debt will be secured pari passu or not (a factual branch, not a free election), so this is closer to a **conditional test selection** than a true OR. Distinguishing it from F-1: F-1 offers a free choice between two tests for the *same* (unsecured) debt; here the applicable test is determined by the debt's own security status.

### F-3. Acquired-entity debt leverage test (CA §6.01(h))
**TNL ≤ §6.11(a)'s current step OR TNL ≤ pre-transaction TNL (immediately prior to the acquisition).** A genuine OR — the leverage-neutral alternative lets an acquisition proceed even above the maintenance-covenant level, so long as leverage doesn't *increase* as a result.

### F-4. Indenture §3.3(a)(1) proviso / acquisition debt (§3.3(b)(xv))
**Post-transaction, Ratio Debt capacity of at least $1.00 OR FCCR ≥ pre-transaction FCCR.** Same leverage-neutral structure as F-3, Indenture side.

Required behavior per path combination (applies to F-1 through F-4 uniformly):

| Scenario | Required result |
|---|---|
| Path A passes, Path B fails | **Clear**, using Path A. Path B's failure is recorded (not hidden) but does not block the result. |
| Path A passes, Path B needs a missing assumption | **Clear**, using Path A. Path B is reported as `transaction_assumption_required` for anyone who wants to know if it *also* independently clears — never blocks Path A's clear result. |
| Path A fails, Path B passes | **Clear**, using Path B. Symmetric to the first row. |
| Both require missing assumptions | **`transaction_assumption_required`** overall (not `clear`, not `blocked`) — neither path is resolvable. |
| Both fail | **Blocked**, citing both provisions and both computed (failing) values. |

This is the concrete legal specification for the proposed `ALT` engine primitive (see Legal Model Remediation Design §5) — confirming "best evaluable path wins" is the correct status rule, not "worst status wins."

---

## G. Golden-question recalculation table

Per instruction: only recomputed where the answer follows **deterministically** from the approved rules, the source-backed matrix above, and currently-accepted financial inputs. Where it does not, that is stated explicitly rather than guessed.

### Q1 — Maximum additional secured debt
- **Old engine answer**: $4,041M (`MIN(nominal-debt-SUM, lien-capacity-SUM, mila_secured-alone)`).
- **Legally corrected methodology**: Per §D, debt sourced under D-2+D-3+D-4 (Indenture §3.3(b)(i)) secures automatically via Permitted Liens cl. (6) — no independent SSNL ceiling beyond D-4's own incurrence condition (SSNL≤3.00x, when D-4 specifically is relied on). Debt sourced under D-5 (§3.3(b)(xii)) needs an independent lien permission (L-2+L-3, i.e., SSNL≤3.00x stacked with $530M/40%EBITDA). The correct methodology is therefore: solve the debt-side maximum (D-1 through D-5, respecting §B's stacking/disregard/ordering rules) and the lien-side maximum for **whichever portion of that debt is not already automatically securable via cl. (6)**, then combine.
- **Provisional corrected answer**: **Not determinable without an allocation solver.** This is not a number that follows from arithmetic on the disclosed inputs alone — it requires the Design Question C allocation algorithm (Legal Model Remediation Design §6), which has not been implemented. What *is* determinable: the true figure is **at least as large as, and very likely larger than**, $4,041M, because cl. (6) removes the SSNL ceiling entirely from the D-2+D-3 portion of the basket, and D-3 (the $1,320M/100%EBITDA grower) and D-2 ($4,000M less amounts outstanding under the Senior Credit Agreement specifically) were previously being implicitly suppressed by the incorrect `MIN` against the SSNL-based figure.
- **Assumptions**: none beyond the text quoted. Current financial inputs (EBITDA ~$1,700M estimated, unverified) still apply and remain a separate, unresolved caveat (§H).
- **Source provisions**: §3.3(b)(i), Permitted Liens cl. (6), (24), (25).
- **Reason for change**: EXPECTED_TO_CHANGE, methodology confirmed incorrect, exact new number blocked on the allocation solver.

### Q2 — Maximum additional unsecured debt
- **Old engine answer**: $5,129M, bound by `ca_leverage_cap` (CA §6.11(a), 4.25x TNL) treated as universal.
- **Legally corrected methodology**: §6.11(a) applies **only to the Revolving Facility and Term A Facility** per its own text, and is not, by itself, a ceiling on unsecured debt incurrence generally. The actual unsecured debt-incurrence ceiling under the CA is governed by D-6 (§6.01(k)), D-7/D-8/D-9 (Incremental Amount), D-10 (§6.01(p), referencing an unlocated `§6.11(i)`), and D-11 (§6.01(h), referencing §6.11(a) specifically for acquisition debt). The Indenture side is independently governed by D-1 through D-5 (unsecured prong: D-1, D-4's unsecured Maximum Leverage Requirement, D-5).
- **Provisional corrected answer**: **Not determinable.** Blocked on (a) the missing `§6.11(i)` text (is it a different, looser or tighter ratio than 4.25x/4.00x? Unknown), and (b) the same allocation-solver gap as Q1, applied to the unsecured side.
- **Assumptions**: none.
- **Source provisions**: CA §6.01(h), (k), (p); Incremental Amount def.; §6.11(a); Indenture §3.3(a), (b)(i)(C), (b)(xii).
- **Reason for change**: EXPECTED_TO_CHANGE / LEGAL_JUDGMENT_REQUIRED (the `§6.11(i)` gap is a genuine missing-fact blocker, not a judgment call).

### Q3 — Binding secured provision/path
Tracks Q1. **Provisional**: the prior answer ("Indenture, MILA secured prong, cl. (24)") is **confirmed wrong as a categorical matter** — cl. (6) (not cl. (24)) is very likely to be the operative lien permission for most of the corrected, larger secured capacity, with cl. (24) only relevant to the D-5-sourced portion. Exact binding path not determinable until Q1's solver exists.

### Q4 — Binding unsecured provision/path
Tracks Q2. Not determinable — blocked on the `§6.11(i)` gap.

### Q5–Q8 — Secured checkpoint transactions ($100M/$250M/$500M/$1,000M)
- **Old engine answers**: all "Yes, permitted," bound by `mila_secured`.
- **Legally corrected methodology**: same as Q1.
- **Provisional corrected answer**: **the "Yes" verdicts remain correct** — capacity under the corrected methodology is provably **≥** the old $4,041M figure (cl. (6) only *adds* available paths, never removes one), so amounts already comfortably within $4,041M certainly clear under the corrected, larger true capacity. **The "under which provision" narrative changes** (Q5's own question text asks this explicitly): rather than "MILA secured prong," the more precise answer is "the §3.3(b)(i) Senior Credit Agreement basket via Permitted Liens cl. (6), automatically, well within its own unlimited-subject-to-SSNL≤3.00x MILA condition."
- **Reason classification**: UNAFFECTED for the yes/no verdict; the binding-provision narrative is EXPECTED_TO_CHANGE but doesn't require the solver to state qualitatively.

### Q16–Q17 — Secured binding-constraint checks (spot checks at $2,000M and at the $4,041M ceiling)
- **Old engine answer**: both "clear," bound by `mila_secured`, on the premise that the Indenture is *always* the binding constraint across the whole range up to $4,041M.
- **Legally corrected methodology**: same as Q1 — the premise itself (that $4,041M is *a* ceiling at all, let alone the binding one) is now in question.
- **Provisional corrected answer**: **Not determinable** — both spot-check amounts almost certainly still clear (same "capacity only grows" logic as Q5–Q8), but whether the Indenture or the Credit Agreement is the binding constraint at each point depends on the unresolved Q1/Q2 comparison. REQUIRES_NEW_ENGINE_CAPABILITY.

### Q21 — FCCR/MILA dollar-capacity mechanics
- **Old engine answer**: $10,153.85M, indenture unsecured capacity, FCCR path "controlling" (MAX of TNL-based $6,404M and FCCR-based $10,153.85M).
- **Legally corrected methodology**: F-1 confirms the OR is real and textually exact (TNL≤5.00x OR FCCR≥2.00x) — the *shape* of MAX-as-best-of-two-paths was directionally right. However, per Conclusion 8, the FCCR-derived dollar figure requires an explicit, confirmed transaction interest-rate assumption, not the financial snapshot's passively-inherited `assumedNewDebtRatePct`.
- **Provisional corrected answer**: **`transaction_assumption_required`**, not a bare dollar figure, unless/until a rate is supplied as an explicit part of the query itself (per Legal Model Remediation Design §5/§8). If a rate is supplied, the *arithmetic* $10,153.85M figure itself is not disputed by anything found in this pass.
- **Reason for change**: EXPECTED_TO_CHANGE (representation, not necessarily the underlying number once an assumption is supplied).

### Q22 — Remaining capacity after $500M secured
Tracks Q1 (`remaining = Q1's corrected answer − 500`). Not determinable until Q1 is.

### Q23 — $1,000M secured transaction, pro forma TNL
- **Old engine answer**: cleared, bound by `mila_secured`; pro forma TNL is a pure arithmetic fact independent of the capacity dispute.
- **Provisional corrected answer**: "Cleared" verdict **UNAFFECTED** (same "capacity only grows" logic). Pro forma TNL arithmetic **UNAFFECTED** — it doesn't test a threshold, it's a reported ratio. Binding-provision citation EXPECTED_TO_CHANGE per Q1.

### Q25 — Credit Agreement standalone secured capacity
- **Old engine answer**: $5,129M, `ca_leverage_cap`/`ca_coverage_cap` `MIN`, treating §6.11(a) as a universal ceiling.
- **Legally corrected methodology**: same defect as Q2 — §6.11(a) is TLA/RCF-maintenance-only; the CA's actual debt-incurrence ceiling (secured or unsecured) runs through §6.01(h)/(k)/(p)/(v), not §6.11(a) alone.
- **Provisional corrected answer**: **Not determinable** — same `§6.11(i)` gap as Q2.
- **Reason for change**: LEGAL_JUDGMENT_REQUIRED.

### Q9–Q13 (unsecured checkpoints), Q14–Q15 (ratio-mechanics fact queries), Q18–Q20 (individual basket sizes)
Carried forward from the prior classification (unaffected/requires-assumption as previously determined) — nothing in the newly-retrieved source text changes those conclusions. Q18 (facility_flat, $1,779M) is worth flagging: the real I-2 basket nets against "amounts outstanding... under the Senior Credit Agreement" specifically, not total secured debt broadly as currently coded — a narrow, separate correctness note independent of the stacking questions above (see §H).

---

## H. Remaining unresolved legal/factual assumptions

1. **`§6.11(i)` is not located.** Referenced twice (§6.01(p), and the unsecured/junior prong of the Incremental Amount's Ratio-Based Incremental Facility) but the §6.11 text actually read only contains clauses (a) Total Net Leverage Ratio and (b) Interest Coverage Ratio. This strongly suggests a **post-execution amendment** added or renumbered §6.11 (plausible, given five known amendments) — the original, as-executed Credit Agreement in hand does not contain it. **Blocks Q2, Q4, Q25 entirely.**
2. **The FY2026 10-K discloses the current TNL maintenance covenant as "4.25 to 1.00 through maturity."** The original, as-executed Credit Agreement's own step-down schedule would have the ratio at **4.00x** for all periods from December 31, 2023 onward. These are inconsistent on the documents in hand — almost certainly because one of Amendments No. 1–5 reset or extended the covenant level, but the amendment text itself has not been reviewed. **Do not treat 4.25x as confirmed current without the amendment.**
3. **Five Credit Agreement amendments and the September 2025 Amendment No. 4/5 refinancing were not reviewed as full text** (only their effects as summarized in the FY2026 10-K). Given how much the original Incremental Amount / General Debt Basket structure matters to Q1/Q2/Q25, and given the real capital structure (Term A now ~$1,250M post-Amendment 4, Term B originally $2,800M) differs substantially from what's currently modeled, an amendment could plausibly have changed basket sizes, added new baskets, or altered §6.11's applicability — not just the interest rate and maturity terms the 10-K happens to describe in prose.
4. **Whether the CA has a freestanding ratio-based lien basket analogous to Indenture cl. (24)** is UNKNOWN_REVIEW_REQUIRED (§B) — the search was a targeted defined-term/keyword search over §6.02(a)–(oo), not an exhaustive manual read of all 41 clauses.
5. **Covenant EBITDA remains an unverified reconstruction** (~$1,700M) per the pre-existing caveat — nothing in this pass independently verified it against the Indenture's/CA's own "Consolidated EBITDA"/"Adjusted Consolidated EBITDA" defined-term addback schedules (not reviewed in this pass; only the ratio *formulas* that consume EBITDA were reviewed, not the EBITDA definition's own addback mechanics). Any recomputed dollar figure above inherits this same open assumption.
6. **`facility_flat`'s net-of-debt basis is currently modeled against total secured debt; the real I-2 basket nets against amounts outstanding "under the Senior Credit Agreement" specifically** — a narrower base than the seed model uses. This is a separate, standalone correctness issue independent of everything above, not yet quantified.
7. **The exact relationship between §13.1(a)'s general disregard rule and the narrower §3.3(b)(i) proviso governing component (C) vs. component (A)** (Medium confidence in §B) rests on reading the proviso as an explicit exception rather than a restatement — a lawyer should confirm this reading.
8. Whether §13.1/§1.07-style stacking mechanics also govern the Restricted Payments basket waterfall was **not investigated** (explicitly out of Phase 1 scope) — flagged, not assumed, consistent with the prior phase's treatment.

---

## I. Recommended generalized primitives

Only primitives actually demonstrated by the Coherent documents — no speculative additions beyond what's evidenced above.

1. **A permission needs `grants: DEBT_INCURRENCE | LIEN`** — directly evidenced (I-1…I-5 vs. I-6…I-8; D-1…D-11 vs. L-4/L-5).
2. **A permission needs `amountKind: FIXED | INCURRENCE_BASED`** — directly evidenced throughout.
3. **A pairwise stacking relationship type set of exactly `CONCURRENT_DISREGARDED | CONCURRENT_COUNTED | ALTERNATIVE | MUTUALLY_EXCLUSIVE | INDEPENDENT | UNKNOWN_REVIEW_REQUIRED`** — every relationship found in §B maps onto one of these six; no seventh category was needed.
4. **An "automatic/unconditional lien permission tied to a specific debt basket" primitive** (I-6, C-7) — this is *not* the same as `CONCURRENT_DISREGARDED` (which describes two permissions each with their own capacity being combined); cl. (6)/§6.02(hh) instead describe a lien permission with **no capacity of its own**, entirely parasitic on a named debt permission's own sizing. Needs its own representation — modeling it as a `CONCURRENT_DISREGARDED` pair with an "unlimited" Fixed Amount would technically work arithmetically but would misrepresent *why* (it's not really a Fixed/Incurrence-Based pair at all).
5. **An explicit, ordered priority list among 3+ stackable permissions** (D-7/D-8/D-9's Ratio-Based → Prepayment-Based → Cash-Capped) — evidenced directly. This is a genuinely different primitive from a pairwise relationship: it's a total order over a *group*, not a binary relationship. `PermissionRelationship` as designed in the Legal Model Remediation Design (pairwise rows) can express this only as a set of pairwise `CONCURRENT_COUNTED`-with-priority edges — worth confirming that's sufficient or whether a first-class `orderedGroup` construct is warranted. Flagged as a design refinement, not a new legal concept.
6. **A "leverage-neutral alternative" test shape**: "ratio ≤ threshold OR ratio ≤ pre-transaction level" (F-3, F-4) — this is a *specific instance* of the general `ALT` primitive (§F), not a new primitive; the two paths are just "absolute threshold" and "no worse than before," both ordinary ratio tests.
7. **A measurement basis distinct from both `CUMULATIVE_INCURRED` and `CURRENTLY_OUTSTANDING`**: the Prepayment-Based Incremental Facility (C-4/D-9) sizes its capacity off **cumulative voluntary prepayment history**, not current outstanding balance or lifetime gross incurrence. This is evidence for a genuine third `measurementBasis` value beyond the two already proposed in the Legal Model Remediation Design (§9's `NET_OF_REPAYMENT` is close but not identical — NET_OF_REPAYMENT nets *this basket's own* incurred-minus-repaid amount, whereas the Prepayment-Based facility's capacity is sized off prepayments of *other* (Term Loan) debt entirely, functioning more like a reward/credit mechanism than a net-of-repayment basket). **This is a new, source-confirmed primitive not previously identified.**
8. **A step-down schedule as a first-class threshold shape** (§6.11(a)'s TNL schedule) — the existing engine models `thresholdValue` as a single scalar per provision, with amendment-style changes handled via `effectiveFrom`/`effectiveTo` row versioning. A step-down schedule *within a single, un-amended provision* is a different shape: several (date-range, threshold) pairs belonging to *one* contractual clause, not several *versions* of a clause. Confirmed real and directly evidenced — worth a design note (not solved here) on whether this should be modeled as several time-scoped `CovenantProvision` rows (reusing the existing `effectiveFrom`/`effectiveTo` machinery, since a step-down schedule is structurally identical to a sequence of amendments even though it's authored as one clause) or as a genuinely new "schedule" shape.

---

## Required focus questions — direct answers

| Question | Status |
|---|---|
| Q1 max additional secured debt | Not determinable; methodology confirmed wrong (previously ignored automatic cl. (6) lien permission); true figure ≥ $4,041M |
| Q2 max additional unsecured debt | Not determinable; blocked on missing §6.11(i) text |
| Q3 binding secured provision/path | Tracks Q1; cl. (24)/`mila_secured` confirmed NOT the sole answer |
| Q4 binding unsecured provision/path | Tracks Q2; blocked |
| Q5–Q8 secured checkpoints | Yes/no verdicts UNAFFECTED; binding-provision narrative changes |
| Q16–Q17 secured binding-constraint spot checks | Clear/not-clear verdicts very likely UNAFFECTED; binding-constraint identity not determinable |
| Q21 FCCR/MILA dollar mechanics | OR structure confirmed real and correct; must return `transaction_assumption_required` absent an explicit rate |
| Q22 remaining capacity after $500M | Tracks Q1; not determinable |
| Q23 $1,000M secured, pro forma TNL | Cleared verdict and TNL arithmetic UNAFFECTED; binding-provision citation changes |
| Q25 CA standalone secured capacity | Not determinable; blocked on missing §6.11(i) text |
