# SHA-pinned evidence report

| Field | Value |
|---|---|
| STARTING_MAIN_SHA | `14c805c6412ca36bfe753112abac78fa6c3736fa` |
| Historical baseline (stale) | `d924f5b6c47f1d63982bb4385579d6858cdaf067` |
| ENDING_SHA | Recorded in `artifacts/summary.json` after runner on tip |
| Evaluation date | `2024-12-31` |
| Issuer | Matthews International (MATW) / CIK 0000063296 |

## Exact citations (anchor)

| Document | Accession | Exhibit |
|---|---|---|
| Indenture 8.625% SS 2L Notes due 2027 | `0001193125-24-228450` | EX-4.1 |
| Third A&R Loan Agreement (base) | `0000063296-20-000040` | EX-10.1 |
| Sixth Amendment | `0001193125-24-224129` | EX-10.2 |
| Form 10-Q QE 2024-12-31 | `0000063296-25-000006` | — |

## SOURCE_BACKED Am6 §6.01(j) (from research package)

**Before (base CA):** Liens of any Loan Party securing Indebtedness … not to exceed the Permitted Amount ($50,000,000).

**After (Am6):** Liens securing Indebtedness under the 2024 Note Offering to the extent both (y) Agent has fully executed Security Agreement and Prior Security Interest and (z) Liens subordinate per 2024 Note Intercreditor Agreement.

Authority: `docs/amendment-chain-research/before-after/matw-am6-lien-601j.json` → `SOURCE_BACKED`.

## Package excerpt fidelity

**FAIL** — `source-excerpts-matthews.ts` CA text paraphrases Am6 and omits (y)/(z). Hand-encoded excerpts are **not** treated as verified source text.
