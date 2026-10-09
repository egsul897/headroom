# Invariant run @ f45317fe6cfa26ab1c909ea300dc998b6c2bc277

| id | invariant | package | PRODUCT pass/total | observations |
|---|---|---|---|---|
| INV-01 | A hanging proviso qualifies every preceding clause of its section | D | 4/4 | 0 |
| INV-03 | A same-document 'notwithstanding Section X' provision governs the section it names | A | 2/2 | 1 |
| INV-04 | A cap outside the covenant article (Article IX 'notwithstanding anything in Article VII') governs | I | 2/2 | 2 |
| INV-05 | A definition amended by a later amendment changes every dependent provision from the effective date, and nothing else | A | 1/7 | 3 |
| INV-05b | A definition amendment that REMOVES an add-back (false-permission direction), and one layered on a package with two prior amendments | A | 1/5 | 0 |
| INV-06 | An amendment whose effectiveness is conditional is not applied before the condition is evidenced | C | 3/3 | 0 |
| INV-37 | Cache identity: a compiled unit is reusable when its own text and context are unchanged, and never reused when its text changed | A | 2/2 | 1 |
| INV-19 | Only a genuinely circular definition is a definition cycle; a diamond (two paths to one term) is not | A | 1/4 | 1 |
| INV-09 | A 'greater of $X and Y% of metric' basket is computable only with the metric; without it the answer is NEEDS_INPUT or, at most, the fixed floor stated as a floor | F | 3/3 | 0 |
| INV-34 | A transaction effect the runtime does not support is refused explicitly, never applied approximately or ignored | F | 4/4 | 2 |
| INV-19b | Breadth of the false-cycle refusal across the corpus: only genuinely circular definitions may be reported | B | 1/2 | 0 |
| INV-25 | A numeric threshold that triggers a qualitative gate ('in excess of $X … so long as approved') is never a basket cap | L | 3/4 | 1 |
| INV-16 | An Unrestricted Subsidiary designation document is recognised as acting on the indenture, not as a new instrument | B | 0/0 | 2 |
| INV-25b | Breadth of IPV-22: every comparator-introduced figure in the corpus submitted as a cap | H | 2/3 | 0 |

### INV-01 — A hanging proviso qualifies every preceding clause of its section

Legal statement: 7.05's trailing 'provided further that the foregoing shall not permit any Disposition of the Borrower's principal manufacturing facility' qualifies clauses (a)–(l) alike; compiling any clause must see it.

- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] compiling 7.05(a) sees the hanging proviso — as PROVISO item sourced from 7.05(l)
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] compiling 7.05(j) sees the hanging proviso — as PROVISO item sourced from 7.05(l)
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] compiling 7.05(k) sees the hanging proviso — as PROVISO item sourced from 7.05(l)
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] the section-level operative text carries the proviso — operative text 1355 chars

### INV-03 — A same-document 'notwithstanding Section X' provision governs the section it names

Legal statement: A new Section 7.05 reading 'Notwithstanding Section 7.01(b), the aggregate principal amount … shall not exceed $10,000,000 … while any Lien permitted under Section 7.02 is outstanding' restricts 7.01(b); compiling 7.01 and asking about 7.01(b) must bring 7.05 in.

- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] section-level 7.01 bundle carries 7.05 — UNVERIFIED_SIBLING_SIGNAL/CROSS_REFERENCE
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] hybrid closure for a 7.01(b) question includes 7.05 — 7.01,7.02,7.03,7.05
- ❌ [OBSERVATION] clause-level 7.01(b) bundle carries 7.05 (production candidates are section-level; recorded only) — OPERATIVE_SOURCE:7.01(b), PARENT_SCOPE:7.01, UNVERIFIED_SIBLING_SIGNAL:7.01(c), DEFINITION:Default, DEFINITION:Indebtedness

### INV-04 — A cap outside the covenant article (Article IX 'notwithstanding anything in Article VII') governs

Legal statement: 9.15 caps all secured Indebtedness at $25,000,000 notwithstanding Article VII; compiling 7.01 or 7.02 must see 9.15.

- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] section-level 7.01 bundle carries 9.15 — CROSS_REFERENCE
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] section-level 7.02 bundle carries 9.15 — CROSS_REFERENCE
- ❌ [OBSERVATION] clause-level 7.01(b) bundle carries 9.15 (recorded only) — OPERATIVE_SOURCE:7.01(b), PARENT_SCOPE:7.01, DEFINITION:Indebtedness
- ❌ [OBSERVATION] clause-level 7.02(b) bundle carries 9.15 (recorded only) — OPERATIVE_SOURCE:7.02(b), PARENT_SCOPE:7.02, DEFINITION:Indebtedness, CROSS_REFERENCE:7.01(b)

### INV-05 — A definition amended by a later amendment changes every dependent provision from the effective date, and nothing else

Legal statement: Amendment No. 1 (effective 2026-05-01) restates the definition of 'Consolidated EBITDA' to add a stock-compensation add-back. From that date the ratio basket 7.01(c) must be compiled against the new definition; the other definitions in Section 1.01 are untouched; before that date nothing changes.

- ❌ [PRODUCT/WRONG_OPERATIVE_SOURCE] F1: the effect targets the definition (DEFINITION kind or definedTermRef), not the whole of Section 1.01 — effects: SECTION:1.01:REPLACE_TEXT:RESOLVED; instrument OPERATIVE_STATE_RESOLVED
- ❌ [PRODUCT/WRONG_OPERATIVE_SOURCE] F1: operative Section 1.01 at 2026-06-30 still holds the other definitions and the new EBITDA text — 1.01 provision OPERATIVE_STATE_RESOLVED, applied 1, currentText 243 chars (base section 1537 chars)
- ❌ [PRODUCT/WRONG_OPERATIVE_SOURCE] F1: the Consolidated EBITDA definition handed to the compiler at 2026-06-30 is the amended text — DEFINITION_DEPENDENCY: ""Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus,…"
- ✅ [OBSERVATION] F1: at 2026-03-31 no effect is applied — no state computed for 2026-03-31 (manifest as-of dates only)
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F2: either a DEFINITION-kind effect or an unresolved/REVIEW effect (never a silent section replacement) — effects: SECTION:1.01:UNKNOWN_CHANGE:REVIEW_REQUIRED; instrument OPERATIVE_STATE_REVIEW_REQUIRED
- ✅ [OBSERVATION] F2: at 2026-03-31 no effect is applied — no state computed for 2026-03-31 (manifest as-of dates only)
- ❌ [PRODUCT/WRONG_OPERATIVE_SOURCE] F3: the effect targets the definition (DEFINITION kind or definedTermRef), not the whole of Section 1.01 — effects: SECTION:1.01:REPLACE_TEXT:RESOLVED; instrument OPERATIVE_STATE_RESOLVED
- ❌ [PRODUCT/WRONG_OPERATIVE_SOURCE] F3: operative Section 1.01 at 2026-06-30 still holds the other definitions and the new EBITDA text — 1.01 provision OPERATIVE_STATE_RESOLVED, applied 1, currentText 243 chars (base section 1537 chars)
- ❌ [PRODUCT/WRONG_OPERATIVE_SOURCE] F3: the Consolidated EBITDA definition handed to the compiler at 2026-06-30 is the amended text — DEFINITION_DEPENDENCY: ""Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus,…"
- ✅ [OBSERVATION] F3: at 2026-03-31 no effect is applied — no state computed for 2026-03-31 (manifest as-of dates only)

### INV-05b — A definition amendment that REMOVES an add-back (false-permission direction), and one layered on a package with two prior amendments

Legal statement: Amendment No. 1 (effective 2026-05-01) restates 'Consolidated EBITDA' WITHOUT the income-tax add-back: EBITDA falls, so the ratio basket 7.01(c) must be compiled against the smaller definition from that date. On package C the same form of amendment (No. 3) must coexist with the two resolved section amendments without disturbing them.

