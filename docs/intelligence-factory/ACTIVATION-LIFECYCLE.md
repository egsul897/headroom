# Neon Activation Lifecycle — Exists vs Missing

**As of:** 2026-10-09  
**Authority:** Discovery ≠ legal certification. No silent promotion.

Maturity ladder preserved at every step:

| Label | Meaning |
|---|---|
| DISCOVERED | Observed in corpus / summary |
| MODELED | Formula compiled into executable shape |
| UNVERIFIED | Human review not completed |
| REVIEW_REQUIRED | Conditional / unsafe to treat as headroom |
| VERIFIED | Human review passed (≠ CERTIFIED) |
| CERTIFIED | Phase-3 sealed legal truth (separate pipeline) |

---

## Step-by-step

| # | Step | Status | Where |
|---:|---|---|---|
| 1 | Authentic source & operative document identity | **EXISTS** | `KnowledgeSource` (hash, accession, exhibit, provenance). Binding `companyId`/`documentId` often null on public rows. |
| 2 | Covenant extraction | **EXISTS (partial)** | `metadata.covenantSummary` / `summarizeFromStoredMetadata`. Cap ~120 items/doc. Quality uneven; many items lack parseable baskets. |
| 3 | Definition & exception resolution | **PARTIAL** | Summary may cite defined terms; no systematic definition-graph resolution into counsel compile. Phase-3 IR has definitions; activation path does not auto-bind them. |
| 4 | Formula & threshold representation | **EXISTS (fail-closed)** | `parseCounselFormulaForTest` / counsel compile → `FLAT_AMOUNT`, greater-of growers, builder, ratio room/gate, or `KNOWN_NOT_MODELED`. PR #225 fixed SEC `$X,000,000` / grower prose. |
| 5 | Independent legal review | **MISSING at scale** | Product counsel ACCEPT/EDIT UI path exists; not run over bulk Neon. Matrix run establishes *independent expected formulas* (pre-engine) — **not** counsel certification. |
| 6 | Accepted interpretation | **EXISTS (path)** | `compileAcceptedInterpretation({ decision: "ACCEPTED" })`. Exercised ephemerally in E2E/matrix proofs; cleaned up. |
| 7 | Existing compilation interface | **EXISTS** | Same counsel compile → Permission + CovenantProvision. **No second rule engine.** |
| 8 | Durable Permission & provenance | **EXISTS (gated)** | Permission rows: `MODELED` + `UNVERIFIED`, capacity authority `LEGACY_ENGINE`. Production durable mint requires bound company/document + counsel. Matrix/E2E use ephemeral companies only. |
| 9 | Approved financial inputs | **MISSING for corpus activation** | No approved customer financial snapshots attached to Neon public sources. Matrix uses unmistakably labeled `SYNTHETIC_NUMERIC_INPUTS`. |
| 10 | Attributed historical utilization | **PARTIAL** | `lib/solver/shared-usage.ts`: attributed → `COMPUTED`; empty → `ZERO_NO_ATTRIBUTED_USAGE` (not proven empty). Loader accepts optional `basketUsage`. Product callers must pass attribution. |
| 11 | Verified capacity evaluation | **EXISTS (dual path)** | Legacy `evaluateProvision` (activation proofs). Phase-4C `evaluateCapacityState` (certified IR path). A8-01 fixed: `GATE_NOT_SATISFIED` → `REVIEW_REQUIRED`, never `AVAILABLE`. |
| 12 | Transaction simulation | **EXISTS** | Legacy `simulateDebtIncurrence` (activation). Phase-4D `simulate` (IR + overlay; chaining caller-stated; restoration needs encoded edge). |

---

## Promotion rules (non-negotiable)

1. DISCOVERED summary ↛ CERTIFIED.
2. MODELED UNVERIFIED Permission ↛ authoritative customer permission.
3. Legacy engine favorable output ↛ certified permission.
4. Numerical basket limit ↛ overall legal permission.
5. Silent zero utilization ↛ proven empty basket.
6. Production Neon writes remain authorization-gated.
7. No automatic merge / uncontrolled promotion.

---

## P0 blockers reconciled this cycle

| Blocker | Disposition |
|---|---|
| A8-01 failed-gate AVAILABLE | **Fixed** in `lib/contract-model/runtime/capacity/state.ts` + regression test |
| Unknown utilization | **Status-aware** via `ZERO_NO_ATTRIBUTED_USAGE` / `EXTERNAL_INPUT_REQUIRED` |
| Phase 4D financial chaining | **Documented coordination** — chaining is multi-transaction caller-stated; activation must not invent overlays |
| Restoration authority | **Documented coordination** — requires encoded Phase-3 reclassification edge; summaries never invent authority |
