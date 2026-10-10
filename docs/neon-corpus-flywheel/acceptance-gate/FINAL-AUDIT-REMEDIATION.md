# Flywheel Batch 1 — Final Audit Remediation

## Verdict

**FLYWHEEL_BATCH1_READY_FOR_HUMAN_REVIEW**

## Concerns

### A. False definitions-section context (`isDefinitionsSectionHeading`)

**Reproduced.** `/defin/i` matched non-inventory headings such as “Incorporation of Definitions by Reference”, “Certain Definitions Incorporated Herein”, “Table of Defined Terms…”, and “Other Definitional Provisions”, activating per-definition body segmentation.

**Fix.** Affirm only inventory titles (`Defined Terms` / `Definitions` / `Additional Definitions` …); reject incorporation, schedule/table/index/list, cross-reference, and “other definitional provisions” headings.

### B. Cross-section definition boundary application

**Disproved for ordinary later sections.** Soft-clip / containment intervals are bounded by the next physical top-level ARTICLE/SECTION `charStart`, so a definition body end cannot clip clauses whose `charStart` is in a later section.

### C. Preamble enumerator span integrity inside a true definitions SECTION

**Reproduced.** Enumerators in the preamble gap before the first top-level `"Term" means` inherited `charEnd` from the first limb inside the next definition body (nestRank stack across per-body segments). Soft-clip only applied when an enclosing definition start was `≤ charStart`, so preamble limbs were unclipped.

**Fix.** Build explicit containment intervals per physical definitions SECTION, including the preamble gap `[section.charStart, firstDefStart)`, and clip every clause whose `charStart` falls inside an interval.

## Fingerprint delta (vs `187c72e0`)

Source: `final-audit-fingerprint-delta.json` — ERROR **0 → 0**.

| Package | added | removed | parentageChanged |
|---|---:|---:|---:|
| DSGR (all docs) | 0 | 0 | 0 |
| Chewy | 0 | 0 | 0 |
| LSB holdout | 0 | 0 | 0 |
| CONMED GCA | 1 | 1 | 0 |

Intended CONMED GCA correction: `1.1(a)` charEnd `6676 → 6237` (preamble limb no longer swallows into the next definition body). DSGR Available Amount, Chewy builder ownership, CONMED missing-base refusal, and LSB holdout behavior otherwise unchanged.

## SHA identity

| Identity | SHA | Role |
|---|---|---|
| `a3dd5895` | `a3dd58954e78a88832cba0611ea72ad979c80acc` | Acceptance-gate content docs pin (historical) |
| `187c72e0` | `187c72e06da53801f19dfaef548ecffb94e5e67f` | Prior #255 gate-close tip (historical; CI green) |
| #259 port | `697111a81ec22a592178d7c0542eb646ee273d79` | Exact additive port onto #253 |

Both `a3dd5895` and `187c72e0` are preserved; they are different states.
