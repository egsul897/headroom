# Headroom golden_tests — full export (30 rows)

Coherent Corp. (`coherent`). All 30 rows currently have `status = UNVERIFIED` — none has been through lawyer review yet. This is the full, current content of the `golden_tests` table, one entry per row, in insertion order.

---

## 1. What is the maximum additional secured debt Coherent could incur today?

- **Query type:** CROSS_DOCUMENT_CAPACITY
- **Expected answer:** 4041.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q1. Indenture's MILA secured prong (§3.3(b)(i)(C), SSNL ≤ 3.00x) binds at $4,041M; Credit Agreement's own ceiling here is $5,129M, looser and not binding.

---

## 2. What is the maximum additional unsecured debt Coherent could incur today?

- **Query type:** CROSS_DOCUMENT_CAPACITY
- **Expected answer:** 5129.000000
- **Binding provision:** ca_leverage_cap
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q2. Credit Agreement's §6.11(a) maintenance leverage covenant (TNL ≤ 4.25x) binds at $5,129M; indenture's own ceiling is ~$10,154M, looser.

---

## 3. Which document and provision binds the secured-capacity answer (Q1)?

- **Query type:** CROSS_DOCUMENT_CAPACITY
- **Expected answer:** 4041.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q3. The Indenture's Permitted Liens cl. (24) / MILA secured prong (SSNL ≤ 3.00x) - tighter than the Credit Agreement because the 3.00x secured test bites before the 4.25x total-leverage test does, at Coherent's current secured/unsecured mix.

---

## 4. Which document and provision binds the unsecured-capacity answer (Q2)?

- **Query type:** CROSS_DOCUMENT_CAPACITY
- **Expected answer:** 5129.000000
- **Binding provision:** ca_leverage_cap
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q4. The Credit Agreement's §6.11 Financial Covenants (TNL ≤ 4.25x) - tighter than the indenture's own unsecured ceiling (FCCR ≥ 2.00x / TNL ≤ 5.00x under MILA).

---

## 5. Is $100M of new secured debt permitted? Under which test?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q6. FCCR-based Ratio Debt (§3.3(a)) would cover it many times over; at this size every prong clears trivially.

---

## 6. Is $250M of new secured debt permitted?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q7.

---

## 7. Is $500M of new secured debt permitted?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q8. Still well inside the $4,041M ceiling from Q1.

---

## 8. Is $1,000M ($1B) of new secured debt permitted?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q9. Still under the $4,041M ceiling - leaves $3,041M of secured headroom remaining afterward.

---

## 9. Is $100M of new unsecured debt permitted?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** ca_leverage_cap
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q10.

---

## 10. Is $250M of new unsecured debt permitted?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** ca_leverage_cap
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q11.

---

## 11. Is $500M of new unsecured debt permitted?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** ca_leverage_cap
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q12.

---

## 12. Is $1,000M ($1B) of new unsecured debt permitted?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** ca_leverage_cap
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q13. Still under the $5,129M ceiling from Q2 - leaves $4,129M remaining. None of the Section B checkpoints bind at Coherent's current leverage, which is itself the assertion under test; they don't exercise the blocked path (see v1 Q17/Q23-25 notes).

---

## 13. What is the FCCR threshold for Ratio Debt under the indenture, and is it currently satisfied?

- **Query type:** LEVERAGE_METRIC
- **Expected answer:** 8.947368
- **Binding provision:** ratio_debt_fccr
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q14. Threshold is FCCR ≥ 2.00x (§3.3(a)); currently satisfied at 8.95x.

---

## 14. What is the TNL threshold under the Credit Agreement's financial covenant, and what is the current TNL?

- **Query type:** LEVERAGE_METRIC
- **Expected answer:** 1.232941
- **Binding provision:** ca_leverage_cap
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q15. Threshold is ≤ 4.25x (§6.11); current TNL is 1.23x - substantial headroom. (Net debt $2,096M / EBITDA $1,700M.)

---

## 15. What is the SSNL threshold applicable to secured incurrence under the indenture, and what is the current SSNL?

