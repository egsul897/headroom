# Phase 3 Lane 7 — new blind package hunt

**Status:** `DISCOVERY_ONLY`. Soft gate. Nothing here is certified.
**Tip inspected:** `3f1182511758c85ffc92023b06a46114820e69fe`
**Ingestion:** none. No exhibit body was opened. No production code. No fixture was added.
**IMPLEMENTED ≠ CERTIFIED.** This ranking is not a selection, not an authorization to ingest, and not a claim that any package would pass or fail Headroom.

## What was and was not read

**Read:** EDGAR full-text search metadata (issuer, CIK, form, file date, accession, `file_type`, item codes); filing-index file names, sizes, and JPEG counts; Form 8-K cover narratives and exhibit captions (document type, date, parties, exhibit number).

**Not read:** any credit-agreement, indenture, amendment, guaranty, or supplemental-indenture body. No definitions, baskets, ratios, builders, or reclassification clauses were opened. Dollar amounts and ratio levels that appeared in 8-K summaries are omitted below on purpose.

Phrase hits are existence signals from EDGAR's index. A hit on an exhibit type means the phrase occurs somewhere in that filed exhibit. It is not a reading of the clause, and it is not a judgment that Headroom would represent it. A miss is not absence: **invent-absence**. Where a caption pairing or a party name was truncated in the cover extract, it is recorded as unresolved.

## Procedure

Category queries against `https://efts.sec.gov/LATEST/search-index`, Form 8-K, through 2026-10-07. Queries describe mechanic *categories*, not a target company and not a basket Headroom already handles.

| Query | Window | Hits |
|---|---|---|
| `"Builder Basket"` | 2023-01-01 – 2026-10-07 | 56 filings, 36 issuers |
| `"divide, classify and reclassify"` | 2024-01-01 – 2026-10-07 | 41 filings, 23 issuers |
| `"Builder Basket"` ∩ that reclass phrase | same windows | **5 issuers** |
| `"Cumulative Credit"` | 2024-01-01 – 2026-10-07 | 135 (page of 100) |
| `"Available Amount" "reclassify"` | 2024-06-01 – 2026-10-07 | 550 (page of 100) |
| `"Grower Basket"` | 2022-01-01 – 2026-10-07 | 54 |
| `"Supplemental Indenture" "Builder Basket"` | 2022-01-01 – 2026-10-07 | 28 |

Follow-up searches were CIK-scoped, still metadata plus 8-K covers, and only for issuers that already sat in the intersection or in a multi-filing builder chain. Issuers were not reordered by expected Headroom score.

### Hard exclusions (already fixtures, covenant-read, or title-block-opened)

Coherent; Matthews (CIK 0000063296); CONMED (0000816956); First Watch (0001789940); LSB (0000060714); DSGR (0000703604); Petco (0001826470); TransDigm (0001077670 / 0001260221); Community Health (0001108109); CommScope / Vistance (0001035884 / 0001517228); Riot (0001167419); Superior (0000095552); Chewy (0001766502); Graphic Packaging and Terex (title-inspected in Phase 2F). Maravai (0001823239) is excluded because its exhibit title block was opened during the Chewy selection (`docs/phase-3-validation/01-source-identity-and-selection.json`).

Names that appear only inside that file's unopened hit dump (Granite, Hilton Grand Vacations) stay eligible, with an independence discount disclosed on the row.

### Rejected before ranking

- **EX-99-only phrase hits** (earnings or press): Enova, Liberty Latin America, B&G Foods. Nabors' `"Grower Basket"` hit is on EX-99.1 of accession `0001104659-24-072309`, not on the amended credit agreement in that same filing. The agreement was not treated as a grower package.
- **Accendra Health** (0000075252), accession `0001193125-26-215654`: the EX-10.1 cover is a commitment letter, and the filing index has 37 JPEGs. Not a clean agreement package.
- **Everus Construction** (0002015845): same MDU spin / JPMorgan form-family as Knife River. Held out as a sibling, not counted as independent evidence. Identities are in the Knife River note.
- **Offshore indenture cluster** other than the one representative: Helix `0001140361-23-055775`, Excelerate `0001193125-25-112768`, Weatherford `0001603923-25-000151`, Noble `0001895262-26-000134`, Vantage `0000950170-23-006501`. Same `"Builder Basket"` / EX-4.1 search shape. Covers were not opened. They are not six packages.
- **Prior A&R-credit-agreement pools** (Benchmark, Simpson, Kontoor, and the rest of `docs/final-lightweight-unseen/01-candidate-pool.json` and `docs/phase-3f2-unseen-validation/03-candidate-pool.json`): that shape is already the benchmark. Not re-ranked.