- ❌ [PRODUCT/WRONG_OPERATIVE_SOURCE] A: the removal amendment targets the definition, not the whole of Section 1.01 — SECTION:1.01:REPLACE_TEXT:RESOLVED
- ❌ [PRODUCT/WRONG_OPERATIVE_SOURCE] A: operative Section 1.01 keeps its other definitions — 1.01 provision OPERATIVE_STATE_RESOLVED, applied 1, currentText 186 chars
- ❌ [PRODUCT/CRITICAL_FALSE_PERMISSION] A: the compiler receives the smaller (amended) EBITDA definition - the old text would overstate EBITDA — DEFINITION_DEPENDENCY: ""Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without d…"
- ✅ [PRODUCT/INCORRECT_AMENDMENT_PRECEDENCE] C: 7.01(b) still SUPERSEDED by amendment-1 and 7.01(e) DELETED by amendment-2 at 2026-06-30 — 7.01(b) amendment-1 applied 1; 7.01(e) amendment-2 applied 1; instrument OPERATIVE_STATE_RESOLVED
- ❌ [PRODUCT/WRONG_OPERATIVE_SOURCE] C: the definition amendment targets 'Indebtedness', not the whole of Section 1.01 — SECTION:1.01:REPLACE_TEXT:RESOLVED; 1.01 provision applied 1, currentText 153 chars

### INV-06 — An amendment whose effectiveness is conditional is not applied before the condition is evidenced

Legal statement: Amendment No. 3 restates 7.01(d) but becomes effective only on the 'Amendment No. 3 Effective Date' (counterparts received, fee paid). With no evidence of that date, 7.01(d) must not read as amended at 2026-06-30 and the instrument state must not claim RESOLVED.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] the effect's effective date is not a concrete date — REPLACE_TEXT RESOLVED, effectiveDate "CONDITIONAL_UNRESOLVED"
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] 7.01(d) at 2026-06-30 does not read $8,000,000 — OPERATIVE_STATE_REVIEW_REQUIRED, applied 0, source credit-agreement
- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] instrument state at 2026-06-30 is not RESOLVED while the effect is pending — instrument OPERATIVE_STATE_REVIEW_REQUIRED

### INV-37 — Cache identity: a compiled unit is reusable when its own text and context are unchanged, and never reused when its text changed

Legal statement: Inserting a proviso into 7.01(c) must not invalidate the cached compilation of 7.02 (text unchanged) and must invalidate 7.01's (text changed).

- ✅ [PRODUCT/NONMATERIAL_OMISSION] 7.02's semantic cache key is unchanged after an insertion earlier in the document — key 40c5e3241558 → 40c5e3241558; anchor node id shifted
- ❌ [OBSERVATION] 7.02's sourceContentVersion after the insertion (recorded: it may legitimately embed the positional node id) — scv1:91b39b3f041 → scv1:d10cb6ec981
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] 7.01's semantic cache key changes when a clause of 7.01 changes — key a14600de3d4d → f28b822f2f9a

### INV-19 — Only a genuinely circular definition is a definition cycle; a diamond (two paths to one term) is not

Legal statement: 'Guarantor' means each Subsidiary that has executed the Guarantee; 'Subsidiary' means any entity controlled by the Borrower. A covenant that names both Guarantors and Subsidiaries depends on Subsidiary by two paths; nothing is circular, so the context contract must not refuse it. The B indenture's Restricted/Unrestricted Subsidiary pair IS circular and must still be reported.

- ❌ [PRODUCT/UNSUPPORTED_AS_COMPLETE] A + Guarantor definition: compiling 7.01 reports no DEFINITION_CYCLE — Definition cycle detected: guarantor -> subsidiary -> guarantor; sufficiency REVIEW_REQUIRED
- ✅ [OBSERVATION] the same definition with 7.01 not naming Guarantors: no cycle (control) — control
- ❌ [PRODUCT/UNSUPPORTED_AS_COMPLETE] pkg-i-secured-debt-lien 7.01 (Subsidiary/Guarantor, no definition refers to itself): no DEFINITION_CYCLE — Definition cycle detected: subsidiary -> guarantor -> subsidiary; sufficiency REVIEW_REQUIRED
- ❌ [PRODUCT/UNSUPPORTED_AS_COMPLETE] pkg-l-affiliate-transactions 7.07 (Loan Parties/Subsidiary, no definition refers to itself): no DEFINITION_CYCLE — Definition cycle detected: loan parties -> subsidiary -> loan parties; sufficiency REVIEW_REQUIRED
- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] B indenture 4.09 (Restricted Subsidiary ↔ Unrestricted Subsidiary) still reports a DEFINITION_CYCLE (positive control) — Definition cycle detected: restricted subsidiary -> unrestricted subsidiary -> restricted subsidiary

