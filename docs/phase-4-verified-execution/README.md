# Phase 4 — verified execution (migration step 4: the strict product boundary)

The runtime primitives keep `DEFAULT_VERIFICATION_POLICY = ALLOW_MISSING` on purpose, so tests,
scripts and historical fixtures keep their exact meaning. Product execution must never inherit that
migration default. `lib/contract-model/verified-execution.ts` is the one place product code may
enter Phase 4, and its invariant is:

> Headroom executes legal capacity or transaction logic in product mode only from IR that has a
> corresponding verification artifact, under policy `REQUIRE`.

`REQUIRE` is a constant there, not an argument. A caller cannot downgrade it, cannot hand in a
"verified" boolean, cannot hand in its own capacity state, and cannot import the raw primitives
from a product surface (an architecture test scans `app/`, `components/` and `lib/`).

The package the boundary takes pairs each IR unit with its verification result **and the identity
of the IR the verifier saw** — the small record whose absence produced the 411-of-498 preservation
gap in the historical corpus. The envelope is built through the certified resolver immediately
before execution; a stale pairing fails closed through the step-3 identity check.

| Artifact | What it holds |
|---|---|
| `01-step-4-strict-boundary.json` | The boundary's contract, why it sits beside the runtime, the input package and its identity claim, envelope construction, refusal vocabulary, the A–N matrix, chain-integrity results, and what was left unchanged |

No UI. No global default change. No Phase 4E. No paid calls. Runtime tree untouched; inertness hash
`d0c8d913…1de031` unchanged.