## Ranking

Scores are 1–5 from the metadata above. They are not model scores.

| Rank | Issuer | Indep. | Structure | Semantic distance | Source | Completeness | Overfit exposure | Mechanic evidence |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | Insulet | 5 | 5 | 4 | 5 | 4 | 5 | Both phrases, on the indenture exhibit only |
| 2 | Knife River | 4 | 3 | 3 | 5 | 4 | 4 | Both phrases, on the credit-agreement exhibits, including every amendment accession |
| 3 | Gibraltar | 5 | 3 | 3 | 5 | 4 | 4 | Both phrases, on the replacement credit agreement only |
| 4 | Granite | 4 | 4 | 4 | 3 | 3 | 4 | Both phrases, on the 2026 indenture only; credit thread is benchmark-shaped and partly scanned |
| 5 | Hilton Grand Vacations | 4 | 5 | 4 | 4 | 2 | 4 | `"Builder Basket"` on credit-agreement exhibits; exact reclass phrase **not returned** |
| 6 | Tidewater | 5 | 3 | 4 | 4 | 3 | 3 | `"Builder Basket"` on the indenture; exact reclass phrase **not returned**; one of a cluster |

Rank 1 is the stress package: long numbered amendment chain plus a second instrument. Rank 2 is the cleanest credit-agreement builder/reclass chain and is not another "amended and restated credit agreement" clone. Neither rank is a recommendation to tune against the documents.

---

### 1. Insulet Corporation (PODD, CIK 0001145197)

Unseen in this repository. HTML exhibits, JPEG count 0 on every accession below. One Morgan Stanley credit facility from the original agreement through a ninth amendment, plus a senior-notes indenture filed with the seventh amendment. That length is outside the 3- and 4-document restatement chains already in the fixture set.

**Exact-phrase evidence:** `"Builder Basket"` and `"divide, classify and reclassify"` both return on **EX-4.1** of accession `0001193125-25-059783` (the indenture). They were **not** returned on the credit-agreement exhibits. That does not mean the credit agreement lacks either mechanic.

**Credit agreement chain** (Morgan Stanley Senior Funding, Inc., administrative agent; collateral agent on the original agreement):

| Role | Date | Accession | Exhibit | Filename | Notes |
|---|---|---|---|---|---|
| Original credit agreement | 2021-05-04 | 0001193125-21-150953 | EX-10.1 | `d180998dex101.htm` | Insulet Corporation and the lenders; MSSF as administrative agent and collateral agent. 8-K filed 2021-05-05. |
| Incremental amendment | 2022-06-15 | 0001193125-22-174941 | EX-10.1 | `d477416dex101.htm` | Short HTML (~56KB). Parties include Insulet MA Securities Corporation. |
| Second amendment and third amendment | 2022-11-30 | 0001193125-22-295969 | EX-10.1 and EX-10.2 | `d420238dex101.htm`, `d420238dex102.htm` | **Pairing unresolved.** Cover lists both amendments and both exhibit numbers. The sentence that would bind each name to a number was truncated. Sizes are ~1.43MB and ~40KB. Do not assume which file is which. |
| Fourth amendment | 2023-06-09 | 0001193125-23-164934 | EX-10.1 | `d348165dex101.htm` | |
| Fifth amendment | 2024-01-24 | 0001193125-24-014842 | EX-10.1 | `d730170dex101.htm` | |
| Sixth amendment | 2024-08-02 | 0001193125-24-193356 | EX-10.1 | `d878251dex101.htm` | |
| Seventh amendment | 2025-03-20 | 0001193125-25-059783 | EX-10.1 | `d825270dex101.htm` | Same 8-K as the indenture. |
| Eighth amendment | 2025-06-06 | 0001193125-25-137882 | EX-10.1 | `d933015dex101.htm` | EX-10.2 in this filing is a capped-call unwind form, not a covenant document. |
| Ninth amendment | 2026-09-21 | 0001193125-26-396779 | EX-10.1 | `d71204dex101.htm` | |

