# P1 Authorization Integrity Correction (#348 handoff)

**Baseline:** `a19c9a95a71d7df283adae6bd6afd099d372277f`  
**Production identity:** not activated (`TRUSTED_ISSUER_ACTIVATION` remains BLOCKED)

## Defects corrected

1. **Post-seal mutation** — authorization reads privately retained `SealedPermissionEvidence` (WeakMap), never mutable handoff fields.
2. **Identity binding** — seal captures company, instrument, packageHash, transaction id/type/amount/currency/date, selected path/rules, operative document, financial provenance ids.
3. **Replay** — `verifiedSubject` must match sealed evidence; cross-transaction / cross-package mismatches refuse `packagePermitted`.
4. **Domain gate** — `packagePermitted` requires every applicable mandatory domain not PARTIAL / UNSUPPORTED / NOT_IMPLEMENTED / blocked / not_tested / review_required.
5. **Branding helper** — `brandCanonical…` requires the execute-module mint capability; fake minters do not write WeakMap authenticity. Not re-exported from the VTE public index.
6. **ACTIVE test injection** — `injectTrustedIssuerRepoActivationForTests` overrides effective repo activation without flipping the production constant.

## Evidence

- Failing-before: `docs/product/p1-authz-integrity-failing-before.json`
- Passing-after: `docs/product/p1-authz-integrity-passing-after.json`
- Adversarial tests: `tests/product/p1-authorization-integrity.test.ts`
