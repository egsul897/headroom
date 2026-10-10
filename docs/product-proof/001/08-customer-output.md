# Product Proof 001 — Customer Output

## What was captured

| Surface | Status | Evidence |
|---|---|---|
| Position UI | **NOT POPULATED** | Neon production writes forbidden; no local Postgres |
| Simulate UI | **NOT POPULATED** | Same |
| Ask UI | **NOT POPULATED** | Same |
| Offline product APIs | **CAPTURED** | `artifacts/stage-09-utilization-binding.json`, `stage-10-11-capacity-simulation.json` |

No mock screenshot is presented as functioning software.

---

## Actual Headroom answer (honest customer posture)

### Permitted / prohibited / unresolved

| Question | Customer answer |
|---|---|
| What debt can Restricted Companies incur? | Operative rule is §10.4 → Permitted Debt, but **Headroom did not produce an executable basket catalog** for MTN. Structural/discovery signals found §10 / definitions; **substance unresolved for product use**. |
| Lien permissions for secured debt | §10.5 / Permitted Liens structurally visible; **lien path not executable**. |
| $50M secured on 2026-10-10 | **REFUSED / NOT DETERMINED** at verified-execution boundary |
| $100M secured | **REFUSED / NOT DETERMINED** |
| Gross capacity | **Not established by product** |
| Remaining capacity | **NOT DETERMINED** (empty ledger ≠ zero; no completeness certificate) |

### Source provisions (retrieved at analysis layer, not compiled)

- Tenth A&R §10.4 Debt; §10.5 Liens; §11 Financial Covenants  
- Definitions: Permitted Debt, Permitted Liens, Maximum Facility Amount, Facility Amount, Secured Debt, Adjusted EBITDA, Net Funded Debt  

### Operative calculation & assumptions

None executed as verified capacity. Fail-closed policy: `REQUIRE` / `VERIFICATION_ARTIFACT_INCOMPLETE`.

### Shared-capacity consumption

Not simulated in product (no executable shared constraint graph for MTN).

### Missing evidence

- Security Documents / intercreditor  
- Authenticated utilization ledger + completeness certificate  
- Certified Adjusted EBITDA / Facility Amount as-of date  
- Compiled/verified IR (VEP)  

### Verification status

**NOT CERTIFIED** — no VerifiedExecutionPackage for MTN.

### Simulation effects

None applied; no ledger posting.

### What a lawyer / treasury professional must review

1. Full Permitted Debt / Permitted Liens catalogs and schedules  
2. Whether proposed debt is Secured Debt under (l) vs another basket  
3. Intercreditor + Collateral package sufficiency  
4. §11.1–11.3 pro forma compliance with current financials  
5. Outstanding usage against (l) and Facility Amount components  
6. Interaction with senior notes indentures (separate instruments)

---

## Real API refusal excerpt

```json
{
  "outcome": "REFUSED",
  "policy": "REQUIRE",
  "refusals": [
    {
      "code": "VERIFICATION_ARTIFACT_INCOMPLETE",
      "message": "no verification artifact was supplied; unverified IR does not execute at the product boundary"
    }
  ]
}
```

Source: `artifacts/stage-10-11-capacity-simulation.json`.
