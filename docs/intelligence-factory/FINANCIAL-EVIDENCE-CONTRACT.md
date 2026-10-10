# Financial evidence & verified-input contract (HEADROOM-2)

**Status:** binding for authenticated financial evidence + capacity handoff  
**Contract version:** `verified-input-contract.v1`  
**Implementation:** `lib/capacity/financial-evidence.ts`, `verified-input-contract.ts`, `trusted-issuer-host.ts`  
**Utilization gate:** `evaluateCompletenessForRemainingClaim` (shared solver + product)

## Evidence trust classes

| Class | Meaning | Production capacity? |
|---|---|---|
| `AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE` | AUTHENTIC + VERIFIED metrics with trusted issuer | Only with host activation |
| `VERIFIED_UTILIZATION_COMPLETE` | Completeness cert AUTHENTIC + trusted issuer | Only with host activation |
| `INCOMPLETE` | Partial attribution / unverified extraction / missing fields | **No** |
| `UNKNOWN` | Missing ledger / no attribution | **No** |
| `SYNTHETIC` | Labeled fixture evidence | **No** (demo hatch only) |
| `CALLER_STIPULATED_HYPOTHETICAL` | Caller-supplied what-if values | **No** |

## Authority rules

1. Extraction ≠ verification.
2. `APPROVED` completeness alone is insufficient — authenticity + trusted issuer required.
3. Missing ledger ≠ zero usage.
4. Trusted identity is never taken from certificate role, fixture metadata, user JSON, or client assertion.
5. Fully authenticated fixtures may demonstrate the contract; they do **not** activate production (`TRUSTED_ISSUER_ACTIVATION = BLOCKED` until a real `HostIdentityProvider` is registered).

## Trusted identity source

| Source | Status |
|---|---|
| Certificate `issuer.role` | **Refused** |
| Fixture / demo registry | **Refused** for production (`requireNonFixtureIdentity`) |
| User-supplied JSON / client assertion | **Refused** (`refuseUntrustedIssuerClaim`) |
| `HostIdentityProvider` → `HostVerifiedIdentity` (WeakSet-minted) | **Intended** production path |
| Repository wiring today | **BLOCKED** — no session/service-account IdP present |

## Activation

```
TRUSTED_ISSUER_ACTIVATION.status === "BLOCKED"
productionActivation on handoff === "BLOCKED"
mayUseAsProductionCapacityInput(...) === false
```

Verdict `FINANCIAL_EVIDENCE_CONTRACT_VERIFIED` does **not** imply production activation.

## Downstream ingestion (HEADROOM-9)

Statement normalization and utilization reconstruction feed this contract via:

- `lib/capacity/financial-statement-ingestion.ts`
- `lib/capacity/utilization-evidence-reconstruction.ts`

See `FINANCIAL-AND-UTILIZATION-EVIDENCE-SLICE.md`. Those modules do **not** create a second evidence contract.
