# Phase 3 / F-3 - verifier quantitative scale normalization (0 model calls)

Verdict: **F3_CLOSED** (`04-final-summary.json`).

Root cause (reproduced at the starting SHA through the code, `02-root-cause-720-million.json`): `source-inventory.ts::parseMoney` stripped every non-digit from the matched text, so the captured scale word was dropped - `"$720.0 million"` -> `720`, compared against the compiler's `MONEY(720000000)` -> false MISSING_BASKET + UNSUPPORTED_IR_ADDITION. Classification **B. SCALE_TOKEN_CAPTURED_BUT_DROPPED**.

Fix (generic, verifier-side only, design B fully independent parsing): `amount-parser.ts` + scale-aware AMOUNT inventory with provenance (v2), currency carried on both inventories, currency-aware canonical comparison, unresolved/malformed scale tokens routed to review.

Chewy 6.08 replay (`03-finding-replay-classification.json`): 28 recorded findings -> {'CANNOT_REPLAY': 4, 'TRUE_DISCREPANCY': 16, 'F3_SCALE_ARTIFACT_FIXED': 6, 'DIFFERENT_ROOT_CAUSE': 2}; MATERIAL 25 -> 19; 0 new findings; 0 incorrectly suppressed. The old report's "22 scale artefacts" was not confirmed: 6 are.

Tests: new suite 40 passed; verifier/certification suites 24 failed (pre-existing, identical set) / 441 passed. Paid calls 0, cost $0.
