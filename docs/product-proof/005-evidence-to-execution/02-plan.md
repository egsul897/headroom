# Dependency-ordered plan — VU → VEP → path → capacity → simulate

| Step | Work | Gate module | Status today (§7.6(d)) |
|---|---|---|---|
| 1 | Authentic source + IR leaf | Population evidence | **PARTIAL** — leaf present; compile `REVIEW_REQUIRED` |
| 2 | Entity-scope + definition fidelity; COMPLETED compile | Phase-3 compile / entity-scope-guard | **BLOCKED** |
| 3 | Clean semantic verification | `verifyCompiledCandidate` | **BLOCKED** — `MATERIAL_DISCREPANCY` |
| 4 | Persist clean VUA + `certifyCandidate` → CERTIFIED | `certifyCandidate` | **BLOCKED** |
| 5 | `certifiedMapToVerifiedExecutionPackage` → DERIVED VEP | `phase4-adapter` | **BLOCKED** (no CERTIFIED for this candidate) |
| 6 | `enumerateCertifiedPaths(RESTRICTED_PAYMENT)` → `CANDIDATE` | `verified-path-enumeration` | **NOT REACHED** (empty conditions ⇒ feasible once CERTIFIED) |
| 7 | `evaluateVerifiedCapacity(REQUIRE)` | `verified-execution` | **NOT REACHED** |
| 8 | `attemptVerifiedSimulate` on selected path | `certified-simulate-bridge` | **NOT REACHED** |
| 9 | (Contrast) §7.2(c) CERTIFIED → VEP → enum → capacity → simulate | authenticated-vep spine | **CONTRAST ONLY** — `UNSUPPORTED` / non-executable |

## Implementation this mission (authentic-only)

1. Evaluator `lib/product/evidence-to-execution` reads on-disk §7.6(d) artifacts and runs contrast spine.
2. Runner + artifacts under `docs/product-proof/005-evidence-to-execution/`.
3. Correct stale `authenticated-vep-offline` expectations to match CERTIFIED §7.2(c) reality (honesty, not fabrication).
4. **Do not** write a fabricated CERTIFIED packet or clear MATERIAL findings by hand.
