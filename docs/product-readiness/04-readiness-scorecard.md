# Product readiness scorecard — independent view

Categories (mission vocabulary): VERIFIED_ON_TESTED_SCOPE · PARTIALLY_VERIFIED · IMPLEMENTED_UNVERIFIED ·
UNSUPPORTED · BLOCKED_BY_EVIDENCE · NOT_TESTED. No percentages. No certification claims. Scope = the ten synthetic
packages, offline, model stages mocked (see `02-acceptance-matrix.md`); refreshed at `83e6bf1` with the mutation suite
(doc 09) and the benchmark (doc 08).

| capability | status | basis (tested scope) | what stops a higher status |
|---|---|---|---|
| Parse a single, cleanly drafted agreement into articles / sections / nested clauses | VERIFIED_ON_TESTED_SCOPE | A, B, C, D, F: every exact structure expectation met, 4-level nesting round-trips (E) | — |
| Parse agreements with a table of contents | UNSUPPORTED (fail-closed) | E: TOC lines become duplicate nodes; every reference AMBIGUOUS; triage parser exists but not on the certified path | IPV-11 |
| Parse enumerations with a dropped letter, or scan artefacts in headings / enumerators | UNSUPPORTED (silent) | G: (d) merged into (b); MUT-17/19: spaced heading and homoglyph enumerator merge the covenant silently; MUT-18: 'SECTION 7.0l' mints a bogus '7.0' node | IPV-07, IPV-23 |
| Definitions index (quoted "Term" means …) | PARTIALLY_VERIFIED | all packages resolve the declared terms; inline (i)/(ii)/(A)/(B) inside a definition mis-sources following definitions (H, E); exhibit "Term:" lines indexed (G) | IPV-06, IPV-08 |
| Package graph: classify documents, resolve "Amendment No. N to the Credit Agreement dated …" | PARTIALLY_VERIFIED | C resolves both amendments; H "FIRST AMENDMENT … to the ABL Credit Agreement" and the intercreditor relation are UNRESOLVED | IPV-05 |
| Deterministic amendment effects (section restate / delete, explicit effective dates) | VERIFIED_ON_TESTED_SCOPE | C: RESOLVED effects with the right dates; G stale amendment UNRESOLVED (correct); MUT-05/11; INV-06 conditional effectiveness held back (correct) | — |
| Amendment of a DEFINITION ('the definition of X in Section 1.01 is hereby amended and restated …') | UNSUPPORTED (wrong) | INV-05: resolved as REPLACE_TEXT of the whole of Section 1.01 (1,537 → 243 chars); the compiler still receives the old definition | IPV-19, IPV-20 |
| Operative state per as-of date (clause-level) | VERIFIED_ON_TESTED_SCOPE | C: 7/7 across three dates incl. historical, superseded and deleted | — |
| Operative state honesty when an amendment cannot be attached | UNSUPPORTED | H: RESOLVED with zero unattached effects while the pipeline holds an UNRESOLVED effect | IPV-05 |
| Operative state when a side letter / waiver overrides a covenant | UNSUPPORTED (silent) | MUT-08/MUT-12: zero effects, instrument RESOLVED on the base text; tightening direction is a false permission | IPV-16 |
| Operative state after a new amendment / changed amendment amount | VERIFIED_ON_TESTED_SCOPE | MUT-05, MUT-11: propagate correctly at every as-of date | — |
| Operative text for a section whose sub-clauses were amended | UNSUPPORTED (wrong) | C: section-level candidate compiled from stale text, no lineage; Layer-1 demands the stale baskets | IPV-04 |
| Discovery (Pass A deterministic signals) | PARTIALLY_VERIFIED | every material covenant node carries a signal in A–H except the merged G clause; over-inclusive by design | discovery Pass B–D NOT_TESTED |
| Discovery (semantic passes) | NOT_TESTED | requires a provider | — |
| Context retrieval: same-document definitions, cross-references | PARTIALLY_VERIFIED | singular terms and section cross-references resolve (declared cross-references reachable, incl. through definitions); inflected forms do not: 26 of 28 inflected-only uses miss the definition (INV-18); undefined terms inside retrieved definitions not surfaced (H); amended text's new term not retrieved (C); definition-mediated closure symmetric (J and K controls) | IPV-09 (MATERIAL), IPV-10, IPV-04 |
| Dangling cross-reference (target section does not exist) | VERIFIED_ON_TESTED_SCOPE | MUT-10: index reports no node; hybrid closure flags it; cross-reference audit fails closed | — |
| Establishing the legal universe for a question without a model | VERIFIED_ON_TESTED_SCOPE (evaluation model) | benchmark: hybrid closure 18/18 restrictions, 16/16 conditions, 0 false permissions on 14 cases; naive top-k 5 false permissions | not product code yet (doc 08) |
| Structural identity across document versions | UNSUPPORTED | node ids positional; any insertion shifts later ids, a swap re-labels (doc 09 §3) | no cross-version mapping exists |
| Freedom from issuer-specific logic | PARTIALLY_VERIFIED | static audit: no company-specific branches/ids in compiler or runtime; vocabularies grown on one issuer's drafting | doc 09 §5 |
| Context retrieval across documents (indenture vs credit agreement definitions) | VERIFIED_ON_TESTED_SCOPE | B: no cross-document definition leakage observed; Restricted Subsidiary never imported into the CA | — |
| Semantic normalizer + accountability + provenance binding on a faithful submission | PARTIALLY_VERIFIED | A/B/C/F/H faithful units certify or review for stated reasons; definitions candidates with embedded numbers review (mock limitation) | mocked model |
| Refusal of wrong-amount / non-operative-source / truncated / undefined-term claims | VERIFIED_ON_TESTED_SCOPE | 30 of 35 adversarial cases refused (see matrix); I-P2 refused for an unrelated reason | — |
| Covenant-family vocabulary coverage | PARTIALLY_VERIFIED | K: prepayments of junior debt have no family; relabelled with a 'verify manually' issue (fail-closed) | IPV-18 |
| Definition dependency graph on common drafting ('Guarantor means each Subsidiary that …') | UNSUPPORTED (false refusal) | INV-19/19b: a diamond dependency is reported as a DEFINITION_CYCLE; 4 of 33 section-level candidates (I, L) uncertifiable for it; B's true cycle reported correctly | IPV-21 |
| Refusal of a figure used in the wrong role or direction (threshold as a cap; ratio comparator flipped) | UNSUPPORTED | INV-25/25b: certified as a $5,000,000 basket (L) and a $15,000,000 payment basket (H intercreditor), 2 of 5 comparator figures; INV-09b: A 7.01(c) 'at least 3.50' for 'does not exceed 3.50' certified; a raised threshold is refused | IPV-22 |
| Refusal of a dropped material condition | PARTIALLY_VERIFIED | refused as a pure omission; accepted when the proviso item is cited on the rule (A, H) | IPV-03 |
| Refusal of a dropped "together with" shared cap | UNSUPPORTED | accepted in both variants (F) | IPV-02 |
| Refusal of a widened entity scope | UNSUPPORTED | accepted and confirmed by the scope guard (A) | IPV-01 |
| Action ontology consistency guard | PARTIALLY_VERIFIED | catches a mislabelled Liens/Investments section (G-P3); misreads "Disposition" and "purchase money" (D, E) | IPV-13 |
| Layer-2 adversarial review | NOT_TESTED | mocked silent | — |
| Certification decision over a sealed population | IMPLEMENTED_UNVERIFIED | runs end-to-end; its verdicts in this run reflect mocked inputs | mocked model |
| Runtime: ledger-aware capacity, shared pools, approved-only snapshots, exact as-of, explicit supersession, duplicate quarantine, simulation | VERIFIED_ON_TESTED_SCOPE | F: 14/14 on fixture IR | fixture IR, not compiled IR |
| Runtime: foreign-currency baskets | PARTIALLY_VERIFIED | EUR figure reported in EUR, never converted; no FX contract exists | no FX input kind |
| Runtime: builder baskets (Available Amount with prior-usage subtraction), springing covenants, reclassification elections | NOT_TESTED | not modelled in the fixture IR; manifest records them as UNSUPPORTED constructs with acceptable outcomes | — |
| Persistence of verified units / app wiring of Phase 4 | BLOCKED_BY_EVIDENCE | out of scope for an offline run; North Star reconciliation notes Phase 4 is in-memory only | — |
| Live end-to-end on a real agreement | NOT_TESTED (this mission) | prior live evidence exists under docs/phase-3-live-validation (immutable); not re-run | — |

Reading: the deterministic substrate (structure, amendments at clause level, operative state, runtime arithmetic) is
solid on clean input and fails closed on most adversarial input. The six places it does **not** fail closed
(entity-scope widening, shared-cap omission, lineage-laundered condition omission, side-letter override, definition
amendment applied to the wrong unit with stale retrieval, a gate threshold certified as a cap) are exactly where a reviewer-free
pipeline would show a borrower more room than the contract gives, and the stale-text section candidate (IPV-04) is
the one place it can verify against the wrong source.
