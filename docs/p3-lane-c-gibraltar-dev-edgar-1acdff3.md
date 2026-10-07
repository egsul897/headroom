# Lane C — Gibraltar DEVELOPMENT EDGAR package

Tip `1acdff345fff655f602fd61ff20c395028b6f140`. Designation from Arch+Cert at 2026-10-07T15:05:09Z: Gibraltar is DEVELOPMENT. Knife River is BLIND.

Soft gate. This designation is not CERTIFIED. Nothing in this package is PINNED_OFFLINE. PINNED_OFFLINE is not CERTIFIED. No discoveryId was minted. Absence below is absence, not a placeholder.

## 1. Retrieval (C2)

Authoritative source is SEC EDGAR. No secondary database was used.

| Field | Value |
|---|---|
| Issuer | GIBRALTAR INDUSTRIES, INC. |
| CIK | 0000912562 |
| Ticker | ROCK |
| Accession | 0001140361-26-003087 |
| Filing date | 2026-02-02 |
| Form | 8-K |
| Exhibit | EX-10.1 |
| Original filename | `ef20064499_ex10-1.htm` |
| Source | SEC EDGAR `https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/ef20064499_ex10-1.htm` |
| Body SHA256 | `6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a` |
| Body bytes | 2,266,666 (`text/html`) |
| Retrieval timestamp | 2026-10-07T15:09:42Z |
| Instrument class | **ORIGINAL** |

Cover page: EXECUTION VERSION, CREDIT AGREEMENT, dated as of February 2, 2026, among Gibraltar Industries, Inc., as borrower, and Bank of America, N.A., as administrative agent and collateral agent. The cover is not an amendment and not an amended and restated credit agreement. The single “Amended and Restated” phrase in the extracted text is the defined term Fee Letters (an Amended and Restated Fee Letter dated December 22, 2025).

The issuer’s Form 10-K filed 2026-02-26 (accession `0000912562-26-000025`) is how this exhibit was identified: Item 15 lists “Credit Agreement, dated as of February 2, 2026 … incorporated by reference to Exhibit 10.1 to the Company’s Current Report on Form 8-K filed February 2, 2026.” The same 10-K says the new agreement terminated a credit agreement dated as of December 8, 2022. That predecessor’s index identity, body not opened, is accession `0000912562-22-000046`, filed 2022-12-09, EX-10.1, filename `exhibit101gibraltar-credit.htm`.

No Gibraltar 8-K, 10-Q, or 10-K filed after 2026-02-02 contains a credit-agreement amendment exhibit. Q1 2026 Form 10-Q exhibits 10.2 through 10.6 are an equity-award form and bonus repayment agreements. Their titles were read so they would not be ingested. They are not part of this package. The 10-Q exhibit index says schedules to Exhibit 10.1 were omitted under Item 601(a)(5).

Fixture: `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/`.

## 2. Ingestion, structure, discovery (C3)

Ran on this development document only.

Ingestion was the offline pure functions the product path uses: `parseDocument` (`text/html`) and `chunkDocument`. Extracted text is 1,029,323 characters, SHA256 `4131d3c166f8bddb6fe41d31f626057ec27c0d1ad4917ed2ce46d5b89986a5f5`, 511 chunks (444 with a section ref). No `IngestionJob` was persisted. There is no company database in this run.

Structure is `parseDocumentStructure` + references + definitions + `buildStructuralIndex`.

| | |
|---|---|
| Nodes | 2,087 (ARTICLE 20, SECTION 282, SUBSECTION 346, CLAUSE 488, SUBCLAUSE 951) |
| Definitions | 564 |
| References | 1,459 (491 resolved, 968 unresolved) |
| Health | 918 INFO findings: 306 `DUPLICATE_LABEL_EXPECTED`, 306 `AMBIGUOUS_LEGAL_REFERENCE`, 306 `DUPLICATE_NORMALIZED_PATH` |

Articles I through X appear twice: table of contents, then the body. Bare section labels are therefore AMBIGUOUS under `resolveUniqueNodeByRef`. Operative Article VII sections are the long-span nodes, not the table-of-contents lines:

