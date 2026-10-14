# Section tree: acceptance findings (2026-10-14, offline snapshot = live Neon inputs)

Soft gate. Computed ≠ certified. Deterministic. No AI or LLM calls.

## Scoreboard (strict matcher, offline snapshot, deterministic)
| variant | DEV (36) | HELDOUT (153) | IN-SCOPE HELDOUT (112) |
|---|---|---|---|
| baseline, no tree | 287 (CG 198 / DG 79 / US 10) | 5326 (CG 1029 / DG 4284 / US 13) | 4662 (CG 492 / DG 4157 / US 13) |
| tree section overrides label | 287 | 5315 (DG 4273) | 4651 |
| tree must AGREE with label (fail closed) | 287 | 5331 (DG 4289), gate FAILS | 4667 |

**Gaming check.** All 11 verdicts that flipped in the "tree overrides" variant were GAP→MATCH. I hand-checked all 11 and **0 of 11 are genuine**. All 11 are text-less (composite) sources. In each one the extractor built a "basket" from the candidate's own excerpt, gave it an unrelated covenant label, and glued on text from another excerpt. Examples:
- an Events of Default (a) limb labelled "§7.02 Fundamental Changes"
- "Waivers; Amendments" labelled "§7.03 Transactions with Affiliates"
- a GAAP definition labelled "§8.06 Restricted Payments"
- a Debt to Capitalization ratio matched to a "proviso" basket whose text runs on into the notices section

The tree only relabels these baskets; it does not show that a covenant was extracted. **I am not keeping the -11.** Tree locating in the self-check is OPT-IN (`CLF_SCOREBOARD_TREE=1`). When it is on, it uses the fail-closed agreement rule, and under that rule HELDOUT rises by 5. **Result: the tree does not lower HELDOUT honestly.**

Why the tree cannot move this metric:
## Document-type scope (deterministic classifier)
41 HELDOUT sources are OTHER: equity plans, bylaws, consents, swap confirmations, charters, LLC agreements, and a 10-Q body. They are listed by `clf:scoreboard` and are still counted in the gate totals. 6 UNKNOWN sources stay in scope.

## Tree on HELDOUT documents with text (15; that is every one there is)
See `section-tree-heldout-report.json`. 0 parse errors, 0 fail-closed sections. Unparsed text is ≤ 6.7% on 14 of 15 documents. The exception is pton (amendment plus conformed copy), at 53.5%. A TOC is excluded on 11 of 15.

## Hand verification (5 HELDOUT documents)
- aeo2 §10.01 Indebtedness (a)…(cc) and §10.02 Liens (a)…(n): correct children, spans and parents. Inline "(t) [reserved]; (u) …" is split correctly.
- mck §7.02(a)(i)(A)/(B): correct nesting.
- ef20064499 §7.01: **wrong**. The heading is cut ("Ind"). The inline list items (3)–(9) under (b) are mis-nested, and (c)–(i) became siblings of (a)/(b).
- mrvi §6.07: **wrong**. "(a)" is lost after a page number ("162 ("), so (i)…(vii) hang directly off the section.
- rbc §7.05: **partially wrong**. The proviso conditions (a)/(b)/(c) nest under prong (3).
Result: 2 of 5 clean, 3 with structural errors.

## Cross-references (15 docs)
Resolved / internal refs per document ranges from 0% to 87% (see the JSON). Unresolved refs are recorded explicitly (UNRESOLVED_NOT_FOUND / UNRESOLVED_EXTERNAL); most are deep clause paths such as 2.17(g)(ii)(A) that the clause parser did not build.
Of 10 hand-checked resolutions, 7 are correct.
- aeo2 6.01 → "Commitments" and 5.11 → "Status of Obligations" are wrong. The document's headings are renumbered relative to its own cross-references.
- rbc 7.01 resolved to a schedule list. This is fixed: duplicate paths now prefer the larger span.

## Update 2026-10-14 (reviewer notes on #364/#365, after the SEC text backfill)

### SEC text backfill (Neon, additive)
- 138 held-out sources had no stored bytes. All 138 were re-fetched from each source's own SEC URL (UA `HeadroomBackfill/1.0`, 4 req/s).
- **The raw sha256 matched for 0 of 138.** The original ingest (`lib/knowledge-factory/edgar/client.ts`) hashed the raw response body, so these bytes are not identical to what was ingested.
- The original ingest also recorded `normalizedTextHash` (`extractTextAsync` → `normalizeText(parseDocument(bytes))`). Recomputing it the same way gives:
  **TEXT_VERIFIED 108**, **UNVERIFIED_TEXT 25** (same accession and exhibit path, but the text differs), **UNLINKED 5**.
