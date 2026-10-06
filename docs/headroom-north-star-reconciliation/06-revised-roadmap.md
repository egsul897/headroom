# 06 — Revised roadmap (from actual state, at `bbcfb54`)

Controlling architecture: `docs/headroom-north-star-v2.md`. This replaces the phase sequence of `docs/HEADROOM-ROADMAP.md` §2
for product direction; that document's audit sections stay as history.

## Foundation already built

| layer | state | evidence |
|---|---|---|
| document / package intelligence (Phase 2A–2G) | built | structural index, discovery, package graph, context retrieval, independent coverage audit, amendment precedence and operative state |
| semantic rulebook (Phase 3) | built; **reliability gate open** (related-series decision / stratified certification; composition-contract + localRef CLOSED_OFFLINE); §7.5(j) trust-boundary defects A/B **SEALED** at `semantic-accountability.v8` | certified compile → verify → certify path; source authority; provenance binding v2 (strict); live §7.2(c) and §7.5(j) both historically `SEMANTIC_FAILURE`; §7.5(j) deterministic false failures closed offline (genuine residuals remain, candidate `REVIEW_REQUIRED`); pre-4E readiness condition 7 unmet |
| provenance / source authority / certification | built | `docs/canonical-covenant-map/12–14`, candidate + package certification |
| Phase 4A evaluation | built | exact arithmetic, verification gate |
| Phase 4B snapshot / input identity | built (in-memory) | approved / superseded snapshots, exact identity, manifest |
| Phase 4C capacity / ledger | built (in-memory), recertified | capacity graph, immutable usage, shared capacity, reclassification |
| Phase 4D transaction / state | built (in-memory), recertified | explicit overlay, selected path, pre/post state, commit plan; one real end-to-end trace |
| product UI | prototype on the **legacy** engine | Capacity / Dashboard / Simulate / Ledger / Feeds read legacy tables; no page reaches 4A–4D |

## Shortest path to the North-Star product

| step | work | depends on | N-gate |
|---|---|---|---|
| **R0** | bounded legacy-safety fix: remove carry-forward in Feeds approval and onboarding promotion; replace Ledger hard delete with supersession (C5, C6, C10 partial) | — (any time; before real customer data enters legacy paths) | N7 |
| **1** | **Phase 3 reliability gate** (current after A/B seal + non-vocab disposition contract): IR decision on related-series aggregation; then stratified certification. (gap-call localRef CLOSED_OFFLINE at wire.v3 / prompt.v7.) (Enumerator blank-line handoff + item-span quantitative authority SEALED at v8; non-vocabulary inventoryDisposition → UNSUPPORTED closed offline; do not reopen sealed A/B.) | — | N1 |
| **2** | certify a **stratified real provision set** (debt, liens, RP, investments, asset sales, financial covenants; with and without shared caps / builders / reclassification) | 1 | N1 |
| **3** | freeze the semantic foundation except true defects; unblocks Phase 4E readiness condition 7 | 2 | N1 |
| **4** | **NS-4 certificate → 4B snapshot adapter + persisted approved-snapshot store** (next gate, `07`; **not implemented in this seal** — docs-only precision here) | 4B contract only — parallel-safe with 1–3 | N2, N7 |
| **5** | ingest **one real compliance certificate** into an APPROVED snapshot | 4; a customer-supplied certificate | N2, N8 |
| **6** | **contractual selector → snapshot identity resolution** (fiscal calendar, delivery evidence, explicit policy) | 4 | N2 |
| **7** | connect the certified rulebook to approved snapshots through 4A / 4B (real covenant test values, strict resolver only) | 3, 5, 6 | N1, N2, N4 |
| **8** | **persisted immutable ledger** implementing 4C; import historical usage (certificate basket schedules, user entries); migrate `LedgerEntry` / `DebtEvent` | 4 (proposal routing) | N3 |
| **9** | real **capacity position** (4C) for the certified set | 7, 8 | N4 |
| **10** | **Phase 4E neutral path enumeration** | 3, 9 | N6 |
| **11** | Ask Headroom **transaction intake** → explicit, user-confirmed transaction | 10 | N6 |
| **12** | **required pro-forma input derivation** from the dependency manifests and the rulebook's pro-forma clauses | 7, 11 | N5, N6 |
| **13** | Phase 4D simulation over persisted state (tighten null-selector matching) | 9, 12 | N5 |
| **14** | source-backed **Headroom Answer** (before / after, ledger effects, evidence, limitations) | 13 | N6, N7 |
| **15** | **package-wide real-company end-to-end validation** = the product success test | 14 | all |
| **16** | customer workflow: Sources / Reporting / Certificates (replaces Feeds), Ledger, Ask Headroom; move product reads to 4A–4E; retire legacy `FinancialSnapshot`, dual write and legacy engine on product paths | 15 | N8 |

## Deviations from the suggested sequence, and why

1. **Persistence is folded into step 4.** The 4B / 4C contracts are in-memory; ingesting a certificate "into approved
   snapshot form" is meaningless without an immutable store that enforces the contract at write time.
2. **Step 6 (selector resolution) is new.** The 4B handoff forbids the runtime from turning contract wording into a date and
   forbids the supplier from guessing; something must map "most recently ended fiscal quarter" to one snapshot with evidence.
   Without it step 7 would quietly reintroduce "latest quarter".
3. **Step 8 (persisted ledger) is explicit and precedes capacity.** Today's `LedgerEntry` cannot express path-attributed,
   superseding usage; capacity on it would be wrong.
4. **Step 10 (Phase 4E) is inserted before Ask Headroom.** "Available paths" requires neutral path enumeration, which is
   blocked until the Phase 3 foundation is proven (readiness condition 7).
5. **Step 4 may run in parallel with steps 1–3.** It touches only the frozen 4B contract. The gate still names it as the
   next task *after* the Phase 3 reliability work so that capacity is not split by default.
6. **Step 5 depends on customer data.** The repository holds certificate *forms* (inside the CONMED and Chewy credit
   agreements) but no completed certificate; a `PUBLIC_FILING_RECONSTRUCTION` may never be approved for a customer. Until a
   design partner supplies one, step 4 is proven on synthetic heterogeneous certificates.
7. **R0 is pulled forward.** Carry-forward writes manufacture facts in a live path today; they are cheap to remove and
   should not wait for the UI rework.

## Explicitly not on this roadmap

Continuous ERP sync, bank feeds, real-time accounting, forecasting (incl. liquidity / cash-flow), treasury functionality,
automatic accounting-treatment inference, "live EBITDA", dashboards beyond the Headroom Answer. Optional later, each subject
to the N1–N10 gate.
