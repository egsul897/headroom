# Integration plan v2 — converge to one customer system

**Objective:** Integrate completed specialist work into one reliable Position / Simulate / Ask stack over one verified state — while Neon corpus growth continues under write gates.

**Non-goals:** Auto-merge · paid inference · claiming CERTIFIED without evidence · duplicate engines.

## Priority bands

| Pri | Goal | Primary PRs |
|---|---|---|
| P0 | Prevent false permissions / unknown-as-zero | #213, #215, #215b, #205→#207→#211, #171 |
| P1 | Verified rules ↔ approved financials ↔ attributed utilization | #190 rebase, #220 (coord), #205 VEP path |
| P2 | Cross-doc + capacity + txn sim | #218, #214 (CI), #209, #223 |
| P3 | Consistent Position / Simulate / Ask | #221 (canonical), fold #213 honesty |
| P4 | Neon precedent intelligence | #210→#212→#219; #217 after rebase |

## Specialist work assignments (stop redundant audits)

| ID | Agent / PR | Exclusive / deliverable | Acceptance test | Depends on | Cost limit |
|---|---|---|---|---|---|
| WS-AEC | #216 | `docs/architecture/parallel-agents/**` | fleet tests green; this pack current | — | $0 |
| WS-NEON | #210/#212/#219 | `docs/intelligence-factory/**`, neon scripts | baseline + cycle2 matrices; expansion owner-gated | — | $0; Neon writes gated |
| WS-MECH | #217 | patterns/taxonomy; **rebase** off Neon tip | CKG shared_cap recognition; no progress-manifest overwrite | #210/#212 | $0 |
| WS-FIN | #220 + #190 assist | `docs/product/financial-compliance/**` or FCE tree; **no store fork** | cert→snapshot propose/approve; rebase schema vs #190 | NS-4 strategy | $0 |
| WS-CAP | #214 + **#215b** | capacity-validation + usage-zero matrix | U1–U10 matrix green; BLK-USAGE-ZERO closed only when U3 fail-closed | #215 land | $0 |
| WS-TXN | #223 | `docs/product/transaction-effects/**` | sequential state recipes; reuse simulate APIs | #209/#221 preferred | $0 |
| WS-XDOC | #218 + #211 | cross-doc reasoning (+ Stage D honesty via #211) | 8 scenarios FP=0; lien-only INCOMPLETE | #205→#207 before #211 | $0 |
| WS-RCV | #205/#206 | authentic CONMED evidence; SYNTHETIC labels | §7.2(d) path; no fabricated clearance | — | $0 |
| WS-UCP | **#221 canonical**; absorb #213 | `lib/product/unified-customer/**` | Position/Simulate/Ask same engine; unknown usage → MISSING_EVIDENCE | #213 first or cherry-pick | $0 |
| WS-ADV | adversarial lane | `docs/product/adversarial/**` | attack U3/U5/U1 regressions | after #213/#215 | $0 |

**Stop:** duplicate Neon inventories, second unified-product façades, second capacity calculators, rewriting sealed Phase-3 boards.

## Merge recommendations (human only)

| Action | PRs |
|---|---|
| Safe docs-first | #216, #208 |
| P0 land | #213, then #215 (disclose residual), open #215b immediately |
| Authentic legal path | #205 → rebase #207 → #211 |
| Neon continue | #210 → #212; #219 parallel (no uncontrolled migrate) |
| Product unify | #221 after #213; close or convert #213 to cherry-pick once absorbed |
| Capacity evidence | #214 after CI fix; #218; #209 |
| Rebase required | #190, #217, #200 (or abandon slices), #220 vs engine/schema |
| Do not merge | #136, #163, #135, #200 until DIRTY/FAIL cleared and non-duplicative |

## CI / costs

- Coordinator #216: CI PASS on tip `bcea445e` (prior) — refresh after this commit.  
- Fleet paid inference this session: **$0**.  
- No merges performed by coordinator.
