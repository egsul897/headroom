# Phase 3 — Candidate-span contract remediation design

**Paid model calls: 0. Production files changed: 0.** This is a design, not an implementation.

The preceding zero-cost mission found that lowering the shard threshold is inert, and that the
"long provisions" are short provisions with their entire parent section appended as operative text.
This mission determines whether the obvious correction — *operative text belongs to the anchor
candidate only* — is correct and safe across the existing compiler architecture.

## Artifacts

| File | §  | Content |
|---|---|---|
| `00-starting-state.json` | 1 | SHA, branch, frozen module hashes, environment disclosure |
| `01-contract-trace-and-proposal.json` | 2, 3 | the 12-stage trace from Pass C to the verifier; what `structuralNodeIds[0]` and `[1..]` mean at real call sites; the proposed invariant |
| `02-conmed-before-after.json` | 7, 8 | the real planner run over all 137 CONMED candidates, current vs proposed |
| `03-per-candidate.json` | 7 | every candidate: chars, shards, calls, tokens, linked refs, PARENT_SCOPE retention |
| `04-same-anchor-groups.json` | 9 | candidates sharing one anchor |
| `05-false-credit-span-probe.json` | 5 | how many economic items the verifier's source window inherits from sibling clauses (CONMED + DSGR) |
| `06-consumer-matrix.json` | 6 | every production consumer of linked nodes, classified |
| `07-legal-semantic-safety.json` | 4 | cases A–H |
| `08-provenance-verifier-coverage.json` | 10, 11, 12 | provenance, verifier and coverage impact; controls exposure |
| `09-minimal-implementation-design.json` | 13 | R1/R2/R3 REQUIRED, F1–F3 SAFETY_FOLLOWUP, O1/O2 OPTIONAL |
| `10-paid-validation-and-success-gate.json` | 15, 16 | 22-candidate validation, ~$0.11, and the 10-point gate |
| `11-duplicate-candidate-question.json` | 9 | are the short/long pairs duplicates? |

Reproduce: `npx tsx scripts/p3-conmed-pilot/span-contract-sim.ts`,
`npx tsx scripts/p3-conmed-pilot/false-credit-span-probe.ts`,
`npx tsx scripts/p3-conmed-pilot/span-census.ts`.
Tests: `tests/phase-3-conmed-pilot/candidate-span-contract.test.ts`.

## The current contract, and where it breaks

`pass-c-neighborhood.ts:158-166` links an EXCEPTION / BASKET / PROVISO / CONDITION candidate to its
containing section — a *link*, in the code's own words, "so a downstream consumer asking *what does
this exception modify* never has to guess." Every consumer treats it as a link **except one**:

```
lib/contract-model/analysis/orchestrator.ts:418
operativeSourceText = candidate.structuralNodeIds.map(id => index.getNodeText(id, "DESCENDANTS")).join("\n\n")
```

That single expression turns the link into a span. `resolveSourceContext` then presents the
concatenation as one contiguous OPERATIVE region, and the planner sees the appended section as one
atomic residue unit no shard threshold can split.

Candidate identity never depended on the linked node: `pass-d-reconcile.ts:104` keys on
`structuralNodeIds[0]::role::fingerprint`. So the fix changes no `discoveryId`.

## Before / after (real planner, all 137 CONMED candidates)

| metric | current | proposed |
|---|---|---|
| operative chars, total | 505,889 | 104,459 (**−79.35 %**) |
| p50 / p90 / p95 / max | 3,689 / 7,987 / 9,095 / 9,621 | 300 / 1,558 / 3,501 / 8,843 |
| candidates > 4k / > 8k | 65 / 14 | 6 / 1 |
| planner shards (candidates sharded) | 374 (77) | 191 (33) |
| inventory calls | 354 | 278 |
| candidates at 16 sequential calls | 40 | 2 |

| focus case | current | proposed | shards | max sequential calls |
|---|---|---|---|---|
| 7.2(e) short | 200 | 200 | 1 → 1 | 14 → 14 |
| 7.2(e) long | 9,045 | **200** | 4 → 1 | 16 → 14 |
| 7.2(k) parent | 776 | 776 | 1 → 1 | 14 → 14 |
| 7.2(k) long | 9,621 | **776** | 3 → 1 | 16 → 14 |
| 7.2(k)(i) | 8,899 | **54** | 3 → 1 | 16 → 14 |
| 7.2(k)(ii) | 9,300 | **455** | 3 → 1 | 16 → 14 |
| 7.6 medium | 3,501 | 3,501 | 1 → 1 | 14 → 14 |

