# Proposed Schema — Neon-First Institutional Persistence

**PHASE:** P0/P1 design  
**STYLE:** Additive Prisma models only. No renames/drops of existing production columns.

## Design principles

1. **Reuse first:** `SemanticTruthRecord`, `AnalysisRun`, `ContractInputSnapshot*`, `ContractLedgerUsage*`, `Document*`, package-graph projections remain canonical for their domains.
2. **JSONB for evolving artifacts:** Full handoff/manifest/calculation payloads live in JSONB with a contentHash for idempotency.
3. **Relational for lifecycle:** companyId, status, authority class, asOf, fingerprints, supersession links are columns (indexed).
4. **Append-friendly history:** Supersession sets prior row `status=SUPERSEDED` and points `supersededById`; audit events are insert-only.
5. **Hypothetical isolation:** `TransactionSimulationRecord.mutatesActualLedger` is always `false` at the service layer.
6. **No secrets:** No tokens, passwords, or raw IdP credentials.
7. **Unauthenticated provenance:** Actor fields distinguish `UNAUTHENTICATED` / `SYSTEM` / future trusted issuer ids — never trust client-supplied reviewer names alone.

## New models

| Model | Purpose | Idempotency key |
|-------|---------|-----------------|
| OperativeAuthoritySnapshot | Durable OperativeHandoffBundle + caveats | (companyId, packageKey, asOfDate, contentHash) |
| ContextRetrievalManifest | Durable CovenantContextBundle | (companyId, bundleId, retrievalAlgorithmVersion, contentHash) |
| FinancialEvidenceBundle | Durable FinancialMetricEvidence set | (companyId, bundleKey, contentHash) |
| UtilizationCompletenessRecord | Durable completeness certificates | (companyId, capacityRuleId, asOfDate, contentHash) |
| CapacityCalculationRecord | Versioned capacity calc I/O | (companyId, calculationId, contentHash) |
| TransactionSimulationRecord | Hypothetical simulation archive | (companyId, simulationId, simulationHash) |
| InstitutionalAuditEvent | Append-only lifecycle audit | eventId unique |
| DependencyInvalidationRecord | Source→dependent invalidation log | surrogate id + indexes |

## Enums

- `IntelligenceLifecycleStatus`: ACTIVE, STALE, SUPERSEDED, REVOKED, INVALIDATED
- `IntelligenceAuthorityClass`: HYPOTHETICAL, COMPILED_UNVERIFIED, PROVISIONAL, REVIEW_REQUIRED, REFUSED, VERIFIED_CALCULATION, PRODUCTION_AUTHORITATIVE
- `InstitutionalAuditAction`: SUBMISSION, REVIEW, APPROVAL, REJECTION, SUPERSESSION, REVOCATION, RECLASSIFICATION, AUTHORITY_ACTIVATION, AUTHORITY_REFUSAL, DOCUMENT_REPLACEMENT, FINANCIAL_EVIDENCE_REVISION, CAPACITY_RECALCULATION, TRANSACTION_CONFIRMATION, PERSISTENCE_WRITE, INVALIDATION

## Indexes

- Tenant + as-of / status on every company-scoped artifact
- contentHash / inputHash for reuse lookups
- Audit: (companyId, occurredAt), (companyId, entityType, entityId)
- Invalidation: source and dependent entity indexes

## Rollback

Forward-only additive migration. Rollback = stop writing new tables; drop only on disposable DBs. No backfill of production companies required (zero rows at migrate time).
