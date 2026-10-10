# PR #293 Human Merge Gate + Round 2 Independent Execution

**Date:** 2026-10-10  
**MAIN_SHA:** `4f1a0b81207364373d9a4cb9fe515d4a1a002e56`  
**PR_293_SHA:** `2e8c9973ac05f729ec5096599c66dd7243d5dba8`  
**Self-merge:** forbidden  

## Task A — Merge gate

| Check | Evidence | Result |
| --- | --- | --- |
| PR state | OPEN, `isDraft=false`, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN` | OK |
| Tip ancestry | headOid == `2e8c9973…` (last verified) | OK |
| Workstreams present | `#283` operative-authority, `#287` body-anchor/manifest, `#282` identity, `#285` executeUnified…, `#290` ingestion/reconstruction, `#291` EVAL evidence | COMPLETE (no omission; no `#246`/`#281`) |
| CI | certified path SUCCESS; Vercel SUCCESS; Preview Comments SUCCESS | GREEN |
| Human review | `reviewDecision=""`, `reviews=[]` | **AWAITING HUMAN APPROVAL** |
| Branch protection API | 403 to this token | UNKNOWN (cannot read; do not bypass) |
| Production activation bypass | `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status=BLOCKED`; classifyProductionAuthority always BLOCKED | NO BYPASS |

**MERGE_GATE_VERDICT: READY** — only outstanding requirement is human approval. Do not self-merge.

Integration readiness ≠ product acceptance (see Round 2).

## Task B — Round 2 execution

Executed: `npx tsx scripts/agent-11/run-round-2-acceptance.ts` on tip `2e8c9973`  
Frozen inputs: `docs/agent-11-e2e-acceptance-round1-frozen/` (byte-identical sealed answers)  
Sealed hash verified: `393facc432182df08dae690e3fc0e751a4c3a410b71c0e7b93a54122915fa1bd`  
Paid inference: $0 · Production Neon writes: none · Sealed answers: unchanged  

Artifacts: `docs/agent-11-round-2-acceptance/`

### Round 1 vs Round 2 scorecard

| Metric | Round 1 | Round 2 | Delta |
| --- | --- | --- | --- |
| Structural recall | 10/10 | 10/10 | = |
| Operative authority | 0/1 | 0/1 | = |
| Legal context SUFFICIENT | 1/10 | 0/10 | −1 |
| Verified executable IR | 0/10 | 0/10 | = |
| Financial completeness | 0/1 | 0/1 | = (module now present; AN financials still absent) |
| Correct refusal | 5/5 | 5/5 | = |
| False favorables | 0/12 | 0/12 | = |

**ROUND_2_EXECUTION_STATUS: EXECUTED**  
**FALSE_FAVORABLE_COUNT: 0**  
**Product usefulness:** not established — zero false favorables with near-zero affirmative verified execution.

## Task C — Root-cause clusters

| Cluster | Earliest stage | Symptom | Shared cause | Cases |
| --- | --- | --- | --- | --- |
| **RC1 Instrument / restatement identity** | 1–2 Document/package identity → 2 Operative amendment authority | Operative doc not doc-b; `#283` doc-b `REVIEW_REQUIRED`, predecessor=null; package-graph RESTATES UNRESOLVED; instruments split | AN Fifth uses defined-term “Existing Credit Agreement” → Fourth A&R (2023-07-18) **out of package**; extractors require in-text name+date prior match + operative restatement patterns that miss AN WHEREAS/NOW THEREFORE/Article V form | Operative 0/1; blocks production path for all doc-b clauses |
| **RC2 Recursive context budget / unresolved defs** | 4 Recursive legal context | 0/10 SUFFICIENT; 6× BUDGET_EXCEEDED, 4× REVIEW_REQUIRED; high unresolvedDependency counts | Definition closure + text budget on large AN HTML extracts; `#287` converted silent truncation to explicit BUDGET_EXCEEDED/REVIEW_REQUIRED (correct fail-closed) but lost the single R1 SUFFICIENT | All 10 GT clauses for affirmative context |
| **RC3 Deterministic-only IR** | 5 Covenant IR compilation | 0/10 verified executable | No paid Pass B / independent fidelity; `DETERMINISTIC_ONLY` local compile cannot claim VERIFIED_EXECUTABLE | All affirmative capacity claims |
| **RC4 Missing AN financial + utilization corpus** | 6–7 Financial / utilization | Financial completeness 0/1 | `#290` pathway present; no authenticated AutoNation financial package or attributed history attached to acceptance fixture | Production capacity track (correctly refused) |
| **RC5 Identity/issuer activation** | 8 Identity authorization | Production authority BLOCKED | By design — no production IdP | All PRODUCTION_AUTHORITY attempts |

