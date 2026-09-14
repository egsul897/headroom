# Phase 3 Chewy canary - F-7B.3: Stage 2 completion, stopped at the pre-run cost bound

Starting SHA `1660817cef85ebe70888185b0248e56d1297616d`. **Paid model calls: 0. New Stage-2 cost: $0.00.**
Verdict: **F7B_3_COST_BOUND_BEFORE_START**.

## 1. The baseline is valid (`00`)

Every §1 check passes, so the stop is a cost decision, not a baseline failure.

| check | result |
|---|---|
| starting SHA | matches |
| plan hash | `67d9f086341b4677ca35697fcfb6878cb88ef92b9c0418ea32be96be741cfe36` |
| shards | 36 |
| material item ownership | 108 items, each owned once, 0 unowned, 0 multiply owned |
| frozen Pass A inventory | unchanged, 108 material items |
| source context | `COMPLETE_LOCAL_SOURCE`, region hash unchanged |
| budget, model, provider, prompt and planner generation | unchanged |
| frozen paid Stage-1 results | 5, every shard id and hash matching the plan |
| remaining shards | exactly 31 |

The remaining-31 manifest is recorded in plan ordinal order with source chars, rendered first-turn tokens, owned units,
owned inventory items, owned material items, quantitative items, context entries and chars, unresolved context,
oversized status and estimated output burden. The five Stage-1 shards were read from their own evidence directory and
were not re-executed, regenerated or replaced.

## 2. Why no call was made (`02`)

§7 requires a conservative estimate for all 31 remaining shards, built from the F-7B.1 actuals and size-adjusted by each
shard's rendered burden, with a variance margin. The five paid shards cost $2.7196 over 142,042 rendered first-turn
tokens. The 31 remaining shards render to 754,061 tokens, about 14% lighter per shard than Stage 1.

| estimator | total | fits $20 |
|---|---|---|
| F-7B pre-registered estimator (3.29x first turn) | $13.60 | yes |
| mean observed dollars per rendered token | $14.44 | yes |
| Stage-1 mean cost per shard x 31 | $16.86 | yes |
| worst observed per-shard rate, no margin | $21.47 | no |
| worst observed per-shard rate x 1.25 margin | $26.84 | no |

Two facts decide it. The conservative estimate exceeds the $20 cap, and it exceeds the gateway balance of $23.74, so
raising the cap alone would not guarantee completion. The bound does not depend on the choice of margin: even the worst
observed rate with no margin at all exceeds the cap.

The central expectation is $14.4 to $16.9, so a run would probably finish. But §7 tests a conservative estimate rather
than the expectation, and starting a run with a real chance of stopping inside Wave C would spend most of the cap and
still leave the canary incomplete. That is the outcome §7 exists to prevent, so no estimator was weakened to fit and no
call was made.

Per-shard rates observed in Stage 1 vary about two-fold, from 1.385e-5 to 2.847e-5 dollars per rendered token. The
driver is turn count, which ranged from 2 to 5 and is not predictable from the plan.

## 3. What is already frozen for the next attempt (`01`, `03`)

The final full-36-shard scorer (A through O) and every F-7 canary success gate were pre-registered before the cost
check, so they cannot be adjusted after Stage 2 is observed. The wave structure (10, 10, 11 in plan ordinal order), the
wave kill gate, and the retry policy (provider failure only, one retry) are frozen with them.

The §26 invalidation simulation ran at zero cost and behaves as designed. One source byte inside one shard's owned text
invalidates that shard alone and leaves the other 35 reusable by hash. A frozen inventory hash change invalidates all
36, with no partial reuse.

## 4. Options for the next mission

1. Raise the Stage-2 cap to $27 and top the gateway balance up to at least $30. That covers the conservative bound with headroom and runs all 31 shards.
2. Keep the $20 cap and run Waves A and B now, 20 shards with a conservative bound of $17.50, leaving Wave C to a follow-up. This is a deliberate two-mission split rather than an unplanned partial run, and the wave results stay frozen and reusable by shard hash.
3. Waive the §7 conservative test and run all 31 on the central estimate, accepting roughly a 5 to 10 percent chance of stopping short.

## 5. Scope

No production file changed. No paid call was made. Production sharding was not activated. Whole Chewy was not rerun,
Pass A was not rerun, the verifier was not run, and Phase 4 was not begun. The relevant suites pass unchanged: F-7A
planner and stitcher 31 of 31, F-7B.2 attribution 16 of 16, semantic compiler 180 of 180.
