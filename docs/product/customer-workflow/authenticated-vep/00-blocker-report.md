# Authentic VerifiedExecutionPackage — blocker report

**Verdict:** no authentic `VerifiedExecutionPackage` was produced.  
**Tip SHA at investigation:** `96db1b46` (PR #202; certification D_HASH_MATCH truncated-serve + offline-map evidence retention). Authentic scan reconfirmed `NO_CERTIFIED_ARTIFACTS` (5× REVIEW_REQUIRED).  
**Soft gate:** no live / paid certification re-runs. Offline fixtures and frozen packets only.  
**Gates:** `certifyCandidate` / `certifyPackage` / `certifiedMapToVerifiedExecutionPackage` / `toVerifiedExecutionPackage` / `evaluateVerifiedCapacity` (REQUIRE) were not weakened.

`certifiedMapToVerifiedExecutionPackage` over the authentic on-disk set returns **REFUSED** `NO_CERTIFIED_ARTIFACTS`. `evaluateVerifiedCapacity` (REQUIRE) was **not** invoked: there is no derived package to bind.

PINNED_OFFLINE ≠ CERTIFIED. Population verified-units ≠ CERTIFIED. FIXTURE_IR / product-acceptance mocked CERTIFIED are **out of scope** for this claim and were not packaged.

---

## What cannot be claimed

| Claim | Status |
|---|---|
| CONMED customer IR is Phase-3 CERTIFIED | **Cannot claim** |
| Any stratified row is CERTIFIED (board remains 0/12) | **Cannot claim** |
| An authentic `VerifiedExecutionPackage` exists for product execution | **Cannot claim** |
| Certified debt ∩ lien capacity for a CONMED incurrence | **Cannot claim** |
| `evaluateVerifiedCapacity(REQUIRE)` over authentic CONMED IR | **Cannot claim** |
| Package-level `certifyPackage` CERTIFIED for CONMED | **Cannot claim** (`PARTIAL` / unsealed / candidate review) |
| IPV fixes flipped any authentic unit from REVIEW_REQUIRED → CERTIFIED | **Cannot claim** (offline recertification still REVIEW_REQUIRED) |

---

## Authentic packets scanned (candidate `10-certification.json`)

All authentic live-validation packets remain `REVIEW_REQUIRED`. None is `CERTIFIED`.

### CONMED §7.2(c) — `discovery-candidate:7a3f36589dacd05c41331a80` (INCUR_DEBT)

Near-miss family under `docs/phase-3-live-validation/`. Operative text is the incremental / ratio-secured debt permission that cites §7.3(g) liens and §7.1 financial tests.

| Packet | Candidate status | Blocker codes (paths) |
|---|---|---|
| `docs/phase-3-live-validation/7.2c-first-certified/10-certification.json` | REVIEW_REQUIRED | `COMPILATION_NOT_COMPLETED` (OPERATIVE_STATE_UNRESOLVED, SEMANTIC_SUPPORT_REVIEW_REQUIRED); `CONTEXT_CONTRACT_UNACCEPTABLE` (`CONTEXT_BUDGET_EXCEEDED` maxCrossReferenceDepth 3); `DEPENDENCY_INVALID` (`ir-rule:11f0445de25e714a1a3cfe31` unresolved deps); `OPEN_MATERIAL_OR_UNCERTAIN_FINDING` (7); `OPERATIVE_STATE_UNACCEPTABLE` (`context-item:5d2fe138…` AMENDMENT_LEAD **Indebtedness**); `SUPPORT_UNACCEPTABLE` (4 ungrounded numerics); `UNACCOUNTED_MATERIAL_SOURCE` (4); `UNIT_SUFFICIENCY_INCOMPLETE` (PARTIAL + AMBIGUOUS); `VERIFICATION_NOT_CLEAN` (MATERIAL_DISCREPANCY) |
| `docs/phase-3-live-validation/7.2c-rerun-operative-state/10-certification.json` | REVIEW_REQUIRED | `COMPILATION_NOT_COMPLETED` (OPERATIVE_STATE_UNRESOLVED); `OPEN_MATERIAL_OR_UNCERTAIN_FINDING` (1); `OPERATIVE_STATE_UNACCEPTABLE` (`context-item:5d2fe138…`, `context-item:815358d1…`); `VERIFICATION_NOT_CLEAN` |
| `docs/phase-3-live-validation/7.2c-rerun-projection-v1/10-certification.json` | REVIEW_REQUIRED | `COMPILATION_NOT_COMPLETED` (OPERATIVE_STATE_UNRESOLVED); `OPEN_MATERIAL_OR_UNCERTAIN_FINDING` (3); `OPERATIVE_STATE_UNACCEPTABLE`; `UNIT_SUFFICIENCY_INCOMPLETE`; `VERIFICATION_NOT_CLEAN` |
| `docs/phase-3-live-validation/7.2c-final-source-authority/10-certification.json` | REVIEW_REQUIRED | `COMPILATION_NOT_COMPLETED` (OPERATIVE_STATE_UNRESOLVED); `OPEN_MATERIAL_OR_UNCERTAIN_FINDING` (1); `OPERATIVE_STATE_UNACCEPTABLE`; `SUPPORT_UNACCEPTABLE` (qualitative lineage gap); `VERIFICATION_NOT_CLEAN` |

Phase-4 adapter on first-certified: **not attempted** (`14-phase4-adapter.json`: `"reason": "certification REVIEW_REQUIRED"`). Package certification **PARTIAL** (`PARTIAL_TARGET_SET`, `DISCOVERY_POPULATION_UNSEALED`, `CANDIDATE_REVIEW_REQUIRED`).

### Offline recertification after IPV / governing-scope repairs (no paid calls)

`tests/contract-model/certified/live-7-2c-governing-replay.test.ts` rebuilds the sealed CONMED index, supplies preserved Phase-2 state, re-normalizes the frozen compilation, and re-runs `verifyCompiledCandidate` + `certifyCandidate`. Semantic findings F1/F2/F3 close. **Certification stays REVIEW_REQUIRED.** Residual blockers:

| Code | Path / cause |
|---|---|
| `COMPILATION_NOT_COMPLETED` | compilation still `OPERATIVE_STATE_UNRESOLVED` |
| `OPERATIVE_STATE_UNACCEPTABLE` | context bundle unresolved operative evidence (Second Amendment **Indebtedness** AMENDMENT_LEAD; preserved Phase-2 instrument `OPERATIVE_STATE_REVIEW_REQUIRED`) |
| `VERIFICATION_NOT_CLEAN` | verification `REVIEW_REQUIRED` with **0 material findings** — upstream operative-state axis, not a semantic finding |

`UNIT_SUFFICIENCY_INCOMPLETE` / `OPEN_MATERIAL_OR_UNCERTAIN_FINDING` / `UNACCOUNTED_MATERIAL_SOURCE` / `SUPPORT_UNACCEPTABLE` no longer fire on that repaired unit. That is **not** CERTIFIED credit.

Preserved Phase-2 (`tests/fixtures/unseen-packages/phase-2f-freeze/phase-2g/conmed-amendment-regression.json`) still records four REVIEW_REQUIRED provisions: **Indebtedness**, Consolidated Senior Secured Leverage Ratio, Consolidated Total Leverage Ratio, §1.1. The adapter does not invent resolution (`currentText: null`). IPV-16/19/20 closures on synthetic product-acceptance packages do not rewrite this freeze.

### CONMED §7.5(j) — `discovery-candidate:5aeac47ab31feb23331e4f89` (ASSET_SALES, not debt/lien)

`docs/phase-3-live-validation/7.5j-end-to-end-certification/10-certification.json`: REVIEW_REQUIRED.

| Code | Detail |
|---|---|
| `COMPILATION_NOT_COMPLETED` | SEMANTIC_INVENTORY_COVERAGE_GAP, INVENTORY_ITEM_MISSING_FROM_COMPOSITION, SEMANTIC_SUPPORT_REVIEW_REQUIRED |
| `UNACCOUNTED_MATERIAL_SOURCE` | 1 material source item |
| `UNIT_SUFFICIENCY_INCOMPLETE` | `ir-rule:813a03f3488f210788389510:PARTIAL` |

Residual genuine composition gaps remain in `docs/phase-3-live-validation/7.5j-deterministic-remediation/08-residual-genuine-blockers.json` (related-series UNSUPPORTED, notes-debt / other-non-cash valuation UNSUPPORTED, support asymmetry). Soft gate forbids a paid recertify.

---

## Debt / lien provisions considered (authentic CONMED)

| Provision | Family / role | Evidence used | Why it cannot enter a VEP |
|---|---|---|---|
| **§7.2(c)** | DEBT / incremental-ratio permission (INCUR_DEBT), cites §7.3(g) liens + §7.1 tests | live packets + governing-replay recertify | REVIEW_REQUIRED; residual Phase-2 Indebtedness / OPERATIVE_STATE_UNRESOLVED |
| **§7.2** (section-level) | DEBT prohibition parent | population `02-run-report.json` | compile TIMEOUT; no verified package |
| **§7.3(m)** | LIENS / BASKET (`discovery-candidate:b5bb07b092f9863985f89812`) | stratified pin `pins/conmed-2025-credit-facility/7.3(m)--b5bb07b0/v1/` | PINNED_OFFLINE only; historical map `COMPILE_FAILED`; no `10-certification.json`; Phase-2 Indebtedness still REVIEW_REQUIRED on the pin |
| **§7.1(c)** | FINANCIAL_COVENANTS / ICR test (`discovery-candidate:5f83b15ed6cd0ea8b06289a0`) | stratified pin `…/7.1(c)--5f83b15e/v1/` | PINNED_OFFLINE; map `CANDIDATE_COMPILE_REVIEW_REQUIRED` / `VERIFICATION_INCOMPLETE`; not an incurrence basket |
| **§7.1** (section-level) | FINANCIAL_COVENANTS | population | compile TIMEOUT |
| **§7.3(g)** | LIENS (cited by §7.2(c)) | live §7.2(c) retrieval only | never independently CERTIFIED; figures 80% restated into 7.2(c) were excluded / ungrounded |
| **§7.8(d) / §7.8(l)** | INVESTMENTS pins | stratified pins | not debt/lien; PINNED_OFFLINE ≠ CERTIFIED |
| **§7.5(j)** | ASSET_SALES | live e2e packet | REVIEW_REQUIRED; not debt/lien |

Corpus root: `tests/fixtures/unseen-packages/conmed-2025-credit-facility/` (Eighth A&R CA 2025-06-10, GCA, Second Amendment 2022, First Omnibus 2026).

---

## Population verified-units (`docs/phase-3-conmed-population-verified/`)

Compile+verify evidence only. **No** `certifyCandidate` records. Original-run verification statuses: MATERIAL_DISCREPANCY 31, VERIFICATION_INCOMPLETE 18, REVIEW_REQUIRED 1, VERIFICATION_FAILED 1, NOT_RUN_COMPILE_FAILED 53. Zero `VERIFIED_NO_MATERIAL_GAP_FOUND`. §7.1 / §7.2 / §7.2(c) timed out on that run. `certifiedMapToVerifiedExecutionPackage` must not consume unpaired or uncertified packages (`CANDIDATE_NOT_CERTIFIED` / skip).

---

## Stratified board

`docs/phase-3-reliability-stratified-certification/`: CERTIFIED **0/12**. Soft gate: freeze + offline pin only. Pins stop at identity / operative-state / eligibility (`00`–`01c`). No compile+verify+certify chain on those pins after IPV.

---

## Adapter / execution contracts (honest refusal)

`lib/contract-model/phase3-certification/phase4-adapter.ts` includes only `status === "CERTIFIED"` artifacts, hash-checks the persisted package, and refuses dangling executable relationships. Empty authentic CERTIFIED set → `NO_CERTIFIED_ARTIFACTS`.

`evaluateVerifiedCapacity` is REQUIRE-only. Product `attemptCertifiedTransaction` already fail-closes with `NO_VERIFIED_EXECUTION_PACKAGE`. That remains the customer path.

Offline scanner: `scripts/product/attempt-authenticated-vep.ts` (exit 2 when refused). Scan dump: `01-scan.json`. **No** `verified-execution-package.json` is written on refusal.

---

## What would be required before an authentic VEP can be claimed

1. Phase-2 resolution (or honest fail-closed product handling) of CONMED **Indebtedness** (and the other three REVIEW_REQUIRED definitions/§1.1) without inventing `currentText`.
2. A `certifyCandidate` result of **CERTIFIED** on a bounded authentic unit (e.g. §7.2(c) and independently §7.3(g) if the executable relationship is to execute), under the existing decision version — not a map tag, not PINNED_OFFLINE.
3. `certifiedMapToVerifiedExecutionPackage` **DERIVED** with matching `artifactPackageHash`.
4. Only then `evaluateVerifiedCapacity({ package, … })` under REQUIRE.

Authorized paid recertification is **outside** this mission.


---

## Related (not authentic live)

Product-acceptance deterministic CERTIFIED candidates (Layer-2 mocked) were packaged separately via `scripts/product/derive-acceptance-certified-vep.ts` → `docs/product/customer-workflow/acceptance-certified-vep/`. Those VEPs drive Phase 4E `enumerateCertifiedPaths` with `CERTIFIED_4E` for packages N/A/J/C. They do **not** satisfy the authentic live CERTIFIED claim above.
