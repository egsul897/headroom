# Stage D Cycle 6 — Final Integration Gate

**Candidate tip:** ``7fa7f6e7773ac15d946ed1eac27a27608c7f0545``  
**PR:** https://github.com/egsul897/headroom/pull/233  
**Verdict:** **PASS** (provisional acceptance confirmed; no merge performed)

## 1. SHA reconciliation

| Label | SHA |
|---|---|
| PR #233 head (integration candidate) | see tip after push |
| Functional dual-path code | `c2086f2b` |
| CI-green certified tip (pre-gate) | `cc469588` |
| Scorecard had lagged docs pin | `f13b10f2` → updated to gate tip |
| #228 tip (base) | `c517820bd36d302b5124c156ad1dd9d6af2c3a8e` |
| #222 tip | `271d4ef17d826200ad103daef4d602d78f2cf7b5` |

## 2–4. Parent resolution + adversarial scope

Independent suite: `tests/product/stage-d-cycle6-integration-gate.test.ts`

| Case | Result |
|---|---|
| §7.02(b) → parent §7.02 chapeau (not §8.02) | Pass |
| Duplicate §7.02(b) → no silent pick (fallback) | Pass |
| Cross-document amendment isolation | Pass |
| Nested 7.02(b)(i) → §7.02 chapeau | Pass |
| Missing chapeau / null index / non-lettered | Fail-closed |
| Child Unrestricted Subsidiary overrides parent-wide tags | Pass |
| Child Borrower-only narrower than parent | Pass |
| Foreign Subsidiaries unmappable → underinclusive refuse | Pass |
| Guarantor-only parent unmappable → refuse derivation | Pass |

## 5–6. SOURCE_SCOPE_DERIVED confirmation + refusals

Runtime mapping requires **status ∈ {SOURCE_MATCH_CONFIRMED, SOURCE_SCOPE_DERIVED} ∧ safeToRely ∧ non-empty entityScope**.

| Case | applicability |
|---|---|
| Derived + safe + non-empty | SCOPE_CONFIRMED_BY_SOURCE |
| SOURCE_SCOPE_DERIVED + safeToRely false | SCOPE_NOT_SAFE_TO_RELY_ON |
| SOURCE_SCOPE_DERIVED + empty scope | SCOPE_NOT_SAFE_TO_RELY_ON |
| UNWITNESSED | SCOPE_NOT_SAFE_TO_RELY_ON |

## 7–8. Dual-path $15M accounting

| Check | Result |
|---|---|
| Debt draw | $15M against §7.01(b) ($50M → $35M remaining) |
| Lien draw | $15M against §7.02(b) ($20M → $5M remaining) |
| Economic principal | Labeled $15M secured; Phase 4D intendedAmount = sum of stated draws only |
| Debt-only SATISFIED | Does **not** select lien rule; not a SECURED_DEBT dual-path answer |

## 9. Regressions

- Integration gate + entity-scope-guard + xref-fixtures + Stage D dual-path: Pass
- `npm run test:phase3-certification`: see CI
- No certification bypass; entity-scope guards not weakened

## 10. Dependency on #222 / #228

| Fact | Value |
|---|---|
| #228 ancestor of #233 | **Yes** |
| #222 ancestor of #233 | **No** (parallel after `6e33dc13`) |
| COUNTERPARTY content #222 vs #228 | Equivalent (empty diff on guard/governing at tips) |
| #233 stacks | #228 tip + Cycle 6 parent-scope + runtime mapping |

**Merge posture:** No automatic merge. Coordinate with #229 (capacity state/types). Rebase/merge onto main after #228 (and ideally #222 content already in #228).

## Safety

- Paid inference: $0
- SYNTHETIC_LABELED_TECHNICAL_DEMO only for favorable secured demo
- PINNED_OFFLINE ≠ CERTIFIED
- Customer-grade readiness **not** claimed