| Section | Heading | Span (chars) | Pass A signals on the section’s own chapeau |
|---|---|---:|---|
| 7.01 | Indebtedness | 21,491 | `headline_heading` |
| 7.02 | Limitations on Liens | 415 | `exception_marker`, `permitted_construct`, `covenant_verb`, `headline_heading` |
| 7.03 | Fundamental Changes | 4,234 | `exception_marker`, `covenant_verb`, `headline_heading` |
| 7.04 | Asset Dispositions | 5,767 | `headline_heading` |
| 7.05 | Restricted Payments | 34,605 | `headline_heading` |
| 7.06 | Burdensome Agreements | 7,962 | none on the chapeau |
| 7.08 | Financial Covenants | 2,694 | `headline_heading` |

There is no 7.07 body (`[Reserved]`). Supersession on every Pass A candidate is `UNKNOWN_SUPERSESSION_STATUS` because this run ingested one original agreement and no amendment chain.

Discovery Pass A (`runPassADeterministicSignals`, discovery run version `phase-2b-discovery-pipeline.v4+phase-2b-discovery.v3`) produced 946 deterministic candidates. Pass B, Pass C, and Pass D did not run. `AI_GATEWAY_API_KEY` and `ANTHROPIC_API_KEY` are unset. The pipeline refuses a synthetic Pass B, and this lane did not invent semantic roles or discoveryIds. Structural `nodeId` values in the fixture are compiler output. They are not discoveryIds.

Natural search was over operative section spans (section span at least 400 characters), then the tightest descendant span that contained the hit. Expected cells were not pre-labeled.

### What the text actually contains

**Debt.** Operative §7.01 Indebtedness, 21,491 characters. Pass A marks the heading. The baskets sit in the children, not in the 39-character chapeau.

**Liens.** Operative §7.02 is short. The prohibition is: create or permit a Lien on assets (a “Subject Lien”) except a Permitted Lien, plus a sentence allowing a Lien to secure an Increased Amount of Indebtedness that was permitted at incurrence. The basket inventory is not in §7.02. It is in the Permitted Liens definition.

**Restricted payments.** Operative §7.05 Restricted Payments, 34,605 characters. §7.05(a) prohibits dividends, repurchases, subordinated-debt retirement, and Restricted Investments, then builds a capacity clause. §7.05(b) is Permitted Payments.

**Investments.** No Article VII section is headed Investments. “Restricted Investment” is inside §7.05(a)(4). “Permitted Investment” occurs 26 times, as a defined term. A standalone investments covenant is absent.

**Asset sales.** The negative-covenant section is §7.04 Asset Dispositions (5,767 characters): “Cause or make any Asset Disposition, unless…” The defined term is Asset Disposition. Lowercase “asset sale” appears in other sections, including incremental-equivalent debt and §7.05. There is no section titled Asset Sales. The table-of-contents duplicate makes the bare label 7.04 AMBIGUOUS.

**Financial covenants.** §7.08 has two tests, both limited to the revolving credit facility and the initial tranche A facility. §7.08(a) is a Consolidated Total Net Leverage Ratio cap: 5.25 to 1.00 for quarters ending June 30, 2026 through December 31, 2026, stepping down to 4.25 to 1.00 after June 30, 2028, with an optional 0.50x increase after a Qualifying Material Acquisition. §7.08(b) is a Consolidated Interest Coverage Ratio floor of 3.00 to 1.00 from the quarter ending June 30, 2026. Pass A’s section chapeau only carries `headline_heading`. The ratios are in the subsections. An embedded page number “249” sits in the extracted §7.08(b) window.

**Shared capacity.** The phrase “shared capacity” does not occur. Pass A’s `shared_cap` signal fired on 51 nodes, almost all because the pattern matches “aggregate amount,” including EBITDA add-backs. That signal is not evidence of a shared basket. A real reallocation term does appear: “Restricted Payment Reallocated Amount,” including inside the Permitted Liens definition as an amount reallocated to clause (14) of Section 7.01(b). That is development evidence of a reallocation mechanic, not a selected shared-cap cell.

