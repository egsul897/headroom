# Headroom — Complete phase-by-phase development roadmap

**Status:** ACCEPTED product elaboration (founder roadmap, 2026-10-09).  
**Controlling architecture:** `docs/headroom-north-star-v2.md` (unchanged).  
**Implementation gate sequence:** `docs/headroom-north-star-reconciliation/06-revised-roadmap.md` remains the **shortest-path gate order** (R0 + steps 1–16). This document is the human-readable phase map, customer workflow, and priority list.  
**Does not supersede:** the 37 architecture invariants; NS-4 soft gates; Phase-3 seals.

If a future change would reorder gates so that customer UI or legacy capacity becomes authoritative before approved snapshots + certified 4A–4E, that requires an explicit `ARCHITECTURE_CHANGE_PROPOSAL`.

---

## North Star

Headroom is an AI-powered debt-document and transaction intelligence platform for CFOs, treasury teams, capital markets lawyers, and financial advisers.

Its central question is:

> **Can we do this transaction — under which provisions, with how much capacity, on what conditions, and with what effect?**

Headroom must combine:

1. Certified contractual rules from operative debt documents.
2. Approved periodic financial snapshots, including quarterly compliance certificates.
3. Historical transaction and basket-usage records.
4. Deterministic covenant evaluation and transaction simulation.
5. Source-backed legal analysis of available contractual pathways.

Headroom is **not** a continuous financial monitoring, ERP synchronization, FP&A forecasting, or treasury-management platform.

### Product posture (AI-first, lawyer-reviewed)

Same shape as Harvey / Legora for **analysis**:

1. AI produces substantive contractual analysis immediately.
2. Counsel reviews, edits, accepts, or rejects.
3. Outside counsel is not a gate before useful analysis is shown.

Fail-closed for **numbers and authority**:

| May show immediately | Must not pretend to be final truth |
|---|---|
| Clause summaries, alternatives, assumptions, citations | Remaining capacity $ without approved financials + 4A–4E |
| Draft transaction parse | Unconfirmed amounts used as facts |
| Suggested pro-forma inputs | Suggestions without user confirmation |
| Certificate fact *proposals* | Auto-APPROVED snapshots from extraction |

Counsel accept may improve the working rulebook; **certified Phase-3 IR** and **APPROVED snapshots** remain the North-Star authorities for executable answers.

---

## Phase map ↔ gate sequence

