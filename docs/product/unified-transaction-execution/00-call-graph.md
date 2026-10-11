# Unified verified transaction execution — call graph

**Contract version:** `unified-transaction-execution.v1`  
**Module:** `lib/product/verified-transaction-execution/`  
**Entrypoint:** `executeUnifiedVerifiedTransaction`

## Mapped starting surfaces (main @ post-#268)

| Surface | Path | Role |
|---|---|---|
| Phase 3 verified rulebook | `phase3-certification/*` → `VerifiedExecutionPackage` | CERTIFIED IR + verification artifacts |
| Phase 4D simulation | `simulateVerifiedTransaction` → `simulateTransaction` | Hypothetical / selected-path effects |
| Phase 4E enumeration | `enumerateCertifiedPaths` | Neutral path list (not used to auto-rank here) |
| Capacity boundary | `evaluateVerifiedCapacity` | REQUIRE capacity state |
| Shared-capacity solver | `lib/solver/*` | **Not on this path** — verified shared pools via `IRSharedCapacity` |
| Utilization / remaining | `lib/capacity/*` | Completeness + remaining publication gates |
| #266 compiler slice | open / PP002 | Greater-of vertical slice — orchestration consumes MAX IR, does not compile |
| #268 authenticity | merged | Trusted-issuer + production remaining gates reused |
| #273/#279 financial evidence | **merged** | Adapter wraps `lib/capacity/financial-evidence.ts` |
| #274 operative handoff | **merged** | Adapter reuses `OperativeAuthorityClassification` + provision projection |
| #266 greater-of compiler slice | **merged** | Orchestration consumes MAX IR; does not compile |
| #280 customer workflow | **merged** | Handoff projection remains additive for Position/Ask/Simulate |

## Canonical call chain

```
executeUnifiedVerifiedTransaction(request)
  ├─ identity gates (company / instrument)
  ├─ verifiedExecutableRule lifecycle gate (DISCOVERED ≠ VERIFIED_EXECUTABLE)
  ├─ selectedLegalPath EXPLICIT + rule/pool membership
  ├─ evaluateOperativeSourceAuthority          (#274 adapter)
  ├─ validateFinancialEvidenceBundle           (#273 adapter)
  ├─ evaluateUtilizationAuthorityGate          (lib/capacity)
  ├─ authorizeCompletenessIssuer               (reviewer / forged-approval gate)
  ├─ evaluateVerifiedCapacity                  (REQUIRE)
  │    ├─ bind + resolveRuntimeVerificationEnvelope
  │    ├─ buildCapacityGraph
  │    └─ evaluateCapacityState
  ├─ simulateVerifiedTransaction               (REQUIRE)
  │    ├─ assertRestoreAuthority
  │    └─ simulateTransaction
  ├─ classify production authority (fail-closed; host activation BLOCKED)
  └─ toProductExecutionHandoff → POSITION | ASK | SIMULATE
```

## Explicit non-imports

- `runtime/capacity/graph`, `runtime/capacity/state`, `runtime/transaction/simulate`
- `lib/solver` / `runSolver`
- Unmerged #273/#274/#246 branch modules (adapters only)

## Fail-closed promotions refused

| From | To | Behavior |
|---|---|---|
| DISCOVERED | VERIFIED_EXECUTABLE | REFUSED |
| HYPOTHETICAL | PRODUCTION_AUTHORITY | Classification stays HYPOTHETICAL_ONLY / BLOCKED |
| APPROVED (no authenticity) | trusted completeness | Remaining / production refused |
| PROVISIONAL document | OPERATIVE | REFUSED |
| UNKNOWN utilization | zero | Missing completeness → UNKNOWN; never zero |
| Shared pool members | additive independent baskets | SHARED_POOL binding constraint; single pool IR |