- **Query type:** LEVERAGE_METRIC
- **Expected answer:** 0.622941
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q16. Threshold is ≤ 3.00x (MILA secured prong / Permitted Liens cl. (24)); current SSNL is 0.62x.

---

## 16. At what level of incremental secured debt would the indenture's SSNL test first become the binding constraint - spot check at $2,000M

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q17, partial coverage. The full question asks whether the indenture is binding across the ENTIRE $0-$4,041M range - that's a continuous claim this harness cannot prove with point checks. This row and the next one are spot checks (at $2,000M and at the $4,041M ceiling itself) confirming the indenture stays binding at those two points; manually confirmed via a one-off script that it also holds at $0/$1,000/$3,000/$4,000M. Not a substitute for a real proof across the range - flagged per the source doc's own note that this question is a priority for lawyer review.

---

## 17. At what level of incremental secured debt would the indenture's SSNL test first become the binding constraint - spot check at the $4,041M ceiling

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q17, partial coverage (see previous row). At exactly the stated ceiling, still clear and still bound by mila_secured.

---

## 18. What is the size of the indenture's Credit Facilities basket (flat component), and how much is currently used?

- **Query type:** PROVISION_CAPACITY
- **Expected answer:** 1779.000000
- **Binding provision:** facility_flat
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q18. $4,000M flat (§3.3(b)(i)(A)), net of the $2,221M TLA+TLB currently outstanding, leaves $1,779M unused - before the $1,700M grower component (§3.3(b)(i)(B), not netted) is even counted.

---

## 19. What is the size of the general debt basket under §3.3(b)(xii), and is any of it currently used?

- **Query type:** PROVISION_CAPACITY
- **Expected answer:** 680.000000
- **Binding provision:** general_debt
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q19. Greater of $530M and 40% of EBITDA ($1,700M x 40% = $680M). No usage currently modeled/observed in public filings.

---

## 20. What is the size of the general liens basket, separate from the ratio-based lien capacity?

- **Query type:** PROVISION_CAPACITY
- **Expected answer:** 680.000000
- **Binding provision:** lien_general
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q20. Same formula as Q19 (greater of $530M / 40% EBITDA) but a distinct basket under Permitted Liens cl. (25).

---

## 21. What is the MILA formula for unsecured debt, and what is the current dollar figure (the looser, controlling prong)?

- **Query type:** DOCUMENT_CAPACITY
- **Expected answer:** 10153.846000
- **Binding provision:** ratio_debt_fccr
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q21. Unsecured prong is TNL ≤ 5.00x OR FCCR ≥ 2.00x (either sufficient) - TNL-based gives $6,404M, FCCR-based gives ~$10,154M; the FCCR prong is looser and controls the indenture's own (document-level, not cross-document) unsecured ceiling.

---

## 22. If Coherent incurs $500M of new secured debt today, what secured capacity remains immediately afterward, and under which provision?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 3541.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** v1 Q22. $4,041M - $500M = $3,541M remaining, still bound by the same indenture SSNL/liens test (pro forma SSNL rises to roughly 1.00x, still well under the 3.00x ceiling). `remainingAfterAmount` is a metric computed only inside golden-test.ts (overallCapacity - amount), not a field on the engine's own simulation result - reflects the PRE-transaction binding document/capacity, not a re-run against pro forma financials. || v1 Q23-Q25 (chained scenarios) are NOT executable golden rows - simulateDebtIncurrence has no pro-forma-composition API. Manually verified via scripts/verify-sequential-transactions.ts (committed to the repo): Q23 - pro forma after the $500M secured incurrence above, a further $2,000M unsecured incurrence is CLEAR, bound by ca_leverage_cap, pro forma TNL 2.70x. Q24 - pro forma after both Q22 and Q23 (TNL 2.70x, SSNL 0.92x), a $300M TLB (secured) repayment moves TNL to 2.53x, SSNL to 0.74x, and increases indenture secured capacity by $300M (3,541 -> 3,841), CA secured capacity by $300M (2,629 -> 2,929), AND facility_flat (a FLAT_NET_OF_DEBT basket, not a ratio test) by the same $300M (1,279 -> 1,579). Finding: this refines v1's own Q24 framing - a FLAT_NET_OF_DEBT basket nets directly against outstanding secured debt and DOES move dollar-for-dollar with a repayment, same magnitude as the ratio tests; the doc's claim that a 'fixed-dollar basket' does not restore only holds for baskets with no debt-outstanding term in their formula (e.g. GREATER_OF_FLAT_OR_PCT_EBITDA). Q25 (solve for the EBITDA growth needed to unlock +$500M more) needs a genuine solve-for-X capability the engine does not have - not attempted.

