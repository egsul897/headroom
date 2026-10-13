# #342 Final Canonical Reconciliation

## Lineage (recorded at reconcile)

| Ref | SHA | State |
| --- | --- | --- |
| `origin/main` | `d924f5b6c47f1d63982bb4385579d6858cdaf067` | tip after #332/#345 |
| PR #340 head | `a743984fe4d628c0a0d1e7b0bbc3584e8a217cf1` | OPEN, MERGEABLE (dependency) |
| Reconciled #342 tip | branch `cursor/ns4-canonical-reconcile-44cd` HEAD | OPEN draft on #340 tip |
| Historical #342 tip | `9d34bf63d78286f4c575b747af7d7e67c378c35a` | **do not merge** |
| Prior #342 tip | `9de72e8fcbea73f970e1a6dea1ebd8553debf544` | based on stale #340 `7e3974fc` @ `db0f2fd3` |
| Reported main (stale) | `db0f2fd32bf76755a53b8dd8e57ebee474c04d4c` | superseded by current main |

Ancestry: `main` ⊂ `#340` ⊂ reconciled `#342`. Historical tip `9d34bf63` is not an ancestor and is not merged.

## Absorption matrix

| Capability | Source | Disposition on reconciled #342 |
| --- | --- | --- |
| PRODUCTION sanitizer (strip synthetic remaining / caller trustedIssuerAuth) | #340 | **Keep** (unchanged from #340 tip) |
| Canonical financial-metric-resolver + product-bridge | #340 / #339/#345 | **Keep** |
| CrossDomainSimulatePanel + `cross-domain-simulate` | #340 | **Keep** (single panel; no duplicate Simulate UI) |
| EBITDA evidence identity binding | #340 (`a5a7e7bb`/`a743984f`) | **Keep** (rebased onto) |
| Hard refusal of caller-flag → verifiedRemaining | #340 adversarial + acquisition tests | **Keep** + acquisition regression from #342 |
| CFO `loadAuthoritativeCapacity` / `ns4EvidenceLines` wiring | unique #342 | **Absorbed** |
| Shared approved financial identity (`ns4-shared-financial-identity`) | unique #342 | **Absorbed** |
| Position/Simulate shared-identity UI | unique #342 | **Absorbed** |
| Acquisition / invalidation regression tests | unique #342 | **Absorbed** |
| Historical `9d34bf63` tip / v1 remainingAllowed path | historical #342 | **Rejected — do not merge** |
| Competing v1 cross-domain modules / duplicate Simulate UI | historical / stale #342 | **Not reintroduced** |
| #334 / #336 reopen | — | **Closed; not reopened** |

## Unique delta vs current #340 tip

- `lib/product/ns4-shared-financial-identity.ts` (new)
- `tests/product/cross-domain-acquisition-and-invalidation.test.ts` (new)
- `lib/customer-workflow/assemble-cfo-workflow.ts` (authoritativeCapacity + ns4EvidenceLines)
- `app/[companyId]/position/page.tsx` / `simulate/page.tsx` (shared-identity UI)
- `lib/product/north-star-workflow/index.ts` (re-export shared identity)
- `tests/product/cfo-workflow-access-integration.test.ts` (NS-4 evidence case)
- `docs/product/ns4-342-final-canonical-reconciliation.md` (this record)

## Dependency

**#340 remains unmerged.** #342 is rebased onto current #340 tip and must not be merged first.

Human merge order: merge **#340 first**, then #342 (or fold #342 uniques into #340 before merge).

## Local verification (this reconcile)

| Gate | Result | Notes |
| --- | --- | --- |
| Focused adversarial + acquisition + CFO + resolver | **PASSED** 72/72 | forged issuer, synthetic remaining, missing VEP/completeness, wrong company identity, stale fingerprint, shared-cap double-count |
| `tsc --noEmit` | **PASSED** | |
| `next build` | **PASSED** | |
| CI certified path (provider-free) | **PASSED** on tip | https://github.com/egsul897/headroom/actions/runs/38400142066 |
| Ephemeral NS-4 e2e | **SKIPPED** | `DATABASE_URL` is Neon; script refused (exit 2). No local disposable Postgres/docker available. Never pointed at Neon. |
| `north-star-customer-workflow` DB suite | **SKIPPED** | requires DB; Neon unreachable / not used |
| `certified-simulate-executable-safety` one fixture case | **PRE-EXISTING FAIL on #340 tip** | `runFixtureCertifiedPath…` expects `SIMULATED`, got `NEEDS_INPUT` — identical failure at `a743984f` / `019f3785`; not introduced by #342 uniques |

## Safety constraints honored

- No self-merge
- No production-authority activation
- REQUIRE gates unchanged
- #334 / #336 not reopened
- Ephemeral Postgres only for destructive e2e; never Neon
