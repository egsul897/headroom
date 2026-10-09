# Invariant run @ d08c06b7a38b40118579b4ac46fcdbe42ef57aab

| id | invariant | package | PRODUCT pass/total | observations |
|---|---|---|---|---|
| INV-01 | A hanging proviso qualifies every preceding clause of its section | D | 4/4 | 0 |
| INV-03 | A same-document 'notwithstanding Section X' provision governs the section it names | A | 2/2 | 1 |
| INV-04 | A cap outside the covenant article (Article IX 'notwithstanding anything in Article VII') governs | I | 2/2 | 2 |
| INV-05 | A definition amended by a later amendment changes every dependent provision from the effective date, and nothing else | A | 9/9 | 3 |
| INV-05b | A definition amendment that REMOVES an add-back (false-permission direction), and one layered on a package with two prior amendments | A | 5/5 | 0 |
| INV-06 | An amendment whose effectiveness is conditional is not applied before the condition is evidenced | C | 3/3 | 0 |
| INV-05c | Scan noise on the heading an amendment targets: the amendment must still attach to Section 7.01(b), or the mis-read heading must be diagnosed | C | 1/1 | 2 |
| INV-16b | An unresolved side letter or consent stays attached to the provision it names, blocks a RESOLVED reading, derives safe superseding capacity when clear, and is never silently dropped from retrieval | M | 5/5 | 2 |
| INV-37 | Cache identity: a compiled unit is reusable when its own text and context are unchanged, and never reused when its text changed | A | 2/2 | 1 |
| INV-19 | Only a genuinely circular definition is a definition cycle; a diamond (two paths to one term) is not | A | 5/5 | 2 |
| INV-09 | A 'greater of $X and Y% of metric' basket is computable only with the metric; without it the answer is NEEDS_INPUT or, at most, the fixed floor stated as a floor | F | 3/3 | 0 |
| INV-34 | A transaction effect the runtime does not support is refused explicitly, never applied approximately or ignored | F | 4/4 | 2 |
| INV-19b | Breadth of the false-cycle refusal across the corpus: only genuinely circular definitions may be reported | B | 2/2 | 1 |
| INV-25 | A numeric threshold that triggers a qualitative gate ('in excess of $X … so long as approved') is never a basket cap | L | 4/4 | 1 |
| INV-16 | An Unrestricted Subsidiary designation document is recognised as acting on the indenture, not as a new instrument | B | 0/0 | 2 |
| INV-25b | Breadth of IPV-22: every comparator-introduced figure in the corpus submitted as a cap | H | 3/3 | 0 |
| INV-09b | A ratio test's comparator and threshold are part of the source: a flipped comparator or a changed threshold must not certify | A | 5/5 | 0 |
| INV-28b | A posture flip or a changed percentage is not a faithful representation | F | 2/2 | 0 |
| INV-18 | A defined term used in plural or possessive form is still that defined term: its definition must reach the compiler | A | 1/1 | 0 |
| INV-32 | A reclassification of usage between baskets executes only on a recorded, authorised election over an edge the contract provides; otherwise nothing moves | F | 4/4 | 1 |

### INV-01 — A hanging proviso qualifies every preceding clause of its section

Legal statement: 7.05's trailing 'provided further that the foregoing shall not permit any Disposition of the Borrower's principal manufacturing facility' qualifies clauses (a)–(l) alike; compiling any clause must see it.

- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] compiling 7.05(a) sees the hanging proviso — as PROVISO item sourced from 7.05(l)
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] compiling 7.05(j) sees the hanging proviso — as PROVISO item sourced from 7.05(l)
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] compiling 7.05(k) sees the hanging proviso — as PROVISO item sourced from 7.05(l)
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] the section-level operative text carries the proviso — operative text 1355 chars

### INV-03 — A same-document 'notwithstanding Section X' provision governs the section it names

Legal statement: A new Section 7.05 reading 'Notwithstanding Section 7.01(b), the aggregate principal amount … shall not exceed $10,000,000 … while any Lien permitted under Section 7.02 is outstanding' restricts 7.01(b); compiling 7.01 and asking about 7.01(b) must bring 7.05 in.

- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] section-level 7.01 bundle carries 7.05 — UNVERIFIED_SIBLING_SIGNAL
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] hybrid closure for a 7.01(b) question includes 7.05 — 7.01,7.02,7.03,7.05
- ✅ [OBSERVATION] clause-level 7.01(b) bundle carries 7.05 (production candidates are section-level; recorded only) — OPERATIVE_SOURCE:7.01(b), PARENT_SCOPE:7.01, UNVERIFIED_SIBLING_SIGNAL:7.01(c), DEFINITION:Default, DEFINITION:Indebtedness, RELATED_COVENANT:7.05, RELATED_COVENANT:VII

### INV-04 — A cap outside the covenant article (Article IX 'notwithstanding anything in Article VII') governs

Legal statement: 9.15 caps all secured Indebtedness at $25,000,000 notwithstanding Article VII; compiling 7.01 or 7.02 must see 9.15.

- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] section-level 7.01 bundle carries 9.15 — RELATED_COVENANT
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] section-level 7.02 bundle carries 9.15 — RELATED_COVENANT
- ✅ [OBSERVATION] clause-level 7.01(b) bundle carries 9.15 (recorded only) — OPERATIVE_SOURCE:7.01(b), PARENT_SCOPE:7.01, DEFINITION:Guarantor, DEFINITION_DEPENDENCY:Subsidiary, DEFINITION:Indebtedness, RELATED_COVENANT:9.15, CROSS_REFERENCE:9.15
- ✅ [OBSERVATION] clause-level 7.02(b) bundle carries 9.15 (recorded only) — OPERATIVE_SOURCE:7.02(b), PARENT_SCOPE:7.02, DEFINITION:Indebtedness, DEFINITION:Lien, CROSS_REFERENCE:7.01(b), RELATED_COVENANT:9.15, CROSS_REFERENCE:9.15

### INV-05 — A definition amended by a later amendment changes every dependent provision from the effective date, and nothing else

Legal statement: Amendment No. 1 (effective 2026-05-01) restates the definition of 'Consolidated EBITDA' to add a stock-compensation add-back. From that date the ratio basket 7.01(c) must be compiled against the new definition; the other definitions in Section 1.01 are untouched; before that date nothing changes.

- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F1: the effect targets the definition (DEFINITION kind or definedTermRef), not the whole of Section 1.01 — effects: DEFINITION:Consolidated EBITDA:REPLACE_DEFINITION:RESOLVED; instrument OPERATIVE_STATE_RESOLVED
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F1: operative Section 1.01 at 2026-06-30 is untouched (absent or still holds the other definitions) — 1.01 provision OPERATIVE_STATE_RESOLVED, applied 1, currentText 1574 chars (base section 1537 chars)
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F1: the Consolidated EBITDA definition handed to the compiler at 2026-06-30 is the amended text — DEFINITION_DEPENDENCY: ""Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus,…" | AMENDMENT_LEAD: "[AMENDMENT_APPLIED_IN_OPERATIVE_STATE] Amendment No. 1: trative Agent. SECTION 1. Amendmen…"
- ✅ [OBSERVATION] F1: at 2026-03-31 no effect is applied — no state computed for 2026-03-31 (manifest as-of dates only)
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F2: the effect targets the definition (DEFINITION kind or definedTermRef), not the whole of Section 1.01 — effects: DEFINITION:Consolidated EBITDA:REPLACE_DEFINITION:RESOLVED; instrument OPERATIVE_STATE_RESOLVED
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F2: operative Section 1.01 at 2026-06-30 is untouched (absent or still holds the other definitions) — 1.01 provision OPERATIVE_STATE_RESOLVED, applied 1, currentText 1574 chars (base section 1537 chars)
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F2: the Consolidated EBITDA definition handed to the compiler at 2026-06-30 is the amended text — DEFINITION_DEPENDENCY: ""Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus,…" | AMENDMENT_LEAD: "[AMENDMENT_APPLIED_IN_OPERATIVE_STATE] Amendment No. 1: trative Agent. SECTION 1. Amendmen…"
- ✅ [OBSERVATION] F2: at 2026-03-31 no effect is applied — no state computed for 2026-03-31 (manifest as-of dates only)
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F3: the effect targets the definition (DEFINITION kind or definedTermRef), not the whole of Section 1.01 — effects: DEFINITION:Consolidated EBITDA:REPLACE_DEFINITION:RESOLVED; instrument OPERATIVE_STATE_RESOLVED
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F3: operative Section 1.01 at 2026-06-30 is untouched (absent or still holds the other definitions) — 1.01 provision OPERATIVE_STATE_RESOLVED, applied 1, currentText 1574 chars (base section 1537 chars)
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] F3: the Consolidated EBITDA definition handed to the compiler at 2026-06-30 is the amended text — DEFINITION_DEPENDENCY: ""Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus,…" | AMENDMENT_LEAD: "[AMENDMENT_APPLIED_IN_OPERATIVE_STATE] Amendment No. 1: trative Agent. SECTION 1. Amendmen…"
- ✅ [OBSERVATION] F3: at 2026-03-31 no effect is applied — no state computed for 2026-03-31 (manifest as-of dates only)