Upstream-first: RC1 blocks trustworthy operative selection; RC2/RC3 block affirmative legal→IR; RC4/RC5 correctly refuse production.

## Task D — Top 3 remediations

### 1. AN restatement evidence + instrument consolidation (highest unblock)

- **Root cause:** RC1  
- **Code path:** `lib/contract-model/compiler/package-graph/*` prior-agreement resolution; `lib/contract-model/compiler/operative-authority/restatement-evidence.ts` (caption/WHEREAS/defined-term “Existing Credit Agreement” + dated Fourth A&R; NOW THEREFORE + Article V CP)  
- **Affected cases:** operative 0/1; all doc-b clauses’ authorityStatus  
- **Minimal fix:** Recognize defined-term prior-agreement bindings and AN recital forms; optionally allow out-of-package predecessor **label** without inventing missing Fourth A&R text; keep package-graph non-mutation + CP NOT_INDEPENDENTLY_PROVEN  
- **Regression test:** Extend WOR-style test with AN sealed extracts expecting `OPERATIVE_AUTHORITY_CONFIRMED` + WITH_CAVEATS for CP  
- **Expected improvement:** Operative accuracy 0/1 → 1/1 (caveated); enables correct governing-doc probes  
- **Fail-closed risk:** Low if CP caveat + out-of-package prior remain explicit; **high** if Fourth A&R contents are fabricated

### 2. Context budget / definition-priority for large A&R packages

- **Root cause:** RC2  
- **Code path:** `lib/contract-model/compiler/context-retrieval/{pipeline,manifest,definition-graph,body-anchor}.ts`  
- **Affected cases:** 10/10 context probes (restore ≥1 SUFFICIENT; reduce BUDGET_EXCEEDED)  
- **Minimal fix:** Priority-aware continuation already partially in `#287` — tune AN-scale budgets / required-definition-first packing without promoting REVIEW_REQUIRED→SUFFICIENT  
- **Regression test:** Pin AN Round 2 clause sufficiency distribution; forbid false SUFFICIENT  
- **Expected improvement:** Context SUFFICIENT 0/10 → ≥1–3/10 without false SUFFICIENT  
- **Fail-closed risk:** Medium if budgets raised blindly; keep manifest stopReasons

### 3. Attach authenticated AN financial+utilization acceptance corpus (not synthetic zeros)

- **Root cause:** RC4  
- **Code path:** `lib/capacity/financial-statement-ingestion.ts`, `utilization-evidence-reconstruction.ts` + new fixture under `tests/fixtures/financial-utilization-evidence/an-…`  
- **Affected cases:** financial completeness 0/1; production track remains refusal until cert+IdP  
- **Minimal fix:** Seal authentic AN period metrics + attributed events; wire into Round 2 harness; keep UNKNOWN≠zero  
- **Regression test:** Slice test mirroring Matthews; acceptance metric can move only with sealed financial answers  
- **Expected improvement:** Financial completeness 0/1 → 1/1 for evidence presence (production authority still BLOCKED without IdP)  
- **Fail-closed risk:** Low if authenticity/verification statuses honest; **high** if incomplete history treated as zero

*Do not implement before these failing evidences are accepted — this document records the plan only.*

## Task E — Neon persistence gaps

Round 2 artifacts today are **filesystem JSON** under `docs/agent-11-round-2-acceptance/` + fixture texts. They are reconstructible from git + evaluator, not from Neon.

| Domain | Durable Postgres path today | Gap |
| --- | --- | --- |
| Verified legal context | No first-class ContextCompletenessManifest table | Manifest only in compiler memory / offline JSON |
| Executable IR | Contract-model / compiler tables exist for some runs; acceptance IR not persisted | No AN verified-unit rows from Round 2 |
| Financial evidence | Financial snapshot models exist; `#290` normalizes to Agent #2 contract | No AN authenticated snapshot loaded |
| Utilization | Utilization evidence records / completeness certs | No AN attributed history persisted |
| Capacity in/out | Verified execution packages ephemeral in acceptance | No shared trace identity stored for AN Round 2 |
| Acceptance traces | Docs/git only | No `acceptance_run` / scorecard tables |

**Constraint:** Do not write production Neon; do not create a competing store. Optional future: disposable EVAL DB (pattern `#291`) for acceptance-run rows only.

## Production authority

**BLOCKED** — IdP absent; operative unresolved; financial/utilization incomplete; false favorables 0.

## Next human action

1. **Approve & merge #293** (integration READY; human approval only).  
2. Authorize remediation #1 (AN restatement extractors) as first engineering task.  
3. Do not declare product acceptance from Round 2 scores.
