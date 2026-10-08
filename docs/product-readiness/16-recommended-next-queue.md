# Recommended next queue

Priority 0 = false permissions, dangerous omissions, source authority, evidence corruption. Ownership per the
collaboration contract: Cursor owns `lib/` remediation; this track owns fixtures, harness, docs.

## Cursor track (remediation, deterministic, pinned by tests on this branch)

| # | item | register | acceptance (test that flips) |
|---|---|---|---|
| 1 | Entity-scope widening refused when the clause narrows the section lead-in | IPV-01 | `adversarial:A-P2` passes |
| 2 | "together with … pursuant to Section X" shared cap required in the IR | IPV-02 | `adversarial:F-P3` both variants pass |
| 3 | Lineage-cited omission of a material proviso refused | IPV-03 | `adversarial:A-P1`, `H-P3` lineage-on-rule pass |
| 4 | Override / waiver / side-letter documents reach the operative state (at least unattached or REVIEW) | IPV-16 | `mutation:MUT-12:*`, `MUT-08:*` PRODUCT verdicts pass; M `operative:2026-06-30:credit-agreement#7.01(b)` passes. Land with or before item 5a: on package M, IPV-19's REVIEW is what currently hides this false permission |
| 5 | Operative-authority gate: TOC-title modal, no-modal covenants, stale descendants | PR136-F1/F2/F4 | `source-authority.test.ts` 28/28 in the PR #136 worktree |
| 5a | Definition amendments target the definition; definition retrieval reads the operative text | IPV-19, IPV-20 | `invariants.test.ts` INV-05 F1/F3 PRODUCT verdicts pass |
| 5b | Comparator direction: a figure introduced by 'in excess of' / 'exceeding' / 'not less than' is never accepted as a cap | IPV-22 | `invariants.test.ts` INV-25 L-P2 refused |
| 5c | Definition-graph traversal: diamond dependencies are not cycles | IPV-21 | INV-19/19b pass; I 7.01/7.02/7.04 and L 7.07 certification rows no longer cite a cycle |
| 6 | Section-level candidate over amended agreement uses current text with lineage | IPV-04 | C `certification:credit-agreement::7.01` |
| 7 | Unresolved amendment → instrument not RESOLVED | IPV-05 | H operative-state row |
| 8 | Definition-level shared capacity representable; a covenant family for restricted debt payments | IPV-15, IPV-18 | J 7.08 certification; K `semantic:K-7.09(b)` and 7.09 certification |
| 9 | Parser: TOC on certified path, dropped letter, inline enumerations, exhibit term lists | IPV-11/07/06/08 | E/G/H STRUCTURE rows |
| 10 | Plural defined terms; depth-2 undefined terms surfaced | IPV-09/10 | D/E/F/G/H CONTEXT_RETRIEVAL rows |

## This track (harness, fixtures, docs)

1. ~~Per-covenant normalised text hash in manifests~~ done (`textSha256`, doc 09 §7).
2. ~~Side-letter / waiver / consent mutants across A, C, H, I~~ done (MUT-13…16); next: on-disk side-letter documents in
   a package whose manifest expects the override to be surfaced, so the acceptance run (not only the mutation suite)
   carries IPV-16.
