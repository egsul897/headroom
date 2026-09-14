# Phase 3 Chewy canary - F-7B.3C: Wave B

Ten shards executed for **$3.8842** against a $10.50 cap. With the fifteen frozen paid results reused unchanged that is
**25 of 36** real terminal shards. Verdict: **F7B_WAVE_B_PASSED_READY_FOR_WAVE_C** (18/18). Wave C was not executed.

## 1. Baseline and reuse

Every §1 identity check passed and F-7B.3B did not alter shard identity. All fifteen prior results loaded with shard
hashes matching the plan and composition hashes matching the F-7B.3B certified evidence byte for byte. Zero prior shards
were rerun. Wave B membership came from the original committed manifest and matched plan ordinal order on cross-check.

## 2. Cost

The precheck used all fifteen paid shards rather than Stage 1 alone.

| estimator | Wave B |
|---|---|
| mean rate | $4.02 |
| median rate | $3.71 |
| worst observed rate | $7.16 |
| conservative (worst x 1.25) | $8.95 |
| **actual** | **$3.88** |

Mean cost per shard $0.3884, median $0.3661, max $0.6173, no retries and no wasted spend. Gateway balance went from
$20.35 to roughly $16.47.

## 3. Execution

All 10 shards reached terminal state with zero schema failures, zero provider failures and zero retries. Across all 25
executed shards: 12 complete, 13 missing-context. Peak single-turn input was 45,175 tokens, an 85.5% reduction against
the historical monolithic 312,143. Peak single-turn output was 28,186 with no truncation and no partial recovery.

## 4. A metric that had to be stated carefully

The wave runner computes trust counts from the pre-registered F-7B scorer. That scorer predates F-7B.3B and does not
know about `definitionConflicts`, so it still reports owned values lost 2 and owned lineage lost 6 by comparing canonical
IR before and after only. §14 and §15 of this mission require the corrected metric: canonicalize digest ids, scope to
owned, compare distinct ids, and count first-class conflict evidence as surviving.

Under the corrected metric, computed over all 25 shards, **both losses are zero**. Both figures are reported and neither
metric was altered after seeing results. This is the same stale-scorer artifact F-7B.3B documented, not a new defect.

## 5. Conflicts

Six definition ids carried multiple distinct emissions; two are owner-against-owner conflicts, the same Approved Bank and
Annual Threshold as before. The other four had one unattributed side already excluded by the contextual path, so no
conflict collision fires.

Both real conflicts behave as F-7B.3B certified: the collision is present and requires review, the canonical copy stays
AMBIGUOUS, and both variants survive whole with expression, lineage, dependsOnTerms, provenance and sufficiency intact.
`MONEY:100000000` and `MONEY:250000000` remain present in the evidence and absent from the canonical copy.

## 6. Accountability

Executed-shard material, reported separately from Wave C as §14 requires.

| | count |
|---|---|
| owned by the 25 executed shards | 93 |
| represented | 53 |
| intentionally non-computational | 1 |
| unsupported | 21 |
| ambiguous | 0 |
| missing | 18 |
| accountability rate | 80.65% |
| unresolved solely because Wave C has not run | 15 |

Global Pass C over all 108: 63 represented, 22 dispositioned, 23 material missing, zero dangling lineage, not
semantically complete. Conflict evidence contributed no represented credit; the figure is identical with and without it.

## 7. Attribution and safety

237 planner-unit, 42 owned-lineage, 77 unique-primary-source-declaration, and **zero source-unverifiable**. Seventeen
contextual definitions were dropped and recorded. No contextual rule or shared-capacity emissions, no lineage claims on
unowned items, no dangling references, no rule or shared-capacity conflicts. All ten trust counts are zero under the
corrected metric.

Invalidation still holds: one source byte invalidates one shard and leaves 35 reusable, an inventory hash change
invalidates all 36, and the conflict metadata does not alter shard hashes.

## 8. Wave C

Not executed, by §4 and §30. Updated estimates from all paid data: mean $4.05, worst observed $6.22, conservative
$7.77 for the final 11 shards. Cumulative paid canary cost to date is $13.12.
