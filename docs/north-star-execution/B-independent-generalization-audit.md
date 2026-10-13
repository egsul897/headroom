# Workstream B — Independent generalization audit

**Evaluation corpus id (immutable):** `NS-GEN-AUDIT-2026-10-13-A324`  
**Corpus provenance:** sealed Phase 2F / Phase 3F unseen-package fixtures under
`tests/fixtures/unseen-packages/` + autonomous-compilation independent inventories
under `tests/fixtures/autonomous-covenant-compilation/`.  
**Controlling North Star:** `docs/headroom-north-star-v2.md` §1–8; Phase 2F
`docs/phase-2f-unseen-package-validation.md` (historical first-blind evidence —
**not rewritten**).  
**This report does not advance phase certification.**

## 1. Starting / ending SHAs

| | SHA |
|---|---|
| Audit base (PR #311 tip) | `c1246becb15a3e3ff508334ba889a759c986a28a` |
| This branch tip | *3a4bd4c0a190c42a32ea969228ab04f4ffd33ec0* |

## 2. Immutable corpus membership

| Package id | Role | Prior freeze / evidence |
|---|---|---|
| `conmed-2025-credit-facility` | Phase 2F first-blind unseen | `PHASE_2F_FREEZE_MANIFEST` |
| `riot-2025-2026-credit-facility` | Phase 3F2 unseen | `phase-3f2-riot-unseen-run` |
| `gibraltar-2026-credit-agreement` | Holdout / development | fixture only |
| `wor-2023-2026-credit-facility` | Restatement authority | Agent #7 WOR fixtures |
| `an-2020-2026-credit-facility` | AutoNation series | Agent #11 retest corpus |
| Matthews + MHK excerpts | Autonomous compile proofs | independent inventories (not full unseen) |

**Unseen status:** Phase 2F CONMED selection log and freeze manifest remain the
controlling evidence that CONMED was unseen at first blind. This audit **does not**
claim a new first-blind run. New code changes in Workstream A are excluded from
any claim that re-scores historical Phase 2F metrics.

## 3. Classification rubric (separated)

| Class | Meaning |
|---|---|
| FALSE_POSITIVE | Claimed covenant / capacity unsupported by source |
| DANGEROUS_OMISSION | Material covenant/amendment/capacity absent with no alarm |
| UNSUPPORTED_CASE | Honest refuse / UNSUPPORTED / NEEDS_INPUT |
| CORRECT_REFUSAL | Fail-closed when evidence insufficient |
| DEMONSTRATED | Reproduced with exact SHA + test/fixture evidence on this tip |
| UNVERIFIED_CLAIM | Asserted in docs/UI without tip-reproducible proof |

## 4. Verified findings vs hypotheses

### Demonstrated (this tip / preserved evidence)

| Capability | Evidence | Class |
|---|---|---|
| Fixed-dollar VE compile on Matthews + MHK excerpts | `ve-position-matthews-mhk-acceptance`, autonomous pipeline tests | DEMONSTRATED (gross only) |
| Cross-doc section match without relationship REFUSE | PR #311 remediation adversarial | DEMONSTRATED |
| Restatement as-of supersession precedence | PR #311 remediation adversarial | DEMONSTRATED |
| OA/calculation sanitize (discovery≠governing) | Workstream A tests | DEMONSTRATED |
| Phase 2F CONMED: strong recall on decimal Article VII | Historical `docs/phase-2f-unseen-package-validation.md` | DEMONSTRATED (historical; not re-run here) |
| Phase 2F CONMED: zero signal on guarantee/amendment docs | Same historical report | DANGEROUS_OMISSION (historical, still open) |

### Hypotheses / unverified

| Claim | Status |
|---|---|
| Generalized leaf dashboard for arbitrary issuers | UNVERIFIED_CLAIM / NOT_PROVEN |
| Autonomous full covenant compilation (ratio closure) | PARTIAL / ratio numeric UNSUPPORTED |
| Production AVAILABLE capacity | REFUSED (trusted-identity BLOCKED) — CORRECT_REFUSAL |
| End-to-end customer VerifiedExecutionPackage | Blocked by Phase 3 certification gate |

## 5. Company-specific branches / leakage scan

| Location | Finding | Class |
|---|---|---|
| `lib/contract-model/analysis/operative-covenant-package.ts` | Issuer-agnostic API; no companyId switch | OK |
| `lib/product/autonomous-covenant-compilation/package-contexts.ts` | Fixture loaders only (disclosed) | OK (fixture) |
| `lib/product/real-dashboard-vertical-slice/phase3-compile-bridge.ts` | Hardcoded matw documentId section hints | FIXTURE_SPECIFIC — not production discovery |
| `lib/product/real-dashboard-vertical-slice/position-bridge.ts` | MATW ticker / facility ids | FIXTURE_SPECIFIC |
| `lib/product/legal-intelligence/run-package-path.ts` | `companyId === "coherent"` branch | COMPANY_SPECIFIC_PRODUCTION_RISK |
| `lib/product/legal-intelligence/challenge.ts` | `conmed-demo` special case | COMPANY_SPECIFIC_DEMO |
| `lib/product/covenant-intelligence-loop/orchestrator.ts` | preferIssuer CONMED/CNMD/RIOT defaults | BENCHMARK_PREFERENCE (loop tooling) |

**No evidence rewriting:** historical Phase 2F/3F freeze manifests and acceptance
thresholds were not modified.

## 6. Incomplete packages / amendments / shared baskets

| Scenario | Demonstrated? | Notes |
|---|---|---|
| Incomplete package (missing restatement target) | CORRECT_REFUSAL in OA tests | PROVISIONAL / unresolved succession |
| Partial supersession | Adversarial partial-provision REFUSE | Continuing only with explicit verified refs |
| Shared baskets | Not newly proven on this tip | UNSUPPORTED for authoritative remaining |
| Unfamiliar covenant language | Phase 2F historical gap on colon-style defs / flat SECTION | DANGEROUS_OMISSION (open) |

## 7. Readiness verdict

**`GENERALIZATION_NOT_READY_FOR_PRODUCTION_AUTHORITY`**

Blockers:

1. Independent human review of this audit + Workstream A gate  
2. Residual company-specific production branches (`coherent`, demo paths)  
3. Historical CONMED amendment/guarantee zero-signal gap not closed  
4. No new first-blind unseen package scored on this tip  
5. Production AVAILABLE / trusted identity still BLOCKED (correct)

## 8. Recommended next bounded task

Select one **new** unseen multi-document package under a fresh freeze manifest
(content-blind selection log), run provider-free structural→discovery→OA→
operative-package compile, score with the rubric above, and keep production
authority refused. Do not retune on the package before sealing the blind run.
