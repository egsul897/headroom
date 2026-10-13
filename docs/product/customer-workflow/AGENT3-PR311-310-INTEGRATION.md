# Agent 3 — PR #311 × #310 Integration

## Tip

P0 drift correction on `cursor/cfo-product-workflow-d829` after absorbing
#310 tip `57adade3377cc975e6c2543f80d6661fc753e163`.

| Layer | SHA | Notes |
|---|---|---|
| Prior combined merge | `2a1e7a3e` | Merged stale #310 tip `95cbfbc0` only |
| Docs pin of prior merge | `773bea16` | Recorded suites before drift correction |
| **#310 safety tip absorbed** | `57adade3` | Provision-identity authority + VE provider-free |
| **#311 code absorb** | `ca5b7ddcc88d19561d049e4766da9231ec4339c7` | Three safety files byte-match #310 `57adade3` |
| **#311 tip (docs pin)** | `27a7686c626e8a9be1e0480d55d753fae73cbf51` | Pins absorb SHA + 89/89 evidence |
| **#311 tip (+ #312 claimKind)** | `02fb139623ff64780c0c438a8ce3636084562aea` | Safety blobs still match `57adade3`; CI green |

## Position page resolution

File: `app/[companyId]/position/page.tsx`

| Preserve from #311 | Absorb from #310 / #304 |
|---|---|
| `assertCfoPageAccessOrNotFound` before loaders | `loadAuthenticDashboardSlice` |
| `SeparatedCapacityPanel` + `separateCapacityClaimsFromProductView` | VE / Phase 3 authentic cards |
| `remainingIsAuthoritative: false` (dashboard flags alone never AVAILABLE) | SOURCE_BACKED_COMPILED_GROSS overlay when VE metrics feed Position |
| Audit CTA / WorkflowJourney | Offline readiness try/catch + authentic slice fallback |

## Security invariants retained (#311)

- Anonymous CUSTOMER denial
- Explicit EVALUATION anonymous-read grants only
- Server-minted principal validation
- Authorization before sensitive loaders
- Real `ProductCapacityView` required for AVAILABLE; synthetic manufacture deleted
- Shared Position/Simulate capacity semantics

## P0 drift correction (absorb #310 `57adade3`)

Independent audit: #311 had merged stale #310 `95cbfbc0`, omitting `57adade3`.

| File | Correction | Match to #310 `57adade3` |
|---|---|---|
| `lib/contract-model/analysis/operative-covenant-package.ts` | `provisionIdentityMatchesUnit` — section/defined-term only; no document-only authority inheritance | byte-identical |
| `lib/product/real-dashboard-vertical-slice/verified-executable-compile-core.ts` | No `process.env` credential deletion; provider-free local IR path | byte-identical |
| `tests/product/operative-covenant-package-remediation.test.ts` | Adversarial provision-identity + concurrent VE env tests | byte-identical |

`lib/customer-workflow/**` authorization / CFO workflow files were **not** rewritten by this correction.

## Local combined regressions (this tip)

| Suite | Result |
|---|---|
| `cfo-workflow-access-integration` | 12/12 |
| `cfo-workflow-e2e` | 19/19 |
| `operative-covenant-package-remediation` | 19/19 (includes new P0 identity + VE concurrency) |
| `compile-operative-covenant-package` | 5/5 |
| `autonomous-compilation-pipeline` | 5/5 |
| `fixed-dollar-candidate-discovery` | 5/5 |
| `ve-position-matthews-mhk-acceptance` | 7/7 |
| `real-dashboard-vertical-slice-acceptance-adversarial` | 17/17 |
| **Total** | **89/89** |

## Exact-tip CI (`02fb1396`)

| Check | Conclusion | Run |
|---|---|---|
| canonical-compiler / certified path (provider-free) | SUCCESS | 38303135124 |
| home-overview / home overview (soft gate) | SUCCESS | 38303135223 |

### Independent re-verification (final compiler reconciliation)

Against #310 `57adade3` and tip `02fb1396`:

- `operative-covenant-package.ts` blob **identical** — `provisionIdentityMatchesUnit` only; no `governingDocumentId === unit.documentId` document-only match
- `verified-executable-compile-core.ts` blob **identical** — no `delete process.env.*`
- Remediation test file blob **identical** (adversarial provision-identity + VE credential concurrency)
- Targeted suite this turn: **86/86** (access 12 + e2e 19 + remediation 19 + compile 5 + pipeline 5 + discovery 5 + VE Position 7 + VE multipackage 4 + home-overview 10)

Residual (also on #310 tip, out of scope for the two named regressions): `phase3-compile-bridge.ts` still deletes `AI_GATEWAY_API_KEY` / `ANTHROPIC_API_KEY`.

## Reconcile with #312 (authoritative Position compile path)

- `status-contract` gains `claimKind: "HYPOTHETICAL"` so MODELED_HYPOTHETICAL
  cannot be presented as GROSS_CONTRACTUAL when #312 operative-package feed lands.
- #311 retains `capacity-state` / workspace-access / assemble-cfo-workflow.
- Authoritative discovery→compile→Position path remains **#312** (absorbs #310
  `57adade3`); #313 is superseded. Human merge: #312 before #311.

## Not done

- Self-merge / production Neon writes / trusted-identity activation
- Genuine DB-backed or deployed-route acceptance against production Neon
- Position page conflict resolution vs #312 at human merge time
