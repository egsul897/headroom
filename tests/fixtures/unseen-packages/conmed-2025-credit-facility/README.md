# Phase 2F unseen package — CONMED Corporation multi-document credit facility

Real, public, multi-document debt package selected for **Phase 2F — Frozen
Unseen Multi-Document Package Validation V1**. Selected and acquired
**before** any covenant-content inspection, per an objective, pre-registered
procedure (see `docs/phase-2f-package-selection-log.md` for the full
candidate list considered, in the fixed order returned by SEC EDGAR's own
full-text-search relevance ranking, with pass/fail reasons for each).

## Exclusion list (companies/packages already used or inspected anywhere in
this repository's history, per Phase 2F §2)

| Company | Ticker | Why excluded |
|---|---|---|
| First Watch Restaurant Group | FWRG | `fwrg-2021-credit-agreement` fixture |
| LSB Industries | LXU | `lsb-2023-abl-credit-agreement` fixture |
| Coherent Corp. | COHR | Production reference company (Company A) |
| Matthews International | MATW | Production reference company (Company B) |
| Petco Health & Wellness | WOOF | Inspected in `docs/cross-document-ontology-stress-test.md` |
| TransDigm | TDG | Inspected in `docs/cross-document-ontology-stress-test.md` |
| Community Health Systems | CYH | Inspected in `docs/cross-document-ontology-stress-test.md` |
| CommScope / Vistance Networks | VISN | Inspected in `docs/cross-document-ontology-stress-test.md` |

CONMED Corporation (NASDAQ/NYSE: CNMD), CIK 0000816956, does not appear in
any test fixture, seed data, doc, or script anywhere in this repository
prior to this phase (verified by `grep -ri conmed` across the repo before
selection was finalized) and was never inspected for covenant content prior
to selection - only exhibit **titles/types/dates** (structural metadata,
not covenant substance) were read to confirm package eligibility, per
Phase 2F §4's own distinction.

## Source documents (all real, public SEC EDGAR filings)

| # | Document | Date | Filing | Accession | Exhibit | Role |
|---|---|---|---|---|---|---|
| A | Eighth Amended and Restated Credit Agreement, among CONMED Corporation (Parent Borrower), Foreign Subsidiary Borrowers, the Lenders, and JPMorgan Chase Bank, N.A. (Administrative Agent) | June 10, 2025 | Form 8-K | 0001174947-25-000941 | 10.1 | **Base credit agreement** |
| B | Amended and Restated Guarantee and Collateral Agreement, made by CONMED Corporation and certain Subsidiaries in favor of JPMorgan Chase Bank, N.A. | June 10, 2025 | Form 8-K (same filing) | 0001174947-25-000941 | 10.2 | **Related security/guarantee document** |
| C | Second Amendment to the Seventh Amended and Restated Credit Agreement (dated July 16, 2021) | August 1, 2022 | Form 8-K | 0001193125-22-209154 | 10.2 | **Amendment to a prior, now-superseded base document NOT itself in this package** - deliberate, disclosed test of honest unresolved/out-of-package cross-reference reporting, same discipline as the LSB fixture's own Joinder→un-filed-Intercreditor-Agreement reference |
| D | First Omnibus Amendment and Increased Facility Activation Notice, among CONMED Corporation, Linvatec Nederland B.V., and the Lenders | May 27, 2026 | Form 8-K | 0002077096-26-000190 | 10.1 | **Amendment to BOTH Document A and Document B** (a real, in-package-resolvable, two-target relationship) that also adds a new $450,000,000 Term A-2 incremental facility and activates Linvatec Nederland B.V. as a Foreign Subsidiary Borrower - joinder-like new-party-activation content |

Source URLs (SEC EDGAR, public, no authentication required):
- A/B: `https://www.sec.gov/Archives/edgar/data/816956/000117494725000941/ex10-1.htm` and `.../ex10-2.htm`
- C: `https://www.sec.gov/Archives/edgar/data/816956/000119312522209154/d220699dex102.htm`
- D: `https://www.sec.gov/Archives/edgar/data/816956/000207709626000190/ea029246401ex10-1.htm`

Acquired live from `www.sec.gov`/`sec.gov Archives` in this session
(2026-08-27), the same real, no-mocks retrieval discipline
`tests/connectors/edgar-*.test.ts` and the FWRG/LSB fixtures already use.
User-Agent `Headroom/1.0 (contact: engineering@headroom-app.example)` per
SEC's fair-access policy.

## Why this package fits Phase 2F's requirements

