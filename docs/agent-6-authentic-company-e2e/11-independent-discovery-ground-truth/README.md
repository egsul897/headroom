# Independent discovery ground truth (Agent 6)

Bounded, reviewer-selected discovery samples for the three authentic packages.
Used to score Pass A recall/precision independently of the frozen 20 must-discover pins.

## Method

- Ground truth comes from **independent human-style reading** of extracted source text
  under `tests/fixtures/authentic-packages/*/extracted-text/`.
- Simple string search for section numbers in raw text is allowed to locate excerpts.
- Each item carries an exact contiguous `sourceExcerpt` (≤400 chars), `sourceCharStart`,
  and `sourceSha256` of the document file so excerpts are auditable.

## What this is not

- **Not** generated from Pass A signal logic.
- **Not** generated from `isCovenantHeadlineHeading`.
- **Not** generated from the structural-heading inventory in
  `scripts/agent6/audit-discovery-completeness.ts`.
- **Does not** retune `02-independent-expected-outcomes/*` or `00-expectation-pins.json`.

## Frozen pins column

`mustDiscoverPin` is a **separate label** that marks whether the item’s section also
appears among the frozen must-discover expectation pins. Pins are preserved and are
**not** the GT generator.

## Scope of evaluation

This sample measures **discovery** only:

| Layer | In scope here? |
| --- | --- |
| Discovery (locate restriction loci) | Yes |
| Interpretation (family/role semantics) | No — `familyHint` is best-effort only |
| Verification (quote/capacity checks) | No |
| Execution (transaction decisions) | No |

## Files

| File | Package | Items |
| --- | --- | --- |
| `knife-river-sample.json` | Knife River (primary) | ~12 |
| `insulet-sample.json` | Insulet (smaller) | ~4 |
| `benchmark-sample.json` | Benchmark (smaller) | ~4 |
| `accuracy-matrix.json` | Scorer output | — |

## Scorer

```bash
npx tsx scripts/agent6/score-independent-discovery.ts
```

Runs at $0 cost (deterministic structure + Pass A only; no LLM).
