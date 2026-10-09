# HEADROOM AGENT 7 — Unified Customer Product

## Verdict

Position, Simulate, and Ask now read from one shared verified engine façade
(`lib/product/unified-customer/**`). The UI does not run covenant arithmetic.
Ask hands a structured transaction to Simulate; amount changes clear prior
evidence and recompute under a new request fingerprint.

## Surfaces

| Surface | Path | Engine entry |
|---|---|---|
| Position | `/[companyId]/position` | `loadPositionView` → ratios, thresholds, baskets, utilization, remaining capacity, shared constraints, evidence |
| Simulate | `/[companyId]/simulate` | `UnifiedSimulateClient` → `POST /api/product/simulate` → `runUnifiedSimulation` |
| Ask | `/[companyId]/ask` | `POST /api/product/ask` → `analyzeAskForSimulate` + Simulate deep-link |

## Outcome taxonomy

Every result is classified as one of:

- `SUPPORTED_PERMISSION` — all tested constraints clear (never a single ratio alone)
- `SUPPORTED_PROHIBITION` — at least one tested constraint blocks
- `CONDITIONAL_OR_REVIEW_REQUIRED` — incomplete / review / single-ratio clear
- `MISSING_EVIDENCE` — required inputs absent or stale state rejected
- `UNSUPPORTED_CALCULATION` — not modeled / not tested

## Freshness

- `stateFingerprint` hashes verified contractual + financial inputs
- `requestFingerprint` binds amount + kind + state; amount change ⇒ new fingerprint
- Client clears displayed results on amount/kind change before the new response
- Server rejects `expectedStateFingerprint` mismatches (`STATE_FINGERPRINT_MISMATCH`)

## Ask → Simulate

Structured payload includes kind, amount, secured, evaluation date, currency,
handoff id, and state fingerprint. Deep-link example:

`/[companyId]/simulate?kind=SECURED_DEBT&amount=100&secured=1&date=2026-08-01&handoff=…`

## Evidence

- Demo: `docs/product/unified-customer/demo-report.json` / `.md`
- UI regression: `tests/product/unified-customer-product.test.ts`
- Engine integration: `tests/product/unified-customer-engine.test.ts`

## Cost

$0 paid provider spend for this mission (deterministic engine + Prisma only).
