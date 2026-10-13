# Agent 3 — End-to-end CFO product workflow

## Mission

Connect Headroom’s existing product interfaces into Upload → Analyze → Review → Position → Simulate → Audit without building another dashboard prototype.

## SHAs

| | SHA |
|---|---|
| Starting (main) | `67027b8f499921a12cee7b9b9f04d832898b6384` |
| Feature commit | `92cd753909ace357fa0745bd8c77ea339f0dd40c` |
| Branch tip | see `git rev-parse origin/cursor/cfo-product-workflow-d829` |

## Coordination

- Inspected PR #304 (Matthews restricted slice / fixed-dollar VE) — consumed honesty contracts only; did not merge issuer-specific UI.
- Agents 1 (autonomous compilation) and 2 (verified remaining) had no branch/diff yet at implementation time. Workflow consumes main’s `ProductCapacityView` / capacity readiness / status contract and leaves separated-claim slots for their outputs.
- Prior HEADROOM-4 status contract and customer-workflow assemblers preserved.

## Screens / routes connected

| Step | Route | Backend interfaces |
|---|---|---|
| Upload | `/{companyId}/documents` (+ onboarding upload) | `getDocumentDetails`, `listCustomerDocumentIntelligence`, `getLatestAmendmentPackage` |
| Analyze | `/{companyId}/analyze` | same + `loadCapacityReadiness` via `assembleCfoWorkflow` |
| Review | `/{companyId}/review` (+ rulebook / evidence) | `loadRulebookReadiness`, `loadCovenantReviewWorkspace`, `listReviewerApprovals`, evidence assembler |
| Position | `/{companyId}/position` | `getCompanyDashboard`, capacity readiness, rulebook, `separateCapacityClaimsFromProductView` |
| Simulate | `/{companyId}/simulate` | same capacity state + `attemptVerifiedSimulate` |
| Audit | `/{companyId}/audit` | assembled analyze/review/capacity + trusted-identity activation |

Orchestrator: `lib/customer-workflow/assemble-cfo-workflow.ts`  
Journey: `lib/customer-workflow/journey.ts`  
Nav: `lib/home/nav.ts` (CFO journey first)

## Honesty constraints enforced

- Upload ≠ analysis success
- No fabricated REVIEWED / APPROVED
- Gross / modeled / verified remaining / unknown shown separately
- Null remaining never converted to modeled
- Simulate `postsToLedger: false`
- Audit `publishability.publishable: false` while trusted identity BLOCKED
- No Matthews/MHK `companyId` branches in generic workflow modules
- Compilation limitations surfaced when `canEvaluateExecutableCapacity === false`

## E2E tests

`tests/product/cfo-workflow-e2e.test.tsx` (+ updated adversarial / conmed nav tests)

Coverage:

- New company onboarding empty package
- Authentic document upload (receipt only)
- Extraction failure
- Unresolved amendment
- Missing financial evidence
- Missing utilization completeness
- Unsupported covenant
- Valid hypothetical simulation
- Cross-tenant access refusal
- Consistent Position and Simulate results
- Matthews fixture + CONMED second issuer via same assemblers

## Remaining manual steps

1. Wire production IdP (trusted identity remains BLOCKED)
2. Merge / consume Agents 1–2 when they publish generalized compile + verified remaining into `ProductCapacityView`
3. Optional: remove legacy CONMED demo branch in Position/Documents once package facts flow through generic assemblers
4. Browser click-path QA on a live Neon workspace (not covered by vitest)

## What a CFO can accomplish today

1. Create a workspace and upload a debt-document package
2. See truthful processing state (received / analyzing / failed / unsupported / OA uncertainty)
3. Review governing docs, covenant items, rulebook stage, financial/utilization gaps without fabricated approvals
4. View Position with separated capacity claims from the shared engine (typically MODELED / NOT VERIFIED)
5. Run a hypothetical Simulate on the same capacity state without ledger mutation
6. Read an Audit trail explaining why results are not publishable as AVAILABLE

**Not production-ready** for trusted AVAILABLE remaining while identity and evidence gates remain blocked.
