# Canonical absorption matrix — #335 + NS-4 (#334 vs #336)

**Landing tip branch:** `cursor/canonical-absorb-335-ns4-d829`  
**Base choice:** **#334** (`0923f657`) as canonical NS-4 integration  
**Absorbed:** #335 (`20dbac50`) full stack + #336 unique additive modules  
**Not independently merged:** duplicate Dashboard / Simulate / financial-input stacks from #336

## Why #334 over #336

| Criterion | #334 | #336 |
|-----------|------|------|
| APPROVED financial binder | `loadApprovedFinancialInputBundle` on Position/Simulate | thinner `loadSharedNs4FinancialIdentity` |
| Certificate delivery provenance | `certificate-deliveries.ts` + FCE actions | partial |
| NS-4 capacity/simulation e2e | approved-capacity + secured-acquisition e2e | invalidation e2e only |
| Input-store / cutoff hardening | full store + selector changes | absent |
| Post-#333 PAI absorb | yes (`14137841`) | yes (on main already) |

## File / function absorption

| Surface | Chosen implementation | Source | Notes |
|---------|----------------------|--------|-------|
| `app/.../dashboard/page.tsx` | **Merged** | #334 + #335 | `loadNs4DashboardFinancialState` (APPROVED read) + `loadContractualMetricsForDashboard` (no-write provisional) |
| `components/DashboardClient.tsx` | **Merged** | #334 + #335 | NS-4 band + provisional panel; never override AVAILABLE / NS-4 `APPROVED_BOUND` |
| `loadContractualMetricsForDashboard` | Keep | #335 | GET persist forbidden; `allowNeonWrite` gate |
| `forceEvidenceAuthority` / `resolveEffectiveEvidenceAuthority` | Keep | #335 | demotion-only; cannot promote provisional/synthetic |
| `financial-metric-resolver/*` | Keep | #335 | package-driven capacity/sim inputs |
| `contractual-metrics/*` | Keep | #335 | definition-executed provisional panel |
| `cross-domain-capacity.ts` | Keep | #335 | debt/lien/investment/RP/asset-sale GROSS selection |
| `loadApprovedFinancialInputBundle` | Keep | #334 | Position/Simulate NS-4 binder |
| `certificate-deliveries.ts` | Keep | #334 | delivery provenance |
| `ns4-financial-panel.ts` | Keep | #334/#336 shared | Neon APPROVED read |
| `ns4-shared-financial-identity.ts` | **Additive** | #336 | shared identity helper; does not replace #334 binder |
| `cross-domain-transaction.ts` / scenarios | Keep | #334 (shared with #336) | acquisition composition |
| acquisition + invalidation tests | **Additive** | #336 | provider-free + DB-gated |
| #336 Dashboard/Simulate page rewrites | **Not merged** | — | would duplicate #334 stacks |

## Preserved invariants

- #333 PAI safeguards (on main / #334 ancestry)
- Certificate-delivery provenance (#334)
- Null-VEP fail-closed simulation (`certified-simulate-bridge`)
- Gross ≠ verified remaining
- Dashboard GET never writes calculation/approval/certificate records
- Provisional headlines labeled; cannot override APPROVED / AVAILABLE

## Superseded PRs after human merge of landing tip

#334, #335, #336 (do not merge separately). Prior product stacks already closed: #311–#320, #329, #331.
