# Gap → customer-ready roadmap (five highest-impact tasks)

Ordered by unblocking authentic multi-domain transaction answers without inventing evidence.  
**No self-merge.** Human merges only, one absorb tip at a time.

---

## Task 1 — Land a single post-#334 NS-4 absorb tip (financial identity)

**Why highest impact:** Without one APPROVED financial identity on main, verified remaining and Simulate cannot share a trusted snapshot; open PRs currently fork Dashboard/Simulate/resolvers.

| Item | Exact target |
|---|---|
| Files | `lib/product/financial-metric-resolver*` (from #335/#339/#345), `lib/financial-certificate-engine/**`, `app/[companyId]/dashboard/**`, `components/DashboardClient.tsx`, NS-4 store/cutoff modules from #334 |
| Tests | `tests/product/cfo-workflow-access-integration.test.ts`; NS-4 e2e / acquisition-invalidation suites carried by #345/#343; adversarial APPROVED-vs-provisional cases from #339 |
| PR sequence | Human merge **#345** (preferred) *or* **#343** — **not both**. Close #335/#336/#339/#342 as superseded. |
| Acceptance | One production financial resolver; provisional never labeled APPROVED; GET dashboard no-write; gross ≠ verified remaining; #333 PAI protections preserved |

---

## Task 2 — Cross-domain Simulate with canonical verified-remaining authority

**Why:** Debt-funded acquisition requires debt + lien (+ investment) conjunction without double-counting shared caps or treating modeled leaf as AVAILABLE.

| Item | Exact target |
|---|---|
| Files | Cross-domain module from **#340** (`cross-domain-transaction.v2`); `lib/capacity` `computeVerifiedRemaining` / `mayPublishAvailable`; Simulate handoff in `lib/product/unified-position/*` |
| Tests | #340 adversarial suite (forged cert/issuer/ledger/identity; shared-cap double-count; PARTIAL/UNSUPPORTED non-clear; Coherent≠Matthews path) |
| PR sequence | After Task 1 tip is on main → merge **#340** → delete competing v1 modules from #336/#342 remnants |
| Acceptance | Simulate passes `utilizationAuthority` only when independently authenticated; `allowSyntheticRemaining` cannot publish AVAILABLE; secured dual-path requires explicit companion discharge |

---

## Task 3 — Authentic utilization completeness + trusted-issuer path (Matthews first)

**Why:** Historical utilization is the hard `BLOCKED_BY_MISSING_REAL_EVIDENCE` domain. Modeled 521.118 cannot become remaining without a real completeness certificate.

| Item | Exact target |
|---|---|
| Files | `tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json` (evidence only — do not invent cert); `lib/capacity/trusted-issuer-host.ts`; `lib/capacity/verified-input-contract.ts`; `lib/product/verified-transaction-execution/adapters/utilization.ts`; NS-4 certificate propose/approve from Task 1 |
| Tests | `tests/product/real-dashboard-vertical-slice*.test.ts` (remaining still null without cert); new test: completeness cert present → `mayPublishAvailable` only when issuer ACTIVE; UNKNOWN history still blocks if unacknowledged |
| PR sequence | Design-partner / reviewer-supplied completeness certificate artifact → small PR binding cert to Matthews handoff **without** UNKNOWN→zero |
| Acceptance | With cert + ACTIVE issuer: remaining may publish for attributed baskets only. Without cert: remaining stays null (current behavior locked). No synthetic Coherent substitution. |

---

## Task 4 — Rebase AFC / contractual EBITDA→leverage onto the absorb tip

**Why:** Applicable financial covenants are only partially executable; open AFC cluster (#322/#325/#327/#338/#341/#344) is conflicting and must not fork a second engine.

| Item | Exact target |
|---|---|
| Files | `lib/product/contractual-leverage/**` (from #341), `lib/contract-model/runtime/input/conditional-path-authority.ts`, `lib/contract-model/runtime/leverage-ratio.ts`, `components/ContractualLeveragePanel.tsx` |
| Tests | `tests/product/canonical-financial-path-acceptance.test.ts`; `tests/contract-model/runtime/input/conditional-fulfillment-adversarial.test.ts`; held-out oracles under `tests/autonomous-financial-computation/` |
| PR sequence | Rebase **#341** onto Task 1+2 tip → close #322/#325/#327/#337/#338/#344 as superseded forks |
| Acceptance | PATH_IRRELEVANT requires live IF re-evaluation (not content-hash seals); SAFE_BOUND ≠ EXACT; FIXED_POINT EBITDA; supersession invalidates leverage artifacts |

---

## Task 5 — Phase-3 certify CONMED (or next) RP / Inv / Asset Sale candidates → real VEP

**Why (updated after PR #349 remediation):** Fidelity-pass + hypo-gross CONMED candidates exist (`PARTIALLY_EXECUTABLE`). False CERTIFIED_4E promotion was removed. Customer-ready E2E still needs **real** Phase-3 `VerifiedUnitArtifact` evidence, amendment attachment, provenance resolution (Inv/AS PARTIAL), APPROVED CTA, and utilization completeness — not fabricated verification.

| Item | Exact target |
|---|---|
| Files | `lib/product/authentic-multi-family/*` (bind only real Phase-3 artifacts); Phase-3 semantic verification pipeline; CONMED Omnibus/Second Amendment operative-state attach; greater-of provenance excerpt binding |
| Tests | Keep `authentic-multi-family-certification-integrity.adversarial.test.ts` green; add Phase-3 evidence fixture tests that refuse forged `VERIFIED_NO_MATERIAL_GAP_FOUND`; re-run PP003 |
| PR sequence | After Tasks 1–4 authority stack is stable → Phase-3 certify package → bind VEP only with verified identity → re-run PP003 |
| Acceptance | `CERTIFIED_4E` only with real Phase-3 evidence; eligible CANDIDATE path required before simulate; remaining null until completeness; never fabricate SemanticVerificationResult |

---

## Explicit non-goals (still)

- Self-merge of any integration PR  
- Treating Coherent / Stage-D synthetic demos as customer proof  
- Competing capacity engines beside `evaluateVerifiedCapacity` / `simulateVerifiedTransaction` / leaf `evaluateProvision`  
- Publishing AVAILABLE remaining from UNKNOWN utilization