### INV-05b — A definition amendment that REMOVES an add-back (false-permission direction), and one layered on a package with two prior amendments

Legal statement: Amendment No. 1 (effective 2026-05-01) restates 'Consolidated EBITDA' WITHOUT the income-tax add-back: EBITDA falls, so the ratio basket 7.01(c) must be compiled against the smaller definition from that date. On package C the same form of amendment (No. 3) must coexist with the two resolved section amendments without disturbing them.

- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] A: the removal amendment targets the definition, not the whole of Section 1.01 — DEFINITION:Consolidated EBITDA:REPLACE_DEFINITION:RESOLVED
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] A: operative Section 1.01 is untouched (no provision, or still holds its other definitions) — 1.01 provision OPERATIVE_STATE_RESOLVED, applied 1, currentText 1517 chars
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] A: the compiler receives the smaller (amended) EBITDA definition - the old text would overstate EBITDA — DEFINITION_DEPENDENCY: ""Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without d…" | AMENDMENT_LEAD: "[AMENDMENT_APPLIED_IN_OPERATIVE_STATE] Amendment No. 1: trative Agent. SECTION 1. Amendments . The d…"
- ✅ [PRODUCT/INCORRECT_AMENDMENT_PRECEDENCE] C: 7.01(b) still SUPERSEDED by amendment-1 and 7.01(e) DELETED by amendment-2 at 2026-06-30 — 7.01(b) amendment-1 applied 1; 7.01(e) amendment-2 applied 1; instrument OPERATIVE_STATE_RESOLVED
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] C: the definition amendment targets 'Indebtedness', not the whole of Section 1.01 — DEFINITION:Indebtedness:REPLACE_DEFINITION:RESOLVED; 1.01 provision applied 1, currentText 688 chars

### INV-06 — An amendment whose effectiveness is conditional is not applied before the condition is evidenced

Legal statement: Amendment No. 3 restates 7.01(d) but becomes effective only on the 'Amendment No. 3 Effective Date' (counterparts received, fee paid). With no evidence of that date, 7.01(d) must not read as amended at 2026-06-30 and the instrument state must not claim RESOLVED.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] the effect's effective date is not a concrete date — REPLACE_TEXT RESOLVED, effectiveDate "CONDITIONAL_UNRESOLVED"
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] 7.01(d) at 2026-06-30 does not read $8,000,000 — OPERATIVE_STATE_REVIEW_REQUIRED, applied 0, source credit-agreement
- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] instrument state at 2026-06-30 is not RESOLVED while the effect is pending — instrument OPERATIVE_STATE_REVIEW_REQUIRED

### INV-05c — Scan noise on the heading an amendment targets: the amendment must still attach to Section 7.01(b), or the mis-read heading must be diagnosed

Legal statement: Amendment No. 1 restates 7.01(b). If the base agreement's heading scanned as 'SECTION 7.0l Indebtedness' (IPV-23 shape), the law has not changed: 7.01(b) at 2025-12-31 reads $40,000,000 with a no-Default proviso. The product must either still apply the amendment to the clause or refuse with a diagnostic (unattached effect / health finding) - never leave the instrument RESOLVED on the base text.

