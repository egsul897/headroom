# Maximum safe product integration

**Branch:** `cursor/maximum-safe-product-integration-daaa`  
**Base main:** `67027b8f` (post-#306)  
**Does not authorize self-merge or production authority activation.**

## Absorbed (traceable)

| Source | Role | How absorbed |
|---|---|---|
| #312 | Canonical operative package → Position | Ancestor via #319 tip `6e8c3fd9` |
| #319 / #318 | Operative-source GROSS binding + restatement precedence | #319 tip; #318 parallel on #310 stack → **superseded** |
| #317 / #316 | Restatement as-of precedence | In #319 / #311 tips |
| #314 / #315 | Cross-document relationship gate | In #311 tip + #312 align commits |
| #311 | CFO Upload→Analyze→Review→Position→Simulate→Audit | Merge commit on #319 tip |
| #326 | APPROVED NS-4 Neon dashboard band + certificate→IR leverage vertical slice | Merge through tip `a5695c2e` (north-star-bridge §17) |
| #325 | Contractual leverage dashboard panel | Merge (coexists with #326); local arithmetic — no raw Phase-4 runtime (§17); calculate path avoids compile→`node:crypto` so Next/Vercel client build succeeds |
| #324 | Contractual EBITDA derivation (intelligence) | Merge (intelligence surface; not a second dashboard compiler) |
| #322 | Financial computation audit oracles | Merge |
| #323 | Adversarial regression locks | Merge |

## Superseded / not dual-merged

| PR | Disposition |
|---|---|
| #313 | Already marked superseded by #312 — close without merge |
| #318 | Same operative-source fix as #319 on #310 stack — close after #319 path lands |
| #310 / #304 / #307 | Absorbed into #312/#311 stack — do not dual-merge |
| #327 | **Hold** — certified-path boundary failure (raw Phase-4 imports from `lib/product/contractual-metrics/*`). Competing dashboard compiler vs #325 |
| #322 tip after `b8074d3f` | **Hold** — reintroduces raw runtime into product leverage calculate; certified-path red. Prior audit/oracles already absorbed |
| #324 tip after `5fab349d` | **Hold** — cross-domain transaction eval; home-overview CI red. Prior EBITDA derivation already absorbed |

## Single authoritative execution path

```
documents → compileOperativeCovenantPackage (#310/#312)
  → canonicalCapacityFromOperativePackage (#312)
  → loadAuthenticDashboardSlice / operative-package-position-feed (#312)
  → CFO Position + SeparatedCapacityClaims (#311)
```

Dashboard surfaces (additive, fail-closed):

- NS-4 APPROVED Neon band (#326) — invent-absence when empty
- Contractual leverage panel (#325) — missing inputs disclosed
- Intelligence EBITDA derivation (#324) — gross ratio room only

## Human merge blockers

1. Draft PR — explicit human approval required (no auto-merge)
2. Exact-tip CI must be green on this branch tip
3. Production IdP / trusted-issuer / Neon production writes remain BLOCKED
