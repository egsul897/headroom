# Unseen package — First Watch Restaurant Group Credit Agreement (2021)

**Source (public, real, never previously used in Headroom):** Exhibit 10.1 to
First Watch Restaurant Group, Inc.'s Form 8-K filed October 6, 2021.
CIK 0001789940. SEC EDGAR accession `0001193125-21-293207`, document
`d212487dex101.htm`.
<https://www.sec.gov/Archives/edgar/data/1789940/000119312521293207/d212487dex101.htm>

Credit Agreement dated as of October 6, 2021 among FWR Holding Corporation
(Borrower), AI Fresh Parent, Inc. (Holdings), Bank of America, N.A.
(Administrative Agent), and a syndicate of lenders — a Revolving Credit
Facility and a Term Loan A, entered into in connection with First Watch's
2021 IPO (sponsor-backed by Advent International prior to the offering).

## Why this package

- **Never used in Headroom**: not Coherent, not Matthews, not any fixture
  derived from them, not the FWRG "gateway-live-test-co" upload smoke-test
  document (that was a different company, Matthews' own amendment).
- **Materially different structure from both existing companies**:
  restaurant-industry EBITDAR (rent-adjusted) leverage metric rather than a
  plain EBITDA leverage metric; a Term Loan A + Revolver structure (not
  Coherent's TLB/notes/ABL mix, not Matthews' multi-currency loan
  agreement); real maintenance financial covenants (Total Rent Adjusted Net
  Leverage Ratio + Fixed Charge Coverage Ratio) rather than cov-lite.
- **Contains, verified by direct reading of the real document**: grower
  baskets (`greater of $X and Y% of Consolidated Adjusted EBITDA`, at least
  5 distinct instances across Indebtedness/Investments/Fundamental
  Changes/Restricted Payments), an "Available Amount" builder basket with
  genuinely deep nesting (CNI Growth Amount, Available Excluded
  Contribution Amount, equity-issuance sub-clauses), a ratio-gated
  unlimited Restricted Payments basket, a stepped/date-varying maintenance
  leverage covenant with a Material-Acquisition-triggered 0.50x step-up, an
  equity cure right capped at 5 exercises with a 2-of-4-quarter limit,
  restricted/unrestricted subsidiary and Loan Party entity-scope
  distinctions, and a "Restricted Debt" (junior/permitted debt) concept
  implying a subordination/intercreditor dimension.
- **Two excerpts used** (not the full ~860K-character document, to keep a
  single real Gateway call's context bounded and this spike's cost/time
  tractable — task C0 explicitly does not require production-scale
  document handling): `article-6-negative-covenants.txt` (the full
  Negative Covenants article, Sections 6.01–6.10, ~104KB) and
  `definitions-excerpt.txt` (the specific defined terms Article 6's
  material provisions depend on: Available Amount, CNI Growth Amount,
  Consolidated Adjusted EBITDA, Consolidated Adjusted EBITDAR, Restricted
  Subsidiary, Loan Party, Total Rent Adjusted Net Leverage Ratio, Fixed
  Charge Coverage Ratio, Restricted Debt).

## Ground truth isolation

`human-ground-truth.ts` in this directory is the independent human mapping
(task's own Task 2). It is read ONLY by
`tests/contract-model/analyzer-unseen-package.test.ts`'s evaluation step —
never passed into any provider prompt. See
`docs/phase-c0-validation-spike.md` for the full mapping, classification,
and results.
