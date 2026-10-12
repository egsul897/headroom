# PR #310 Remediation Report

## SHAs (at remediation tip)

| Ref | SHA |
|---|---|
| `origin/main` | `67027b8f499921a12cee7b9b9f04d832898b6384` |
| PR #304 head | `61a61d17f698c95cb016144e7af3e5090ef71a11` |
| PR #310 base | #304 tip (rebased) |
| PR #310 tip | `f5ca1b7ad55b18b09aafc45973f7b01162b92e82` |

## Merge dependency

**Do not merge #310 before #304.** Stacked on `cursor/real-covenant-dashboard-slice-2ca3`. No self-merge. No production Neon writes / authority activation.

## P0 — environment mutation removed

- Removed `delete process.env.AI_GATEWAY_API_KEY` / `ANTHROPIC_API_KEY` from `operative-covenant-package.ts`.
- Added `executionMode: "PROVIDER_FREE" | "AUTHORIZED_PAID"` with `createProviderFreeStageCaller()` injection.
- Tests prove env unchanged, concurrent compiles safe, AUTHORIZED_PAID requires `authorizationRef`, paidInferenceUsed stays false with synthetic callers.

## P1 — independent omission coverage

- `auditIndependentSourceCoverage` dispositions: `DISCOVERED_AND_EXECUTABLE` / `DISCOVERED_BUT_UNSUPPORTED` / `EXPECTED_BUT_NOT_DISCOVERED` / `NOT_ASSESSED`.
- Inventories in `tests/fixtures/autonomous-covenant-compilation/independent-structural-inventory.ts` (hand-authored; not from discovery code).
- Discovered-but-unsupported is **not** counted as omission success.

## P1 — operative authority

- Executable units carry `governingDocumentId`, `operativeAuthorityClassification`, `governingAuthorityConfirmed`, source spans.
- Section-catalog span lookup fixed (`7.01(i)` vs `Section 7.01 Exceptions(i)`).
- #306 later-unresolved competitor guard re-locked in remediation tests.
- Wrong-document budget memo → zero VE elevation.

## P1 — compilation fidelity

- Residual kinds extended: `NO_DEFAULT_CONDITION`, `ENTITY_SCOPE`, `ELIGIBILITY_RESTRICTION`, `CROSS_DOCUMENT_RESTRICTION`.
- `unconditionalPermission: false` always on GROSS units; residuals surfaced.
- Adversarial: no-default + eligibility; shared-cap combine.

## Ratio extension (bounded)

- `lib/contract-model/compiler/ratio-incurrence/` — classify + compile.
- Fully specified structure → `RATIO_STRUCTURE_CANDIDATE` only with closed definitions.
- Numeric capacity always `REFUSED_PENDING_FINANCIAL_SNAPSHOT`.
- No hardcoded Matthews thresholds (synthetic 2.25x in tests).

## Capability verdict

**`AUTONOMOUS_COVENANT_COMPILATION_PROVEN` = PARTIAL** (unchanged honesty)

P0/P1 remediations strengthen trustworthiness of the generalized compiler path; full PROVEN still blocked by ratio numeric VE + production gates + leaf hand-encoding on #304 Position path.
