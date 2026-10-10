# Stage 4 — Cross-Document & Entity-Scope

**Branch:** `cursor/unified-stage4-crossdoc-scope-f673`  
**Base:** Stage 3 tip `dd727d2b`  
**Integrated:**
- `#233` @ `325f6bb4` (full merge — parent-scope / companion-REQUIRES / dual-path)
- `#218` **selective** — cross-document modules + Ask honesty wiring only

## What was refused from #218

| Path | Reason |
|------|--------|
| `capacity/state.ts`, `capacity/types.ts` | Stale pre-#229/#237; keep Stage 2/main |
| `verified-execution.ts`, `sequential-execution.ts`, sequential demos | Superseded by #243 Stage 2 |
| Ask/Simulate UI (`AskShell`, simulate pages) | Deferred to Stage 5 (#213) |

## Taken from #218

- `lib/product/covenant-intelligence/cross-document-*.ts`
- `lib/product/north-star-workflow/transaction-analysis.ts` (crossDocumentVerdict / permissionLayers)
- `lib/product/unified-position/simulate-handoff.ts`, `legacy-simulate-bridge.ts`
- docs + scenarios + tests under `cross-document-*`

## #233 + #243 coexistence

`verified-execution.ts` auto-merged cleanly and retains:
- companion-REQUIRES discharge (`isCompanionRequiresDischargeable`)
- restore authority (`UNAUTHORIZED_CAPACITY_RESTORE`)
- `VERIFIED_EXECUTION_POLICY = "REQUIRE"`
- financial chaining helpers from #243

## Proofs (local)

| Requirement | Evidence |
|-------------|---------|
| Secured debt needs debt ∩ lien | `stage-d-pkgi-secured-dual-path` + cycle6 gate |
| $15M principal ≠ $30M aggregate draws | dual-path post-state $35M debt / $5M lien remaining |
| Governing entity scope | parent-scope chapeau + entity-scope-guard v6 |
| Missing cross-document authority refuses | cross-document-covenant + adversarial (FP=0) |
| Shared capacity not double-spent | sequential-verified-boundary-gate |
| Operative amendment/version precedence | cross-document scenarios + package-graph wire |
| Debt-only SATISFIED ≠ secured permission | cycle6 gate |

## Coherent secured-capacity solver divergence

Historical Coherent legacy-vs-solver ceiling/remaining mismatch is documented as `REPRESENTATION_DIFFERENCE_ONLY` in `docs/coherent-phase8-population-reconciliation.md` (Q22). This stage does **not** redesign the legacy solver.

**Engine-level resolution for product secured capacity:** verified dual-path (#233) under REQUIRE — debt and lien baskets each consume the economic principal once; Phase 4D `intendedAmount` is the sum of stated draws only. Coherent legacy `CAPACITY_EXECUTED` conclusions remain labeled `LEGACY_ENGINE` / not Phase-4 verified.

## Remediation matrix

Updated R8 confirmed-scope case for Cycle 6 non-empty `entityScope` confirmation rule (empty scope + SOURCE_MATCH_CONFIRMED no longer publishes AVAILABLE).

## Local gates

234 tests across cross-doc / Stage D / remediation / A8 / sequential / utilization — all pass; `tsc` clean.