No 8-K titled "First Amendment" was returned by the CIK-scoped `"Credit Agreement"` search. A first amendment was not invented.

**Indenture** (the mechanic-phrase document):

| Role | Date | Accession | Exhibit | Filename |
|---|---|---|---|---|
| Indenture, Insulet Corporation / Computershare Trust Company, National Association, as trustee | 2025-03-20 | 0001193125-25-059783 | EX-4.1 | `d825270dex41.htm` |

Index URL pattern: `https://www.sec.gov/Archives/edgar/data/1145197/{accession-without-dashes}/{accession}-index.html`

**Why it is ranked first:** nine operative credit-agreement versions plus a second instrument family (indenture Article-style covenants beside a revolving/term credit agreement). Current fixtures do not look like this. A pass that only works on three-document restatements should fail here for structural reasons, whether or not the builder clause is clean.

**Open gaps:** Nov 2022 exhibit pairing; whether the large "amendment" HTML files are short-form amendments or conformed agreements (not opened, so unknown).

---

### 2. Knife River Corporation (KNF, CIK 0001955520)

Unseen. Three credit-agreement exhibits, all HTML. `"divide, classify and reclassify"` returns on **all three**. `"Builder Basket"` returns on the original agreement's exhibit. This is the cleanest credit-agreement mechanic chain in the hunt, and it is not an "Nth amended and restated" clone.

JPMorgan Chase Bank, N.A. is administrative agent (and collateral agent on the original, per the spin cover).

| Role | Date | Accession | Exhibit | Filename | Notes |
|---|---|---|---|---|---|
| Credit agreement | 2023-05-31 | 0001140361-23-027662 | EX-10.4 | `ny20009261x1_ex10-4.htm` | Spin 8-K filed 2023-06-01. Knife River Corporation, JPMorgan, lenders and L/C issuers. ~1.88MB HTML. One JPEG in the whole spin 8-K, not a scanned agreement. Schedules omitted under Item 601. |
| First amendment | 2025-03-07 | 0001955520-25-000013 | EX-10.1 | filename not recorded | Filed 2025-03-10. JPEG count 0. **Caption conflict, unresolved:** Item 1.01 says the filed text is the credit agreement as amended; the exhibit list says "First Amendment." Exhibit was not opened. |
| Second amendment | 2026-05-15 | 0001628280-26-036006 | EX-10.1 | filename not recorded | Filed 2026-05-18. JPEG count 0. Same caption conflict, unresolved. |

Same spin 8-K also has EX-4.2, a supplemental indenture dated 2023-05-31, joining guarantors to an indenture dated 2023-04-25 for 7.750% senior notes due 2031. That base indenture is not in the spin accession. It was not treated as the builder document.

**Sibling, not a second package:** Everus Construction Group, Inc. (ECG, CIK 0002015845). Credit agreement dated 2024-10-31, EX-10.4, accession `0001140361-24-044886` (JPMorgan, spin 8-K). First amendment dated 2026-09-01, accession `0002015845-26-000056`; exhibit number **not recorded** in this pass. Same sponsor family as Knife River. Do not ingest both and call them independent.

**Why it is second rather than first:** shorter chain, still a syndicated credit agreement, sibling dependence. **Why it is ahead of the replacement and the indenture-only hits:** the reclass phrase is on the credit-agreement exhibits themselves, including both later accessions, so a miss is about the mechanic and the amendment chain, not about a missing indenture parser.

---

### 3. Gibraltar Industries, Inc. (ROCK, CIK 0000912562)