- ✅ [OBSERVATION] 7.01(b) is still a resolvable node after the heading mis-read (observation) — 1 node(s) for 7.01(b); SECTION labels 1.01,7.01,7.02
- ✅ [PRODUCT/INCORRECT_AMENDMENT_PRECEDENCE] 7.01(b) at 2025-12-31 reads as amended, OR the effect is not RESOLVED / is unattached / a health diagnostic exists / the instrument is not RESOLVED — effect REPLACE_TEXT RESOLVED → {"kind":"SECTION","targetDocumentId":"credit-agreement","targetInstrumentKey":"i; unattached 0; health 0; instrument OPERATIVE_STATE_RESOLVED; 7.01(b) OPERATIVE_STATE_RESOLVED "(b) other Indebtedness in an aggregate principal amount not "
- ✅ [OBSERVATION] 7.01(b) at 2025-12-31 reads $40,000,000 with the no-Default proviso (the amendment attached despite the heading noise) — OPERATIVE_STATE_RESOLVED, applied chain 1, "(b) other Indebtedness in an aggregate principal amount not to exceed $40,000,00"

### INV-16b — An unresolved side letter or consent stays attached to the provision it names, blocks a RESOLVED reading, derives safe superseding capacity when clear, and is never silently dropped from retrieval

Legal statement: Package M's side letter (2026-05-01) says the Borrower 'shall not incur other Indebtedness under Section 7.01(b) … exceeding $15,000,000'. At 2026-06-30 the override must remain attached to 7.01(b); the provision must not be OPERATIVE_STATE_RESOLVED with the base $40,000,000 as available; when the side letter states a single clear capacity figure that figure is the operative superseding language; and no retrieval view - clause-level or section-level - may serve the $40,000,000 clause as current truth without naming the override.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] the side letter yields an effect targeting credit-agreement#7.01(b) (resolved or unresolved), with zero unattached effects — 1 effect(s) from side-letter: UNKNOWN_CHANGE/REVIEW_REQUIRED→credit-agreement#7.01(b); unattached 0
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] 7.01(b) at 2026-06-30 is not OPERATIVE_STATE_RESOLVED (and not CONFLICTED), and either carries derived superseding $15,000,000 from the side letter or preserves the last authoritative $40,000,000 while the override stays attached — OPERATIVE_STATE_REVIEW_REQUIRED; applied 1; source side-letter; derivedCap=true; text "(b) other Indebtedness of the Borrower and the Guarantors in an aggreg"
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] the clause-level 7.01(b) bundle does not present the $40,000,000 text as current truth (withheld, or flagged by an unresolved item / stop naming the override) — OPERATIVE_SOURCE evidence {"status":"OPERATIVE_STATE_UNRESOLVED","isCurrentTruth":false,"reason":"2f269af059e0f97699a20c8a4acc412e5331acb614d9f8c8ce87904fb217cd68 (Side Letter): UNCLASSIFIED_OVERRIDE: override from documentId=side-letter label=\"Side Letter\" effectId=2f269af059e0f97699a20c8a4acc412e5331acb614d9f8c8ce87904fb217cd68 names Section 7.01(b). Its effect on that provision was not established, so the base text is not the resolved operative text."}; text 147 chars; names the override: true
- ✅ [OBSERVATION] when the clause text is withheld, the stated reason names the side letter / override (observation) — 2f269af059e0f97699a20c8a4acc412e5331acb614d9f8c8ce87904fb217cd68 (Side Letter): UNCLASSIFIED_OVERRIDE: override from documentId=side-letter label="Side Letter" effectId=2f269af059e0f97699a20c8a4acc412e5331acb614d9f8c8ce87904fb217cd68 names Section 7.01(b). Its effect on that provision was not established, so the base text is not the resolved operative text.
- ✅ [PRODUCT/WRONG_OPERATIVE_SOURCE] the section-level 7.01 bundle does not serve clause (b)'s $40,000,000 as current truth unless the bundle names the override (unresolved item, stop, or lead) — OPERATIVE_SOURCE evidence {"status":"OPERATIVE_STATE_UNRESOLVED","isCurrentTruth":false,"reason":"2f269af059e0f97699a20c8a4acc412e5331acb614d9f8c8ce87904fb217cd68 (Side Letter): UNCLASSIFIED_OVERRIDE: override from documentId=side-letter label=\"Side Letter\" effectId=2f269af059e0f97699a20c8a4acc412e5331acb614d9f8c8ce87904fb217cd68 names Section 7.01(b). Its effect on that provision was not established, so the base text is not the resolved operative text."}; text contains $40,000,000: false; CHILD_RULE 7.01(b) present: true; bundle names the override: true; items OPERATIVE_SOURCE:7.01, CHILD_RULE:7.01(a), CHILD_RULE:7.01(b), CHILD_RULE:7.01(c), AMENDMENT_LEAD:7.01(b)
- ✅ [OBSERVATION] clause (b) is either listed as a CHILD_RULE of 7.01 or the bundle says why it is absent (observation) — CHILD_RULE 7.01(b): true; names the override: true
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] A + tightening side letter on 7.01(b): the faithful section-level 7.01 submission is not CERTIFIED while the override is unresolved (the compiled 7.01(b) cap would otherwise be the superseded $30,000,000) — certification NOT_CERTIFIED [CANDIDATE_NOT_COMPILED, SEMANTIC_SOURCE_IDENTITY_WEAK, SOURCE_IDENTITY_WEAK, OPERATIVE_STATE_UNACCEPTABLE]; compiled 7.01(b) capacity null; package FAILED

