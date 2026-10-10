# Product Proof 001 — Remediation Roadmap

Ordered by impact on completing the authentic SOURCE→customer-answer workflow for a new issuer (post-baseline freeze).

## P0 — Unblocks executable capacity

1. **Issuer-agnostic compile CLI**  
   Wire discovery candidates → context bundle → `compileCovenantToIR` → verify → VEP export for arbitrary frozen packages (not CONMED-hardcoded scripts).  
   Gate: paid inference authorization + cost caps; replay/synthetic for CI.

2. **Definition-heavy basket compilation**  
   For CA patterns like MTN where §10.4/10.5 are one-liners, compile **Permitted Debt / Permitted Liens definition clauses** into permission units with formulas/caps (esp. (l) = MFA − Facility Amount).

3. **Dual-path debt+lien binding**  
   Require explicit selected paths that independently check Debt (l) and Liens (d); fail closed if either leg UNKNOWN.

4. **Utilization completeness productization**  
   Ingest attributed usage + APPROVED completeness certificates; never publish remaining without them; optional import of schedule/outstanding instruments as **non-authoritative** context only.

5. **Financial certificate → APPROVED snapshot path on main**  
   Land/reconcile FCE (#220/#250/#253 stack) without weakening fail-closed gates; compute MFA EBITDA prong and §11 ratios from certified inputs.

## P1 — Customer workflow

6. **Local/dev DB profile** for proofs (non-production) so Position/Simulate/Ask can be exercised without Neon production writes.  
7. **Unified Stage-5 handoff** (open #250/#253/#258) after P0 correctness — do not merge solely to greenwash this proof.  
8. **Authorized Pass B discovery** for unseen packages with budget + artifact freeze.

## P2 — Package completeness & graph

9. Acquire/attach Security Documents & intercreditor when publicly available; model as required evidence for secured paths.  
10. Improve 10-K / financial statement document typing in package graph.  
11. Reduce KF family false positives on definitional “Indebtedness” mentions.  
12. Structured Schedule extraction (e.g., Schedule 2.3 Part B).

## Explicit non-goals for remediation

- Do not seed MTN `capacityFormulas` by hand and call it product proof.  
- Do not weaken REQUIRE / utilization UNKNOWN rules to force AVAILABLE.  
- Do not auto-merge integration PRs without independent acceptance.
