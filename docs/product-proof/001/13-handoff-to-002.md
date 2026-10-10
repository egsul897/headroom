# Product Proof 001 → 002 Handoff (FAILURE INVESTIGATION CLOSED)

**Status:** FROZEN — Product Proof 001 investigation closed.  
**Accepted first hard failure:** `GENERALIZED_RULE_REPRESENTATION` → `BLOCKED`  
**Handoff owner:** Product Proof 002  
**Handoff frozen at tip:** `0cd1f2af657f4b799e7e06c48a2e15eb1a4d9954` (branch `cursor/product-proof-001-first-fail-8970`)  
**Original main probe SHA:** `7f1dd3a202b026b9a862ef727480a1a9f284523a`  
**PR (evidence only; do not expand):** https://github.com/egsul897/headroom/pull/264  

Do **not** attempt a parallel compiler implementation from this handoff.  
Do **not** expand PR #264 scope.  
Do **not** hardcode MTN rules, silently substitute synthetic data, or promote unsupported results to CERTIFIED.  
No auto-merge · no Neon mutations · no unauthorized paid inference.

---

## 1. Exact failure boundary

| Field | Value |
|---|---|
| First SUCCESS | `SOURCE_DOCUMENTS` |
| First hard BLOCKED | **`GENERALIZED_RULE_REPRESENTATION`** |
| Failure register | `F01` (`09-failure-register.md`) |
| Pin doc | `12-first-pipeline-failure.md` |
| Entry point that cannot be productively entered for MTN | `lib/contract-model/compiler/semantic/compile.ts#compileCovenantToIR` |
| Immediate consequence | `VERIFICATION` BLOCKED → empty VEP → capacity/sim REFUSED under REQUIRE |
| Not the hard break | Discovery `PARTIAL` (Pass B empty / unpaid) — substrate exists; executable IR does not |

**Pipeline freeze table** (from re-run summary):

```
SOURCE_DOCUMENTS:SUCCESS
STRUCTURAL_INDEX:SUCCESS
COVENANT_DISCOVERY:PARTIAL
MULTI_DOCUMENT_GRAPH:SUCCESS
DEFINITION_RESOLUTION:SUCCESS
AMENDMENT_PRECEDENCE:PARTIAL
GENERALIZED_RULE_REPRESENTATION:BLOCKED   ← boundary
VERIFICATION:BLOCKED
FINANCIAL_UTILIZATION_BINDING:PARTIAL
CAPACITY_ENGINE:BLOCKED
TRANSACTION_SIMULATION:BLOCKED
CUSTOMER_FACING_ANSWER:UNSUPPORTED
```

Reproduce (read-only; no Neon writes):

```bash
npx tsx scripts/product-proof/run-001-mtn-pipeline.ts
```

---

## 2. Authentic package (inputs PP002 must keep)

| Item | Location |
|---|---|
| Manifest | `docs/product-proof/001/01-source-manifest.json` |
| Frozen questions A–I | `docs/product-proof/001/02-frozen-challenge.md` |
| Extracted texts | `docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/extracted-text/` |
| Doc A hash | `2715a533797827d353cbcb61ba22d7c504a08597efbc531a26975370485db3a0` |
| Doc B hash | `2fe0d69c1a697e8bb02684c621f89b9f74ae5c8a3e0ff27247288be8605d26ba` |
| Doc C hash | `065a5846596ed8302cae1a58f19a4304210f2cd92a686b11a5b5b34c457a593f` |
| Doc D hash | `39fed75a50f3a1e7c9b9f951877245beba4030d22e2e26d74490e56abfba6d41` |
| Independent legal reference | `docs/product-proof/001/04-independent-legal-reference.md` |

Issuer: Vail Resorts (MTN) / CIK `0000812011`. Zero prior fixture/golden/demo tuning claimed in manifest.

---

## 3. Authentic discovery outputs (frozen)