### INV-37 — Cache identity: a compiled unit is reusable when its own text and context are unchanged, and never reused when its text changed

Legal statement: Inserting a proviso into 7.01(c) must not invalidate the cached compilation of 7.02 (text unchanged) and must invalidate 7.01's (text changed).

- ✅ [PRODUCT/NONMATERIAL_OMISSION] 7.02's semantic cache key is unchanged after an insertion earlier in the document — key 68bbef8e1aa1 → 68bbef8e1aa1; anchor node id shifted
- ❌ [OBSERVATION] 7.02's sourceContentVersion after the insertion (recorded: it may legitimately embed the positional node id) — scv1:91b39b3f041 → scv1:d10cb6ec981
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] 7.01's semantic cache key changes when a clause of 7.01 changes — key df576a2132ac → b215c50b3549

### INV-19 — Only a genuinely circular definition is a definition cycle; a diamond (two paths to one term) is not

Legal statement: 'Guarantor' means each Subsidiary that has executed the Guarantee; 'Subsidiary' means any entity controlled by the Borrower. A covenant that names both Guarantors and Subsidiaries depends on Subsidiary by two paths; nothing is circular, so the context contract must not refuse it. The B indenture's Restricted/Unrestricted Subsidiary pair IS circular and must still be reported.

- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] A + Guarantor definition: compiling 7.01 reports no DEFINITION_CYCLE — no cycle; sufficiency SUFFICIENT
- ✅ [OBSERVATION] the same definition with 7.01 not naming Guarantors: no cycle (control) — control
- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] pkg-i-secured-debt-lien 7.01 (Subsidiary/Guarantor, no definition refers to itself): no DEFINITION_CYCLE — no cycle; sufficiency SUFFICIENT
- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] pkg-l-affiliate-transactions 7.07 (Loan Parties/Subsidiary, no definition refers to itself): no DEFINITION_CYCLE — no cycle; sufficiency SUFFICIENT
- ❌ [OBSERVATION] HISTORICAL (invalid positive control, see doc 22): B indenture 4.09 Restricted/Unrestricted Subsidiary reported as a DEFINITION_CYCLE — none (correct: the pair is one-way)
- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] B indenture 4.09: a one-way pair (Restricted → Unrestricted Subsidiary, plus a self-mention) is NOT reported as a DEFINITION_CYCLE — no cycle
- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] A + ('Consolidated Total Debt' means Consolidated Net Debt plus cash; 'Consolidated Net Debt' means Consolidated Total Debt minus cash): compiling 7.01 reports a DEFINITION_CYCLE on exactly that pair (corrected positive control) — Definition cycle detected: consolidated total leverage ratio -> consolidated total debt -> consolidated net debt -> consolidated total debt

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

- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] no section-level candidate in the corpus carries a false DEFINITION_CYCLE (37 candidates examined) — none
- ❌ [OBSERVATION] HISTORICAL (see doc 22): genuine cycles found across the corpus by exact defined-term boundaries — none - the corpus has no genuine definition cycle
- ✅ [PRODUCT/UNSUPPORTED_AS_COMPLETE] a genuine two-way definition cycle (A variation, Consolidated Total Debt ↔ Consolidated Net Debt) is reported on the section-level 7.01 candidate (corrected positive control) — Definition cycle detected: consolidated total leverage ratio -> consolidated total debt -> consolidated net debt -> consolidated total debt

