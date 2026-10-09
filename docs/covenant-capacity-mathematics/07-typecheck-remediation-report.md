# PR #234 — Bounded typecheck remediation

## Classification: `automaticLinkOnly` / `assetScopeRestricted`

These are **legal / modeling conditions**, not numerical `FormulaParams`.

| Flag | Role |
|---|---|
| `automaticLinkOnly` | Lien (or similar) exists only as an automatic link to another permission — **no independent capacity ceiling** |
| `assetScopeRestricted` | Further restricts an automatic-link path to a named asset scope |

They travel in the same JSON column as formula params in Neon population scripts, but must not be folded into `FormulaParams`. Reading is via `readProvisionLegalConditionFlags()`. Independent capacity evaluation **refuses** (zero_linked / CORRECT_REFUSAL) when `automaticLinkOnly` is true — preserving unsupported-condition refusals.

## Utilization authority (merge blocker remains)

Approved individual ledger records establish **known attributed usage only**. They do **not** establish completeness of historical usage.

Remaining = gross − usage requires an affirmative completeness certificate:

- `VERIFIED_EMPTY` — no active usage and ledger complete
- `VERIFIED_COMPLETE` — attributed records are the full usage set

Without that certificate, `supportsRemainingClaim` is false even when `attributedAmount` is known.

## Typecheck corrections (this remediation)

1. Removed `automaticLinkOnly` from `FormulaParams`; added `ProvisionLegalConditionFlags` + reader
2. Canonical `ContractAction`: `CREATE_LIEN`, `PAY_DIVIDEND` (enum-equivalent family semantics); tests assert action/family
3. Exhaustive `FormulaType` switches via `assertNeverFormulaType` — no permissive fallback
4. Prisma `$queryRawUnsafe` counts via typed helper after await — no SQL weakening
5. Explicit null guards on reclassification outcomes

## Evidence: no unsafe capacity claims introduced

- Empty ledger → UNKNOWN, not zero
- Approved attributed records without completeness → known util, **no** remaining / AVAILABLE
- Gate failed → REVIEW_REQUIRED, not AVAILABLE
- Debt-intelligence still gated by utilization resolver
- Automatic-link legal condition → CORRECT_REFUSAL (independent ceiling 0)

## Merge status

TypeScript remediation is necessary but **not sufficient**. PR #234 remains blocked on authentic utilization-completeness authority.
