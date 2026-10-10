# Agent #9 → Neon persistence handoff

**FINAL_VERDICT:** `AGENT_9_HANDOFF_COMPLETE`  
**Audience:** #294 Neon-first persistence owner  
**Not for:** restarting Agent #9 development, duplicating #279 contracts, or merging #281

| Pin | SHA / PR |
|---|---|
| Canonical source (Agent #9 integrated) | **#293** tip `2e8c9973ac05f729ec5096599c66dd7243d5dba8` |
| Agent #9 sole source (if #293 unmerged) | **#290** tip `a3706771d72ea2a9cdade28359e450e46ecd431e` |
| Persistence PR (this branch) | **#294** tip at doc commit (base was `11ca5f3c7f69ddc8b278c69c88c61c51076b9b23`) |
| Main at handoff | `4f1a0b81207364373d9a4cb9fe515d4a1a002e56` (Agent #9 **not** on main yet) |
| Superseded | **#281** — never import |

Agent #9 produces **in-memory** normalization only. #294 already provides durable homes for metric bundles, completeness certificates, and capacity calculations. This document maps producers → existing #294 models, names **genuine gaps**, and specifies call sites + disposable-Postgres tests.

---

## 1. Canonical data contracts

### 1.1 Normalized financial statement evidence

| Field | Value |
|---|---|
| **Producer** | `normalizeFinancialStatementEvidence` (`lib/capacity/financial-statement-ingestion.ts`) |
| **Primary type** | `FinancialStatementIngestionResult` → `snapshot: AuthenticatedFinancialSnapshotEvidence \| null` |
| **Supporting types** | `RawFinancialStatementLine`, `StatementMetricDefinitionMapping`, `StatementNormalizationTraceEntry`, `StatementCapacityMetricKey`, `AccountingDefinitionBasis`, `FinancialStatementFamily` |
| **Stable identity** | `snapshot.provenanceId` + per-metric `provenanceId` (`${provenanceId}:${lineId}:${metricKey}`) |
| **Tenant / company** | `input.companyId` / `snapshot.companyId` / `metric.entity.companyId` (must agree) |
| **Source document** | `metric.sourceDocument.{documentId,exactLocation,excerpt}` from `line.sourceDocumentId` |
| **As-of** | `snapshot.asOf` + `metric.measurementDate` + `reportingPeriod` |
| **Authority status** | `verificationStatus`, `authenticity`, optional claimed `issuer` (**never** trusted alone) |
| **Provenance** | `provenanceId`, consolidation perimeter, `definitionBasis` encoded into `accountingDefinition`, adjustments, restatement |
| **Versioning** | Content-addressed: changing any metric value/definition ⇒ new bundle content hash; prior ACTIVE superseded |
| **Consumers** | `validateAuthenticatedFinancialSnapshot`, `buildVerifiedCapacityInputHandoff`, #294 `persistFinancialEvidenceBundle` |

**Persist payload (recommended):** `AuthenticatedFinancialSnapshotEvidence` metrics array (+ optional audit sidecar: `trace`, `mappedRoles`, `unmappedLineIds`, `refusalReasons`).

### 1.2 Source-backed financial metrics

| Field | Value |
|---|---|
| **Producer** | Same ingestion path; validated by `validateFinancialMetricEvidence` / `validateAuthenticatedFinancialSnapshot` |
| **Type** | `FinancialMetricEvidence` (#279 `lib/capacity/financial-evidence.ts`) |
| **Stable identity** | `provenanceId` (opaque) + `(companyId, metricKey, reportingPeriod, measurementDate, sourceDocument.documentId, exactLocation)` |
| **Tenant / company** | `entity.companyId` |
| **Source document** | `sourceDocument` |
| **As-of** | `measurementDate` / `reportingPeriod` |
| **Authority status** | `verificationStatus` ∈ {UNVERIFIED_EXTRACTION, REVIEW_REQUIRED, VERIFIED, REJECTED}; `authenticity`; `amendmentRestatementStatus` |
| **Provenance** | `accountingDefinition` (must retain covenant meaning; GAAP vs CONTRACT_ADJUSTED), consolidation perimeter |
| **Versioning** | Bundle-level content hash over metrics; RESTATED/SUPERSEDED refuse production authority |
| **Consumers** | Agent #2 validators; VTE `adapters/financial-evidence.ts`; #294 FinancialEvidenceBundle |

**Do not** map GAAP `TOTAL_ASSETS` to covenant Total Consolidated Assets. Ingestion-local role `TOTAL_CONSOLIDATED_ASSETS` emits Agent #2 `OTHER` with marker `[COVENANT_TERM:TOTAL_CONSOLIDATED_ASSETS]` — preserve that marker in payload.

### 1.3 Historical transaction attribution

| Field | Value |
|---|---|
| **Producer** | Caller-supplied `HistoricalUtilizationEvent[]` into `reconstructUtilizationEvidence` |
| **Type** | `HistoricalUtilizationEvent` (+ `HistoricalUtilizationEventKind`, `SupersessionTreatment`) |
| **Stable identity** | `eventId` (immutable) |
| **Tenant / company** | `UtilizationReconstructionInput.companyId`; event `entityKey` |
| **Source document** | `sourceLabel` (filing/ledger citation string) — bind to Document ids when available |
| **As-of** | `effectiveDate`; reconstruction `asOf` |
| **Authority status** | `approvalState`, `authenticity` |
| **Provenance** | `kind`, `applicableProvisionId`, `sharedCapacityId`, `legacyBasketFamily`, `supersedesEventId`, `notes` |
| **Versioning** | Supersession via `SUPERSEDES_PRIOR` / `SUPERSEDED_BY_SUCCESSOR` / reclassification pairs — never silent delete |
| **Consumers** | Reconstruction → `UtilizationEvidenceRecord`; #294 should map attributed rows to **existing** `ContractLedgerUsage` (+ Event) |

### 1.4 Utilization reconstruction

| Field | Value |
|---|---|
| **Producer** | `reconstructUtilizationEvidence` → `toVerifiedUtilizationHandoffInput` |
| **Type** | `UtilizationReconstructionResult` |
| **Stable identity** | `(companyId, capacityRuleId, asOf, contentHash(events+cert))` |
| **Tenant / company** | `companyId` |
| **Source document** | Per-event `sourceLabel`; reconstruction `trace` |
| **As-of** | `asOf` |
| **Authority status** | `layers[]`, `unknownHistoricalActivity`, `reviewerConfirmedCompleteness`, `completenessCertificate` |
| **Provenance** | `evidenceObserved`, `usageAttributed`, `usageUnallocated`, `trace`, `blockers`, `note` |
| **Versioning** | New event set or cert ⇒ new content hash; UNKNOWN must survive reload |
| **Consumers** | `resolveUtilization`, `buildVerifiedCapacityInputHandoff`; ledger store for attributed records |

**Critical:** `UNKNOWN_HISTORICAL_ACTIVITY === true` must reload as UNKNOWN — never coerce to VERIFIED_ZERO / attributedAmount 0.

### 1.5 Completeness certificates and statuses

| Field | Value |
|---|---|
| **Producer** | Trusted authorized approver (not Agent #9). Reconstruction only **accepts** structurally reviewer-confirmed certs. |
| **Type** | `UtilizationCompletenessCertificate` (`lib/capacity/utilization-types.ts`) |
| **Stable identity** | `(companyId, capacityRuleId, asOf, contentHash(certificate))` — matches #294 unique key |
| **Tenant / company** | Persisted with `companyId` (cert itself lacks company — scope at write) |
| **Source document** | `sourceLabel` |
| **As-of** | `asOf` |
| **Authority status** | `approvalState`, `kind` (VERIFIED_EMPTY \| VERIFIED_COMPLETE), `authenticity`, claimed `issuer` |
| **Provenance** | Full certificate JSON in payload |
| **Versioning** | Supersede ACTIVE on content change; revoke blocks production (#294 `getProductionEligibleCompletenessRecord`) |
| **Consumers** | `evaluateCompletenessForRemainingClaim`, `resolveUtilization`, `mayUseAsProductionCapacityInput` |

**Missing cert must not become APPROVED on persist/reload.** Claimed issuer labels never mint trusted identity.

### 1.6 Authenticated calculation input snapshots

| Field | Value |
|---|---|
| **Producer** | `buildVerifiedCapacityInputHandoff` |
| **Type** | `VerifiedCapacityInputHandoff` (`verified-input-contract.v1`) |
| **Stable identity** | `(companyId, evaluationAsOf, contentHash(financial+utilization+requiredMetrics))` |
| **Tenant / company** | `companyId` |
| **Source document** | Embedded in `financial.snapshot.metrics[].sourceDocument` |
| **As-of** | `evaluationAsOf` |
| **Authority status** | `trustClasses`, `productionAuthority`, `productionActivation`, per-side blockers |
| **Provenance** | Full handoff JSON; financial provenanceId; utilization resolution note |
| **Versioning** | Persist as `CapacityCalculationRecord` input identity / trace; invalidate on input hash change |
| **Consumers** | VTE execute path; `mayUseAsProductionCapacityInput`; #294 `persistCapacityCalculation` |

---

## 2. Map to #294 (existing code paths)

### Direct coverage (use — do not rebuild)

| Agent #9 output | #294 model / service | Exact path |
|---|---|---|
| `FinancialMetricEvidence[]` / snapshot metrics | `FinancialEvidenceBundle` | `persistFinancialEvidenceBundle` / `getLatestFinancialEvidenceBundle` / `getFinancialEvidenceBundleById` / `revokeFinancialEvidenceBundle` — `lib/persistence/financial-evidence.ts` |
| `UtilizationCompletenessCertificate` | `UtilizationCompletenessRecord` | `persistUtilizationCompletenessRecord` / `getActiveCompletenessRecord` / `getProductionEligibleCompletenessRecord` / `revokeCompletenessRecord` — `lib/persistence/utilization-completeness.ts` |
| `VerifiedCapacityInputHandoff` + capacity outcomes | `CapacityCalculationRecord` | `persistCapacityCalculation` / `getLatestAuthorizedCapacityCalculation` — `lib/persistence/capacity-calculation.ts`; bridge `durablyRememberCapacityCalculation` |
| Attributed usage rows (`UtilizationEvidenceRecord` / ledger shape) | **Existing** `ContractLedgerUsage` + `ContractLedgerUsageEvent` | PrismaContractLedgerStore (main); do **not** invent a second ledger |
| NS-4 approved capacity inputs (parallel stack) | **Existing** `ContractInputSnapshot` + Fact + Event | Prefer for APPROVED capacity inputs; FinancialEvidenceBundle is audit/evidence envelope |
| Hypothetical simulation | `TransactionSimulationRecord` | `persistTransactionSimulation` / `durablyRememberSimulation` — **`mutatesActualLedger: false` enforced** |
| Invalidation | `DependencyInvalidationRecord` | `invalidateDependentArtifacts` — `lib/persistence/invalidation.ts` |

### Genuine schema / service gaps (additive only)

| Gap | Recommendation |
|---|---|
| **Ingestion audit sidecar** (raw lines, mappings, `trace`, `mappedRoles`, `unmappedLineIds`, refusalReasons) | Extend `FinancialEvidenceBundle.payload` JSON (or `sourceFingerprint`) — **no new table** |
| **Reconstruction envelope** (`layers`, `unknownHistoricalActivity`, `usageUnallocated`, reconstruction `trace`) | Prefer JSON sidecar on a completeness-adjacent record **or** `CapacityCalculationRecord.trace` / utilizationSnapshotIdentity payload. Only if product needs restart-safe reconstruction UI: additive nullable JSON column on `UtilizationCompletenessRecord` **or** single new `UtilizationReconstructionSnapshot` keyed by `(companyId, capacityRuleId, asOf, contentHash)` — **one** table max, not a parallel ledger |
| **HistoricalUtilizationEvent store before attribution** | Prefer map approved attributed events → `ContractLedgerUsage`; keep unallocated/UNKNOWN in reconstruction sidecar — **do not** duplicate ledger |
| **Wiring from Agent #9 producers → #294 writers** | Missing on #294 tip — product-bridge has operative/context/sim/capacity helpers but **no** `durablyRememberFinancialEvidence` / reconstruction helpers yet |

### Do not create

- Second financial-evidence contract / second capacity engine  
- Redundant tables overlapping `ContractLedgerUsage` or #279 types  
- Anything from superseded #281  

---

## 3. Durable execution handoff

### Authority invariants (must hold after reload)

1. Source evidence stays linked to original `documentId` / exactLocation.  
2. Normalized metrics retain covenant `accountingDefinition` / definitionBasis meaning.  
3. Historical utilization retains eventId, provision, supersession.  
4. `UNKNOWN_HISTORICAL_ACTIVITY` remains UNKNOWN (empty ledger ≠ zero).  
5. Missing completeness certificates stay missing — never auto-APPROVED.  
6. Hypothetical VTE / `TransactionSimulationRecord` never inserts `ContractLedgerUsage`.  
7. Stored `claimedReviewerLabel` / certificate `issuer` **never** bypasses `TRUSTED_ISSUER_ACTIVATION` or `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION` (both BLOCKED).  
8. Capacity results invalidated when financial bundle, ledger, or completeness contentHash changes.

### Recommended write call sites

| When | Call |
|---|---|
| After successful `normalizeFinancialStatementEvidence` (`ok === true`) in an authenticated server ingestion job | `persistFinancialEvidenceBundle(prisma, { companyId, bundleKey, asOfDate: snapshot.asOf, metrics: snapshot.metrics, claimedReviewerLabel?, actor })` — include ingestion sidecar in payload if extended |
| After ingestion refusal | Optional audit-only persist of refusal trace (status must not read as VERIFIED) **or** InstitutionalAuditEvent only |
| When persisting attributed reconstruction rows (`usageAttributed` / `utilizationRecords` with APPROVED + AUTHENTIC) | Existing ledger append API → `ContractLedgerUsage` (+ Event); honor supersession |
| When a trusted authorized completeness certificate is issued | `persistUtilizationCompletenessRecord` — **never** invent cert from empty UNKNOWN reconstruction |
| After `buildVerifiedCapacityInputHandoff` / VTE capacity outcome | `durablyRememberCapacityCalculation` / `persistCapacityCalculation` with `financialSnapshotIdentity` = bundle contentHash/id, `utilizationSnapshotIdentity` = completeness and/or reconstruction hash, `authorityClass` reflecting REFUSED/HYPOTHETICAL/REVIEW_REQUIRED as appropriate |
| After hypothetical `executeUnifiedVerifiedTransaction` | `durablyRememberSimulation(..., mutatesActualLedger: false)` only |
| On financial revision, cert revoke, or ledger supersede | `invalidateDependentArtifacts` for dependent `CapacityCalculationRecord`s |

**Suggested thin bridge additions** (persistence owner implements on #294 — not Agent #9):

```ts
// lib/persistence/product-bridge.ts (additive)
durablyRememberFinancialEvidence(prisma, { companyId, bundleKey, snapshot, ingestionAudit?, actor })
durablyRememberUtilizationReconstruction(prisma, { companyId, result, actor }) // sidecar + ledger projection
```

### Recommended read call sites

| Consumer | Read |
|---|---|
| Capacity / VTE server path | `getLatestFinancialEvidenceBundle` → rehydrate `FinancialMetricEvidence[]` → `validateAuthenticatedFinancialSnapshot` **before** trust |
| Remaining publication | `getProductionEligibleCompletenessRecord` + load ledger usages → `resolveUtilization` / `evaluateCompletenessForRemainingClaim` with host trustedIssuerAuth |
| Calculation reuse | `getLatestAuthorizedCapacityCalculation` / `getCapacityCalculationByInputHash` — never treat STALE/SUPERSEDED/INVALIDATED as current |
| Restart / audit UI | Bundle + reconstruction sidecar + audit events; rebuild handoff via `buildVerifiedCapacityInputHandoff` |
| Cross-tenant | All getters take `companyId` and `assertSameTenant` (#294 pattern) |

**Order of operations for authoritative remaining (still BLOCKED in prod):**

```
Documents → FinancialEvidenceBundle (metrics)
         → ContractLedgerUsage (attributed only)
         → UtilizationCompletenessRecord (optional; absent ⇒ UNKNOWN/incomplete)
         → buildVerifiedCapacityInputHandoff (in-memory gates)
         → CapacityCalculationRecord (result/refusal)
```

---

## 4. Required PostgreSQL acceptance tests

Use **disposable** Postgres (`tests/persistence/neon-first-acceptance.test.ts` pattern / `assertDisposableDatabase`). **No production Neon writes.**

| # | Test | Assertion |
|---|---|---|
| 1 | Financial evidence write/read/restart | Persist metrics from Matthews-shaped `AuthenticatedFinancialSnapshotEvidence`; reload by companyId+bundleKey; payload metrics + sourceDocument + accountingDefinition intact |
| 2 | Historical utilization write/read/restart | Persist attributed events via ContractLedgerUsage; reload; amounts/dates/provision/source preserved |
| 3 | UNKNOWN utilization preservation | Empty/partial reconstruction with `unknownHistoricalActivity: true` reloads UNKNOWN; `resolveUtilization` attributedAmount null; remaining refused |
| 4 | Incomplete evidence refusal after reload | UNVERIFIED_EXTRACTION bundle + no cert → `buildVerifiedCapacityInputHandoff` / `mayUseAsProductionCapacityInput` false after reload |
| 5 | Cross-tenant isolation | Company B cannot read/write Company A bundles/certs/ledger (#294 already has pattern) |
| 6 | Duplicate event idempotency | Same metrics contentHash / same usageId ⇒ created:false; no double-count |
| 7 | Historical correction / supersession | Superseding ledger row / revised financial bundle marks prior SUPERSEDED; history retained |
| 8 | Dependency invalidation | Financial revision or cert revoke → dependent CapacityCalculationRecord STALE/INVALIDATED |
| 9 | Source-provenance reconstruction | From durable rows alone, rebuild documentId + exactLocation + definitionBasis/covenant marker |
| 10 | Hypothetical simulation without ledger mutation | `persistTransactionSimulation` / VTE hypo path; ContractLedgerUsage row count unchanged |

Extend existing #294 tests 8–9, 14–18 rather than forking a second suite.

---

## 5. Ownership boundary

| Owner | Responsibility |
|---|---|
| Agent #9 | **CLOSED** — ingestion/reconstruction types + #293 integration verified |
| #294 persistence | Wire writers/readers, additive payload fields, disposable Postgres tests, invalidation |
| Human | Merge #290/#293/#294 under branch protection |
| Never | Self-merge, production activation, paid inference to reconstruct evidence, import #281 |

**HANDOFF_DESTINATION:** `docs/persistence/06-agent9-financial-utilization-handoff.md` (this file) on PR **#294**.
