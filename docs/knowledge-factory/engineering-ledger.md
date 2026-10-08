# Knowledge Factory — Engineering Ledger

Living progress log for the Cursor-owned knowledge-factory branch.

## Session start

- Base: `main` @ `9de4e5737166fcec84a35fdc9a3404870549211f`
- Branch: `cursor/covenant-knowledge-factory-7327`
- Constraint: no paid AI; no sealed-evidence edits; no PR merges; no Claude acceptance-test interference

## Completed

| Task | Status | Notes |
|---|---|---|
| PART I reconciliation | done | Mapped existing EDGAR connector, SourceArtifact, DocumentType, CovenantFamily, structural compiler, Phase A/B/C docs |
| TASK 1–2 EDGAR + responsible acquisition | done | `lib/knowledge-factory/edgar/**` rate limit, UA, retry/backoff, cache, checkpoints, logging, size limits, URL validation |
| TASK 3–4 classifier + ranking | done | Deterministic classes + UNKNOWN; discovery score for covenant language |
| TASK 5 canonical source registry | done | File store + Prisma `KnowledgeSource` migration |
| TASK 6 relationship graph | done | Amendment/restatement/etc with DISCOVERED vs chronology refusal |
| TASK 7 structural extraction | done | Reuses Headroom triage parser; persists ambiguous candidates |
| TASK 8 taxonomy | done | 20 families + UNKNOWN, versioned |
| TASK 9 pattern library | done | Seed patterns with failure modes; not executable rules |
| TASK 10 representation levels | done | Explicit levels + promotion guards |
| TASK 11 deterministic pipeline | done | Metadata→candidates without LLM |
| TASK 12 near-duplicate detection | done | Exact/normalized/near; mergeAllowed always false |
| TASK 13 semantic queue | done | Priority ranking; `paidExecutionEnabled: false` |
| TASK 14 semantic reuse | done | Precedent retrieval modes; never replaces verification |
| TASK 15 uncertainty queue | done | Active-learning reasons → reviewer/regression candidates |
| TASK 16–20 corpus | in progress | Fixture corpus implemented; live pilot attempted separately |
| TASK 21–24 retrieval | done | Search, named examples, graph traversal, reviewer dataset |
| TASK 25–27 cost | done | Separate estimated vs actual; scale models |
| TASK 28–31 validation | done | Acceptance handoff candidates; anti-overfit; integrity; legal safety |

## Blockers

- Live 100/500/2000-document acquisition depends on SEC.gov availability and session time under fair-access rate limits. Fixture path remains fully reproducible offline.

## Next ten implementation tasks

1. Persist structural nodes / candidates into Postgres (not only file manifests).
2. Expand live pilot to full 100-issuer stratified run with resume checkpoints.
3. Stratified 500-issuer expansion with diversity guards against near-identical contracts.
4. Scale acquisition toward 2,000 distinct debt documents with dedupe accounting.
5. Wire optional `Company`/`SourceArtifact` linkage for onboarding convergence.
6. Add Postgres full-text search over provision excerpts (evaluate pgvector only if justified).
7. Deepen amendment-chain linking with exhibit description crosswalks (still no chronology-only effectiveness).
8. Grow pattern library with counterexample fixtures from uncertainty queue.
9. Export Claude-owned acceptance candidates as sealed fixture packs (without editing Claude gates).
10. Benchmark throughput on 50 representative public filings and optimize hot paths.