### INV-25 — A numeric threshold that triggers a qualitative gate ('in excess of $X … so long as approved') is never a basket cap

Legal statement: 7.07(d) permits 'any other transaction with an Affiliate involving aggregate consideration in excess of $5,000,000, so long as such transaction has been approved by a majority of the disinterested members of the board'. $5,000,000 is the floor above which approval is required, not capacity; a representation 'permits Affiliate transactions up to $5,000,000' asserts the opposite of the clause and must not certify. (Run on an in-memory variant of L whose 7.07(b) no longer names Loan Parties, so the IPV-21 false cycle does not mask the outcome.)

- ✅ [OBSERVATION] with the diamond removed, the faithful 7.07 compile is no longer blocked by a context-contract refusal — CERTIFIED (faithful, complete representation) | actual: REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFI
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] L-P1 (The Borrower may pay the Sponsor $2,000,000 under the Management Agreement while a Default is continuing) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATE
- ✅ [PRODUCT/MATERIAL_CONDITION_OMISSION] L-P1:lineage-on-rule (The Borrower may pay the Sponsor $2,000,000 under the Management Agreement while a Default is continuing) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATE
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] L-P2 (7.07(d) permits Affiliate transactions up to $5,000,000) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATE
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] L-P3 (7.07 does not restrict Subsidiaries) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATE

### INV-16 — An Unrestricted Subsidiary designation document is recognised as acting on the indenture, not as a new instrument

Legal statement: A board resolution designating a Subsidiary as an Unrestricted Subsidiary under the Indenture changes the entity scope of every indenture covenant; the package graph should attach it to the indenture (or flag it unclassified), never treat it as a standalone base instrument. Entity-scope effects are semantic and are not asserted offline.

- ❌ [OBSERVATION] the resolution is not modelled as its own base instrument (recorded: the package graph currently does; fail-safe since no covenant is compiled from it) — instruments: instrument:credit-agreement, instrument:indenture, instrument:supplemental-indenture-1, instrument:designation-resolution; lead: the Indenture→indenture REVIEW_REQUIRED; amendment effects from it: 0
- ❌ [OBSERVATION] the hybrid closure for an indenture debt question includes the designation resolution (evaluation model) — indenture#4.09, credit-agreement#7.01, credit-agreement#7.02

### INV-25b — Breadth of IPV-22: every comparator-introduced figure in the corpus submitted as a cap

Legal statement: H 7.11: 'If Availability is less than the greater of (a) $10,000,000 …' is a springing trigger, not capacity. H intercreditor 4.01: 'shall not make any payment … if Availability would be less than $15,000,000' is an Availability floor, not a $15,000,000 payment basket. H 7.03(b): 'provided that the Payment Conditions are satisfied' depends on a definition whose '$12,500,000' is an Availability floor; the clause has no $12,500,000 capacity. A submission asserting any of these as a MONEY cap must not certify.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] H-T1 (7.11 permits $10,000,000 (the springing trigger figure as capacity)) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL, MISSING_RULE
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] H-T2 (Intercreditor 4.01 permits Term Loan payments up to $15,000,000) is refused — refused: certification REVIEW_REQUIRED [OPEN_MATERIAL_OR_UNCERTAIN_FINDING, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [WRONG_AMOUNT/MATERIAL]; compilation COMPLETED; target rule sufficiency COMPLETE, 1 cond, capacity MONEY scope=[BORROWER] aud
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] H-T3 (7.03(b) permits Investments up to $12,500,000) is refused — refused: certification REVIEW_REQUIRED [OPEN_MATERIAL_OR_UNCERTAIN_FINDING, SUPPORT_UNACCEPTABLE, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [UNSUPPORTED_IR_ADDITION/MATERIAL, PROVENANCE_MISMATCH/MATERIAL]; compilat

### INV-09b — A ratio test's comparator and threshold are part of the source: a flipped comparator or a changed threshold must not certify

Legal statement: B indenture 4.09: Indebtedness may be incurred if the FCCR 'would have been at least 2.00 to 1.00'. A 7.01(c): the ratio basket is available 'so long as … the Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00'. Representations that flip 'at least' to 'at most', 'does not exceed' to 'is at least', or raise 3.50 to 4.50 assert tests the text does not state and must not certify.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] B-T1 (4.09 ratio test is satisfied when the FCCR is at most 2.00 to 1.00 (comparator flipped)) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [WRONG_LOGIC/MATERIAL, WRONG_AMOUNT/MATERIAL, WRONG_AMOUNT/MATERIAL, 
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] A-T1 (7.01(c) is available when the leverage ratio is at least 3.50 to 1.00 (comparator flipped)) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [WRONG_LOGIC/MATERIAL]; compilation REVIEW_REQUIRED; target rule suff
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] A-T2 (7.01(c) is available when the leverage ratio does not exceed 4.50 to 1.00 (threshold raised)) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_RULE/MATERIAL, UNSUPPORTED_IR_A
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] H-T4 (7.11 requires the FCCR to be at most 1.00 to 1.00 (comparator flipped)) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] M-T1 (7.01(c) is available when the leverage ratio is at least 4.00 to 1.00 (comparator flipped)) is refused — refused: certification NOT_CERTIFIED [CANDIDATE_NOT_COMPILED!, SEMANTIC_SOURCE_IDENTITY_WEAK!, SOURCE_IDENTITY_WEAK!, OPERATIVE_STATE_UNACCEPTABLE]; verification none []; compilation none

