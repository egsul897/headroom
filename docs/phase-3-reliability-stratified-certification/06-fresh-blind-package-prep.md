# Phase 3 — fresh-blind package prep

**Verdict:** `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`
**Status:** `DISCOVERY_ONLY`. Soft gate. Not a Phase-3 grant. Not ingestion authority. Not a pin. Not certification.
**IMPLEMENTED ≠ CERTIFIED.** Rank ≠ ingestion. Invent-absence. A search miss is not a finding that a clause is absent. Missing evidence is HOLD.
**Tip inspected:** `1acdff345fff655f602fd61ff20c395028b6f140`
**Lane 7 source:** draft PR #107, `docs/phase-3-lane7-blind-package-hunt.md`, branch `cursor/lane7-blind-package-hunt-199a`, commit `5e0b1e3f64e1d5d9064b1a5ccda3c4baea84f2f7`. This file does not rewrite that rank.
**This run stops on the verdict above.** The missing items are listed once, at the end. They are not a research queue.

## What was read

- PR #107's hunt markdown. That file is the record of 8-K covers and EDGAR full-text search metadata. This prep did not re-open those covers.
- `HOLDOUT_SPEC` in `scripts/lib/semantic-accountability-regions.ts`, `docs/semantic-accountability/12-holdout-run-1.json` (header fields), `docs/semantic-accountability/14-holdout-stability.json` (method and totals), `docs/phase3-final-closure.md` (the 90.11% paragraph and the later cuts), and `docs/final-lightweight-unseen/00-validation-contract.json` (`frozenProductionBaseline.headSha` only).
- Five EDGAR filing-index HTML pages. Rows below are the rows those pages returned. Exhibit `.htm` files were not requested. Complete-submission `.txt` files were not requested.

No file was added under `tests/fixtures/`. No `discovery-candidate` id was minted. No provider call was made.

## Prep order under the four criteria

#107 rank, quoted from that file: 1 Insulet, 2 Knife River, 3 Gibraltar, 4 Granite, 5 Hilton Grand Vacations, 6 Tidewater. #107 calls rank 1 the stress package (long numbered amendment chain plus a second instrument) and rank 2 the credit-agreement chain whose reclass phrase is on the credit-agreement exhibits.

The first fresh-blind slot uses four criteria from the task: credit-agreement HTML preferred over indenture-only phrase hits; builder and reclass phrase coverage; amendment-chain length; scan risk. No 1–5 scores are assigned here. A cell is an observation from #107 or from an index page, or it is HOLD.

| Issuer | #107 rank | Credit-agreement HTML vs indenture-only | Builder + reclass | Chain, as recorded | Scan risk | Prep slot |
|---|---:|---|---|---|---|---|
| Knife River | 2 | Both phrases are recorded on credit-agreement exhibits. Reclass is recorded on all three accessions. `"Builder Basket"` is recorded on the original exhibit only | Amendment accessions: no `"Builder Basket"` hit and no `"Builder Basket"` miss in #107. HOLD | Three accessions. Filenames are on the index pages below. Caption conflict on both amendments. HOLD on document form | Index type of each named exhibit is HTML (`.htm`). Image-wrapper status was not observed. HOLD | First named package |
| Gibraltar | 3 | Both phrases are recorded on the 2026 EX-10.1, which the index types as HTML | 2022 reclass: #107's CIK-scoped search from 2020-01-01 returned only the 2026 accession. 2022 `"Builder Basket"`: #107 says that phrase was not searched before 2023-01-01. HOLD | Two credit-agreement accessions, different agents in the #107 covers (KeyBank, then Bank of America). 2026 "dated as of" was not extracted. HOLD | Same HOLD as Knife River: `.htm` on the index, wrapper not observed | Second named package |
| Insulet | 1 | #107: both phrases returned on indenture EX-4.1 `d825270dex41.htm` only. They were not returned on the credit-agreement exhibits. That is not a finding that the credit agreement lacks either mechanic | HOLD for the credit-agreement exhibits | #107: "nine operative credit-agreement versions" plus the indenture. November 2022 exhibit pairing unresolved. No 8-K titled "First Amendment" was returned. A first amendment was not invented | #107: JPEG count 0 on the accessions it listed. Those indexes were not re-fetched here. HOLD for this prep's own eyes | Deferred. Stays #107 rank 1 |
| Hilton Grand Vacations | 5 | `"Builder Basket"` recorded on EX-10.1 filings. Exact reclass phrase: #107 records zero hits for the CIK from 2020-01-01 through 2026-10-07 | Reclass not claimed | #107: amendment census incomplete. Missing numbers were not invented | Not re-fetched. HOLD | Out of the first two |
| Granite | 4 | Both phrases recorded on the 2026 indenture EX-4.1, not on the credit-agreement exhibits | HOLD for the credit-agreement exhibits | Fourth and fifth amended-and-restated thread, as #107 describes the covers | #107: JPEG count 255 on Amendment No. 2 and 70 on the fifth restatement filing | Out of the first two |
| Tidewater | 6 | `"Builder Basket"` recorded on EX-4.1. Exact reclass phrase not returned for the CIK in the issuer intersection | HOLD | Same-day indenture and credit agreement. #107: one of a cluster | #107: JPEG count 1. Not re-fetched. HOLD | Out of the first two |

