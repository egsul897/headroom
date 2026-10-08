# Covenant Dependency Atlas — Phase 4 Mission Report

**PR:** #140 (draft, do not merge)  
**Starting SHA (observed GitHub head):** `9c6f56c810fef1fdaa985155163c96560c2bae00`  
**Reported Phase 3 SHA:** `3a41dbfd34835689a301075a0bbfb43b3c46cfc6`  
**Phase 4 content commit:** `fadb09ae6afe671aae850005afe78439eca8df0f`  
**Paid inference / merges / certification / Knife River inspection:** none  

## SHA drift

After reported Phase 3 tip `3a41dbf`, only `9c6f56c` (TS2367 Vercel fix). Phase 4 had not begun; improvements preserved.

## Frozen benchmark

135-edge Phase-3 independent GT frozen (`independent-ground-truth-phase3.FROZEN.json` + sha256). No Knife River tuning. No eval relabeling without source evidence.

## Results (headline)

| Metric | Phase 3 reported | Phase 4 |
|--------|------------------|---------|
| Overall recall (corrected harness) | 0.689 | **0.933** (126/135) |
| Evaluation recall | 0.587 | **0.848** (39/46) |
| Blind recall | — | **0.953** (41/43) |
| Development recall | — | **1.000** (46/46) |
| Independent precision (resolved claims) | n/a (GT-hit proxy) | **1.00** (77 TP / 0 FP; Wilson 0.952–1.00); +64 fail-closed OK; 11 ambiguous |
| Legal-safety probes | — | 7/7 pass; **0** affirmative permission |
| CKF 113-doc corpus | — | **BLOCKED** (not materialized locally); Atlas KF idempotent import still demonstrated |

Full artifacts under `docs/covenant-dependency-atlas/phase-4/`.
