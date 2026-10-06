# ARCHITECTURE_CHANGE_PROPOSAL — periodic-reporting North Star (accepted)

Format: `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md` § "ARCHITECTURE_CHANGE_PROPOSAL format". Recorded at
`NORTH_STAR_STARTING_SHA` = `bbcfb54eb9a307b155e5d5d365fd97f09c3e278e`.

**Acceptance.** The maintainer issued this change as an explicit written product decision ("HEADROOM — NORTH STAR
ARCHITECTURE RECONCILIATION", 2026-10-06): *"This architecture controls all future roadmap decisions unless explicitly
superseded by a later written product decision."* That instruction is the acceptance the invariants document requires
before the North Star or Roadmap is changed. This record exists so the change is traceable, not silent drift.

## 1. Current assumption

`docs/HEADROOM-NORTH-STAR.md` §1–§3, §13, §18 and `docs/HEADROOM-ROADMAP.md` §2: Headroom is a *continuously maintained*
system whose financial truth comes from *persistent connections* to ERP / treasury / bank systems that *continuously
synchronize*; "uploads remain useful at the edges … never as the primary ongoing mechanism"; Phase 5 is a "Financial Data
& Monitoring Platform" including "5C — ERP / Accounting Connections"; Phase 6 is a "Living Headroom State". The invariants'
anti-drift section locks that phase sequence (Phase 5 = "Financial Data / Continuous Monitoring").

## 2. Repository evidence

- The contractual figures Headroom must test are defined by the debt documents and measured at contractual dates and
  periods; the Phase 4B contract (`docs/phase-4b/03-temporal-resolution-contract.json`, `12-phase5-handoff.json`) already
  makes the evaluation as-of part of fact identity and forbids the runtime from reinterpreting period wording. Continuous
  sync adds no value to a test measured "as of the last day of the most recently ended fiscal quarter".
- Every financial number in the repository today was hand-entered or derived from public filings; no ERP or bank connector
  exists (`ConnectorType` = EDGAR, CSV_FINANCIAL, DOCUMENT_UPLOAD). The only "live feed" artefact is the Feeds page's
  hardcoded "Connected sources" card, which the Roadmap itself classified `CONFLICTS_WITH_NORTH_STAR` for misrepresenting state.
- The deterministic layers that can answer "can we do this transaction?" already exist and fail closed: 4A evaluation,
  4B approved-snapshot resolution, 4C capacity/ledger, 4D explicit pro-forma simulation (gates in `docs/phase-4a…4d`).
  None of them needs live accounting; all of them need approved periodic snapshots, an immutable ledger and an explicit
  transaction.
- Compliance certificates are the instrument lenders already rely on for exactly these figures; the document classifier and
  `DocumentType` already recognise them; the codebase already keeps human confirmation distinct from extraction
  (`certifyExternalInputRecord`).

## 3. Proposed change (minimal)

1. `docs/headroom-north-star-v2.md` becomes the controlling product architecture: debt documents → certified rulebook;
   compliance certificates / delivered reporting → approved dated snapshots; transactions / elections → ledger + legal
   state; Ask Headroom → explicit transaction + explicit pro-forma adjustments → deterministic answer with provenance.
2. The phase *names* "Financial Data & Continuous Monitoring" (Phase 5) and "Living Headroom State" (Phase 6) are replaced
   by the North-Star sequence in `06-revised-roadmap.md`. Continuous ERP / bank synchronization, real-time accounting and
   forecasting move from core roadmap to optional-later.
3. All 37 invariants remain in force unchanged. Invariants 2 and 4 already list "a connector sync, an ERP export" only as
   examples of sources; they need no edit.

## 4. Downstream consequences

- Documents: banners on `HEADROOM-NORTH-STAR.md`, `HEADROOM-ROADMAP.md`, `HEADROOM-ARCHITECTURE-INVARIANTS.md` (anti-drift
  phase naming only), `headroom-master-product-architecture.md` §A, `generalized-financial-analytics-architecture.md`.
  No evidence artefact is edited.
- Code (later, separately gated): Feeds UI reframed as Sources / Reporting / Certificates; legacy carry-forward writes and
  ledger hard-delete removed; legacy `FinancialSnapshot` and the dual-write retired in favour of a persisted Phase-4B store;
  `lib/financial-core/**` demoted to optional analytics; forecasting stays unbuilt. Phase 2, Phase 3 and the Phase 4A–4D
  runtime contracts are unaffected.

## 5. Alternatives considered

- *Keep the continuous-sync North Star and add certificates as one more connector.* Rejected: it keeps ERP/bank integration
  on the critical path for a product that needs approved periodic facts, and it keeps "live" semantics (latest value wins)
  that conflict with the contract-owned period/as-of model.
- *Edit the existing North Star in place.* Rejected: it is a historical record cited by later governing-document reads;
  a new controlling document plus a banner preserves history.

## 6. Why a bounded remediation is insufficient

The disagreement is about what the product is, not a defect in a component: the old document makes continuous
synchronization a core requirement and an entire roadmap phase. No local fix changes that; only an explicit change of the
controlling architecture does.
