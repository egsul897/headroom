# Phase 2F — package selection log

Objective, pre-registered selection procedure (recorded **before** any
candidate's exhibit text was opened), per Phase 2F §4.

## Procedure (fixed before execution)

1. Query SEC EDGAR's public full-text search API
   (`efts.sec.gov/LATEST/search-index`) for the exact phrase `"Guarantee
   and Collateral Agreement"` within Form 8-K filings, 2021-01-01 through
   2025-12-31 — a phrase that appears in an exhibit's own text when that
   exhibit is, or amends, or reaffirms, a guarantee/security document,
   independent of any covenant-drafting style. This is a structural/
   topological search term, not a covenant-content one.
2. Take the distinct filing companies in the exact order EDGAR's own
   relevance ranking returned them (not re-ordered, not filtered by
   apparent quality).
3. Skip any company already on the Phase 2F exclusion list (see
   `tests/fixtures/unseen-packages/conmed-2025-credit-facility/README.md`).
4. For the first non-excluded candidate, open **only** its filing index
   page (exhibit titles/types/dates — structural metadata) and check
   whether the candidate's own filing history contains, or can be
   completed with, (a) a base credit agreement, (b) at least one
   amendment/supplement/restatement, and (c) at least one additional
   related debt document (guarantee/security/intercreditor/joinder/
   compliance) — checked from exhibit **titles only**, never covenant
   substance.
5. If a candidate does not cleanly satisfy criterion 4 without extensive
   digging, move to the next candidate in the fixed order rather than
   forcing a marginal fit.
6. The first candidate to cleanly satisfy criterion 4 is selected.

## Candidate pool (in the exact order EDGAR's full-text search returned
them; 1,028 total hits, 44 distinct filers in the visible page)

| Order | Company | Ticker | Disposition |
|---|---|---|---|
| 1 | Graphic Packaging Holding Co | GPK | Top hit's own filing (2021-03-01) was a single EX-10.1, no bundle. Broader CIK search found a 2018 8-K with 8 exhibits, but only 2 (EX-10.7, EX-10.8) were credit-facility documents — the other 6 were an unrelated corporate/M&A reorganization (LLC Agreement, Exchange Agreement, Governance Agreement, Tax Receivable Agreement, Registration Rights Agreement, Restrictive Covenants Agreement) with International Paper. Ambiguous fit; skipped per step 5 rather than force it. |
| 2 | Terex Corp | TEX | Top hit's own filing (2022-12-30) was a single EX-10.1 ("Amended Coll Agrmnt") with no bundled second document. Skipped. |
| 3 | **CONMED Corp** | **CNMD** | Top hit's own filing (2021-07-16, accession 0001193125-21-217426) bundles EX-10.1 ("Seventh Amended and Restated Credit Agreement") + EX-10.2 ("Fifth Amendment to Guarantee and Collateral Agreement") in one 8-K — satisfies criteria (a)+(b)/(c) immediately. A broader CIK-scoped search then surfaced a rich real multi-year document history (2021/2022/2024/2025/2026 amendments and restatements), from which the final 4-document package (see README.md) was assembled. **Selected — no further candidates inspected.** |

Candidates 4+ (SPX Technologies, Scotts Miracle-Gro, Smart Sand, Earthstone
Energy, Biotricity, Harsco, Walker & Dunlop, Herc Holdings, Altra
Industrial Motion, Thermon Group, Applied Digital, Air Transport Services
Group, Amneal Pharmaceuticals, SBA Communications, Alkami Technology,
TransMedics, AZEK, Denny's, Fat Brands, Eos Energy, European Wax Center,
Cornerstone Building Brands, Vertex, Wendy's, Wingstop, MariaDB, Planet
Fitness, FreightCar America, Six Flags, Griffon Corp, SoundHound AI, Dine
Brands, QT Imaging, Zurn Water Solutions, Tempur Sealy, Veritiv,
BrightSpire Capital, Vitesse Energy, Veradigm, Camping World, Jack in the
Box, CalAmp) were **not inspected at all** — the procedure stopped at the
first candidate (CONMED, order 3) that cleanly satisfied the criteria, per
step 6. Their raw listing (company/CIK, in the search's own returned
order) is preserved for audit in this log's own git history via the
`efts.sec.gov` query reproduced in step 1 above, which any reader can
re-run.

## What was and was not read before selection was finalized

Read (structural/metadata only): filing index pages (exhibit
number/title/type/date), and — to disambiguate GPK's own multi-exhibit
2018 filing and confirm/reject its fit — the first ~400 characters of
each of GPK's 8 exhibits (enough to read each document's own title block,
not its covenant content) and CONMED's own two exhibit title blocks.

Not read before selection: any covenant, basket, definition, or other
operative provision text of any candidate. Selection was made, and could
have been made, entirely from exhibit titles/types/dates.
