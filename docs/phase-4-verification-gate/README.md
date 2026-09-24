# Phase 4 — verification-aware runtime gate (migration step 3: matcher + dominance)

The first mission in this programme that intentionally changes Phase-4 execution. Steps 1+2 put a
verification envelope in place and proved it inert; this step makes it live, for callers that
supply one, and keeps everything else byte-identical.

One module owns the semantics: `lib/contract-model/runtime/verification-gate.ts`. The four runtime
sites (4A node entry, 4A whole rule, 4C dominance, 4D legal floor) import it and ask; none
re-derives policy.

The predicate, stated once: **a MATERIAL finding × its scope relation to the node being evaluated.**
Status is never the predicate. `REVIEW_REQUIRED` without a material finding executes.
`VERIFICATION_INCOMPLETE` executes, is made visible, and floors at `REVIEW_REQUIRED` under its own
code so it can never be read as a defect.

Fail-closed: a UNIT-scoped finding, an identity mismatch, two records for one unit, and (under an
explicit `REQUIRE` only) a missing record all refuse the whole unit. `ALLOW_MISSING` stays the
default everywhere; no product caller exists and none was created.

| Artifact | What it holds |
|---|---|
| `01-step-3-implementation.json` | What was built at each site, the vocabulary added (with the two disclosed additions beyond the mission's list and why), the inertness hash, the inverted sentinel, the 14-case matrix and REQUIRE / WEAK / ownership / ordering results, the impact probe summary, and the UNIT-block inspection |
| `02-real-envelope-impact-probe.json` | The functional impact probe over the 87 bindable real material findings: NODE/UNIT blocks, REQUIRE simulation, capacity-status transitions, and every UNIT block classified by cause with the finding's reason excerpt |

Inertness with no envelope: `scripts/phase-4-inertness-probe.ts` hashes to
`d0c8d913…1de031` before and after, byte for byte.

Zero paid calls. Phase-3 compiler tree unchanged. Phase 4E stays blocked. Step 4 (the product
boundary, born `REQUIRE`) is a product decision and its own mission.
