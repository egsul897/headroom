# Cross-layer integration matrix

**Controlling architecture:** `docs/headroom-north-star-v2.md`, `docs/headroom-north-star-reconciliation/06-revised-roadmap.md`  
**Branch / PR under test:** `cursor/cross-layer-integration-7039` / [#332](https://github.com/egsul897/headroom/pull/332) (off `origin/main` @ `67027b8f`)  
**Status legend:** `VERIFIED` = production interface exercised by automated test on real modules/persisted state · `PARTIAL` = interface exists but gap remains · `BLOCKED` = phase-gate / IdP / certification refuses · `UNSUPPORTED` = not built or explicitly out of MVP

Integration readiness ≠ production certification.

| # | Interface | Canonical implementation | Competing / demoted | Status | Evidence |
|---|---|---|---|---|---|
| I1 | Source docs → structural index / package graph | `lib/contract-model/analysis/*`, package-graph persistence | Frozen unsafe expansion `#246` | PARTIAL | Package graph on main; production IdP / membership still BLOCKED (`#282`) |
| I2 | Amendment / version / effective-date → operative provisions | `lib/contract-model/compiler/operative-authority/*`, competing-restatement fail-closed `#306` | Legacy Permission rows without operative authority | PARTIAL | `tests/product/canonical-product-integration-adversarial.test.ts`; WOR WITH_CAVEATS ≠ production |
| I3 | Operative provisions → certified IR / rulebook | Phase 3 compile → verify → certify; fixed-dollar / greater-of vertical slices | Fixture IR / DISCOVERED permissions | PARTIAL | Phase 3 reliability gate open (roadmap step 1–3); fixture IR labeled `FIXTURE_IR` |
| I4 | IR → financial dependency manifests | Phase 4A dependency graph / manifests in runtime | — | PARTIAL | `lib/contract-model/runtime/dependency-graph.ts`; real-issuer manifests incomplete |
| I5 | Certificate → NS-4 approval lifecycle | `runtime/input/store` + `proposeFromCertificate` / `approveCertificateProposal`; product `certificate-actions.ts` | Legacy `FinancialState` / Feeds carry-forward (R0) | VERIFIED (synthetic) | `tests/contract-model/runtime/input/store/*`; `tests/product/north-star-e2e-customer-workflow.test.ts` (DB); delivery persistence `tests/contract-model/runtime/input/delivery-evidence.test.ts` |
| I6 | Contractual selector → APPROVED snapshot bind | NS-6 `resolveContractualSelector` + `selectSnapshotForResolvedSelector` via `north-star-bridge` | Inventing delivery from period-end `asOf` (**fixed** this tip) | VERIFIED (synthetic) | `tests/contract-model/runtime/input/selector/resolve.test.ts`; `delivery-evidence.test.ts`; vertical-slice acceptance |
| I7 | Bound snapshot → Phase 4A evaluation | `snapshotInputResolver` + `evaluateVerifiedCapacity` (REQUIRE) | Legacy covenant-engine capacity | PARTIAL | Fixture path VERIFIED in vertical slice; production IR + trusted issuer BLOCKED |
| I8 | Phase 4C capacity / historical usage | `PrismaContractLedgerStore` / in-memory ledger; utilization authority UNKNOWN≠zero | Legacy `LedgerEntry` hard-delete | PARTIAL | Ledger append/supersede on NS stores; utilization UNKNOWN refuse in `#290` / adversarial suite |
| I9 | Phase 4E path enumeration | `verified-path-enumeration.ts` | Legacy multipath `analyzeMultiPathTransaction` | BLOCKED | `NOT_CERTIFIED_4E` until Phase 3 foundation + readiness condition 7 |
| I10 | Phase 4D hypothetical simulation | `simulateVerifiedTransaction` (REQUIRE); unified execute | Legacy Simulate slider | PARTIAL | Fixture + unified hypothetical EXECUTED; production authority BLOCKED |
| I11 | Customer Position / Dashboard / Ask / Audit | `north-star-workflow/*`, `unified-position/*`, `customer-figure-semantics.ts`; CFO workflow on open PRs `#311`/`#312`/`#328` | Legacy dashboard engine reads | PARTIAL | Semantics classifier + authoritative-capacity labels; UI migration incomplete (roadmap 16) |

## Fail-closed / invalidation locks added this tip

| Concern | Lock | Test |
|---|---|---|
| Delivery ≠ period-end asOf ≠ approval ≠ evaluation | Persist `deliveredAt=` on approvalRef; reconstruct via `deliveriesFromApprovedSnapshots` | `delivery-evidence.test.ts`, vertical-slice |
| Missing delivery marker | `REQUIRE_PERSISTED_DELIVERY` → empty deliveries → selector `NEEDS_INPUT` | vertical-slice second case |
| Restatement supersession | Predecessor `SUPERSEDED`; cutoff binds successor only | `delivery-evidence.test.ts`, vertical-slice |
| Gross / remaining / hypothetical collapse | `classifyCustomerFigure` refuses headroom upgrade without completeness | vertical-slice |
| UNKNOWN utilization → zero | Unchanged; still refused in capacity/utilization modules | adversarial `#293` suite (prior) |
| Evidence UNKNOWN → VERIFIED_EXECUTABLE | Evidence page hardcodes `utilizationComplete: false` (ledger count ≠ completeness cert) | `evidence-utilization-complete-fail-closed.test.ts` |
| FCE latest-as-of snapshot pick | `selectAuthoritativeSnapshotForCapacity` — snapshotId or NS-6 bind only | `snapshot-selection.test.ts` |
| FCE approve invents delivery | `omitDeliveryEvidence` when `deliveredAsOfDate` absent | `approveNs4SnapshotAttributable` |
| Authentic bridge wall-clock asOf | Refuse `MISSING_AS_OF` instead of `new Date()` | `authentic-capacity-bridge.ts` |
| Position “last verified” = period-end | `lastVerifiedEvidenceDate = null` until delivery/approval axes loaded | adversarial-routes Position case |

## Canonical vs competing (customer-facing claims)

| Claim | Canonical | Must not use |
|---|---|---|
| Approved financial facts | NS-4 `ContractInputSnapshot` APPROVED via attributable approval | Legacy `FinancialState` alone; LLM extract without approval |
| Contractual cutoff | NS-6 selector + delivery evidence + exact snapshot bind | “Latest quarter”; delivery invented from asOf |
| Gross contractual capacity | Verified-execution / VE IR gross under REQUIRE | Unlabeled dashboard number |
| Verified remaining | Completeness certificate + trusted issuer + REQUIRE capacity | Empty ledger as zero; LEGACY_ENGINE remaining |
| Hypothetical result | `simulateVerifiedTransaction` / unified HYPOTHETICAL | Production-available labeling |
| Operative governing text | Operative authority classification + confirmed package identity | Provisional / unproven CP as unconditional |

## Open PR dependency subgraph (do not duplicate)

Active concurrent work (inspect, don’t fork): `#324`–`#327` dashboard contractual EBITDA/leverage/NS-4 Neon band; `#328` canonical path verify; `#311`/`#312`/`#319` CFO + operative binding; `#308` verified remaining; `#320` OA/calc consistency; `#323` adversarial intel.

This tip stays on temporal delivery persistence, cross-layer contract tests, figure semantics, and the integration matrix — no competing dashboard/EBITDA engine.
