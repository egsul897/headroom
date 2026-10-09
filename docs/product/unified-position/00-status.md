# Unified Position · Simulate · Ask — status

**Branch:** `cursor/unified-position-simulate-ask-05a7`  
**Starting SHA:** `bae24ced33fdd6963d0615265a1e67cb181233e8`
**Ending SHA:** `56e7baf9278ba2f9ce00da72c72fc7a6c778e640`
**Soft gates:** no paid inference; no invented CERTIFIED; hypothetical sims never post to ledger  

## Deliverable summary

One company state, one LEGACY covenant-engine calculation path, three interfaces:

| Surface | Engine | Change this PR |
|---|---|---|
| **Position** (overview / capacity / dashboard) | `covenant-engine` + overview builder | NOT_TRACKED usage: `utilizationPct`/`remaining` = **null** (never 0) |
| **Simulate** | same `simulateDebtIncurrence` / RP / asset sale | Accepts Ask/demo query handoff (`?action=&amount=&secured=&asOf=`) |
| **Ask** | North Star gates + **same** LEGACY bridge | `legacySimulation` + `simulateHref` → Open in Simulate |

Certified 4A–4E remains separately gated (`VerifiedExecutionPackage`); never claimed from LEGACY figures.

## Shared engine map

```
Prisma FinancialSnapshot/State + Permissions + LedgerEntry
        │
        ▼
lib/covenant-engine (computeCovenantPosition / simulate*)
        │
   ┌────┼────────────────────┐
   ▼    ▼                    ▼
Position SimulateClient   Ask legacy bridge
   │         ▲                    │
   │         └──── simulateHref ──┘
   │
NS-4 / 4C / VEP ──► Ask certified path (fail-closed when absent)
```

## Demo

```bash
npx tsx scripts/product/run-unified-position-demo.ts coherent
```

Artifact: `docs/product/unified-position/demo-report.json`

Observed on Coherent (LEGACY_ENGINE, labeled):
- $50M / $100M secured → clear; $5000M secured → blocked (slider extremes)
- Cross-document debt evaluates Credit Agreement + 2029 Notes independently
- Dividend / investment run RP waterfall on configured document; other docs caveated
- Ask answers `legacy_labeled` with Simulate deep-link; missing amount → insufficient_evidence
- Overview utilization honesty: all capacity-row `utilizationPct` null

## Remaining gaps (not fixed here)

- Phase 4C attributed utilization → Position remaining (still NOT_TRACKED)
- Authentic CERTIFIED numeric capacity (CONMED cross-rule gates)
- Equity contribution / hybrid note / acquisition specialized Simulate tabs
- Product Simulate does not yet call `simulateVerifiedTransaction`
