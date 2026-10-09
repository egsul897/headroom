# Unified Position · Simulate · Ask — status

**Branch:** `cursor/unified-position-simulate-ask-05a7`  
**Starting SHA:** `bae24ced33fdd6963d0615265a1e67cb181233e8`  
**Soft gates:** no paid inference; no invented CERTIFIED; hypothetical sims never post to ledger  

## Deliverable summary (v2 — verified integration)

One company state, one shared calculation path, three interfaces — now with Phase 4C attribution and fail-closed verified simulation:

| Surface | Engine | Change |
|---|---|---|
| **Position** | `covenant-engine` + overview builder + **4C attribution** | TRACKED when Permission.code/action exact-matches ledger `ruleId`; else NOT_TRACKED (null, never 0) |
| **Simulate** | same LEGACY sliders + **VerifiedSimulatePanel** | Shows precise verified blockers; LEGACY remains labeled |
| **Ask** | North Star gates + `attemptVerifiedSimulate` + LEGACY bridge | Executable verified outcomes separated from correct refusals; `simulateHref` handoff |

Certified 4A–4E remains separately gated (`VerifiedExecutionPackage`); never claimed from LEGACY figures. No NS-4 / 4C / VEP / REQUIRE bypass.

## Shared engine map

```
Prisma FinancialSnapshot/State + Permissions + ContractLedgerUsage (4C)
        │
        ▼
lib/covenant-engine + attributed-utilization + certified-simulate-bridge
        │
   ┌────┼────────────────────┐
   ▼    ▼                    ▼
Position SimulateClient   Ask (verified + legacy)
   │         ▲                    │
   │         └──── simulateHref ──┘
   │
NS-4 / 4C / VEP ──► attemptVerifiedSimulate (fail-closed when absent)
```

## Milestone checks

- Financially supported ratio / pre-post TNL via `transaction-effects`
- Basket with attributed utilization when 4C join hits
- Slider amount changes re-run LEGACY engine (unchanged SimulateClient)
- Verified pre/post when FIXTURE VEP + gates pass (demo); otherwise precise blockers
- Binding restriction identified by source document/section
- Ask ↔ Simulate consistency on identical draft fields
- Correct refusal when evidence / VEP missing

## Demo

```bash
npx tsx scripts/product/run-unified-position-demo.ts coherent
```

Artifact: `docs/product/unified-position/demo-report.json` (`executableOutcomes` vs `correctRefusals`)
