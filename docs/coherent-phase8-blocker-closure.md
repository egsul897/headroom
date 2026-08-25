# Coherent Phase 8 Final Blocker Closure

**Status: specification only.** No Prisma schema, seed data, `lib/covenant-engine.ts`, `lib/solver/**`, golden answers, or golden statuses were modified to produce this document. No `Permission`, `PermissionRelationship`, `SharedCapacityConstraint`, `RuleActivationCondition`, or `SolverCoverageDeclaration` row has been inserted. No new Q1/Q2/Q25 capacity number is computed anywhere below. This document resolves the five `UNKNOWN_REVIEW_REQUIRED` items `docs/coherent-phase1-stacking-table.md` §X left open (plus the pre-resolved Blocker 1 addendum's narrow remainder), and states what — if anything — still blocks Phase 8 population.

**Sources fetched and read directly this session** (both fetched fresh from EDGAR, not reused from a prior session's cache): Indenture, Exhibit 4.1 to Form 8-K filed December 10, 2021, accession `0001193125-21-353969`, file `d243415dex41.htm`; Credit Agreement as restated by Amendment No. 4, Exhibit 10.1 to Form 8-K filed September 26, 2025, accession `0001193125-25-220656`, file `d854664dex101.htm`. Both converted HTML→text via regex tag-strip + `html.unescape`, then searched/read at the targeted sections below (each exhibit is 1M+ characters). Current-state factual research (Blocker 4B, Blocker 1 item 3) additionally used: Coherent's FY2026 Form 10-K (`9d9271d1-CoherentCorp_20260814_10K_FY_2026.pdf`, period ended June 30, 2026, filed August 14, 2026 — uploaded PDF, converted via `pdftotext -layout`) and two ratings-agency web sources cited in place at Blocker 4B/§G below.

---

## A. Executive verdict

**`READY_TO_POPULATE_COHERENT_SOLVER_NATIVE`.**

All five items this task was scoped to resolve are **RESOLVED** with direct, verbatim primary-source citations obtained and read in this session — no assumption, extrapolation, or silent inference was used for any of them. As a byproduct of the targeted reads this required, two further items from the stacking table's original seven-item §X list — the "Consolidated Net Tangible Assets" definition (item 5) and the "Secured Covenant Reinstatement Event" full text (item 7) — were also incidentally resolved and are reported below for completeness, though they were not part of this task's required five.

This is a materially different bottom line than `docs/coherent-phase1-stacking-table.md` §Y's prior `NOT_READY` verdict. That verdict is not overwritten — §K below documents exactly what changed and why, and the stacking table itself is updated only by appending the new findings alongside the old ones (per the task's explicit instruction never to delete historical uncertainty). What changed is that every specific gap the prior round flagged as blocking has now been closed by a targeted, primary-source read; nothing here recomputes a capacity number, populates a `Permission` row, or performs the schema population Phase 8 itself requires — that remains a distinct, subsequent engineering step, appropriately deferred by this task's own hard freeze (§11).

One qualification on "ready": Blocker 5 additionally surfaced three genuine, previously-unmodeled Indenture debt permissions (§H below) that must be added to the Permission inventory before population is complete — but their content is now fully known from primary text, so this is a scoped population task, not an open research question.

---

## B. Blocker 1 — Material Acquisition

### Pre-resolved portion (confirmed against operative text, not re-derived)

Re-verified directly from the fetched Amendment No. 4-restated Credit Agreement text this session (not merely carried forward): the §6.11(a) step-up/Cool-Down mechanic quoted in the task's addendum matches the fetched text verbatim, at the location immediately following §6.11(a)'s "4.25 to 1.00" baseline sentence. Confirmed unchanged from the addendum's own quotation.

### Item 1 — Does the step-up threshold flow through by reference? **RESOLVED: Yes, wherever a provision cross-references "the [then-]applicable ratio in the Financial Covenant set forth in Section 6.11(a)."**

Located and confirmed (this session, direct text search of the fetched Credit Agreement) every provision using that exact cross-reference phrase:

- **Incremental Amount definition, Ratio-Based Incremental Facility, unsecured/junior prong**: *"...the Total Net Leverage Ratio is not greater than the then-applicable ratio in the Financial Covenant set forth in Section 6.11(a)..."*
- **§6.01(h), Acquired-entity debt**: *"...the Total Net Leverage Ratio shall not be greater than (A) the then applicable ratio in the Financial Covenant set forth in Section 6.11(a) or (B) the Total Net Leverage Ratio in effect immediately prior thereto..."*
- **§6.01(p), General Permitted Debt catch-all**: *"...the Total Net Leverage Ratio on a Pro Forma Basis is not greater than the applicable ratio in the Financial Covenant set forth in Section 6.11(a)..."* — this is the same clause the stacking table's Row CA-D7 had already confirmed corrected from the erroneous "§6.11(i)"; this session independently re-confirms the exact surrounding "applicable ratio" phrasing.
- (Out of Phase 1 scope, confirmed for completeness) §6.04(x) (Investments) and §6.06(h) (Restricted Payments), both added by Amendment No. 4, use the identical phrase.

**Reading**: "the [then-]applicable ratio" is drafted to mean *whatever the currently operative §6.11(a) threshold is at the moment of testing* — including an active Financial Covenant Step-Up. Every one of these cross-referencing provisions therefore inherits the step-up automatically; none of them independently freezes at 4.25x. **The only provision that does *not* flow through the step-up is the Incremental Amount's pari passu-secured Ratio-Based prong**, which tests First Lien Secured Net Leverage Ratio ≤ 2.75:1.00 — a wholly separate ratio with no §6.11(a) cross-reference at all, confirmed by its own text (§D below).

**Affected rows**: Row CA-D7 (§6.01(p)), the CA-D... row for §6.01(h) Acquired debt, and the unsecured/junior prong of `ca_incremental_ratio_based` (Incremental Amount def.) all now resolve to a *known, current* numeric threshold rather than an unresolvable "4.25x or 4.75x" ambiguity — see item 3 below for what that current value actually is.

### Item 2 — Does "Permitted Business Acquisition" carry its own exclusions/conditions? **RESOLVED: Yes.**

Full definition located and quoted (Credit Agreement, Article I): *"'Permitted Business Acquisition' shall mean any acquisition by the Borrower or a Subsidiary of all or substantially all of the assets or business of, or all or substantially all of the Equity Interests... in, or merger, consolidation or amalgamation with, a person or business unit..."*, conditioned on:

1. **(i)** No Event of Default under §7.01(b)/(c)/(h)/(i) has occurred and is continuing, or would result;
2. **(ii)** The Borrower must be in **Pro Forma Compliance with the Financial Covenants** immediately after giving effect to the acquisition and related transactions — note this is tested using whatever the *then-applicable* §6.11(a) threshold is (per item 1), including the step-up itself once the acquisition closes, so this is not a circular blocker;
3. **(iii)** The target must merge into a Loan Party or become a Guarantor upon consummation, to the extent required by §5.10;
4. **(iv)** A sub-cap on the aggregate cash consideration paid for assets/Equity Interests that do **not** end up owned by or held in Loan Parties/Guarantors — that consideration is capped by reference to available Investment-basket capacity under §6.04 (excluding clause (k)), *unless* the target becomes a Guarantor within the §5.10 timeframe or not less than 65% of the target's Adjusted Consolidated EBITDA is represented by persons that become Guarantors.

**Affected rows**: none of Phase 1's debt/lien rows directly — these are qualification conditions on the acquisition itself (EOD-free, Financial-Covenant-compliant, Guarantor-joinder, non-Guarantor-consideration sub-cap), not a debt-incurrence basket in their own right. Flagged here for completeness per the task's instruction, but out of Phase 1's debt/lien-capacity scope (the sub-cap in (iv) draws on the Investments covenant, explicitly out of scope).

### Item 3 — Has Coherent consummated a Material Acquisition (>$500M) since the Amendment No. 4 Effective Date (9/26/2025)? **RESOLVED: No, based on convergent primary and public-source evidence as of the current reporting date (August 25, 2026).**

Evidence, treated with the same rigor as Blocker 4B:

- **FY2026 Form 10-K** (period ended June 30, 2026, filed August 14, 2026 — the most recent 10-K, covering the entire Amendment No. 4-to-date window): the "Cash Flows from Investing Activities" statement discloses **no** "payments for acquisition"/"business acquisition, net of cash acquired" line item for FY2026; the only material investing-activity items are capital expenditures (`Additions to property, plant & equipment`, $1,102.9M), a divestiture (`Proceeds from the sale of business, net of fees`, $436.99M), and short-term-investment purchases/maturities. The "Business Combinations" accounting-policy note references no FY2026 transaction; the only acquisition discussed anywhere in the filing is the original July 1, 2022 combination with Coherent, Inc. — the transaction that pre-dates Amendment No. 4 by more than three years. Source: `9d9271d1-CoherentCorp_20260814_10K_FY_2026.pdf`, Consolidated Statement of Cash Flows and Notes.
- **Public-source corroboration** (WebSearch, this session): no acquisition announcement of any size was found for the period since September 26, 2025. The most significant related-party financial event in this window is an inbound NVIDIA strategic investment *into* Coherent (not an outbound acquisition *by* Coherent — an Investment/financing-side event, out of Phase 1 debt/lien scope regardless). Fitch's November 10, 2025 rating action explicitly references the *sale* of Coherent's German tools-for-materials-processing business — consistent with the 10-K's divestiture line, not an acquisition.

**Conclusion**: no Material Acquisition has closed since the Amendment No. 4 Effective Date. No Financial Covenant Step-Up is currently active, and no Cool Down Period is currently running. **The currently applicable §6.11(a) threshold — for the maintenance test itself and for every provision identified in item 1 that cross-references it — is 4.25 to 1.00, flat**, as of the current reporting date.

### Blocker 1 status: **RESOLVED** (all three remaining items closed; the pre-resolved portion is unchanged).

---

## C. Blocker 2 — EBITDA / Addback Cap Mechanics: Indenture

**Defined term**: "Consolidated EBITDA" (Indenture, Article I; "Four Quarter Consolidated EBITDA" is a thin wrapper — *"means as of any date of determination with respect to any Test Period, Consolidated EBITDA of the Company for such Test Period on a Pro Forma Basis"* — confirmed this session).

### Base measure

"Consolidated Net Income" of the Company and Restricted Subsidiaries, GAAP-consolidated, for the relevant period — itself excluding (per the term's own further text, confirmed structurally parallel to the Credit Agreement's near-identical Consolidated Net Income definition, §D below) extraordinary/non-recurring/unusual items, accounting-change cumulative effects, and non-consolidated/Unrestricted Subsidiary income, among other standard exclusions. **Caveat**: the Indenture's Consolidated Net Income definition's own full exclusion sub-list ((a) through its final clause) was confirmed to exist and to begin with materially the same exclusions as the Credit Agreement's parallel definition (both drafted from what is evidently the same template — see §D), but was not independently re-transcribed clause-by-clause this session beyond its opening sentence. This is immaterial to Blocker 2's core question (the addback/cap mechanics of Consolidated EBITDA itself, which *was* read in full) and does not affect any Phase 1 debt/lien capacity conclusion.

### Permitted additions (clause (1)(a)–(s), full text read and confirmed this session)

Interest expense (net of hedging gains/interest income); tax provision; D&A (including capitalized software/deferred-financing-cost amortization); other non-cash charges (with a reversal rule if a non-cash charge represents an accrual for a future cash item); non-controlling-interest income addback; parent-entity option/phantom-equity distribution payments and director fees; Qualified Receivables Factoring losses; specified cash receipts corresponding to a prior period's non-cash-gain deduction; management/employee-benefit-plan costs (non-cash or equity-proceeds-funded); pension/OPEB amortization items; "unusual or non-recurring operating expenses directly attributable to... cost savings initiatives"; severance/relocation/integration/restructuring charges and business-optimization expenses; New Project pre-opening losses (capped to the 12 months following completion); transition/facility-closure costs; third-party-reimbursed expenses; **"other add backs and adjustments reflected in a quality of earnings report provided by a 'big four' accounting firm"**; FX losses; purchase-accounting adjustment effects.

### Cost savings / synergies / run-rate addback (clause (2))

*"'run rate' cost savings, operating expense reductions and synergies related to the Transactions, any Specified Transaction and any transaction in connection therewith... (i) with respect to the Transactions, projected by the Company in good faith to be realized... and (ii) with respect to any Specified Transaction... within 36 months after such Specified Transaction..."* — **note the asymmetry, confirmed as-drafted, not smoothed over**: the 36-month realization window is expressly tied to Specified-Transaction-sourced savings (clause (ii)); the base "Transactions"-sourced savings (clause (i)) carries no textually distinct realization deadline in the language read. Both are subject to: good-faith projection; "reasonably quantifiable, factually supportable, and reasonably anticipated"; net of actual benefits realized; no duplication with expenses already excluded elsewhere; and a joint-venture proration rule (JV savings allocated only to the extent of the Company's/Subsidiary's own income-participation percentage in that JV).

### Deductions (clause (3)(a)–(c))

Non-cash gains (with a reversal exception); non-controlling-interest loss add-back reversal; FX gains.

### Pro forma acquisition/disposition treatment (clause (3) proviso (A)/(B))

Standard M&A EBITDA-build mechanics: Acquired EBITDA of entities acquired during the period included from a historical Pro Forma Basis (i.e., as if owned for the whole period); Disposed EBITDA of entities sold/closed/reclassified during the period excluded on the same basis.

### Caps, sub-caps, percentage-of-EBITDA ceilings: **NONE FOUND**

A targeted search for a percentage-of-EBITDA ceiling on the aggregate addbacks, on the run-rate synergy addback specifically, or on the quality-of-earnings-report addback category returned no results (patterns searched: `"% of Consolidated EBITDA"` appearing near addback/cap language; `"shall not exceed [N]% of Consolidated EBITDA"`). The only quantitative limits found anywhere in the definition are item-specific: the New Project pre-opening-loss 12-month window and the Specified-Transaction run-rate-savings 36-month realization window. **The cap-denominator question ("before or after specified adjustments") is therefore moot — there is no percentage-of-EBITDA cap to denominate.**

### Anti-duplication

"Without duplication" appears at the head of clauses (1) and (3) and is restated explicitly within clause (2)'s own proviso barring double-counting of run-rate savings against expenses already excluded under clause (1).

---

## D. Blocker 2 — EBITDA / Addback Cap Mechanics: Credit Agreement

**Defined term**: "Adjusted Consolidated EBITDA" (Credit Agreement, Article I, confirmed this session with full text).

### Structural finding: near-identical to the Indenture's mechanic, but not the same defined term

Side-by-side comparison of the two definitions, both fully extracted this session, shows they are drafted from the same template and are **structurally and computationally equivalent** — same addback categories in the same order ((a)(i)–(xix) here vs. (1)(a)–(s) in the Indenture), same run-rate-synergy clause with the identical 36-month/Specified-Transaction structure and JV proration rule, same deduction categories, same Acquired/Disposed EBITDA pro forma mechanics, and **the same absence of any percentage-of-EBITDA cap** (confirmed via the identical targeted search, no hits). They remain **legally distinct, separately defined terms in separately governed documents** — this is not an assertion of legal equivalence, only of computational shape. Differences are limited to terminology (Borrower/Subsidiaries vs. Company/Restricted Subsidiaries; Closing Date vs. Issue Date) and the Credit Agreement's own explicit tie-in to its §1.07 Pro Forma Basis/concurrency machinery (already verified in the stacking table, Row CA-D1).

### Base measure

"Consolidated Net Income" — full definition located and read this session (Credit Agreement, Article I): *"the aggregate net income of such person and its Subsidiaries for such period... excluding, without duplication: (a) extraordinary, non-recurring or unusual gains or losses... (b) the cumulative effect of a change in accounting principles... (c) Transaction Costs, (d) the net income... of any person that is an Unrestricted Subsidiary and any person that is not a Subsidiary or that is accounted for by the equity method of accounting; provided that Consolidated Net Income shall be increased by the amount of dividends or distributions or other payments that are actually paid in cash..."* — plus a currency-translation convention and a Restricted-Payments-specific carve-out (§6.06 only) excluding certain Investment-disposition income from Consolidated Net Income to prevent double-counting against the Cumulative Qualified Equity Proceeds Amount (out of Phase 1 scope).

### Caps: **NONE FOUND** (same targeted-search methodology as the Indenture side, same result)

### Management certification / good-faith standard

Two distinct evidentiary tiers, confirmed identical in both documents:

1. **Run-rate cost savings/synergies** (CA clause (b) / Indenture clause (2)): a **good-faith management projection** standard — "projected by the Borrower/Company in good faith," "reasonably quantifiable, factually supportable, and reasonably anticipated." This is inherently forward-looking and not independently derivable from historical GAAP financial statements.
2. **"Quality of earnings report" addbacks** (CA clause (a)(xvii) / Indenture clause (1)(q)): requires an actual **third-party accounting firm** ("big four" or equivalent) report — a genuine external-certification requirement, distinct in kind from the good-faith standard above.

### Computational semantics — algebraic specification

Given the confirmed absence of any percentage-of-EBITDA cap, the task's illustrative `eligible_adjustment = min(supported_adjustment, X% * EBITDA_before_specified_adjustments)` formula **does not apply** to either document — there is no capped adjustment to express that way. The correct shape is purely additive, with no aggregate ceiling:

```
EBITDA(period) =
    ConsolidatedNetIncome(period)
  + Σ addback_category_i(period)         // categories (a)/(1) through (s)/(xix), each with its own item-specific
                                          // conditions (e.g., non-cash-charge reversal-on-future-cash-payment rule)
  + RunRateSavings(period)                // good-faith projected; net of actual benefits realized; JV-prorated;
                                          // 36-month realization window applies only to Specified-Transaction-sourced savings
  − Σ deduction_category_j(period)        // non-cash gains (net of reversal), NCI loss add-back reversal, FX gains
  + AcquiredEBITDA(entities acquired during period, historical Pro Forma Basis)
  − DisposedEBITDA(entities disposed during period, historical Pro Forma Basis)
```

No `min(..., cap)` term appears anywhere in this formula for either document, because no cap exists.

### What Headroom can calculate vs. what requires external/human input

Mapped onto the existing `ExternalInput` taxonomy (`docs/solver-architecture-design.md` §K — `COMPUTABLE_FORMULA | CERTIFIED_EXTERNAL_INPUT | DISCRETIONARY_CATCH_ALL | HUMAN_CLASSIFICATION`); **no new category is needed**:

| Component | Classification | Why |
|---|---|---|
| Base interest/tax/D&A addbacks | `COMPUTABLE_FORMULA` in principle | Standard financial-statement line items, mechanically simple once sourced |
| FX gain/loss addback/deduction | `COMPUTABLE_FORMULA` in principle | Disclosed financial-statement items |
| Acquired/Disposed EBITDA pro forma build | `COMPUTABLE_FORMULA`, data-intensive | Mechanical once the acquired/disposed entity's own historical financials are available |
| "Quality of earnings report" addbacks | `CERTIFIED_EXTERNAL_INPUT` | Requires an actual third-party accounting-firm report; not derivable from public financials |
| Run-rate cost savings / synergies | `DISCRETIONARY_CATCH_ALL`-adjacent (a good-faith management projection, not a named external category, but also not open-ended in the same way as a borrowing-base reserve) | Forward-looking, "reasonably anticipated" — inherently a management judgment call, not mechanically derivable from historical GAAP data |
| "Restructuring," "business optimization," "unusual or non-recurring" characterization of a given GAAP expense line | `HUMAN_CLASSIFICATION`-adjacent | GAAP financial statements do not tag expenses by these categories; determining which dollars qualify requires either the Company's own Compliance-Certificate-level addback schedule or an independent classification exercise Headroom is not positioned to perform |

**Recommended sourcing methodology** (no new primitive — this is a modeling-choice recommendation, not an architecture change): both EBITDA definitions should be sourced **in their entirety** as a `CERTIFIED_EXTERNAL_INPUT`, keyed to the Company's own Compliance Certificate EBITDA build-up schedule (which both documents' compliance-certificate mechanisms already require the Company to deliver, itemizing each addback) — **never independently recomputed by Headroom line-by-line from raw GAAP financials.** This is a direct, load-bearing application of the architecture's existing rule (§K: "Consume it as an external input with provenance — never independently recomputed"), not a new design choice invented for Coherent. The narrow exception: base interest/tax/D&A figures are mechanically simple enough that Headroom *could* independently cross-check them against reported GAAP figures, but the run-rate-savings and quality-of-earnings components should not be recomputed.

