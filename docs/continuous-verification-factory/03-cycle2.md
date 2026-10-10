# Continuous Verification Factory — Cycle 2 Report

**Branch:** `cursor/continuous-verification-factory-5d11`  
**PR:** #238 (base: `cursor/cross-document-covenant-reasoning-5d11` / Agent 5 tip)  
**Factory version:** `verification-factory.v1`  
**Cost:** $0 (provider-free; no paid inference; no Neon writes; no auto-merge)

---

## 1. PR #238 base reconciliation

| Fact | Value |
|------|-------|
| #238 base branch | `cursor/cross-document-covenant-reasoning-5d11` @ `74aa2fba` |
| #238 tip (Cycle 1) | `b3805edb` |
| `main` tip (local) | `b99f934b` (behind remote; lacks cross-document product modules) |
| Dependency on unmerged domain work | **Yes** — CVF adapters require Agent 5 cross-document / sequential modules from PR #218. `lib/product/covenant-intelligence/cross-document-covenant.ts` **does not exist on main**. |
| CVF-only delta vs Agent 5 tip | Single substrate commit + Cycle 2 commits on this branch |

**Verdict:** #238 must not retarget `main` until Agent 5 lands. Soft CI gates unchanged in hardness; canonical-compiler remains the hard gate.

---

## 2. Adapter production-binding proof

`auditAdapterProductionBinding()` verifies every adapter under `lib/verification-factory/adapters/` (except the auditor itself):

- Required production imports present (`cross-document-*`, capacity types, sequential state).
- Forbidden patterns: no local `evaluateCrossDocumentTransaction` / capacity / simulate reimplementation.

Adapters checked: `capacity-a8`, `cross-document`, `grounded-boundary`, `metamorphic`, `sequential`, `suite-pointer`.

---

## 3. Mutation challenge (controlled defects → restore)

Script: `npm run cvf:mutation-challenge` → `scripts/verification-factory/mutation-challenge.ts`

| Mutation id | Category | Target | Detection case |
|-------------|----------|--------|----------------|
| mut-entity-scope | entity_scope | cross-document-covenant | auth-conmed-nonguarantor-guarantee |
| mut-cross-document-binding | cross_document_binding | aggregateOverall OR | xd-01-permit-vs-prohibit |
| mut-utilization-completeness | utilization_completeness | classifyUtilizationHistory | seq / utilization probe |
| mut-shared-capacity | shared_capacity | isAndConstraint | meta-add-restriction-no-improve |
| mut-amendment-precedence | amendment_precedence | factOperativeOn | xd-05-amendment-effect |
| mut-sequential-financial | sequential_financial_state | basket consumption | seq-conmed-debt-rp-overflow |

Each mutation is applied, CVF re-run, then **restored** in `finally`. Files must hash-match originals after the run.

---

## 4. Holdout isolation strengthening

- In-repo `holdouts-SEALED/` is agent-readable ⇒ example seal relabeled **`FROZEN_REGRESSION`**, not `BLIND_AUTHENTIC_HOLDOUT`.
- `BLIND_AUTHENTIC_HOLDOUT` reserved for answer keys **outside** the agent workspace.
- Sealed provenance (`holdoutSealId`) excluded from executable registry.
- README updated with Cycle 2 isolation policy.

---

## 5. Independent source-backed GT (before new cases)

Every grounded expansion case carries:

- `reviewerIdentity`, `reviewProvenance`, `notDerivedFromEngine: true`
- source path + `sha256` (when readable)
- `operativeAsOf`, enumerated restrictions, ambiguities
- frozenAt `2026-10-10T00:00:00.000Z`

---

## 6. Coverage denominators

`computeCoverageDenominators()` reports:

- unique legal scenarios vs generated executions
- by legal mechanic, issuer, document family, transaction type, outcome class, fixture class

Cycle 2 snapshot (pre-mutation): **100 unique / 99 executions**.

---

## 7. Expansion toward 100 grounded scenarios

| Cohort | Count |
|--------|------:|
| Authentic Agent 5 packages | 12 |
| Synthetic xd | 8 |
| Adversarial | 10 |
| Factory native (A8/seq/meta) | 5 |
| Grounded boundaries | 30 |
| Product-acceptance pointers | 14 |
| Defect detectors | 8 |
| Mechanic families | 12 |
| In-repo sealed (non-exec) | 1 |
| **Public registry** | **100** |
| **Executable** | **99** |

Combinatorial first-1000 plan remains a **plan**, not cloned files.

---

## 8. Explicit defect checks

Registered detectors: incorrect favorable, incorrect refusal, missing evidence (ICA), stale sequential financial state, missed restriction (suite-pointer), amendment precedence, cross-doc conjunction, shared-capacity metamorphic.

---

## 9. Soft gates preserved

- `cvf-pr-safety` remains soft; does not replace canonical-compiler.
- Soft gate fails only on **unexpected** incorrect favorables.
- Known standing defect allowlist (not hidden from metrics): `gnd-conmed-76-above-45m` (engine PERMITTED vs independent GT PROHIBITED on §7.6 overflow).

---

## 10. Required return fields (tested tip)

| Field | Value |
|-------|-------|
| Tested SHA | `6a73c5822caa23d8f76d7be2dd7140065a5ecaeb` |
| Mutation detection | **6/6 detected, 6/6 restored** — see `04-mutation-challenge.json` |
| Unique scenarios | **100** public / **99** executable |
| Case provenance | reviewer + source sha256 + operative date + restrictions + ambiguities on grounded cases |
| False favorables | **1 known standing**: `gnd-conmed-76-above-45m` (engine PERMITTED vs GT PROHIBITED on §7.6); **0 unexpected** |
| Soft gates | unchanged hardness; fail only on unexpected incorrect favorables |
| Hard gate | canonical-compiler preserved |
| Unresolved blockers | (1) #238 depends on unmerged Agent 5 / #218; (2) standing §7.6 overflow false favorable; (3) truly blind holdout keys not yet externalized |
| Cost / safety | $0 inference; no Neon writes; no auto-merge |
