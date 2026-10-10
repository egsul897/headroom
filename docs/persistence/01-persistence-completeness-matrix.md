# Persistence Completeness Matrix

**PHASE:** P0 — Inventory and design  
**STARTING_MAIN_SHA:** `4f1a0b81207364373d9a4cb9fe515d4a1a002e56`  
**AUDITED_AT:** 2026-10-10  
**PRODUCTION_DB_TOUCHED:** NO  

## Method

Classification requires evidence of a working write path **and** read path against PostgreSQL (Prisma). A Prisma model alone is not sufficient. Related open workstreams inspected without merging or duplicating:

| PR | Branch | Merged? | Schema churn | Guidance |
|----|--------|---------|--------------|----------|
| #282 | trusted-identity-boundary | No | None | Reuse adapter contracts; durable IdP membership deferred |
| #283 | operative-restatement-authority | No | None | Compiler logic only; handoff still ephemeral on main |
| #285 | unified-transaction-execution | No | None | Explicitly does not write production DB |
| #287 | recursive-legal-context | No | None | Manifests hash-keyed; no Prisma home |
| #290 | financial-evidence-integration | No | None | Pure normalization; no new tables |
| #291 | disposable-eval-db-persistence | No (draft) | None | Docs proof of existing package-graph identity suite |
| #293 | canonical-product-integration | No (draft) | None | Integrates above; wait/absorb, do not fork |

Frozen/superseded: never import #281 or #246.

## Classification legend

| Class | Meaning |
|-------|---------|
| DURABLY_PERSISTED | Working Prisma write + read; survives restart |
| PARTIALLY_PERSISTED | Some fields/paths durable; material gaps remain |
| IN_MEMORY_ONLY | Process-local only |
| FILE_ONLY | Filesystem/git artifacts, not Neon |
| RECOMPUTED_ON_DEMAND | Derived at read time from durable inputs |
| MISSING | Required for institutional memory; no store |
| NOT_APPROPRIATE_FOR_PERSISTENCE | Secrets, scratch, redundant blobs |

---

## Matrix

### Company / tenant identity

| Domain object | Canonical TS type | DB model | Migration | Write | Read | Tenant | Version | Provenance | History | Invalidation | Restart | Paid inference to reconstruct? | Gap | Remediation | Class |
|---------------|-------------------|----------|-----------|-------|------|--------|---------|------------|---------|--------------|---------|--------------------------------|-----|-------------|-------|
| Company workspace | `@prisma/client` Company | Company | foundation | onboarding / seed | company loaders | self | updatedAt | name/ticker/cik | row update (no event log) | N/A | yes | no | No append-only tenant audit | Keep; audit via InstitutionalAuditEvent | DURABLY_PERSISTED |
| Tenant kind | CompanyTenantKind | Company.tenantKind | 20260826020000 | create/update | filters | companyId | — | — | — | — | yes | no | — | — | DURABLY_PERSISTED |

### Documents and package intelligence

| Domain object | Canonical TS type | DB model | Migration | Write | Read | Tenant | Version | Provenance | History | Invalidation | Restart | Paid inference? | Gap | Remediation | Class |
|---------------|-------------------|----------|-----------|-------|------|--------|---------|------------|---------|--------------|---------|-----------------|-----|-------------|-------|
| Document metadata | Document | Document | foundation+ | `uploadAndChunkDocument` | loaders / package graph | companyId | effectiveFrom/To, supersedesDocumentId | storageRef, source | amendment edges preserve prior docs | typeConfirmedByUser gate | yes | no | Full as-of package snapshot not one row | OperativeAuthoritySnapshot + edges | DURABLY_PERSISTED |
| Document bytes | DocumentStorageProvider | DocumentByteObject / Blob / FS | 20261009013000 | `getDocumentStorageProvider().store` | `.retrieve` | namespace / company via Document | contentHash | contentHash | content-addressed | hash change = new object | yes (BYTEA/Blob) | no | Local FS not durable | Prefer postgres/Blob in prod | PARTIALLY_PERSISTED |
| Document chunks | DocumentChunk | DocumentChunk | onboarding | `persistDocumentChunks` | extraction | via document | chunkIndex | offsets | replaced on re-chunk | re-ingest | yes | no | — | — | DURABLY_PERSISTED |
| Package graph result | PackageGraphResult | projected (DebtInstrument, DocumentRelationshipEdge, AmendmentEffect, Document.type) | phase_2c+ | `persistPackageGraph` | service getters | companyId | reviewStatus / evidenceClass | relationship evidence | prior docs retained | re-persist membership plan | yes | no | Full PackageGraphResult object ephemeral | Optional JSON snapshot later if needed | PARTIALLY_PERSISTED |
| Provisional RESTATES/AMENDS | RelationshipCandidate | DocumentRelationshipEdge | phase_2c | persistPackageGraph | getDocumentRelationships | companyId | reviewStatus | evidenceClass | edges not auto-promoted | — | yes | no | Must never auto-confirm | Keep fail-closed; tests in package-graph-authority | DURABLY_PERSISTED |
| Operative handoff bundle | OperativeHandoffBundle | *(none on main)* | — | `buildOperativeHandoffBundle` (pure) | pure | companyId in payload | asOfDate | operative state provenance | none | recompute | no | no (deterministic) | **HIGH** — lost on restart | `OperativeAuthoritySnapshot` | IN_MEMORY_ONLY → target DURABLY |
| Operative contract state | OperativeContractState | *(none)* | — | derived | derived | — | — | amendment effects | — | recompute | no | no | By design avoids persisting rendered text | Persist handoff snapshot, not rendered prose | RECOMPUTED_ON_DEMAND |