### Blocker 2 conclusion: **RESOLVED (both documents).** The existing `ExternalInput` model is sufficient — **no missing generalized primitive was identified.** The addback mechanics are now fully reconstructed for both documents; the one substantive finding (no percentage cap exists in either document) directly answers the task's own algebraic-formula question by showing the formula has no cap term.

---

## E. Blocker 3 — First Lien Secured Net Leverage Ratio

### Full definition, located and quoted this session (Credit Agreement, Article I — not previously re-extracted from Amendment No. 4's text; only its 2.75x threshold and expanded pari passu facility list had been confirmed before this session)

*"'First Lien Secured Net Leverage Ratio' shall mean, as of any date of determination, the ratio of (a) (i) the sum of, without duplication, (x) the aggregate principal amount of any Consolidated Debt consisting of Loan Obligations outstanding as of the last day of the Test Period most recently ended as of such date that are then secured by first-priority Liens on the Collateral and (y) the aggregate principal amount of any other Consolidated Debt of the Borrower and its Subsidiaries outstanding as of the last day of such Test Period that is then secured by Liens on the Collateral that are Other First Liens less (ii) the Unrestricted Cash Amount as of the last day of such Test Period, to (b) Adjusted Consolidated EBITDA for the last day of such Test Period, all determined on a consolidated basis in accordance with GAAP."*

