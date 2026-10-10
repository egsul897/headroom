# Product Proof 001 — Transaction Results

## A. Product engine simulations (authentic path)

Entry: `simulateVerifiedTransaction` / `evaluateVerifiedCapacity`  
Artifact: `artifacts/stage-10-11-capacity-simulation.json`

| Scenario | Amount | Selected path | Debt authority | Lien authority | Outcome |
|---|---:|---|---|---|---|
| Empty VEP capacity | n/a | none | n/a | n/a | **REFUSED** — `VERIFICATION_ARTIFACT_INCOMPLETE` |
| Secured incur | $50,000,000 | unset / refused | NOT EXECUTABLE | NOT EXECUTABLE | **REFUSED** |
| Secured incur | $100,000,000 | unset / refused | NOT EXECUTABLE | NOT EXECUTABLE | **REFUSED** |

`REVIEW_REQUIRED` / `UNKNOWN` / `NOT_SATISFIED` did **not** become affirmative permission or ledger posting.

Boundary / sequential shared-basket product sims: **NOT RUN** — require executable rulebook (hand-modeling refused).

---

## B. Separately labeled HYPOTHETICAL arithmetic scenario

> **Not Headroom product output.** Uses independent legal-reference illustrative numbers from `04` / `06`. Purpose: show what correct arithmetic would require once an engine has verified inputs.

**Assumptions (explicit):**

- Path: Permitted Debt (l) + Permitted Liens (d)  
- Illustrative gross (l) = $875,000,000  
- Utilization for (l) = **UNKNOWN** (no certificate)  
- §11.3 and intercreditor = **NOT PROVEN**  
- Security Documents scope = **UNCERTAIN**

| Case | Amount | Debt arithmetic if gross were verified & util were verified-zero | Actual integrity posture |
|---|---:|---|---|
| Below boundary | $874,999,999 | Would be ≤ gross | Still **NOT DETERMINED** (util/gates/docs) |
| At boundary | $875,000,000 | Equal gross | Still **NOT DETERMINED** |
| Above boundary | $875,000,001 | Exceeds illustrative gross | Still **NOT DETERMINED**; would be blocked **if** gross were verified |
| $50M | $50,000,000 | Inside illustrative gross | **NOT DETERMINED** |
| $100M | $100,000,000 | Inside illustrative gross | **NOT DETERMINED** |
| Sequential two $50M on same (l) | 50 then 50 | Second consumes shared (l) headroom | Cannot double-count; remaining after first unknown |
| Ratio-dependent with missing financials | any | §11.3 inputs missing | **NOT_SATISFIED / UNKNOWN** — no affirmative |
| Lien scope uncertain | any | Debt path insufficient alone | Lien leg **UNCERTAIN** — no affirmative secured permission |

**Shared-capacity rule:** never count Facility Amount headroom twice across sequential (l) draws.

---

## C. Customer-usable conclusion

No verified selected path exists in the product. Correct customer answer today:

**Secured $50M / $100M incurrence: NOT DETERMINED / REFUSED (fail-closed). Lawyer/treasury review required.**
