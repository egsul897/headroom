# Rare Covenant Drafting Discovery

Deterministic novelty detection for financing drafting that differs from Headroom’s known corpus.

## Guardrails

- Discovery / knowledge-factory only — **does not** modify production legal rules
- No paid model calls, merges, or certification changes
- Lexical similarity is comparison-only (`equivalenceClaim: NONE_LEXICAL_ONLY`)
- Structural signatures describe drafting shape, not semantic equivalence

## Run

```bash
npx tsx scripts/rare-covenant-drafting-discovery.ts
npx tsx scripts/rare-covenant-drafting-discovery-phase2.ts [--skip-acquire]
npx vitest run tests/drafting-novelty
```

Phase 2 writes `docs/rare-covenant-drafting-discovery/phase2/` (balanced metrics, controlling contexts, independent review, KF import, acquisition manifests). Local SEC bytes stay under gitignored `data/rare-covenant-drafting-discovery/`.

## Artifacts

| File | Contents |
| --- | --- |
| `00-mission-report.md` | Human-readable mission report |
| `01-corpus-coverage.json` | Corpus vs probe coverage |
| `02-clusters.json` | Signature clusters |
| `03-reviewer-queue.json` | Reviewer queue with spans + neighbors |
| `04-novelty-findings.json` | Full scored findings |
| `05-acquisition-recommendations.json` | Diversified acquisition list |
| `06-run-manifest.json` | Artifact hashes / run metadata |

## Code

`lib/drafting-novelty/` — normalize → extract → signature → cluster → score → queue/acquisition