**First named package: Knife River Corporation (KNF, CIK 0001955520).** Evidence for the slot: reclass phrase on all three credit-agreement accessions; `"Builder Basket"` on the original credit-agreement exhibit; three named HTML exhibit rows; #107's statement that this chain is not an "Nth amended and restated" clone. That statement is from covers and search metadata. This prep did not read the agreements. Everus Construction (CIK 0002015845) is the sibling #107 held out. It is not a second package. Its amendment exhibit number and both filenames are unrecorded here. HOLD.

**Second named package: Gibraltar Industries, Inc. (ROCK, CIK 0000912562).** Evidence for the slot: both phrases on the 2026 EX-10.1; that file is HTML on the index; the 2022 file is a separate EX-10.1 HTML row; #107 records different administrative agents. #107 also says a one-agreement replacement is a weaker generalization test than Insulet if used alone, and is close to the Chewy shape. This prep does not convert that remark into a prediction.

**Insulet is not in the first two** because the phrase hits #107 recorded are on the indenture exhibit, and the November 2022 pairing is unresolved. Interpreting a future miss on Insulet is HOLD until those facts change. This file does not diagnose that miss.

## Open gaps (HOLD)

- Knife River amendments: #107 caption conflict. Item 1.01 says the filed text is the credit agreement as amended. The exhibit list says "First Amendment" or "Second Amendment." Index document names are `exhibit101-firstamendment.htm` and `exhibit101-secondamendment.htm`. The names do not resolve the conflict. Document form is HOLD.
- Index byte sizes, not a classification: original EX-10.4 is 1,876,577 bytes; first-amendment row is 3,060,926 bytes; second-amendment row is 2,798,669 bytes.
- Knife River original dates, all kept: #107 agreement date 2023-05-31; index period of report 2023-05-30; index filing date 2023-06-01.
- Gibraltar 2022 dates, all kept: #107 agreement date 2022-12-08; index period of report 2022-12-09; index filing date 2022-12-09.
- Gibraltar 2026: index period of report and filing date are 2026-02-02, the same date #107 uses as the 8-K date. "Dated as of" for the new agreement: not extracted. HOLD.
- `"Builder Basket"` on the Knife River amendment accessions: no hit and no miss in #107. HOLD.
- Reclass on Gibraltar 2022: search returned only the 2026 accession. That is not a reading of the 2022 text. HOLD.
- `"Builder Basket"` on Gibraltar 2022: outside the search window #107 stated. HOLD.
- Scan risk for every `.htm` named below: extension and index type only. HOLD on whether the HTML is an image wrapper.
- #107 recorded JPEG count 0 for accession `0001955520-25-000013`. The index page returned a GRAPHIC row, `pressrelease.jpg`, 20,076 bytes, beside EX-99.1 `exhibit991-pressreleasedat.htm`. Both records stand. This prep does not pick one.

## File names and URLs

These rows are identities for a later grant. This document is not that grant.

URL shape that resolved for the index fetches: `https://www.sec.gov/Archives/edgar/data/{cik}/{accession-without-dashes}/{filename}`

The complete-submission `.txt` named on each index is not in the set. This prep did not open those files and does not describe their contents.

### Knife River — files named for a later grant

CIK path segment used: `1955520`. Parties as #107 recorded them: Knife River Corporation; JPMorgan Chase Bank, N.A., administrative agent.

