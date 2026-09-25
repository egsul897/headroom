# Phase 3 — Candidate-span contract: R1 + R2 + R3 implemented

**Paid model calls: 0. Benchmark files changed: 0. Phase-4 files changed: 0.**

The design mission established that `orchestrator.ts` uniquely concatenated every linked structural
node's descendant text into a child candidate's `operativeSourceText`, while every other consumer
treated that entry as what Pass C created it to be — a link. This mission implements the three
REQUIRED changes and nothing else.

| id | file | change |
|---|---|---|
| **R1** | `lib/contract-model/compiler/candidate-span.ts` (new), `lib/contract-model/analysis/orchestrator.ts` | operative source is the anchor node's text alone |
| **R2** | `scripts/p3-conmed-pilot/pipeline.ts` | the harness delegates to that same rule |
| **R3** | `lib/contract-model/compiler/semantic-verification/verify.ts` | Gate 2 also reads the `PARENT_SCOPE` excerpts |

`structuralNodeIds` is never written. Discovery, Pass C, candidate identity, the prompt, the
few-shots, the shard threshold, the tool-call limit, the timeout, the model and every Phase-4
interface are untouched.

## Red first

12 of the 24 new assertions failed under the old contract and pass under the new one
(`02-red-baseline.json`, `10-test-evidence.json`). The baseline also recorded what had to be true:
67/67 dual-key candidates carried text outside their own anchor span (401,430 chars in total), the
focus spans were manufactured (200→9,045, 776→9,621, 54→8,899, 455→9,300, each appending the same
8,845 chars of section 7.2), and **15** dual-key candidates carry condition language that exists
*only* in their parent chapeau — which is why R3 is required rather than optional.

## What changed, measured

| metric | before | after |
|---|---|---|
| operative chars, sealed 137 | 505,889 | 104,459 (**−79.35 %**) |
| p50 / p90 / p95 / max | 3,689 / 7,987 / 9,095 / 9,621 | 300 / 1,558 / 3,501 / 8,843 |
| candidates > 4k / > 8k | 65 / 14 | 6 / 1 |
| planner shards (sharded candidates) | 374 (77) | 191 (33) |
| inventory calls | 354 | 278 |
| candidates at 16 sequential calls | 40 | 2 |
| verifier source window, economic items | 9,179 (CONMED) / 90,057 (DSGR) | 2,185 / 66,417 |
| foreign amounts inside a candidate's operative window | 64 candidates affected | **0** |

7.2(e) long → 200, 7.2(k) → 776, 7.2(k)(i) → 54, 7.2(k)(ii) → 455 — each now a single shard. The
six candidates still over 4k are the section-level candidates themselves (7.2, 7.3, 7.4, 7.5, 7.8,
7.9), which are legitimately that long. Short 7.2(e), the 7.2(k) parent and 7.6 are byte-identical.

Every figure reproduces the design simulation exactly.

## What did not change

- **Context.** 67/67 dual-key candidates keep the link on the candidate *and* carry the linked node
  as a typed `PARENT_SCOPE` item (mean 319 chars of chapeau, max 758). Zero context-loss cases.
- **Coverage.** `structuralNodeIds` is never written, so `discoveredNodeIds`, the covered-unit set
  and the bundle inputs are the same computation over the same array — 133 distinct nodes, hash
  `d95518f2…`. Independently, 9/9 appended parent sections are themselves candidate anchors.
- **False-credit controls.** 14/14 protected; no expected result changed, none excluded.
- **Determinism.** Operative text, bundle ids, `PARENT_SCOPE` item ids and coverage inputs all hash
  identically across two passes.

## Two things surfaced rather than smoothed over

1. **A third production file.** The design estimated two edits. Stating the rule once
   (`candidate-span.ts`) is the only way to make production/harness parity structural instead of two
   copies that can drift — which is how the concatenated span went unnoticed in the first place.
2. **The harness dedup now yields 135, not 137.** Two candidate pairs sharing an anchor and
   differing only in discovered *role* used to be handed different operative text; they now produce
   identical compiler input. `role` never reaches `SemanticCompilerInput`, so the harness dedup's own
   equivalence rule genuinely applies, the dedup report records both drops, and production identity
   is unaffected (discovery keys on anchor + role + fingerprint, never on source text). The
   sealed-population invariant test was updated to assert 163 / 137-before / 135-after by name.

## Cache

Affected semantic-compiler cache keys change, because `operativeSourceText` is part of the key.
That is correct. No stale hit is preserved and the cache schema is untouched.

## Next

`11-paid-validation-manifest.json` holds the 22-candidate validation (~$0.114, ceiling $0.40).
It is **prepared, not dispatched** — it needs separate authorization and the HTTP-402 gateway block
cleared.

Verdict: `12-verdict.json` — **CANDIDATE_SPAN_REMEDIATION_READY_FOR_PAID_VALIDATION**.
