# LCQG P0 Shared-Capacity E2E Closure

**Verdict:** `INDEPENDENTLY_ADJUDICATED` (not CLOSED)

| | SHA |
|---|---|
| Starting observed PR #136 head | `0e31c360c040df6bc7284ff8d3ca8c62a22bdd11` |
| Ending production HEAD (E2E regression landed) | `696b9372c3e85e26504780c90a2538796449a281` |
| Probe evidence gathered at | `0e31c360c040df6bc7284ff8d3ca8c62a22bdd11` |
| Labeling fix (ancestor of tip) | `83cde5b985b6bb480ac2500cccf894fe6e497f20` |
| Prior labeling eval (PR #153) | `d6852f3a8fde5749902207d4c0758df1e4f79cc6` |
| Machine artifact | `29-p0-shared-cap-e2e-closure.json` |

Paid calls: **0** · Freeze / Claude fixtures / certification pins: **unchanged** · #136 merge: **none**

## 1. Fix presence at tip

- `shared-capacity-signals.ts` present
- `83cde5b` is ancestor of `0e31c36`
- Labeling smoke: ADV-FP-01/02 → `aggregate_amount`; genuine together-with → `shared_cap`

## 2. Source → capacity traces (negative controls)

Scripted golden harness (zero paid calls) on production worktree:

### ADV-FP-02 — ordinary single aggregate basket

Source: affirmative permission with `aggregate amount not to exceed $25,000,000` (no shared-pool language).

| Stage | Result |
|---|---|
| Pass A / helper | `aggregate_amount` (not `shared_cap`) — labeling layer |
| Scripted inventory | PERMISSION only — no `SHARED_CAP` item |
| Compile (`sharedCapacities`) | **[]** |
| Certification | `CERTIFIED` |
| Phase-4 adapter | `DERIVED` with `sharedCapacities=[]` |
| `evaluateVerifiedCapacity` | `EXECUTED`; `sharedConstraints=[]`; no `SHARED_CAPACITY` graph nodes |
| `simulateVerifiedTransaction` | `EXECUTED` on permission path; package still has zero shared pools |

### ADV-FP-01 — aggregate ceiling without affirmative permission

Source: ceiling sentence without may/except permission verb.

| Stage | Result |
|---|---|
| Compile | `sharedCapacities=[]`; every rule `capacityExpression=null` |
| Map | no `SHARED_CAPACITY` nodes |

**Attack control (existing):** model invents `$10m` shared pool on independent baskets without source support → verifier `MATERIAL_DISCREPANCY` → `REVIEW_REQUIRED` → Phase-4 `REFUSED` / `VERIFICATION_ARTIFACT_INCOMPLETE`. Ordinary aggregate cannot become an *executable* shared pool.

## 3. Genuine shared-capacity positives

| Control | Result |
|---|---|
| Cross-clause `together shall not exceed` pool | `CERTIFIED`; one `IRSharedCapacity`; Phase-4 `EXECUTED` with one `sharedConstraints` entry |
| Cross-section cite (`together with … Section 7.06`) | One quantified pool; external partner retained as `SHARES_CAPACITY_WITH` / unresolved — not a second freestanding ceiling |
| Runtime double-count | Member draws $40+$30 against $150 pool → usage **70**, remaining **80**; member gross stays **100** each (limit never copied) |

## 4. Fail-closed unresolved dependencies

`SHARES_CAPACITY_WITH` without `IRSharedCapacity` → graph limitation `SHARED_CAPACITY_NOT_QUANTIFIED`; **no invented pool**; members not authoritative full-amount AVAILABLE.

Related unpaid coverage also green: unverified/mutated/stale pool → REQUIRE refuse (`shared-capacity.test.ts`); aggregate ceiling without governing permission stays non-capacity (`aggregate-ceiling-limit.test.ts`).

## 5. Gibraltar dropped-signal recall review

Frozen historical `pass-a-shared-cap.json` = **51** rows (untouched).

Live tip Pass A: candidates **901**, `shared_cap` **18**, `aggregate_amount` **83**.

| Stratum (frozen excerpt × production helper) | Count |
|---|---|
| `ORDINARY_AGGREGATE_CEILING` | **42** — intentional false-positive removals |
| `HELPER_SAYS_SHARED_BUT_PASS_A_DROPPED` | **9** — residual recall risk (mostly definitional “combined with” adjustment caps / multi-clause Investment provisos whose historical nodeIds no longer appear in live Pass A `shared_cap`) |

Live tip still emits **18** independent `shared_cap` candidates (relationship language outside the frozen-51 nodeId set). Frozen fixture remains historical evidence only.

## 6. Tests (production worktree @ `0e31c36` + new E2E file)

```
npx vitest run \
  tests/contract-model/certified/shared-capacity-aggregate-alone-e2e.test.ts \
  tests/contract-model/certified/shared-capacity.test.ts \
  tests/contract-model/shared-capacity-false-permission.test.ts \
  tests/contract-model/runtime/capacity/shared-and-ledger.test.ts \
  tests/contract-model/aggregate-ceiling-limit.test.ts \
  tests/contract-model/figure-role.test.ts
→ 53 passed
```

Synthetic shared/transaction probes: 10 passed (filtered). Phase-3 eval suite on #153: 7 passed.

New regression file (PR #136): `tests/contract-model/certified/shared-capacity-aggregate-alone-e2e.test.ts` — issuer-agnostic.

## 7. Remaining limitations / boundary

1. **Live unpaid LLM path blocked:** Pass B role + real `WireSharedCapacity` emit from raw ADV-FP text requires paid inference — not run.
2. **Scripted inventory/submission** stands in for live semantic compile; proves engine fail-closed / honest paths, not live model behavior on ADV-FP prose.
3. **Gibraltar:** 9 helper-shared excerpts with Pass-A nodeId drop remain a recall watchlist; not adjudicated as false negatives without operative-span review.
4. **Certification advancement / freeze edits:** none.

## Closure verdict

**INDEPENDENTLY_ADJUDICATED**

ADV-FP false-permission risk is independently traced through scripted compile→capacity with no executable shared pool from ordinary aggregate ceilings, genuine shared positives retained, double-count and unquantified-share fail-closed verified. Ticket **not CLOSED** — live LLM compile boundary unpaid; mission preserves `INDEPENDENTLY_ADJUDICATED`.
