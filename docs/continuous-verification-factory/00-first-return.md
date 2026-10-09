# Continuous Verification Factory — Required First Return

**Branch:** `cursor/continuous-verification-factory-5d11`  
**Factory version:** `verification-factory.v1`  
**Cost (this return):** $0 (provider-free; no paid inference)  
**Production semantics / certification gates:** **UNCHANGED** (confirmed)

---

## 1. Existing verification assets inventory

| Class | Scale | Location |
|-------|------:|----------|
| Vitest files | ~574 | `tests/**` |
| Approx. `it`/`test` calls | ~6,240 | (does not expand `it.each`) |
| Contract-model | ~272 files / ~3,526 tests | `tests/contract-model/` |
| Product (cross-doc, sequential) | ~28 files / ~172 tests | `tests/product/` |
| Certification battery | ~29 / ~425 | `tests/certification/` |
| Foundation-audit | ~35 / ~367 | `tests/foundation-audit/` |
| Phase-3 CONMED pilot | ~18 / ~335 | `tests/phase-3-conmed-pilot/` |
| Solver | ~10 / ~147 | `tests/solver/` |
| Unseen/authentic packages | 40 dirs (~253 MB) | `tests/fixtures/unseen-packages/` |
| Product-acceptance packages | 14 + `expectations.json` | `tests/fixtures/product-acceptance/` |
| Scripts / harnesses | ~512 | `scripts/**` |
| Hard CI gate | 1 | `.github/workflows/canonical-compiler.yml` |
| Soft CI gates | 5 | stratified-cert, P3-R0, home, invent-absence ×2 |
| Agent 5 cross-doc | 8 synth + 12 authentic + 10 adversarial | `lib/product/covenant-intelligence/cross-document-*` |
| A8-01 capacity floor | permanent suite | `tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts` |
| STC dataset | 180 train / 14 dev / 35 eval-heldout | `datasets/source-to-covenant/` |

Machine-readable snapshot: see inventory notes in this folder and `lib/verification-factory/corpus/registry.ts` (wraps existing cases).

**Critical finding:** Most of the ~6k tests never run in push/PR CI. Product cross-document / sequential / A8 were previously ungated. CVF adds a **soft** PR lane without weakening the certified path.

---

## 2. Missing coverage by phase and mechanic

| Mechanic / phase | Local coverage | CI | Gap |
|------------------|---------------|----|-----|
| Certified compile/verify | Strong | Hard gate | Full contract-model not in CI |
| Capacity A8 gate status | Strong unit | **Now in CVF soft gate** | Was ungated |
| Cross-document conjunction | Agent 5 offline | **Now in CVF soft gate** | Authentic issuers still few |
| Sequential multi-tx | Product offline | **Now in CVF soft gate** | Limited authentic chains |
| Shared capacity / builders | Partial | Soft stratified pins | Need combinatorial GT |
| Builder / ratio debt | Sparse authentic | Ungated | First-1000 family planned |
| RP / investment entity scope | Partial | Ungated | First-1000 family planned |
| Amendment operative dating | Phase-2g + foundation | Thin in CI | Family planned |
| Ledger utilization honesty | Overview + Agent 4 | Partial | Family planned |
| Position / Simulate / Ask | Unified-position tests | Soft/unrelated | Family planned |
| Blind authentic holdouts | Docs sealed packets | Release-only | Isolation design landed; few CVF seals yet |
| Paid unseen (601/Riot/Chewy) | Manual scripts | Never default CI | Keep budget-gated |

---

## 3. Proposed unified harness architecture

```
lib/verification-factory/
  harness.ts          → runHarness(tier) dispatches cases
  provenance.ts       → GT contract validation + freeze guard
  holdout.ts          → sealed expectations (HOLDOUT_UNLOCK)
  metrics.ts          → denominators + incorrectFavorable
  corpus/registry.ts  → wraps existing scenarios (no body clones)
  adapters/           → call production engines only
    cross-document.ts
    capacity-a8.ts
    sequential.ts
    metamorphic.ts
  generate/first-1000-plan.ts → combinatorial plan (not 1000 files)
```

**Invariant:** Adapters call `evaluateCrossDocumentTransaction`, capacity `state.ts`, sequential demos, etc. **No competing production evaluation pathway.**

Tiers: `PR_FAST` → `INTEGRATION_BATCH` → `SCHEDULED_EXTENSIVE` → `RELEASE_HOLDOUT` (`CI_TIER_PLAN` in harness).

---

## 4. Ground-truth provenance contract

Type: `GroundTruthProvenance` (`cvf-ground-truth.v1`) — required fields:

- Issuer + financing-package identity  
- Source documents (+ sha256 when hashed)  
- Operative-as-of date  
- Relevant sections / definitions  
- Independently enumerated restrictions  
- Expected legal (+ optional financial notes)  
- Reviewer identity + review provenance  
- Confidence + unresolved ambiguities  
- `frozenAt`  
- `notDerivedFromEngine: true`

