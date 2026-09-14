# Phase 3 Chewy remediation - F-7B.2: source-anchored definition attribution

Starting SHA `d9949102b6da7806428cdc79a60da42c4fe76016`. **Paid model calls: 0. Cost: $0.00.** The same five already-paid
F-7B.1 shard results are re-stitched offline; no shard was re-executed, the remaining 31 shards were not touched, and the
frozen 36-shard plan (`planHash 67d9f086...`), shard ids and shard hashes are unchanged. Verdict: **F7B_STAGE1_READY_FOR_COMPLETION**
(16/16 closure-gate points - `09-final-gate.json`).

## 1. The defect, reproduced before any code change (`00`, `01`)

F-7B.1 closed with a failed trust gate: 20 definitions entered authoritative IR with no provenance. The F-7A stitcher
attributed a model-emitted `IRDefinition` that matched no planner DEFINITION unit and carried no owned inventory lineage
to `shard.ownedUnitKeys[0]` - the `SHARD_FIRST_UNIT` fallback. "The model emitted it from this shard" is not evidence of
anything, so the fallback manufactured ownership.

The starting-SHA stitcher was replayed in a detached git worktree over the identical five accepted compositions:
**74 definitions emitted, 74 retained, exactly 20 source-unverifiable, 0 collisions.** That reproduces the F-7B.1 gate
count exactly, before a line of production code was changed.

Root causes, all four real and independent (`02`):

| | cause | how it contributed |
|---|---|---|
| A | `UNSAFE_SHARD_FIRST_UNIT_FALLBACK` | ownership granted from shard position alone |
| B | `NESTED_DEFINITION_NOT_MODELED_AS_SOURCE_ANCHOR` | a term declared inside an enclosing unit had no representable proof, so no honest path could accept it |
| C | `RETRIEVED_CONTEXT_EMISSION_NOT_DISTINGUISHED` | an emission reachable only through read-only context looked identical to an owned one |
| D | `DEFINITION_PROVENANCE_DROPPED` | nothing recorded *where* a retained definition came from, so the failure was invisible afterwards |

## 2. The invariant and the remedy

A definition enters authoritative IR only with at least one affirmative proof, and never on shard position:

1. **PLANNER_DEFINITION_UNIT** - its term is a planner DEFINITION unit the emitting shard owns;
2. **OWNED_INVENTORY_LINEAGE** - it carries lineage to inventory items the shard owns;
3. **UNIQUE_PRIMARY_SOURCE_DECLARATION** - its term is declared exactly once in the shard's own primary source text.

Attribution precedence is `DEFINITION_TERM -> LINEAGE_MAJORITY -> PRIMARY_SOURCE_DECLARATION -> UNATTRIBUTED`, and the
last one drops the emission and records it. `SHARD_FIRST_UNIT` is gone from the definition path (it still attributes
rules, which is out of scope for this mission).

Proof class 3 lives in one new deterministic module,
`lib/contract-model/compiler/semantic/definition-source-anchor.ts`. It reads the shard's **owned** unit text and nothing
else - never read-only context, never tool-retrieved provisions, never the rest of the document - and reuses the
structural index's own definition grammar and quote alternation rather than introducing a parallel legal parser. Two
generic declaration forms the structural grammar does not anchor are added **for attribution only**: incorporation by
reference (`"Term" has the meaning assigned to such term in Section X`) and the multi-term list (`"A," "B" and "C" means`).
`structural-definitions.ts` is deliberately not changed - new units there would move planner unit derivation and with it
the frozen shard boundaries and hashes.

Two details that matter for correctness. A declaration is located over each **contiguous run of adjacent owned units**,
not each unit in isolation, because the structural index sometimes splits a multi-term declaration across a unit
boundary; the anchor is still attributed to the one owned unit whose own offsets contain the term. And exactly one
declaration anchors: zero leaves the definition unattributed, more than one is an explicit `AMBIGUOUS` outcome sent to
review, never a first match.

`DefinitionSourceAnchor` is stitcher and audit metadata (`stitched.definitionSourceAnchors`, plus a per-object
`definitionAttribution` record covering dropped emissions too). It is never written into the IR definition object.

## 3. Offline re-stitch of the same five paid results (`02`, `03`, `04`)

| | before (starting SHA) | after |
|---|---|---|
| definitions emitted / retained | 74 / 74 | 74 / 74 |
| PLANNER_DEFINITION_UNIT | 52 | 52 |
| OWNED_INVENTORY_LINEAGE | 8 | 8 |
| UNIQUE_PRIMARY_SOURCE_DECLARATION | 0 | 20 |
| **source-unverifiable** | **20** | **0** |

All 20 classify as **A - PRIMARY_NESTED_DEFINITION_ANCHORED**: every one is genuinely declared inside the emitting
shard's own primary text, and every anchor's excerpt is a real declaration (18 incorporation-by-reference entries, 2 from
one multi-term list). None is a contextual emission, so nothing was dropped. That also corrects the F-7B.1 narrative,
which had called these "nested defined terms inside the shard's own primary text"; reading the real source shows they are
formal Section 1.01 entries whose substance is incorporated from a cited provision.

## 4. Nothing else moved (`05`, `06`)

Owned-material accountability is byte-identical before and after: Stage-1 owned material **28 total, 23 represented,
3 dispositioned, 2 missing (92.9% accounted)**; global Pass C 37 represented, 3 dispositioned, 68 material missing,
`semanticallyComplete: false`. Quantitative values, lineage references, distinct lineage items, dependency edges,
unresolved dependencies, rule references and defined-term references are all identical, and dangling lineage references
stay at 0. `DEFINED_TERM_REFERENCE` resolves by term name rather than by definition id, so a dropped definition can never
strand an id.

## 5. What is proven synthetically rather than by the real run (`07`)

Because every emitted definition in the five paid shards earned a proof, the **drop** paths never fired in the real
re-stitch. The real run therefore proves only the positive half of the invariant. The negative half is proven by the
16-test A-J matrix over generic synthetic text (`tests/contract-model/f7b2-definition-source-anchor.test.ts`): a
definition reachable only through read-only context is dropped; a term owned by another shard's planner unit stays with
its owner; two declarations of one term are an explicit ambiguity, not a first match; a quoted term with no definitional
grammar and a bare capitalized mention are not definitions; lineage alone still retains; a term-unit/lineage
disagreement is surfaced, never silently reconciled; a dropped definition leaves no dangling reference and stays visible
for review; duplicate emissions resolve to one authoritative copy or an explicit conflict.

## 6. Regressions (`08`)

`npx vitest run tests/contract-model/` fails on exactly the same 34 tests as the starting SHA - zero new failures, zero
tests fixed by accident. The F-7A planner/stitcher suite is 31/31, the semantic-compiler suites 180/180, the new matrix
16/16. `tsc` reports the same 6 pre-existing errors, all in `tests/foundation-audit/**`. ESLint is clean on every
touched file.

## 7. Scope deliberately not executed

The remaining 31 shards, any rerun of the five paid shards, any whole-Chewy rerun, and Phase 4 were all left untouched.
Rule attribution still uses the first-unit fallback and is out of scope by mission design - one root cause per mission.
