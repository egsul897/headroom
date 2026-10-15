# MATW-SECURED-01 — Authentic operative Matthews debt-and-lien package certification

**Started after:** #342 merge `9bf69b9eb564de87f567915b5ba7a10df9956be5`  
**Main tip at kickoff:** `adc35c7d9b34c6a52f3516dc7cf5037dcd761092`  
**Branch:** `cursor/matw-secured-01-44cd`

## Goal

Certify an authentic operative Matthews **debt-and-lien** package end-to-end:

- Authentic EDGAR-reconstructed operative excerpts (no synthetic invention)
- Debt baskets + lien restrictions under one package certification
- Fail-closed: no production AVAILABLE / verified remaining without authority
- Issuer-agnostic compile path (no `companyId === "matthews"` production branches)

## Current baseline (inventory)

| Area | State |
| --- | --- |
| Permitted Debt (1)(a) fixed-dollar | Executable SOURCE_BACKED_GROSS $1.3B via `compileOperativeCovenantPackage` / VE bridge |
| Permitted Debt (1)(b) ratio / Notes grandfather | Discovered; not executable (correct) |
| §4.09 FCCR / secured leverage limb | Quotation present; not executable |
| §4.10 lien prohibition | Discovered as `LIEN_RESTRICTION`; **not executable** |
| Authentic FCE fixture | `authentic-matthews-q1-fy2025` |
| Package certification claim over full debt+lien population | **Open gap for this mission** |

## Constraints

- No production identity activation
- No competing engine / resolver
- Do not weaken REQUIRE gates
- Do not invent lien capacity from bare prohibitions