### INV-09 — A 'greater of $X and Y% of metric' basket is computable only with the metric; without it the answer is NEEDS_INPUT or, at most, the fixed floor stated as a floor

Legal statement: Capacity = max($25,000,000, 25% × Consolidated EBITDA). With approved EBITDA 80,000,000 the capacity is 25,000,000 (floor wins); with 200,000,000 it is 50,000,000; with no approved EBITDA the metric branch is unknown, so no figure above the floor may be reported.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] EBITDA 80m → 25,000,000 (floor > 20m) — AVAILABLE, remaining USD 25000000
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] EBITDA 200m → 50,000,000 — AVAILABLE, remaining USD 50000000
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] no approved EBITDA → NEEDS_INPUT, or at most the 25,000,000 floor (never more) — NEEDS_INPUT, remaining NOT_DETERMINED(a financial fact this capacity depends on is missing)

### INV-34 — A transaction effect the runtime does not support is refused explicitly, never applied approximately or ignored

Legal statement: A balance-sheet movement (CHANGE_BALANCE) and an entity-state change (CHANGE_ENTITY_STATE) are reserved effect kinds; a transaction stating one must come back UNSUPPORTED with the limitation named, and no capacity may move.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] CHANGE_BALANCE: simulation UNSUPPORTED with UNSUPPORTED_TRANSACTION_EFFECT named — status UNSUPPORTED; limitations UNSUPPORTED_TRANSACTION_EFFECT
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] CHANGE_BALANCE: the commit plan is not committable and is blocked by UNSUPPORTED_TRANSACTION_EFFECT (nothing can be written to the ledger) — committable false; blockedBy UNSUPPORTED_TRANSACTION_EFFECT; wouldAppend 1 row(s)
- ❌ [OBSERVATION] CHANGE_BALANCE: the supported CONSUME_CAPACITY effect is still evaluated (SATISFIED) and listed as a would-be ledger row while the transaction is refused (recorded: informational, not committable) — capacityEffects SATISFIED; path SATISFIED
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] CHANGE_ENTITY_STATE: simulation UNSUPPORTED with UNSUPPORTED_TRANSACTION_EFFECT named — status UNSUPPORTED; limitations UNSUPPORTED_TRANSACTION_EFFECT
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] CHANGE_ENTITY_STATE: the commit plan is not committable and is blocked by UNSUPPORTED_TRANSACTION_EFFECT (nothing can be written to the ledger) — committable false; blockedBy UNSUPPORTED_TRANSACTION_EFFECT; wouldAppend 1 row(s)
- ❌ [OBSERVATION] CHANGE_ENTITY_STATE: the supported CONSUME_CAPACITY effect is still evaluated (SATISFIED) and listed as a would-be ledger row while the transaction is refused (recorded: informational, not committable) — capacityEffects SATISFIED; path SATISFIED

### INV-19b — Breadth of the false-cycle refusal across the corpus: only genuinely circular definitions may be reported

Legal statement: Across every section-level manifest covenant in the twelve packages, a DEFINITION_CYCLE report is justified only when each definition on the reported path names the next term; any other report is a false refusal (IPV-21).

- ❌ [PRODUCT/UNSUPPORTED_AS_COMPLETE] no section-level candidate in the corpus carries a false DEFINITION_CYCLE (33 candidates examined) — 4 false cycle(s): I credit-agreement#7.01: subsidiary -> guarantor -> subsidiary; I credit-agreement#7.02: subsidiary -> guarantor -> subsidiary; I credit-agreement#7.04: guarantor -> subsidiary -> guarantor; L credit-agreement#7.07: loan parties -> subsidiary -> loan parties
- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] genuine cycles are reported (B indenture) — B indenture#4.09: restricted subsidiary -> unrestricted subsidiary -> restricted subsidiary; B indenture#4.09: restricted subsidiary -> unrestricted subsidiary -> restricted subsidiary

### INV-25 — A numeric threshold that triggers a qualitative gate ('in excess of $X … so long as approved') is never a basket cap

