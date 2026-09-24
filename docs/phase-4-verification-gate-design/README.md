# Phase 4 — verification-aware runtime gate (design only)

Phase 4 already honours Phase-3 **representation sufficiency** in four places. It has never been
given Phase-3 **semantic verification** state at all. So a rule can be `sufficiency: COMPLETE`,
carry a MATERIAL finding on the exact numeric its capacity expression evaluates, and still hand
Phase 4 an executable expression. This designs the narrow boundary that closes that — and nothing
else.

Three findings shaped the design more than anything in the brief:

1. **Phase 4 has no production caller.** Only scripts and tests import it. There is no flag day to
   manage: the strict boundary can be born strict, while the runtime primitives stay permissive so
   no historical fixture is silently reinterpreted.
2. **`irPath` is not a usable runtime contract.** 25% of pathed material findings are wildcard or
   prose (`rules[].exceptions`, `definitions[termName="…"].sufficiency`), and even a well-formed
   path is *positional* — `buildCapacityGraph` re-sorts rules by id, so `rules[0]` at verification
   time is not `rules[0]` at runtime. The fix is to resolve paths to **exprIds on the Phase-3
   side**, once, where the indices are still valid; runtime never parses a path.
3. **Status is the wrong predicate.** `REVIEW_REQUIRED` covers at least seven situations, most of
   which say nothing about any evaluated value. The predicate is a MATERIAL *finding* and its path
   relation to the node being evaluated.

| Artifact | What it holds |
|---|---|
| `01-design.json` | The full design: current contract trace, envelope, identity binding, path matching, materiality matrix, per-phase gate locations, policies, impact sizing, migration, test matrix, risks |

Zero paid calls. Zero production files changed. Phase 4E stays blocked, with its unblock
prerequisite stated.
