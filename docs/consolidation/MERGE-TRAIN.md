# Merge-train plan onto `cursor/clf-release-1` (2026-10-17)

Written by Grok for Egzon (the only merger) and Muse/Designer (cross-review).
First measured with `git merge-tree --write-tree` against `origin/cursor/clf-release-1`
@ `f0b1b0f4`; **re-measured 2026-10-17 against `27ef71cc`** (after #431). Nothing here merges anything.

## Status corrections (Headroom Reviewer, 2026-10-17)

- **#402–#406 are merged** into release-1 (`b8e6065d`, `510caa93`, `f7078cdb`, `f33adca5`, `2dbdada7`),
  as are #408, #416, #419, #424, #425, #427, #430, #431. Step 1 of the old order is done.
- **#417 was not equal to #398 until it became a real merge.** Its earlier tip re-applied #398's changes
  on a release-1 base without a merge parent, so "merging #417 = merging #398" did not hold.
  It is now a real two-parent merge: tip `1faa0842` = parents `725233a9` (#398 line) + `2fdf4934`
  (release-1 after #427), keeping the baskets.ts lesser-of resolution below. #415 (`0c73e539`) and
  #420 (`848a8aef`, then `cca073dc`) merged that tip normally.
- **pr-gate is live in #409** (`.github/workflows/pr-gate.yml`, added by a workflow-scoped push:
  full vitest on the base tip vs the PR merged into the base). Its next revision (gate tools read
  from the base ref, protected-path label check, clean-tree check) is
  `docs/platform/pr-gate.workflow.yml` and still needs a workflow-scoped push.
- **HOLD: the counts "336 pass / 3 fail" (basket suites) and "577 pass / 5 skipped" (CLF) below** were
  measured on the earlier, non-merge #417 tree. They are kept for history and are **not** current
  evidence until reproduced on the real merge. Observed since on the new tips: CLF suite
  553 pass / 5 skipped at #417 `1faa0842`, 583 pass / 6 skipped at #415 `0c73e539` (more tests, not
  the same set); the basket-suite count has not been re-run yet.

## Conflict census

Each Grok branch alone vs release-1 `27ef71cc`: **all clean** (#417, #415, #420, #412, #413, #409,
#423, #418). Merged one after another, they are not:

| Sequence (on release-1 `27ef71cc`) | Result |
| --- | --- |
| #417 → #415 → #420 | clean |
| then #412 billing | **conflict `prisma/schema.prisma`**: #420 and #412 both append models at EOF (`WorkspaceFinanceMember`, `MonitoringSweepCursor` vs `WorkspaceSubscription`, `WorkspaceBillingOwner`, …) |
| then #423 saved scenarios | **conflict `prisma/schema.prisma`**: same EOF append (`SavedScenario`) |
| then #413, #409 | clean |

Resolution for every EOF-append conflict: keep **both** sides' model blocks (union, no edits inside
either), then `npx prisma validate` and `npx prisma format`. No model is shared between them.

Historic (f0b1b0f4) rows, still accurate for those branches:

| PR | Branch | Conflicts vs release-1 |
| --- | --- | --- |
| #398 EBITDA engine | `cursor/clf-ebitda-optimizer` | `lib/contract-model/covenant-computation/baskets.ts` (2 hunks) + a **silent** duplicate `LESSER_OF` key auto-merged into `FORMULA_BY_CATEGORY` (TS1117) — resolved in #417 |
| #392 visual system | `cursor/cfo-visual-system-7768` | 7 files: `app/[companyId]/layout.tsx`, `covenants/page.tsx` (3), `ledger/page.tsx`, `onboarding/documents/page.tsx`, `onboarding/facilities/page.tsx` (2), `rulebook/page.tsx`, `app/page.tsx` (2) |
| #401 UI wiring | `cursor/ui-wiring-398-7768` | union of #392 + #398 |

## Proposed order

1. ~~Muse's clean PRs #402 → #406~~ — merged.
2. **Grok platform #409** (waitUntil for large uploads, structural-only error tracking, pr-gate tools,
   test-artifact isolation). Reliability first. Its `onboarding/documents/page.tsx` change is one line
   (`maxDuration`) — #392 must keep it.
3. **#398 via #417** (`grok/ebitda-398-on-release-1`, real merge `1faa0842`). Merging #417 merges #398.
4. **#415** ERP evidence (on #417).
5. **#392 rebased by the Designer** with the rules below, then **#401** on top.
6. Grok #413 reports, then #420 monitoring/alerts (on #417), then #412 billing (held: no Stripe
   account), then #423 saved scenarios — resolving the schema.prisma EOF appends as above.

### Migrations (none applied to Neon by any PR; Egzon applies)

Apply in timestamp order. Prisma `migrate deploy` would also apply an older-named migration that
arrives later, but keeping merge order = timestamp order avoids surprises:

