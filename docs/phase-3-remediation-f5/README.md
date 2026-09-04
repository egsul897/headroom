# Phase 3 Chewy Remediation 4: F-5 Pass A semantic inventory instability

Starting SHA `01a69147629e720fba51ef8c743e62fc52c7e257`. Zero paid calls made.

## Diagnosis (frozen evidence, $0)

The two recorded Pass A runs over Chewy 6.08 (288 vs 307 items; strict
0.19, semantic 0.45, critical/material 0.46) covered the same source
(span-coverage stability 0.90) and every number (1.0). Of 401 run-only
items, 233 are granularity splits/merges, 60 dependency fragmentation, 46
role relabels, 40 identity/boundary drift, and 22 true omissions, every one
disclosed by the other run's coverage gap. The instability is the model's
free decomposition of a 38k-char unit in one call, a gap pass over
run-specific fragments, identity hashed from excerpt boundaries, and no
canonicalization. Re-keying the frozen items alone lifts strict stability
only to 0.38, so post-processing cannot fix it by itself.

## Remediation (generic, agreement-independent)

- Deterministic source slots before any call (structural node own-text
  split at independent segment bounds), batched into bounded calls with
  read-only enclosing context.
- Identity anchored to slot + coordination sub-index + role + values; same
  proposition merges, distinct propositions never do.
- Gap pass re-presents whole slots, never fragments.

## Paid validation

Not executed: gateway balance $0.54 is below the $4.89 pair estimate. The
guarded harness `scripts/f5-pass-a-stability-run.ts` aborted before any
call. Verdict: **F5_NOT_CLOSED** (remediation committed, validation pending
funds).

## Artifacts

| File | Content |
|---|---|
| 00-structural-nodes-608.json | 6.08 node hierarchy in region coordinates |
| 01-frozen-alignment/decomposition/metrics.json | alignment of the two frozen runs, A-I classes, metrics |
| 02-identity-scheme-experiment.json | zero-cost identity schemes over the frozen items |
| 03-frozen-rekeyed-v4.json, 03-rekeyed-*.json | frozen runs through v4 post-processing, re-measured |
| 04-reference-recall-*.json | recall against the frozen 6.08 reference subset |
| 05-root-cause.json | implementation trace and proven root cause |
| 06-same-root-zero-cost-regression.json | 33 recorded inventories re-keyed |
| 07-paid-run-precheck.json | balance/cap precheck record (ABORT) |
| 08-remediation-and-results.json | remediation, measurements, verdict |

## 09 - Certification attempt 1 (paid validation only, production frozen)

`09-certification-attempt-1.json`. Freeze check PASSED at `16e82c7b15b226aa28cd0eabac4bcccdd6768c29` (HEAD == starting SHA,
clean tree, frozen 6.08 source/unit/reference blobs unchanged, slot partition 335 slots / 7 batches byte-identical across
two invocations and matching record 03). Budget precheck: gateway balance $0.544536 vs pair upper bound $4.89 under the
$8.00 cap. Decision: ABORT before any call. **Zero paid calls. Verdict: F5_CERTIFICATION_ENVIRONMENT_BLOCKED.** No
stability or recall metrics were computed because no new inventories exist. Resume steps are listed in the artifact.
