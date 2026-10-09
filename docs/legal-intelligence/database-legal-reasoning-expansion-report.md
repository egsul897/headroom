# Database intelligence & advanced legal reasoning expansion

Date: 2026-10-09  
Branch: `cursor/ns4-persisted-snapshot-store-0e3f`  
North Star / Phase 2–4E contracts preserved. Phase 3 certification gate unchanged. No continuous monitoring / ERP / generic forecasting.

## What shipped (reuse-first)

| Workstream | Implementation |
|---|---|
| A Structural quality | `lib/product/legal-reasoning/structural-quality.ts`, `party-identity.ts` — coverage, unknown queue, amendment rollup, issuer/borrower normalization |
| B Dependency graph | `transaction-deps.ts` — BFS over existing covenant dependency graph + pattern tagging |
| C Advanced analysis | `analysis-checklist.ts` — 10-step scaffold; wired into Ask when cutoff-ready |
| D Adversarial review | Extended `challenge.ts` categories; `adversarial-store.ts` persists OPEN disagreements (never auto-correct) |
| E Pattern library | +5 KF patterns (ratio-lien, available-amount, subsidiary-designation, cure, LME); loop associations |
| F Precedent clauses | `precedent-clause-search.ts` over mass-precedent index (no fabricated frequency stats) |
| G Benchmarks | `benchmark-cases.ts` — 12 case kinds; 2 policy-adjudicated; scorer for adjudicated subset |
| H Exercises | +3 exercises (LME, designation, equity cure); runners/scripts |
| I Counsel feedback | `counsel-feedback.ts` hooked from `recordReviewerDecision` (WORKSPACE scope only) |
| J Corpus | Stats over Neon + retrieval index (no raw count chase) |
| K North Star integrate | Ask transaction path attaches dependency scaffold note; authority labels unchanged |
| Phase 2 wire (follow-up) | KF `extractStructure` uses `detectStructuralDefinitions` + `detectStructuralReferences` with target resolution; upload path runs Phase 2C `buildPackageGraph`; product dependency graph adds SHARED_CAPACITY edges; `runPackageLegalPath` challenges any workspace summaries |

## Measured corpus (Neon)

- Sources (non–workspace-meta): **700**
- Documents with provision-level summaries: **644**
- Provision intelligence rows: **28,076**
- Unknown/ambiguous (`OTHER` / unresolved posture): **7,657**
- Definition sample resolution rate (excerpt-present heuristic): **1.0** on 28,538 sampled terms — *not* deep definition-graph accuracy
- Amendment documents: **256**; metadata linked after backfill: **224**; unresolved operative flags: **2**
- `KnowledgeRelationshipEdge` count: **8,193** (was 0 — discovery existed but never persisted to Neon)
  - Agreement: 24 AMENDMENT · 94 RESTATEMENT · 75 SUPPLEMENTAL = **193**
  - Provision (capped write of 65,940 discovered): DEFINITION 1052 · XREF 4017 · EXCEPTION 1248 · CONDITION 1633 · SHARED_CAPACITY 50

### Category coverage (provision rows)

DEBT 4171 · LIENS 2899 · RP/INV 1749 · ASSET_SALES 926 · GUARANTEES 2726 · EOD 5181 · BASKETS/EXCEPTIONS 6399 · FINANCIAL_MAINTENANCE 301 · OTHER 2401

### Pattern hits (top)

fixed-dollar 2180 · no-default 1585 · general-debt 953 · shared-capacity 523 · refinancing 369 · permitted-liens / ratio-basket 355 · builder 128 · greater-of 109 · reclassification 57

## Precedent index

133 sources · 35 issuers · 11,458 candidates · 42,078 cross-refs · 23,041 condition/exception signals · **2** amendment relationships

## Benchmarks / adversarial / exercises

- Pattern library size: **22**
- Exercises: **53**
- Benchmark cases: **12** (all bound to CONMED demo package key; 2 independently policy-adjudicated)
- Exercise factory: `generateExercisesFromSource` emits SYNTHETIC-assumption variants (not ground truth)
- Adjudicated policy scores (refuse invent / no-valid-path): **PASS** (unsupported_conclusion_rate 0, incorrect_permission_rate 0)
- Authentic-document exercise pass (CONMED Eighth A&R CA, 15 provision items):
  - `debt.secured.100`, `rp.available_amount`, `multi.reclass`, `lme.debt_exchange`, `entity.designate_unrestricted`, `fc.equity_cure` → all **CONDITIONAL** (fail-closed on missing financials / incomplete compile)
  - Dependency scaffold SECURED_DEBT: **6/10** steps addressed, **9** provisions, **35** edges, patterns include shared-capacity / greater-of / permitted-liens
  - Adversarial second pass: UNSUPPORTED_STACKING + OVERLOOKED_PROVISO findings (not auto-authoritative)

## Product integration

- Counsel ACCEPT/EDIT/REJECT → `captureCounselFeedback` (workspace-scoped)
- Ask transaction-ready answers → dependency scaffold note (DISCOVERED ≠ certified)
- Challenge stage → stacking / double-count / wrong amendment / missed restriction / proviso / unsupported conclusion
- Executable capacity remains LEGACY_ENGINE / NOT_CERTIFIED_4E until Phase 3 IR + 4A–4E

## Remaining high-priority deficiencies

1. Provision-edge persist capped at 8k of 65.9k discovered — raise/stream remaining edges.
2. Definition resolution still sample/excerpt-based — need adjudicated graph-level accuracy.
3. Only 2/12 benchmark cases independently adjudicated (package keys now bound).
4. Phase 4E certified path enumeration still not product-wired (`phase4eStarted: false`).
5. UNKNOWN/OTHER provision queue (7.6k) — soft suggestions exist; counsel queue not productized.
6. Precedent clause search is index-level (title/family/defs), not full operative clause text.
7. Table/schedule structured extraction remains thin.

## Tests

- `tests/product/legal-reasoning.test.ts` (new)
- `tests/product/legal-intelligence.test.ts`
- `tests/product/covenant-intelligence-loop.test.ts`