| Artifact | Path | Contents |
|---|---|---|
| Pass A | `artifacts/stage-02-discovery-pass-a.json` | **810** candidates (Doc A 258 / B 277 / C 275 / D 0) |
| KF families Doc A | `artifacts/stage-02-kf-family-candidates-doc-a.json` | **25** candidates; SECTION 10 `LIENS` (+), SECTION 11 financial/ratio; some INDEBTEDNESS noise |
| Synthetic Pass B | `artifacts/stage-02-discovery-pipeline-synthetic.json` | Empty / non-competitive (no paid keys) |
| Structural index | `artifacts/stage-01-structural-index-summary.json` | Doc A: 459 nodes, 11 defs detected, 497 refs / 53 resolved |
| Package graph | `artifacts/stage-03-package-graph.json` | CA + 2 indentures + UNKNOWN 10-K; **0** relationships |
| Amendment | `artifacts/stage-05-amendment-pipeline.json` | 0 effects |
| Run summary | `artifacts/pipeline-execution-summary.json` | Full stage records |

**Important:** Pass A / KF outputs are **discovery substrate**, not CERTIFIED units and not executable IR.

---

## 4. Definition anchors (frozen)

Source: `artifacts/stage-04-definition-resolution-probe.json`  
Method: structural definitions + literal `X means` probe (recursive Phase 2D context-bundle **not** wired as issuer-agnostic CLI for MTN).

| Term | Anchor found | Doc A charStart (approx) |
|---|---|---:|
| Permitted Debt | yes | 92500 |
| Permitted Liens | yes | 97375 |
| Adjusted EBITDA | yes | 12700 |
| Net Funded Debt | yes | 83912 |
| Restricted Company | yes | 108729 |
| Maximum Facility Amount | yes | 82910 |
| Facility Amount | yes | 60609 |
| Secured Debt | yes | 118111 |
| Threshold Amount | yes | 128410 |

**9/9** probed terms anchored. Basket-clause graph resolution into compile inputs was **not** completed.

Also extracted slices (human-readable, not IR):

- `sources/.../extracted-text/definition-permitted-debt.txt`
- `sources/.../extracted-text/definition-permitted-liens.txt`
- `sources/.../extracted-text/section-10-11-negative-financial.txt`

---

## 5. Existing compiler / verification entry points (do not reinvent)

Use these production modules; diagnose wiring/adequacy — do not fork a parallel compiler.

| Stage | Entry point |
|---|---|
| Structure | `lib/contract-model/compiler/stage-structure.ts` → `parseDocumentStructure` |
| Structural index | `lib/contract-model/compiler/structural-index.ts` → `buildStructuralIndex` |
| Discovery | `lib/contract-model/compiler/discovery/pipeline.ts` → `runDiscoveryPipeline` |
| Pass A signals | `lib/contract-model/compiler/discovery/pass-a-signals.ts` → `runPassADeterministicSignals` |
| KF candidates | `lib/knowledge-factory/pipeline/candidates.ts` → `discoverCovenantCandidates` |
| Context / defs | `lib/contract-model/compiler/context-retrieval/pipeline.ts` → `buildCovenantContextBundle` |
| **Compile (boundary)** | **`lib/contract-model/compiler/semantic/compile.ts` → `compileCovenantToIR`** |
| Precedent compile | `lib/contract-model/compiler/semantic/precedent-integration.ts` → `compileCovenantToIRWithPrecedent` |
| Verify | `lib/contract-model/compiler/semantic-verification/verify.ts` → `verifyCompiledCandidate` |
| Certify | `lib/contract-model/phase3-certification/certify.ts` → `certifyCandidate` |
| VEP adapter | `lib/contract-model/phase3-certification/phase4-adapter.ts` → `certifiedMapToVerifiedExecutionPackage` |
| Capacity / sim | `lib/contract-model/verified-execution.ts` → `evaluateVerifiedCapacity` / `simulateVerifiedTransaction` (REQUIRE) |
| Utilization authority | `lib/capacity/utilization-authority.ts` / `utilization-resolver.ts` / `verified-remaining.ts` |

