# Issuer-generalized learned rules (v2 learner): design and result

Owner-approved redesign (2026-10-17). Draft PR #439, stacked on #433.
Scope: `lib/covenant-learning-factory/**`, these scripts and their tests. The extractor, categorization and covenant-level parsing are untouched.

## Diagnosis of the v1 rules (committed ruleset, 2675 capture rules)
- 84% were seeded from HELDOUT documents (2239 HELDOUT-only, 417 DEV-only, 19 both).
- 99.6% are pure literals of one item's opening: 1564 start with the enumerator, 1169 embed a section number, 2138 carry ≥2 names or defined terms, and some include page numbers.
- 84% are single-item clusters, and 98.5% have one seed issuer.
- On non-seed DEV documents, 0 of 420 first-match fires land in a precedent item. With the #433 guard: HELDOUT 4472 vs no-rules 4462, 1 credit outside seed docs, 0 cross-issuer.

## Design
1. **Slot skeletons** (`learned-rules/issuer-generalize.ts`): $ amount, %, ratio, section/clause ref and capitalised defined term become slots. Enumerators and bare numbers are dropped.
2. **Pairwise cross-issuer alignment** of seed openings: in-order common tokens, ≤3 skipped words, start within 2 tokens. Rules are anchored at a clause start, and the patterns are linear-time (atomic term slot) with a 250 ms performance gate.
3. **Support from ≥2 issuers.** Issuer = one key per company (manifest CIK aliases, ticker, fixture slug). Identical-support duplicates are consolidated.
4. **Seeds are DEV gaps only** (no-rules DISCOVERY_GAP candidates and COVERAGE_GAP conditions). HELDOUT/BLIND are never read for seeding or acceptance.
5. **Leave-one-issuer-out acceptance on DEV** (`learn-generalized.ts`, `learning/held-out-eval.ts`). The real scorer with per-rule attribution is run on the held-out issuer. A rule is accepted only with ≥1 credited gap, 0 UNSUPPORTED_SEMANTICS and ≤50% idle baskets.
6. **Every support document goes into `packageKeys`**, so the #433 guard refuses credit in all of them.

Reproduce: `npx tsx scripts/covenant-learning-factory/learning/learn-generalized.ts --out-dir=OUT`. Then, for one split, `score-split.ts --rules-file=OUT/ruleset-generalized.json [--split=DEV]`.

## Result (`runs/`)
- **59 rules proposed, 0 accepted.** Held-out credit was 0 in every fold: 13 baskets in total, 0 credited, 0 unsupported. The accepted ruleset is empty, so the guarded score equals no-rules: HELDOUT 4462 (US 62), DEV 763.
- Why: the transferable wording that DEV gaps share across issuers is boilerplate ("Notwithstanding anything to the contrary…", "Except as expressly amended hereby…"), which states no covenant family, so the extractor drops it. Of 501 DEV gap candidates:
  - 335 cannot be located in the package text by their opening;
  - of the 166 located, 131 state no family, 20 disagree with their label, and 15 agree.
  - Only 27 state their labelled family in their own words, and they share no cross-issuer skeleton.
  Under the extractor's contract (first match per rule per document, family taken from the captured clause), at most ~15–27 DEV gaps can be credited by any capture rule.
- Diagnostic only, run after acceptance was final: all 59 proposed rules on HELDOUT give 4461 vs 4462 no-rules, US 62 = 62, 0 refused, 1 cross-issuer credit (DAL), and no source worse. The generalization transfers, but at negligible scale. Those rules stay rejected, because adopting them on HELDOUT evidence would be tuning on held-out data.

## What would move the number (outside this lane, needs owner and Muse)
- Clean labels: the precedent "gaps" are mostly not covenant text (the bisect hand check found 39/50).
- More labelled DEV issuers: only 5 issuers carry DEV labels, and 418/489 DEV gaps sit in 3 documents.
- An extractor contract allowing more than one capture per rule per document.