| This doc | Gate steps in `06-revised-roadmap.md` | Status (2026-10-09) |
|---|---|---|
| Phase 1 — Foundation | (pre-roadmap infrastructure) | Largely built |
| Phase 2 — Structural document intelligence | Foundation table (2A–2G) | Core built; ongoing reliability |
| Phase 3 — Semantic legal intelligence | Steps **1–3** | Built; stratified certification gate **open** |
| Phase 4A — Deterministic evaluation | Foundation | Core built |
| Phase 4B — Financial input intelligence | Steps **4–7** (NS-4 → certificate → selector → connect) | In-memory built; durable store in flight (#190) |
| Phase 4C — Capacity / ledger | Steps **8–9** | Runtime built; durable/customer integration incomplete |
| Phase 4D — Transaction simulation | Steps **12–13** | Core built; product integration incomplete |
| Phase 4E — Neutral path enumeration | Step **10** | Certified implementation pending; #188 is heuristic only |
| Phase 5 — Ask Headroom | Steps **11–14** | Research UI exists; full orchestration incomplete |
| Phase 6 — Customer product workflow | Step **16** (after success test **15**) | Partial prototypes; must not leapfrog engines |
| Phase 7 — Validation / generalization | Step **15** + ongoing corpus work | Ongoing |
| Phase 8 — Production / commercial | After 15–16 | Pending |

---

## PHASE 1 — Foundation and infrastructure

**Status:** Largely built

**Objective:** Establish the technical infrastructure supporting the entire platform.

**Components:** Next.js application; PostgreSQL/Neon; Prisma models; company and user management; tenant isolation; document upload/storage; document processing; source provenance; migrations; automated testing; development and deployment infrastructure.

**Deliverable:** A reliable platform for storing, processing, and analyzing financing documents.

---

## PHASE 2 — Structural document intelligence

**Status:** Core built; ongoing reliability improvements  
**Subphases:** 2A–2G

**Objective:** Understand the structure and relationships of complex financing-document packages.

**Components:** Document classification; structural indexing; section/subsection identification; covenant and definition discovery; recursive contextual retrieval; cross-reference resolution; multi-document package graph; amendment precedence; operative document determination; independent coverage auditing; dangerous-omission detection; unseen-package validation; source-span provenance.

**Deliverable:** Headroom can identify relevant contractual language, retrieve its dependencies, and determine which provisions govern a transaction.

---

## PHASE 3 — Semantic legal intelligence

**Status:** Built; reliability certification gate remains open

**Objective:** Convert contractual language into a generalized, verified, executable legal rulebook.

**Components:** Restriction / permission / exception extraction; defined-term interpretation; contractual condition modeling; fixed / grower / ratio / builder baskets; shared-capacity relationships; reclassification rights; entity-scope restrictions; cross-document dependencies; amendment-aware semantics; independent verification; counsel review; certified rulebook generation; unsupported and ambiguous mechanics handling.

**Deliverable:** A certified, source-backed contractual rulebook that can be evaluated deterministically.

**Remaining work:** Complete stratified certification across authentic debt, lien, restricted payment, investment, asset-sale, and financial covenant provisions (with/without shared caps, builders, reclassification). Do not reopen sealed A/B (`semantic-accountability.v8`).

---

## PHASE 4A — Deterministic covenant evaluation

**Status:** Core built

**Objective:** Evaluate certified contractual formulas and conditions using deterministic logic.

**Components:** Exact arithmetic; ratio evaluation; threshold testing; conditional permissions; formula dependency resolution; currency/unit validation; missing-input handling; calculation provenance; deterministic replay; verification gates.

**Deliverable:** Headroom can calculate contractual tests without relying on AI-generated arithmetic.

---

## PHASE 4B — Financial input intelligence

**Status:** In-memory runtime built; customer integration incomplete

**Objective:** Provide trustworthy financial inputs for contractual calculations.

**Components:** Financial snapshot identity; approved financial facts; company/entity scope; reporting period; as-of date; currency/units; source provenance; dependency manifests; exact snapshot resolution; approval status; explicit supersession; missing/ambiguous handling.

**Deliverable:** A deterministic financial input system that uses the correct approved financial facts.

**Remaining work:**

- Persist immutable financial snapshots (NS-4 durable store — PR **#190**).
- Compliance certificate ingestion (proposal → attributable APPROVED).
- Restated certificates (successor → predecessor supersession).
- Contractual quarterly-cutoff / selector resolution (NS-6; after NS-4).
- Connect approved snapshots to customer-facing calculations (strict resolver only).

**Critical principle:** The applicable reporting period comes from the **contract and delivery evidence**, not automatically from the latest quarter.

---

## PHASE 4C — Capacity and historical ledger

**Status:** Core runtime built; customer persistence/integration incomplete

**Objective:** Calculate remaining contractual capacity after historical transactions.

**Components:** Gross basket capacity; historical debt/lien/RP/investment usage; shared capacity; consumption/restoration; reclassification; elections; transaction attribution; immutable ledger; explicit supersession; remaining-capacity calculation.

**Deliverable:** An accurate view of contractual capacity after historical usage.

**Remaining work:** Connect the customer ledger and durable persistence to the Phase 4C runtime (roadmap steps 8–9). Certificate basket schedules route as **ledger proposals**, never as snapshot facts.

---

## PHASE 4D — Transaction simulation

**Status:** Core built; product integration incomplete

**Objective:** Simulate contractual and financial effects of a contemplated transaction.

**Components:** Transaction identity; selected pathway; explicit assumptions; pro forma adjustments; capacity consumption/restoration; ledger effects; reclassification; financial state changes; before/after; conditions/limitations; deterministic replay; failure atomicity.

**Deliverable:** Headroom can simulate a transaction under a selected pathway and show its consequences.

---

## PHASE 4E — Neutral contractual path enumeration

**Status:** Certified implementation pending

**Objective:** Identify all supported legal pathways for a contemplated transaction without automatically selecting a preferred structure.

**Components:** Applicable restrictions; debt/lien/RP/investment permissions; alternative baskets; shared capacity; permitted combinations; financial conditions; historical usage; entity restrictions; missing-input requirements; neutral presentation.

**Deliverable:** Complete, source-backed enumeration of supported pathways.

**Current limitation:** PR **#188** provides heuristic multipath analysis over the **legacy** engine. That is **not** certified Phase 4E. Do not treat it as North-Star path authority.

---

## PHASE 5 — Ask Headroom

**Status:** Research interface built; transaction orchestration incomplete

**Objective:** Customer-facing legal reasoning and transaction intelligence (orchestrator, never legal/financial authority).

**Components:** Natural-language intake; structured transaction ID; user confirmation of assumptions; restriction discovery; certified rulebook retrieval; approved snapshot resolution; historical ledger retrieval; neutral path enumeration; required tests; missing-input questions; selected-path simulation; source-backed explanations; alternatives; capacity; before/after; exportable work product.

**Deliverable:** A lawyer- or CFO-ready answer: whether the transaction can be undertaken, under which provisions, on what conditions, and with what effects.

---

## PHASE 6 — Customer product and workflow

**Status:** Partially built; must integrate only after authoritative engines are wired

**Objective:** One functioning application on the North-Star engines (not the legacy capacity theater).

**Customer workflow**

1. Create or select a company.
2. Upload financing documents.
3. Identify operative agreements.
4. Review AI-generated contractual interpretations (**AI-first**).
5. Counsel accept/edit/reject; certify executable contractual rules when ready.
6. Upload periodic compliance certificates.
7. Review and approve financial snapshots (attributable APPROVED).
8. Record historical basket usage (ledger).
9. View available contractual capacity (4C over approved state).
10. Ask Headroom a transaction question.
11. Review available legal pathways (4E).
12. Select a pathway.
13. Provide required pro forma assumptions.
14. Simulate the transaction (4D).
15. Review conditions and financial effects.
16. Export a source-backed transaction analysis.

**Deliverable:** Complete customer-facing Headroom using authoritative contractual, financial, ledger, and simulation engines.

**PR hygiene (2026-10-09):**

| PR | Disposition |
|---|---|
| **#184** | Keep — AI-first lawyer-review product track |
| **#190** | Merge path for NS-4 durable store + loader parity |
| **#189** | Do not merge as-is — mixed Ask/UI/NS-6/4C with NS-4 |
| **#185–#188** | Close or park — dashboards / continuous loop / legacy multipath capacity theater |

---

## PHASE 7 — Validation and generalization

**Status:** Ongoing

**Objective:** Prove reliability across diverse authentic financing documents and transactions.

**Components:** Authentic corpus; SEC ingestion; provision indexing; knowledge graph; definition dependencies; amendment-aware retrieval; omission detection; adversarial legal review; stratified benchmarks; authentic transaction exercises; multi-document / multi-company generalization; counsel correction feedback; financial verification; ledger reconciliation; citation accuracy; regression testing.

**Deliverable:** Independent evidence Headroom works beyond a single demo package.

---

## PHASE 8 — Production and commercial readiness

**Status:** Pending

**Objective:** Prepare Headroom for real customers.

**Components:** Secure onboarding; tenant isolation; DB integrity; migrations; production deploy; authZ; audit trails; document access controls; performance; operational reliability; error handling; support workflows; professional exports; design-partner testing; real transaction validation.

**Deliverable:** Deployable, secure product for finance teams and advisers.

---

## Current implementation priorities (corrected)

These priorities **reconcile** the founder roadmap with North Star soft gates and the 2026-10-09 PR audit. They intentionally do **not** say “merge the entire product PR stack.”

| Priority | Work | Why |
|---|---|---|
| **P1** | **Legal reliability (Phase 3)** — stratified certification of authentic provision set; freeze except true defects | Unlocks certified 4E; N1 |
| **P2** | **Financial snapshots (Phase 4B / NS-4)** — durable persistence (#190), certificate propose→APPROVED, then selector/cutoff (NS-6) | Every downstream answer needs APPROVED facts; N2/N7 |
| **P3** | **AI-first counsel workflow (#184)** — show analysis immediately; counsel review loop; keep capacity fail-closed | Harvey/Legora posture without lying about $ headroom |
| **P4** | **Historical ledger (Phase 4C)** — durable attributed usage → capacity | N3/N4 |
| **P5** | **Certified path enumeration (Phase 4E)** — replace #188 heuristic multipath | N6; after Phase 3 freeze + capacity |
| **P6** | **Ask Headroom orchestration (Phase 5)** — intake → confirm → paths → tests → simulate → answer | N6; after 4E + snapshots |
| **P7** | **Customer product integration (Phase 6)** — wire pages to 4A–4E; retire legacy engine on product paths | Step 16; after success-test ingredients exist |
| **P8** | **End-to-end validation (Phase 7)** — real package + approved snapshot + ledger + transaction | Product success test |
| **P9** | **Scale and commercialize (Phase 8)** | After a defensible E2E answer |

Parallelism allowed: **P1 ∥ P2** (Phase 3 soft gates forbid mixing Phase-3 files into NS-4 PRs). **P3** may proceed as UX without claiming certified capacity.

---

## Final product success test

Headroom receives:

1. A real financing-document package.
2. An approved periodic financial snapshot.
3. An attributed historical transaction ledger.
4. A contemplated transaction.
5. Explicit required pro forma assumptions.

Headroom produces:

- Applicable operative contractual provisions.
- Supported legal pathways.
- Required conditions.
- Gross capacity, historical usage, remaining capacity.
- Financial ratio calculations and pro forma effects.
- Before/after state and proposed ledger effects.
- Exact source citations.
- Missing inputs and limitations.
- A defensible transaction analysis.

**Ultimate objective:** Build the operating platform for understanding and applying complex debt-document restrictions to real financing decisions — not merely a covenant search engine or a financial dashboard.
