# Targeted Ontology Closure Test (Round 2)

**Purpose**: This is a second, deliberately targeted stress test of the Coherent-derived legal ontology, following `docs/cross-document-ontology-stress-test.md` ("Round 1"). Round 1 concluded the ontology was materially incomplete and recommended one more targeted round rather than solver design. This report attacks specifically the areas Round 1 flagged as thin or `SOURCE_CHAIN_INCOMPLETE`: the operative text of real intercreditor agreements, a second complete incremental-facility/MFN mechanic, shared caps, borrowing bases, dynamic covenant applicability, entity/guarantor scope, and currency. It is read-only analysis: no schema, engine, seed data, or test files were touched to produce it, no company was onboarded, and no solver was designed or implemented.

---

## A. Executive verdict

**READY_FOR_SOLVER_DESIGN**, with two narrow, named carve-outs (an LME/enforcement module, deliberately deferred, and a single new cross-permission relationship type that should be added before solver design — see §S).

This round reviewed 24 additional primary-source documents/sections (3 freestanding intercreditor agreements never previously read; two complete, non-restated incremental-facility/MFN sections; deepened borrowing-base, entity-scope, and currency provisions in documents Round 1 only partially read) and encountered roughly 25 materially distinct contractual mechanics. Of those, the large majority (~22 of 25, ≈88%) are handled by the existing Round-1 ontology through parameterization or a modest generalization of an already-proposed concept; none required inventing a wholly new architectural category on the scale of Round 1's four structural gaps (cross-document caps, borrowing bases, collateral-pool priority, dynamic applicability). Exactly one genuinely new relationship type was found (a cross-permission "incurring this can automatically reprice that" MFN trigger). Two more mechanics are genuinely new but were determined, on their own primary-source evidence, to belong to a *different* problem than Phase 1 debt/lien capacity (enforcement-control regimes and mixed-collateral proceeds allocation, both LME/insolvency-scoped) and are explicitly deferred rather than built around.

This is a sharp directional change from Round 1: discovery of *new architectural categories* has visibly tapered, even though discovery of *new named mechanics* has not (real credit documents keep naming new things — MFN sunsets, equity cures, LCA test-date freezes, hysteresis-style springing covenants). The generalized decomposition Target B asked this round to test — `PERMISSION → ELIGIBILITY CONDITIONS → CAPACITY → TERM CONDITIONS → STATE EFFECTS` — held up well across every mechanic reviewed and is adopted as the primary structural refinement of this round (§L, §K).

---

## B. Round 1 baseline

Round 1's conclusion (ii): the ontology was materially incomplete. Four structural gaps were demonstrated: (1) cross-document/cross-instrument shared capacity caps; (2) borrowing-base/external-collateral-derived capacity; (3) collateral-pool-scoped lien priority; (4) dynamic covenant applicability. Ten `CORE_CANDIDATE` primitives were proposed (Round 1 §O). Two evidentiary gaps were named for a follow-up round: (a) reading intercreditor agreements' own text, not just what an indenture says about them; (b) a second company's complete, non-restated incremental-facility/MFN mechanics, since TransDigm's own numeric formula was `SOURCE_CHAIN_INCOMPLETE`. This round treats Round 1's ten `CORE_CANDIDATE` items as a baseline hypothesis, not as settled fact, and revisits each one against this round's new primary-source evidence (§L, §M).

---

## C. Sources reviewed

