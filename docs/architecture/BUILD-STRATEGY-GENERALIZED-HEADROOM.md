# BUILD STRATEGY — Generalized Headroom (not CONMED scripts)

**Status:** Architect opinion (Systems Architect) · 2026-10-06  
**Audience:** User · COO · Grok Bot · Product · Cert  
**Binding scrutiny:** related-series interim B (not solved); evidence packets versioned/append-only; OOV → model-contract diagnostic (not quiet UNSUPPORTED); no company hardcoding; no NS-4 / paid §7.5(j) / A/C without override.

**One-line thesis:** Build a **package-agnostic certified rulebook → approved snapshot → ledger → path enumeration → Headroom Answer** machine. CONMED/Chewy are **fixtures that prove the machine**, never the machine's shape.

---

## 1. What "done" looks like

### Headroom Answer (product done — roadmap steps 10–14)
A **generalized** answer for *any* sealed package + approved snapshot + ledger state + user transaction:
- **Paths** — neutral enumeration from certified IR (user picks; Ask Headroom never ranks unless asked)
- **Capacity** — gross / prior usage / remaining from the same engines product uses (invariant 27)
- **Conditions** — each condition satisfied / unsatisfied / NEEDS_INPUT / REVIEW / UNSUPPORTED
- **Provenance** — document + snapshot + ledger + user assumptions, claim-specific (invariants 1–4, 37)

**FAIL if:** answer only works for CONMED sectionRefs, invents metrics, coerces series/aggregation, or hides OOV as soft UNSUPPORTED without model-contract diagnostic.

