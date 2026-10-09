# HEADROOM — North Star Knowledge System Integration Audit

**Role:** WS-PAR Integration Lead  
**Mode:** READ-FIRST, EVIDENCE-DRIVEN, INTEGRATION-FOCUSED  
**Audit window start (origin/main):** `e5b8a21261bb47eadc6bb552e4204473276b15e8`  
**Tip at report time (origin/main):** `c51d96c3fc5a2d3e532e1223bf9b7f4ebc11c9c8` (#139 Definition Encyclopedia merged during audit)  
**Paid inference / mass SEC acquisition:** none  
**Provider-free tests run:** `tests/architecture/parallel-agents` (21), `tests/definition-encyclopedia` (16), `tests/covenant-research/phase3-independent-eval` (2) — all passed  

**FINAL VERDICT:** `CANONICAL_KNOWLEDGE_SYSTEM_FRAGMENTED`

---

## 1. STARTING_MAIN_SHA

| Field | Value |
|---|---|
| STARTING_MAIN_SHA | `e5b8a21261bb47eadc6bb552e4204473276b15e8` |
| TIP_AT_REPORT | `c51d96c3fc5a2d3e532e1223bf9b7f4ebc11c9c8` |
| Tip advance during audit | Merge of PR #139 (Definition Encyclopedia) |

Controlling product architecture remains `docs/headroom-north-star-v2.md`. Architecture invariants in `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md` remain in force. This audit does **not** propose a new product direction.

---

## 2. CURRENT_PR_INVENTORY

### Recently merged (relevant to knowledge system)

| PR | Head SHA | Merge SHA | Title | Band |
|---:|---|---|---|---|
| 139 | `93b908265484` | `c51d96c3fc5a` | Definition Encyclopedia Phase 2 | FAST_TRACK (research) |
| 152 | `a3fc44138f39` | `e5b8a21261bb` | Covenant precedent research interface | FAST_TRACK |
| 142 | `3a3070a2735d` | `cb89db8a82b5` | WS-EHB EDGAR historical backfill | FAST_TRACK |
| 170 | `be01bf590d46` | `4feff69f05ef` | Basket Formula Library Phase 4 | FAST_TRACK |
| 149 | `0c98acd99f3e` | `ab87979fe6e7` | Source-to-covenant dataset Phase 2 | FAST_TRACK |
| 147 | `2090056dfddd` | `deae3435b58f` | Rare covenant drafting novelty | FAST_TRACK |
| 151 | `6b02442b250e` | `502db938614e` | WS-FDP financial-definitions precedent | FAST_TRACK |
| 150/158 | `830f0a03d21d` / `1cb13e2b10a3` | `098edde59e12` / `64e5b5c23d15` | Amendment-chain research + remediation | FAST_TRACK |
| 148 | `01a197281709` | `42eb32163095` | Basket formula Phases 1–3 | FAST_TRACK |
| 145 | `f52c00f45bb0` | `adc385801deb` | CKG generalization benchmark | FAST_TRACK |
| 144 | `7ba6a081da46` | `4e1da1697989` | PCI precedent comparison sidecar | FAST_TRACK |
| 143 | `ed2216ab21dc` | `b2740f7df07a` | Offline NCEDB | FAST_TRACK |
| 140 | `2d772f66bba9` | `46912066e419` | Covenant Dependency Atlas | FAST_TRACK |
| 137 | (see merge) | `ef644c4a3dd3` | Independent product validation (synthetic) | FAST_TRACK |
| 138 | (see merge) | `f44ada7b7703` | Parallel agent operating rules | FAST_TRACK |

### Open PRs (exact heads at audit)

| PR | Head SHA | Base | Draft | Mergeable | Status | Title |
|---:|---|---|---|---|---|---|
| 163 | `2a536040b7f8` | main | no | MERGEABLE | CLEAN | Parse glued `(i)(A)` labels; stop fabricated `(b)(x)/(b)(y)` |
| 164 | `2017ccabf806` | main | yes | MERGEABLE | CLEAN | Chewy §6.08 adjacent markers (overlaps #163) |
| 161 | `4736ea4a9938` | main | yes | MERGEABLE | UNSTABLE | P0 Chewy span truncation (overlaps #163 family) |
| 141 | `c20cec11f031` | main | no | CONFLICTING | DIRTY | WS-CCA Cursor Cloud compute infra |
| 154 | `0e5b3e75b284` | main | yes | CONFLICTING | DIRTY | **WS-CKF Knowledge Factory** (canonical hub) |
| 153 | `bd5dd106fb12` | main | yes | CONFLICTING | DIRTY | Live corpus quality gate |
| 146 | `0dbe81f4f67a` | main | yes | CONFLICTING | DIRTY | VIC independent compilation (**C-DUP-KF**) |
| 169 | `db9d7dc950e9` | main | yes | MERGEABLE | UNSTABLE | Gibraltar offline remeasure |
| 171 | (new) | main | yes | UNKNOWN | UNKNOWN | Fail closed on qualitative gate condition loss |
| 136 | `696b9372c3e8` | #135 stack | yes | MERGEABLE | UNSTABLE | Architecture remediation shared-capacity P0 |
| 168 | `e3b30d2279d5` | #136 stack | yes | MERGEABLE | UNSTABLE | IPV-16 section override safety |
| 135 | `57c9eb498d92` | Track D stack | yes | CONFLICTING | DIRTY | Gibraltar Haiku compile |
| 156 | `a66c6466f218` | #150 branch | yes | MERGEABLE | UNSTABLE | Legal challenge of amendment-chain research |

---

## 3. CANONICAL_ARCHITECTURE_MAP

### Controlling product stack (North Star v2)

```
Debt documents → Phase 2 operative evidence → Phase 3 certified rulebook
Compliance certificates → Phase 4B approved snapshots
Ledger / elections → Phase 4C capacity state
Ask Headroom → 4A–4E deterministic evaluation
```

Implementation anchors on main:

| Layer | Path | On main? |
|---|---|---|
| Product EDGAR / upload ingest | `lib/connectors/**`, Prisma `SourceArtifact` | YES |
| Document bytes | `lib/document-storage/**` | YES |
| Structural parse / hierarchy | `lib/contract-model/compiler/{stage-structure,clause-hierarchy,structural-index}.ts` | YES |
| Covenant discovery | `lib/contract-model/compiler/discovery/**` | YES |
| Amendment / operative state | `lib/contract-model/compiler/amendment/**` | YES |
| IR / certification | `lib/contract-model/ir/**`, `phase3-certification/**` | YES (reliability gate open) |
| Capacity / ledger engines | `lib/covenant-engine.ts`, `lib/contract-model/runtime/capacity/**` | YES |
| Financial-core | `lib/financial-core/**` | YES |

### Knowledge-corpus fleet (intended hub + overlays)

| Component | Canonical owner | Path | On main? |
|---|---|---|---|
| **Knowledge Factory (hub)** | WS-CKF | `lib/knowledge-factory/**`, `docs/knowledge-factory/**` | **NO** (PR #154 DIRTY) |
| EDGAR historical discovery | WS-EHB | `lib/edgar-historical-backfill/**` | YES |
| Definition Encyclopedia | WS-DEF | `lib/definition-encyclopedia/**`, `docs/definition-encyclopedia/**` | YES (#139) |
| Dependency Atlas | WS-CDA | `docs/covenant-dependency-atlas/**`, `scripts/covenant-dependency-atlas/**` | YES |
| Basket Formula Library | WS-BFL | `lib/basket-formula-corpus/**` | YES |
| Covenant research retrieval | WS-CRI | `lib/covenant-research/**` | YES |
| NCEDB | WS-NED | `docs/negative-covenant-exception-database/**` | YES |
| Amendment-chain research | WS-RAC | `docs/amendment-chain-research/**` | YES |
| Precedent comparison | WS-PCI | `lib/precedent-comparison/**` | YES |
| Financial-def precedent | WS-FDP | `docs/financial-definitions-precedent/**` | YES |
| Source-to-covenant dataset | WS-STC | `datasets/source-to-covenant/**` | YES |
| CKG benchmark | WS-CKB | `lib/evaluation/ckg-benchmark/**` | YES |
| PAR contracts | WS-PAR | `docs/architecture/parallel-agents/**` | YES (dashboard stale vs tip) |

**Critical structural fact:** the published merge sequence (`07-integration-gates.md`) places **WS-CKF before corpus overlays**. Overlay workstreams merged anyway; the hub did not. Consumers probe `exports/*` roots that **do not exist** on main (`lib/covenant-research/knowledge-factory.ts` still reports DEF/BFL/NCEDB/Atlas as PARTIAL/UNAVAILABLE even after those trees landed under `docs/` / `lib/`).

---

## 4. END_TO_END_CONNECTION_MATRIX

Proposed flow and actual status:

| # | Arrow | Exists? | Implementation | Authentic data exercised? | Persisted? | Provenance preserved? | Missing / conflict behavior |
|---:|---|---|---|---|---|---|---|
| 1 | SEC discovery → acquisition queue | YES (EHB) | `lib/edgar-historical-backfill` → `docs/edgar-historical-backfill/ckf-handoff-summary.json` (149 fetchable) | YES (live SEC discovery; bodies ephemeral) | Queue summary in git; runtime `data/` absent | Accession/exhibit IDs yes | Deferred IBR; no body download by EHB |
| 2 | Acquisition queue → durable original bytes | **BROKEN** | Intended: WS-CKF `lib/knowledge-factory/**` (PR #154). Product path: `lib/connectors` + `document-storage` (company-scoped, not corpus hub) | CKF branch claims local bytes; durability probe `durable:false` | **Not cross-VM durable** | Hashes in manifests | First broken link for fleet corpus |
| 3 | Bytes → source identity / hash / version registry | PARTIAL | Product: `SourceArtifact.contentHash`. Fleet: CKF inventory on #154 only; many peer registries coexist | Product yes; fleet yes on branch | Product Prisma; fleet docs JSON | Yes where present | Duplicate registries (G4 risk) |
| 4 | Source → text extraction | PARTIAL | Product extraction + CKF `pipeline/text.ts` (branch); research often reads fixtures | Fixture packages yes | Product chunks; research files | Hash/version mixed | Failures not unified |
| 5 | Text → structural parsing | YES (product) | `stage-structure` / `clause-hierarchy` | Real packages (CONMED/DSGR/…) | Prisma `DocumentNode` when compiler persists; many runs in-memory/fixtures | Offsets yes | Hierarchy defects (#163 family) |
| 6 | Structure → covenant/definition discovery | YES (product) + overlays | Discovery pipeline; DEF encyclopedia; research ingest | Real fixtures | Product optional; DEF/docs JSON SOURCE_ONLY | Citations yes | Pass B LLM when keyed; else caches |
| 7 | Discovery → normalized knowledge records | PARTIAL / fragmented | Peer schemas (DEF, BFL, NCEDB, atlas, STC, research corpus) — **no single KF import on main** | Overlay-specific | File-backed docs/datasets | Often SOURCE_ONLY / UNVERIFIED | No shared promotion path |
| 8 | Records → dependency / amendment relationships | PARTIAL | Product amendment engine; research atlas/chains; CKF edges on #154 | Fixture + research | Mixed | Amendment research PENDING_INDEPENDENT_REVIEW | Operative-state fail-closed in product |
| 9 | Knowledge → canonical persistent DB | **BROKEN for fleet** | Prisma product models exist; KF Prisma migration **not on main**; research `DB_INTEGRATION_UNVERIFIED` | Product companies only | Product DB; research no | Product yes | Research returns `[]` without DATABASE_URL |
| 10 | Persistent store → precedent/semantic retrieval | FIXTURE_INTEGRATED | `lib/covenant-research/retrieve.ts` over file corpus; PCI sidecar; semantic-precedent advisory | Fixture-derived corpus (6607 entries / 25 docs) | File JSON | Verification labels honest (0 SOURCE_VERIFIED) | Unsupported refusal works |
| 11 | Retrieval → unfamiliar-package analysis | UNPROVEN | No production wiring from research corpus → package analysis | Independent SUP eval only | N/A | Citations checked in eval | Held-out ≠ independent |
| 12 | Analysis → source-backed legal verification | PARTIAL (product Phase 3) | Certification path; research explicitly non-promoting | Unseen validations FAILED / NEEDS_ITERATION | ClaimReviewItem etc. | Trust dims separate | False-permission gates block |
| 13 | Verified rules → capacity / simulation | PRODUCT PATH ONLY | `covenant-engine` / runtime capacity; BFL `executable:false` | Seeded companies / synthetics | Ledger Prisma / in-memory 4C | Legacy vs solver routing | Must not consume research hypotheses |

**Label summary for fleet knowledge path:** discovery/handoff contracts exist; **durable acquisition + canonical registry + DB persistence + real export consumption** are the broken arrows. Fixture adapter tests are not real-data connections.

---

## 5. CORPUS_RECONCILIATION

**There is no single reconciled registry of authentic financing documents on main.** Do not sum across rows.

| Inventory | Distinct issuers / CIKs | Financing docs (declared) | What the count measures | Durable bytes? | Verification |
|---|---:|---:|---|---|---|
| Unseen-package fixtures | ~8–9 named packages | ~dozen package roots | Shared physical fixture store | In git | Fixtures |
| Research Phase 3 corpus | **9** issuers / **25** docs | 25 docs → **6,607** indexed entries | Research spans, not docs | File JSON | SOURCE_VERIFIED **0** |
| Definition Encyclopedia | (from 82 sources) | **82** sources / **5,491** definition examples | Definition examples ≠ docs | docs JSON | SOURCE_ONLY |
| EHB pilot-100 v2 | **100** CIKs | **149** fetchable queue items / 868 distinct agreements discovered | Discovery metadata | Ephemeral `data/` | N/A (queue) |
| CKF PR #154 (not main) | 38 discovered | **113** financing + 12 fixtures | Local corpus claim | **durable:false** | Non-promoting |
| NCEDB phase-3 | 13 issuers | 37 tracked docs | Exception dataset | docs JSON | Research |
| STC dataset | 7 issuers | 229 **records** | Labeled records | datasets/ | Hypothesis-heavy |
| FDP registry | 6 issuers | 11 docs / 4,334,318 fixture bytes | Calc precedent | fixtures | independentlyVerified **0** |
| Dependency atlas | 8 issuers | 25 docs / 9,122,670 bytes | Graph corpus | docs/fixtures | Research |
| Basket formula | 7 instruments | 55 basket candidates | Formula research | docs export | Non-executable |
| Amendment-chain | 6 chains | 34 documents in KF export | Chain research | docs JSON | PENDING_INDEPENDENT_REVIEW |
| Rare-covenant phase-2 | 38 issuers | 100 acquired agreements | Novelty probes | gitignored `data/` | Research |
| CKG benchmark | Gibraltar/SUP + synthetics | 36 cases | Eval only | fixtures | Diagnostic |

**Honest floor for “authentic financing document texts available on main without re-download”:** the overlapping fixture packages under `tests/fixtures/unseen-packages/**` plus committed research extracts — on the order of **tens of documents**, not thousands. EHB’s 149 and CKF’s 113 are **not** durably available on main tip.

**Expansion bottleneck today:** (1) **canonical durable storage / CKF hub missing on main**, then (2) normalization into one registry, then (3) indexing/retrieval wiring, then (4) verification. Acquisition discovery (EHB) is ahead of persistence.

---

## 6. PERSISTENCE_VERDICT

**Accumulated fleet knowledge is not genuinely durable and reusable across agent workspaces.**

Evidence:

1. CKF durability probe (PR #154): `mode: LOCAL_ONLY_NOT_CROSS_VM_DURABLE`, `durable: false`, `claim: NONE`.
2. EHB handoff: `storageStatus: COMMITTED_DOCS_SUMMARY`; runtime queue under `data/` workspace-local; `data/` absent in this workspace.
3. Research: `DB_INTEGRATION_UNVERIFIED`; `canonical export rows loaded: 0`; `realExportTested=false` for `exports/*`.
4. Product Prisma `Document` / `SourceArtifact` / `ContractCompilerRun` / `SemanticTruthRecord` are real but **company-product scoped**, not the fleet corpus hub.
5. Peer overlays persist as **git JSON under docs/datasets** — reusable as files, not as a live growing knowledge service.

---

## 7. KNOWLEDGE_ACCUMULATION_VERDICT

### Central question

**IF WE INGEST ONE NEW AUTHENTIC DEBT DOCUMENT TODAY, DOES HEADROOM BECOME MORE KNOWLEDGEABLE TOMORROW?**

### Answer: **NO — not as a canonical, durable, cross-component system on current main.**

| Sub-question | Status | Evidence |
|---|---|---|
| A. Original document durably available | FAIL (fleet) / PARTIAL (product) | CKF not on main; product storage needs DB+blob |
| B. Definitions/covenants enter canonical store | FAIL | No KF store; DEF/research are separate file corpora |
| C. Relationships/drafting variations searchable | PARTIAL | Research retrieve + DEF search index over **existing** files; no auto-ingest hook |
| D. Downstream access without manual copy | FAIL | Manual fixture/export paths; stale probes miss peers |
| E. Re-ingestion idempotent with source identity | PARTIAL design | Product contentHash dedup; CKF branch demonstrates dedupe; not on main hub |
| F. Amendments as version relationships | PARTIAL | Product operative-state yes; research chains PENDING review; no overwrite of certified history observed |
| G. Subsequent unseen analysis retrieves new doc | FAIL | No demonstrated path from new ingest → research index → unseen analysis |
| H. Verification statuses truthful | PASS (honesty) | Research 0 SOURCE_VERIFIED; DEF SOURCE_ONLY; BFL non-executable |
| I. No false executable permissions | PASS (gates) | Research refusals; BFL `executable:false`; promotion guards |

**First broken link:** durable original-source storage + canonical registry owned by WS-CKF is not on main (`lib/knowledge-factory` absent), while consumers and EHB already assume it.

**Minimum close:** rebase/merge CKF (#154) with durability prerequisites (shared Postgres + object storage) **or** explicitly designate a weaker but real git-export hub and rewrite consumers to it — without claiming cross-VM durability until probe passes.

---

## 8. UNSEEN_PACKAGE_VALIDATION_VERDICT

Existing evaluation **partially** measures the product objective; it does **not** prove that accumulated precedent improves unfamiliar-package legal analysis.

| Evidence | Verdict | Notes |
|---|---|---|
| Phase 2F CONMED | `NEEDS_ITERATION` | Systemic structural silence lesson |
| Phase 3F DSGR | `NEEDS_ITERATION` | |
| Phase 3F.2 RIOT resume | **`FAILED`** / `NO_GENERALIZATION_NOT_YET_SUFFICIENT` | Supersedes ENVIRONMENT_BLOCKED |
| Final lightweight SUP | **`TRUST_BOUNDARY_FAILED`** | |
| Independent research retrieval (SUP, 57 queries) | Recall@5 **0.4314**; citation **0.5714** | **Still authoritative; not superseded** |
| Held-out research rerank | Recall@5 1.0 / P@5 0.3364 | Secondary only — do not substitute |
| CKG offline baseline | Diagnostic; unseen-doc rollup **0%**; false-permission incidence **50%** on controls | Certification impact: none |
| Independent product validation (#137) | Synthetic offline packages | Not authentic end-to-end |

Retrieval ≠ legally correct interpretation. Familiar-fixture success does not prove generalization.

Provider-free recheck this audit: `phase3-independent-eval` passed (rates >0 / citation >0.5); exact 0.4314/0.5714 remain the committed authoritative figures in `docs/covenant-precedent-research-integration-gate.md`.

---

## 9. TOP_10_BLOCKERS (ranked by North Star impact)

1. **WS-CKF hub absent on main (#154 DIRTY)** — no durable canonical corpus registry for fleet knowledge.
2. **No cross-VM durable source bytes** — CKF durability claim NONE; EHB bodies ephemeral.
3. **Fragmented registries** — research ingest, STC, NCEDB, DEF, atlas, FDP, EHB, CKF branch inventories overlap without reconciliation.
4. **Stale consumer contracts** — `probeKnowledgeFactoryIntegrations()` / `exports/*` adapters do not see merged peer trees.
5. **Parser hierarchy correctness (#163/#164/#161 family)** — false fabricated nodes / truncated spans poison structure substrate.
6. **Phase 3 generalization / trust-boundary failures** — 3F.2 FAILED; lightweight TRUST_BOUNDARY_FAILED; false-permission risk.
7. **Shared-capacity / aggregate-limit representation (#136/#168 stack)** — legal-core RESTRICTED; CI unstable.
8. **C-DUP-KF (#146)** — second knowledge store under `lib/contract-model/covenant-knowledge/**` forbidden.
9. **Research knowledge unverified** — 6,607 entries with SOURCE_VERIFIED=0; must not feed executable capacity.
10. **Product surfaces disconnected from Contract Evidence Substrate** — Ask/Capacity still legacy-engine oriented; Track C must not outrun A/B.

---

## 10. EXISTING_WORKSTREAM_ASSIGNMENTS (no duplication)

| Workstream | Owns | Do not reassign / duplicate |
|---|---|---|
| WS-CKF | `lib/knowledge-factory/**`, corpus registry, SEC scheduler impl, KF Prisma migration | Do not create second registry in EHB/VIC/research |
| WS-EHB | Historical discovery queue / handoff only | Must not download bodies into a second store |
| WS-DEF | Definition encyclopedia (now on main) | FDP remains financial-calc precedent only |
| WS-CDA | Dependency atlas research graph | Not production dependency resolver |
| WS-BFL | Basket formula research library | Never touch `runtime/capacity` / `covenant-engine` |
| WS-CRI | Research retrieval CLI | Not Ask Headroom / capacity |
| WS-NED | NCEDB exception research | Non-promoting |
| WS-RAC | Amendment-chain research | Not `compiler/amendment/**` |
| WS-PCI | Precedent comparison sidecar | No prisma/app wiring |
| WS-FDP | Financial definition precedent | Not DEF encyclopedia |
| WS-STC | Source-to-covenant dataset | Not second source registry |
| WS-CKB | Independent generalization bench | No tuning contamination (G6) |
| WS-VIC | Provider-independent compilation adapters | Remove C-DUP-KF store before merge |
| WS-CCA | Cursor Cloud compute infra | Soft-gate; no paid inference |
| WS-GIB / Legal core tracks | Gibraltar / shared-capacity / certification | RESTRICTED; no bypass |
| WS-PAR | Contracts, gates, merge discipline, this audit | Does not rewrite CKF/VIC production |

---

## 11. MINIMUM_END_TO_END_PROOF PLAN

**Goal:** smallest real-data demonstration that accumulated knowledge from Doc A improves analysis of unseen Doc B — without fake fixtures, hardcoded outcomes, or manual folder copying.

### Prerequisites (currently missing)

1. CKF on main **or** an explicitly accepted interim git-export hub with durable object storage + Postgres.
2. Durability probe flip: `readAfterWriteVerified=true` and `independentSessionRetrievalVerified=true`.
3. Consumer adapters reading **real** CKF export (not `exports/*` placeholders / stage1 fixtures).

### Proposed commands (once prerequisites exist)

```bash
# A) Acquire & register authentic Doc A (public EDGAR exhibit) via CKF
npx tsx scripts/knowledge-factory/ingest-one.ts --accession <A> --exhibit <file>

# B) Prove durability in a fresh process/workspace
npx tsx scripts/knowledge-factory/durability-probe.ts --sourceId <id>
# PASS: bytes + registry row + contentHash round-trip

# C) Extract + export canonical records (definitions/covenants/edges) — non-promoting
npx tsx scripts/knowledge-factory/phase3-preserve-and-export.ts --sourceId <id>

# D) Consumers import by canonical sourceId (idempotent pass-2)
npx tsx scripts/definition-encyclopedia/import-kf.ts --sourceId <id>
npx tsx scripts/covenant-dependency-atlas/import-kf.ts --sourceId <id>
npx tsx scripts/covenant-precedent-research.ts ingest --kf-export docs/knowledge-factory/export/v1

# E) Unseen Doc B (issuer-disjoint) retrieval + citation check
npx tsx scripts/covenant-precedent-research.ts evaluate-independent --queries <B-queries.json>
```

### Pass / fail criteria

| Check | Pass |
|---|---|
| Doc A bytes retrievable after new session | Required |
| Registry idempotent on re-ingest | Same sourceId/contentHash; no duplicate instruments |
| DEF/atlas/research contain Doc A records without manual copy | Required |
| Doc B retrieval cites Doc A spans with correct sourceId | ≥1 correct precedent hit with citation |
| Verification labels remain non-certified unless independently verified | SOURCE_ONLY/UNVERIFIED not treated as CERTIFIED |
| No executable permission created | Capacity/certification untouched |

**Current status:** **cannot execute successfully on main tip** — step A’s owner tree is absent; durability fails by CKF’s own probe on the branch.

---

## 12. DEPENDENCY_ORDERED_ROADMAP

Completes the **original** North Star / revised roadmap (`headroom-north-star-v2.md`, `06-revised-roadmap.md`) without replacement phases.

### TRACK A — KNOWLEDGE ACCUMULATION (parallel-safe with non-promoting work)

| Milestone | Reuse | Depends on | Smallest implementation | Owner | Acceptance | Merge criteria | Parallel? |
|---|---|---|---|---|---|---|---|
| A1 CKF hub on main | PR #154 trees | Rebase; schema ownership | Land `lib/knowledge-factory` + consumer export v1; durability honest | WS-CKF | Idempotent ingest + export schema tests | Non-promoting; G1–G10 | After rebase |
| A2 Durable bytes + registry | document-storage + KF Prisma | A1 + shared DB/blob | Durability probe green cross-session | WS-CKF | Probe claim ≠ NONE | Infra available | Blocks A3+ claims |
| A3 EHB → CKF acquire | EHB handoff 149 | A1–A2 | Consume queue; no second registry | EHB+CKF | Fetchable items become registry rows | Scheduler contract | Yes with A4 overlays |
| A4 Wire consumers to real export | DEF/BFL/CDA/CRI/NCEDB | A1 | Replace stale `exports/*` probes; import by sourceId | PAR+peers | `realExportTested=true` | No schema forks | Yes among peers |
| A5 Continuous research index | covenant-research ingest | A3–A4 | Auto-index new sources; keep verification honest | WS-CRI | New doc appears in retrieve without manual copy | Non-promoting | After A4 |
| A6 Scale acquisition | EHB scale-1000 / CKF | A2–A3 | Broaden corpus under fair-access | EHB+CKF | Deduped distinct docs grow | G4/G8 | Yes |

### TRACK B — LEGAL CORRECTNESS (must not be bypassed)

| Milestone | Reuse | Depends on | Smallest implementation | Owner | Acceptance | Merge criteria | Parallel? |
|---|---|---|---|---|---|---|---|
| B1 Parser hierarchy | #163 family | — | Merge one glued-marker fix; close duplicates | Parser track | Chewy replay + Gibraltar x/y preserved | CI green; not CERTIFIED claim | Yes with A |
| B2 Shared-capacity / IPV-16 | #136/#168 | Legal-core stack | Fail-closed unresolved overrides | GIB/legal | Certified path green; no false cert | RESTRICTED gate | Careful parallel |
| B3 Phase 3 reliability | Stratified cert | B1–B2 as needed | Close trust-boundary defects | Legal core | N1 progress per revised roadmap | No sealed-evidence edits | Limited |
| B4 Operative amendment safety | compiler/amendment + RAC | — | Keep fail-closed; challenge #156 informs only | Legal + RAC | No superseded-as-current | G3 | Yes research |
| B5 False-permission prevention | BFL adversarial + engine | — | Keep research non-executable; engine fail-closed | BFL + engine owners | No hypothesis→permission | G1/G2 | Yes |

### TRACK C — PRODUCT SYNTHESIS (must not outrun A/B)

Follow `06-revised-roadmap.md` steps 4–16: persisted 4B snapshots → certificate ingest → selector resolution → certified rulebook join → persisted 4C ledger → capacity → 4E paths → Ask Headroom → package-wide E2E. **Do not** wire research hypothesis corpora into capacity.

---

## 13. IMMEDIATE_INTEGRATION_ACTIONS

### Merge now (safe / non-promoting) — after tip CI green

| PR | Action | Why |
|---|---|---|
| **#163** | Merge preferred among Chewy glued-marker family | CLEAN, non-draft, concrete hierarchy fix; blocks fabricated permissions from bad structure |
| **#139** | Already merged | DEF on tip `c51d96c3` |

### Rebase then re-audit (do not merge dirty)

| PR | Action |
|---|---|
| **#154 CKF** | Highest Track A priority after rebase + schema ownership coordination; durability claims must stay honest |
| **#141 CCA** | Soft-gate infra; rebase; keep fail-closed promotion |
| **#153** | Live corpus quality gate — wait for CKF |

### Remain blocked

| PR | Why |
|---|---|
| **#146 VIC** | C-DUP-KF second knowledge store |
| **#136 / #168 / #135** | Legal-core / CI unstable / stack conflicts — RESTRICTED |
| **#161 / #164** | Overlap with #163 — consolidate rather than double-merge |
| **#156** | Challenge of already-merged research; CI unstable; do not reopen #150 |
| **#169** | Soft-gate remeasure; not a knowledge-hub unlock |

### Coordinator hygiene (this PR)

- Refresh `14-continuous-main-integration-dashboard.json` to tip + post-#139/#152/#142/#170 reality.
- Do **not** launch mass SEC acquisition or paid inference.
- Do **not** invent a competing registry.

---

## 14. FINAL VERDICT

### `CANONICAL_KNOWLEDGE_SYSTEM_FRAGMENTED`

**Why not END_TO_END_PROVEN:** no real-data, durable, cross-component, unseen-document demonstration has passed; CKF durability itself claims NONE.

**Why not merely PARTIALLY_INTEGRATED:** many overlays are on main, but they do not form **one** persistent canonical growing system — registries diverge, hub missing, consumers stale, persistence non-durable, and knowledge accumulation fails the tomorrow-test.

**What is real:** Phase 2 product substrate; non-promoting research overlays; honest verification labels; PAR ownership contracts; EHB discovery handoff shape; independent research metrics 0.4314 / 0.5714 still authoritative.

**Shortest credible path:** land durable CKF hub → wire EHB + peer consumers to one export → keep Track B gates closed against false permissions → only then attempt the minimum Doc A → Doc B proof.

---

## Workstream status labels (A–L)

| ID | Component | Labels |
|---|---|---|
| A | EDGAR / WS-EHB | `IMPLEMENTED_ISOLATED` + handoff docs; acquisition bodies not `PERSISTED` on main |
| B | Knowledge Factory registry | `NOT_IMPLEMENTED` on main (exists on #154 as non-durable) |
| C | Structural parsing | `REAL_EXPORT_INTEGRATED` into product compiler; hierarchy defects open |
| D | Covenant discovery / semantic compile | `REAL_EXPORT_INTEGRATED` product path; certification not generalized |
| E | Definition Encyclopedia | `IMPLEMENTED_ISOLATED` / file `PERSISTED` in git; `SOURCE_ONLY`; not KF-hub integrated |
| F | Dependency Atlas | `IMPLEMENTED_ISOLATED` research; KF import pending |
| G | Basket Formula Library | `IMPLEMENTED_ISOLATED`; explicitly non-executable |
| H | Covenant Research | `FIXTURE_INTEGRATED`; independent eval recorded; DB unverified |
| I | Amendment / operative-state | Product `REAL_EXPORT_INTEGRATED`; research chains isolated |
| J | Ledger / capacity / simulation | Product engines present; research must not feed them |
| K | Source storage / DB / retrieval | Product path yes; fleet canonical path missing |
| L | Unseen-package evaluation | Harnesses exist; results FAILED / NEEDS_ITERATION / diagnostic — not `END_TO_END_TESTED` success |

Machine-readable twin: `01-audit-summary.json`.
