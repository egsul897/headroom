# Agent 3 — PR #311 × #310 Integration

## Tip

Combined SHA: `2a1e7a3ea86a353704de531b1c8e8a3cb59d9c51` on
`cursor/cfo-product-workflow-d829` after merging
`origin/cursor/autonomous-covenant-compilation-b53f` (`95cbfbc0`, PR #310 tip
including #304 VE Position feed). Parents: `e94b5f2f` (#311 remediation) +
`95cbfbc0` (#310).

## Position page resolution

File: `app/[companyId]/position/page.tsx`

| Preserve from #311 | Absorb from #310 / #304 |
|---|---|
| `assertCfoPageAccessOrNotFound` before loaders | `loadAuthenticDashboardSlice` |
| `SeparatedCapacityPanel` + `separateCapacityClaimsFromProductView` | VE / Phase 3 authentic cards |
| `remainingIsAuthoritative: false` (dashboard flags alone never AVAILABLE) | SOURCE_BACKED_COMPILED_GROSS overlay when VE metrics feed Position |
| Audit CTA / WorkflowJourney | Offline readiness try/catch + authentic slice fallback |

## Security invariants retained

- Anonymous CUSTOMER denial
- Explicit EVALUATION anonymous-read grants only
- Server-minted principal validation
- Authorization before sensitive loaders
- Real `ProductCapacityView` required for AVAILABLE; synthetic manufacture deleted
- Shared Position/Simulate capacity semantics

## Local combined regressions (this tip)

| Suite | Result |
|---|---|
| `cfo-workflow-access-integration` | 12/12 |
| `cfo-workflow-e2e` (presentation honesty) | 19/19 |
| `ve-position-matthews-mhk-acceptance` | 7/7 |
| `fixed-dollar-candidate-discovery` | 5/5 |
| `autonomous-compilation-pipeline` | 5/5 |
| `compile-operative-covenant-package` | 5/5 |
| `operative-covenant-package-remediation` | 14/14 |
| `real-dashboard-vertical-slice-acceptance-adversarial` | 17/17 |
| `real-dashboard-vertical-slice.e2e` | 9/9 |
| `verified-executable-multipackage` | 4/4 |
| `home-overview-empty` | 10/10 |
| **Total (combined run)** | **98/98** (+9 e2e in follow-up = 107 unique) |
| `tsc --noEmit` | clean |

## Not done in this commit

- Self-merge / production Neon writes / trusted-identity activation
- Genuine DB-backed or deployed-route acceptance: `DATABASE_URL` points at
  Neon `ep-shiny-rice-…-pooler` (production-class). No isolated DB/deployed
  route available in this environment — acceptance not added (would risk
  production Neon writes). Access integration tests continue to use injectable
  `companyIdentityLoader` stubs.