- Where the bytes differ is not known; the original bytes were not kept on the box, so this was not guessed.
- Bytes are stored under their own sha256 in namespace `sec-backfill-hash-mismatch`. Provenance and verification are in `kf_source_text_backfill`.
- Only BYTES_VERIFIED / TEXT_VERIFIED are linked for scoring. UNVERIFIED_TEXT is opt-in (`CLF_UNVERIFIED_TEXT=1`) and never in the gate.
- Raw SEC HTML is now stripped to text before computation (before this, citations contained markup and baskets collapsed).

### Split
DEV/HELDOUT is now split by issuer CIK (`devIssuerCiks`). This closes three leaks: the CONMED null-ticker rows d170717dex101 and d320648dex1025, and the DSGR null-ticker row d511994dex101. HELDOUT now has 137 sources.

### Scoreboard (strict matcher, issuer-CIK split, verified text only)
| run | HELDOUT total | CG | DG | US |
|---|---|---|---|---|
| before backfill, v0 (extractor only), no tree | 4880 | 1004 | 3819 | 57 |
| before backfill, v2, no tree | 3788 | 933 | 2784 | 71 |
| after backfill, v0, no tree | 4615 | 751 | 3751 | 113 |
| after backfill, v0, tree | **4457** (−158) | 751 | 3593 | 113 |
| after backfill, v2, no tree | 3616 | 710 | 2762 | 144 |
| after backfill, v2, tree | **2386** (−1230) | 710 | 1532 | 144 |

- v2's learned rules are unverified, and most of the v2 tree drop comes from learned-rule baskets citing the text. **The extractor-only (v0) number, −158, is the conservative one.**
- In-scope HELDOUT (v2): 3142 → 1946.

### Hand check of tree flips (16 flips across 8 HELDOUT docs, v2)
In every one of the 16, the candidate and the basket cite the same span (verbatim apart from whitespace), in the same tree section, and with the same family. Examples:
- tm2227571d1_ex4-2 6.02 Acceleration (a)
- starbucks 2.02(a)
- delta_ex1001 2.02(b)
- lyv ex1019 2.22(k)/(o)
- ex4march2017 1.3(d)
- a14-26274 1.2(a)

Why they were gaps without the tree: these candidates have `sectionRef=null` and their families (GENERAL_CONDITIONS, EVENTS_OF_DEFAULT, GUARANTEES, DESIGNATIONS, RESTRICTED_SUBSIDIARIES) have no canonical family, so the strict matcher had no structural evidence and failed closed. The tree supplies the location. No relabelling happens: the default `agree` mode still fails closed when the tree section and the declared section disagree.

**16/16 genuine.**

### #365 notes
- **(3)** Three nesting bugs fixed, each with a regression test:
  - **ef20064499 7.01:** the (b)(1)–(25) list now nests; the (3)(a)/(b) proviso nests under (3); inline (c)–(f) inside (8) no longer escape; the post-list (a)–(j) restart is `7.1[2]`. The title is "Indebtedness".
  - **mrvi 6.07:** (a) after the page number is found (indented line-start leads).
  - **rbc 7.05:** the page-number-merged "(4)" is found; the proviso (a)–(c) is `7.5[2]`; the second list is `7.5[3]`; no duplicated paths.
- **(4)** `CLF_SCOREBOARD_TREE_MODE=override` reproduces the rejected relabelling variant. Its 11 flips are in `tree-override-flips.jsonl`; 0/11 were genuine.
- **(5)** CNMD sources with no text: with no document text the locator builds one tree per candidate excerpt, so the tree still changes verdicts for those sources.
  - With the current parser the effect is −4 on ea029246401ex10-1 and −1 on conmed-gsa.
  - In each case the candidate's own heading ("SECTION 2.4 …") places it in the same section as a basket citing the same text.
  - Both sources are DEV under the CIK split.
- **(6)** `fetchDocumentText` throws a redacted error on Neon errors; it returns null only when the row is absent.
- **(7)** acn under-parse: a heading on the line after a sentence-ending period was treated as a mid-sentence reference (96 of 116 body headings were dropped). Fixed: 15 → 111 sections.
