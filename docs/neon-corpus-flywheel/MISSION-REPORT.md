# Neon Corpus Intelligence Flywheel — Batch 1 Mission Report

## Verdict

**PARTIAL_LIVE_BLOCKED_AUTH — OFFLINE_BATCH1_REMEDIATION_SHIPPED**

Live Neon Stage-1 inventory could not be completed: `DATABASE_URL` authenticates with SQLSTATE `28P01` (password rejected for `neondb_owner`) despite TCP/TLS reachability. Secret refresh was requested via environment setup actions.

Within authorized offline budget, Batch 1 analyzed three authentic packages, independently evidenced two high-severity compiler defects, shipped generalized remediations with regression tests, and selected the next batch.

This run did **not** train any language model. Analyzing documents ≠ model training.

## Repository

| Item | Value |
|---|---|
| Base | `main` @ `7f1dd3a2` (#229/#237 present) |
| Branch | `cursor/neon-corpus-intelligence-flywheel-981a` |
| Tip SHA | `c1bbf861c3cc2a56b1ccdefa6586ee3b42d3abc6` |
| PR | https://github.com/egsul897/headroom/pull/255 |
| Paid inference | **$0** |
| Neon mutations | **0** |
| Auto-merge | **none** |

## Stage 1 — Neon inventory

| Item | Result |
|---|---|
| Live inventory | **BLOCKED** — auth failure `28P01` |
| Read-only script ready | `scripts/neon-corpus-flywheel/inventory.ts` |
| Status artifact | `docs/neon-corpus-flywheel/inventory-status.json` |
| Historical snapshot (not live) | 769 KnowledgeSources / 212 issuers / 48,226 edges / 46,810 exact triple duplicates (from #219/#240 branches) |

Re-run after secret refresh:

```bash
npx tsx scripts/neon-corpus-flywheel/inventory.ts
```

## Stage 2 — Ranked package selection (Batch 1)

| Rank | Package | Role | Completeness |
|---|---|---|---|
| 1 | DSGR 2022–2025 credit facility | Complete CA + amendments + restatement | 4 full extracted docs |
| 2 | CONMED 2025 credit facility | Secured / liens / guarantee-collateral | 5 curated docs (incl. G&C + amendments) |
| 3 | Chewy 2026 credit agreement | RP / Available Amount builder | 1 full CA extract |

**Deferred (no authentic on-disk indenture):** high-yield indenture → Neon `INDENTURE` class after auth restore.

## Stage 3–4 — Deep analysis + compiler challenge

Artifact: `docs/neon-corpus-flywheel/batch1-package-analysis.json`

| Package | Nodes | Definitions | Pass A | Finding |
|---|---:|---:|---:|---|
| DSGR | 2939 | 1142 | 1472 | **DSGR-AA-DEF-SWALLOW** remediated |
| CONMED | 388 | 113 | 193 | **CONMED-MISSING-BASE-UNRESOLVED** correct refusal |
| CHWY | 1210 | 486 | 601 | **CHWY-AA-BUILDER-A-NESTRANK** remediated |

### DSGR-AA-DEF-SWALLOW (HIGH)

- **Evidence:** Available Amount limbs `(i)…(viii)` under §1.01; next term `Availability` @ 33273.
- **Before:** `1.01(viii)` owned `[32777, 196272)` (~163k chars / ~89% of §1.01); later definitions nested underneath.
- **After:** `1.01(viii)` ends at next definition; no post-term children.
- **Root cause:** Clause tree parsed across entire definitions SECTION.
- **Fix:** Per-definition-body clause parsing + soft `charEnd` clip (`findTopLevelDefinitionStarts`).

### CHWY-AA-BUILDER-A-NESTRANK (HIGH)

- **Evidence:** §6.08(a)(3)(a) builder limb with `(A)/(B)` and Specified Event of Default proviso.
- **Before:** `(a)` ended at `(A)`; proviso lost from owning node; `(A)/(B)` `parentNodeId` pointed at `6.08(a)(3)`.
- **After:** `charEnd(a) === charStart(b)`; proviso inside owned text; correct parentage.
- **Root cause:** Ownership stack used clamped `nodeType` RANK (`SUBCLAUSE=4`) for all depth ≥ 3.
- **Fix:** `nestRank = 1 + clause depth`.

### CONMED-MISSING-BASE-UNRESOLVED (correct behavior)

Amendment targeting missing Seventh A&R stays **UNRESOLVED** — fail-closed, not invented.

## Stage 5 — Generalized remediation

| Change | File |
|---|---|
| Definition-body clause scoping + nestRank ownership | `lib/contract-model/compiler/stage-structure.ts` |
| `findTopLevelDefinitionStarts` | `lib/contract-model/compiler/structural-definitions.ts` |
| Regression tests | `tests/neon-corpus-flywheel/definition-body-clause-scope.test.ts` |

**Not weakened:** #229/#237 authority gates; #246 graph dedupe posture (no Neon edge writes).

## Stage 6 — Verification metrics (Batch 1)

| Metric | Value |
|---|---|
| Unique packages analyzed | 3 |
| Unique docs analyzed | 10 |
| Independently verified defects remediated | 2 |
| Correct refusals demonstrated | 1 |
| False favorables introduced | 0 (structural suite 104/104 green) |
| Regression tests added | 5 |
| Paid inference | $0 |
| Neon writes | 0 |

## Next batch (automatic)

1. LSB 2023 ABL — intercreditor complexity / UNRESOLVED ICA  
2. FWRG 2021 — AA / shared-cap ground truth  
3. Riot 2025–2026 — multi-restatement operative state  
4. Gibraltar 2026 — builder basket marker disagreement  
5. Neon indenture holdout — **blocked on DATABASE_URL**

## Reproduce

```bash
npx vitest run tests/neon-corpus-flywheel/
npx tsx scripts/neon-corpus-flywheel/analyze-batch1.ts
# after secret refresh:
npx tsx scripts/neon-corpus-flywheel/inventory.ts
```
