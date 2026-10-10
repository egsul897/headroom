# Persistence Dependency Map

**PHASE:** P0  
**STARTING_MAIN_SHA:** `4f1a0b81207364373d9a4cb9fe515d4a1a002e56`

## Dependency DAG (institutional memory)

```
Document bytes + Document metadata
        │
        ├─► Package graph projections (edges, instruments, amendment effects)
        │         │
        │         └─► OperativeAuthoritySnapshot  ◄── asOf + authority caveats
        │
        ├─► Structural index / DefinedTermNode / ContractRule
        │         │
        │         └─► ContextRetrievalManifest  ◄── bundleId + algorithm version
        │                   │
        │                   └─► SemanticTruthRecord (existing; VERIFIED gated)
        │
        ├─► Financial documents / extractions facts
        │         │
        │         ├─► ContractInputSnapshot (NS-4, existing)
        │         └─► FinancialEvidenceBundle (new)
        │
        └─► Historical transactions
                  │
                  ├─► ContractLedgerUsage (existing)
                  └─► UtilizationCompletenessRecord (new)

OperativeAuthoritySnapshot + SemanticTruthRecord + FinancialEvidenceBundle
+ UtilizationCompletenessRecord + ContractLedgerUsage
        │
        └─► CapacityCalculationRecord
                  │
                  └─► TransactionSimulationRecord (hypothetical only; never ledger write)

Any source fingerprint change
        │
        └─► DependencyInvalidationRecord → mark dependents STALE/INVALIDATED
                  │
                  └─► InstitutionalAuditEvent (append-only)
```

## Invalidation edges

| Source change | Invalidates (current authority only; history retained) |
|---------------|--------------------------------------------------------|
| Document bytes / contentHash | Context manifests reading that document; operative snapshots for package; semantic truth for instrument |
| Amendment edge / effect | OperativeAuthoritySnapshot; context manifests; calculations citing that handoff |
| Semantic truth contentHash / trustStatus | CapacityCalculationRecord with that verifiedIrIdentity |
| Financial evidence revision / NS-4 supersession | Calculations and simulations bound to prior financial identity |
| Completeness certificate revoke | Production-authoritative remaining calculations |
| Ledger usage append/supersede | Utilization-dependent calculations (not historical simulation records) |
| Engine / retrieval algorithm version bump | Reuse of prior results as *current* authority |

## Authority classes (never collapsed)

| Class | May authorize production capacity? |
|-------|------------------------------------|
| HYPOTHETICAL | No |
| COMPILED_UNVERIFIED | No |
| PROVISIONAL | No |
| REVIEW_REQUIRED | No |
| REFUSED | No |
| VERIFIED_CALCULATION | Only with dual trusted gates (#268/#282) still open → remains BLOCKED |
| PRODUCTION_AUTHORITATIVE | Blocked until real identity + issuer authority |

## Phase ownership

| Phase | Owns | Depends on |
|-------|------|------------|
| P0 | Matrix, DAG, schema design, migration plan | main inventory |
| P1 | OperativeAuthoritySnapshot, ContextRetrievalManifest, audit hooks for legal writes | P0; reuses SemanticTruthRecord |
| P2 | FinancialEvidenceBundle, UtilizationCompletenessRecord | P1 identities; NS-4 + ledger stores |
| P3 | CapacityCalculationRecord, TransactionSimulationRecord | P1+P2 identities |
| P4 | DependencyInvalidationRecord, as-of reconstruction, supersession APIs | P1–P3 |
| P5 | Position/Ask/Simulate/background wiring | P1–P4 services |
| P6 | Disposable Postgres acceptance matrix | All prior |