Legal statement: 7.07(d) permits 'any other transaction with an Affiliate involving aggregate consideration in excess of $5,000,000, so long as such transaction has been approved by a majority of the disinterested members of the board'. $5,000,000 is the floor above which approval is required, not capacity; a representation 'permits Affiliate transactions up to $5,000,000' asserts the opposite of the clause and must not certify. (Run on an in-memory variant of L whose 7.07(b) no longer names Loan Parties, so the IPV-21 false cycle does not mask the outcome.)

- ✅ [OBSERVATION] with the diamond removed, the faithful 7.07 compile is no longer blocked by a context-contract refusal — CERTIFIED (faithful, complete representation) | actual: REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN] compilation
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] L-P1 (The Borrower may pay the Sponsor $2,000,000 under the Management Agreement while a Default is continuing) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL]; compilation REVIEW_REQ
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] L-P1:lineage-on-rule (The Borrower may pay the Sponsor $2,000,000 under the Management Agreement while a Default is continuing) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL]; compilation REVIEW_REQ
- ❌ [PRODUCT/CRITICAL_FALSE_PERMISSION] L-P2 (7.07(d) permits Affiliate transactions up to $5,000,000) is refused — not CERTIFIED when the submission asserts "7.07(d) permits Affiliate transactions up to $5,000,000" | actual: certification CERTIFIED []; verification VERIFIED_NO_MATERIAL_GAP_FOUND []; compilation COMPLETED; target rule sufficiency COMPLET
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] L-P3 (7.07 does not restrict Subsidiaries) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL]; compilation REVIEW_REQ

### INV-16 — An Unrestricted Subsidiary designation document is recognised as acting on the indenture, not as a new instrument

Legal statement: A board resolution designating a Subsidiary as an Unrestricted Subsidiary under the Indenture changes the entity scope of every indenture covenant; the package graph should attach it to the indenture (or flag it unclassified), never treat it as a standalone base instrument. Entity-scope effects are semantic and are not asserted offline.

- ❌ [OBSERVATION] the resolution is not modelled as its own base instrument (recorded: the package graph currently does; fail-safe since no covenant is compiled from it) — instruments: instrument:credit-agreement, instrument:indenture, instrument:designation-resolution; lead: the Indenture→indenture REVIEW_REQUIRED; amendment effects from it: 0
- ❌ [OBSERVATION] the hybrid closure for an indenture debt question includes the designation resolution (evaluation model) — indenture#4.09, credit-agreement#7.01, credit-agreement#7.02

### INV-25b — Breadth of IPV-22: every comparator-introduced figure in the corpus submitted as a cap

Legal statement: H 7.11: 'If Availability is less than the greater of (a) $10,000,000 …' is a springing trigger, not capacity. H intercreditor 4.01: 'shall not make any payment … if Availability would be less than $15,000,000' is an Availability floor, not a $15,000,000 payment basket. H 7.03(b): 'provided that the Payment Conditions are satisfied' depends on a definition whose '$12,500,000' is an Availability floor; the clause has no $12,500,000 capacity. A submission asserting any of these as a MONEY cap must not certify.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] H-T1 (7.11 permits $10,000,000 (the springing trigger figure as capacity)) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL, MISSING_RULE/MATERIAL, MISSING_RULE/NON_MAT
- ❌ [PRODUCT/CRITICAL_FALSE_PERMISSION] H-T2 (Intercreditor 4.01 permits Term Loan payments up to $15,000,000) is refused — not CERTIFIED when the submission asserts "Intercreditor 4.01 permits Term Loan payments up to $15,000,000" | actual: certification CERTIFIED []; verification VERIFIED_NO_MATERIAL_GAP_FOUND []; compilation COMPLETED; target rule sufficiency COMPLETE, 1 cond, c
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] H-T3 (7.03(b) permits Investments up to $12,500,000) is refused — refused: certification REVIEW_REQUIRED [OPEN_MATERIAL_OR_UNCERTAIN_FINDING, SUPPORT_UNACCEPTABLE, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [UNSUPPORTED_IR_ADDITION/MATERIAL, PROVENANCE_MISMATCH/MATERIAL]; compilat