**Builder / grower.** “Grower” does not occur. “Available Amount Builder Basket” occurs twice in the filed HTML:

1. The definition says it has the meaning specified in Section 7.05(a)(y).
2. The operative sentence is printed as clause `(vi)`: the greater of (A) $137,600,000 and (B) 40.0% of LTM EBITDA, and the same sentence calls that prong “the foregoing clause (y).”

Pass A `builder_language` hit that 95-character prong. The compiler’s structural path for it is `7.05(a)(4)(ii)(vi)(B)`, structural node `structural-node:99a53df526604251c4688760`. That path is not Section 7.05(a)(y). The filed HTML itself disagrees about the marker: the definition cites 7.05(a)(y), the printed marker is (vi), and the parenthetical says clause (y). Eight `builder_language` hits also include false positives on “cumulative” (GAAP cumulative effect, and §10.03 Cumulative Remedies). “Retained Excess Cash Flow Amount” in §2.05 is a separate ECF retention concept, on a 3,094-character node.

**Reclassification.** §7.01 contains a borrower classification and reclassification mechanic: if an item of Indebtedness meets more than one clause, the borrower classifies it and may later reclassify it under clause (b), provided the target clause and any related Liens permit it at the time of reclassification. The extracted window includes the page number “229”. The tightest compiler node is `7.01(b)(a)`, 488 characters, structural node `structural-node:6cb24e6cce5938385cd350b3`. That path is not a clean legal label. Separate “redesignation” language concerns Unrestricted/Restricted Subsidiary status. It is not this debt-reclassification sentence. “Anti-duplication” does not occur.

## 3. Development evidence, not a selection

These showed up from the document and from Pass A. They are not selected into the stratified matrix. Cleaner does not mean chosen.

| Topic | What appeared | Why it is not a cell |
|---|---|---|
| WITH_BUILDERS | “Available Amount Builder Basket,” self-cited as §7.05(a)(y), printed as clause (vi), 95-character dollar/EBITDA prong | Marker disagreement is in the EDGAR HTML. Compiler path `7.05(a)(4)(ii)(vi)(B)` matches neither citation. Pass A also fires on unrelated “cumulative.” No discoveryId. |
| WITH_RECLASS | §7.01 classify / reclassify paragraph | Buried in a 21,491-character section, page furniture “229” in the window, compiler path `7.01(b)(a)`. No discoveryId. |
| ASSET_SALES | §7.04 Asset Dispositions, 5,767 characters | Real heading and chapeau. Bare ref 7.04 is AMBIGUOUS (table of contents plus body). Not a short unique operative window. No discoveryId. |

Absent, and left absent: grower; a section titled Asset Sales; a standalone Investments negative covenant; the phrase shared capacity; any post-closing amendment exhibit; any discoveryId; any pin.

## 4. Blind contamination check

The BLIND issuer’s body was not opened. This lane did not fetch that body, search its clauses, or inspect its covenant wording.

The string “Knife River” does appear in this package. It appears in `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/provenance.json` at `knifeRiver.reason`, and it appears in this report where the BLIND designation is restated. That is designation and reason text. It is not a retrieved URL and it is not a filing body.

The retrieval URL list (`retrieval/urls.txt`) and the saved credit-agreement body (`raw-html/ef20064499_ex10-1.htm`, plus the extracted text) do not contain that issuer name, KNF, or MDU. 127 of the 130 retrieval URLs are under EDGAR data CIK `912562` (Gibraltar). One index URL used CIK `1140361`, the accession prefix of the same February 2, 2026 Gibraltar 8-K. That response is the filing index, and its document links point back at `/Archives/edgar/data/912562/...`. The only credit-agreement body saved is `ef20064499_ex10-1.htm`, SHA256 above.

The BLIND designation stands. The body stays unread.

## 5. Gate

Soft gate. DEVELOPMENT is not CERTIFIED. No offline pin was written. PINNED_OFFLINE is not CERTIFIED. Pass B was not simulated. DiscoveryIds were not invented. Structural node ids are not discovery ids.