### Covenant intelligence

| Domain object | Canonical TS type | DB model | Migration | Write | Read | Tenant | Version | Provenance | History | Invalidation | Restart | Paid inference? | Gap | Remediation | Class |
|---------------|-------------------|----------|-----------|-------|------|--------|---------|------------|---------|--------------|---------|-----------------|-----|-------------|-------|
| Structural nodes | DocumentNode | DocumentNode | phase B | compiler persistence | contract-model service | companyId | stableKey, effective dating | document | supersession via operative | recompile | yes | no | — | — | DURABLY_PERSISTED |
| Discovery candidates | DiscoveredCandidate | *(none)* | — | discovery pipeline | in-memory | — | discoveryId hash | citations | none | recompute | no | **yes** if LLM discovery | Deliberate stage separation | Persist only post-review promotions; optional candidate archive later | IN_MEMORY_ONLY |
| Contract rules (compiled) | ContractRule | ContractRule | phase B/C | compiler persistence | service | companyId | stableKey, supersededByRuleId | extractionOrigin | supersession FK | recompile | yes | partial | — | — | DURABLY_PERSISTED |
| Defined terms (Phase B) | DefinedTermNode | DefinedTermNode | phase B | compiler persistence | service | companyId | stableKey | document | effective dating | recompile | yes | no | — | — | DURABLY_PERSISTED |
| Context retrieval bundle | CovenantContextBundle | *(none)* | — | `buildCovenantContextBundle` | pure | companyId | RETRIEVAL_ALGORITHM_VERSION + content hash | items/edges | none | hash invalidation only | no | **yes** if semantic path used | **HIGH** | `ContextRetrievalManifest` | IN_MEMORY_ONLY → target DURABLY |
| Semantic truth / verified IR | SemanticTruthRecord payload | SemanticTruthRecord | 20260830154356 | `persistSemanticTruthForInstrument` | `getTrustedSemanticTruth` (VERIFIED only) | companyId | contentHash + version | analysisRunId, citations | upsert bumps version on content change | generation fence | yes | **yes** to recreate | Shared-capacity IR not stored | Reuse; do not duplicate; extend shared-cap later | DURABLY_PERSISTED |
| Unverified / COMPILED IR | same | SemanticTruthRecord.trustStatus | same | same | getAll… (not trusted getter) | companyId | trustStatus | verification null | preserved | — | yes | yes | Must not promote via persist | Acceptance: unverified stays non-VERIFIED | DURABLY_PERSISTED |
| Claim review | ClaimReviewItem | ClaimReviewItem + Observation/Decision | 20260829232147 | safe-failure service | getters | companyId | claimKey | algorithmVersion | append-only decisions | — | yes | no | — | — | DURABLY_PERSISTED |
| Analysis run fencing | AnalysisRun | AnalysisRun | 20260830054801+ | analysis service | getters | companyId | executionGeneration | documentIds | issues cleared on re-entry | generation bump | yes | no | Stage resume coarse | Keep | DURABLY_PERSISTED |
| Semantic precedents | InMemoryPrecedentStore | *(none)* | — | memory | memory | — | — | — | none | — | no | n/a | Not Neon | Optional later; not P1 | IN_MEMORY_ONLY |

