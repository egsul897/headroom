# Evidence quality scorecard

What evidence exists for each readiness claim at `83e6bf1`, what kind it is, and what would upgrade it. Modes: PRODUCTION
(production code over pinned fixtures), MOCKED (scripted stand-in feeding production checks), NOT_RUN. Evidence kinds:
MEASURED_OFFLINE (reproducible from the committed run), DETERMINISTIC_ESTIMATE (arithmetic over measured counts),
HYPOTHETICAL_PROJECTION (no measurement behind it), HISTORICAL_LIVE (immutable evidence dirs from earlier phases, not
re-run here). Each row names the artefact; a claim with no artefact is NOT_TESTED.

| claim (from `04-readiness-scorecard.md`) | evidence kind | artefact | strength | what would upgrade it |
|---|---|---|---|---|
| Structure parsing on clean drafting | MEASURED_OFFLINE, PRODUCTION | `acceptance-runs/83e6bf1d3ce0/report.json` STRUCTURE rows A–D, F, I, J (all exact expectations met) | strong on synthetic drafting; weak on real formatting (page headers, footnotes, OCR) | one redacted real package per design partner through the deterministic stages (no model needed) |
| TOC / dropped letter / inline enumeration / exhibit "Term:" (IPV-06/07/08/11) | MEASURED_OFFLINE | same run, E/G/H STRUCTURE findings | strong (deterministic, reproducible) | fix + re-run; add OCR-noise variants to the corpus |
| Amendment effects, operative state at clause level | MEASURED_OFFLINE | C: 7/7 across three dates; MUT-05/MUT-11 show a new amendment and a changed amendment amount propagate; INV-06 conditional effectiveness held back | strong for section restate/delete forms | waiver/consent/side-letter forms (IPV-16) untested beyond mutants |
| Definition amendments | MEASURED_OFFLINE | INV-05 (`invariant-runs/`): mis-targeted to the whole section (IPV-19); retrieval stale (IPV-20) | strong, negative | fix + re-run; add the add-back-removal direction |
| Operative state with an override document | MEASURED_OFFLINE | MUT-08/MUT-12 PRODUCT verdicts (IPV-16) | strong, negative | fix; add side-letter fixtures to every package family |
| Unresolved amendment honesty (IPV-05) | MEASURED_OFFLINE | H OPERATIVE_STATE finding | strong, negative | fix + re-run |
| Context retrieval (definitions, cross-references) | MEASURED_OFFLINE | CONTEXT_RETRIEVAL rows (cross-reference audit added at `83e6bf1`; package K three-way control symmetric; IPV-17 closed as a harness false positive) | medium: plural forms and depth-2 terms fail (IPV-09/10) | fix IPV-09/10 |
| Discovery completeness (Pass A) | MEASURED_OFFLINE | DISCOVERY_PASS_A rows: signals cover every material node except G's merged clause | medium: over-inclusive by design; Pass B–D NOT_RUN | live Pass B–D on the corpus (paid experiment E1 in doc 15) |
| Extraction architecture (closure recall, false permissions) | MEASURED_OFFLINE over evaluation models | `benchmark-runs/00977b674579/benchmark.json`; strategies B/C are evaluation models of the production stages, A is the production population | medium: measures closure quality, not model output | live run of the hybrid on 3–5 packages with the real Pass B (E2) |
| Cost per package / per question | DETERMINISTIC_ESTIMATE | doc 08 §"Secondary economics" (5 calls/unit, 1,800 prompt overhead tokens, locked rate card) | weak until measured | one metered live run (E2) replaces the estimate |
| Latency | HYPOTHETICAL_PROJECTION | doc 08 | none | measured on E2 |
| Semantic composition / accountability / provenance refusals | MEASURED_OFFLINE, MOCKED input | adversarial table in `02-acceptance-matrix.md` (24/29 refused; I/J have no adversarial cases yet) | medium: refusals are deterministic-layer refusals; accepts (IPV-01/02/03) are real gaps | author I/J adversarial plans; live Layer-2 reviewer on the same cases (E3) |
| Layer-2 reviewer effectiveness | NOT_RUN | — | none | E3 |
| Certification decision | MEASURED_OFFLINE on mocked inputs | CERTIFICATION rows | weak as evidence of correctness; strong as evidence that the gates execute | live run |
| Runtime arithmetic, ledger, snapshot policy | MEASURED_OFFLINE, PRODUCTION over fixture IR | F: 14/14 (`runtime-f.ts`) | strong for the modelled constructs | compiled IR (not hand-built) feeding the runtime; builder/springing/reclassification constructs |
| Operative-source authentication (PR #136) | MEASURED_OFFLINE in an integration worktree | doc 07; `source-authority.test.ts` 22/28 on `982c3bc` | strong, partly negative (F1–F4) | fix + re-run; the 28 cases run on every PR #136 revision |
| Mutation robustness of the acceptance suite | MEASURED_OFFLINE | `mutation-runs/83e6bf1d3ce0` (8/12 killed; 3 declared gaps) | medium | text-hash pinning per covenant node turns MUT-02-class gaps into kills |
| Generality (no issuer-specific logic) | MEASURED (static audit) | doc 09 §5 | medium: absence of literals, not presence of evidence | each new real package family that passes without pattern additions is the evidence |
| Live end-to-end on a real agreement | HISTORICAL_LIVE | `docs/phase-3-live-validation/`, `docs/phase-3-conmed-population-verified/` (immutable, not re-run) | not assessed by this track | re-run under the current SHA when paid execution is authorised |

## Reading

- Everything deterministic is measured and reproducible in seconds; that evidence is strong and has found 17 defects.
- Everything that depends on a model is either mocked (so only the *gates* are exercised) or not run. No statement
  about extraction quality, discovery completeness or reviewer effectiveness can be made from this branch.
- Cost and latency are estimates and projections respectively; doc 08 labels them as such and they must not be quoted
  as measurements.