Guards:

- `validateGroundTruthProvenance` fail-closed  
- `assertExpectationsFrozen` — silent rewrite forbidden  

---

## 5. Holdout isolation design

| Layer | Behavior |
|-------|----------|
| Public registry | `holdoutSealId` + `payloadSha256` only |
| Sealed payloads | `tests/fixtures/verification-factory/holdouts-SEALED/` |
| Open API | `openHoldoutSeal` throws unless `HOLDOUT_UNLOCK=1` |
| PR CI | `HOLDOUT_UNLOCK=""` — cannot score holdouts |
| Release gate | Unlock on dedicated runner; never in implementation agent defaults |
| Separate classes | `PUBLIC_DEVELOPMENT` / `FROZEN_REGRESSION` / `BLIND_AUTHENTIC_HOLDOUT` / `NEWLY_ACQUIRED_UNSEEN` |

Do not expose holdout expected outcomes to implementation agents.

---

## 6. CI execution tiers and cost estimate

| Tier | Cadence | Entrypoints | Paid inference |
|------|---------|-------------|----------------|
| **PR_FAST** | Every matching PR | `tests/verification-factory`, A8 regression, cross-doc + sequential product, `cvf:pr-fast` | **$0** |
| **INTEGRATION_BATCH** | Integration merges | `test:phase3-certification` + product + acceptance | **$0** |
| **SCHEDULED_EXTENSIVE** | Nightly/weekly | certification, foundation-audit, solver, combinatorial matrix | **$0** default |
| **RELEASE_HOLDOUT** | Release | Sealed holdouts with unlock | **$0** replay; paid only if explicitly budgeted |

Workflow added: `.github/workflows/cvf-pr-safety.yml` (**soft gate**; does not modify `canonical-compiler.yml`).

**Cost estimate for first 1,000 offline executions:** ~$0.00 (deterministic adapters).  
**Cost estimate if later adding paid live holdouts:** budget separately; never default CI.

---

## 7. First 1,000-case plan

`summarizeFirst1000Plan()` → **~1,000 executions** across **12 families** (combinatorial), including:

- Authentic boundary (pkg × kind × threshold)  
- Shared capacity / reclass  
- Builder / ratio debt  
- RP/investment entity scope  
- Sequential chains  
- Metamorphic invariants  
- Amendment operative dates  
- Position/Simulate/Ask consistency  
- Financial calc boundaries  
- Ledger utilization honesty  

**Anti-clone rules:** dedupe keys, structure-family accounting, new GT required before scoring, no copying Agent 5 demos ×1000.

Current registry seeds **~35 executable cases** by wrapping existing assets — the factory substrate, not inflated counts.

---

## 8. Anti-overfitting controls

1. Separate fixture classes (public / frozen / blind / newly acquired).  
2. Holdout seals + unlock gate.  
3. Diversity metrics: unique packages + structure families (not pass counts).  
4. Freeze guard on expected outcomes.  
5. Metamorphic invariants that punish favorable drift.  
6. CKG-style exclusion of training packages from true holdouts (process + registry tags).  
7. `incorrectFavorable` fails CI even if pass-rate is high.  
8. Explicit note: zero false-favorable meaningless without denominators.

---

## 9. Proposed PR boundaries and agent ownership

| PR / stream | Owner | Scope |
|-------------|-------|-------|
| **This PR — CVF substrate** | Verification / Agent-factory | Harness, provenance, holdout, metrics, PR soft gate, first-return docs |
| Agent 5 cross-doc | Agent 5 | Authentic scenarios consumed via adapter (no rewrite) |
| Agent 4 sequential | Agent 4 | Sequential runtime; CVF adapts |
| Agent 8 / A8 capacity | Capacity owners | A8 regression; CVF asserts floor |
| Certified path | Compiler owners | **Untouched** by CVF soft gate |
| Holdout authoring | Independent reviewers | Seal payloads; never SUT authors |
| Combinatorial expansion PRs | CVF + domain agents | One family per PR with GT first |

---

## 10. Explicit confirmation — production semantics and certification gates unchanged

**Confirmed:**

1. No changes to Phase 3 certification decision logic (`certifyCandidate`).  
2. No weakening or path-filter removal on `canonical-compiler.yml`.  
3. CVF adapters **call** existing engines; they do not reimplement capacity, certification, or cross-document conjunction.  
4. Soft gate explicitly labeled `IMPLEMENTED ≠ CERTIFIED`.  
5. `runHarness` returns `productionSemanticsUnchanged: true` and `certificationGatesUnchanged: true`.  
6. Holdouts cannot unlock in PR CI.

---

## Success criterion (orientation)

Success is a system that continuously discovers real defects and makes unsupported favorable outcomes harder to introduce — **not** maximizing green test counts.