- **Multiple related documents (4, within the 3-8 target)**: one base
  credit agreement, one full freestanding guarantee/security document, and
  two amendments spanning 2022-2026.
- **Genuine package topology Phase 2C must resolve**: Document D amends
  *two* different base documents (A and B) simultaneously - a real
  multi-target `AMENDS`/`RESTATES` relationship, not a synthetic one.
  Document C references a *prior* Credit Agreement (the Seventh A&R, dated
  July 16, 2021) that is not itself part of this package - this must
  resolve as an **unresolved/out-of-package** relationship, never silently
  mis-attached to Document A (the *current*, but textually distinct,
  Eighth A&R).
- **Multiple covenant families in the base document's own Negative
  Covenants article** (Article VII, Sections 7.1-7.17, verified by direct
  reading of the section list before curation): Financial Condition
  Covenants (7.1 - a real maintenance leverage-ratio financial covenant),
  Indebtedness (7.2), Liens (7.3), Fundamental Changes (7.4), Asset Sales
  (7.5), Restricted Payments (7.6), Investments/Loans/Advances (7.8),
  Optional Payments/Modifications of Debt Instruments (7.9 - subordinated
  debt/prepayment-restriction territory), Affiliate Transactions (7.10),
  Sale-Leasebacks (7.11), Fiscal Period changes (7.12), Negative Pledge
  Clauses (7.13), Subsidiary Distribution Restrictions (7.14), Lines of
  Business (7.15), Use of Proceeds (7.16), Outbound Investment Rules
  (7.17).
- **A real joinder-adjacent event**: Document D activates Linvatec
  Nederland B.V. as a new Foreign Subsidiary Borrower and reaffirms the
  guarantee/security obligations of eight named Guarantors - genuine
  entity-scope material a discovery/context layer should surface.

## Curation methodology (disclosed, mechanical, decided before any pipeline
run - never after seeing results)

Following the exact same cost-bounding discipline already established by
the FWRG/LSB fixtures (`fwrg-2021-credit-agreement/README.md`: "kept a
single real Gateway call's context bounded and cost/time tractable"):

- **Document A (base)**: split into `base-credit-agreement-article-vii-negative-covenants.txt`
  (the full, real Article VII text, 50,080 chars - the entire Negative
  Covenants article, not a hand-picked subset of it) and
  `base-credit-agreement-definitions-excerpt.txt` (44,176 chars - only the
  73 defined terms Article VII's own text actually cites, found
  **mechanically** by regex-matching every `"Defined Term":` entry in
  Article I against Article VII's text, not hand-selected). Article I in
  full is 154,639 chars; excerpting to only cited terms is the same
  curation FWRG/LSB already used.
- **Document B (guarantee/security)**: used in full - 106,821 chars, no
  curation needed (a full standalone document of workable size).
- **Document C (2022 amendment)**: used in full - 11,701 chars.
- **Document D (2026 omnibus amendment)**: curated to its **operative
  body only** (18,111 chars - recitals, the actual amendment/incremental-
  facility/reaffirmation/joinder-activation clauses, and the signature
  block). The real filed exhibit is 665,668 chars because, per its own
  Section 1(a)/(c), it attaches a full **blackline-conformed re-print** of
  the entire amended Credit Agreement (Exhibit A, ~547K chars) and the
  entire amended Guarantee and Collateral Agreement (Exhibit B, ~103K
  chars) - both of which are already, separately, Documents A and B in
  this package. Including those re-prints a second time inside Document D
  would not add new information; it would only duplicate existing content
  and multiply LLM cost roughly sixfold for zero new signal, which
  directly conflicts with Phase 2F §9's "do not increase context size
  without reporting tradeoff" and §17's "no semantic calls unless
  necessary." The exclusion is recorded in-line in the curated file itself
  (see its final paragraph) so no downstream reader mistakes the omission
  for a silent drop.

No file in this fixture was ever edited for content reasons after
inspection - every curation decision above was made from document
*structure* (article/section boundaries, which defined terms are cited,
which content is a verbatim duplicate of another in-package document), not
from covenant substance or from any pipeline result.

## Ground-truth isolation

Ground truth for this package is authored independently, from these source
documents only, **after** the frozen first-blind pipeline run is sealed -
see `docs/phase-2f-unseen-package-validation.md` for the full methodology,
findings, and scores. No file under `lib/contract-model/**` may import
anything from this directory's ground-truth file, and the ground-truth
authoring step itself does not consult Phase 2B/2D/2E output, per Phase
2F §10.
