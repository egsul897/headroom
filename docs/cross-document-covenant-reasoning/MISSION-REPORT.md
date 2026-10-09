# Headroom Agent 5 — Cross-Document Covenant Reasoning

**Branch:** `cursor/cross-document-covenant-reasoning-5d11`  
**PR:** https://github.com/egsul897/headroom/pull/218  
**SHA:** `7cd12f919f670a2cad6b7096f19d21517c324e54`  
**Cost:** $0 (zero provider calls; offline fixture reasoning)  
**False-permission count:** **0** (independent verifier on all 8 scenarios)

## Mission

Make Headroom evaluate a proposed transaction against **all independently applicable operative agreements**, without duplicating the document graph, amendment precedence, verified rulebook, Phase 4E path enumeration, or cross-rule capacity systems.

## What was built (composition, not duplication)

| Existing system | How Agent 5 consumes it |
|---|---|
| Phase 2C package graph (`buildWorkspacePackageGraph`) | Optional wire; unresolved relationships → unknowns |
| Operative amendment precedence (`operative-resolution`) | Effective/supersession dating on facts; helper reuse |
| Phase 3 trusted rulebook | Optional readiness signal (`verifiedRulebookHasTrustedUnits`) |
| Phase 4E `enumerateCertifiedPaths` | Called when a VEP is supplied; scenarios pass `null` → truthful `NOT_CERTIFIED_4E` |
| Cross-covenant analysis (`analyzeCrossCovenant`) | Optional within-family / shared-cap notes |
| Legacy `combineCrossDocument` MIN capacity | **Not reimplemented** — basket capacity stays in covenant-engine / 4E |

**New module:** `lib/product/covenant-intelligence/cross-document-covenant.ts`  
**Scenarios:** `lib/product/covenant-intelligence/cross-document-scenarios.ts`  
**Tests:** `tests/product/cross-document-covenant.test.ts` (19 pass)  
**Runner:** `scripts/product/run-cross-document-scenarios.ts` → `scenario-results.json`

### Invariants enforced

1. **Conjunction across applicable documents** — permission in one never overrides prohibition in another (`ALL_APPLICABLE_DOCUMENTS_MUST_PERMIT`).
2. **OR within a document’s basket exceptions** — unused-basket overflow is not a controlling prohibition when another basket clears.
3. **Irrelevant documents need not authorize** — e.g. CA Indebtedness definition excluding Capital Leases → `NOT_APPLICABLE`.
4. **Missing restrictions / absent docs are unknowns** — never inferred satisfied.

## Authentic fixtures used

- `pkg-b-multi-document` — Northfield Credit Agreement + Senior Notes Indenture + First Supplemental Indenture
- `pkg-i-secured-debt-lien` — Granite Peak debt / lien / §9.15 secured cap
- `pkg-h-unseen-composition` — Copperline ABL + Intercreditor (investments, Payment Conditions)
- `pkg-c-amendment-supersession` — amendment restatement pattern (cross-checked)

## Eight scenarios (independently verified)

| ID | Focus | Overall | Key citations |
|---|---|---|---|
| xd-01 | One permits, another prohibits | **PROHIBITED** | CA §7.01(a) permits Loan Documents; Indenture §4.09(a) caps CA at $150M — pro forma $170M fails |
| xd-02 | Different conditions | **PERMITTED** | CA §7.01(b) $30M and Indenture §4.09(c) $75M (post-amd) both clear $20M; not stacked |
| xd-03 | Debt + lien authority | **PROHIBITED** | §7.01(b) $50M debt clears; §7.02(b) $20M lien + §9.15 $25M secured cap prohibit |
| xd-04 | Cross-section definition | **PROHIBITED** | Indenture §4.09 → §1.01 FCCR unevidenced; baskets fail at $100M |
| xd-05 | Amendment effect | **PROHIBITED** | Pre-2026-05-01 Indenture §4.09(c)=$50M; CA $30M; post-amd indenture alone still blocked by CA |
| xd-06 | Absent document | **UNDETERMINED** | ABL §7.02(b) Term Loan Liens “subject to Intercreditor”; ICA absent |
| xd-07 | Classification divergence | **PERMITTED** | Capital Lease ∉ CA Indebtedness; ∈ Indenture Indebtedness — CA not required to authorize; Indenture §4.09(c) clears $10M |
| xd-08 | Multiple pathways | **CONDITIONALLY_PERMITTED** | §7.03(c) too small; §7.03(b) Available Amount path needs Payment Conditions — pathways listed, not stacked |

Machine-readable outcomes: [`scenario-results.json`](./scenario-results.json).

## Demonstrated improvements

1. **Cross-document conjunction** as a first-class product verdict (not OR across agreements).
2. **False-permission guard** (`verifyCrossDocumentVerdictIndependently`) — suite count **0**.
3. **Amendment-dated operative facts** — same provision id, different capacity pre/post supplemental.
4. **Definition-scoped instrument classification** — avoids forcing irrelevant CA authorization.
5. **Absent controlling instrument → UNDETERMINED** — no silent grant.
6. **Debt∩Lien∩shared secured cap** — anti-stacking notes from §7.02(b)/§9.15 peers.
7. **Neutral pathway listing** composed with Phase 4E authority honesty (`NOT_CERTIFIED_4E` when no VEP).
8. **Coverage of debt, liens, RP gate language, investments, guarantor, intercreditor, amendments, shared capacity** without a parallel compiler.

## Test / cost

```
npx vitest run tests/product/cross-document-covenant.test.ts   # 19 passed
npx tsx scripts/product/run-cross-document-scenarios.ts        # 8/8 match, FP=0
Cost: $0.00
```
