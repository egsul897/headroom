# UCD-1a — Contractual financial definitions (bounded)

**Base:** `67027b8f499921a12cee7b9b9f04d832898b6384`  
**Module:** `lib/contract-model/financial-definitions/`  
**Tests:** `tests/contract-model/financial-definitions/ucd1a-definitions.test.ts`

## In scope

- Instrument-scoped definition identity (`ContractualFinancialDefinition`)
- Catalog of metric *kinds* (labels only; no issuer formulas)
- Projection from `IRDefinition` with explicit UNSUPPORTED adjustments
- Recursive dependency closure with cycle detection
- UCD-4 readiness vocabulary on derived input manifests
- Fail-closed `mayEvaluateAuthoritatively` (requires all `AVAILABLE_VERIFIED`)

## Out of scope (deliberate)

- Document compilation / semantic extraction
- Ratio or capacity arithmetic
- Dashboard wiring
- Persisted NS-4 snapshots
- Any production authority activation
- Changes under open PRs #304–#317 product/compiler/capacity surfaces

## Next

- **UCD-1b:** Join definition manifests to Phase 4B input identity / dependency manifests
- **UCD-2a:** Ratio traces over definition-resolved operands (4A), parallel to legacy
