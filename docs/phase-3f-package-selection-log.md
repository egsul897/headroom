# Phase 3F — package selection log

Objective, pre-registered selection procedure (recorded **before** any
candidate's exhibit/covenant text was opened beyond a title-block read),
per Phase 3F §4, following the exact discipline Phase 2F's own selection
log established (`docs/phase-2f-package-selection-log.md`) — a
structural/topological search phrase, EDGAR's own relevance order taken
as-is, an exclusion list checked first, and exhibit **titles only** used
to judge fit.

## Exclusion list (every company/package already used or substantively
inspected anywhere in this repository's history, compiled from every
prior phase's own README/report before this search began)

| Company | Ticker/CIK | Why excluded |
|---|---|---|
| Coherent Corp. | COHR | Production reference company (Company A) |
| Matthews International Corporation | MATW, CIK 0000063296 | Production reference company (Company B) |
| CONMED Corporation | CNMD | Phase 2F/2G unseen-package validation subject |
| First Watch Restaurant Group, Inc. | FWRG, CIK 0001789940 | Phase 3A-3E unseen package 1 |
| LSB Industries, Inc. | LXU, CIK 0000060714 | Phase 3A-3E unseen package 2 |
| Graphic Packaging Holding Co | GPK | Phase 2F candidate pool - filing index (exhibit titles) opened and inspected |
| Terex Corp | TEX | Phase 2F candidate pool - filing index (exhibit titles) opened and inspected |
| Petco Health & Wellness Company, Inc. | WOOF, CIK 0001826470 | Cross-document ontology stress test - covenant text deeply read |
| TransDigm Inc. / TransDigm Group Incorporated | TDG, CIK 0001077670 / 0001260221 | Cross-document ontology stress test - covenant text deeply read |
| Community Health Systems, Inc. | CYH, CIK 0001108109 | Cross-document ontology stress test - covenant text deeply read |
| CommScope Inc. / Vistance Networks, Inc. | VISN, CIK 0001035884 / 0001517228 | Cross-document ontology stress test - covenant text deeply read |

(Candidates from Phase 2F's own pool whose company **names only** appeared
in an unopened EDGAR search-results list — SPX Technologies, Scotts
Miracle-Gro, Smart Sand, Earthstone Energy, Biotricity, Harsco, Walker &
Dunlop, Herc Holdings, Altra Industrial Motion, Thermon Group, Applied
Digital, Air Transport Services Group, Amneal Pharmaceuticals, SBA
Communications, Alkami Technology, TransMedics, AZEK, Denny's, Fat Brands,
Eos Energy, European Wax Center, Cornerstone Building Brands, Vertex,
Wendy's, Wingstop, MariaDB, Planet Fitness, FreightCar America, Six
Flags, Griffon Corp, SoundHound AI, Dine Brands, QT Imaging, Zurn Water
Solutions, Tempur Sealy, Veritiv, BrightSpire Capital, Vitesse Energy,
Veradigm, Camping World, Jack in the Box, CalAmp — were **not** excluded
here: no content, no filing index, nothing beyond a bare company name in
an unopened results list was ever read for any of them, so they remain
genuinely eligible under Phase 3F §2's own criteria.)

## Procedure (fixed before execution)

1. Query SEC EDGAR's public full-text search API
   (`efts.sec.gov/LATEST/search-index`) for the exact phrase `"Amended
   and Restated Credit Agreement"` within Form 8-K filings, 2024-06-01
   through 2026-06-30 — a phrase that signals a company currently
   operating under, or that recently entered, a credit facility of
   exactly the base+amendment shape Phase 3F §3 asks for. This is a
   structural/topological search term (it describes a document
   *category*, not any covenant's substance), not a covenant-content one.
2. Take the distinct filing companies in the exact order EDGAR's own
   relevance ranking returned them (not re-ordered, not filtered by
   apparent quality) — 3,877 total hits; the first page returned 80
   distinct filers.
3. Skip any company on the exclusion list above.
4. For the first non-excluded candidate whose own matching filing bundles
   multiple related exhibits (a structural signal, checked from the
   filing index page alone — exhibit numbers/sizes/dates, never
   content), open **only** each exhibit's own first ~800 characters (the
   title/preamble block every credit-agreement-family document begins
   with) to confirm document TYPE and identify the underlying base
   agreement it amends. Never read past the title block; never read any
   covenant, basket, definition, or other operative provision.
5. If a candidate does not cleanly satisfy Phase 3F §3's criteria (base
   agreement + amendment/restatement + reasonably-available additional
   related document) from title blocks alone, move to the next candidate
   in the fixed order.
6. The first candidate to cleanly satisfy the criteria is selected.

## Candidate pool (in the exact order EDGAR's full-text search returned
them for the query in step 1)