### Financial evidence

| Domain object | Canonical TS type | DB model | Migration | Write | Read | Tenant | Version | Provenance | History | Invalidation | Restart | Paid inference? | Gap | Remediation | Class |
|---------------|-------------------|----------|-----------|-------|------|--------|---------|------------|---------|--------------|---------|-----------------|-----|-------------|-------|
| Legacy FinancialSnapshot | FinancialSnapshot | FinancialSnapshot | foundation | onboarding financial | loadCompanyCovenantData | companyId | unique(companyId,asOfDate) | — | unique constrains overwrite risk | — | yes | no | Dual stack vs NS-4 | Prefer NS-4 for authority | PARTIALLY_PERSISTED |
| Financial core state | FinancialState | FinancialState | financial core | financial-core-db | adapter | companyId | effective dating | facts JSON provenance | effectiveTo | — | yes | no | Parallel stack | Keep for capital structure UI | DURABLY_PERSISTED |
| NS-4 approved inputs | FinancialSnapshot (runtime) | ContractInputSnapshot + Fact + Event | 20261009140000 | PrismaApprovedSnapshotStore | loadApprovedSnapshotsFromPrisma | companyId | version, supersedes | provenanceJson | append-only events | supersession | yes | no | companyId lacks Prisma Company relation | Add relation optionally; reuse store | DURABLY_PERSISTED |
| FinancialMetricEvidence | FinancialMetricEvidence | *(none)* | — | validate only | caller | companyId in entity | provenanceId | sourceDocument | none | — | no | extraction may be paid | **HIGH** for audit | `FinancialEvidenceBundle` | IN_MEMORY_ONLY → target DURABLY |
| Completeness certificate | UtilizationCompletenessCertificate | *(none)* | — | caller-supplied | utilization resolver | — | asOf | issuer claim (untrusted alone) | none | revoke must block | no | no | **HIGH** | `UtilizationCompletenessRecord` | IN_MEMORY_ONLY → target DURABLY |

### Utilization / ledger

| Domain object | Canonical TS type | DB model | Migration | Write | Read | Tenant | Version | Provenance | History | Invalidation | Restart | Paid inference? | Gap | Remediation | Class |
|---------------|-------------------|----------|-----------|-------|------|--------|---------|------------|---------|--------------|---------|-----------------|-----|-------------|-------|
| Legacy LedgerEntry | LedgerEntry | LedgerEntry | foundation + supersession | onboarding / engine | loadCompanyCovenantData | companyId | status SUPERSEDED | — | supersession columns | — | yes | no | Dual with 4C | Keep; prefer 4C for attributed | DURABLY_PERSISTED |
| Contract ledger usage | LedgerUsageRecord | ContractLedgerUsage + Event | 20261009150000 | PrismaContractLedgerStore | loadLedgerUsagesFromPrisma | companyId | status, supersede chain | provenanceJson | append-only events | supersession | yes | no | Empty ≠ zero (enforced in resolver) | Reuse; acceptance tests for UNKNOWN | DURABLY_PERSISTED |
| Utilization resolution | UtilizationResolution | *(none)* | — | pure `resolveUtilization` | pure | — | — | records + cert | — | recompute | no | no | Correct as computed; cert must be durable | Persist certs + evidence | RECOMPUTED_ON_DEMAND |

### Capacity calculations and simulations

| Domain object | Canonical TS type | DB model | Migration | Write | Read | Tenant | Version | Provenance | History | Invalidation | Restart | Paid inference? | Gap | Remediation | Class |
|---------------|-------------------|----------|-----------|-------|------|--------|---------|------------|---------|--------------|---------|-----------------|-----|-------------|-------|
| Capacity evaluation result | CapacityState / EvaluationResult | *(none for results)* | — | evaluateCapacityState | return | — | engine versions | dependency manifests | none | input hash change | no | no | **HIGH** for audit reuse | `CapacityCalculationRecord` | IN_MEMORY_ONLY → target DURABLY |
| Transaction simulation | TransactionSimulationResult | *(none)* | — | `simulateTransaction` (explicitly no persist) | return | — | simulationHash | provenance | none | — | no | no | Hypo must not mutate ledger | `TransactionSimulationRecord` (mutatesActualLedger=false) | IN_MEMORY_ONLY → target DURABLY |
| Simulate handoff URL | simulate-handoff | *(none)* | — | query params | parse | — | — | — | none | — | no | no | Ephemeral UX | Optional workflow later | NOT_APPROPRIATE (session UX) |