| Migration | PR | Notes |
| --- | --- | --- |
| `20261015050000_kf_financials`, `20261017030000_customer_ebitda_box`, `20261017050000_customer_ebitda_append_only`, `20261017070000_customer_ebitda_seq` | #398 / #417 | ride along with #417 |
| `20261017090000_customer_ebitda_base_metric` | #415 | after #417's four |
| `20261017160000_workspace_billing` | #412 | has `down.sql` |
| `20261017170000_monitoring_alerts` | #420 | has `down.sql` |
| `20261017180000_saved_scenarios` | #423 | has `down.sql` |

## Resolution: #398 × release-1 `baskets.ts` (done in `grok/ebitda-398-on-release-1`)

Both sides changed lesser-of handling:

- #398 counts a lesser-of only when it is *the cap* (`capExtremeAt`: not inside a condition/minimum)
  and reports an `AT_MOST` bound from the smallest fixed limb.
- release-1 computes the exact `min(fixed, metric limb)` when the metric is bound (`evalLesserOf`)
  and adds `MULTIPLE_OF_METRIC`.

Resolution keeps all three: #398's classifier guard → `evalLesserCombined` uses release-1's exact value
only when it COMPUTED on the same lesser-of #398 identified as the cap, else #398's bound.
`isMaintenanceLimit` runs before `parseMultipleCap` so a ratio limit is never read as a
multiple-of-EBITDA dollar cap. Duplicate `LESSER_OF` key resolved to release-1's
`LESSER_OF_FIXED_AND_MULTIPLE` (release-line behaviour unchanged).

Evidence: `tests/contract-model/covenant-computation/lesser-of-merge.test.ts` — release-1 alone 4/5,
#398 alone 3/5, merged 5/5. Basket suites (covenant-computation, runtime/capacity,
basket-formula-corpus, held-out-oracles, structural-definitions): 336 pass / 3 fail on the merge,
**identical 3 failures on release-1 baseline** (corpus taxonomy, Neon-only authentic execution,
anti-enumeration scan) — pre-existing, not introduced. CLF suite 577 pass / 5 skipped.
**HOLD:** these two counts are from the earlier non-merge tree; see "Status corrections".

## Resolution rules for #392 (Designer applies; Designer owns these files)

1. **`app/[companyId]/layout.tsx` — tenant gate is non-negotiable.** Keep #392's `AppShell` import
   *and* release-1's `import { requireTenantOrRedirect } from "@/lib/auth/guard"`. The body already
   calls `await requireTenantOrRedirect(companyId)` before `getCompanySummary` — it must stay first.
   Drop the now-unused `CompanyNav`/`CompanyIdentityCard`/`BrandMark` imports only if unused.
2. **No pre-declared defaults (release-1 Rule 109).** #392 swaps native `<select defaultValue="" required>`
   for `<Select defaultValue="CREDIT_AGREEMENT" | "TERM_LOAN" | "FLOATING" | "EQUITY">`. That silently
   re-declares every upload a Credit Agreement, every facility a Term Loan, etc. `components/Select.tsx`
   also falls back to `options[0]` when no default is given. **Before swapping**, `Select` needs a
   `placeholder` + `required` mode whose hidden input posts `""` until the user picks; server actions
   already treat `""` as OTHER / reject. Applies to documents (1), facilities (2), ledger (1).
3. **`covenants/page.tsx`:** #392 imports `CONMED_DEMO_COMPANY_ID` / `listConmedCovenantExplorerRows`
   (per-issuer demo path) and drops release-1's "Operative amendment status" card and
   `operativeResolution` block. Keep release-1's cards (they disclose UNRESOLVED_PRECEDENCE — fail-closed
   disclosure) and do not reintroduce issuer-specific demo rows into the customer page.
4. `rulebook/page.tsx`, `app/page.tsx`: take release-1 logic (structural disclosure, AI DRAFT labels),
   restyle with #392 tokens.
5. `onboarding/documents/page.tsx`: also keep `export const maxDuration = 300` from #409.

## Gates before each merge

- CI `canonical-compiler` (`certified path (provider-free)`) green at the merge tip (authoritative).
- **pr-gate** green at the merge tip: no new test regressions vs the base tip; tests leave the tree
  clean; no held-out / blind / baseline / frozen / ground-truth path changed without the
  `owner-approved-protected-paths` label.
- **Scoreboard gate:** the CLF scoreboard on the merge tip must not regress vs release-1 on any
  measured cohort; a regression blocks the merge until explained. (A release-1 scoreboard regression
  is currently being handled separately; it must be resolved or explicitly accepted by Egzon first.)
- Muse ↔ Grok cross-review; Headroom Reviewer PASS at tip.
- Schema: after resolving the EOF appends, `npx prisma validate` and a migrate-diff from the previous
  tip's schema shows only the incoming PR's models.