All text below was fetched directly from `sec.gov`/`data.sec.gov` in this session, HTML-stripped, and read/grepped for the sections cited. Two companies are Round-1 deep-dives (Petco, TransDigm — both permitted and encouraged by the task); one is a Round-1 company read into new, previously-unfetched documents (CHS's actual intercreditor agreements). No new company was onboarded.

| Document | Entity | Date | Filing | Accession | Exhibit | What was newly read this round |
|---|---|---|---|---|---|---|
| First Lien Credit Agreement | Petco Health & Wellness Co. / Petco Animal Supplies, Inc. | March 4, 2021 | Form 8-K | 0001193125-21-070483 | 10.1 | **Full** §2.13 Incremental Borrowings (all subsections (a)–(i)); full defined terms for Fixed Incremental Amount, Ratio Amount, Incremental Equivalent Debt, Excluded Incremental Facility, Inside Maturity Exception, Excluded Subsidiary (12 categories); §1.08(f) LCA Election/LCA Test Date; §1.09 Currency Equivalents Generally; §2.17 Judgment Currency |
| ABL Revolving Credit Agreement | Petco Health & Wellness Co. / Petco Animal Supplies, Inc. | March 4, 2021 | Same 8-K | 0001193125-21-070483 | 10.2 | Full Borrowing Base definition; full Reserves definition; Covenant Trigger Event definition (springing-covenant entry/exit); Cash Dominion Period definition; §8.01 Fixed Charge Coverage Ratio; §8.02 Borrower's Right to Cure (equity cure); Borrowing Base Parties; Borrowing Base Certificate; temporary-inclusion-of-newly-acquired-collateral proviso |
| Amended and Restated ABL Intercreditor Agreement | CHS/Community Health Systems, Inc. et al. | June 22, 2018 | Form 8-K | 0001193125-18-201300 | 4.4 | **Full agreement**, never previously fetched — §2 Priority of Liens; §3.1 Exercise of Remedies (mutual standstill); §3.2/3.3 Cooperation/Actions Upon Breach; §4.1–4.5 Payments (Payments Over/turnover, Mixed Collateral allocation); §5.1/5.7 Releases, No Release If EOD/Reinstatement; §6.1–6.4 DIP Financing, Relief from Automatic Stay, Adequate Protection |
| Senior-Junior Lien Intercreditor Agreement | CHS/Community Health Systems, Inc. et al. | June 22, 2018 | Same 8-K | 0001193125-18-201300 | 4.5 | **Full agreement**, never previously fetched — §3.5 Release of Junior-Priority Liens; §4.2 Payments Over; §6.2 DIP Financing (asymmetric senior/junior version) |
| Junior-Priority Lien Pari Passu Intercreditor Agreement | CHS/Community Health Systems, Inc. et al. | June 22, 2018 | Same 8-K | 0001193125-18-201300 | 4.6 | **Full agreement**, never previously fetched — §2.02 Actions with Respect to Shared Collateral; designated-Collateral-Agent/Applicable-Authorized-Representative control structure |
| 9.750% Senior Secured Notes due 2034 Indenture | Community Health Systems, Inc. | August 12, 2025 | Form 8-K | 0001193125-25-179099 | 4.1 | Re-read §3.2(b)(1) verbatim (exact $5,011,000,000 pooled-cap text, including the refinancing-lineage clause) |
| Second Amended and Restated Credit Agreement, dated June 4, 2014, as amended and restated through Amendment No. 10 | TransDigm Inc. / TransDigm Group Incorporated | December 14, 2022 | Form 8-K | 0001193125-22-304822 | 10.1 | **Full, non-restated-summary Section 2.24 "Increase in Commitments"** (closes Round 1's `SOURCE_CHAIN_INCOMPLETE`) — Yield Differential (MFN), WAL/maturity floors, LCA test-date treatment for incremental sizing conditions; full Multicurrency Revolving Credit Commitment structure (Dollar Revolving vs. Multicurrency Revolving as separate Classes); §1.08 Exchange Rates (periodic Calculation Date snap); Foreign Restricted Subsidiary / Unrestricted Subsidiary definitions |

Round 1's Coherent citations and its Petco/TransDigm/CHS/CommScope-Vistance §C source table are treated as given per instructions and not re-verified here, except where directly superseded by a fuller reading above (noted inline in §D–§J). CommScope/Vistance was not re-fetched this round; its Round-1 findings on borrowing-base and springing covenants are cited as corroborating evidence only, not re-verified.

**Remaining SOURCE_CHAIN_INCOMPLETE after this round**: the *Notes-side* Intercreditor Agreement counterparts (i.e., how CHS's 2025 Notes indenture's own recitals map onto the specific 2018 agreements read here — the 2025 indenture references "the Intercreditor Agreements" generically and this round did not independently confirm the 2018 agreements are still the operative, unamended versions as of the 2025 issuance); TransDigm's Permitted Liens definition beyond clauses (a)–(k) (not re-read this round, unchanged from Round 1); Petco's ABL eligibility-exclusion and concentration-limit clauses within "Eligible Accounts"/"Eligible Inventory" (the top-level formula and Reserves definition were read in full, but the itemized ineligibility criteria (foreign-obligor exclusions, concentration caps, aging thresholds) were not individually enumerated — not needed for the architectural question this round asks, per Target D's own scoping, but flagged for completeness).

---

## D. Intercreditor / priority architecture findings

Round 1 could only describe intercreditor mechanics through what an indenture *said about* them. This round read three complete, operative intercreditor agreements from one real capital structure (CHS), each governing a structurally different creditor relationship, plus Petco's already-read intercreditor-joinder precondition.

**Three distinct control/enforcement topologies, same company, same date:**

| Agreement | Relationship type | Collateral topology | Enforcement control | Distinctive mechanic |
|---|---|---|---|---|
| ABL Intercreditor Agreement | ABL vs. term-loan/notes | **Split pools** — ABL Priority Collateral and Term Loan/Notes Priority Collateral are different, named asset groups | **Exclusive per pool** — whichever party has priority on a given pool has the sole right to enforce against it, "without any consultation with or the consent of" the other, subject to a mutual, symmetric 180-day Standstill Period | Turnover (§4.4 "Payments Over" — off-pool proceeds must be segregated, held in trust, and paid over); a formulaic **Mixed Collateral** proceeds-allocation waterfall (§4.5) for dispositions spanning both pools; Discharge/Reinstatement (§5.7) — a discharge is automatically deemed reversed if the discharged debt class is later reincurred |
| Senior-Junior Lien Intercreditor Agreement | First-lien vs. second-lien | **Same pool** — both classes hold liens on identical collateral, ranked senior/junior | Senior class controls enforcement; junior liens are **automatically released** upon senior foreclosure/enforcement (§3.5) | No standstill needed in the same sense — junior's remedy is release-and-share-in-proceeds-if-any, not independent enforcement on a different pool |
| Junior-Priority Lien Pari Passu Intercreditor Agreement | Pari passu among junior note series | **Shared pool**, single Collateral Agent | No priority ranking at all — a single Collateral Agent acts on the instructions of a designated **"Applicable Authorized Representative"** (a rotating/determinable controlling party, not a fixed rank) | Proceeds shared ratably; the controlling question is *who currently gets to instruct the agent*, not *whose lien is senior* |

**DIP financing, adequate protection, automatic-stay relief**: all three agreements condition these on the same underlying pattern — the subordinate/non-controlling party agrees not to object to relief the controlling party consents to, and its liens are automatically subordinated to court-approved DIP financing liens on the same basis as its liens are already subordinated generally. This is a clean, repeated instance of `PRIORITY_CONDITION`-family logic, not a new category.

**Does the Round-1 model (permission + collateral pool + priority relationship) suffice?** For Phase 1's actual question — *can this proposed debt be incurred and secured with the proposed lien priority on the proposed collateral* — **yes**, with the two additions Round 1 already proposed (collateral pool as a first-class node/attribute; intercreditor joinder as a transaction precondition). Confirming a proposed debt's incurrence and lien priority requires knowing: which collateral pool it will be secured on, what priority tier it holds on that pool, and whether the incurring party's representative must join a specific named intercreditor agreement as a condition — all three are already in Round 1's proposed model or its ten candidates. **For the deeper enforcement/LME questions this round surfaced — standstill, turnover, mixed-collateral allocation, release-on-foreclosure, designated-controlling-representative, DIP subordination — the Round-1 model is not sufficient, and should not be extended to cover them now.** These are a different problem (what happens *after* default/insolvency, who *controls* remedies) from Phase 1's (can this debt be incurred *now*). They are named here as future primitives (`ENFORCEMENT_CONTROL_REGIME`, `STANDSTILL_STATE`, `TURNOVER_OBLIGATION`, `RELEASE_ON_FORECLOSURE`, `MIXED_COLLATERAL_ALLOCATION_RULE`, `DIP_PRIORITY_OVERRIDE`) and deliberately excluded from the Phase 1 core ontology (§L, §S).

---

## E. Incremental facility / MFN findings

Two complete, non-restated, real credit agreements were read in full: Petco's First Lien CA §2.13 (Round 1 had this) and — closing Round 1's `SOURCE_CHAIN_INCOMPLETE` — TransDigm's §2.24 "Increase in Commitments," read from the December 14, 2022 full restatement (Amendment No. 10), not the April 2026 restatement Round 1 used (which cross-referenced §2.24 without restating it).

The two documents are architecturally near-identical, differing only in parameters:

| Mechanic | Petco §2.13 | TransDigm §2.24 | Classification (Target B taxonomy) |
|---|---|---|---|
| Fixed + ratio-based sizing | Fixed Incremental Amount + Ratio Amount (baseline-freeze test) | Ratio-gated (TNL ≤ 7.25x, Secured Net Debt ≤ 5.00x) with $10mm minimum increments | **Capacity** — `CLEAN_MATCH` to existing `amountKind`/`FormulaType` |
| MFN pricing protection | "All-In Yield" cushion: if new pari passu floating tranche's yield exceeds existing Term Loans' by >75bp, existing tranche's margin is bumped up to close the gap | "Yield Differential": same mechanic, 50bp cushion | **Term Condition + Post-incurrence State Effect** — genuinely new: incurring debt under *this* permission automatically reprices a *different*, pre-existing permission/tranche |
| MFN sunset/exclusions | "Excluded Incremental Facility": 6-month-post-Closing sunset, minimum-size threshold, acquisition-financing carve-out, Ratio-Amount-sourced carve-out, maturity-date carve-out, non-syndicated-loan carve-out, non-Dollar carve-out | Not independently re-verified for TransDigm this round (Petco's is the fuller example) | **Eligibility condition** — a multi-factor predicate on whether MFN applies at all, not a capacity formula |
| Inside Maturity Exception | Term-waiver sub-basket, sized like an ordinary basket (greater-of-flat-or-%-EBITDA), but consumption caps a *term waiver* (shorter WAL/maturity permitted), not a dollar amount | Analogous WAL/maturity floor language, no separately-named exception basket confirmed this round | **Term condition**, structurally a basket that gates eligibility for a term exception rather than gating dollar capacity |
| WAL / final-maturity floors | No shorter WAL than existing tranche; no earlier maturity than Latest Maturity Date | Same shape | **Term condition** — `CLEAN_MATCH` |
| LCA Election / LCA Test Date | Ratio/condition test date frozen at signing of a pending Limited Condition Acquisition's definitive agreement, not at closing; explicit "fluctuations after the test date don't unwind compliance" rule; concurrent transactions during the pendency window must assume the pending LCA already closed | Same test-date-freeze concept referenced for incremental-sizing conditions (§2.24(c)) | **Eligibility condition + measurement-date parameter**, tested further in §J |
| Currency | Alternative Currency permitted, Dollar Amount fixed as of incurrence (or LCA Test Date) date, "controlling," not re-tested for subsequent FX movement | Separate Multicurrency Revolving Credit Commitment Class; Exchange Rate re-snapped periodically on a "Calculation Date," fixed between snaps except where a provision expressly requires a current rate | **Measurement rule**, tested in §J |
| Non-Loan-Party sub-cap | Incremental Equivalent Debt **and** Permitted Ratio Debt incurred by Non-Loan Parties share **one combined** 50%-of-EBITDA sub-limit | Analogous Foreign Restricted Subsidiary sub-cap (Round 1 cl. (14)) | **Shared capacity pool scoped by entity class** — a Target-C/Target-F intersection, see §F/§I |

**Does the proposed `PERMISSION → ELIGIBILITY CONDITIONS → CAPACITY → TERM CONDITIONS → STATE EFFECTS` decomposition hold up?** Yes, cleanly, across every sub-mechanic in both documents. The one piece that does not fit inside a single permission's own five-stage pipeline is MFN pricing protection, because its "state effect" lands on a *different* permission/tranche than the one being exercised — that is the one place this round found a genuinely new relationship type: a permission's incurrence can trigger an automatic parameter adjustment on another, named permission. This is adopted as `PARAMETER_ADJUSTMENT_TRIGGER` in §L.

---

## F. Shared-cap findings

Round 1 found cross-document shared caps in TransDigm and CHS but described them as one undifferentiated phenomenon ("a permission's ceiling read from another document's balance"). Reading the actual operative CHS text this round shows that is not quite right — there are **two distinct sub-patterns**, both real, both market-standard, that Round 1's language conflated:

1. **External-instrument-balance reference** (TransDigm CA Permitted Indebtedness cl. (1)): the Credit Agreement's own Permitted Indebtedness list includes a $4.8B ceiling on how much may be outstanding under a *different* document (the Senior Subordinated Notes Indenture) — Document A imposing a cap on Document B's aggregate balance, as a condition of Document A's own covenant compliance.
2. **Multi-entry-point shared pool** (CHS Indenture §3.2(b)(1), now read verbatim): *one* basket — "Indebtedness... Incurred pursuant to any Credit Facility... in a maximum aggregate principal amount... not exceeding $5,011,000,000" — that several different debt sources draw against: new Credit Facility debt, specifically-named refinancings of the 2031/2032/2033 Notes redesignated into this clause, and other debt incurred under a separate general clause, **plus any refinancing indebtedness of any of the above** (the cap follows the debt through refinancing, not just a point-in-time snapshot).

A third, single-document instance of the same underlying pattern showed up independently this round: Petco's Non-Loan-Party sub-cap (§E above) pools two textually distinct debt baskets (Incremental Equivalent Debt and Permitted Ratio Debt) under one combined ceiling, filtered by entity class rather than by document identity.

**Is "shared basket" the same generalized concept as "cross-document cap"?** Yes. All three instances — TransDigm's external-balance reference, CHS's multi-entry-point pool, and Petco's entity-filtered combined sub-cap — resolve to the same architectural shape: **a standalone constraint node, consumed by one or more permissions, whose membership is defined by an explicit aggregation rule.** The rule's *criteria* vary (which clauses feed it; which entity class; whether it reads a live external balance or an enumerated internal set) but the *shape* does not. This directly answers Target C: the correct abstraction is Option A (a constraint node consumed by multiple permissions), generalized with an `aggregationRule` attribute whose value can be `NAMED_MEMBER_CLAUSES`, `EXTERNAL_INSTRUMENT_BALANCE`, or `ENTITY_CLASS_FILTER` — not Option B's separate "pool" node type (the constraint node *is* the pool) and not Option C's fully dynamic query language (every real example found enumerates its members or its referenced instrument by name in the text; none defers to an open-ended matching predicate). This also merges cleanly with Round 1's already-flagged, Coherent-only "Reallocated Amount" mechanic (unused capacity in one basket feeding another) — same constraint-node shape, different aggregation direction.

**Should a future solver operate over documents, or over permissions + constraints + state?** This round's evidence reinforces Round 1's conclusion: over permissions + constraints + state. CHS's shared pool spans a credit facility and three separately-issued bond series; a document-partitioned solver cannot express a single ceiling that lives astride three "different" documents. Documents remain essential for provenance (§O) but should not be the solver's primary organizing unit.

---

## G. Borrowing-base findings

Petco's ABL Revolving Credit Agreement was read in full for its Borrowing Base mechanics this round (Round 1 had only the top-line formula), alongside Round 1's CommScope/Vistance ABL for comparison (not re-fetched, cited as corroboration only).

**Formula** (deterministic, contractual): `min(commitment, 90% × Eligible Accounts + 90% × NOLV(Eligible Inventory) + 100% × inaccessible Qualified Cash − Reserves)`. CommScope/Vistance's is structurally identical with different rates (85% Eligible Receivables + lesser-of(70% cost, 85% NOLV) × Eligible Inventory − Reserves). Confirms Round 1's `CORE_CANDIDATE` classification of a distinct borrowing-base `FormulaType`, now corroborated by a full reading of a second facility.

**Reserves — refined finding.** Round 1 treated "discretionary reserve" as one undifferentiated primitive. Reading Petco's full Reserves definition shows two genuinely different sub-kinds bundled under one defined term:
- **Named, enumerated reserve categories** (Ad Valorem Tax Reserves, Shrink Reserves, Landlord Lien Reserves, Customer Deposits Reserves, etc.) — each is a specific, agent-calculated dollar figure tied to a named risk category. These are **external certified inputs** (like a `FinancialSnapshot` field), not judgment calls, even though the agent computes them.
- **An open-ended discretionary catch-all** ("any and all other reserves... that reflect risks or contingencies... reasonably likely to... affect the collectability of Eligible Accounts... impair the value of... Collateral..."), gated by the agent's own reasonable/good-faith standard. This is the same *kind* of thing as CHS's §3.19 "good-faith impairment of security" covenant flagged in Round 1 — a **human/discretionary-judgment boundary**, not a deterministic formula input, even though it eventually resolves to a number.

**Entity scope for pool membership.** "Borrowing Base Parties" is explicitly defined as the Borrower plus each Guarantor that is a Restricted Subsidiary — i.e., entity class gates *which entities' assets* count toward the pool, not just which entity may rely on a debt/lien permission. This is a direct Target D/Target F intersection (see §I).

**Provisional/interim state.** Petco's ABL permits newly-acquired Inventory/Credit Card Processor Accounts into the Borrowing Base for up to 90 days pending a field-exam-style Report, capped at 15% of the Borrowing Base in the interim. This is the same underlying mechanic as CommScope/Vistance's "Temporary Borrowing Base" (Round 1, held at `PROVISIONAL_SINGLE_DOCUMENT`). With a second, independent confirmation this round, **this is promoted to `CORE_CANDIDATE`**: a real, recurring "provisional capacity state pending diligence confirmation" pattern.

**Product-boundary determination** (per Target D's explicit ask):

| Category | Example | Headroom's role |
|---|---|---|
| Deterministic contractual formula | `90% × Eligible Accounts + 90% × NOLV(Eligible Inventory) + 100% × Qualified Cash − Reserves` | **Compute it** — this is exactly what the existing formula-tree engine already does for other `FormulaType`s |
| External certified fact | Eligible Accounts = $X, Eligible Inventory = $Y, each named Reserve category = $Z | **Consume it as an external input with provenance**, exactly like `FinancialSnapshot` fields — sourced from the Borrowing Base Certificate, never independently recomputed |
| Discretionary state | The open-ended catch-all Reserve | **Surface it, never silently assume it is zero or resolved** — a fail-closed, human-judgment-adjacent input |
| Human/legal classification | Whether a specific receivable satisfies a specific ineligibility exclusion (foreign obligor, past-due, concentration cap, etc.) | **Out of scope** — Headroom should not independently classify underlying receivables; it accepts the certificate's already-classified totals |

Borrowing-base availability therefore belongs to the same capacity solver as an **input type**, not as a sub-problem the solver resolves independently — it is a periodically-updated external constraint (structurally parallel to a `FinancialSnapshot`), not something Headroom recomputes from raw receivables data. This directly answers Target D's central question and preserves the intended product boundary (contractual rule engine vs. finance-data integration vs. certified external input vs. human judgment).

---

## H. Dynamic-applicability findings

Round 1 found three shapes (threshold step-up/cool-down; springing liquidity-gated applicability; whole-package rating-triggered suspension with retroactive re-testing). This round found four more, all of which test — and, with one qualification, confirm — the hypothesis that these reduce to one generalized `CONDITIONAL_RULE_ACTIVATION` concept where applicability/parameters = `resolver(state, events, time)`.

| New mechanic | Source | Shape | Fits `CONDITIONAL_RULE_ACTIVATION` cleanly? |
|---|---|---|---|
| Equity cure | Petco CA §8.02 | A maintenance-covenant breach can be retroactively cured by a deemed EBITDA add-back from a subsequent equity contribution — capped at 5 uses total, spaced so at least 2 of any 4 consecutive fiscal quarters have no cure, sized no larger than needed, and explicitly excluded from every *other* basket/pricing calculation | **PARTIALLY.** The *usage-limit and spacing-gate* logic is a clean rule-activation predicate (has a cure already been used this recently? how many uses remain?). But the *effect* is not a rule turning on/off — it is a retroactive, scoped override of a **financial input** feeding one specific test. Better modeled as a special `TransactionAssumption`/`FinancialFieldProvenance` value with its own usage-counter state, sitting *alongside* the rule-activation predicate rather than inside it. |
| Covenant Trigger Event (springing FCCR, entry/exit) | Petco ABL §8.01 + definition | Enters when Specified Excess Availability < floor; **exits only after ≥ floor for 20 consecutive calendar days** — an explicit hysteresis (different entry vs. exit condition), not a single boolean test | **YES**, but requires the predicate to be able to reference *past state continuity* (has the exit condition held continuously for N days?), not just a current-instant fact. This generalizes and directly corroborates Coherent's own step-up/cool-down "minimum consecutive quarters" gate as the *same* underlying shape, now confirmed in a second, unrelated company — promotes hysteresis-style dual-threshold predicates from a Coherent-only curiosity to a core, expected sub-pattern. |
| Discharge/Reinstatement of priority state | CHS ABL Intercreditor Agreement §5.7 | A facility's "Discharge" under the intercreditor agreement is automatically deemed reversed if the same category of debt is later reincurred | **YES** — predicate = "has a qualifying reincurrence event occurred since discharge?"; resolver = "if yes, treat the new agreement as the governing one retroactively for intercreditor purposes." Same family as TransDigm's rating-trigger reversion, applied to priority/discharge state instead of covenant-package state. |
| LCA Test-Date freeze | Petco §1.08(f); TransDigm §2.24(c) | The date used to test ratios/conditions for a pending Limited Condition Acquisition is fixed at signing, not closing; explicit no-retroactive-breach protection; concurrent transactions during the pendency window must assume the pending deal already closed | **YES**, but the thing being resolved by state/time is not applicability of a rule or the value of a threshold — it is *which date's facts* the rule is evaluated against. This is best captured as a parameter on the existing measurement-basis/transaction-assumption machinery (a "designated test date" value alongside "evaluation date"), not a new rule-activation primitive, but it does confirm the resolver concept needs to reach further than threshold values and applicability flags — it needs to be able to select an *input date* too. |

**Overall**: the `CONDITIONAL_RULE_ACTIVATION` generalization holds up well and is adopted (§L). The one genuine boundary case is the equity cure, whose *retroactive financial-input-override* character does not fit a pure applicability/parameter predicate — it needs a companion concept (a scoped, usage-limited financial adjustment) rather than a new rule-activation primitive of its own.

---

## I. Entity/guarantor-scope findings

Petco's First Lien CA defines "Excluded Subsidiary" across twelve categories (non-wholly-owned; Foreign Subsidiary; FSHCO; Domestic subsidiary of a Foreign CFC; contractually restricted from guaranteeing; Securitization Subsidiary; not-for-profit; Captive Insurance Subsidiary; cost-prohibitive by agent discretion; tax-adverse by agent discretion; Unrestricted Subsidiary; Immaterial Subsidiary) — with an explicit borrower opt-in election to waive the exclusion for any qualifying entity. This, combined with three recurring findings already surfaced elsewhere this round, converges on a single determination:

- **Entity class gates permission eligibility** (the Non-Loan-Party combined sub-cap, §E/§F — a permission's own usable capacity depends on which entity class is incurring).
- **Entity class gates shared-constraint membership** (the same sub-cap is itself a `SharedCapacityConstraint` filtered by entity class, §F).
- **Entity class gates asset-pool membership** (Borrowing Base Parties = Borrower + Guarantor Restricted Subsidiaries only, §G).
- **Entity class recurs as a nested sub-cap dimension** across four companies now (Petco §7.03(g); TransDigm cl. (14) Foreign Restricted Subsidiaries; CHS cl. (11); CommScope/Vistance §6.3(a) proviso) — reconfirms Round 1's `CORE_CANDIDATE` item 10.

**Determination**: entity scope does **not** need a new node type or a full Restricted/Unrestricted redesignation model (out of scope per the task). The minimum Phase-1 entity model is: (1) a fact table of Restricted Subsidiaries each carrying an `EntityClass` tag (Borrower / Guarantor Restricted Subsidiary / Non-Guarantor Restricted Subsidiary / Foreign Restricted Subsidiary / Unrestricted Subsidiary / Securitization Subsidiary / Immaterial Subsidiary) — which the schema likely needs for guarantor-tracking regardless of this exercise; and (2) `EntityClass` as a standard, reusable **filter dimension** usable in two places that already exist in the proposed ontology: a permission's own eligibility-condition predicate (§E's five-stage decomposition), and a `SharedCapacityConstraint`'s aggregation rule (§F). This is a generalization of two already-proposed concepts, not a new architectural category.

---

## J. Currency/value-measurement findings

Two materially different currency treatments were read this round, one from each of Petco (incremental facilities may be denominated in an Alternative Currency, with the Dollar Amount fixed at the date of incurrence — or, for a Limited Condition Acquisition, the LCA Test Date — "controlling," and not re-tested for subsequent fluctuation) and TransDigm (a genuinely separate Multicurrency Revolving Credit Commitment Class, alongside the Dollar Revolving Credit Commitment Class, with its own Dollar-Equivalent/L/C-exposure tracking, and an Exchange Rate that is re-determined on a periodic "Calculation Date" and then held fixed until the next one — except for the small set of provisions that expressly require a current rate).

Both explicitly protect an already-permitted amount from being retroactively busted by later FX movement (Petco §1.09(a): "No Default or Event of Default shall be deemed to have occurred... solely as a result of changes in rates of currency exchange occurring after the time any applicable action... was permitted... when made"). Neither creates continuous, real-time currency-driven breach risk by design.

**Determination**: currency does **not** introduce a new architectural primitive. It is fully representable as a generalized `VALUE_MEASUREMENT_RULE` (a **measurement rule**, per the task's own proposed taxonomy) with three parameters: `conversionBasis` (fixed-at-event-date / periodically-snapped / continuously-current), `snapEvent` (incurrence date / LCA test date / periodic calculation date), and `retroactiveBreachProtection` (boolean — matches every instance found). This composes directly with the already-proposed `MeasurementBasis`/`FinancialFieldProvenance` concepts from the remediation design as an orthogonal "how do I convert a non-Dollar figure into the Dollar amount a formula needs" rule — not a new node, relationship, or state type. This confirms Target G's hypothesis without qualification.

---

## K. Composition test

The most important analysis in this round, per instruction. For every newly reviewed mechanic: existing concepts used, proposed composition, whether it preserves legal behavior, and — where not fully — what response is proposed.

| Mechanic | Existing concepts used | Composition | Preserves behavior? | Response |
|---|---|---|---|---|
| ABL/Term split-pool exclusive enforcement + mutual standstill | Collateral pool (Round 1 §O item 4); Intercreditor Agreement DocumentType (item 5) | Collateral pool + priority tier answers "who is senior on this pool," which is all Phase 1 needs | **YES** for Phase 1's question; standstill/turnover mechanics themselves are not needed | Leave standstill/turnover/DIP mechanics as out-of-scope future primitives (§D) — not modeled now |
| Senior-Junior same-pool release-on-foreclosure | Collateral pool + priority | Priority tier alone doesn't capture "junior lien is released on senior enforcement" | **PARTIALLY** — for Phase 1's incurrence/priority question, YES; for any future enforcement trace, the release mechanic is invisible | Human/future-primitive boundary — flag as out of Phase 1 scope, not modeled |
| Pari passu designated-controlling-representative | Collateral pool + priority | Priority doesn't apply at all here (no ranking exists) | **NO** for enforcement questions, **N/A** (not needed) for Phase 1's incurrence question | Same as above — out of Phase 1 scope |
| Mixed-collateral proceeds allocation formula | None currently | A genuinely distinct allocation formula | **N/A for Phase 1** — irrelevant to whether debt can be incurred | Leave as a named future primitive (`MIXED_COLLATERAL_ALLOCATION_RULE`), not built now |
| DIP financing subordination-consent | `PRIORITY_CONDITION` (Round 1 §H) | Same AND-branch shape Round 1 already uses for intercreditor joinder | **YES** | None needed — parameterization only |
| Discharge/Reinstatement of priority state | `CONDITIONAL_RULE_ACTIVATION` (this round, §L) | State + event-triggered reversal, same shape as rating-trigger reversion | **YES** | None needed |
| Incremental Fixed+Ratio Amount (both companies) | `amountKind`, `FormulaType`, baseline-freeze ratio test (Round 1 §D item 10/L.12) | Direct match | **YES** | None needed — parameterization only |
| MFN pricing protection (All-In Yield / Yield Differential) | None currently | A permission's incurrence triggers a parameter change on a *different* permission | **NO** — no existing relationship type lets exercising permission A change permission B's own terms | **Add a new relationship type**: `PARAMETER_ADJUSTMENT_TRIGGER` (§L) |
| MFN sunset/exclusions (Excluded Incremental Facility) | Eligibility-condition predicate (Target B decomposition) | A multi-factor AND/OR predicate gating whether the MFN rule applies | **YES** | None needed — parameterization of the eligibility-conditions stage |
| Inside Maturity Exception | Basket-shaped `FormulaType`, reused to gate a *term* exception rather than a dollar amount | Direct structural reuse | **YES** | Generalize the mental model that a basket's "consumption" need not always be a dollar cap — it can gate a term waiver — no schema change needed, since the existing formula already just produces a number that is compared against a usage total |
| WAL / maturity floors | Term-condition attribute (Target B decomposition) | Direct match | **YES** | None needed |
| LCA Election / Test-Date freeze | `MeasurementBasis`/transaction assumptions | Requires the resolver to select an input *date*, not just a threshold value | **PARTIALLY** — the freeze itself composes; the "concurrent pendency stacking" rule (other calculations during the window must assume the pending deal already closed) is a state effect during a window, not currently representable | **Generalize** `MeasurementBasis`/`TransactionAssumptions` to include a designated test date, and add a lightweight, time-bounded state flag for "an LCA Election is pending" that other calculations can consult |
| Currency (Alternative Currency, Multicurrency Class, periodic Exchange Rate snap) | None currently, close to `MeasurementBasis` | A conversion rule with a snap event and a no-retroactive-breach guarantee | **YES**, once generalized | **Generalize** into a `VALUE_MEASUREMENT_RULE` measurement rule, parameterized (§J) — no new node/relationship/state |
| CHS pooled Credit-Facility+Notes cap (deepened) | Round 1's cross-document reference (§O item 1) | Requires an aggregation rule that can enumerate named member clauses/instruments, including through refinancing | **PARTIALLY under Round 1's original framing** (which assumed a live external-balance read); **YES under the generalized `SharedCapacityConstraint`** (§F) | **Generalize** Round 1 item 1 into a `SharedCapacityConstraint` with an `aggregationRule` attribute (merges cleanly with nested sub-caps and Coherent's Reallocated Amount) |
| Non-Loan-Party combined sub-cap | Same `SharedCapacityConstraint` | Entity-class-filtered pool, same shape as the CHS pool with a different filter | **YES** | None needed beyond the generalization above |
| Borrowing Base formula (deepened) | Round 1's new borrowing-base `FormulaType` (§O item 2) | Direct match, now with a fuller advance-rate/reserve structure | **YES** | None needed — parameterization only |
| Reserves (named categories vs. open-ended discretionary) | Round 1's discretionary-reserve attribute (§O item 3) | The named categories are external inputs; the catch-all is human judgment | **PARTIALLY** under Round 1's flat framing | **Split** item 3 into two sub-kinds: `NAMED_RESERVE_CATEGORY` (external input) and `DISCRETIONARY_CATCH_ALL_RESERVE` (human-judgment boundary) |
| Provisional/temporary borrowing-base inclusion | None currently held above `PROVISIONAL_SINGLE_DOCUMENT` | A time-bounded, cap-limited provisional inclusion state | **YES** once promoted | **Promote** to `CORE_CANDIDATE` (now 2-company evidence) as a `STATE` value on the borrowing-base calculation, not a new node |
| Excluded Subsidiary 12-category entity taxonomy | Nested sub-cap (Round 1 §O item 10) | Direct extension — same underlying entity-class-eligibility idea, now with a fuller taxonomy | **YES** | **Generalize** item 10 into a reusable `EntityClass` filter dimension (§I) rather than a capacity-formula-only parameter |
| Equity cure | `TransactionAssumptions`/`FinancialFieldProvenance` | A scoped, usage-limited retroactive financial-input override | **PARTIALLY** — the usage-limit/spacing logic composes as a rule-activation predicate; the retroactive override itself does not fit either existing concept cleanly | **Add** a narrow new sub-type of `TransactionAssumption`/`FinancialFieldProvenance` (`RETROACTIVE_COMPLIANCE_ADJUSTMENT`) carrying its own usage-counter state; not a new node/relationship type |
| Covenant Trigger Event hysteresis | `CONDITIONAL_RULE_ACTIVATION` predicate | Requires the predicate to read past-state continuity (N consecutive days/quarters) | **YES**, once the predicate's expressiveness is confirmed to include continuity windows | **Specify** (not architecturally add) that `CONDITIONAL_RULE_ACTIVATION`'s predicate must support "has condition X held continuously for N periods" as a first-class shape, since it now recurs in two unrelated companies (Coherent, Petco) |

**Summary of the composition test**: of the ~25 mechanics classified above and enumerated in full in §Q, the overwhelming majority preserve legal behavior through parameterization or a modest generalization of an already-proposed concept. Exactly one mechanic (MFN pricing protection) requires a genuinely new relationship type. Three mechanics (mixed-collateral allocation, release-on-foreclosure, designated-controlling-representative) are genuinely new but were determined not to belong to Phase 1's scope at all, on the strength of Target A's own analysis (§D) — they are named and deferred, not force-fit and not silently dropped.

---

## L. Revised minimal ontology

Every concept below is classified per the required taxonomy. Items 1–10 restate and revise Round 1's ten `CORE_CANDIDATE` primitives (§M documents what changed); items 11+ are new to this round.

| # | Concept | Kind | Status vs. Round 1 | Definition |
|---|---|---|---|---|
| 1 | `SharedCapacityConstraint` | **CONSTRAINT** | Generalizes Round 1 item 1 (merges with item 10 and Coherent's Reallocated Amount) | A standalone constraint consumed by one or more permissions, with an `aggregationRule` attribute (`NAMED_MEMBER_CLAUSES` \| `EXTERNAL_INSTRUMENT_BALANCE` \| `ENTITY_CLASS_FILTER`) defining its membership |
| 2 | Borrowing-base `FormulaType` | **MEASUREMENT RULE** | Confirmed, corroborated | `min(commitment, Σ(advance_rate × eligible_collateral) − reserves)`, reading externally certified, periodic collateral values |
| 3a | Named reserve category | **EXTERNAL INPUT** | Split from Round 1 item 3 | A specific, agent-calculated dollar figure tied to a named, document-enumerated risk category |
| 3b | Discretionary catch-all reserve | **HUMAN JUDGMENT** | Split from Round 1 item 3 | An open-ended, agent-discretionary adjustment gated by a subjective "reasonably likely to" standard |
| 4 | Collateral pool | **NODE / ATTRIBUTE** | Confirmed, deeply corroborated by 3 real intercreditor agreements | A named, defined asset grouping; lien priority is a property of `(permission, pool)`, not a scalar on the permission alone |
| 5 | Intercreditor Agreement | **NODE (DocumentType)** | Confirmed, corroborated (3 agreements read) | A document type distinct from a credit agreement/indenture governing relative rights among secured-creditor classes; a company may have several, each with a different control regime |
| 6 | Intercreditor joinder precondition | **PREDICATE** | Confirmed | A debt-incurrence permission's eligibility condition requiring the incurring party's representative to join a named intercreditor agreement |
| 7 | Equal-and-ratable lien pull-up | **RELATIONSHIP** | Confirmed, unchanged | Inverse of the automatic-lien-tied-to-basket pattern |
| 8 | `CONDITIONAL_RULE_ACTIVATION` | **PREDICATE + STATE + EVENT** | Generalizes Round 1 items 8+9, plus Coherent's step-up/cool-down | `applicability/params = resolver(state, events, time)`; predicate must support point-in-time facts, continuity windows (hysteresis), and event-triggered reversal |
| 9 | (merged into 8) | — | — | Round 1 item 9 (covenant-package suspension) is a special case of item 8, not separate |
| 10 | `EntityClass` filter | **ATTRIBUTE** | Generalizes Round 1 item 10 | A reusable filter dimension (Borrower / Guarantor RS / Non-Guarantor RS / Foreign RS / Unrestricted Sub / Securitization Sub / Immaterial Sub) usable on a permission's eligibility predicate and on a `SharedCapacityConstraint`'s aggregation rule |
| 11 | `PARAMETER_ADJUSTMENT_TRIGGER` | **RELATIONSHIP** | **New this round** | A relationship where exercising permission A automatically changes a parameter (e.g., pricing margin) of a different, named permission B — evidenced by Petco's and TransDigm's MFN mechanics |
| 12 | `RETROACTIVE_COMPLIANCE_ADJUSTMENT` | **EXTERNAL INPUT (sub-type) + STATE** | **New this round** | A scoped, usage-limited (count + spacing), size-capped retroactive override of one financial input for one named covenant test — evidenced by Petco's equity cure |
| 13 | `VALUE_MEASUREMENT_RULE` (currency) | **MEASUREMENT RULE** | **New this round** | Parameterized conversion rule (`conversionBasis`, `snapEvent`, `retroactiveBreachProtection`) for non-Dollar amounts |
| 14 | Designated test-date parameter | **ATTRIBUTE (on MeasurementBasis/TransactionAssumptions)** | **New this round**, parameterization only | Selects which date's facts govern a ratio/condition test (evaluation date vs. designated LCA test date) |
| 15 | Pending-LCA state flag | **STATE** | **New this round** | A time-bounded flag marking that a Limited Condition Acquisition is pending, consulted by other concurrent calculations |
| 16 | Provisional borrowing-base inclusion | **STATE** | Promoted from Round 1's `PROVISIONAL_SINGLE_DOCUMENT` | A time-bounded, percentage-capped interim inclusion of newly acquired collateral pending diligence confirmation |
| 17 | Good-faith/subjective covenant standard | **HUMAN JUDGMENT** | Reconfirmed, unchanged | Unchanged from Round 1 — a compliance test explicitly framed as subjective |
| 18 | *(deferred, not core)* Enforcement-control regime | **ATTRIBUTE (future)** | **New this round, explicitly deferred** | Which of exclusive-per-pool / senior-controls-release-on-foreclosure / designated-controlling-representative governs a given intercreditor relationship — needed for a future LME module, not Phase 1 |
| 19 | *(deferred, not core)* Mixed-collateral allocation rule | **MEASUREMENT RULE (future)** | **New this round, explicitly deferred** | The proceeds-splitting waterfall for a disposition spanning two collateral pools — enforcement-scoped, not incurrence-scoped |

---

## M. Concepts merged or removed since Round 1

- **Round 1 item 1 (cross-document capacity reference) and item 10 (nested guarantor sub-cap) merge into one generalized `SharedCapacityConstraint`** (§F, §L item 1). Round 1 treated these as two separate primitives; reading CHS's actual pooled-cap text this round shows they are the same shape with different aggregation criteria.
- **Round 1 items 8 and 9 (springing applicability; covenant-package suspension) merge into one `CONDITIONAL_RULE_ACTIVATION` concept** (§H, §L item 8), rather than remaining two separate state-transition primitives — this round's equity-cure, discharge/reinstatement, and hysteresis findings all fit the same generalized resolver shape.
- **Round 1 item 3 (discretionary reserve) splits into two sub-kinds** (named/external vs. open-ended/human-judgment) rather than remaining one attribute (§G, §L items 3a/3b) — the split was invisible in Round 1's summary-level reading and only became clear from Petco's full Reserves definition.
- **Round 1 item 10's framing as a capacity-formula-only "sub-cap" parameter is broadened into a reusable `EntityClass` filter dimension** usable on both permission eligibility and shared-constraint aggregation (§I, §L item 10) — not a removal, but a generalization that changes where the concept can be used.
- No Round-1 concept is rejected or demoted outright this round; every one of the ten items either held up unchanged (items 4–7) or was strengthened/generalized by new primary-source evidence (items 1, 3, 8–10).

---

## N. Solver problem classes

Classifying the mechanics encountered this round (§C–§K) into the task's proposed categories:

| Class | Mechanics observed this round |
|---|---|
| **A. Arithmetic evaluation** | Fixed Incremental Amount / Ratio Amount sizing; borrowing-base advance-rate formula; currency dollar-equivalent conversion; MFN yield-differential calculation |
| **B. Eligibility evaluation** | Excluded Incremental Facility multi-factor test; intercreditor joinder precondition; Excluded Subsidiary classification; equity-cure usage-limit check |
| **C. Allocation** | Mixed-collateral proceeds allocation (deferred, LME-scoped); Non-Loan-Party combined sub-cap draw-down across two source baskets |
| **D. Constraint satisfaction** | CHS pooled Credit-Facility+Notes cap (multiple debt sources against one ceiling); WAL/maturity floor jointly with pricing MFN on a single incremental tranche |
| **E. State transition** | Covenant Trigger Event entry/exit; Discharge/Reinstatement of intercreditor priority; equity-cure usage-counter decrement; MFN's `PARAMETER_ADJUSTMENT_TRIGGER` repricing a different permission |
| **F. External-input dependency** | Named Reserve categories; Eligible Accounts/Eligible Inventory certified totals; periodic Exchange Rate snap |
| **G. Human judgment** | Discretionary catch-all Reserve; good-faith impairment-of-security covenant (Round 1, reconfirmed); which entity-classification exclusions apply to a specific receivable |

No mechanic this round required a class beyond these seven. This reinforces Round 1's implicit finding that the eventual Headroom engine is a **combination**: primarily a constraint/graph evaluator over permissions and shared constraints (classes A/B/D), with a state machine layer for dynamic applicability and cross-permission effects (class E), and explicit boundary handling for external inputs and human judgment (classes F/G) rather than an attempt to resolve everything deterministically. Allocation (class C) recurs but, on this round's evidence, is needed only for shared-basket draw-down among Phase-1-scoped permissions — the harder allocation problem (mixed-collateral proceeds) is LME-scoped and deferred.

---

## O. Provenance implications

Every proposed core concept in §L was checked against whether a future transaction trace could still explain its result back to governing language:

- **`SharedCapacityConstraint`**: provenance is *more* important here than for a single-document basket, not less — the trace must carry the constraint's own section citation *and* each contributing permission's own document/section, since CHS's pool spans a credit facility and three bond series. This is representable (each contributing permission already carries its own `sourceProvision`) but must not be dropped when permissions are aggregated into one constraint.
- **`CONDITIONAL_RULE_ACTIVATION`**: the trace must be able to show *which* predicate state applied and *why* (e.g., "Covenant Trigger Event was active because Excess Availability fell below floor on date X and had not yet held ≥ floor for 20 consecutive days") — a bare "applicable"/"not applicable" flag would lose the reasoning a lawyer needs to check. The hysteresis/continuity requirement (§H, §L item 8) makes this more demanding than a simple point-in-time predicate, but does not make it unrepresentable.
- **`PARAMETER_ADJUSTMENT_TRIGGER`**: the trace must show which *other* permission was affected and by how much (e.g., "Term Loan margin increased 25bp because Incremental Facility X's All-In Yield exceeded it by 100bp, cushion 75bp") — this is a genuinely new provenance requirement (an effect landing outside the permission being evaluated) but is representable as an additional trace entry keyed to the affected permission.
- **`RETROACTIVE_COMPLIANCE_ADJUSTMENT`**: provenance must show the adjustment was scoped to exactly one covenant test, was not carried into any other basket/pricing calculation, and consumed one of a limited number of uses — all three facts (scope, non-carryover, usage count) must survive into the trace or the equity cure's own contractual limits become invisible.
- **Named vs. discretionary Reserves**: the trace should distinguish which reserve dollars came from a named, document-enumerated category versus the open-ended discretionary catch-all, since only the latter carries a human-judgment caveat.
- No concept in §L makes provenance materially harder in a way that would argue against adopting it; the two genuinely new relationship/state concepts (11, 12) add trace *requirements*, not trace *impossibilities*.

---

## P. Fail-closed requirements

For each target area, behavior when necessary information is absent:

| Missing input | Required behavior |
|---|---|
| Intercreditor agreement not read / not on file | `review_required`, distinguishing "precondition unmet" from "precondition status not investigated" (per Round 1 §S, reconfirmed) — never assume joinder is satisfied |
| Unknown collateral pool for a proposed lien | `review_required` — never assume first-priority or any specific pool by default |
| Unknown entity classification (which `EntityClass` a subsidiary falls into) | `review_required` on any permission/constraint whose eligibility or aggregation depends on that classification — never assume "Guarantor" (most favorable) or "Excluded" (least favorable) by default |
| Missing borrowing-base certificate / unknown Eligible Accounts-Inventory figures | No borrowing-base capacity may be reported; status is `external_input_required`, not zero and not the prior period's figure silently carried forward |
| Unknown discretionary reserve | Never assume zero — surface as an unresolved, human-judgment-adjacent input; a `modeled` result must not silently treat an unknown catch-all reserve as $0 |
| Incomplete amendment chain (e.g., which of several IC agreements currently governs) | `review_required`, citing the specific document/version gap, not the most recent known version by default |
| Unknown MFN applicability (whether a given incremental tranche is an "Excluded Incremental Facility") | `review_required` — never assume MFN does or does not apply |
| Missing ratings state (TransDigm-style covenant suspension) | Treat the covenant package as **active** (the more restrictive default) until Investment Grade Ratings + no-Default are affirmatively confirmed, per Round 1's existing fail-closed posture |
| Unknown acquisition step-up/LCA-pendency state | Never assume a step-up or an LCA-pendency freeze is in effect without an affirmative trigger fact on record; equally, never assume it is *not* in effect if a qualifying acquisition is on record but its precise dates are unconfirmed — `review_required` |
| Unavailable FX measurement/Calculation Date | `review_required` for any Alternative-Currency-denominated amount whose conversion date cannot be confirmed — never default to a current spot rate when the contract specifies a fixed snap date |
| Equity-cure usage count/spacing unknown | Never assume a cure is available; `review_required` until the count of prior uses and their spacing is confirmed |

Consistent with Round 1's own design: no missing input may silently create affirmative capacity, and the same small set of generalized uncertainty statuses (`review_required`, `transaction_assumption_required`, `external_input_required`) should cover all of the above rather than a proliferation of feature-specific status codes.

---

## Q. Round 1 vs. Round 2 closure metrics

Diagnostic only, not a rigorous measurement — consistent with Round 1's own caveat about this kind of count.

**Discovery**: 6 primary source documents newly read in full this round (3 intercreditor agreements never previously fetched; 2 complete incremental-facility sections, one closing a Round-1 `SOURCE_CHAIN_INCOMPLETE`; 1 deepened borrowing-base/entity-scope re-read), covering roughly 25 materially distinct mechanics (enumerated across §D–§J and tabulated in §K).

| Bucket | Count | Examples |
|---|---|---|
| Cleanly represented (parameterization only) | ~15 | Fixed+Ratio Amount sizing; MFN eligibility exclusions; WAL/maturity floors; DIP subordination-consent; discharge/reinstatement; borrowing-base formula; provisional inclusion; entity-taxonomy sub-caps; currency conversion once generalized |
| Requiring generalization of an existing concept | ~7 | `SharedCapacityConstraint` (merges 2 Round-1 items); `CONDITIONAL_RULE_ACTIVATION` (merges 2 Round-1 items); `EntityClass` filter dimension; Reserves split; LCA test-date parameter |
| Genuinely new architectural primitive | 3 | `PARAMETER_ADJUSTMENT_TRIGGER` (adopted); enforcement-control regime + mixed-collateral allocation (both named, both explicitly deferred as out-of-Phase-1-scope) |

**Reuse ratio** (cleanly represented + generalization-only) / total ≈ 22/25 ≈ **0.88**, versus Round 1's ≈0.41.
**Novelty ratio** (genuinely new primitives) / total ≈ 3/25 ≈ **0.12**, versus Round 1's ≈10/22 ≈ 0.45 — and of those 3, only 1 was actually adopted into the core ontology; the other 2 were deliberately scoped out rather than built around.

**Has architectural novelty materially decreased?** Yes, clearly, on both the raw ratio and — more importantly — on the qualitative pattern: Round 1's four gaps were each a distinct new *category* the ontology had no vocabulary for at all (shared caps, borrowing bases, collateral-pool priority, dynamic applicability). Round 2's one adopted new primitive (`PARAMETER_ADJUSTMENT_TRIGGER`) is a single, narrow relationship type layered on top of concepts that already exist; everything else this round either composed directly or required merging/generalizing Round-1 primitives that were already anticipated in Round 1's own §O, not inventing new ones from scratch. The two deferred items are new but were deliberately excluded from Phase 1's problem, not left unresolved within it.

---

## R. Remaining unknowns

- **LME/enforcement mechanics** (standstill, turnover, mixed-collateral allocation, release-on-foreclosure, DIP priority override, designated-controlling-representative) are now well-evidenced from real primary sources but are **deliberately not part of the Phase-1 core ontology** — they belong to a future enforcement/LME module. This is a scope decision, not an evidentiary gap.
- **Whether the 2018 CHS intercreditor agreements are still the operative, unamended governing documents as of the 2025 Notes issuance** was not independently confirmed this round (the 2025 indenture's own recitals reference "the Intercreditor Agreements" without this session tracing an amendment chain) — a `SOURCE_CHAIN_INCOMPLETE` note, not a finding that changes the ontology.
- **Petco's ABL eligibility-exclusion and concentration-limit clauses** (the itemized carve-outs within "Eligible Accounts"/"Eligible Inventory") were not individually enumerated — the top-level formula and Reserves definition are sufficient for the architectural question this round asked, but a future round wanting to test whether Headroom needs any *further* granularity inside eligibility classification itself would need this.
- **Whether `PARAMETER_ADJUSTMENT_TRIGGER` recurs with a materially different shape in a third company** (e.g., a leverage-based, rather than yield-based, cross-permission trigger) was not tested — this round found the same MFN shape in two companies, which is enough to adopt the concept per the task's own two-company promotion bar, but a genuinely different trigger shape (not just different cushion parameters) has not been ruled out.
- **Whether the equity-cure mechanic's `RETROACTIVE_COMPLIANCE_ADJUSTMENT` shape recurs** was not independently corroborated in a second company this round (Petco is the only source) — held at a single-document confidence level pending a second sighting, consistent with the task's own promotion discipline, though it is a well-known, market-standard mechanic on its face.

---

## S. Final recommendation

**READY_FOR_SOLVER_DESIGN.**

The permission-level vocabulary remained completely stable this round — nothing in six new primary-source documents required revisiting the debt/lien grant-type split, amount-kind split, or the six-way stacking-relationship taxonomy confirmed in Round 1. Most newly encountered mechanics were handled by composition, parameterization, or a modest, well-evidenced generalization of an already-proposed Round-1 concept (§Q: ~88% reuse this round vs. ~41% in Round 1). Structural novelty has materially tapered: Round 1 produced four distinct new architectural *categories*; Round 2 produced one narrow new *relationship type* within the existing categories, plus two more genuinely new concepts that were determined — on primary-source evidence, not by assumption — to belong outside Phase 1's problem altogether and are named for later rather than built around now. Both of the specific evidentiary gaps Round 1 named as blocking further confidence (intercreditor agreements' own text; a second complete, non-restated incremental-facility/MFN formula) were closed this round with real primary sources, and both closed *without* producing the kind of structural surprise Round 1's own gaps did — reinforcing rather than undermining the current model.

No known major debt/liens architecture remains obviously untested for Phase 1's actual scope (can proposed debt be incurred and secured, with what priority, subject to what shared/entity/currency/dynamic-applicability constraints). The remaining unknowns (§R) are either explicit, deliberate scope exclusions (LME/enforcement), a single-document-confidence item awaiting ordinary second-sighting corroboration (equity cure), or genuinely reasonable to leave as external inputs, certified facts, or human judgment rather than further architecture (borrowing-base eligibility classification, discretionary reserves, good-faith covenant standards) — exactly the categories the task's own promotion standard treats as acceptable residue rather than blockers.

This is not a claim that every debt document has been tested, or that further research could not continue productively. It is the narrower, practical claim the task asks for: the fundamental building blocks — permissions, stacking relationships, shared constraints, collateral pools with per-pool priority, conditional rule activation, entity-class filters, external/certified inputs, and now one cross-permission parameter-adjustment relationship — appear sufficient to represent unfamiliar debt/lien documents primarily through configuration and composition, not new source code, which is the actual bar for beginning solver design.