### Phase 3 "done" (reliability gate — roadmap 1→3)
- Sealed A/B (`semantic-accountability.v8`) **stays sealed**
- Composition / localRef / interim-B **CLOSED_OFFLINE** (current)
- **Stratified cert DESIGN** (#64) → then live cert only under separate auth
- Stratified **set** certified across families + cross-cuts (debt/liens/RP/investments/asset sales/financial covenants × shared caps/builders/reclass) from **≥2 packages** (CONMED + Chewy minimum)
- Semantic foundation **frozen** except true defects

**Phase 3 is NOT:** inventing related-series IR, rewriting historical 7.2c/7.5j packets, or "CONMED is certified so we're done."

### NS-4 "done" (parallel track — roadmap step 4)
Append-only **approved financial snapshot store** on frozen 4B contract + heterogeneous certificate→proposal→APPROVED path. Proves ingestion without touching Phase 3 IR.

**NS-4 is NOT:** a substitute for stratified cert, related-series A/C, or Ask Headroom.

---

## 2. Build order after #64 (DESIGN)

| Priority | Do next | Why | Stays fail-closed UNSUPPORTED |
|---|---|---|---|
| **P0** | Land #64 notes → COO/Product/Architect checklist complete → merge docs | Freezes selection contract + first pin without live spend | — |
| **P1** | Offline-pin **remaining strata/cross-cuts** (same artifact shape as `first-target/`) including **Chewy** | Generalization proof = second package, not more CONMED subsections | Builders/reclass TBD-with-blocker until bound |
| **P2** | **Separate auth** for first live cert against pinned §7.6(c) only | Cost ceiling $0.25 / $5; no silent target swap | Series-aggregation claims; financial covenants if Phase-2 REVIEW_REQUIRED governs |
| **P3** | Wire/prompt **OOV disposition contract** (Pass B must not emit free-text dispositions without MODEL_CONTRACT_VIOLATION diagnostic) | Standing scrutiny; invariant 9/36/37 at emit-time, not only Pass C cleanup | Quiet map-to-UNSUPPORTED without diagnostic |
| **P4** | Start **NS-4** in parallel once Phase 3 capacity allows | Unblocks snapshots without waiting on full stratified set | — |
| **P5** | Only after stratified set + freeze: selector resolution / rulebook↔snapshot / ledger / 4E / Ask intake | North Star shortest path — do not skip to chat UI | ERP/TMS/FP&A (N9 stop) |

**Do NOT generalize next:** related-series A or C, ERP connectors, dashboards, "live EBITDA," mutate-in-place remediations, company-specific matchers.

---

## 3. Architecture bets — invest vs seal

| Layer | Invest | Seal / do not reopen |
|---|---|---|
| **IR (`headroom-covenant-ir.v1`)** | Compositional primitives that recur across packages; honest UNSUPPORTED escape; identity discipline | No speculative RELATED_SERIES node; no enum explosion per drafting variant (inv 7–8) |
| **Composition / Pass C contract** | Lineage ≠ representation; quantitative authority; non-vocab → UNSUPPORTED **plus** model-contract diagnostic | A/B seal `semantic-accountability.v8` |
| **Certification strata** | Package-agnostic pin artifacts (identity / operative-state / eligibility / preflight); versioned evidence packets; multi-package matrix | Historical 7.2c / 7.5j packets immutable; interim-B not a CERTIFIED credit path |
| **Ask Headroom** | Orchestrator over certified rulebook + approved snapshots + ledger; NEEDS_INPUT loops | Never a legal/financial authority; never a hidden accounting engine |

**Bet I'm willing to lose money on:** if we cannot certify the **same** stratified contract on Chewy without new company branches, we do not have a product — we have a CONMED compiler.

---

## 4. Anti-patterns to kill (FAIL immediately)

1. **Company hardcoding** — `if (conmed)`, package IDs in matchers, sectionRef allowlists as production logic (inv 29).
2. **Mutate-in-place evidence** — editing sealed live packets to "green" a gate; required pattern is **append new versioned packet**.
3. **Claiming related-series solved** — interim B is EXPLICIT_UNSUPPORTED; A/C deferred. CERTIFIED/REPRESENTED for series = FAIL.
4. **Quiet OOV → UNSUPPORTED** — Pass C cleanup without recording **model-contract violation** at the emit boundary = FAIL under standing scrutiny.
5. **Script-shaped generalization** — copying CONMED pin JSON by hand as the "architecture"; pins must be produced by **deterministic pick algorithm + sealed populations**.
6. **UI/Ask before rulebook+snapshot+ledger** — violates roadmap 10→14 and turns Ask into an improviser (inv 26).
7. **NS-4 as Phase 3 escape hatch** — forbidden conflation.

---

## 5. Next 1–2 ADR-sized decisions (before more code)

### ADR-1 (needed now): **Certification evidence versioning & immutability**
Normative: every live/offline cert packet is content-addressed / append-only; historical `7.2c-*` / `7.5j-*` never rewritten; stratified-cert packets get `schemaVersion` + `baseSha` + successor pointer. Blocks "fix the old packet" culture.

### ADR-2 (needed before Pass B vocabulary work or next live cert wave): **Model-contract violation vs semantic UNSUPPORTED**
Split diagnostics:
- **MODEL_CONTRACT_VIOLATION** — wire/prompt emitted illegal disposition / invented kind / non-vocab string (emitter bug)
- **UNSUPPORTED** — legal emission that source semantics exceed IR (honest product residual)

Today Pass C collapses both toward UNSUPPORTED. Without this ADR we will keep laundering model failures as covenant residuals.

**Not ADR-now:** related-series A vs C (deferred until stratified cert needs an *executable* series test — already locked by RELATED-SERIES-INTERIM-B-ADR).  
**Not ADR-now:** Ask Headroom ranking UX.

---

## Architect directive (FAIL-shaped)

1. Merge #64 only as **design freeze** — never as live authorization.  
2. Next code that matters: **general pin pipeline + Chewy offline pins + OOV model-contract surface** — not more CONMED one-offs.  
3. Parallel: **NS-4 store** when capacity exists.  
4. Any PR that hardcodes a company, mutates evidence, credits interim series, or quiet-maps OOV → **Architect FAIL**.

