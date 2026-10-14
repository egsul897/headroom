# Section tree: acceptance findings (2026-10-14, offline snapshot = live Neon inputs)

Soft gate. Computed ≠ certified. Deterministic. No AI or LLM calls.

## Scoreboard (strict matcher), before vs after wiring the tree into the self-check
| split | before | after |
|---|---|---|
| DEV (36) | 287 (CG 198 / DG 79 / US 10) | 287 (unchanged) |
| HELDOUT (153) | 5326 (CG 1029 / DG 4284 / US 13) | 5326 (unchanged, 0 per-source deltas) |
| IN-SCOPE HELDOUT (112) | 4662 (CG 492 / DG 4157 / US 13) | 4662 |

**The tree does NOT lower HELDOUT errors.** Do not claim success. Why:
- 138 of 153 HELDOUT sources have **no document bytes** in Neon (`document_byte_objects` has a row for 3 of 141 edgar/ehb hashes). Those sources' packages are built from the candidate excerpts themselves. 5323 of 5326 HELDOUT errors are on those 138 sources.
- The 15 HELDOUT sources that do have text carry ~0 precedent candidates, so a better tree cannot move DISCOVERY_GAP on them.
- 2820 of the HELDOUT DISCOVERY_GAP candidates have no basket that reflects them, even under the old loose matcher. That is an extractor coverage problem, not a matching problem.
- Next lever (not done; it needs Neon writes): backfill document bytes for the 138 text-less sources from their `sourceUrl` (an SEC fetch).

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
