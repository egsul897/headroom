# #341 Final Conditional-Authority Integration

**Corrected tip SHA:** `77b06f1f550378e5426a475d4ce46ca42e19707a`  
**Integration target:** `main` @ `d924f5b6c47f1d63982bb4385579d6858cdaf067` (merge of #332; includes #334 + #345)  
**PR:** https://github.com/egsul897/headroom/pull/341  
**Mergeable (GitHub at push):** `true` / `unstable` (exact-tip CI pending on this SHA)

## Non-mergeable root cause (resolved)

Prior tip `fde73d3e` conflicted with merged #334 Dashboard NS-4 props, then with #345 contractual-metrics and #332 cross-layer authority. Rebased cleanly; `origin/main` is an ancestor of HEAD.

## Authority hardening

- Live IF re-evaluation at fulfillment boundary preserved.
- New module-private brand on authority objects from `evaluateConditionalPathsAuthoritatively`.
- `proveConditionalClearance` / `authorityShowsLeafInactive` require `isLiveEvaluatedPathAuthority` — not `authoritative: true` alone.
- JSON clones and forged self-consistent seals fail closed.
- Sole production caller of `proveConditionalClearance`: `fulfillFinancialDependencyManifest`.

## #338 selective integration

Absorbed `CAPACITY_DISCLAIMER` only. Did **not** port #338’s parallel evidence/reflow/EBITDA engine.

## Local test results (exact tip)

| Suite | Result |
| --- | --- |
| `conditional-fulfillment-adversarial.test.ts` | 11 passed |
| `contractual-leverage.test.ts` | 8 passed |
| `contractual-ebitda-leverage-integration.test.ts` | 10 passed |
| `canonical-financial-path-acceptance.test.ts` (local `headroom_afc`) | 4 passed |
| `tsc --noEmit` | clean |

## Remaining blockers

1. Exact-tip GitHub CI must go green on `77b06f1f` (was `unstable` at report time).
2. #338 remains open/conflicting — human should merge #341 first or resolve #338 against this tip; do not duplicate engines.
3. No self-merge; no production-authority activation.

## Human merge recommendation

**Merge #341 after exact-tip CI is green.** Authority bypass is closed at the brand gate; Dashboard coexists with #334/#345 surfaces. Do not activate production authority in this PR.
