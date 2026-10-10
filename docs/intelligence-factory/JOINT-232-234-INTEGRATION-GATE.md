# Joint #239 — final disposition (human-review candidate)

**PR:** #239 (draft)  
**Status:** candidate for human review — **not** independent merge authorization  
**Canonical authority:** `#237` / `#250` `lib/capacity/utilization-authority.ts` + `completeness-issuer-auth.ts`  
**Marker only:** `lib/capacity/remaining-authority.ts` (`joint-232-234.on-250.v1`) — no parallel authority path

## Why GitHub reported non-mergeable after CLEAN

Prior CLEAN state was against main `@7f1dd3a2` (#237). Main then moved to
`3612fe76` via merged **#250**. GitHub correctly flipped to
`mergeable=CONFLICTING` / `DIRTY` — **branch movement / new conflicts**, not
transient metadata.

## What was ported (genuinely missing vs post-#250 main)

1. Debt-path overlapping SHARED_CAP fail-closed in `election.headroomAndConsume`
   (main already had full-set checks for liens; debt waterfall still used first-only).
2. Package-path + authoritative-capacity labeling (UNKNOWN ≠ zero / completeness).
3. Thin `remaining-authority` marker + joint regression tests.

## What was NOT restored

- Obsolete `completeness-certificate.ts` / fixtures / fingerprint adversarial suite
- Any second authority module that competes with `#250` utilization-authority

## Disposition

- No auto-merge
- No certification promotion / Neon writes / broad further integration
- Primary engineering priority remains Product Proof 002
- Close this workstream after human handoff

## SHA

| Item | Value |
|---|---|
| Main | `3612fe76d4cb5f1d1af189e87d77e8aae11fc894` (#250) |
| #239 tip (handoff) | `cf7fec674208bcf0c96856228915656a20179be0` |
| GitHub mergeable | MERGEABLE (was CONFLICTING after #250 land) |
| Canonical auth ≡ main | yes |
| #229 capacity ≡ main | yes |
