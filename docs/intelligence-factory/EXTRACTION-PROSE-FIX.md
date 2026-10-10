# Real-prose extraction fix (Workstream 2)

**Branch:** `cursor/synthetic-extraction-prose-fix-2229`  
**Paid inference:** $0  
**Neon mutations:** 0 (ephemeral test company only)

## Root causes (demonstrated)

| Failure | Cause | Fix |
|---|---|---|
| threshold 0/3 | `parseDollarAmount` ignored `$X,000,000` full-precision | Scale absolute dollars ≥ $1M → millions |
| formulaType 0/3 | Always emitted `FLAT_AMOUNT` | Recognize greater-of / % EBITDA or % assets |
| grantType 2/3 | `/\blien\b/` missed plural **Liens** | `/\bliens?\b/` + prefer LIEN |
| maintenance invisible | No Indebtedness/Lien/$ gate | Coverage gap for leverage/coverage ratio language |

## Before → after (Coherent precedent acceptance)

| Metric | Before | After |
|---|---:|---:|
| threshold correct | 0/3 | **3/3** |
| formulaType correct | 0/3 | **3/3** |
| grantType correct | 2/3 | **3/3** |
| maintenance gap flagged | no | **yes** (KNOWN_NOT_MODELED §6.11) |
| recall (MODELED) | 75% | 75% (ratio still not MODELED — fail-closed) |

## Untouched holdouts (deterministic formula helper)

| Source | Result |
|---|---|
| Gibraltar Liens / $344,000,000 / 100% LTM EBITDA | LIEN + GREATER_OF_FLAT_OR_PCT_EBITDA @ 344 / pct=1.0 |
| LSB §6.01(i) $70,000,000 / 5.5% assets | DEBT + GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS @ 70 / pct=0.055 |

## Files

- `lib/extraction/synthetic-formula.ts` (new)
- `lib/extraction/synthetic-provider.ts`
- `tests/extraction/synthetic-formula.test.ts`
- `scripts/onboarding-precedent-acceptance.ts` (scorecard messaging)