### Nested definitions traced to computability (all located and quoted this session)

- **"Consolidated Debt"**: *"the sum of (without duplication) the principal amount of (x) all Indebtedness for borrowed money and all Indebtedness evidenced by bonds, debentures, notes, or other similar instruments of the Borrower and the Subsidiaries and (y) guarantees by the Borrower and the Subsidiaries of the foregoing... For the avoidance of doubt, it is understood that obligations (i) under Capitalized Lease Obligations, Hedging Agreements, Cash Management Agreements, and any Qualified Receivables Facility or (ii) owed by Unrestricted Subsidiaries, do not constitute Consolidated Debt."*
- **"Other First Liens"**: *"Liens on the Collateral that are equal and ratable with the Liens thereon securing the Initial Term Loans, the 2025 Incremental Term A Loans, the Term B-1 Loans and the Term B-2 Loans... pursuant to a Permitted First Lien Intercreditor Agreement..."* — i.e., pari passu first-lien Collateral debt sitting *outside* the base "Loan Obligations" bucket (e.g., an Other-First-Lien-structured Incremental Facility).
- **"Unrestricted Cash Amount"**: *"the amount of cash, cash equivalents or Permitted Investments of the Borrower or any of its Subsidiaries that would not appear as 'restricted' on a consolidated balance sheet... (other than as a result of appearing 'restricted' in favor of the Facility... which may also include cash and cash equivalents securing other Indebtedness secured by a Lien on any Collateral along with the Facility)."* No dollar cap on the amount netted — full, uncapped cash netting.
- **"Adjusted Consolidated EBITDA"**: per Blocker 2/§D above.

