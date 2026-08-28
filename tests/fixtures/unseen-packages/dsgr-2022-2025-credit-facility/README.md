# Phase 3F unseen package — Distribution Solutions Group, Inc. multi-document credit facility

**Genuinely unseen** real, public, multi-document debt package selected for
**Phase 3F — Genuinely Unseen Whole-Package Semantic Validation V1**.
Selected and acquired **before** any covenant-content inspection, per an
objective, pre-registered procedure — see
`docs/phase-3f-package-selection-log.md` for the full candidate pool
considered and the fixed selection procedure, and
`tests/fixtures/unseen-packages/phase-3f-freeze/phase-3f-freeze-manifest.json`
for the hard freeze sealed before this package was searched for.

## Issuer

**Distribution Solutions Group, Inc.** (NASDAQ: DSGR; formerly Lawson
Products, Inc.), CIK 0000703604. An industrial distribution/MRO company
(Lawson Products, TestEquity, Gexpro Services) operating across the US
and Canada.

## Documents (4, in chronological order)

All four documents were retrieved live from `www.sec.gov` in this
session — the same real, no-mocks retrieval discipline
`tests/connectors/edgar-*.test.ts` and every prior unseen-package fixture
in this repository already use.

| # | Document | Type | Dated | Source 8-K filed | Accession | Exhibit |
|---|---|---|---|---|---|---|
| A | Amended and Restated Credit Agreement | Base credit agreement | 2022-04-01 | 2022-04-04 | `0001193125-22-095177` | EX-10.2 |
| B | Third Amendment to Amended and Restated Credit Agreement | Amendment | 2024-08-14 | 2024-08-16 | `0001193125-24-202196` | EX-10.1 |
| C | Fourth Amendment to Amended and Restated Credit Agreement | Amendment | 2025-03-31 | 2025-04-02 | `0001193125-25-070858` | EX-10.1 |
| D | Second Amended and Restated Credit Agreement | Full restatement | 2025-12-18 | 2025-12-22 | `0001193125-25-328786` | EX-10.1 |

**Parties (Document A, carried through the amendment chain):** Lawson
Products, Inc. (Delaware) and Lawson Products, Inc. (Illinois), Baron
Divestiture Company (Illinois), Lawson Products Canada Inc. (British
Columbia), The Bolt Supply House Ltd. (Alberta), GS Operating, LLC
(Delaware), and TestEquity LLC (Delaware), as Borrowers; JPMorgan Chase
Bank, N.A., as Administrative Agent; BofA Securities, Inc. and CIBC Bank
USA, among the arrangers/lenders. A genuinely multi-entity, multi-
jurisdiction (US/Canada) borrower group — real package topology for
Phase 2C to resolve, not a single-borrower facility.

**Source URLs:**
- A: <https://www.sec.gov/Archives/edgar/data/703604/000119312522095177/d345714dex102.htm>
- B: <https://www.sec.gov/Archives/edgar/data/703604/000119312524202196/d885541dex101.htm>
- C: <https://www.sec.gov/Archives/edgar/data/703604/000119312525070858/d906948dex101.htm>
- D: <https://www.sec.gov/Archives/edgar/data/703604/000119312525328786/d83410dex101.htm>

**Acquisition date (this session):** 2026-08-28.

## Source preservation (task §5)

`raw-source/` holds each document's exact bytes as served by
`sec.gov` (never modified). `extracted-text/` holds a plain-text
extraction of the FULL document (HTML tags stripped, entities decoded,
whitespace normalized to preserve paragraph/section breaks) — the whole
document, never a hand-selected article or section (Phase 3F §7's own
"no manually supplied covenant targets... let the system operate as
designed" applies starting from source preparation itself, not only from
discovery onward).

| Doc | Raw filename | Raw bytes | Raw SHA-256 | Extracted-text SHA-256 | Extracted chars | Est. pages (~3000 chars/page) |
|---|---|---|---|---|---|---|
| A | `raw-source/doc-a-2022-amended-restated-credit-agreement.htm` | 1,234,538 | `b12093fd5de51ed389bdac0124acc941b6459011e7bb50d19795c5eab79ad80f` | `2bc4ee96a9b960d7ac92154650613edfef6afde31330bbc71cd585c9855f97a9` | 743,476 | ~248 |
| B | `raw-source/doc-b-2024-third-amendment.htm` | 1,175,933 | `c88c5a7ca113433e9f0abd6edecb16e5987b05f7a16a6c2fb66296aba199b78d` | `467267c933d833938402aa56ba87df9eba1fe824d1834768272d99d606de7fce` | 741,527 | ~248 |
| C | `raw-source/doc-c-2025-fourth-amendment.htm` | 52,375 | `ddc282d35f1a82a5c6ffa403eb44fd1010a6048988e68baa3eea7fcac82366b2` | `a8cacce72b6df9f88e15ab8fd23a6be7f09902a1d01d850fcf85c0086a5ab826` | 13,862 | ~5 |
| D | `raw-source/doc-d-2025-second-amended-restated-credit-agreement.htm` | 1,698,197 | `273e142d7b5265bcb640e68bf401c5d9df1aae31d3541502c46d575c8f4e1f4c` | `29fe29a537668e1e8a921d27e3a16e4923151f24a9a53ca4434ce2a3e527735f` | 844,994 | ~282 |

**Total: ~4.16 MB raw, ~2.34M extracted characters, ~783 estimated pages
across 4 documents, 12 Articles per document (I-XII, confirmed present
in every document via `ARTICLE [IVXLC]+` header detection on the
extracted text).**

**Disclosed, real characteristic (not an extraction defect):** Document B
(the Third Amendment) is nearly as large as the base agreement itself
because it amends and restates large blocks of the credit agreement's own
Articles I-XII in place (a common real drafting technique — "amend and
restate the following Sections in their entirety, as set forth on Exhibit
A/B hereto" — rather than a short redline). This means Document A and
Document B share substantial overlapping text, which is real, expected,
and exactly the kind of case Phase 2G's amendment/operative-state
machinery exists to resolve (only Document D's own text, as the most
recent full restatement, is operative as of validation date — subject to
whatever Document D itself says about its own effective date and any
carried-forward provisions).

## Non-reuse evidence

Confirmed via `grep -rliE "lawson products|distribution solutions
group|DSGR\b|0000703604|703604"` across the entire repository (excluding
`node_modules`) immediately before selection: **zero prior matches**.
Neither this company, its CIK, nor any of these four documents has ever
been referenced anywhere in this repository before this Phase 3F task.

## What happens next

Per Phase 3F §6's own strict ordering: no ground truth has been authored
from these documents yet, and none will be until AFTER the frozen
pipeline's first-blind run against them completes and its output is
sealed. No covenant, basket, or other operative provision from these
documents has been read past the title-block level described in
`docs/phase-3f-package-selection-log.md`.