---

## 23. Can Coherent incur $1,000M of secured debt without breaching either document, and if so what does pro forma total net leverage become?

- **Query type:** DEBT_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** mila_secured
- **Status:** UNVERIFIED
- **Reviewer notes:** 1 = cleared (true). $1,000M is well under the $4,041M binding MILA secured-prong capacity.

---

## 24. If Coherent redesignates Silicon Carbide LLC from a Restricted Subsidiary to an Unrestricted Subsidiary, how does that change secured debt capacity?

- **Query type:** OUT_OF_SCOPE
- **Expected answer:** (none — status/binding check only)
- **Binding provision:** (none)
- **Status:** UNVERIFIED
- **Reviewer notes:** Restricted/Unrestricted Subsidiary redesignation mechanics are explicitly out of scope for this phase - flagged rather than attempted, per instructions. Revisit once redesignation is in scope.

---

## 25. What is the Credit Agreement's own secured debt capacity, considered on its own?

- **Query type:** DOCUMENT_CAPACITY
- **Expected answer:** 5129.000000
- **Binding provision:** ca_leverage_cap
- **Status:** UNVERIFIED
- **Reviewer notes:** Document-level (not cross-document) capacity - the §6.11(a) TNL maintenance covenant binds at $5,129M, tighter than the interest-coverage covenant's $7,538M.

---

## 26. Can Coherent pay a $200M dividend under the indenture, given the $150M already committed against the RP pool this quarter?

- **Query type:** RP_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** rp_builder
- **Status:** UNVERIFIED
- **Reviewer notes:** Tests nonzero historical ledger usage: the builder basket already has $150M drawn (see the illustrative ledger fixture), leaving $2,685M - still enough to cover $200M on its own.

---

## 27. Can Coherent pay a $3,000M dividend under the indenture without tripping the ratio prong?

- **Query type:** RP_SIMULATION
- **Expected answer:** 0.000000
- **Binding provision:** rp_general
- **Status:** UNVERIFIED
- **Reviewer notes:** $3,000M spills past the (already $150M-drawn) builder basket into the general RP basket, which covers the rest - $0 unallocated, general basket is the binding constraint.

---

## 28. Can Coherent make a $6,000M Investment under the indenture's unlimited ratio prong?

- **Query type:** RP_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** inv_ratio_gate
- **Status:** UNVERIFIED
- **Reviewer notes:** $6,000M exceeds both fixed baskets combined, so the unlimited ratio-gated basket (TNL <= 3.50x for Investments) has to open to cover the rest - it does, since TNL is currently 1.23x.

---

## 29. If Coherent sells $300M of assets and does not reinvest the proceeds, is a mandatory Asset Sale Offer triggered?

- **Query type:** ASSET_SALE_SIMULATION
- **Expected answer:** 1.000000
- **Binding provision:** asset_sale_threshold
- **Status:** UNVERIFIED
- **Reviewer notes:** $300M net proceeds, not reinvested, exceeds the $42.5M Excess Proceeds threshold (greater of $35M / 2.5% EBITDA) - offer is required.

---

## 30. Is a dividend from Coherent tested against the Credit Agreement's own Restricted Payments covenant here?

- **Query type:** RP_SIMULATION
- **Expected answer:** (none — status/binding check only)
- **Binding provision:** (none)
- **Status:** UNVERIFIED
- **Reviewer notes:** Fail-closed check: the Credit Agreement has its own separate Restricted Payments covenant (§6.06) per its caveat, but no basket configuration for it has been entered - the engine must report not_tested here, never silently fall back to the indenture's numbers or to "unlimited."

---