Every long focus case is *own text + "\n\n" + all 8,843 chars of section 7.2*. The six candidates
still over 4k afterwards are the section-level candidates themselves (7.2, 7.3, 7.4, 7.5, 7.8, 7.9),
which are legitimately that long.

Cross-dataset (fixture-only spans): DSGR 4,051,305 → 2,298,714 (−43.3 %), LSB 167,718 → 55,796
(−66.7 %), FWRG 2,890,765 → 507,606 (−82.4 %).

## Context is not lost

`retrieveParentScope` already emits every non-ARTICLE ancestor's **OWN** text — the chapeau, not the
subtree — as a typed `PARENT_SCOPE` item with a `PARENT_OF` edge, and `caller.ts:236` already renders
it in the prompt's *Already-gathered context* block. Measured: **67 of 67** dual-key CONMED
candidates already carry their linked parent as `PARENT_SCOPE`, mean 319 chars, max 758.
**Zero context-loss cases.** No new type is required — the existing `ContextItemType` union already
has PARENT_SCOPE, SIBLING_CONTEXT, PROVISO, EXCEPTION, CONDITION, SHARED_CAP, DEFINITION,
ENTITY_SCOPE, CROSS_REFERENCE and the rest.

Legal cases A, B, C, D, G, H are fully preserved. Cases E and F (a flush proviso attributed to the
last sibling rather than to the parent) depend on `retrieveSiblingContext`, which already exists with
the right types — they are the designated risk cases for the paid validation.

## False credit — the finding that decides it

The independent verifier builds the **source** side of its reconciliation from the same over-wide
text (`verify.ts:319 → buildSourceInventory`). So today:

- **all 67** dual-key CONMED candidates inherit economic items from sibling clauses;
- the verifier's source window holds **9,179** items, **5,505 (60 %)** of them foreign;
- mean **82.2** foreign items per dual candidate, max **195**;
- 7.2(k)(i) has **2** items of its own and **198** in its window.

A rule citing one of those foreign amounts **reconciles as SUPPORTED**. The verifier cannot prevent
misattribution today because its own notion of "the source" is the over-wide span. Under the proposal
the window shrinks to 2,185 items (CONMED) and 66,417 (DSGR), and such a citation reconciles
UNSUPPORTED and forces review.

On DSGR, **74** child candidates carry one of **8** of the 12 false-credit control sections verbatim
in their operative text (mean 136.9 foreign items each, max 290). *Correction:* the prior artifact's
"93" summed per control and double-counted the two control pairs that share a section; the correct
distinct-candidate figure is **74–79**.

## Coverage cannot disappear

The proposal does not touch `structuralNodeIds`, so `coverage-audit/pipeline.ts:162`,
`discovery-comparison.ts` and `semantic-coverage/reconciliation.ts:67` receive byte-identical input.
Independently, **70 of 70** appended parent sections across the four datasets are themselves anchored
candidates with their own operative text (CONMED 9/9, DSGR 46/46, LSB 7/7, FWRG 8/8) — the parent's
proposition is compiled by the parent, not borrowed from a child.

## The change

| id | class | file | what |
|---|---|---|---|
| **R1** | REQUIRED | `lib/contract-model/analysis/orchestrator.ts:418` | anchor-only operative text |
| **R2** | REQUIRED (harness) | `scripts/p3-conmed-pilot/pipeline.ts:135-137` | same, so measurements track |
| **R3** | REQUIRED | `lib/contract-model/compiler/semantic-verification/verify.ts:355` | Gate 2 must also read the PARENT_SCOPE excerpts, or the fix could *reduce* review on composite cases |
| F1 | SAFETY_FOLLOWUP | `context-retrieval/pipeline.ts:163` | type the linked node PARENT_SCOPE, not a second OPERATIVE_SOURCE |
| F2 | SAFETY_FOLLOWUP | `ir/types.ts` | optional `role?: "OPERATIVE" \| "CONTEXTUAL"` on SourceProvenance |
| F3 | SAFETY_FOLLOWUP | `tests/` | coverage-invariance test |
| O1 / O2 | OPTIONAL | doc comment / separate field | wording; a full field migration is *not* recommended |

Two production files, about four lines. Nothing else moves: not the prompt, not the few-shots, not
`targetPrimaryChars`, not `maxToolCalls`, not the timeout, not the model.

## Verdict

**CANDIDATE_SPAN_REMEDIATION_DESIGN_READY.**
