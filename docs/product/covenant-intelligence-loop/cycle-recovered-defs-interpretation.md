# Cycle: recovered definitions → interpretation quality

**Base:** `6331e2ba` (Neon refresh complete; bulk backfill not repeated)  
**Verdict:** `DEFINITION_FIRST_ASK_IMPROVED`  
**Paid inference:** `0`  
**promotedToLegalTruth:** `0`

## Targets (Neon BYTEA → product pipeline)

| Agreement | Defs | Expected-term hit rate | Persisted |
|---|---|---|---|
| Alkermes Amd. No. 1 | 359 | 1.0 | yes |
| AEO credit exhibit | 379 | 1.0 | yes |
| DSGR Third Amendment | 328 | 1.0 | yes |
| GoDaddy 13th Amendment (diverse follow-on) | 472 | 1.0 | yes |

## Verified interpretation improvements

1. **Definition-first Ask** — “What constitutes Consolidated EBITDA?” / “What is Acquired EBITDA?” now lead with source-backed definition text and cite `Definition: <term>`, then supporting covenants.
   - Alkermes: was §2.20(j) Incremental Cap → now `Definition: Consolidated EBITDA` + §6.10
   - DSGR: Acquired EBITDA definition excerpt surfaces correctly
   - AEO: maps to `Adjusted Consolidated EBITDA` (correct drafting label)
   - Gibraltar (unseen): Consolidated EBITDA + Consolidated Total Net Leverage Ratio definition-first
2. **Related-definition attachment** — longest-term-first across full definition bank (not first-300 discovery slice).
3. **Family heading priority + parent inheritance** — Investments subsections no longer primary-classified as INDEBTEDNESS from body debt mentions; AEO debt questions moved off §10.04 Investments toward debt/financial sections.
4. **Persisted sample** — `definedTermsSample` prioritizes material financing terms (EBITDA, leverage, RP, etc.) for Ask/Neon consumers.

## Remaining errors (honest)

| Issue | Status |
|---|---|
| Alkermes debt-incurrence top hits still include financial-covenant / incremental sections (amendment restates defs more than Article VI baskets) | Open — package-structure / amendment-vs-base retrieval |
| AEO still lacks bare “Restricted Payment” / “Permitted Investment” quote-means terms in this exhibit | Document drafting / amendment scope — not a scanner false negative for known entity quotes |
| Basket segmentation / shared-capacity still shallow on several answers | Pre-existing; not claimed fixed this cycle |
| CONMED curated Article VII has 0 definitions (curated excerpt omits §1.01) | Expected for curated slice |

## Regression tests

- `tests/product/definition-first-ask.test.ts` (3)
- `tests/knowledge-factory/family-heading-priority.test.ts` (3)
- Existing: `definition-discovery-authentic.test.ts`, `substantive-covenant-intelligence.test.ts`

## Commands

```bash
npx tsx scripts/product/challenge-neon-recovered-defs.ts
npx tsx scripts/product/challenge-authentic-agreements.ts
npx vitest run tests/product/definition-first-ask.test.ts tests/knowledge-factory/family-heading-priority.test.ts
```
