# Authentic transaction execution — CONMED §7.2(d)

**Verdict:** end-to-end authentic path **EXECUTED** (technical demonstration with labeled synthetic CTA).

| Field | Value |
|---|---|
| Agreement | CONMED Eighth A&R Credit Agreement (2025) |
| Transaction | Incur Finance Lease Obligations (INCUR_DEBT) |
| Contractual path | §7.2(d) greater-of basket |
| Certification | CERTIFIED (`7.2d-recompute-phase2-certified`) |
| Phase 4E (unsecured) | CERTIFIED_4E / CANDIDATE |
| Phase 4E (secured) | INCOMPLETE_PACKAGE / incomplete=NO_CERTIFIED_LIEN_COMPANION_FOR_SECURED_DEBT |
| Capacity (REQUIRE) | EXECUTED / AVAILABLE remaining=60000000 |
| Simulation (4D) | see 05-phase4d-simulation.json |
| Financial inputs | **SYNTHETIC_LABELED_TECHNICAL_DEMO** (not customer-certified) |
| Ledger | empty (zero outstanding assumed) |

## Operative check

- Source: Finance Lease Obligations ≤ greater of $50,000,000 and 3.0% of Consolidated Total Assets, at any one time outstanding.
- Synthetic CTA $2,000,000,000 → 3% = $60,000,000 → greater-of = **$60,000,000**.
- Probe consume $10,000,000 under empty ledger.

## Stage D — secured path (correct refusal)

This VEP certifies only §7.2(d) (debt). Finance Lease Obligations typically create a Lien on the leased property, so secured analysis also needs a certified §7.3 companion. With no CREATE_LIEN/GRANT_COLLATERAL rule in the package, SECURED_DEBT enumeration is **INCOMPLETE_PACKAGE** (`NO_CERTIFIED_LIEN_COMPANION_FOR_SECURED_DEBT`) — not a CANDIDATE grant.

## Why not §7.2(c)

§7.2(c) remains CERTIFIED but blocked by `CROSS_RULE_GATE_NOT_EXECUTABLE` (§7.1 / §7.3(g) — no cross-rule evaluator; companions FAILED). Preserved fail-closed.

## Safety

- Gates not weakened; CFP target 0; synthetic inputs labeled; no paid inference.
- Secured debt without certified lien companion is refused (Stage D fail-closed).
