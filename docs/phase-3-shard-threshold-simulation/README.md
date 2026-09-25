# Phase 3 — Zero-cost shard-threshold simulation

**Paid model calls: 0.** Everything here is the real planner (`planCompilationShards`) run locally over the sealed
CONMED population at eight `targetPrimaryChars` values, plus fixture-only censuses of the other three datasets.

## Artifacts

| File | Content |
|---|---|
| `01-per-threshold.json` | §5 metrics for 12,000 (control), 10,000, 9,000, 8,000, 7,000, 6,000, 5,000, 4,000 over the 137-candidate dedup population |
| `02-focus-cases.json` | §6 the seven focus cases (short/long 7.2(e), 7.2(k) parent/long, 7.2(k)(i), 7.2(k)(ii), 7.6) per threshold, with slices |
| `03-all-candidates.json` | every candidate × threshold: shards, oversized, primary chars, boundary classes, composite-risk reasons, slices |
| `04-method.json` | budget derivation, tiers, call model |
| `05-cross-dataset-span-census.json` | §4C DSGR / CONMED / LSB / FWRG operative-span census (fixture-only) |
| `06-false-credit-controls-structural.json` | §10 the 14 controls vs the appended-parent mechanism |
| `07-dual-key-rows.json` | every candidate in the four datasets that carries a second (parent) structural key |
| `08-root-cause-candidate-span.json` | what the simulation actually found |

Method: `maxPrimaryChars = 2 × targetPrimaryChars` (production ratio 24,000/12,000); every other `ShardBudget`
field is `DEFAULT_SHARD_BUDGET`. 17 candidates ran with their real frozen inventories (Tier 1); 120 ran the real
planner with an empty inventory (Tier 2: boundaries and sizes are real, must-link protection absent).
Boundary classes are assigned to operative-region shard edges; cross-reference expansion shards are whole nodes.

## Per-threshold result (137 candidates)

| threshold | unsharded | sharded | shards | mean/med/p90/max | mean pri | p90 pri | max pri | oversized | inv calls | convs | max seq | MID/UNK | composite risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 12,000 | 60 | 77 (56.2 %) | 374 | 4.1 / 4 / 6 / 7 | 2,307 | 6,026 | 9,621 | 0 | 354 | 374 | 16 | 0 / 0 | 5 |
| 10,000 | 60 | 77 | 374 | 4.1 / 4 / 6 / 7 | 2,307 | 6,026 | 9,621 | 0 | 354 | 374 | 16 | 0 / 0 | 5 |
| 9,000 | 60 | 77 | 377 | 4.14 / 4 / 6 / 7 | 2,289 | 6,026 | 9,312 | 0 | 354 | 377 | 16 | 0 / 0 | 8 |
| 8,000 | 60 | 77 | 379 | 4.17 / 4 / 6 / 7 | 2,277 | 6,026 | 9,312 | 0 | 354 | 379 | 16 | 0 / 0 | 10 |
| 7,000 | 60 | 77 | 382 | 4.21 / 4 / 6 / 7 | 2,259 | 6,000 | 9,312 | 0 | 354 | 382 | 16 | 0 / 0 | 13 |
| 6,000 | 60 | 77 | 383 | 4.22 / 4 / 6 / 7 | 2,253 | 6,000 | 9,312 | 0 | 354 | 383 | 16 | 0 / 0 | 14 |
| 5,000 | 60 | 77 | 384 | 4.23 / 4 / 6 / 7 | 2,247 | 6,000 | 9,312 | 0 | 354 | 384 | 16 | 0 / 0 | 15 |
| 4,000 | 60 | 77 | 386 | 4.26 / 4 / 6 / 7 | 2,236 | 6,000 | 9,312 | 11 | 354 | 386 | 16 | 0 / 0 | 16 |

The threshold is **inert**: 10,000 is byte-identical to the control; 9,000 → 4,000 add 3–12 shards to 374, leave
inventory calls (354), max sequential calls (16) and the shard rate (56.2 %) unchanged, reduce the largest primary
shard only from 9,621 to 9,312, and raise composite-split risk from 5 to 8–16 candidates.

## Why: the "long provisions" are short provisions with their whole parent section appended

Every long focus case decomposes as *own text + "\n\n" + all of section 7.2 (8,843 chars)*:
7.2(e) long = 200 + 2 + 8,843; 7.2(k) = 776 + 2 + 8,843; 7.2(k)(i) = 54 + 2 + 8,843; 7.2(k)(ii) = 455 + 2 + 8,843.

1. `pass-c-neighborhood.ts:158-166` links EXCEPTION/BASKET/PROVISO/CONDITION candidates to their containing section
   (a "what does this exception modify" link).
2. `lib/contract-model/analysis/orchestrator.ts:418` — and the pilot's `operativeTextFor()` identically — build the
   operative text as `structuralNodeIds.map(DESCENDANTS).join("\n\n")`, so the link becomes operative text.
3. `resolveSourceContext` presents the join as one contiguous OPERATIVE region; the planner recognises only the anchor
   subtree, so the appended section is a single atomic residue unit (`7.2(k)~2`, 8,845 chars) that no threshold splits.

67 of 137 CONMED candidates (48.9 %) carry the parent this way (all NEIGHBORHOOD_EXPANSION, all parent-prefix keys);
59 of the 65 candidates over 4,000 chars are of this kind. In the real records the split is stark: frozen pilot
(262 records) — dual-key 134/134 FAILED vs single-key 12 of 128 non-failed; population run (20 records) — dual-key 0/7
COMPLETED vs single-key 9/13. The same mechanism covers 39.1 % of the four-dataset universe (488 / 1,248):
DSGR 30.1 %, LSB 54.9 %, FWRG 56.3 % (FWRG appends a median 17,454-char parent).

## §10 false-credit controls

None of the 14 control sections is *split* by any threshold (their chapeau text is either a single unit or the
own|parent seam). Nine of the 14 control sections are however appended verbatim into 93 DSGR exception/basket/
condition candidates' operative text, which is a direct structural route to crediting a chapeau rule from a child
candidate. A lower threshold does nothing about that; a candidate-span fix does.

## Verdict

No threshold in 4,000–12,000 makes 7.2(k) tractable "without fragmenting legal propositions": from 9,000 down the
planner splits it into `[0,776] | [776,9621]`, the second piece being section 7.2 in its entirety, not 7.2(k)'s text.
Recommended value for any controlled experiment: **12,000 (unchanged)**. Non-dominated set: {12,000, 10,000}
(identical); every lower threshold is dominated (more composite risk, no call-profile gain).
The exact next bounded action is a zero-cost remediation *design* for the candidate-span contract
(anchor node = operative; linked parent = context), not a threshold change.

Reproduce: `npx tsx scripts/p3-conmed-pilot/shard-threshold-sim.ts` then `npx tsx scripts/p3-conmed-pilot/span-census.ts`.
Tests: `tests/phase-3-conmed-pilot/shard-threshold-sim.test.ts`.
