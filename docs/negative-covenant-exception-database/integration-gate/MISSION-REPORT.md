# NCEDB Current-Head Integration Gate

## SHAs
- Phase 3 start: `1456000040f03faeb2beca3c9f46bc2db91ac960`
- Reported Phase 4: `44685ff410190e3ea67d33bf862a833c6cb3f39c`
- Actual PR head: `a3c60363ef5608957b4a6ec7c3dff609c5dd410e`
- origin/main: `64e5b5c23d153714a78659c408f3078227084a49`
- merge-base: `9de4e5737166fcec84a35fdc9a3404870549211f`

## Intervening changes (reported Phase 4 → head)
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
