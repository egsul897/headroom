# RC integration manifest — grok/rc-integration

**Branch:** `grok/rc-integration` · **Head this manifest describes:** `a302c4e1dd734bbec960f039091697061604553c`
**Base:** `cursor/clf-release-1` @ `2fdf4934` · **PR:** #421 (DRAFT — merges and deploys are Egzon's)
**Companion status report:** PR #421 body (verification runs, blockers, E2E). This manifest
reconciles only one thing: which workstreams are actually in this tree, and which are not.

> If the branch head moves, this manifest must be updated in the same change series.
> A workstream is "integrated" only if its code is present in the tree at the head above.
> Nothing in this document claims integration of absent code.

## Integrated in this RC (code present at `a302c4e1`)

| Workstream | Notes |
|---|---|
| `cursor/clf-release-1` @ `2fdf4934` | incl. #397/#399, #402–#406, #416, #419, #424, #425, #427, #408 (ERP ingestion foundation) |
| #398 EBITDA box | RC-authored two-parent resolution against the true base `f0b1b0f4` (#417's single-parent `725233a9` not used) |
| #410 CFO EBITDA editing | incl. the #410×#415 `erpEvidence` preservation fix |
| #415 ERP evidence / BASE_METRIC | with its semantic fixes |
| #409 platform-ops @ `f2c99045` | waitUntil background work, error tracking, pr-gate (no-new-regressions design) |
| #392 product surfaces | rebased; duplicate covenant cards removed per status report |
| #401 EBITDA UI | |
| #414 UX backend hand-off | see "Endpoint-less UI" below |
| #420 filings/monitoring & alerts @ `c8f6b489` | monitoring routes are the only calendar in this RC |
| #423 saved scenarios @ `a0947cc1` | |
| Request-level tenant gate | RC-authored `middleware.ts` + `lib/auth/tenant-path.ts` (51f6dab7) |

## EXCLUDED from this RC — absent code, do not claim

### #412 — Billing (Stripe scaffold), branch `grok/billing`

- **Excluded by:** revert `eae539b70c` ("Revert RC: merge grok/billing (85e2af5e)"), 2026-10-17.
- **Reason (Reviewer FAIL):** webhook idempotency ordering. The handler records the event
  receipt before processing; if processing throws, Stripe's redelivery is answered
  DUPLICATE → 200 and the update is never applied. Worst case: a lost
  `customer.subscription.deleted` leaves the workspace's plan row ACTIVE and the plan
  gate keeps granting a canceled workspace — fail-open in effect. (Muse cross-review
  BLOCKER B1 on PR #412; Grok's reviewer FAIL concurs: "webhook ordering".)
- **Second defect to fix before return:** the billing migration is not idempotent
  (noted in PR #421 status report §4).
- **Artifacts absent from this tree (verified at `a302c4e1`):**
  `app/api/billing/{checkout,status,webhook}/route.ts`; `lib/billing/{config,gate,index,plan-gate,prisma-store,stripe-api,webhook-events,webhook-signature}.ts`;
  `prisma/migrations/20261017160000_workspace_billing/`; the billing models in
  `prisma/schema.prisma` (removed by the same revert, −50 lines); `docs/billing/README.md`;
  `tests/billing/billing.test.ts`. No package dependency was involved — billing called
  Stripe over raw fetch; there is no `stripe` dependency to remove.
- **Return path:** fix the claim/process ordering (process-then-record, or a recoverable
  failed state that redelivery can retry) and the migration idempotency on PR #412
  itself, pass re-review, then re-merge into a future RC.

### #413 — Reports & export (CFO compliance/capacity export), branch `grok/reports-export`

- **Excluded by:** reverts `76f74caba2` ("Revert RC: merge #413 grok/reports-export @ 4cd6ca56")
  and `374f1d374f` ("Revert RC: merge grok/reports-export (e2079b4e)"), 2026-10-17.
  Two integrations were unwound: the RC merge of `grok/reports-export` and the RC merge
  of PR #413 itself; the tree at head contains neither.
- **Reason (Reviewer FAIL):** FCCR mislabel (a fixed-charge-coverage figure published
  under the wrong label semantics) and incurrence tests counted as covenants in the
  report population — either would publish wrong compliance content, so the export's
  gating discipline ("a number is published only with document+section source AND
  engine status MODELED") is not sufficient while its inputs are misclassified.
- **Artifacts absent from this tree (verified at `a302c4e1`):**
  `app/[companyId]/reports/{certificate,compliance,key-ratios}/route.ts`
  (plus the `calendar` route from the earlier reports-export merge);
  `lib/reports/{build,calendar,key-ratios,load,params,render-csv,render-pdf,types,ux-contract}.ts`;
  `tests/reports/{fixtures,report.test,routes-tenant.test}.ts`.
- **Consequences, stated plainly:** this RC has **no export path** (no JSON/CSV/PDF
  compliance or capacity export) and **no certificate / compliance / key-ratios
  endpoints**. #420's monitoring calendar is the only calendar in the RC.
- **Return path:** fix the FCCR labeling and the test-kind classification on PR #413
  itself, pass re-review, then re-merge into a future RC.

## Endpoint-less UI (present, and honestly so)

#414's certificate and key-ratios views (`components/ux/CertificateSheet.tsx`,
`components/ux/KeyRatios.tsx`) are present in this RC. They are prop-fed components;
they call no endpoint, and the #413 endpoints they were designed against are excluded
above. They render no invented figures (fail-closed: NOT EVALUATED / null per the status
report §4). They are not evidence that reporting is integrated.

## Absence audit (tree-wide, at `a302c4e1`)

Verified by full-tree search during the drift-correction review:

- No imports of `@/lib/billing` or `@/lib/reports` remain in any `.ts`/`.tsx` file.
- No route registrations, links, or fetches reference `/api/billing` or
  `/[companyId]/reports/*` anywhere in `app/`, `components/`, or `lib/`.
- `prisma/schema.prisma` contains no billing models; no billing migration directory exists.
- The only textual remnant is intentional: `tests/auth/tenant-path.test.ts` uses the
  path string `/c1/reports/compliance` as an illustrative tenant-path shape for the
  middleware gate (the gate is segment-wide by design). It asserts nothing about a
  reports feature and is left as-is deliberately.

## Known manifest inaccuracy outside this tree

PR #421's **title** still lists `#413 #412` among the integrated set and omits #420 and
#423, which are integrated. A branch commit cannot edit a PR title; the title should be
corrected (via the API) to:

`RC: integrated release candidate (release-1 + #398 #410 #415 #409 #392 #401 #414 #420 #423; #412/#413 excluded — see manifest) — DRAFT, do not merge`

Until then, this manifest and the §1 table of the PR body are the authoritative
integration record — not the title.
