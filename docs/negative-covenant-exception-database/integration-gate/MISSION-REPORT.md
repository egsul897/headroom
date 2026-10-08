# NCEDB Current-Head Integration Gate

## SHAs
- Phase 3 start: `1456000040f03faeb2beca3c9f46bc2db91ac960`
- Reported Phase 4: `44685ff410190e3ea67d33bf862a833c6cb3f39c`
- Observed GitHub head at gate start: `7dadd90b9152d9b6a71e243bec2d24f2e1fe0645`
- Actual PR head / ending SHA: `5fb12d4c285c0c44ca1e2ced282fdf34ad898010`
- origin/main: `64e5b5c23d153714a78659c408f3078227084a49`
- merge-base: `9de4e5737166fcec84a35fdc9a3404870549211f`

## Intervening changes (reported Phase 4 → head)
- `5d02b54` NCEDB integration gate: pin ending SHA on tip.
- `f4e3981` NCEDB integration gate: refresh report at current tip after gate commit.
- `a3c6036` NCEDB integration gate: reconcile head, adversarial fail-closed tests, merge report.
- `7dadd90` NCEDB Phase 4: fix strict TypeScript errors breaking Vercel build.

Eval metrics unchanged. Production Permission paths untouched. Fixtures untouched.

## Replayed metrics (at head)
Frozen Gibraltar §7.06: remote 6/6; proviso 2/2; entity 2/2; cross-ref 3/3; incorrect-unconditional 0/16.

Riot §5.02: discovery 4/4; remote 4/4; incorrect-unconditional 0/4.

## Merge readiness
**MERGE_INTACT_AS_NON_PROMOTING_RESEARCH_OVERLAY — merge PR #143 into main as WS-NED research corpus + offline analyzer library; do not enable production Permission ingestion until CKF schema wire-up and human review path exist.**

CKF status: **ALIGNED_FOR_REVIEW**
productionCapacityApproved: **false**
actualPaidSpendUsd: **0**

## Current-head CI
- local tsc: clean
- local NCEDB vitest: 43/43
- Vercel: pass on `5d02b54`
- Vercel Preview Comments: pass

Ending merge tip (finalize stamp): `5fb12d4c285c0c44ca1e2ced282fdf34ad898010`
CI-verified tip (Vercel green): `5d02b54de857a8927eba1cca03794108a636f69b`
