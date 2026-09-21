# Phase-3 V3.1 — Primary-Source Benchmark Integrity Audit

## A. Executive Verdict

**PHASE3_V3_1_BENCHMARK_REQUIRES_CORRECTION**

The 47-case measuring instrument is **not** presently trustworthy enough to settle Phase-3 closure. Four
of the 47 ground-truth claims are materially wrong against the primary legal sources, and the packet's
source-evidence layer is substantially weaker than its own metadata claims. The instrument is not
broadly broken — 39 of 47 claims verify exactly against source — but the defects are concentrated in
exactly the places a benchmark is supposed to be hardest: conditions that gate otherwise-unlimited
capacity.

The positive control was reproduced independently and is confirmed.

## B. Counts

| Classification | Count |
|---|---|
| BENCHMARK_VERIFIED | 39 |
| BENCHMARK_DEFECT | 4 |
| BENCHMARK_IMPRECISE_NONMATERIAL | 2 |
| BENCHMARK_SOURCE_UNRESOLVED | 2 |
| BENCHMARK_AMBIGUOUS | 0 |
| **Total** | **47** |

Primary source located and inspected for **45 of 47** cases.

## C. 47-Row Table

| caseId | document | section | classification | defect type | material? | source verified? | correction required? |
|---|---|---|---|---|---|---|---|
| CASE-32a8d38224 | fwrg | 6.01(g)(i) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-e3520246bd | fwrg | 6.04(a)(xi) | BENCHMARK_DEFECT | invented negative condition | YES | yes | YES |
| CASE-99ee6598d1 | fwrg | 6.04(a)(iii)(A)-(B) | BENCHMARK_IMPRECISE_NONMATERIAL | election mechanic flattened to "plus" | no | yes | no |
| CASE-dd0a814e53 | fwrg | 6.01(m) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-0f6ac984b3 | fwrg | 6.04(a)(x) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-ca1109d4da | fwrg | 6.02(a) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-5a537d2858 | fwrg | 6.01(j) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-7b607feb5f | fwrg | Article 1 (Consolidated Adjusted EBITDA) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-9001417020 | fwrg | 6.04(b)(iv) | BENCHMARK_DEFECT | missing condition | YES | yes | YES |
| CASE-2034884b7a | lsb | 6.03 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-a898053843 | lsb | 6.04(a) | BENCHMARK_DEFECT | mis-scoped rule | YES | yes | YES |
| CASE-7fd6c57745 | lsb | 6.01(m) | BENCHMARK_IMPRECISE_NONMATERIAL | entity scope narrowed; "existing" added | no | yes | no |
| CASE-e4e5c887fb | lsb | 6.01(i) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-57227cc234 | lsb | 6.01 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-1284ab8e71 | lsb | 6.08 | BENCHMARK_DEFECT | missing condition + incomplete enumeration | YES | yes | YES |
| CASE-c8f9a9b5c0 | lsb | 6.04(b) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-466dbaa257 | lsb | Article 1 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-16a7d152b6 | lsb | 6.02 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-b2658c02e7 | conmed-doc-a-eighth-ar-credit-agreement | 7.1 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-0c169f38c3 | conmed-doc-a-eighth-ar-credit-agreement | 7.2(c) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-579c5d3f33 | conmed-doc-a-eighth-ar-credit-agreement | 7.10 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-b38c3b48eb | conmed-doc-a-eighth-ar-credit-agreement | 7.2 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-d32081582b | conmed-doc-a-eighth-ar-credit-agreement | 7.13 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-55163b4198 | conmed-doc-a-eighth-ar-credit-agreement | 7.16 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-9948558e99 | conmed-doc-a-eighth-ar-credit-agreement | 7.11 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-963cc44044 | conmed-doc-a-eighth-ar-credit-agreement | 7.14 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-9a30560f37 | conmed-doc-a-eighth-ar-credit-agreement | 7.17 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-2aa00d5566 ⚠excerpt | doc-a | 6.01 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-b9ca777174 ⚠excerpt | doc-b | 6.01 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-8c29f13dc0 ⚠excerpt | doc-d | 6.01 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-641203d620 | doc-a | 6.04 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-e008d4278a | doc-b | 6.04 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-30db965277 | doc-d | 6.04 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-88cfbb3bb8 ⚠excerpt | doc-a | 6.05 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-5a66cad386 ⚠excerpt | doc-b | 6.05 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-393f8732d2 ⚠excerpt | doc-d | 6.05 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-3e2b123d74 ⚠excerpt | doc-a | 6.05 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-90415d6765 | doc-a | 6.08(b) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-8de9def8ca | doc-d | 6.08(b) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-5ac1cd56ef | doc-a | 6.10 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-a57ab21f38 | doc-a | 1.04 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-166617b06a | doc-a | 1.11 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-d2514bfbe7 | doc-a | 10.01(a) | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-5c33066800 | doc-a | 1.01 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-768547a920 | doc-a | 1.01 | BENCHMARK_VERIFIED | — | — | yes | no |
| CASE-e555117f4c ⚠excerpt | doc-a | 1.01 | BENCHMARK_SOURCE_UNRESOLVED | add-back COUNT not locatable in extraction | undetermined | partial | no |
| CASE-4a1c6a48a0 ⚠excerpt | doc-a | 6.04 | BENCHMARK_SOURCE_UNRESOLVED | claimed flush language not locatable | undetermined | partial | no |

