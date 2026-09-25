# Phase 3 — verified unit artifact persistence

The strict Phase-4 boundary executes only from a `VerifiedUnitArtifact`: the exact IR unit, the
exact verification result, and the identity of the IR the verifier saw. The historical corpus kept
those apart, and 411 of 498 MATERIAL findings could not be bound to the unit they were about.

`lib/contract-model/verified-units.ts` makes the pair the unit of persistence. The units are
snapshotted **before** the verifier runs, so the persisted identity describes what the verifier
saw; the package refuses a unit whose identity drifted afterwards. Failed, incomplete and
not-verified results are persisted too, because "attempted and incomplete" must stay
distinguishable from "no artifact". Nothing is resolved, filtered or decided here; the resolver
and the gate keep those jobs. The output is canonical, hashed, frozen, and re-checked on parse.

`scripts/p3-conmed-pilot/evidence.ts` writes the pair beside the forensic evidence in one call,
from the same in-memory objects, and a run manifest that exposes every gap. Both runners on the
CONMED path use it; the bare evidence writer is no longer called.

| Artifact | What it holds |
|---|---|
| `01-verified-unit-persistence.json` | The contract, identity timing, completeness rules, determinism/immutability, harness integration, the strict-boundary round trips, and the test counts |
| `02-conmed-dry-run.json` | The zero-cost CONMED dry run: one candidate through the real verifier (stub callers) → evidence + paired package + manifest → reload → strict boundary, which blocked the unsupported `PERCENT(1)` exactly as steps 3 and 4 specify |

No model calls. No compiler, verifier or Phase-4 change. No historical artifact rewritten. CONMED
not resumed.
