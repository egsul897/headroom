# F-7C.1 — Source-bound resume of a frozen Pass A inventory

Starting SHA `2cfb6b3f8e8a99b6ff9010307726ffa8f7b6a2ac`. Zero paid calls, $0.
No sharding-semantics change. No final paid Chewy validation. No Phase 4.

## The gap

F-7C added `CompileOptions.frozenInventory` so a frozen Pass A inventory can be
resumed without re-running Pass A. It admitted the inventory on
`candidateRef` equality alone. `candidateRef` is a routing label — which
provision the inventory was made *for* — never proof of which source it was
made *from*. Reproduced before any change
(`00-stale-resume-reproduction.json`, at the starting SHA): same candidate,
one byte changed inside a represented span → frozen inventory accepted,
Pass A skipped, compile `COMPLETED`.

## The invariant

Resume iff candidate identity matches **and** document identity matches where
recorded **and** source-context identity is proven compatible. Otherwise
refuse — never silently rerun, never silently accept.

`validateFrozenInventoryResume` (`frozen-inventory-resume.ts`) reuses the
F-5.3B identity model in `source-identity.ts` rather than inventing one:

| Inventory | Proof required | Method recorded |
|---|---|---|
| carries `sourceContextHash` | `computeSourceContextHash(current resolved context)` must equal it exactly, and the recorded state must equal the current state. An explicit mismatch **fails closed** — it is never rescued by re-anchoring. | `RECORDED_SOURCE_CONTEXT_HASH` |
| legacy (no hash) | `verifyInventoryAgainstSource`: every item region/offset/verbatim excerpt, every quantitative span, every unaccounted span and uninventoried value, the recorded slot partition when present, and the source-context state — any mismatch refuses. On success `stampVerifiedSourceIdentity` returns an **ephemeral** stamped copy; `frozenContentHash` is untouched and nothing on disk is rewritten. | `VERIFIED_BY_RE_ANCHORING` |

Both paths first require `candidateRef` equality and, when the inventory
records a `documentId`, equality with `sourceDocumentId`.

A refused resume is a structured `FAILED` result with the new narrow reason
`FROZEN_INVENTORY_SOURCE_MISMATCH` (never `PROVIDER_FAILURE` or
`MODEL_SCHEMA_FAILURE`), produced before any model call, never cached, with
each failing check listed under `unresolvedIssues`. A resumed compile records
how it was proven under `execution.frozenInventoryResume`.

## Orchestration and cache safety

The decision cannot exist before the current source context does, so
`compileCovenantToIR` now resolves the source context **first** — it is
deterministic and free — then computes the outer cache key, then looks the
cache up, then validates the resume. The key gained the canonical hash of the
resolved source context, so a request whose expansion regions changed while
its operative text and bundle identity did not can never be served a result
compiled over the old source, and no cache hit can bypass the gate
(`f7c1-frozen-inventory-resume.test.ts`, §8 — a real cross-reference
expansion region is mutated outside the operative window).

## The certified Chewy inventory

It predates `sourceContextHash` and is left byte-identical (fixture sha256
`a9221844…`, `frozenContentHash 9e5ec235…`, `sourceContextHash` still absent).
The production-route replay now admits it by `VERIFIED_BY_RE_ANCHORING` over
**1,065** deterministic checks against the current Chewy source — planHash
`67d9f086…` unchanged, `SHARDED`, 36 planned, **36 reused, 0 executed, 0
calls**, and the F-7B.3E equivalence differential is 41 equal / 4
intentionally additive / **0 mismatches**.

## Tests

`tests/contract-model/f7c1-frozen-inventory-resume.test.ts` — 15 provider-free
tests through the public entry: legacy exact source (allowed, record
explicit, object untouched); §11 source byte inside a represented span
(refused, Pass A not run); §12 context region absent / a real expansion region
mutated outside the operative window (refused); §13 document mismatch,
current and legacy (refused); §14 candidate mismatch (refused, now
structured); §15 `TRUNCATED_SOURCE` against `COMPLETE_LOCAL_SOURCE` evidence
(refused, both paths); §17 recorded hash match (allowed without migration) and
mismatch (refused with no re-anchoring fallback); §8 cache ordering.

One test-fixture correction: the synthetic corpus gave items an 80-character
excerpt over a whole-line span, a shape real Pass A never produces (it stores
the exact located slice). The fixture now honours the excerpt-equals-span
contract the verifier depends on.

## Artifacts

| File | What it is |
|---|---|
| `00-stale-resume-reproduction.json` | §1 the defect, reproduced at the starting SHA before any change |
| `01-post-fix-resume-behaviour.json` | the same harness after the fix — case B refused, Pass A calls 0 |
| `02-regression.json` | §22 suites, failing-identity diff, tsc, lint, build |
| `03-f7c1-gate.json` | §23 the 21-point gate |
| `../phase-3-remediation-f7c/01-…replay.json`, `02-…differential.json` | regenerated: the Chewy replay through the legacy re-anchoring path |
