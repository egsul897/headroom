# Agent 3 — PR #311 × #310 Integration

## Tip

Combined on `cursor/cfo-product-workflow-d829` after merging
`origin/cursor/autonomous-covenant-compilation-b53f` (`95cbfbc0`, PR #310 tip
including #304 VE Position feed).

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

## Not done in this commit

- Self-merge / production Neon writes / trusted-identity activation
- Genuine DB-backed or deployed-route acceptance (requires isolated env)
