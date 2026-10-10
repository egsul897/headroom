# Stage 3 — Financial Certificate Engine (#220)

**Branch:** `cursor/unified-stage3-financial-f673`  
**Base:** Stage 2 tip `0838455d` (main + #243)  
**Merged:** `#220` @ `744d371baca9e904040f303f9e7b519455de15fe`

## Merge outcome

Clean auto-merge (`covenant-engine.ts`, `prisma/schema.prisma`). No edits required to capacity/state, capacity/types, verified-execution, or `lib/capacity/*`.

## Preserved

| Authority | Status |
|-----------|--------|
| #229 capacity floors | `types.ts` byte-identical to main |
| #237 utilization | `lib/capacity/*` present and untouched |
| #243 verified sequential | `REQUIRE` + restore + sequential-execution intact |
| Architecture allowlist | still only `verified-execution.ts` |

## FCE contracts retained

- Authentic vs modeled vs approved evidence paths
- Trusted reviewer approval before authoritative capacity load
- Contractual EBITDA adjustments (no silent GAAP substitution)
- Financial as-of + currency identity
- Borrowing / repayment / dividend / equity sequential financial effects
- Gross-only publication without utilization completeness
- Completeness-certificate requirement for remaining claims (`utilization-honesty.ts`)

## Remaining safety note — resolved on follow-on branch

`lib/financial-certificate-engine/utilization-honesty.ts` was a **mirror** of the #234/#237 completeness contract at Stage 3 tip `dd727d2b`.

**Collapse:** branch `cursor/fce-canonical-onto-unified-8d31` (onto #250) replaces that mirror with a thin `#237` adapter (`computeVerifiedRemaining` / `evidenceFromAttributedLedger`). See `07-fce-canonical-onto-stack.md`. Product remaining claims continue to use `lib/capacity/*` directly (e.g. `debt-intelligence.ts`).

## Local gates

| Suite | Result |
|-------|--------|
| `tsc --noEmit` | pass |
| FCE suite (7 files) | pass (incl. approval Neon unit tests — no prod writes) |
| Stage 2 sequential + A8 + architecture + utilization | pass |