Unseen. Both phrases return on the **2026 EX-10.1 only**. The structure is a payoff and replacement, not a numbered amendment stack. The 2022 facility and the 2026 facility have different agents.

| Role | Date | Accession | Exhibit | Filename | Notes |
|---|---|---|---|---|---|
| Credit agreement that was later terminated | 2022-12-08 | 0000912562-22-000046 | EX-10.1 | filename not recorded | Borrowers: Gibraltar Industries, Inc. and Gibraltar Steel Corporation of New York. KeyBank National Association, administrative agent, swingline lender, and issuing lender. Cover says this paid off a sixth amended and restated credit agreement dated 2019-01-24 with KeyBank. That 2019 filing was **not located** in this pass. |
| Replacement credit agreement | 2026-02-02 closing (8-K date) | 0001140361-26-003087 | EX-10.1 | `ef20064499_ex10-1.htm` | Borrower: Gibraltar Industries, Inc. Bank of America, N.A., administrative agent and collateral agent. ~2.27MB HTML, one JPEG in the 8-K. Cover Item 1.02 is the termination of the 2022 agreement. Item 2.01 is also on this 8-K (a transaction; the transaction agreement was not opened). A separate "dated as of" line for the new agreement was not extracted; the closing date above is the 8-K date. |

Exact reclass phrase, CIK-scoped from 2020-01-01: only the 2026 accession. The 2022 filing was inside that window and was not returned. `"Builder Basket"` was not searched before 2023-01-01, so the 2022 agreement is outside that window.

**Why it is third:** whole-document replacement is a different failure mode from the amendment-effect chains the repo has been iterating. It is also close to the "one new credit agreement" shape already represented by Chewy, so it is a weaker generalization test than Insulet if used alone.

---

### 4. Granite Construction Incorporated (GVA, CIK 0000861459)

Name appears in the unopened hit dump of `docs/phase-3-validation/01-source-identity-and-selection.json`. No title block was opened. Independence is discounted for that listing only.

Both mechanic phrases return on the **2026 indenture EX-4.1**, not on the credit-agreement exhibits. The credit thread is the familiar Bank of America amended-and-restated shape, and two of its filings are image-heavy. That is why this is not rank 1 or 2: part of the package is a benchmark clone, and part may fail as OCR rather than as semantics.

**Credit thread** — borrowers Granite Construction Incorporated, Granite Construction Company, and GILC Incorporated; Bank of America, N.A., administrative agent (also collateral agent, swingline lender, and L/C issuer on the restatements):

| Role | Date | Accession | Exhibit | Source note |
|---|---|---|---|---|
| Fourth amended and restated credit agreement, and fourth amended and restated guaranty | 2022-06-02 | 0001437749-22-014442 | EX-10.1 and EX-10.2 | Files `ex_383349.htm` (~1.09MB) and `ex_383350.htm` (~127KB). **Which file is which exhibit was not confirmed.** JPEG count 2. |
| Amendment No. 1 to that agreement | 2023-05-08 | 0001437749-23-013308 | EX-10.1 | Short HTML (~72KB). JPEG count 2. |
| Amendment No. 2 | 2023-11-30 | 0000861459-23-000029 | EX-10.1 | **JPEG count 255.** Scanned. Layne Christensen Company is a guarantor on the cover. Do not use an image failure as evidence about builder logic. |
| Fifth amended and restated credit agreement, and fifth amended and restated guaranty | 2025-08-05 | 0000861459-25-000037 | EX-10.1 and EX-10.2 | Cover binds 10.1 to the credit agreement and 10.2 to the guaranty. **JPEG count 70.** |

**Notes thread:**

| Role | Date | Accession | Exhibit | Filename |
|---|---|---|---|---|
| Indenture for 6.375% senior notes due 2034; Granite, the guarantors, U.S. Bank Trust Company, National Association, as trustee. Form of note included. | 2026-06-02 | 0001437749-26-019166 | EX-4.1 (cover also cites EX-4.2 as the form of note included in EX-4.1) | `ex_970386.htm` (~1.28MB, JPEG count 0) |

