# Transaction evaluations — certification-integrity remediation

All three: `verifiedSimulate.executable = false`. Remaining **null**. Simulate **not invoked** without Phase-3 VEP + eligible CANDIDATE path.

| Transaction | Path authority | Selected path | Simulate | Remaining | Blocker |
|---|---|---|---|---|---|
| Acquisition $50M | Matthews NOT_CERTIFIED_4E | null | null (Inv leg) | null | Matthews refuse + CONMED Inv NOT_CERTIFIED_4E / PATH_NOT_FOUND |
| RP $25M | **NOT_CERTIFIED_4E** | null | null | null | PATH_NOT_FOUND:no_phase3_vep |
| Asset sale $40M | **NOT_CERTIFIED_4E** | null | null | null | PATH_NOT_FOUND:no_phase3_vep |

Hypothetical gross probe (non-authoritative): RP $40M; Inv $75M; AS $30M at stipulated $2bn CTA (**not** APPROVED NS-4).

Before/after machine JSON: `artifacts/remediation-before-bd594716/` vs current `artifacts/`.
