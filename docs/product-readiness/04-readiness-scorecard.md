# Product readiness scorecard — independent view

Categories (mission vocabulary): VERIFIED_ON_TESTED_SCOPE · PARTIALLY_VERIFIED · IMPLEMENTED_UNVERIFIED ·
UNSUPPORTED · BLOCKED_BY_EVIDENCE · NOT_TESTED. No percentages. No certification claims. Scope = the eight synthetic
packages, offline, model stages mocked (see `02-acceptance-matrix.md`).

| capability | status | basis (tested scope) | what stops a higher status |
|---|---|---|---|
| Parse a single, cleanly drafted agreement into articles / sections / nested clauses | VERIFIED_ON_TESTED_SCOPE | A, B, C, D, F: every exact structure expectation met, 4-level nesting round-trips (E) | — |
| Parse agreements with a table of contents | UNSUPPORTED (fail-closed) | E: TOC lines become duplicate nodes; every reference AMBIGUOUS; triage parser exists but not on the certified path | IPV-11 |
| Parse enumerations with a dropped letter | UNSUPPORTED (silent) | G: (d) merged into (b) | IPV-07 |
| Definitions index (quoted "Term" means …) | PARTIALLY_VERIFIED | all packages resolve the declared terms; inline (i)/(ii)/(A)/(B) inside a definition mis-sources following definitions (H, E); exhibit "Term:" lines indexed (G) | IPV-06, IPV-08 |
| Package graph: classify documents, resolve "Amendment No. N to the Credit Agreement dated …" | PARTIALLY_VERIFIED | C resolves both amendments; H "FIRST AMENDMENT … to the ABL Credit Agreement" and the intercreditor relation are UNRESOLVED | IPV-05 |
| Deterministic amendment effects (restate / delete, explicit effective dates) | VERIFIED_ON_TESTED_SCOPE | C: RESOLVED effects with the right dates; G stale amendment UNRESOLVED (correct) | — |
| Operative state per as-of date (clause-level) | VERIFIED_ON_TESTED_SCOPE | C: 7/7 across three dates incl. historical, superseded and deleted | — |
| Operative state honesty when an amendment cannot be attached | UNSUPPORTED | H: RESOLVED with zero unattached effects while the pipeline holds an UNRESOLVED effect | IPV-05 |
| Operative text for a section whose sub-clauses were amended | UNSUPPORTED (wrong) | C: section-level candidate compiled from stale text, no lineage; Layer-1 demands the stale baskets | IPV-04 |
| Discovery (Pass A deterministic signals) | PARTIALLY_VERIFIED | every material covenant node carries a signal in A–H except the merged G clause; over-inclusive by design | discovery Pass B–D NOT_TESTED |
| Discovery (semantic passes) | NOT_TESTED | requires a provider | — |
| Context retrieval: same-document definitions, cross-references | PARTIALLY_VERIFIED | singular terms and section cross-references resolve; plural forms do not (D/E/F/G); undefined terms inside retrieved definitions not surfaced (H); amended text's new term not retrieved (C) | IPV-09, IPV-10, IPV-04 |
| Context retrieval across documents (indenture vs credit agreement definitions) | VERIFIED_ON_TESTED_SCOPE | B: no cross-document definition leakage observed; Restricted Subsidiary never imported into the CA | — |
| Semantic normalizer + accountability + provenance binding on a faithful submission | PARTIALLY_VERIFIED | A/B/C/F/H faithful units certify or review for stated reasons; definitions candidates with embedded numbers review (mock limitation) | mocked model |
| Refusal of wrong-amount / non-operative-source / truncated / undefined-term claims | VERIFIED_ON_TESTED_SCOPE | 24 of 29 adversarial cases refused (see matrix) | — |
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
solid on clean input and fails closed on most adversarial input. The three places it does **not** fail closed
(entity-scope widening, shared-cap omission, lineage-laundered condition omission) are exactly where a reviewer-free
pipeline would show a borrower more room than the contract gives, and the stale-text section candidate (IPV-04) is
the one place it can verify against the wrong source.
