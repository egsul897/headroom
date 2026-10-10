# Authentic affirmative capacity — irreducible blocker

**Milestone:** NEXT PRODUCT MILESTONE (post-#258 CI-green)  
**Verdict:** No authentic affirmative `evaluateVerifiedCapacity(REQUIRE)` EXECUTE is available from on-disk evidence.  
**Auto-merge:** **no**  
**Fabrication:** none (no invented CERTIFIED companions, financials, or utilization)

## Executed probe (production code path)

Package: `docs/product/customer-workflow/authenticated-vep/verified-execution-package.json`  
Rule: `ir-rule:29309c463e06b77b4b243eda` · §7.2(c) · `PERMISSION` · `COMPLETE` · `UNLIMITED_CAPACITY`

| Check | Result |
|---|---|
| Phase-3 candidate certification | **CERTIFIED** (`7.2c-recompute-phase2-certified`) |
| `isCompanionRequiresDischargeable` | **false** |
| `evaluateVerifiedCapacity(REQUIRE)` | **REFUSED** `CROSS_RULE_GATE_NOT_EXECUTABLE` |

Independent blockers (any one alone would refuse companion discharge / REQUIRE):

1. **`OTHER_RULE_SATISFIED` condition** → Section 7.1 financial covenants (`referencesRuleTargets`) — not a companion-REQUIRES edge; needs a certified compliance evaluator + APPROVED financial snapshots.
2. **`REQUIRES` Section 7.3(g)** — `SOURCE_REFERENCE_RESOLVED`, but **0** in-package COMPLETE PERMISSION companions.
3. **`REQUIRES` Section 7.1** — same; §7.1 is a financial-covenant set, not a permission basket already in the VEP.
4. **`UNLIMITED_CAPACITY`** — companion discharge intentionally never opens unlimited capacity behind gates (xref §40/§54).

Refusal refs (executed):

- `ir-rule:29309c463e06b77b4b243eda REQUIRES Section 7.1 [SOURCE_REFERENCE_RESOLVED]`
- `ir-rule:29309c463e06b77b4b243eda REQUIRES Section 7.3(g) [SOURCE_REFERENCE_RESOLVED]`
- `ir-rule:29309c463e06b77b4b243eda rule[r-c].condition[0] -> Section 7.1 [SOURCE_REFERENCE_RESOLVED]`

Source language (operative): Indebtedness secured by Liens permitted by §7.3(g), **provided that** Parent Borrower is in compliance on a pro forma basis with the financial covenants in §7.1.

## Companion evidence on disk

| Target | Candidate | Status |
|---|---|---|
| §7.3(g) | `discovery-candidate:082c80836268c7277cc39c18` | Map **NOT_CERTIFIED**; pilot **FAILED** (PROVIDER_FAILURE, SHARD_INCOMPLETE, PARTIAL_COMPILATION, …) |
| §7.1 | `discovery-candidate:a26970121ceb558846ff8d1c` | Map **NOT_CERTIFIED**; pilot **FAILED** (`WALL_CLOCK_TIMEOUT` / PROVIDER_FAILURE) |
| §7.1 | `discovery-candidate:e37352369564a1e784e0560b` | Map **NOT_CERTIFIED** |

Canonical map: 163/163 candidates `NOT_CERTIFIED` at package level (unit CERTIFIED for §7.2(c) lives only in the offline recompute packet).

## Alternative authentic covenants considered

| Candidate | Why not shorter affirmative |
|---|---|
| §7.5(j) live-validation | `REVIEW_REQUIRED` — not CERTIFIED |
| §7.3(g)(ii)(B) population evidence | Finite MULTIPLY/80% FMV shape exists in population evidence, but **not** Phase-3 CERTIFIED and not packaged as a VEP |
| Stage D §7.01(b)/§7.02(b) | **SYNTHETIC_LABELED_TECHNICAL_DEMO** — excluded from authentic affirmative claims |

**Only on-disk Phase-3 CERTIFIED authentic unit:** §7.2(c). No alternate authentic CERTIFIED covenant is available without new certification work.

## What would unblock authentic affirmative (exact inputs)

Not a small runtime patch. Required, in order:

1. **Independently CERTIFIED companion unit(s) for §7.3(g)** (permission / quantitative lien basket) with COMPLETE verification artifacts.
2. **Independently CERTIFIED representation of §7.1 financial covenants** plus a **certified compliance / pro-forma evaluator** that can discharge `OTHER_RULE_SATISFIED` (companion-REQUIRES discharge alone is insufficient because of the compliance condition and UNLIMITED capacity).
3. **APPROVED financial snapshots** (and, for remaining capacity vs gross, attributed utilization with completeness certificates).
4. Only then: REQUIRE capacity may EXECUTE. Label **gross contractual capacity** separately from **remaining capacity** until utilization is certified.

Do **not**: weaken UNLIMITED / `referencesRuleTargets` fail-closed rules; invent CERTIFIED companions; substitute Stage D synthetic as authentic.

## Regression lock

`tests/product/authentic-conmed-72c-affirmative-blocker.test.ts` — asserts CERTIFIED pin, non-dischargeable matrix, and REQUIRE REFUSED citing §7.1 / §7.3(g).

## Reproducible commands

```bash
npx tsx -e '/* see probe in agent log / 02 report */'
npx vitest run tests/product/authentic-conmed-72c-affirmative-blocker.test.ts
```