### Audit / identity / activation

| Domain object | Canonical TS type | DB model | Migration | Write | Read | Tenant | Version | Provenance | History | Invalidation | Restart | Paid inference? | Gap | Remediation | Class |
|---------------|-------------------|----------|-----------|-------|------|--------|---------|------------|---------|--------------|---------|-----------------|-----|-------------|-------|
| Extraction review events | CandidateReviewEvent | CandidateReviewEvent | 20260825200000 | review actions | candidate history | via candidate | append-only | reviewedBy string | append-only | — | yes | no | reviewedBy not authenticated | InstitutionalAuditEvent + keep | DURABLY_PERSISTED |
| Legal review records | LegalReviewRecord | LegalReviewRecord | founder review | write paths | getters | companyId | reviewStatus | reviewedArtifactRef | row | — | yes | no | No IdP binding | Keep; gate production separately | DURABLY_PERSISTED |
| Authorization audit (#282) | AuthorizationAuditRecord | *(none on main; in-memory on PR)* | — | array push | get log | — | — | — | process memory | — | no | no | Lost on restart | InstitutionalAuditEvent (post-#282 contracts) | IN_MEMORY_ONLY / MISSING on main |
| User / membership / IdP | — | *(none)* | — | — | — | — | — | — | — | — | — | — | Production activation BLOCKED | Follow #282 workstream; do not fake | MISSING (intentional gate) |
| Secrets / API keys | env | — | — | — | — | — | — | — | — | — | — | — | Must not store in Neon | — | NOT_APPROPRIATE_FOR_PERSISTENCE |
| Prompt transcripts | various | — | — | — | — | — | — | — | — | — | — | — | Cost/noise | Retain only bounded excerpts + hashes | NOT_APPROPRIATE_FOR_PERSISTENCE |

### Knowledge factory / ancillary

| Domain object | Canonical TS type | DB model | Migration | Write | Read | Class |
|---------------|-------------------|----------|-----------|-------|------|-------|
| KnowledgeSource registry | KnowledgeSource | KnowledgeSource | knowledge_factory | durable-store | corpus browse | DURABLY_PERSISTED |
| VIC / intelligence-loop runs | VicRunStore / file store | filesystem | — | JSON files | files | FILE_ONLY |
| Cursor cloud compute results | durable-store | git/artifacts | — | files | files | FILE_ONLY |

---

## Dual-stack risks (canonical ownership)

1. **Financial authority:** NS-4 `ContractInputSnapshot` is the approved capacity-input store. Legacy `FinancialSnapshot` remains for older Position paths. New financial evidence bundles must reference NS-4 / document ids, not silently overwrite legacy snapshots.
2. **Ledger authority:** `ContractLedgerUsage` is attributed utilization. Legacy `LedgerEntry` is basket-family only. Empty ledger remains UNKNOWN.
3. **Rule authority:** `SemanticTruthRecord` with `trustStatus=VERIFIED` is the sole durable verified IR. `ContractRule` / `Permission` / `CovenantProvision` are earlier or parallel layers — never treat discovery candidates as verified IR.
4. **Operative authority:** Computed from package graph + amendment effects; durable snapshot is new (`OperativeAuthoritySnapshot`) and must preserve provisional/caveat classifications.

## Highest-value gaps (implementation order)

1. Operative authority snapshots  
2. Context retrieval manifests  
3. Financial evidence bundles + completeness certificates  
4. Capacity calculation records  
5. Transaction simulation records (hypothetical-only)  
6. Institutional audit events + dependency invalidation  
7. Application wiring (Position/Ask/Simulate) without replacing engines  
8. Acceptance suite on disposable PostgreSQL  

## Explicit non-goals for this program

- Self-merge / production activation / flipping IdP gates  
- Importing #281 or #246  
- Destructive renames/drops of production columns  
- Storing secrets or unbounded prompt transcripts in Neon  
- Replacing canonical covenant engine, solver, or simulator  