⚠excerpt = the packet's `sourceExcerpt` does not contain text supporting the claimed provision (9 cases). This is an
evidence-layer defect, separate from the claim's own correctness.

## D. Detailed Defects

### CASE-e3520246bd — `fwrg-6.04-a-xi` (fwrg §6.04(a)(xi))

**Defect:** INVENTED_NEGATIVE_CONDITION (the claim affirmatively asserts the ABSENCE of a condition the source imposes)

**What the benchmark says:** Unlimited (uncapped-dollar) Restricted Payments so long as the Total Rent Adjusted Net Leverage Ratio, calculated Pro Forma, would not exceed a fixed ratio - a ratio-gated unlimited basket with no default condition attached. 3.50:1.00 Total Rent Adjusted Net Leverage Ratio, Pro Forma Basis The single most dangerous plausible extraction error in this whole package: an extractor that reports a dollar threshold (or omit

**What the source actually says:**

> "(xi) so long as no Event of Default exists, the Borrower may make Restricted Payments so long as the Total Rent Adjusted Net Leverage Ratio, calculated on a Pro Forma Basis, would not exceed 3.50:1.00 as of the last day of the most recently ended Test Period;"
>
> — *fwrg Article 6, Section 6.04(a), clause (xi)* (SOURCE_CONTRADICTED)

**Why it matters:** A Headroom representation that CORRECTLY emits a NO_DEFAULT condition on this basket would be scored as adding a condition the benchmark says does not exist — a correct representation marked wrong. Conversely a representation that omits the gate would be marked right. Both directions are wrong, and the second is the dangerous one: it would certify as accurate a model that lets the borrower pay dividends during an Event of Default.

### CASE-9001417020 — `fwrg-6.04-b` (fwrg §6.04(b)(iv))

**Defect:** MISSING_CONDITION (no-Event-of-Default gate omitted)

**What the benchmark says:** Restricted Debt Payments (early/voluntary paydown of subordinated/junior/unsecured debt above a size threshold) permitted up to the greater of a fixed dollar amount and a % of EBITDA, with an explicit cross-basket offset against the 6.04(a)(x) Restricted Payments basket. $21,000,000; 35% of Consolidated Adjusted EBITDA The cross-basket offset ('any amount utilized ... shall result in a reduction in the amount availab

**What the source actually says:**

> "(iv) so long as no Event of Default exists, Restricted Debt Payments in an aggregate amount not to exceed (A) ..."
>
> — *fwrg Article 6, Section 6.04(b), clause (iv)* (SOURCE_CONTRADICTED)

**Why it matters:** Same mechanism: a correct NO_DEFAULT condition on 6.04(b)(iv) would read as an invented condition; an omission would read as correct.

### CASE-a898053843 — `lsb-6.04-a-abl-collateral-disposal` (lsb §6.04(a))

**Defect:** MIS-SCOPED_RULE (a general disposal basket recast as collateral-type-specific; a conditional sub-requirement converted into basket eligibility)

**What the benchmark says:** Disposal of ABL Priority Collateral permitted only if (i) a new Borrowing Base Certificate is delivered demonstrating continued compliance, (ii) sold at Fair Market Value, and (iii) aggregate annual dispositions under this clause do not exceed the greater of $10,000,000 and 1.0% of total consolidated assets. $10,000,000; 1.0% of total consolidated assets Same TOTAL_ASSETS-percentage gap as lsb-6.01-i. Additionally, t

**What the source actually says:**

> "(a) a Loan Party and any Subsidiary of a Loan Party may sell or otherwise dispose of any of its other assets, provided that (i) TO THE EXTENT SUCH DISPOSITION INVOLVES ABL PRIORITY COLLATERAL, the Borrowers shall have ... delivered a new Borrowing Base Certificate ..."
>
> — *lsb §6.04(a)* (SOURCE_CONTRADICTED)

> "delivered a new Borrowing Base Certificate (giving effect to such disposition ...) demonstrating compliance with Section 2.01(a)"
>
> — *lsb §6.04(a)(i)* (SOURCE_PARTIALLY_CONFIRMED)

**Why it matters:** A representation that models 6.04(a) as a general disposal basket — which is what the source says — would be scored as wrong on transaction/collateral scope. A representation that wrongly restricts the basket to ABL Priority Collateral would be scored as right, and would understate the borrower's actual disposal capacity for every non-ABL asset.

### CASE-1284ab8e71 — `lsb-6.08-subordinated-debt-payments` (lsb §6.08)

**Defect:** MISSING_CONDITION + INCOMPLETE_ENUMERATION (anti-stacking proviso on the $500,000 residual basket omitted; carve-out (i) omitted)

**What the benchmark says:** Prohibition on payments of Indebtedness generally (other than the Secured Notes/Secured Obligations), with carve-outs for scheduled payments of permitted debt, refinancing payments, payments of Subordinated Indebtedness only as its own subordination terms allow, Payment-Conditions-gated payments, and a $500,000/year fixed basket; separately, no amendment of Subordinated Indebtedness terms materially adverse to the Le

**What the source actually says:**

> clauses (ii),(iii),(iv),(v),(vi)
>
> — *lsb §6.08(a)* (SOURCE_PARTIALLY_CONFIRMED)

> "(vi) payments of Indebtedness not to exceed $500,000 in the aggregate in any fiscal year of the Loan Parties (IT BEING UNDERSTOOD AND AGREED THAT ANY PAYMENT OF INDEBTEDNESS MADE PURSUANT THIS CLAUSE (VI) SHALL ONLY BE PERMITTED IF SUCH PAYMENT WOULD NOT, AT THE TIME THEREOF, BE PERMITTED (OR BE ABLE TO BE MADE) UNDER ANY OTHER CLAUSE OF THIS SECTION 6.08(A))"
>
> — *lsb §6.08(a)(vi)* (SOURCE_CONTRADICTED)

**Why it matters:** The $500,000 basket's residual character is the whole of its economic meaning. A representation that correctly models it as available only where no other clause permits the payment would be scored against a benchmark that describes it as a free-standing parallel basket.

## E. Headroom Defects Observed Incidentally

**None.** This audit examined the benchmark against primary sources; it did not evaluate Headroom output
and therefore observed no production defect. Critically, the reverse must be stated plainly: for the four
defective cases, **any prior finding of a Headroom defect derived from those ground-truth claims cannot be
relied upon**, because the yardstick was wrong. Specifically, a Headroom representation that correctly
emitted a NO_DEFAULT condition on FWRG §6.04(a)(xi) or §6.04(b)(iv) would have been scored as inventing a
condition, and one that correctly modelled LSB §6.04(a) as a general disposal basket would have been
scored as mis-scoping it. Neither direction was checked in this audit, and neither should be asserted
without re-adjudication against corrected ground truth.

## F. Rubric Ambiguities Observed

1. **Claim-field contamination.** `groundTruthClaim` concatenates the adjudicated legal description with the
   benchmark author's own methodology commentary ("This is a designed adversarial probe for Task 12, not a
   schema issue", "Nomenclature risk, not a schema gap"). Reviewers are asked to adjudicate a field that
   mixes the proposition under test with authoring notes. In CASE-e3520246bd the erroneous assertion sits in
   the substantive half, so this is not merely cosmetic.
2. **Enumeration granularity is undefined.** Claims describe carve-outs with "several", "at least 3" or an
   explicit range ("(a) through (q)"). Nothing tells a reviewer whether an enumeration is a claim under test
   or an informal gloss. CASE-1284ab8e71 turns on precisely this.
3. **Evidence sufficiency is undefined.** The rubric does not say what a reviewer should do when the packet
   supplies no excerpt (27 cases) or a wrong excerpt (9 cases). In practice a reviewer must either trust the
   claim or go outside the packet — and the packet forbids the latter.

## G. Cases Requiring Re-Adjudication

**Claim defects — re-adjudication required after correction (4):**
- `CASE-e3520246bd` (fwrg-6.04-a-xi)
- `CASE-9001417020` (fwrg-6.04-b)
- `CASE-a898053843` (lsb-6.04-a-abl-collateral-disposal)
- `CASE-1284ab8e71` (lsb-6.08-subordinated-debt-payments)

**Evidence repair required before any re-adjudication is meaningful (9):**
- `CASE-2aa00d5566`
- `CASE-5a66cad386`
- `CASE-3e2b123d74`
- `CASE-393f8732d2`
- `CASE-b9ca777174`
- `CASE-4a1c6a48a0`
- `CASE-e555117f4c`
- `CASE-88cfbb3bb8`
- `CASE-8c29f13dc0`

Consensus was **not** recomputed. R1/R2/R3 were **not** modified. No new canonical Phase-3 score was derived.

## H. Phase-3 Closure Effect

**The existing Phase-3 canonical score and closure conclusion cannot safely remain sealed as canonical.**

At least one material benchmark defect — in fact four — could alter scoring. Three of the four sit on
CRITICAL-materiality units, and all four are of the class most likely to flip a judgement: a condition that
gates capacity is either asserted absent when the source imposes it, or omitted, or re-scoped.

Two mitigating facts, stated so the finding is not overread:

- Phase-3 closure was **already** blocked. The standing verdict is `PHASE3_HUMAN_READJUDICATION_REQUIRED`;
  no canonical V3.1 score exists yet, because the 47 cases have never been re-adjudicated under V3.1. This
  audit does not invalidate a score that was ever claimed — it establishes that the instrument must be
  repaired **before** that re-adjudication is commissioned.
- 39 of 47 claims verify exactly. The instrument's problem is localised and fixable, not systemic.

The sequencing consequence is concrete: **do not dispatch the V3.1 reviewer packets as they stand.** Correcting
four claims and repairing nine excerpts costs far less than adjudicating 47 cases against a yardstick that is
wrong in four of them, and re-adjudicating afterwards.

### Incidental scope note

CONMED §7.2 contains an express reclassification election ("the Parent Borrower shall, in its sole discretion,
classify or reclassify, or later divide, classify or reclassify, such item of Indebtedness"). A prior artifact
recorded `NO_RECLASSIFICATION_MECHANISM`; that determination was about the DSGR frozen compile result used as
the Phase-4 fixture, not about CONMED, so there is no contradiction — but the earlier wording "the frozen
package" is narrower than it reads, and is flagged here so it is not over-generalised later.
