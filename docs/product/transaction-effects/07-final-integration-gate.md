# PR #243 — Final integration gate

## 1. SHA reconciliation

| Label | Full SHA | Note |
|-------|----------|------|
| **Exact proposed integration SHA (PR head)** | `55f28272f6063bb93b64f3977cdbc99470dc4ebd` | docs pin on top of suite tip |
| **Exact code tip suites executed** | `a261d7073fbb7a3a5da76ba0011ab1dd6ba87a5f` | identical runtime code to head |
| Prior report error | `8bc6112e4c580f30eae056b920ea93d3dd49c017` | **Incorrect** — confused tip short `8bc6112e` with parent full `8af9847e4c58…` |
| Actual prior tip (pre-gate) | `8bc6112efdf499cd36ead440d37cf37de7145b9e` | GitHub PR #243 head before this gate |
| Parent of that tip | `8af9847e4c580f30eae056b920ea93d3dd49c017` | `fix(arch): route sequential…` |

## 2. Architecture allowlist

`tests/contract-model/certified/architecture.test.ts` expects:

```ts
expect(runtimeImporters).toEqual(["verified-execution.ts"]);
```

`sequential-execution.ts` imports **zero** of `capacity/graph`, `capacity/state`, `transaction/simulate`.

## 3. Production sequential routes → verified adapter / REQUIRE

```
product north-star sequential-demo / runner
  → runSequentialTransactions
      → simulateVerifiedTransaction / evaluateVerifiedCapacity
          → VERIFIED_EXECUTION_POLICY = "REQUIRE" (constant; no policy arg)
```

No path sets `ALLOW_MISSING`. Missing verifications → `REFUSED` / `VERIFICATION_ARTIFACT_INCOMPLETE`.

## 4. #229 A8 protections preserved

- `types.ts` **byte-identical** to `origin/main` (includes `NOT_SATISFIED`, `overConsumption`, provisional withholding).
- `state.ts` = main + **only** shared-cap `unitId`/`unitIdentity` evaluation overlay.
- `statusForAmount` / GATE_NOT_SATISFIED → NOT_SATISFIED floors retained.
- `a8-gate-status-regression.test.ts` **13/13** pass on the proposed tip.

## 5. Shared-capacity artifact matrix

Covered by `tests/product/sequential-verified-boundary-gate.test.ts` + certified `shared-capacity.test.ts`:

| Artifact state | Outcome |
|----------------|---------|
| Valid clean SHARED_CAPACITY | EXECUTED; pool AVAILABLE; sequential draw SATISFIED |
| Missing SHARED_CAPACITY artifact | REFUSED `VERIFICATION_ARTIFACT_INCOMPLETE` |
| Stale/WEAK identity | REFUSED |
| Mismatched source version | REFUSED |
| Contradictory material finding | REFUSED |
| Mutated figures (identity unchanged) | REFUSED (IR inventory witness) |

Identity matching does **not** admit unverified pools.

## 6. Sequential chaining

- Financial overlay chaining (TE-D3): ratio-gated incur→dividend → `NOT_SATISFIED`
- Ledger utilization honesty: UNKNOWN ≠ zero (existing sequential tests)
- Restoration authority: verified REFUSE `UNAUTHORIZED_CAPACITY_RESTORE`
- Shared-pool anti-stacking under REQUIRE

## 7. #237 remaining-capacity authority

- #237 **merged** on `main` (`7f1dd3a2` / tip `cd8c7f2a`).
- #243 base (`cursor/transaction-effects-covenant-state-8970`) still diverges from main and does **not** yet carry `lib/capacity/utilization-authority.ts`.
- This gate **does not weaken** #237: it does not modify utilization-authority; capacity `types.ts` matches main; `state.ts` only adds shared-cap unit identity on top of #229.
- **Remaining blocker for full-tree integration:** merge/rebase Agent-4 stack onto post-#237 `main` in a separate authorized integration (out of #243 scope).

## 8. Suites on proposed tip (local)

| Suite | Result |
|-------|--------|
| `tsc --noEmit` | pass |
| `test:phase3-certification` | **481/481** |
| architecture + verified-execution + shared-capacity | pass |
| A8 gate-status regression | **13/13** |
| sequential + boundary gate | **33/33** |
| capacity runtime suite | pass |
| adversarial-verification + foundation adversarial | pass |

## 9. CI / merge

- No automatic merge.
- No certification bypass / Neon writes / paid inference.
- GitHub CI must be green on the exact tip SHA below before any authorized merge.
