# F-7B.3E — Chewy 1.01 sharded canary: final Wave C and the F-7 canary decision

Starting SHA `76e76a1781f381f360950255960dc182f9d01f69`.
Paid tranche: the final **11** shards. Wave-C spend **$3.9094** against a **$9.50**
hard cap. No production file changed. Wave C was the last paid execution of the
canary; everything after it ran at zero cost from persisted evidence.

**Verdict: `F7_CANARY_PASSED` — 25 / 25.**
Deliberately **not** `F7_CLOSED`: sharded compilation is still not wired into
normal production `compile.ts`. The next mission is F-7C production activation.

## What ran

| Wave | Shards | Cost | Reused |
|---|---|---|---|
| Stage 1 | 5 | $2.7197 | frozen, not rerun |
| Wave A | 10 | $3.3829 | frozen, not rerun |
| Wave B | 10 | $3.8842 | frozen, not rerun |
| **Wave C** | **11** | **$3.9094** | executed here |
| **Total** | **36 / 36** | **$13.8961** | 0 prior shards rerun |

All 25 prior composition hashes were verified against the certified F-7B.3D
replay before a single call: 25/25 match, 0 mismatches. 0 provider failures,
0 retries, 0 wasted spend, no cost bound hit.

## Trust — every gated count is zero

dangerous silent omissions 0 · false completeness 0 · source-unverifiable
authoritative IR 0 · contextual ownership-credit violations 0 · silent
incompatible merges 0 · owned values lost 0 · distinct owned lineage lost 0 ·
new dangling references 0 · hidden failed shards 0 · hidden missing material 0.

The lineage **occurrence** difference is 10. It is diagnostic and does not gate:
203 occurrences expected and 203 preserved, 106 distinct owned ids expected and
106 preserved, 3 of them held only in conflict evidence.

Values: 48 distinct expected, 46 preserved canonically, 2 preserved only in
first-class conflict evidence, 0 contextually excluded, **0 lost**.

## Definition conflicts — 5 terms, 10 variants, all review-required

Annual Threshold, Approved Bank, General Basket Amount, Transaction Threshold,
subsidiary. Every one keeps both owner variants whole, every canonical
representation stays `AMBIGUOUS`, every conflict carries `requiresReview`, and
none earns Pass-C represented credit. Wave C surfaced three conflicts the first
25 shards had not: the mechanism generalized without being touched.

## Attribution — `NONE` = 0

368 PLANNER_DEFINITION_UNIT · 47 OWNED_INVENTORY_LINEAGE · 118
UNIQUE_PRIMARY_SOURCE_DECLARATION · **0 NONE**. 29 non-owner definitions dropped
as contextual and recorded; 1 attribution ambiguity; 0 attribution conflicts.

## Accountability — Pass C is the authority

All 108 material items terminate in an explicit state, none left unresolved for
want of an executed owner:

represented 64 · intentionally non-computational 2 · unsupported 26 · ambiguous 0
· **missing 16** → accountability **85.19%**.

CRITICAL recovery 94.44% (54 items, 3 missing). MATERIAL recovery 75.93%.
Quantitative coverage 85.92% (142 values, 20 missing). Disclosed missing is safe
but is *not* counted as accounted — no disposition was invented to lift the rate.

Owner shards self-report 65 represented; Pass C credits 64. The lower, global
figure is the one used everywhere here, which is the point of Pass C being the
final authority.

## Owner-shard architecture — **OWNER_SHARD_ASSUMPTION_SUPPORTED**

108 owned material items: 65 represented by their owner, 22 explicitly
dispositioned by their owner, 21 missing — owner recovery **80.56%**. Zero
lineage claims on unowned items were stripped, and zero contextual
ownership-credit violations occurred across 97 cross-shard context uses. Shards
recovered what they owned and never took credit for what they did not.

## Semantic quality — not systematically poor

Per-wave owner recovery: Stage 1 92.86%, Wave A 82.86%, Wave B 66.67%,
**Wave C 80.00%**. No new threshold was invented after seeing results: Wave C is
compared to the band of the three already-accepted waves (floor = lowest × 0.9 =
60%), and it clears it while sitting above Wave B. The misses are bounded and
explicable — 5 material misses on shards with truncated context, 7 on shards with
unresolved cross-references, 0 from output truncation — not a systemic collapse.

## Window — the actual F-7 objective

Peak single-turn input **42,874** tokens against the historical monolithic
first-turn **312,143**: an **86.26%** peak reduction. Peak single-turn output
31,628 against a 128k ceiling, **0 truncations, 0 partial recoveries**. The one
oversized unit (ordinal 26) executed and terminated explicitly rather than
failing silently.

Sharding does not reduce aggregate tokens — it raises them, 2,695,669 input
tokens across 36 shards versus one 312k window. That is disclosed, not hidden:
the objective was peak risk, and peak risk fell by 86%.

## Files

| File | What it is |
|---|---|
| `00-baseline-frozen25-and-wavec-precheck.json` | §1/§2/§3/§6 zero-cost preflight |
| `01-wave-c-execution-ledger.json` | §7–§11 paid ledger, per-turn calls, 11 terminal records |
| `02-final-36-shard-evaluation.json` | §12–§30 full evaluation and the 25-point gate |
| `06-per-shard-ledger.json` | running cost ledger for the Wave-C tranche |
| `scripts/f7b3e-precheck.ts` / `-run-wavec.ts` / `-final-evaluation.ts` | the harness |

## Two measurement corrections made during this mission

Both were caught and fixed *before* any figure was accepted, and both are
recorded because each initially produced a more convenient answer:

1. The runner's §1 check pinned HEAD to the starting SHA, which made committing
   the preflight §36 requires look like a baseline violation. Replaced with a
   stricter pair — the starting SHA must be an ancestor of HEAD, and nothing
   under `lib/`, `app/`, `components/` or `prisma/` may differ. Zero paid calls
   were made while it was failing.
2. The first evaluation run reported Wave-A and Wave-B recovery as 0 because the
   wave classifier did not normalize the bare `"A"`/`"B"` tags in the evidence
   files. That made the §16 comparison band `min(...)` = 0, so gate point 20
   passed vacuously. The classifier now throws on an unrecognized tag, and the
   band is rejected as evidence if it is degenerate. The gate passes on the
   corrected band, where the floor is 60% and Wave C is 80%.