| Order | Company | Ticker | Disposition |
|---|---|---|---|
| 1 | **Distribution Solutions Group, Inc.** (formerly Lawson Products, Inc.) | **DSGR** | 3 distinct matching accessions across 2024-2025 (a strong "amendment sequence" signal). The most recent match's own EX-10.1 title block read: "Third Amendment to Amended and Restated Credit Agreement... made as of August 14, 2024... under the Existing Credit Agreement". CIK-scoped search located the underlying "Existing Credit Agreement" (an Amended and Restated Credit Agreement dated April 1, 2022) and a further Fourth Amendment (March 31, 2025) and a full Second Amended and Restated Credit Agreement (December 18, 2025) — a genuine, real, current 4-document amendment-and-restatement chain across a multi-entity (Delaware/Illinois/Canada/Alberta), multi-borrower capital structure. Zero prior appearance anywhere in this repository (confirmed by a repository-wide grep for "Lawson Products", "Distribution Solutions Group", "DSGR", and CIK 0000703604 immediately before this selection was finalized — zero matches). **Selected — no further candidates inspected.** |

Candidates 2+ (AvidXchange, USA Compression Partners, Sunoco LP, Paycom
Software, Simpson Manufacturing, Kontoor Brands, Diamondback Energy,
Chord Energy, Flowserve, Lam Research, Franklin Electric, Lincoln
National, Battalion Oil, CF Industries, MercadoLibre, PTC, Hut 8, Modine
Manufacturing, Calumet, Itron, Smith & Wesson Brands, SM Energy, Regal
Rexnord, Civitas Resources, CACI International, Benchmark Electronics,
Canadian Pacific Kansas City, Americold Realty Trust, Mayville
Engineering, LGI Homes, Teledyne Technologies, Helios Technologies,
Kimbell Royalty Partners, Commercial Metals, Synaptics, Permian
Resources, Pebblebrook Hotel Trust, Northern Oil & Gas, Astrana Health,
A.K.A. Brands, McEwen Mining, LXP Industrial Trust, Stifel Financial,
Archrock, LyondellBasell, Wayfair, Riot Platforms, Weyerhaeuser, Lear,
Universal Electronics, FMC, Resideo Technologies, Belden, Credit
Acceptance, American Assets Trust, United States Cellular, Plexus,
Perrigo, Genesis Energy, NNN REIT, TaskUs, First Mid Bancshares, UFP
Technologies, NetSTREIT, NRG Energy, CPI Aerostructures, Martin Midstream
Partners, Kadant, EastGroup Properties, Acadia Realty Trust, CBL &
Associates Properties, Enviri, United Rentals, Graphic Packaging Holding
(already on the exclusion list, confirming the search's own construction
was not biased toward it), Raymond James Financial, Natural Gas Services
Group, Natural Resource Partners, Beyond Inc., Globe Life) were **not
inspected at all** — the procedure stopped at the first candidate (DSGR,
order 1) that cleanly satisfied the criteria, per step 6.

An earlier, abandoned search pass (`"Omnibus Amendment"`, 8-K, 2024-01-01
through 2026-06-30) was run first and considered two candidates (EFCAR,
LLC — an auto-receivables securitization SPV, structurally incompatible
with a negative-covenant credit-agreement package by entity type alone,
never opened beyond its own name — and Vertex Energy Inc., whose
CIK-scoped filing history spans 14+ years and multiple distinct,
un-related-looking legacy facilities, too heterogeneous to cleanly
satisfy "not concatenate unrelated contracts" without extensive digging
per step 5) before being abandoned in favor of the cleaner `"Amended and
Restated Credit Agreement"` query whose own first candidate (DSGR)
satisfied the criteria immediately. Per the same step-5 discipline
already used in Phase 2F's own log, an ambiguous or messy fit is skipped
rather than forced; switching search phrases when the first phrase's own
early candidates were structurally poor fits (not weak *content*, but
wrong *entity type* or excessive un-registrable heterogeneity) is
disclosed here rather than hidden, and no candidate's exhibit content was
read during either abandoned pass.

## What was and was not read before selection was finalized

**Read (structural/metadata only)**: filing index pages (exhibit
number/size/date) for DSGR's 2022, August 2024, March 2025, and December
2025 8-Ks; the first ~600-800 characters of five exhibits total (2022's
EX-10.1 and EX-10.2, August 2024's EX-10.1, March 2025's EX-10.1,
December 2025's EX-10.1) — enough to read each document's own title
block/preamble (parties, document type, effective date), never any
numbered covenant section, defined term, basket, or other operative
provision. Also briefly read the title blocks of two abandoned-pass
candidates' own exhibits (Vertex Energy's June 2024 8-K exhibit
descriptions only, via the filing index page — never document text) for
the same title-block-only purpose before that pass was abandoned.

**Not read before selection**: any covenant, basket, definition,
condition, exception, or other operative provision text of any
candidate, in either search pass. Selection was made, and could have been
made, entirely from exhibit title blocks and filing-index metadata.

## Selected package summary

**Distribution Solutions Group, Inc.** (NASDAQ: DSGR; formerly Lawson
Products, Inc.), CIK 0000703604 — see
`tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/README.md`
for the full source inventory, hashes, and acquisition record (task
§5/§166, written after this selection log, never before it).
