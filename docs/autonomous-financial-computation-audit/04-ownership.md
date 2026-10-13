# WS-AFC — Ownership and coordination

**Workstream ID:** `WS-AFC`  
**Name:** Autonomous Financial Computation Audit (definition compiler · dependency discovery · math verification)  
**Branch:** `cursor/autonomous-financial-computation-audit-45d6`  
**Base main SHA (start):** `67027b8f499921a12cee7b9b9f04d832898b6384`

## Exclusive ownership (claimed — unowned at authorship)

- `docs/autonomous-financial-computation-audit/**`
- `tests/autonomous-financial-computation/**`

WS-PAR may formalize this claim by amending `01-workstream-map.json`. Until then peers must treat these paths as owned by WS-AFC.

## Must not touch (active peer workstreams)

| Peer | Paths / concern |
| --- | --- |
| Autonomous covenant compilation | `cursor/autonomous-covenant-compilation-b53f` — do not rewrite compiler orchestration |
| Real covenant dashboard slice | `cursor/real-covenant-dashboard-slice-2ca3` — do not rewrite dashboard product surfaces |
| Verified remaining capacity | `cursor/verified-remaining-capacity-integration-9f27` |
| Covenant capacity mathematics | `docs/covenant-capacity-mathematics/**`, capacity matrix tests |
| WS-FDP | `docs/financial-definitions-precedent/**` |
| WS-BFL | `docs/covenant-basket-capacity-formula-library/**`, `lib/basket-formula-corpus/**` |
| WS-CDA | `docs/covenant-dependency-atlas/**` |
| WS-DEF | `docs/definition-encyclopedia/**` |
| Shared hard exclusions | `lib/contract-model/ir/**`, `lib/contract-model/phase3-certification/**`, `lib/covenant-engine.ts`, sealed evidence |

## Soft gates

1. Read-only audit of production calculation layers; production edits only via proposed bounded PR sequence after founder auth.
2. Do not implement company-specific formulas.
3. Do not weaken fail-closed behavior.
4. Do not rewrite historical evidence or advance phase gates.
5. Do not merge or self-certify.
6. Do not duplicate capacity-matrix coverage already shipped by covenant-capacity-mathematics.
7. Held-out oracle expectations are immutable — never edit to match a failing engine.
