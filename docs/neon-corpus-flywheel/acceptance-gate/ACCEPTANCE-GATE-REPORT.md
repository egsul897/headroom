# Flywheel Batch 1 — Independent Acceptance Gate Report

## Verdict

**FLYWHEEL_BATCH1_STRUCTURE_GATE_PASSED**

Structural remediations validated under Gates 1–4. Additive port onto canonical tip filed as #259. Neon live inventory remains credential-blocked (`28P01`). No auto-merge. No certification promotion.

## 1. Starting and ending SHAs

| Role | SHA |
|---|---|
| Audited source HEAD (#255) | `ded25fdc943cca6d23bb934e14f2776ac684e607` |
| Pre-remediation main base | `7f1dd3a202b026b9a862ef727480a1a9f284523a` |
| Typecheck fix (CI green) | `a8dc036261c11228d218bdeef6bfb059e83bd97e` |
| Acceptance-gate tip (#255) | `a66ddba4cf3e2b9be5d20359adf2b83558c64024` |
| Canonical port tip (#259 onto #253) | `697111a81ec22a592178d7c0542eb646ee273d79` |
| #253 tip at port time | `e46dd9ea762b52f085c26c6784245972c2bad750` |
| #250 tip at reconcile time | `37fc3ee50412572d48823c613bfb18f3c1c654cd` (updated; still no structure-file overlap) |

## 2. Exact GitHub CI results

### Audited SHA `ded25fdc` — FAILURE (typecheck)

All five workflows failed on `scripts/neon-corpus-flywheel/analyze-batch1.ts` TS7034/TS7005 (`allDefs` implicit `any[]`). Vercel deployment failed for the same compile break.

### Post-fix SHA `a8dc0362` — SUCCESS

| Check | Result |
|---|---|
| certified path (provider-free) / canonical-compiler | **SUCCESS** |
| dashboard invent-absence (soft gate) | **SUCCESS** |
| feeds invent-absence (soft gate) | **SUCCESS** |
| home overview (soft gate) | **SUCCESS** |
| P3-R0 carry-forward and supersession (soft gate) | **SUCCESS** |
| Vercel | **SUCCESS** (“Deployment has completed”) |
| Vercel Preview Comments | **SUCCESS** |

Local verification on acceptance tip:
- `npx tsc --noEmit` — clean (on flywheel branch)
- `npx next build` — succeeded
- `npx vitest run tests/neon-corpus-flywheel/` — **36/36**
- Phase 3 certified + verified-execution — **337/337**

Vercel investigation: failure at `ded25fdc` was the typecheck cascade; CLI inspect requires Vercel login (not available). After typed `DetectedDefinition[]` / `DetectedReference[]` fix, Vercel status flipped to success on `a8dc0362`.

## 3. Structural ERROR findings before vs after

Source: `before-after-health.json` (worktree parse at `7f1dd3a2` vs HEAD).

| Metric | Before | After |
|---|---:|---:|
| ERROR findings (all audited docs) | **0** | **0** |
| Δ ERROR | | **0** |

No ERROR-class identity regressions. Deterministic fingerprint deltas (expected from remediations):

| Package doc | added | removed | parentageChanged |
|---|---:|---:|---:|
| DSGR doc-d | 116 | 128 | 3 |
| CHWY full CA | 393 | 315 | 18 |
| CONMED (most) | 0 | 0 | 0 |
| LSB holdout | 0 | 0 | 0 |

Notable removed (false hierarchy): `1.01(viii)|…|32777|196272` → after `…|32777|33273`.  
LSB holdout unchanged — fixes do not disturb non-target packages.

## 4. Definition-boundary precision and recall

Adversarial suite: `definition-boundary-adversarial.test.ts` (10/10).

Frozen independent synthetic corpus (Available Amount / Availability / Bail-In Action):

| Metric | Value |
|---|---:|
| Precision | **1.0** |
| Recall | **1.0** |
| FP | 0 |
| FN | 0 |

Cases covered: interior quoted refs, nested provisos, non-definition colon prose, multiline terms, enumerated bodies, no-enumeration terms, Article-only context (scanner finds starts; SECTION scoping documented limit), repeated/malformed labels.

## 5. DSGR and Chewy ownership evidence

### DSGR Available Amount
- Limbs `(i)`–`(viii)` each start with their marker, end ≤ `Availability` @ 33273
- Last limb span < 8,000 chars (was ~163k)
- Pass A candidates on AA limbs cite owning `nodeId` / `sectionRef`

### Chewy builder `(a)`
- `parentNodeId` of `(A)`/`(B)` = builder `(a)`
- `charEnd(a) === charStart(b)`
- `getNodeText(a, "DESCENDANTS")` contains Specified Event of Default proviso
- Pass A on `(a)` uses **OWN** (excludes children) — proviso not in OWN; child `(B)` has Pass A signals including exception markers
- **Not claimed as verified executable rule**

### CONMED
- Unresolved package-graph edges retain `targetDocumentId: null` (missing-base refusal)

## 6. Physical identity and ambiguity

Across DSGR/Chewy/CONMED/LSB holdout:
- All physical `nodeId` values unique
- Parent-child containment holds wherever nodes exist
- Spans satisfy `0 ≤ charStart < charEnd ≤ text.length`
- Duplicate `sectionRef` → `resolveUniqueNodeByRef` returns **AMBIGUOUS** (never arbitrary UNIQUE)
- No `DUPLICATE_OCCURRENCE_ID` / `INVALID_SOURCE_SPAN` / `CROSS_DOCUMENT_PARENT` / `CYCLE` ERRORs

## 7. Downstream discovery and interpretation effects

| Effect | Status |
|---|---|
| Pass A citations on remapped AA limbs | Correct `nodeId`/`sectionRef` |
| Chewy proviso discoverable | Via DESCENDANTS / child `(B)` Pass A — **not** via OWN of `(a)` |
| Verified executable rule promotion | **None** — hierarchy ≠ certification |
| Authority / utilization gates (#229/#237) | Untouched |

## 8. Canonical integration disposition

| Item | Disposition |
|---|---|
| Designated candidate | **#253** (`cursor/canonical-integrated-product-10ff` @ `e46dd9ea`) |
| #250 structural overlap | **None** (no commits touching structure files) |
| Port PR | **#259** — additive only (`697111a8`) |
| #255 | Remains acceptance-gate / inventory / analysis home |

Do not merge #255 wholesale into #253 (would drag inventory tooling). Prefer #259 for structural integration.

## 9. Neon authentication and inventory status

| Item | Status |
|---|---|
| SQLSTATE | **28P01** (credential blocker) |
| Mutations | 0 |
| Secrets exposed | none |
| Live inventory | blocked — `npm run flywheel:inventory` ready |
| Historical counts | preserved in `inventory-status.json` with explicit provenance |
| #246 coordination | no edge writes; duplicate accounting deferred until RO inventory |

## 10. Remaining blockers and next executable action

1. **Neon `DATABASE_URL` refresh** — unblock live RO inventory + indenture holdout  
2. **Human review / merge #259** into #253 (or main after #253 lands) — no auto-merge  
3. **Batch 2 falsification holdout: LSB** — frozen fixtures already in Gate 3/4; expand operative/discovery expectations before full planned batch  
4. Optional follow-up: Pass A OWN vs DESCENDANTS for builder provisos (documented gap; not a structural-span defect)

## Reproduce

```bash
npx tsc --noEmit
npx vitest run tests/neon-corpus-flywheel/
npx vitest run tests/contract-model/certified tests/contract-model/verified-execution.test.ts
npx tsx scripts/neon-corpus-flywheel/before-after-health.ts
```