### INV-28b — A posture flip or a changed percentage is not a faithful representation

Legal statement: F 7.01(c) permits Indebtedness 'not to exceed 20% of Consolidated EBITDA': a representation at 35% asserts a figure the text does not state. D 7.05 is a prohibition ('shall not … make any Disposition, except'): representing the section as a permission inverts it. Neither may certify.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] F-T1 (7.01(c) permits Indebtedness up to 35% of Consolidated EBITDA) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL, MISSING_BASKET
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] D-T1 (7.05 permits Dispositions (the prohibition presented as a permission)) is refused — refused: certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]; verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL, MISSING_RULE/N

### INV-18 — A defined term used in plural or possessive form is still that defined term: its definition must reach the compiler

Legal statement: 'Guarantors', 'Subsidiaries', 'Investments', 'Liens', 'Restricted Payments', 'an Affiliate of' are uses of the defined terms Guarantor, Subsidiary, Investment, Lien, Restricted Payment, Affiliate (every corpus agreement carries the usual 'singular and plural forms' construction clause or relies on it). For every covenant whose own text uses a defined term only in such a form, the bundle must still carry the definition.

- ✅ [PRODUCT/NONMATERIAL_OMISSION] every defined term used only in an inflected form reaches the bundle (100 covenants, 29 inflected-only uses) — none

### INV-32 — A reclassification of usage between baskets executes only on a recorded, authorised election over an edge the contract provides; otherwise nothing moves

Legal statement: F 7.01(g) lets the Borrower reclassify usage out of 7.01(b) by written notice to the Administrative Agent. The fixture IR carries no reclassification edge (the runtime cases never model 7.01(g)); an election moving $5,000,000 from 7.01(b) to 7.01(c) must therefore not execute, must not free 7.01(b) capacity, and must not be committable; an election the caller did not select must be refused as not on the selected path.

- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] an election over a reclassification edge the IR does not provide is not executed — status SIMULATED; outcomes elect-inv32:RECLASSIFICATION_NOT_EXECUTABLE; codes RECLASSIFICATION_NOT_EXECUTABLE
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] the commit plan is not committable and names the block — committable false; blockedBy RECLASSIFICATION_NOT_EXECUTABLE
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] 7.01(b) remaining capacity is unchanged (or no post state is produced): nothing freed — 7.01(b) remaining before 38000000 after (no post state: simulation blocked before applying)
- ✅ [PRODUCT/CRITICAL_FALSE_PERMISSION] an election the caller did not place on the selected path is refused (EFFECT_TARGET_NOT_IN_SELECTED_PATH) — status ERROR; limitations EFFECT_TARGET_NOT_IN_SELECTED_PATH
- ❌ [OBSERVATION] an election with approvalRef null is accepted as an election (recorded: the runtime does not require an approval reference; the product layer must) — codes RECLASSIFICATION_NOT_EXECUTABLE
