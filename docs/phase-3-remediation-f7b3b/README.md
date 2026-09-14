# Phase 3 Chewy canary - F-7B.3B: definition-conflict evidence preservation

Zero model calls, $0.00. The same fifteen already-paid shard results are re-stitched offline. Verdict:
**F7B_WAVE_A_CONFLICT_FIXED_READY_FOR_WAVE_B** (17/17 closure gate). Wave B was not executed.

## 1. The defect

When two owner shards emitted the same definition with different content, the stitcher kept the first copy, raised a
review-required `DEFINITION_CONFLICT`, downgraded the kept copy to AMBIGUOUS, and discarded the other copy entirely. The
conflict was never silent. The losing variant's content simply ceased to exist.

In the real Wave A run the first copy was the empty one both times.

| definition | kept | discarded |
|---|---|---|
| Approved Bank | no lineage, no amounts | 2 owned lineage refs, `MONEY:100000000` and `MONEY:250000000` |
| Annual Threshold | no lineage, no amounts | 1 owned lineage ref, `MONEY:216000000` and `PERCENT:0.3` |

Classification: **DEFINITION_CONFLICT_VARIANT_DISCARDED**, in the `else` branch of the duplicate check in
`shard-stitcher.ts`.

## 2. A measurement correction, made before the fix

§12 defines the loss metric over the *accepted scoped* composition. A first implementation compared raw model lineage
ids against the stitcher's canonicalized ids and reported 28 losses that never happened. The baseline now mirrors the
two transforms the stitcher applies before ownership is decided: digest-form id canonicalization, then scoping to the
emitting shard's own inventory items. Reproduction then fell to 3 real distinct owned lineage ids, and the two
pre-registered lost values reproduced exactly. The correction was made before the production change and applies
identically to both modes.

This also reconciles with the Wave A gate, which reported 6. That figure counted lineage reference *occurrences* across
the whole composition; §12 pre-registers a set difference over distinct owned ids. Same defect, same two definitions,
two granularities: 6 occurrences resolve to 3 distinct owned items.

The reproduction also showed four definition ids with multiple distinct emissions, not two. Only two are owner-against-
owner conflicts. In the other two one side was unattributed, so the contextual path already excluded it and no conflict
collision fired.

## 3. The remedy

`StitchedCompilation` gains `definitionConflicts`, a first-class review record. Each entry keys on the stable
definitionId and holds every semantically distinct representation as a whole, immutable `IRDefinition`, along with the
union of owned lineage and quantitative literals across variants.

What it deliberately does not do: it resolves nothing. No variant is marked correct, no expressions are merged, no
scalar fields are reconciled, and the canonical copy kept in `definitions` is still the first in plan order, chosen for
downstream compatibility rather than as a truth claim. `DEFINITION_CONFLICT` still fires, still requires review, and the
canonical copy is still AMBIGUOUS.

Identical re-emissions collapse into one variant while keeping every emitting shard's provenance, so a term emitted as
A, A, B yields two variants with the first carrying two emissions. N-way conflicts are supported generically.

Pass C never reads this structure. It reconciles the canonical arrays only, so preserved evidence cannot manufacture
completeness.

## 4. Result on the fifteen frozen paid shards

| | before | after |
|---|---|---|
| owned values lost by stitching | 2 | 0 |
| owned lineage lost by stitching | 3 | 0 |
| conflict evidence records | 0 | 2 |
| stitched definitions | 170 | 170 |
| material represented / missing | 37 / 9 | 37 / 9 |

Accountability did not move, which is the point: preservation is evidence, not credit. Source attribution is unchanged
at 124 planner-unit, 22 owned-lineage, 45 primary-source-declaration and zero source-unverifiable. `MONEY:100000000` and
`MONEY:250000000` both survive inside the Approved Bank evidence, and the canonical copy still does not contain them.

## 5. Tests and scope

The A-J matrix is 15 of 15 (`tests/contract-model/f7b3b-definition-conflict-evidence.test.ts`), covering empty against
rich, order independence, two rich variants, disjoint lineage without duplicate credit, identical duplicates staying on
the duplicate path, A+A+B provenance, three-way conflicts, contextual emissions staying contextual, no dangling
references, and the impossibility of completeness from conflict evidence.

The repository failing set is byte-identical to baseline, 34 pre-existing failures and zero new. Typecheck and lint are
clean on every touched file. Production changes are confined to `shard-stitcher.ts` and `shard-types.ts`; the core
`IRDefinition` schema is untouched, and the planner, execution, transport normalization, caller, prompt and Pass A are
all unchanged.

Wave B was not executed. The next mission resumes it using the five frozen Stage-1 and ten frozen Wave A results with
unchanged shard hashes and zero reruns.
