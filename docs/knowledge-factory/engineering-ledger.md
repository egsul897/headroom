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

- Recent-filing windows for many large IG issuers contain few debt exhibits; need deeper historical submission chunks + form 424B/S-4 coverage.
- Some ticker symbols unresolved in SEC company_tickers.json (e.g. HOLX, SEE under those symbols).
- Early acquisition admitted auditor consents / bylaws / employment agreements (now hard-negatived); 6 false positives remain in local corpus and are excluded from debt counts.
- Paid semantic compilation disabled by mandate — semantic hypotheses and verified representations remain 0.

## Measured live acquisition (this session)

See `docs/knowledge-factory/manifests/data-production-checkpoint.json` and
`docs/knowledge-factory/manifests/pilot-100-production-report.json`.

- Pilot-100 production report: **113** financing documents (target 100)
- Unique instrument identities: **112**
- Structural nodes: **37,789**; covenant candidates: **4,590**; definitions: **257**
- Condition/exception records: **14,975**; cross-refs: **23,876**
- EHB handoff consumed; second-run dedupe demonstrated (source count unchanged)
- Verified examples: **0**; paid AI: **$0**
- Persistence: local `.local-knowledge-corpus/` (no DATABASE_URL / Blob in this VM)
- PR: https://github.com/egsul897/headroom/pull/154
- Coordinated with WS-EHB branch `cursor/edgar-historical-backfill-c45c`

## Phase 3 — durable preservation & cross-agent integration

- **Durability claim: IMPLEMENTED (Postgres BYTEA) / not yet DURABILITY_PROVEN** — Cursor-first path uses `document_byte_objects` on shared Neon; Blob optional. Live proof gated on authorized migrate deploy + independent agent retrieve (`docs/knowledge-factory/durability/`).
- Source inventory: `docs/knowledge-factory/preservation/source-inventory.json`
- Acquisition manifest + recovery: `docs/knowledge-factory/preservation/acquisition-manifest.json`, `scripts/knowledge-factory/recover-from-manifest.ts`
- Canonical consumer export: `knowledge-factory.consumer-export.v1` under `docs/knowledge-factory/export/v1/`
- Independent consumer imports demonstrated: Definition Encyclopedia + Dependency Atlas (shared sourceIds, pass-2 idempotent)
- Replay against pilot targets: exact match (113 / 112 / 37789 / 4590 / 257 / 23876 / 14975)
- Missing infra: `DATABASE_URL` + Blob read/write token for verified shared durability

## Next ten implementation tasks

1. When approved Postgres + Blob credentials exist: persist KnowledgeSource rows + bytes; verify read-after-write and independent-session retrieval.
2. Purge/quarantine known false-positive SEC exhibits from the active debt corpus.
3. Expand live run to full 100-issuer stratified plan with filingLimit≥200 and older submission files.
4. Add 424B5/S-4 exhibit paths and deepen indenture discovery.
5. Scale toward 500 issuers / 2,000 distinct debt documents with diversity guards.
6. Improve amendment-chain linking from exhibit descriptions (no chronology-only effectiveness).
7. Postgres FTS over provision excerpts; defer pgvector unless justified.
8. Mine uncertainty queue into new pattern counterexamples (still unverified).
9. Hand off sealed fixture packs to Claude acceptance without editing Claude gates.
10. Throughput benchmark + optimize structural parse on multi-MB HTML exhibits.
