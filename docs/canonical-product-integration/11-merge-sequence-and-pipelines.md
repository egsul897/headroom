# Canonical product integration — merge sequence & pipelines

**Integration tip branch:** `cursor/canonical-product-integration-2670`  
**Base main:** post-#306 `67027b8f`  
**Does not authorize self-merge.** Production activation BLOCKED. No production Neon writes.

## Exact merge sequence (human)

1. **#294** — persistence foundation (tenant isolation, IdP approval, SSR diagnostics-only). Independent of product slice.
2. **#304** — restricted Matthews leaf + VE honesty contracts (or absorb via this integration PR).
3. **This integration PR** (`cursor/canonical-product-integration-2670`) — #304 tip + #310 `compileOperativeCovenantPackage` + VE feed wired to generalized compiler + canonical capacity contract.
4. **#311** — CFO workflow UI **only after** Agent 3 security remediation (no anonymous CUSTOMER protected reads; auth before data load; no synthetic COMPLETE/AVAILABLE; home-overview nav test update). Do not merge while UNSTABLE / soft-gate failing.

## Competing pipelines identified

| Pipeline | Status |
|---|---|
| #304 regex candidate extractors → `compileVerifiedFixedDollarBridge` | **Deprecated for Position feed** — retained for regression locks only |
| #310 `compileOperativeCovenantPackage` | **Canonical discovery→VE path** — Position feed now uses this |
| #307 autonomous fixed-dollar discovery | Competing with #310 — do not maintain as second production path |
| #311 `assembleCfoWorkflow` / capacity-state | Must consume canonical capacity contract; security remediation required |

## Remediations landed here (#310 gaps)

- Process-wide `delete process.env.AI_GATEWAY_API_KEY` removed; unpaid path uses `createSyntheticStageCaller()`.
- Position feed replaced package-specific candidates with operative package compile.
- Canonical capacity contract preserves GROSS / MODELED / remaining(null) / AVAILABLE(blocked).

## Still required (Agent 1 / Agent 3)

- #310: fuller independent omission coverage + OA adversarial + conditional-basket fidelity (beyond this bounded wire-up).
- #311: refuse anonymous CUSTOMER protected reads; authorize before load; no fabricated ProductCapacityView COMPLETE/AUTHENTIC/AVAILABLE; genuine server-side integration tests; fix home-overview nav soft gate.
