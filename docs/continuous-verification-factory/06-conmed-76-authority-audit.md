# CONMED §7.6 Final Authority-Boundary Audit

**Starting SHA:** `368fc1d54e760b50bf0134f52f9cfbeca69da10e`  
**Ending SHA:** `fc7ec44f6d7610c7568b75c677282a478be58ee1` (typecheck-clean authority tip)  
**PR:** #238

## Verdict

**CONMED_76_CORRECTION_SAFE_FOR_HUMAN_REVIEW**

Hypothetical PERMITTED under stipulated facts is labeled and cannot be treated as verified production capacity. Existing Ask/API/certified paths do not accept caller `knownFacts`. Soft/cert hardness unchanged.

## 1. Caller / authority-path analysis

| Caller | Injects knownFacts? | Surfaces as production capacity? |
|--------|---------------------|----------------------------------|
| `app/api/ask/transaction` | **No** — body accepts only companyId/question/sourceId/confirmed; no provisions or knownFacts | Answer kinds are `certified` / `legacy_labeled` / `insufficient_evidence` / `review_required` — never maps `crossDocumentVerdict.overallResult` to certified capacity |
| `analyzeContemplatedTransaction` | Only if caller supplies `crossDocumentProvisions`; uses `contemplatedFromAskDraft` which **omits knownFacts** | `permissionLayers.legacyIsCertifiedPackagePermission === false`; certified answer only from `certifiedAttempt.capacity.outcome === EXECUTED` |
| Sequential demo | `noDefault` only; `postsToLedger: false` | Hypothetical isolation |
| CVF / authentic runners / tests | Yes (labeled) | Verification harness only |
| `app/` UI components | No references to `crossDocumentVerdict` / `permissionLayers` | N/A |

## 2. Existing protections (demonstrated)

1. Ask API cannot pass `knownFacts` or `crossDocumentProvisions` (`app/api/ask/transaction/route.ts`).
2. `contemplatedFromAskDraft` never sets `knownFacts`.
3. Certified answer path requires verified-execution EXECUTED — not cross-document overallResult.
4. Permission layers always set `legacyIsCertifiedPackagePermission: false`.
5. Sequential / numerical layers: `postsToLedger: false`.

## 3. Counterexample + minimal safeguard

**Reproduced (pre-fix):** `knownFacts: { seniorSecuredLeverage: 3.0, noEventOfDefault: true }` → `overallResult: PERMITTED` with no authority label.

**Safeguard added (generalized, not issuer-specific):**

- `conditionEvidenceAuthority` / `legalOutcomeAuthority` / `isVerifiedProductionCapacity` on every verdict.
- Caller-cleared conditions → `HYPOTHETICAL_UNDER_STIPULATED_FACTS` + `isVerifiedProductionCapacity: false`.
- CSSLR requires `seniorSecuredLeverageIsProFormaForContemplatedTransaction: true` (historical/unattested ratio insufficient).
- Event of Default requires explicit `noEventOfDefault` (bare `noDefault` does not clear EOD).
- Stale `financialSnapshotAsOf` without pro forma attestation → unresolved.
- `VERIFIED_PRODUCTION_CAPACITY` is never set from knownFacts (no invented certificates).

## 4–5. Preserved legal corrections

- §7.6(d) finite $40M basket retained separately from §7.6(e) unlimited conditional path.
- Investment (§7.8) PERMISSION remains INAPPLICABLE for `RESTRICTED_PAYMENT`.

## 6–8. Adversarial matrix

| Case | Expected | Authority |
|------|----------|-----------|
| CSSLR 3.49 / 3.50 pro forma + no EOD | PERMITTED | Hypothetical |
| CSSLR 3.51 | CONDITIONALLY_PERMITTED | — |
| Missing ratio / missing EOD / affirmative EOD | CONDITIONALLY_PERMITTED | — |
| Stale snapshot / unauthenticated historical ratio | CONDITIONALLY_PERMITTED | — |
| §7.6(d) only exceeded | PROHIBITED | — |

Probe: **11/11 OK** (`ADVERSARIAL_MATRIX_OK`). Conjunction: applicable prohibitions still collapse false PERMITTED.

## 9–10. Regressions / boundaries

| Suite | Result |
|-------|--------|
| `test:cvf` | 15/15 pass |
| `cvf:pr-fast` | 110 executions; incorrectFavorable **0**; unexpected **0** |
| Cross-document + sequential (provider-free) | 96 pass / 2 skip (Ask/DB) |
| Authority unit tests | 24/24 pass |
| `test:phase3-certification` | 481/481 pass |
| Phase-4 bypass (§17) | pass — CVF harness exempted as non-product surface; capacity-a8 keeps production-binding import |

- Phase 3 certification, Phase 4 verified-capacity, utilization-authenticity unchanged.
- Soft gates remain soft; no REQUIRE weakening; no Neon / paid inference / auto-merge.
- Pre-existing unrelated product failures (nav label, authenticated-VEP offline expectations, product-acceptance defect register drift) are out of scope and unchanged by this tip.

## Remaining limitations

1. Hypothetical PERMITTED remains available to harness/tests under stipulated facts — by design, labeled, never verified capacity.
2. No path yet upgrades stipulated CSSLR/EOD to authenticated approved financial evidence (`AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE` reserved).
3. Ask/DB product tests skip without reachable DATABASE_URL (soft-gate stays provider-free).
4. #238 still depends on unmerged Agent 5 / #218 base.