PP001 probe script (orchestration reference only): `scripts/product-proof/run-001-mtn-pipeline.ts`.

---

## 6. Available sealed / derived rule units (non-MTN)

**There is no sealed CERTIFIED IR / VerifiedExecutionPackage for MTN.**

Available elsewhere (must **not** be silently substituted as MTN truth):

| Kind | Location | Caveat |
|---|---|---|
| Acceptance-derived VEPs | `docs/product/customer-workflow/acceptance-certified-vep/` (`pkg-a`, `pkg-c`, `pkg-j`, `pkg-n`) | Fixture/acceptance packages; `authenticLiveCertifiedClaimed: false` |
| CONMED authenticated VEP | `docs/product/customer-workflow/authenticated-vep/verified-execution-package.json` | Different issuer; capacity still REFUSED on missing companions / cross-rule gates |
| Product-acceptance CERTIFIED candidates | product-acceptance manifests / sealed runs | Not MTN; not a substitute for authentic MTN compile |

Using these as stand-ins for MTN executable rules is **out of bounds** for PP002.

---

## 7. Missing dependencies at the boundary

| Dependency | Status at PP001 freeze |
|---|---|
| Paid / real Pass B semantic discovery | **Unavailable** (unauthorized; synthetic empty) |
| Sealed MTN CERTIFIED units / VEP | **Missing** |
| Issuer-agnostic compile orchestration from Pass A/KF → `compileCovenantToIR` inputs | **Not demonstrated** on main for this package |
| Recursive definition / basket context bundle for new issuer CLI | **Not wired** for MTN |
| Attributed utilization ledger + completeness certificate | **Missing** (empty → UNKNOWN; correct fail-closed) |
| Security Documents / intercreditor | **Absent** from frozen package (disclosed) |
| Prior CA generations (Ninth A&R etc.) | **Absent** |
| Neon-backed Position / Simulate / Ask for MTN | **Unsupported** under Neon write ban |

---

## 8. Product Proof 002 diagnostic mandate

PP002 must determine whether the failure is primarily:

1. **Missing orchestration** between existing components; or  
2. **Inadequate clause extraction or definition resolution**; or  
3. **Insufficient generalized IR expressiveness**; or  
4. **Unavailable paid semantic inference**; or  
5. **A combination** of the above.

### Required PP002 methods

- Authentic-document demonstration (this frozen MTN package or another equally unseen authentic package — no fixture swap pretending to be MTN).  
- Independent legal verification (extend / challenge `04-independent-legal-reference.md`; do not treat engine output as truth).  
- Classify the failure into 1–5 with evidence at the boundary above.

### Forbidden

- Hardcoding MTN rules / capacityFormulas into product code  
- Silent synthetic Pass B / synthetic IR treated as competitive discovery or CERTIFIED  
- Promoting unsupported / REVIEW / incomplete artifacts to CERTIFIED  
- Parallel compiler implementation as a shortcut  
- Expanding PR #264  
- Auto-merge · Neon mutations · unauthorized paid inference  

---

## 9. Suggested PP002 starting checklist

1. Read this handoff + `12-first-pipeline-failure.md` + `09-failure-register.md`.  
2. Load frozen Pass A / KF / definition-anchor artifacts without regenerating truth.  
3. Trace what `compileCovenantToIR` actually requires (`SemanticCompilerInput`, inventory, context bundle) vs what PP001 produced.  
4. Attempt the **smallest honest** authentic-document path that either (a) produces a proposed IR with disclosed status, or (b) fails with a precise classified reason in {1–5}.  
5. Independently verify any claimed permission against `04-independent-legal-reference.md` / source text.  
6. Record verdict under `docs/product-proof/002/` (new owner workspace).

---

## 10. PP001 stop statement

Product Proof 001 work **stops here**. Evidence is frozen under `docs/product-proof/001/`. Ownership of the failure boundary transfers to Product Proof 002.