3. ~~Package K and adversarial plans for I/J/K~~ done; next: a package with a ratio-bearing sibling on the *other*
   side (to pin the CALCULATION_PROVISION vs CROSS_REFERENCE typing observation from IPV-17's closure).
4. Content-addressed node identity experiment (doc 09 §3): measure what a text-hash + occurrence identity would keep
   stable across the 12 mutants; propose the mapping to Cursor.
5. Continuous-loop invariants (directive's 40): next ten — hanging proviso attaches to every preceding clause; "greater
   of" baskets need the metric input; "notwithstanding" clauses override within the same document; Article IX-style caps
   outside the covenant article; definitions amended by a later amendment; effective-date conditions precedent;
   reclassification elections; currency baskets without FX; springing covenants on availability; guarantees by
   non-guarantor subsidiaries.
6. Product backlog slices (CFO/treasury/legal): evidence-pack export format; "what changed since last compile" view
   (blocked on identity); question log with refusal reasons; counsel review queue.

## Founder decisions

- Authorise doc 15 (≈$0.20 expected, $1.00 ceiling) — E3 first.
- Decide whether PR #136 is merged before or after F1/F4; this track's recommendation is after.

## Self-replenishing backlog pass (2026-10-08, after invariant batch 6)

Per the directive's §SELF-REPLENISHING BACKLOG, inspected in order:

1. **Uncovered legal invariants** (doc 17): #8 maintenance covenants at runtime (no springing construct in the
   runtime); #16 designation entity scope (semantic only); #32 reclassification representation / election at runtime;
   #34 partially (only reserved kinds tested; APPLY_RECLASSIFICATION without an election not yet).
2. **Missing negative tests**: ratio comparator cases on every ratio clause (masked on B by IPV-12); "not less than"
   covenant-level floors (none in the corpus besides H); a percentage-of-metric basket submitted with the percentage
   changed; an exception submitted as a permission (posture flip); a condition moved from one clause to a sibling.
3. **Untested production interfaces**: discovery Pass B–D (needs a provider); the Layer-2 reviewer; the live
   interpreter for MODIFY_PROVISION / UNKNOWN_CHANGE (F2/F4 forms); persistence (none exists); the operative-authority
   gate on main (PR #136 unmerged).
4. **Prior failures without breadth**: IPV-04 (stale section text) only on C; IPV-05 only on H; IPV-13 ontology only
   on D/E; IPV-16 has breadth; IPV-19/20 on A and C; IPV-21/22 have breadth.
5. **Manifest gaps**: packages I/J/K/L have no operativeState.exact rows (single-document, no amendments: nothing to
   pin); B/E/F/I/J/K/L have no operative-state scenarios at all — a definition amendment fixture per package would
   add IPV-19 breadth on disk.
6. **New adversarial compositions**: a package with an amended definition AND a side letter AND a diamond dependency
   (all three P0 classes at once) to see which refusal wins and whether any false permission survives the others'
   REVIEW; an amendment that both restates a clause and amends a definition in one document.
7. **Untested cross-document interactions**: an indenture amendment (supplemental indenture) targeting the indenture
   while the credit agreement is unchanged; an intercreditor that references a section number that exists in both
   agreements (ambiguous cross-document reference).
8. **Cost measurement**: doc 15 E2 is the only route; offline, record the prompt token counts the mocked stage sees
   per unit (the prompt text exists) to tighten the DETERMINISTIC_ESTIMATE's overhead constant.
9. **Workflows lacking criteria**: outside-counsel export format (W7 states fields, no format); reviewer notes with
   citations; onboarding / data-room ingestion assumptions (directive items 11–12).

Next prioritized bounded tasks (this track):
- T1. On-disk definition-amendment fixtures (one per package B, F, I) so IPV-19/20 carry acceptance-run signatures.
- T2. Posture-flip and percentage-change adversarial kinds (item 2) via the declarative `adversarial` field.
- T3. ~~Triple-composition package~~ done (`pkg-m-composed-p0`): IPV-19's fail-closed side effect masks IPV-16 and IPV-20; IPV-21 does not fire because of IPV-09. Remediation order: IPV-16 and IPV-20 must land with or before IPV-19 (doc 12 point 9).
- T4. ~~Supplemental-indenture package~~ done on B (second-instrument amendment resolves correctly; IPV-04 breadth on the indenture).
- T5. ~~Prompt-token measurement from the mocked stage~~ done (doc 08 §Prompt-size measurement: estimates low by ≈2–3× on input tokens; re-basing deferred to E2).
- T6. ~~Onboarding / data-room ingestion assumptions doc~~ done (`19-onboarding-and-ingestion-assumptions.md`).