| Role on the #107 cover | Dates | Accession | Exhibit | Filename from the index page | Index size (bytes) | URL |
|---|---|---|---|---|---|---|
| Credit agreement | 2023-05-31 (#107); period of report 2023-05-30; filed 2023-06-01 | `0001140361-23-027662` | EX-10.4 | `ny20009261x1_ex10-4.htm` | 1,876,577 | https://www.sec.gov/Archives/edgar/data/1955520/000114036123027662/ny20009261x1_ex10-4.htm |
| First amendment, caption conflict unresolved | Period of report 2025-03-07; filed 2025-03-10 | `0001955520-25-000013` | EX-10.1 | `exhibit101-firstamendment.htm` | 3,060,926 | https://www.sec.gov/Archives/edgar/data/1955520/000195552025000013/exhibit101-firstamendment.htm |
| Second amendment, caption conflict unresolved | Period of report 2026-05-15; filed 2026-05-18 | `0001628280-26-036006` | EX-10.1 | `exhibit101-secondamendment.htm` | 2,798,669 | https://www.sec.gov/Archives/edgar/data/1955520/000162828026036006/exhibit101-secondamendment.htm |

Index pages fetched:

- https://www.sec.gov/Archives/edgar/data/1955520/000114036123027662/0001140361-23-027662-index.html
- https://www.sec.gov/Archives/edgar/data/1955520/000195552025000013/0001955520-25-000013-index.html
- https://www.sec.gov/Archives/edgar/data/1955520/000162828026036006/0001628280-26-036006-index.html

Same accessions, not in the named set. Legal character beyond the index label is HOLD unless #107 already stated it.

| Index label | Accession | Filename | Note |
|---|---|---|---|
| EXHIBIT 4.2 | `0001140361-23-027662` | `ny20009261x1_ex4-2.htm` | #107 calls this the supplemental indenture on the spin 8-K and says it was not treated as the builder document. Body not opened |
| GRAPHIC | `0001140361-23-027662` | `ny20009261x1_ex99-2img01.jpg` | 3,998 bytes. #107: one JPEG in the spin 8-K, not a scanned agreement |
| GRAPHIC | `0001955520-25-000013` | `pressrelease.jpg` | 20,076 bytes. See the JPEG-count conflict above |
| EX-10.4 (Everus) | `0001140361-24-044886` | not recorded | Sibling. Amendment accession `0002015845-26-000056`; exhibit number not recorded |

#107 names EX-10.4 as the Knife River credit agreement on the 2023-06-01 8-K. The index also lists other EX-2, EX-3, EX-4, and EX-10 files. Their legal character was not classified in this prep. HOLD.

### Gibraltar — files named for a later grant

CIK path segment used: `912562`.

| Role on the #107 cover | Dates | Accession | Exhibit | Filename from the index page | Index size (bytes) | URL |
|---|---|---|---|---|---|---|
| Credit agreement later terminated. KeyBank. Borrowers as #107 recorded | 2022-12-08 (#107); period of report 2022-12-09; filed 2022-12-09 | `0000912562-22-000046` | EX-10.1 | `exhibit101gibraltar-credit.htm` | 1,125,748 | https://www.sec.gov/Archives/edgar/data/912562/000091256222000046/exhibit101gibraltar-credit.htm |
| Replacement credit agreement. Bank of America. "Dated as of" not extracted | 8-K date 2026-02-02; period of report 2026-02-02; filed 2026-02-02 | `0001140361-26-003087` | EX-10.1 | `ef20064499_ex10-1.htm` | 2,266,548 | https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/ef20064499_ex10-1.htm |

Index pages fetched:

- https://www.sec.gov/Archives/edgar/data/912562/000091256222000046/0000912562-22-000046-index.html
- https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/0001140361-26-003087-index.html

Same accessions, not in the named set:

| Index label | Accession | Filename | Note |
|---|---|---|---|
| GRAPHIC | `0000912562-22-000046` | `gibraltar_wordmarkxbluexrgb.jpg` | 147,573 bytes. Body not opened |
| EX-99.1 | `0000912562-22-000046` | `exhibit991creditfacility.htm` | 10,381 bytes. Body not opened. HOLD on what it is |
| GRAPHIC | `0001140361-26-003087` | `image00001.jpg` | 3,753 bytes. #107 recorded one JPEG on this 8-K |
| EX-99.1 | `0001140361-26-003087` | `ef20064499_ex99-1.htm` | Body not opened. HOLD on what it is |
| Item 2.01 on the 2026 8-K | `0001140361-26-003087` | not identified | #107: a transaction agreement was not opened. This prep did not identify its filename. HOLD |

## Fresh-blind protocol against the Superior holdouts

### What 90.11% is

| Field | Value | Where read |
|---|---|---|
| Package | Superior Industries International, Inc. term loan | `HOLDOUT_SPEC` |
| `companyId` | `final-phase3-closure-holdout-sup` | `HOLDOUT_SPEC` |
| `packageKey` | `sup-term-loan-2022-2025` | `HOLDOUT_SPEC` |
| Documents | doc-a term loan credit agreement 2022-12-15; doc-b amended and restated term loan credit agreement 2024-08-14; doc-c first amendment 2025-03-31 | `HOLDOUT_SPEC` |
| Regions | Eight regions, claims A1–A6 and B1–B4 | `HOLDOUT_SPEC` |
| Run directories named by the stability artifact | `tests/fixtures/semantic-accountability-validation/holdout/run-1` and `run-2` | `14-holdout-stability.json` |
| `productionSha` | `976a5650cbdf3bd4ce16fd86b7370bee30b341e4` | `12-holdout-run-1.json` |
| `productionTreeHash` | `199ba3f88e5bc31ae25572f6b59054c7f4733ab99dffad234d7c9a4601e4b5c1` | `12-holdout-run-1.json` |
| Compiler, inventory, verifier model | `anthropic/claude-sonnet-5` via Vercel AI Gateway | `12-holdout-run-1.json` |
| Method | `sameDisposition / inBoth` on material items that share an exact content-derived id | `14-holdout-stability.json` |
| Result | `sameDisposition` 82, `inBoth` 91, `dispositionStability` 0.9010989010989011, reported 90.11%. Required 0.95. Gate pass is false. `inventoryVariance` 372. `compositionVariance` 0. Critical-omission gate measured 0, required 0, pass true | `14-holdout-stability.json` |
| Later reading of those same two runs | Conservative semantic inventory stability 77.6%, plus the other cuts in that paragraph | `docs/phase3-final-closure.md` |
| Earlier Superior selection SHA | `2044f1c7de01d24f6bc8179aa477da801f07d79d` | `docs/final-lightweight-unseen/00-validation-contract.json` |

`HOLDOUT_SPEC` reads extracted text under `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text`. That is the same fixture directory the lightweight-unseen Superior thread used. This prep did not re-open that text.

### What a fresh blind has to be

Three requirements, and nothing invented around them:

1. **New package.** The corpus is not the Superior package, not `companyId` `final-phase3-closure-holdout-sup`, and not `packageKey` `sup-term-loan-2022-2025`. The prep order names Knife River first and Gibraltar second, one issuer per score. Everus is not added. No discovery id is minted in this file.
2. **Tip compiler SHA.** The run records `productionSha` for the compiler that actually runs. At this inspection that SHA is `1acdff345fff655f602fd61ff20c395028b6f140`. Tree objects at that SHA, read with `git rev-parse`, snapshot only: `lib` `fce8f40d82b59ccceb26b0cf85b676398d9a8501`, `app` `75fe0767c06b5f1e50bf6f47b029e2b37023dddf`, `prisma` `39d1be8be9b884811404d4bb35179ff15b1fd413`. This prep did not freeze the tree. The Superior 90.11% is bound to `976a5650cbdf3bd4ce16fd86b7370bee30b341e4`. A measurement at `1acdff3` is a different compiler.
3. **The 90.11% artifact stays the 90.11% artifact.** `docs/semantic-accountability/14-holdout-stability.json` remains 82/91 on the Superior runs. A fresh result does not replace that cell, does not average with it, and is not produced by rerunning `HOLDOUT_SPEC`. The phase3-final-closure re-score of those preserved runs is already a second reading of the same Superior runs. It is not a fresh blind.

HOLD, because they are not specified in the sources above and this prep does not invent them: the fresh-blind metric, the denominator rule, the number of runs, the model id, and the pass bar. The Superior 95% bar stays on the Superior gate. It is not copied onto the new package by this file.

No fresh-blind harness was added. No contract file for a run was added. A finished measurement, if one is later authorized, is still not `CERTIFIED`. `IMPLEMENTED` ≠ `CERTIFIED`.

### Snapshot at this tip

| Object | Value |
|---|---|
| `HEAD` | `1acdff345fff655f602fd61ff20c395028b6f140` |
| `HEAD:lib` | `fce8f40d82b59ccceb26b0cf85b676398d9a8501` |
| `HEAD:app` | `75fe0767c06b5f1e50bf6f47b029e2b37023dddf` |
| `HEAD:prisma` | `39d1be8be9b884811404d4bb35179ff15b1fd413` |

## Verdict

`BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`

Not `READY_TO_PIN`: no provision identity, no discovery id, exhibit bodies unread, soft gate.
Not `READY_FOR_GENERALIZED_IMPLEMENTATION`: no grant, and the items below are unresolved.
Not `BLOCKED_BY_ARCHITECTURE`: no architecture defect was established in this run.
Not `NO_VALID_CANDIDATE`: Knife River and Gibraltar are the named prep order under the four criteria. The block is the evidence those packages still lack.

Specific missing evidence:

1. Document form of Knife River `exhibit101-firstamendment.htm` and `exhibit101-secondamendment.htm`. Caption conflict unresolved. HOLD.
2. `"Builder Basket"` on Knife River accessions `0001955520-25-000013` and `0001628280-26-036006`. No hit and no miss recorded. HOLD.
3. Image-wrapper status of the five named `.htm` exhibits. Index type is HTML. Wrapper not observed. HOLD.
4. Gibraltar 2026 agreement "dated as of". Not extracted. HOLD.
5. `"Builder Basket"` on Gibraltar accession `0000912562-22-000046`. Outside the stated search window. HOLD.
6. Fresh-blind metric, denominator, run count, model id, and pass bar. Not in a frozen contract at this tip. HOLD. Not invented here.
