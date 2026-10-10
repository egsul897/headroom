# Five-agent integration — product readiness closeout

**Integration PR:** https://github.com/egsul897/headroom/pull/278  
**Integration tip:** see final tip after this closeout refresh (`cursor/five-agent-integration-e920`)  
**Verdict:** `INTEGRATED_PRODUCT_READY_FOR_HUMAN_REVIEW`  
**Not claimed:** production-certified capacity

## SHAs

| Marker | SHA |
| --- | --- |
| Reported baseline at mission launch | `342a6b059e3385fb14d605b8d1593e878a221578` |
| Final `origin/main` at closeout | `93857be59214c7410de9f005ff87870a47bf10ce` |
| Integration branch tip | _(pinned in following commit)_ |

Main advanced during the mission: `#268`, `#276`, `#277`, `#274`, `#266` landed on `main` before integration closeout.

## PR-by-PR disposition

| PR | Tip SHA | Disposition | Merge commit on main | Notes |
| --- | --- | --- | --- | --- |
| #276 WOR holdout | `83ec8854` | **SUPERSEDED** (merged upstream) | `6abe42ba` | Docs/eval only; Vercel failed historically; seal preserved |
| #268 authenticity + trusted-issuer | `d7cb0c6b` | **SUPERSEDED** (merged upstream) | `89802b23` | Capacity overlaps reconciled with #273 on integration tip |
| #274 package graph + handoff | `48950c80` | **SUPERSEDED** (merged upstream) | `b23e312a` | Absorbed into integration + main |
| #273 financial evidence | `61c037dc` | **TARGETED_RECONCILIATION** | _(unmerged)_ | Draft; **CONFLICTING** vs current main; content on #278 |
| #275 customer workflow | `deaa977e` | **TARGETED_RECONCILIATION** | _(unmerged)_ | Draft; **CONFLICTING** vs current main; content on #278 |
| #266 fixed-dollar / greater-of | `628eefa4` | **SUPERSEDED** (merged upstream) | `93857be5` | Landed on main during closeout; integration tip retains contract A wire atop it |
| #246 graph expansion | — | **BLOCKED / DO NOT MERGE** | — | Explicitly excluded; not reactivated |
| #278 integration | tip of branch | **MERGE_READY for human review** | _(unmerged)_ | Draft; carries reconciled #266/#273/#275 + contract A wire |

### Exact merge commits on main (this mission window)

