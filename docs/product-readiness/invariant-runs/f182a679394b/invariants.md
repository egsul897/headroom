# Invariant run @ f182a679394b0a69579aad8a2952d0080f366dcd

| id | invariant | package | PRODUCT pass/total | observations |
|---|---|---|---|---|
| INV-01 | A hanging proviso qualifies every preceding clause of its section | D | 4/4 | 0 |
| INV-03 | A same-document 'notwithstanding Section X' provision governs the section it names | A | 2/2 | 1 |
| INV-04 | A cap outside the covenant article (Article IX 'notwithstanding anything in Article VII') governs | I | 2/2 | 2 |
| INV-05 | A definition amended by a later amendment changes every dependent provision from the effective date, and nothing else | A | 1/7 | 3 |
| INV-05b | A definition amendment that REMOVES an add-back (false-permission direction), and one layered on a package with two prior amendments | A | 1/5 | 0 |
| INV-06 | An amendment whose effectiveness is conditional is not applied before the condition is evidenced | C | 3/3 | 0 |
| INV-37 | Cache identity: a compiled unit is reusable when its own text and context are unchanged, and never reused when its text changed | A | 2/2 | 1 |

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
