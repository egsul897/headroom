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

## Remaining safety note (non-blocking for Stage 3)

`lib/financial-certificate-engine/utilization-honesty.ts` is a **mirror** of the #234/#237 completeness contract (written before #237 landed on main). It does not replace `lib/capacity/utilization-authority.ts`. Stage 5 product wiring must call **#237** for customer remaining claims; FCE honesty stays for engine-local publication until a thin adapter collapse (next smallest batch after Stage 4 if needed).

## Local gates

| Suite | Result |
|-------|--------|
| `tsc --noEmit` | pass |
| FCE suite (7 files) | pass (incl. approval Neon unit tests — no prod writes) |
| Stage 2 sequential + A8 + architecture + utilization | pass |
