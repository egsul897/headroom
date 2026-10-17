# Merge-train plan onto `cursor/clf-release-1` (2026-10-17)

Written by Grok for Egzon (the only merger) and Muse/Designer (cross-review).
Measured with `git merge-tree --write-tree` against `origin/cursor/clf-release-1`
@ `f0b1b0f4`. Nothing here merges anything.

## Conflict census

| PR | Branch | Conflicts vs release-1 |
| --- | --- | --- |
| #402 #403 #404 #405 #406 (Muse) | `muse/*` | none (1 commit each, clean) |
| #409 platform, #412 billing, #413 reports (Grok) | `grok/*` | none |
| #398 EBITDA engine | `cursor/clf-ebitda-optimizer` | `lib/contract-model/covenant-computation/baskets.ts` (2 hunks) + a **silent** duplicate `LESSER_OF` key auto-merged into `FORMULA_BY_CATEGORY` (TS1117) |
| #392 visual system | `cursor/cfo-visual-system-7768` | 7 files: `app/[companyId]/layout.tsx`, `covenants/page.tsx` (3), `ledger/page.tsx`, `onboarding/documents/page.tsx`, `onboarding/facilities/page.tsx` (2), `rulebook/page.tsx`, `app/page.tsx` (2) |
| #401 UI wiring | `cursor/ui-wiring-398-7768` | union of #392 + #398 |

## Proposed order

1. **Muse's clean PRs** #402 → #403 → #404 → #405 → #406 (no conflicts; each CI-green per Muse).
2. **Grok platform #409** (waitUntil for large uploads + error tracking). Reliability first.
   Its `onboarding/documents/page.tsx` change is one line (`maxDuration`) — #392 must keep it.
3. **#398 via `grok/ebitda-398-on-release-1`** (draft PR): #398 with release-1 merged in and
   the baskets.ts conflict resolved (see below). Merging this branch = merging #398 into release-1.
   Migrations `20261017030000`/`050000`/`070000` ride along and are **not applied** (Neon blocked).
4. **#392 rebased by the Designer** with the rules below, then **#401** on top.
5. Grok #413 reports, then monitoring/alerts, then #412 billing (held: no Stripe account).

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

- CI `canonical-compiler` green at the merge tip (authoritative).
- Muse ↔ Grok cross-review; Headroom Reviewer PASS at tip.
- The proposed every-PR gate (`docs/platform/pr-gate.workflow.yml` in #409) needs a workflow-scoped
  push — until then PRs touching only `prisma/**`/`package.json` get no typecheck.
