# Schema Audit — Eight Institutional Persistence Models (P5)

**Audited tip:** branch `cursor/neon-first-persistence-e925` (post-#293 merge)  
**Migration:** `20261010160000_institutional_intelligence_persistence`  
**PRODUCTION_DB_TOUCHED:** NO

## Intervening #294 commits (30fd75b8 → 11ca5f3c)

| SHA | Change | Risk |
|-----|--------|------|
| `11ca5f3c` | docs only — record CI SUCCESS | None — no schema, no DB ops, no authority promotion |

Confirmed: no unreviewed migration, production write, or authority promotion between the previously reported tip and the independently observed tip.

## Per-model audit

| Model | Tenant | FKs | Identity / uniqueness | History | Provenance | Audit | Idempotency | Supersession | Indexes | Verdict |
|-------|--------|-----|----------------------|---------|------------|-------|-------------|--------------|---------|---------|
| OperativeAuthoritySnapshot | companyId → Company CASCADE | Yes | (companyId, packageKey, asOfDate, contentHash) | status + supersededById | sourceFingerprint JSON + payload | InstitutionalAuditEvent | contentHash unique | ACTIVE → SUPERSEDED | company/package/asOf/status | PASS |
| ContextRetrievalManifest | companyId → Company | Yes | (companyId, bundleId, algorithm, contentHash) | status + supersededById | sourceFingerprint | audit on write | contentHash | yes | company/package/status, contentHash | PASS |
| FinancialEvidenceBundle | companyId → Company | Yes | (companyId, bundleKey, contentHash) | SUPERSEDED / REVOKED | sourceFingerprint + metric definitions | FINANCIAL_EVIDENCE_REVISION | contentHash | yes | asOf/status, verification | PASS |
| UtilizationCompletenessRecord | companyId → Company | Yes | (companyId, capacityRuleId, asOf, contentHash) | SUPERSEDED / REVOKED + revokedAt | payload fingerprint | REVOCATION | contentHash | yes | rule/status, asOf | PASS |
| CapacityCalculationRecord | companyId → Company | Yes | (companyId, calculationId, contentHash) | SUPERSEDED / STALE | inputHash + IR/financial/util identities | CAPACITY_RECALCULATION | contentHash + inputHash | yes | asOf/authority/status, inputHash | PASS |
| TransactionSimulationRecord | companyId → Company | Yes | (companyId, simulationId, simulationHash) | STALE allowed; history kept | payload + postStateIdentity | PERSISTENCE_WRITE | simulationHash | N/A (hypo) | transactionId, status | PASS — mutatesActualLedger forced false |
| InstitutionalAuditEvent | companyId → Company | Yes | eventId unique | append-only (app never updates) | actorProvenance (never client auth) | self | eventId | N/A | company/occurredAt, entity | PASS |
| DependencyInvalidationRecord | companyId → Company | Yes | surrogate id | append-only log | before/after fingerprints | INVALIDATION | N/A | marks dependents | source + dependent indexes | PASS |

## JSONB vs relational

Queryable lifecycle/identity fields are columns (companyId, status, hashes, asOf, authorityClass). Evolving artifacts (handoffs, manifests, engine traces) remain JSONB — appropriate. No additional tables warranted solely to inflate object counts.

## Product wiring (P5)

`executeAndPersistUnifiedVerifiedTransaction` persists the minimum sufficient set:

1. Operative claim snapshot  
2. Financial evidence bundle  
3. Utilization completeness (when present)  
4. Capacity calculation (including refusals)  
5. Hypothetical simulation (never ledger)  
6. Institutional audit with Position/Ask/Simulate traceIds  

## Gaps remaining (not schema defects)

- Deep UI page wiring (Position/Ask/Simulate SSR still use pre-VTE bridges on #293)  
- Shared-capacity IR rows in SemanticTruthRecord  
- Durable IdP membership (deferred to #282 workstream)  
