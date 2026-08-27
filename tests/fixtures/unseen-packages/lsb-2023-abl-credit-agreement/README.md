# Unseen package 2 — LSB Industries, Inc. 2023 ABL Credit Agreement

Real, public, previously-unused-anywhere-in-this-repo financing package, selected per
Phase C task §55 ("add at least ONE additional real financing package not used to
design the implementation... prefer something structurally different from FWRG...
ABL, second lien, intercreditor, notes + credit agreement, shared capacity").

## Source (real SEC EDGAR filing, publicly available)

- **Filer**: LSB Industries, Inc. (NYSE: LXU), CIK 0000060714
- **Filing**: Form 8-K filed 2023-12-26, accession `0001193125-23-303035`
- **Item 1.01 event date**: 2023-12-21
- **Exhibit 10.1** (`article-6-negative-covenants.txt` / `definitions-excerpt.txt` source): Credit Agreement dated December 21, 2023 among LSB Industries, Inc., the other loan parties party thereto, the lenders party thereto, and JPMorgan Chase Bank, N.A., as administrative agent — a real $75M asset-based revolving credit facility (the "New Revolving Credit Facility").
- **Exhibit 10.3** (`intercreditor-joinder.txt` source): Joinder Agreement dated December 21, 2023 to the Intercreditor Agreement dated August 7, 2013 (as amended 2018, joined 2021), by Wells Fargo Capital Finance LLC (Existing ABL Agent), Wilmington Trust N.A. (Notes Agent, for LSB's separate 6.250% senior secured notes), joining JPMorgan Chase Bank, N.A. as the new ABL Agent.
- Retrieved live from `www.sec.gov`/`sec.gov Archives` this session — the same real, no-mocks retrieval discipline `tests/connectors/edgar-*.test.ts` already uses elsewhere in this repo.

## Why this package is structurally different from FWRG

| | FWRG 2021 Credit Agreement (unseen package 1) | LSB 2023 ABL Credit Agreement (unseen package 2) |
|---|---|---|
| Facility type | Cash-flow term loan | Asset-based revolver (borrowing base) |
| Core builder basket | "Available Amount" cumulative multi-clause basket keyed to EBITDA/CNI | No cumulative builder basket; single flat/`greater-of-$-and-%-of-total-consolidated-assets` baskets |
| Governing ratio-gate | Total Rent Adjusted Net Leverage Ratio (always relevant) | Fixed Charge Coverage Ratio - relevant to unlocking baskets AND, separately, a springing financial covenant that only activates during an "Availability Block Removal Period" |
| Composite gating condition | Ratio test + no-default, evaluated per-basket | "Payment Conditions" - ONE named, reused compound condition (no-default + minimum "Specified Availability" liquidity threshold, pro forma, over a trailing 30-day window + officer's certificate) gating multiple, otherwise-unrelated baskets (debt, restricted payments, investments, subordinated-debt payments) |
| Multi-instrument structure | Single Credit Agreement + its own Indenture (both filed, both read in unseen package 1) | ABL Credit Agreement + a real Intercreditor Agreement lineage (2013/2018/2021/2023) governing priority between this ABL facility and LSB's separate, NOT-filed-here Secured Notes - a genuine cross-document dependency this package's own text cannot resolve on its own (task §69's own "compiler must not incorrectly merge distinct legal authorities") |
| Collateral split | Pari passu across secured tranches (no priority split within Article 6 itself) | Real "ABL Priority Collateral" vs. "Notes Priority Collateral" split, both defined ONLY by reference to the Intercreditor Agreement, not this Credit Agreement itself - an intentionally UNRESOLVABLE-from-this-document-alone reference, a genuine test of honest UNRESOLVED reporting (task §23) |
| Size | ~104K + ~16.5K chars (large single-tranche syndicated document) | ~16.9K (Article VI) + ~8.1K (definitions excerpt) + ~10.9K (Joinder) = ~35.9K chars (a real, smaller mid-cap ABL facility - an honest, disclosed real-world size difference, not a scoping choice) |

## Scope of this fixture

`article-6-negative-covenants.txt` is the REAL, COMPLETE ARTICLE VI (Negative
Covenants) text (Sections 6.01–6.15, several genuinely `[Reserved]`).
`definitions-excerpt.txt` is a CURATED excerpt (not the full ~150K-character
Article I) containing only the defined terms Article VI's own text actually
cites — the same curation discipline `fwrg-2021-credit-agreement`'s own
`definitions-excerpt.txt` already used. `intercreditor-joinder.txt` is the
REAL, COMPLETE Joinder Agreement (Exhibit 10.3) — small enough to include in
full, and the only real evidence available in this filing about the
ABL/Notes priority relationship (the underlying 2013 Intercreditor Agreement
itself was not filed as an exhibit here and is not part of this fixture).

## Human ground truth discipline

`human-ground-truth.ts` was written by directly reading the three text files
above, BEFORE any extractor (synthetic or real LLM) was run against this
package — the same discipline `fwrg-2021-credit-agreement`'s own ground
truth used. It is never imported by `lib/contract-model/analyzer/**` or
`lib/contract-model/compiler/**`.