1. `#268` → `89802b2316f78fb770843bc9966f622a61a4b537`
2. `#276` → `6abe42bae6dfe69bb72467daa7f460b727200d1b`
3. `#277` (typecheck fix after #276) → `9895b253…` (parent of #274 merge)
4. `#274` → `b23e312afedb53ea6771c2ead1afbcdd758edd86`
5. `#266` → `93857be59214c7410de9f005ff87870a47bf10ce`

### Human actions required to land remaining work

1. Review draft PR **#278** (integration tip).
2. Mark **#278** ready for review; obtain required approving review(s) under branch protection.
3. Merge **#278** (do **not** force-merge conflicting #273/#275 tips; prefer #278).
4. Close superseded/conflicting #266/#273/#275 after #278 lands (or leave as historical).
5. Do **not** merge #246.

## Cross-workstream contracts

| ID | Contract | Status |
| --- | --- | --- |
| A | Compiler consumes confirmed operative identity | **VERIFIED** — `compileFrozenDebtPackage` calls `buildOperativeHandoffBundle`; `PROVISIONAL_IDENTITY_BLOCKED` refuses vertical-slice executable elevation |
| B | Financial metric refs consume authenticated evidence without treating hypothetical as production | **VERIFIED** — greater-of path tags `financialEvidenceMode: CALLER_STIPULATED` vs production `STALE_OR_UNAUTHENTICATED`; production mode still refuses without AUTHENTICATED_APPROVED |
| C | Trusted-issuer cannot be forged via host mint | **VERIFIED** — `HostIdentityProvider` registry + WeakSet mint; structural clones refused; production provider unregistered → fail-closed |
| D | Position/Ask/Simulate preserve #268/#273 refusals | **VERIFIED** — Position page wires `utilizationRemainingAuthority === PRODUCTION_AUTHORITATIVE`; `refuseAuthoritativeRemaining` retained; customer adversarial routes pass |
| E | Shared-capacity conserved (MHK greater-of pair) | **VERIFIED** — greater-of suite includes MHK u↔g shared-cap conservation tests (pass) |
| F | WOR holdout remains sealed; not retroactively “unseen” after remediation | **VERIFIED** — seal + legal-ref hashes unchanged across reproduction; chronology untouched |
| G | Existing engines canonical; no parallel capacity engine | **VERIFIED** — single `lib/capacity` + `lib/covenant-engine` path; #246 not merged |

## Phase 3 isolated validation

| Gate | Result |
| --- | --- |
| Compiler fidelity + tamper (fixed-dollar / greater-of adversarial) | **PASS** (119 tests / 15 files; 4 persistence skipped) |
| Greater-of shared-capacity (MHK) | **PASS** |
| Financial evidence adversarial | **PASS** (19) |
| Cross-surface authority integration | **PASS** (11) |
| Customer route adversarial | **PASS** (18) |
| Package graph persistence (live DB) | **NOT_TESTED** — `DATABASE_URL` points at Neon production (`*.neon.tech`); `HEADROOM3_ALLOW_EVAL_DB` not enabled; no disposable eval DB used |
| WOR offline evaluation | **PASS** — `$0` paid inference; `falseFavorableCapacityOutcomes: 0`; seal hashes stable |

### WOR reproduction (tip)

```
packageKey: wor-2023-2026-credit-facility
clauseDenominator: 10
clauseRecallPassA: 10
structuralFound: 10
spanCompleteBestNode: 10
spanCompleteNaiveFirstMatch: 0
tocCollisionCount: 10
contextDefsPresent: 10
contextSufficient: 0
contextBudgetExceeded: 9
contextIncomplete: 1
falseFavorableCapacityOutcomes: 0
paidInference: FORBIDDEN
```

Seal `extractedSha256` unchanged:
- doc-a: `29751da8c5ee22c84facccf0d643312b2fa8c485b612f92970bdbff05a4df5b2`
- doc-b: `e5ce81017e3635960bcd519af513b480ca48a297cf97ba72e485ecb023399d3b`

## End-to-end product trace

Authentic debt package → confirmed operative document → complete clause/context → verified executable IR → authenticated financial inputs → utilization completeness → capacity engine → customer Position / Ask / Simulate.

| Step | Mark | Evidence |
| --- | --- | --- |
| Authentic debt package | **VERIFIED** | WOR sealed fixtures + MHK structural slice fixtures |
| Confirmed operative document | **VERIFIED** | package-graph handoff + offline compile operative gate |
| Complete clause/context | **BLOCKED** | WOR: sufficiencySufficient 0/10 (9 budget exceeded, 1 incomplete) |
| Verified executable IR | **HYPOTHETICAL_ONLY** | Fixed-dollar / greater-of vertical slices verify IR fidelity; production capacity refused |
| Authenticated financial inputs | **BLOCKED** | IdP / HostIdentityProvider unregistered; no production AUTHENTICATED_APPROVED path |
| Utilization completeness | **BLOCKED** | Completeness cert + trusted-issuer gates fail closed without production issuer |
| Capacity engine | **VERIFIED** | Canonical engines exercised; remaining publication fail-closed without authority |
| Customer Position / Ask / Simulate | **VERIFIED** | Status contract + adversarial routes; authoritative remaining only if engine marks PRODUCTION_AUTHORITATIVE |

**Production readiness:** **NOT** claimed. Required authority/legal gates remain blocked.

## Production activation blockers

1. No production `HostIdentityProvider` registered (trusted-issuer FAIL-CLOSED).
2. No AUTHENTICATED_APPROVED financial evidence path for live packages.
3. Utilization completeness certificates cannot become production-authoritative without (1)+(2).
4. Context retrieval sufficiency under bounded budgets fails on WOR holdout (0/10).
5. TOC-stub / body-anchor collisions (10/10 naive-first-match span failures on WOR).
6. Restatement / operative-document authority still incomplete for whole-document restatements.
7. Facility-difference secured-debt compilation unsupported (explicitly rejected in greater-of classifier).
8. Branch protection / human approval required before #278 can land on main.
9. Package-graph persistence not exercised against a disposable evaluation database in this run.

## Unmerged PR queue

- **#278** — integration tip (preferred merge vehicle) — draft, awaiting human review; carries #273/#275 reconcile + contract A + capacity marker cleanup
- **#273** — draft, CONFLICTING vs main; content reconciled in #278
- **#275** — draft, CONFLICTING vs main; content reconciled in #278
- **#246** — OPEN; **do not merge**

## Next bounded development tasks

See `docs/integration/handoffs/` — five separate handoffs; **not implemented** in this assignment.

## Uncommitted / unpushed work

Reported at final push of this closeout commit on `cursor/five-agent-integration-e920`. Regenerated WOR eval JSON under `docs/headroom-5-independent-holdout/10*` was discarded after reproduction (seal/legal refs untouched).