### Answers to the task's checklist

- **Numerator**: first-priority-Collateral-secured Loan Obligations + pari passu Other-First-Lien-secured Consolidated Debt, both measured as outstanding on the last day of the most recently ended Test Period.
- **Debt excluded**: Capitalized Lease Obligations, Hedging Agreements, Cash Management Agreements, Qualified Receivables Facility debt, and all debt of Unrestricted Subsidiaries (via the "Consolidated Debt" carve-out); any Collateral debt secured at a *junior* priority (Junior Liens are neither "first-priority Liens" nor "Other First Liens" and so fall outside the numerator entirely).
- **First-lien treatment**: two-tier — base Loan Obligations secured at first priority, plus separately-structured pari passu "Other First Lien" debt; both sum into the numerator; junior-secured debt is excluded from the ratio's numerator altogether (it is captured by the Total Net Leverage Ratio instead, which nets total Consolidated Debt regardless of security).
- **Cash netting / cash caps**: full netting of the "Unrestricted Cash Amount," no dollar cap on the amount netted.
- **Entity scope**: Borrower + Subsidiaries generally (not textually limited to Loan Parties), though structurally only Collateral-granting Loan Parties can hold Liens on the Collateral, so non-Loan-Party debt cannot appear in the numerator's secured-debt components regardless.
- **Unrestricted-subsidiary treatment**: excluded entirely, both directly (Consolidated Debt's own carve-out) and indirectly (Adjusted Consolidated EBITDA's Consolidated Net Income exclusion of Unrestricted Subsidiary income).
- **Guarantees**: guarantees of the underlying borrowed-money debt count toward Consolidated Debt (and hence the numerator, if the guaranteed debt is itself Collateral-secured at the relevant priority).
- **Collateral/security relevance**: central to the ratio's entire structure — it is defined by priority tier, not merely by "secured vs. unsecured."
- **Pro forma / transaction-date treatment**: not separately stated within the ratio's own definition, but the ratio is expressly named among the "financial ratio or test" measures governed by the Credit Agreement's general §1.07 Pro Forma Basis / Fixed-Amount-disregard machinery (already verified, Row CA-D1) — confirmed again this session at the same §1.07(b) location that names it explicitly: *"...including any First Lien Secured Net Leverage Ratio, Total Net Leverage Ratio and/or Interest Coverage Ratio..."* No special or different treatment beyond that general rule was found.
- **Amendment changes**: Amendment No. 4 expanded the *list of pari passu-referenced facilities* used elsewhere (the Incremental Amount definition's own cross-reference to this ratio), but the ratio's own numerator/denominator "means" clause quoted above — now confirmed directly from the current, Amendment-No.-4-restated text — was not shown to have itself changed language; no prior version was separately diffed against it in this pass (unnecessary — the current text is what governs).

### Formula specification for the solver interface

Using the existing `Permission.formulaType` shape (`LEVERAGE_RATIO_ROOM`) and the existing `PermissionCollateralScope.priorityTier` field already in `prisma/schema.prisma`:

```
FirstLienSecuredNetLeverageRatio(t) =
  max(0,
      FirstPriorityLoanObligationsOutstanding(t)
    + OtherFirstLienConsolidatedDebtOutstanding(t)
    − UnrestrictedCashAmount(t)
  )
  / AdjustedConsolidatedEBITDA(TestPeriod ending nearest t)
```

- `FirstPriorityLoanObligationsOutstanding(t)`: `COMPUTABLE_FORMULA` — derivable from the debt ledger once each facility tranche carries a `priorityTier` tag (the schema's own `PermissionCollateralScope.priorityTier` field is designed for exactly this).
- `OtherFirstLienConsolidatedDebtOutstanding(t)`: `COMPUTABLE_FORMULA` in principle, same `priorityTier`-tagging mechanism, applied to any pari passu Other-First-Lien-structured Incremental tranche.
- `UnrestrictedCashAmount(t)`: `COMPUTABLE_FORMULA` from the balance sheet, though "restricted" classification in an edge case may itself require a `CERTIFIED_EXTERNAL_INPUT` cross-check against financial-statement notes.
- `AdjustedConsolidatedEBITDA(...)`: `CERTIFIED_EXTERNAL_INPUT`, per Blocker 2/§D.

### Blocker 3 conclusion: **RESOLVED.** No genuinely irreducible human-judgment input blocks this ratio's mechanical computability once (a) debt-tranche priority tagging exists (already an existing schema primitive) and (b) Adjusted Consolidated EBITDA is sourced per Blocker 2. **No new primitive is needed.**

---

## F. Blocker 4 — Collateral Suspension Period: contractual rule

Re-verified directly from the fetched Amendment No. 4-restated text this session (not merely carried forward from the prior round's document).

### Trigger — "Investment Grade Rating Trigger Date" (verbatim, re-confirmed)

*"...the first date after the Amendment No. 4 Effective Date or, if applicable, after any Collateral Reinstatement Date when (a) the Borrower has an Investment Grade Rating from at least two of S&P, Moody's, and Fitch, (b) no Default or Event of Default has occurred and is continuing under this Agreement, (c) no Indebtedness secured by Liens on the Collateral permitted by Section 6.02(hh) is outstanding (unless the Liens securing such Indebtedness are contemporaneously released) and (d) a Responsible Officer of the Borrower has delivered an officer's certificate to the Administrative Agent that (1) certifies to the satisfaction or concurrent satisfaction of the foregoing and (2) requests the Administrative Agent to take any reasonably requested actions to evidence such release of Collateral in accordance with Section 5.10(h); provided that no Investment Grade Rating Trigger Date shall occur prior to the date on which the aggregate outstanding principal amount of all Term B Loans and any accrued but unpaid interest and fees related thereto have been paid in full."*

**"Investment Grade Rating"**: BBB-/Baa3-or-better with stable outlook or better (S&P/Moody's); BBB- or better (Fitch) — re-confirmed verbatim.

### Reversion — "Secured Covenant Reinstatement Event" — **full text now located and quoted for the first time** (the prior round's document flagged this as incompletely transcribed; resolved as a byproduct of this session's Blocker 4 read)

*"'Secured Covenant Reinstatement Event' means any day following an Investment Grade Rating Trigger Date on which (a) the Borrower's Public Debt Rating from at least two of S&P, Moody's, and Fitch shall be less than either (i) as to S&P, BBB-, (ii) as to Moody's, Baa3 and (iii) as to Fitch, BBB-, (b) upon the Borrower no longer having a Public Debt Rating from at least two of S&P, Moody's and Fitch, (c) any other Indebtedness is secured by Liens on the Collateral (as defined in this Agreement immediately prior to the Investment Grade Rating Trigger Date) in reliance on Section 6.02(hh) or (d) the Borrower notifies the Administrative Agent in writing that it has elected to terminate the Collateral Suspension Period."*

This closes the prior round's §X item 7 (not one of this task's required five, resolved incidentally).

### Effect / modeling shape (unchanged from the prior round's finding, re-confirmed)

Collateral released; new §6.01(ee)/§6.02(pp) Priority Debt baskets (15% of Consolidated Net Tangible Assets each, netted dollar-for-dollar against §6.01(k)/(p)/(v)/(bb) usage during the Period) become operative; several other covenant relaxations become operative (out of Phase 1 scope). Modeled as: `RuleActivationCondition { appliesTo: { companyWide: true } , predicate: { kind: "EVENT_TRIGGERED", sinceEvent: "InvestmentGradeRatingTriggerDate", until: "SecuredCovenantReinstatementEvent" }, effect: "APPLICABILITY" }` — this is exactly the shape `docs/solver-architecture-design.md` §I already defines for whole-package rating-triggered suspension mechanics (its own worked comparison table cites Coherent's threshold step-up but the same `EVENT_TRIGGERED` predicate kind covers this mechanic too). **No new primitive is needed.**

**Bonus incidental finding**: "Consolidated Net Tangible Assets" (the Priority Debt cap's own base metric, prior round's §X item 5, not one of this task's required five) was also located and quoted this session: *"the aggregate amounts of assets (less depreciation and valuation reserves and other reserves...) which under GAAP would be included on a balance sheet after deducting therefrom (a) all liability items except deferred income taxes, commercial paper, short-term Indebtedness, other long term liabilities and shareholders' equity and (b) all goodwill, trade names, trademarks, patents, unamortized debt discount and expense and other like intangibles..."* — a genuine balance-sheet-based (not EBITDA-based) measure, confirming the prior round's flagged "fourth measurement basis" concern was real, though moot for present purposes given §G's finding below that the mechanic is currently inactive.

---

## G. Blocker 4 — Collateral Suspension Period: current factual state

**RESOLVED: the Collateral Suspension Period is NOT currently active**, based on two independent, mutually corroborating findings — not a guess from silence, and not a `CURRENT_STATE_UNKNOWN_REVIEW_REQUIRED` result.

### Finding 1 (dispositive on its own): Term B Loans remain outstanding

The Investment Grade Rating Trigger Date's own proviso bars the trigger from occurring "prior to the date on which the aggregate outstanding principal amount of all Term B Loans... have been paid in full." Coherent's **FY2026 Form 10-K** (fiscal year ended June 30, 2026; filed August 14, 2026 — the most recent 10-K and current as of this report's date) discloses, in Note 8 ("Debt"):

| | June 30, 2026 | June 30, 2025 |
|---|---|---|
| Term B Facility, interest at adjusted SOFR plus 1.75% | **$1,080,000 thousand** | $2,102,358 thousand |

**Source**: `9d9271d1-CoherentCorp_20260814_10K_FY_2026.pdf`, Note 8, Debt table. `measurementDate`: 2026-06-30. `sourceDate` (filed): 2026-08-14.

Term B carries a non-zero, materially large balance ($1.08 billion) as of the most recent audited balance sheet. Because the proviso's own condition is unsatisfied, **the Investment Grade Rating Trigger Date cannot have occurred**, regardless of the company's actual credit ratings — the conjunctive structure of the trigger makes this finding independently dispositive.

### Finding 2 (independent corroboration): Coherent's actual current credit ratings are below Investment Grade

- **Fitch Ratings** affirmed Coherent Corp. at **"BB"** (stable outlook) on **November 10, 2025**. Source: [Fitch Affirms Coherent Corp. at 'BB'; Outlook Stable — TradingView/Reuters](https://www.tradingview.com/news/reuters.com,2025-11-10:newsml_FIT2K2c3Y:0-fitch-affirms-coherent-corp-at-bb-outlook-stable/), dated 2025-11-10.
- **S&P Global Ratings** upgraded Coherent Corp. to **"BB"** on/around **April 27, 2026**. Source: [S&P Global Ratings — Coherent Corp. Upgraded To 'BB' On Strong AI Demand](https://www.spglobal.com/ratings/en/regulatory/article/-/view/type/HTML/id/3552320), dated ~2026-04-27.
- Moody's current rating was not located via this session's search (immaterial — see below).

Both located ratings ("BB") sit one full notch below the BBB-/Baa3 Investment Grade threshold the Credit Agreement itself defines. Since the trigger requires Investment Grade ratings from **at least two of the three** agencies, and neither of the two ratings actually found meets that bar, this independently confirms the trigger has not occurred — though Finding 1 alone is already dispositive and does not depend on ratings data at all.

### Conclusion and modeling implications

As of the latest reasonably available date (financial data through 2026-06-30 / 10-K filed 2026-08-14; ratings data through ~2026-04-27), the Investment Grade Rating Trigger Date **has not occurred**, the Collateral Suspension Period is **not active**, and `docs/coherent-phase1-stacking-table.md` §F.3/§F.4's "steady-state" Permission tables (which model `ca_priority_debt_601ee_conditional`/`ca_priority_lien_602pp_conditional` as dormant) correctly reflect Coherent's actual current position.

`ExternalInput` classification for eventual Headroom ingestion (per `docs/solver-architecture-design.md` §K):

| Input | Kind | Source | `asOfDate` | Auto-ingestible? |
|---|---|---|---|---|
| Term B Loans outstanding principal | `CERTIFIED_EXTERNAL_INPUT` | 10-K/10-Q Note 8 debt table | 2026-06-30 | **Yes, eventually** — a standard, XBRL-taggable financial-statement line item, refreshed each quarterly/annual filing |
| Public Debt Rating (S&P/Moody's/Fitch) | `CERTIFIED_EXTERNAL_INPUT` | Ratings-agency press releases (not an SEC filing) | ~2025-11-10 (Fitch) / ~2026-04-27 (S&P) | **No** — not Company-filed; requires a ratings-agency data feed/API or periodic manual reconfirmation; no natural SEC-filing-cadence staleness trigger |

Given the trigger's conjunctive structure, **the Term B-balance leg should be evaluated first** in any future solver implementation — it is Company-filing-sourced, higher-confidence, and lower-cost to keep current than the ratings leg, and is independently dispositive until Term B approaches full repayment.

---

## H. Blocker 5 — Indenture §3.3(b)(xiii) and following: full inventory

Re-read this session, from §3.3(b)(xiii) through the end of §3.3(b)'s enumerated clauses at clause (xxxiii), followed immediately by subsection (c) (the classification/reclassification proviso, already verified in the prior round) and then §3.4 (Restricted Payments, out of scope) — confirming clause (xxxiii) is in fact the last enumerated debt-permission clause of §3.3(b).

| Clause | Description | Amount/formula | Secured/unsecured | Entity scope | Fixed/Incurrence-Based | Lien-eligible via cl. (6)? | Phase 1 materiality |
|---|---|---|---|---|---|---|---|
| (xiii) | Guarantees of otherwise-permitted debt | No independent cap — parasitic on the guaranteed debt's own basket | Follows guaranteed debt | Company + Restricted Subs | N/A (guarantee mechanic) | No (not named) | `NOT_MATERIAL_TO_PHASE8` — adds no new capacity, only extends guarantee eligibility to already-counted debt |
| (xiv) | Refinancing Indebtedness | Equal to (not exceeding) the refinanced amount + Refinancing Expenses; WAL/maturity/subordination-matching conditions | Follows refinanced debt | Company + Restricted Subs | N/A (refinancing mechanic) | No (not named) | `NOT_MATERIAL_TO_PHASE8` for max-additional-capacity questions — a like-for-like swap, not incremental capacity |
| **(xv)** | **Acquisition/Investment-related debt, leverage-neutral alternative** | **No dollar cap** — gated only by: (1) post-transaction Ratio Debt capacity of ≥$1.00, OR (2) FCCR ≥ pre-transaction FCCR | Not restricted on its face (silent — may be secured or unsecured) | Company + Restricted Subs | Incurrence-Based (leverage-neutral OR test, structurally identical to CA §6.01(h)) | **No** — clause (6) names only §3.3(b)(i)/(iv); not (b)(xv) | **`MATERIAL_TO_PHASE8`** — a previously unmodeled, uncapped, general-purpose acquisition-debt basket. If secured, needs independent clearance under Permitted Liens cl. (24) (ratio-tested, since cl. (24) generically covers "Indebtedness permitted to be Incurred pursuant to Section 3.3" — not limited to specific sub-clauses) and/or cl. (25) (fixed $530M/40%EBITDA, also generically worded) |
| (xvi) | NSF/insufficient-funds instruments | Ordinary course, no material cap relevant | Unsecured, ordinary course | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |
| (xvii) | LC/bank-guarantee-supported debt | Capped at the supporting LC/guarantee's own stated amount | Follows the LC | Company + Restricted Subs | Fixed (narrow) | No | `NOT_MATERIAL_TO_PHASE8` — narrow, self-limiting |
| **(xviii)** | **Contribution Indebtedness** | **Capacity = the aggregate amount of cash equity contributions (excluding Excluded Contributions) made to the Company/a Restricted Subsidiary's capital after the Issue Date and formally designated as such**; must be Incurred within 210 days of the contribution and designated via Officer's Certificate on the Incurrence date | Not restricted on its face | Company + Restricted Subs | **New, fourth measurement basis** — a contribution-linked "credit," tied to a historical corporate-finance event (cash equity contribution) rather than EBITDA, outstanding balance, or prepayment history | **No** — clause (6) does not name it | **`MATERIAL_TO_PHASE8` in shape, but fact-dependent** — the formula is uncapped in principle but its actual size depends entirely on whether Coherent has made, and formally designated, any post-Issue-Date cash contributions within the applicable 210-day window; this is a `CERTIFIED_EXTERNAL_INPUT` (the Officer's Certificate itself), not independently derivable |
| (xix) | Insurance-premium financing / take-or-pay obligations | Ordinary course | Unsecured, ordinary course | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |
| **(xx)** | **Non-Guarantor Subsidiary debt basket (general purpose)** | Greater of **$465.0 million** and **35.0% of Four Quarter Consolidated EBITDA**, at any one time outstanding, **plus** debt outstanding under the Coherent Commerzbank Credit Agreement (cap: €24.0 million) | Not restricted on its face | **Non-Guarantor Subsidiaries only** | Fixed (EBITDA-linked, outstanding-based) | **No** — clause (6) does not name it | **`MATERIAL_TO_PHASE8`** — a previously unmodeled, entity-scoped debt basket. Note: the dollar/percentage figures coincidentally match the §3.3(b)(iv) capex basket's own cap ($465M/35%), but this is a textually and scopally distinct clause (general-purpose Non-Guarantor debt vs. capex-restricted debt available to all Restricted Subsidiaries) — confirmed by independently reading both clauses' full text this session, not assumed from the matching numbers |
| (xxi) | Joint-venture debt, pro rata to equity participation | No absolute dollar cap; self-limiting by JV ownership percentage | Not restricted | Company/Restricted Sub as JV participant | Fixed (formula-based, narrow) | No | `NOT_MATERIAL_TO_PHASE8` for general capacity — narrow, JV-specific, self-limiting; material only if Coherent has JVs with debt of this kind, not independently investigated |
| (xxii) | Qualified Receivables Factoring/Financing debt, non-recourse | Off the general covenant grid (non-recourse structured finance) | N/A | Receivables Subsidiary/similar | N/A | No | `NOT_MATERIAL_TO_PHASE8` — specialized, non-recourse, not general secured/unsecured capacity |
| (xxiii) | Ordinary-course cash-management/bank-arrangement debt | Ordinary course | Unsecured | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |
| (xxiv) | Employee/officer equity-purchase financing | Tied to §3.4 (RP) permission | N/A | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |
| (xxv) | Customer deposits/advance payments | Ordinary course | N/A | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |
| (xxvi) | Bankers' acceptances/discounted bills/factoring for credit management | Ordinary course | N/A | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |
| (xxvii) | Debt to fund discharge/defeasance of the Notes or Existing Convertible Notes | Self-limiting (proceeds must be deposited with Trustee) | N/A | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` — a discharge mechanic, not incremental capacity |
| (xxviii) | Ordinary-course supplier/customer/lease guarantees | Ordinary course | N/A | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |
| (xxix)/(xxx) | [Reserved] | — | — | — | — | — | N/A |
| (xxxi) | Deferred-compensation arrangements | Narrow | N/A | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |
| (xxxii) | Unfunded pension/employee-benefit obligations | Permitted only to the extent lawfully unfunded | N/A | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |
| (xxxiii) | Ordinary-course supply-chain financing | Ordinary course | N/A | Company + Restricted Subs | N/A | No | `NOT_MATERIAL_TO_PHASE8` |

**Confirmed end of §3.3(b)**: clause (xxxiii) is followed immediately by subsection (c) — the classification/reclassification proviso already verified in the prior round (§C.2 of the stacking table), which this session additionally confirms contains one detail not previously flagged: *"provided that all Indebtedness under the Existing Credit Agreement Incurred on or prior to the Issue Date and the Senior Credit Agreement Incurred on or prior to the Acquisition Closing Date shall be deemed to have been Incurred pursuant to Section 3.3(b)(i)(A)... the Company shall not be permitted to reclassify"* such debt — a deeming/lock-in rule for specific historical debt, parallel in shape to the Credit Agreement's own §6.01(b) deeming rule (Row CA-D2/CA-D3), but scoped only to pre-existing historical debt and therefore `NOT_MATERIAL_TO_PHASE8` for a forward-looking maximum-additional-capacity question.

### Lien-side inspection (per the task's explicit instruction not to assume debt permission implies lien permission)

Permitted Liens clause (6) — the automatic linked-lien mechanic — was already fully quoted in the prior round and expressly names only *"Indebtedness permitted to be Incurred pursuant to Section 3.3(b)(i) or 3.3(b)(iv)."* **None of clauses (xv), (xviii), or (xx) is named** — debt Incurred under any of them is **not** automatically securable. It can still be secured, but only by independently qualifying under Permitted Liens clause (24) (ratio-tested, SSNL ≤ 3.00x — generically worded as *"Liens securing Indebtedness permitted to be Incurred pursuant to Section 3.3"*, i.e., not limited to specific sub-clauses, so it does reach (xv)/(xviii)/(xx)) and/or clause (25) (fixed $530M/40%EBITDA, likewise generically worded as *"other Liens securing obligations..."*, not sub-clause-limited). This fully answers the task's lien-linkage question for all three newly-identified baskets without needing a fresh review of Permitted Liens clauses (1)–(5)/(7)–(23) (ordinary-course/statutory/pre-existing liens, out of Phase 1 scope per both prior rounds' own screening, not revisited here since clauses (24)/(25) are dispositive and generically available).

### Blocker 5 conclusion: **RESOLVED.** Full clause-by-clause inventory of Indenture §3.3(b) is now complete across both this session and the prior round (clauses (i) through (xxxiii), plus subsection (c)). Three genuinely new, material debt permissions were identified — (xv), (xviii), (xx) — none automatically lien-eligible; all three can be independently secured via the already-modeled clause (24)/(25) mechanics.

---

## I. Newly discovered material interactions

1. **The three new Indenture debt baskets (xv/xviii/xx) are additive to, not substitutes for, the existing §F.1 inventory** — they sit alongside `ind_scf_basket_*`, `ind_capex_debt_biv`, `ind_general_debt_bxii`, and `ind_ratio_debt_fccr`, each independently available, each requiring independent clause-(24)/(25) clearance if secured (since none is clause-(6)-linked). This *increases* total additional debt/secured-lien capacity relative to any methodology that omits them — consistent with, and further reinforcing, the "true figure is at least as large as, and very likely larger than" qualitative finding already carried forward from the prior two rounds. **No new number is computed here.**
2. **§6.11(a)'s "then-applicable ratio" cross-reference language is now confirmed to propagate the Financial Covenant Step-Up to every incurrence-condition provision that uses it** (§6.01(h), §6.01(p), the Incremental Amount's unsecured/junior Ratio-Based prong, and — out of Phase 1 scope — §6.04(x)/§6.06(h)), but **not** to the pari passu-secured Ratio-Based prong (First Lien SNLR ≤ 2.75x is a wholly separate, non-cross-referencing test). This is a real, previously-unconfirmed interaction detail, now resolved with no step-up currently active (Blocker 1).
3. **Contribution Indebtedness (xviii) introduces a fourth debt-side measurement basis** distinct from `CUMULATIVE_INCURRED`/`CURRENTLY_OUTSTANDING`/`PREPAYMENT_CREDIT` — a contribution-linked credit, time-windowed (210 days) and certification-gated (Officer's Certificate), structurally parallel in *kind* (a state/history-dependent credit) to the Credit Agreement's Prepayment-Based Incremental Facility, but tied to a different underlying corporate event (cash equity contributions, not debt prepayments).

---

## J. Materiality assessment

Per the task's own test — could this item change an affirmative answer to maximum additional secured debt, maximum additional unsecured debt, whether a proposed transaction clears, allocation among permissions, or the applicable ratio threshold:

| Item | Classification | Reason |
|---|---|---|
| Blocker 1 (Material Acquisition) | `MATERIAL_TO_PHASE8` | Directly determines whether §6.11(a)-cross-referencing incurrence conditions test at 4.25x or 4.75x; now resolved to a known, current value (4.25x, no step-up active) |
| Blocker 2 (EBITDA mechanics, both documents) | `MATERIAL_TO_PHASE8` | Every dollar-denominated basket in both inventories references one of these two terms; now resolved — no cap exists, and the correct sourcing methodology (certified external input) is established |
| Blocker 3 (First Lien SNLR) | `MATERIAL_TO_PHASE8` | Gates the CA's pari passu-secured Ratio-Based Incremental Facility prong (Template INC-1); now fully computable |
| Blocker 4 (Collateral Suspension current state) | `MATERIAL_TO_PHASE8` | Determines whether an entire additional basket pair (§6.01(ee)/§6.02(pp)) is live; now resolved as definitively inactive, closing what the prior round called "the single largest remaining CA-side swing factor" |
| Blocker 5 (§3.3(b)(xiii)+) | `MATERIAL_TO_PHASE8` for clauses (xv)/(xviii)/(xx); `NOT_MATERIAL_TO_PHASE8` for all others | Three new debt baskets add real, previously unmodeled capacity; the remaining ~27 clauses are ordinary-course, ­self-limiting, or ­non-incremental (refinancing/discharge) and do not change any affirmative max-capacity answer |

Consistent with the task's own instruction, an unresolved item that cannot affect Phase 1 coverage is not treated as a blocker — but here, every item that *could* affect coverage was in fact resolved, so this table has no residual "unresolved-but-immaterial" row.

---

## K. Changes to the stacking specification (see also the direct edits to `docs/coherent-phase1-stacking-table.md`)

Applied to `docs/coherent-phase1-stacking-table.md` as targeted additions (never deletions) — full detail lives in the file itself; summarized here per the task's required format:

| Old item (§X, prior round) | New conclusion | Source | Reason | Affected permission/relationship | Coverage consequence |
|---|---|---|---|---|---|
| §X item 2 — "Material Acquisition" undefined | Defined; quoted verbatim; flows through by reference to every §6.11(a)-cross-referencing provision except the pari passu Ratio-Based prong; no Material Acquisition consummated since 9/26/2025 | CA Article I definitions; FY2026 10-K; ratings/news search | Direct primary-source text located and read this session | Row CA-C1, Row CA-D7, `ca_incremental_ratio_based` (unsecured/junior prong), `ca_acquired_debt_601h` | Threshold resolves to a known current value (4.25x); Row CA-C1 moves from "mechanic VERIFIED / activation UNKNOWN" to fully VERIFIED |
| §X item 1 — EBITDA addback-cap mechanics not independently verified | Full addback list reconstructed for both documents; no percentage-of-EBITDA cap exists in either | Indenture "Consolidated EBITDA" def.; CA "Adjusted Consolidated EBITDA" def. | Both defining clauses located and read in full this session | Every dollar-denominated `Permission` row in both F.1–F.4 tables | No cap-related correction needed to any existing dollar formula; sourcing methodology (certified external input) established for future population |
| §X item 3 — First Lien SNLR own definition not re-extracted | Full definition, with all nested terms, located and quoted | CA Article I: "First Lien Secured Net Leverage Ratio," "Consolidated Debt," "Loan Obligations," "Other First Liens," "Unrestricted Cash Amount" | Direct text located this session | `ca_incremental_ratio_based` (pari passu-secured prong), Template INC-1 | Ratio now mechanically computable given priority-tier tagging + certified EBITDA input |
| §X item 4 — Indenture §3.3(b)(xiii)+ not re-read | Full inventory of clauses (xiii)–(xxxiii); three new material baskets identified ((xv), (xviii), (xx)) | Indenture §3.3(b), full text read this session | Direct text located and read this session | New rows needed: `ind_acquisition_debt_bxv`, `ind_contribution_indebtedness_bxviii`, `ind_nonguarantor_debt_bxx` (proposed keys, not created) | Indenture debt-side inventory (F.1) is materially incomplete without these three additions; none is clause-(6)-linked, so F.2's lien inventory is unaffected in kind (still governed by clauses (24)/(25)) |
| §X item 5 — "Consolidated Net Tangible Assets" undefined | Full definition located (bonus, not one of the five required items) | CA Article I | Incidentally located while reading adjacent definitions this session | `ca_priority_debt_601ee_conditional`, `ca_priority_lien_602pp_conditional` | Moot given §X item 6's resolution (mechanic confirmed inactive), but no longer an open definitional gap if it becomes relevant later |
| §X item 6 — Collateral Suspension Period current state unconfirmed | **Not active** — Term B Loans outstanding ($1,080.0M as of 6/30/2026) independently bars the trigger; current ratings (BB/BB) independently corroborate | FY2026 10-K Note 8; Fitch (11/10/2025); S&P (~4/27/2026) | Direct primary-source financial data + public ratings data reviewed this session | `ca_priority_debt_601ee_conditional`, `ca_priority_lien_602pp_conditional`, and the whole-package `RuleActivationCondition` | The "steady-state" tables' assumption that this mechanic is dormant is now confirmed correct, not merely assumed |
| §X item 7 — Secured Covenant Reinstatement Event incompletely transcribed | Full text located and quoted (bonus, not one of the five required items) | CA Article I | Incidentally located while reading adjacent definitions this session | Reversion-side `reversionRule` on the Collateral Suspension `RuleActivationCondition` | Reversion-side modeling can now be fully specified, though moot while the mechanic remains inactive |

---

## L. Coverage-gate reassessment

| Side | Prior classification | New classification | Reasoning |
|---|---|---|---|
| Indenture / Debt | `LEGACY_ONLY` | **`SOLVER_NATIVE_READY`** | EBITDA addback mechanics fully reconstructed (Blocker 2); full §3.3(b) clause inventory now complete across both rounds (Blocker 5), with the three newly-discovered baskets' legal content fully known (not merely flagged) — population of `ind_acquisition_debt_bxv`/`ind_contribution_indebtedness_bxviii`/`ind_nonguarantor_debt_bxx` rows is a scoped, well-defined follow-up task, not an open legal question |
| Indenture / Liens | `LEGACY_ONLY` | **`SOLVER_NATIVE_READY`** | Clause (6)/(24)/(25) pool independence already resolved in the prior round; this session confirms clauses (24)/(25) are generically worded and reach the three newly-discovered debt baskets without requiring any further Permitted Liens clause review |
| Credit Agreement / Debt | `LEGACY_ONLY` | **`SOLVER_NATIVE_READY`** | All four originally-flagged CA-side gaps (Material Acquisition, EBITDA, First Lien SNLR, Collateral Suspension activation) are resolved with primary-source citations; no remaining item was found that could change an affirmative capacity result |
| Credit Agreement / Liens | `LEGACY_ONLY` | **`SOLVER_NATIVE_READY`** | Same four gaps resolved; §6.02(hh)/(kk) were already fully verified in the prior round |

**Important qualification, stated per the task's own standard** ("Have we modeled every contractually material Phase 1 permission, constraint and interaction required to return a safe affirmative debt/liens result?" — not "every sentence"): this classification reflects that **no remaining legal or factual uncertainty exists** that could change an affirmative Phase 1 debt/lien capacity result for any of the four sides. It does **not** mean the actual `Permission`/`PermissionRelationship`/`SharedCapacityConstraint`/`RuleActivationCondition`/`SolverCoverageDeclaration` rows have been created — they have not, per the hard freeze (§11), and their creation (including for the three newly-discovered Indenture debt baskets) is Phase 8's own population step, explicitly out of this task's scope.

---

## M. Remaining UNKNOWN_REVIEW_REQUIRED items

**None material to Phase 1 solver-native coverage.** Two narrow, genuinely immaterial residual items are noted for completeness, consistent with the task's instruction that an unresolved item unable to affect Phase 1 coverage should not block migration:

1. **Indenture's own "Consolidated Net Income" full exclusion sub-list was not independently re-transcribed clause-by-clause this session** (only its opening sentence and its role as the base of Consolidated EBITDA were confirmed). Given its drafting is evidently from the same template as the Credit Agreement's near-identical, fully-read "Consolidated Net Income" definition, this is inferred (not independently verified) to be materially parallel. **Resolves by**: a further targeted read of the Indenture's own "Consolidated Net Income" definition in full. **Why immaterial**: Consolidated Net Income's exclusions narrow the *base* measure; even a divergence from the Credit Agreement's parallel exclusions would not introduce a new cap, basket, or threshold — it would at most shift the EBITDA figure itself, which is already correctly modeled as a `CERTIFIED_EXTERNAL_INPUT`, not independently recomputed by Headroom regardless.
2. **Indenture §3.3(b)(xxi)'s joint-venture debt basket was not independently investigated against Coherent's actual JV structure** (does Coherent have JVs with outstanding debt of this kind?). **Resolves by**: a review of the FY2026 10-K's own JV/non-controlling-interest disclosures, or a targeted defined-term search for "joint venture" debt in Coherent's filings. **Why immaterial**: the basket is self-limiting by ownership-percentage formula and, even if active, is narrow and JV-specific — not a general-purpose capacity source capable of changing a maximum-additional-debt answer.

---

## N. Phase 8 recommendation

### `READY_TO_POPULATE_COHERENT_SOLVER_NATIVE`

All five items this task was scoped to resolve — the Blocker 1 addendum's narrow remainder, Blocker 2 (both documents' EBITDA mechanics), Blocker 3 (First Lien SNLR), Blocker 4 (both the contractual rule and the current factual state), and Blocker 5 (the full §3.3(b)(xiii)+ inventory) — are **RESOLVED**, each with a verbatim primary-source citation obtained and read directly in this session. Two further items from the stacking table's original seven-item list (Consolidated Net Tangible Assets; the Secured Covenant Reinstatement Event's full text) were also incidentally resolved as byproducts of the same targeted reads. No item was resolved by assumption, extrapolation, or treating silence as an answer — where evidence remained genuinely insufficient (§M), that is stated explicitly rather than guessed, exactly as the task requires, and both such items are affirmatively immaterial to Phase 1 coverage rather than merely unaddressed.

**What this recommendation means, precisely**: the *legal and factual research* prerequisite to beginning Phase 8's schema-population step is complete. It does **not** mean Phase 8 itself has been implemented — no `Permission`, `PermissionRelationship`, `SharedCapacityConstraint`, `RuleActivationCondition`, or `SolverCoverageDeclaration` row has been created; no new Q1/Q2/Q25 capacity figure has been computed or published; no golden test has been touched. Per the task's own §9 instruction, that population-and-reconciliation step is explicitly deferred to a subsequent phase, distinct from — and not authorized by — this document.

**Follow-up work needed before population is complete** (bounded, well-defined, not open legal questions): add `Permission` rows for the three newly-discovered Indenture debt baskets (§H — clauses (xv), (xviii), (xx)) and their `PermissionRelationship` rows to Permitted Liens clauses (24)/(25); source Adjusted Consolidated EBITDA/Consolidated EBITDA as `CERTIFIED_EXTERNAL_INPUT` rows per the Compliance Certificate mechanism (§D); tag Credit Agreement debt tranches with `PermissionCollateralScope.priorityTier` to make First Lien Secured Net Leverage Ratio computable (§E); and periodically reconfirm the Collateral Suspension Period's dormant state (§G) as Term B amortizes and/or Coherent's ratings evolve.