8-K cover states the indenture limits additional indebtedness, restricted payments, liens, and asset sales. That is the cover's family list, not a basket reading.

---

### 5. Hilton Grand Vacations Inc. (HGV, CIK 0001674168)

Name appears in the same unopened hit dump. No title block was opened. `"Builder Basket"` returns on four EX-10.1 filings. CIK-scoped `"divide, classify and reclassify"` from 2020-01-01 through 2026-10-07 returned **zero** hits. Reclass is not claimed.

Timeshare issuer, parent/borrower stack, several term-loan classes referred to on the covers (initial, amendment no. 4, amendment no. 7, amendment no. 8). That is real semantic distance. The amendment census is **incomplete**: this pass did not locate every numbered amendment between the 2021 agreement and amendment no. 10. Missing numbers were not invented.

| Role | Date | Accession | Exhibit | Filename |
|---|---|---|---|---|
| Credit agreement. Parent: Hilton Grand Vacations Parent LLC. Borrower: Hilton Grand Vacations Borrower LLC. Bank of America, N.A., administrative agent and collateral agent. | 2021-08-02 | 0001193125-21-235002 | EX-10.3 | `d196399dex103.htm` |
| Amendment No. 4 to that credit agreement | 2024-01-17 | 0001193125-24-009277 | EX-10.1 | `d929151dex101.htm` |
| Indenture; issuers include Hilton Grand Vacations Inc. and Hilton Grand Vacations Borrower Inc.; Wilmington Trust, National Association, as trustee. Form of 6.625% note due 2032 included in EX-4.1. | 2024-01-17 | 0001193125-24-009277 | EX-4.1 | `d929151dex41.htm` |
| Further credit-agreement amendment (number **not captured**) | 2024-10-08 event; filed 2024-10-09 | 0001193125-24-234812 | EX-10.1 | `d886392dex101.htm` |
| Amendment No. 8 | filed 2025-02-03 | 0001140361-25-002888 | EX-10.1 | `ef20042787_ex10-1.htm` |
| Amendment No. 10 | 2026-07-17 | 0001140361-26-028827 | EX-10.1 | `ef20078182_ex10-1.htm` |

EX-10.2 on the January 2024 8-K is an amendment to a license agreement with Hilton Worldwide Holdings Inc. It is not part of the debt package.

Builder-phrase window began 2023-01-01, so the 2021 EX-10.3 was not in that search.

---

### 6. Tidewater Inc. (TDW, CIK 0000098222) — cluster representative only

Same-day indenture and credit agreement. `"Builder Basket"` returns on **EX-4.1**. The exact reclass phrase was not returned for this CIK in the issuer intersection. Do not count the other offshore EX-4.1 hits (listed under rejections) as separate packages.

Accession `0001104659-25-066169`, filed 2025-07-07. JPEG count 1. HTML sizes ~903KB and ~974KB.

| Role | Date | Exhibit | Filename | Parties captured |
|---|---|---|---|---|
| Indenture | 2025-07-07 | EX-4.1 and EX-4.2 | `tm2519982d1_ex4-1.htm` | Tidewater Inc., the guarantors named therein, Wilmington Trust, National Association, as trustee |
| Credit agreement | 2025-07-07 | filename is `tm2519982d1_ex10-1.htm` | same | **Full party list and an unbroken "Exhibit 10.1" caption sentence were not captured.** The file is in the index. The cover identifies a credit agreement of this date. |

---

## What this hunt does not decide

- No issuer is cleared for ingestion, for a blind run, or for a pin.
- Phrase presence is not a representation, not a builder role, and not a reclassification right.
- Rank is not "most likely to pass." Rank 1 is the package most likely to punish a system fit to the current restatement-shaped fixtures.
- Everus, the offshore EX-4.1 cluster, and Granite's amended-and-restated credit thread are dependence risks if someone later treats them as fresh evidence.
- A future ingestion, if separately authorized, still has to freeze the pipeline before any exhibit body is opened, and it still has to leave these covers' economic summaries out of prompts and scorers.
