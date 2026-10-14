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
