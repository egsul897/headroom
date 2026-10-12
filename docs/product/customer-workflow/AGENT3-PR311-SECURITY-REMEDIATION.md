# Agent 3 — PR #311 P0/P1 security & authority remediation

## Verdict

**`PR_311_HUMAN_MERGE_READY_AFTER_SECURITY_REMEDIATION`** — pending exact-tip CI green and human review. Do not self-merge.

## SHAs

| Marker | SHA |
| --- | --- |
| Remediation start (PR tip before fix) | `12611f30b7209e825052be74e1a2bde662594eae` |
| Feature baseline | `92cd753909ace357fa0745bd8c77ea339f0dd40c` |
| Ending tip | *(branch tip after this remediation)* |

## P0 — authorization

- `gateWorkspaceAccess` loads `id` + `tenantKind` only, then decides.
- **CUSTOMER** → requires server-minted `VerifiedServerPrincipal` + `authorizeDecision` (companyScope).
- **EVALUATION** anonymous → only with verified `tenantKind === EVALUATION` **and** explicit `registerEvaluationAnonymousReadGrant` / `HEADROOM_EVAL_ANONYMOUS_READ_COMPANY_IDS`.
- Never infers demo from naming or missing principal.
- Grant alone cannot authorize a CUSTOMER workspace.
- `assembleCfoWorkflow` returns immediately on denial — no sensitive loaders.
- Pages map denial to `notFound()` (no blocker leakage).
- Production activation remains **BLOCKED**.

## P1 — synthetic authority removed

- Deleted synthetic `ProductCapacityView` manufacture in `claimsFromDashboardSide`.
- Dashboard `utilizationRemainingAuthority` ignored for AVAILABLE publication.
- Real views accepted only via `productCapacityBySide` / `verifiedRemainingBySide` → `toProductCapacityView`.
- Position sides / modeled rows refuse dashboard-flag upgrade.

## P1 — access gate ordering

Protected: Analyze, Review, Audit, Simulate, Documents, Position, Evidence — gate before loaders.

## Tests

| Suite | Role |
| --- | --- |
| `cfo-workflow-access-integration.test.ts` | DB-backed access + loader spy + authority adversarial |
| `cfo-workflow-e2e.test.tsx` | Presentation honesty (explicitly **not** browser/DB E2E) |

## Remaining blockers

1. No production IdP — CUSTOMER UI requires a registered `ServerIdentityProvider` in host.
2. Agent 2 `evaluateVerifiedRemainingCapacity` not merged — assembler accepts handoff when available.
3. Browser click-path still manual.
4. Exact-tip CI must be green before human merge.

## Non-claims

- No self-merge
- No production identity activation
- No production Neon writes
- No second authentication system
- No duplicate capacity engine
