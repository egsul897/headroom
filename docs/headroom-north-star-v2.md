# Headroom — North Star (controlling product architecture, v2)

**Status: CONTROLLING.** Accepted as the product decision of the maintainer on 2026-10-06 (recorded as an
`ARCHITECTURE_CHANGE_PROPOSAL` in `docs/headroom-north-star-reconciliation/00-architecture-change-proposal.md`).
This document controls every roadmap and implementation decision until a later written product decision supersedes it.

It supersedes, **for product direction only**, `docs/HEADROOM-NORTH-STAR.md` (the 2026-08 "continuously maintained,
ERP-synchronized" North Star), the phase-sequence naming in `docs/HEADROOM-ROADMAP.md` and in the anti-drift section of
`docs/HEADROOM-ARCHITECTURE-INVARIANTS.md`, §A of `docs/headroom-master-product-architecture.md`, and the pipeline framing
of `docs/generalized-financial-analytics-architecture.md`. Those documents stay as historical records. The 37 architecture
invariants stay in force unchanged. No certification or live-validation evidence is superseded.

*Why `-v2` and not `headroom-north-star.md`:* the repository already holds `docs/HEADROOM-NORTH-STAR.md`, and a second file
differing only by case breaks checkouts on case-insensitive filesystems (macOS, Windows). Renaming the old file would break
links recorded in immutable freeze manifests.

---

## 1. Mission

Headroom answers one question with source-backed precision: **"Can we do this transaction — under which provisions, with
how much capacity, on what conditions, and with what effect?"**

Headroom is **not** a continuous real-time ERP / bank-feed financial platform, an FP&A tool, or a treasury system. It is a
contract-aware decision engine over three bodies of truth that change at their natural cadence: the debt documents, the
company's periodic delivered financial reporting, and the company's history of transactions and elections.

## 2. Canonical architecture

```
DEBT DOCUMENTS ─────────────────────────────► CERTIFIED CONTRACTUAL RULEBOOK              (Phase 2 + Phase 3)
COMPLIANCE CERTIFICATES / DELIVERED REPORTING ─► APPROVED, DATED FINANCIAL SNAPSHOTS        (Phase 4B contract)
HISTORICAL TRANSACTIONS / BASKET USE /
  ELECTIONS / RECLASSIFICATIONS ─────────────► LEDGER + LEGAL STATE                        (Phase 4C contract)

ASK HEADROOM ─► contemplated transaction ─► explicit required pro-forma adjustments         (orchestration only)
                                   │
                                   ▼
DETERMINISTIC LAYERS: rulebook evaluation (4A) · snapshot resolution (4B) · capacity/ledger (4C) · simulation (4D)
                      · neutral path enumeration (4E)
                                   │
                                   ▼
HEADROOM ANSWER: available legal paths · capacity · conditions · before/after state · ledger effects
                 · limitations · exact document + financial-snapshot + ledger provenance
```

## 3. Sources of truth

| truth | authoritative source | owned by | never |
|---|---|---|---|
| what the contract requires | the debt documents, through the certified rulebook | Phase 2 (operative state) + Phase 3 (semantic IR, verification, certification) | inferred from financial data, guessed from a model's prose |
| the periodic financial facts | APPROVED financial snapshots built from compliance certificates / delivered reporting | Phase 4B contract (resolution); a future certificate adapter (ingestion) | auto-approved because an LLM extracted it; "the latest quarter" by default |
| what the company has done | the ledger / legal state: immutable, attributed usage, elections, reclassifications, supersessions | Phase 4C contract | buried inside a periodic financial snapshot; deleted |
| what the user proposes | the contemplated transaction plus its explicit pro-forma adjustments, stated by the user | Ask Headroom intake → Phase 4D | invented accounting treatment |

## 4. Financial snapshot model (preserve Phase 4B)

- A financial fact is identified by company, scope, kind, key, period, as-of, value type and currency. Two facts that differ
  in any field are different facts. One never stands in for another.
- A snapshot is immutable once written. Status is one of DRAFT / REVIEW_REQUIRED / APPROVED / SUPERSEDED. Default runtime
  policy accepts APPROVED only with EXACT as-of. `LATEST_ON_OR_BEFORE` exists only as an explicit, recorded caller policy.
- Supersession is explicit and **successor → predecessor**: the successor snapshot names the predecessor via
  `supersedesSnapshotId`. A superseded snapshot does **not** name its successor. Nothing is superseded because it looks
  older, has a higher version, or a newer timestamp.
- **4B runtime vs North Star persistence write policy.** The Phase 4B runtime (`lib/contract-model/runtime/input/**`,
  `financial-input-contract.v1`) is a **resolve-only** contract over already-supplied immutable snapshots: it never writes,
  never approves, never mutates status. North Star **persistence** (the future append-only approved-snapshot store, NS-4)
  is the write surface: drafts and proposals may be appended; APPROVED is reached only by an attributable approval
  transition; a restatement appends a new snapshot that supersedes the old one via `supersedesSnapshotId`; published rows
  are never edited in place.
- **Append-only approval mechanics.** Extraction / ingestion may append DRAFT or REVIEW_REQUIRED proposals. A separate,
  attributable approval record (who / when / `approvalRef`) is what makes a snapshot APPROVED. Corrections are a new
  snapshot that supersedes the prior one; there is no in-place edit of an APPROVED or SUPERSEDED row, and no silent
  status flip without an approval or supersession record.
- Every fact carries source document identity, source version/hash, page/section/table where available, reporting period,
  as-of, scope, value type, currency/unit, and review/approval state.
- **Fact-level source-locator join.** Persistence stores facts and source-location rows as joinable records (snapshot →
  fact → source locator: document id, version/hash, page / section / table / row). Resolution and provenance walk that
  join; a fact without a locator is incomplete for an APPROVED customer answer.
- **The contract owns time.** The semantic IR carries the period selector, as-of selector, measurement date, trailing period
  and fiscal period ("most recently ended fiscal quarter", "four consecutive fiscal quarters most recently ended", "date of
  such transaction", "most recently delivered financial statements"). These never collapse into LATEST_QUARTER.
- A **selector-resolution layer** (not yet built) maps a contractual selector to one snapshot identity using explicit evidence
  (the company's fiscal calendar, delivery records) and an explicit policy. The runtime never reinterprets contract wording
  into a date; the supplier never guesses which period a reference wants (the Phase 4B dependency manifest states it).
- **Compliance certificates** are the primary MVP source. Ingestion must handle heterogeneous certificate formats. Extraction
  may **propose** facts; only a separate review/approval step makes a snapshot APPROVED. Basket-usage schedules a certificate
  reports are **ledger** proposals, not snapshot facts.

## 5. Ledger model (preserve Phase 4C)

Historical contractual usage is separate from periodic financial state: basket consumption and restoration, debt incurrence
and repayment, asset-sale, restricted-payment and investment usage, shared-cap usage, reclassifications, redesignations,
elections and supersessions. Each record is immutable, attributed to a capacity path (rule or shared capacity), effective-dated,
and superseded only when an explicit successor names it (same successor→predecessor direction as 4B
`supersedesSnapshotId` / 4C `supersededByUsageId`). An unattributed usage fails the capacities it could touch closed.
Records are never deleted; a correction is a superseding record.

## 6. Transaction / pro-forma model (preserve Phase 4D)

```
APPLICABLE APPROVED SNAPSHOT + CURRENT LEDGER / LEGAL STATE + CONTEMPLATED TRANSACTION
  + EXPLICIT TRANSACTION-SPECIFIC PRO-FORMA ADJUSTMENTS  →  PRO-FORMA EVALUATION STATE
```

Only facts the transaction explicitly adjusts differ; every other fact reads through from the approved base snapshot with
its own provenance. An adjustment applies only to a fact the base snapshot actually resolves. No accounting treatment is
inferred because a transaction exists. A missing required input or adjustment is NEEDS_INPUT / REVIEW_REQUIRED, never a
calculation. Pro-forma treatment needs no live accounting.

## 7. Ask Headroom

Ask Headroom is the product's front door and an **orchestrator**, never an authority. It turns a natural-language proposal
into an explicit transaction, identifies the inputs and pro-forma adjustments the applicable tests need, asks the user for
what is missing, and runs the deterministic layers. It determines, in order: what is proposed; which legal paths could
authorize it; which financial tests each path requires; which approved snapshot supplies the base metrics; which pro-forma
adjustments are required; what ledger usage affects capacity; whether every input is present and reliable; before-state;
transaction effects; after-state; remaining capacity; relevant alternatives; limitations; exact provenance.

It must never become a legal authority (the certified rulebook is), a financial-source authority (approved snapshots are),
or a hidden accounting engine (pro-forma adjustments are stated, not invented). It makes no discretionary business or legal
recommendation unless explicitly asked; it reports paths and their consequences.

## 8. Fail-closed principles

Headroom never manufactures a financial metric, a period or as-of selector, a pro-forma adjustment, basket usage,
transaction history, a legal permission, a shared capacity, a reclassification, or an accounting treatment. Missing or
unreliable information surfaces as NEEDS_INPUT, REVIEW_REQUIRED, AMBIGUOUS or UNSUPPORTED (or the relevant existing
truthful status), together with what would resolve it. Carrying a prior period's value forward into a new period is
manufacturing a fact.

## 9. Not required for the MVP

Unless later validated by customer demand: continuous ERP sync; bank-account transaction feeds; real-time company
accounting; generic FP&A forecasting; full cash-flow forecasting; treasury-management functionality; automatic accounting
treatment inference; automatic "live EBITDA"; every conceivable financial dashboard. These may return later as optional
capabilities. They never drive the core roadmap. Uploads (PDF, CSV) are a first-class, sufficient ingestion path.

## 10. The target answer

```
HEADROOM ANSWER
Transaction:                    what the user proposes (as stated, with user-supplied assumptions labelled)
Applicable base financial state: the approved snapshot(s) used — certificate / reporting period, as-of, approval
Available paths:                path A, path B, …   (neutral enumeration; no ranking unless explicitly requested)
  For each path:
    governing provision         document · section · operative version
    conditions                  each condition and whether it is satisfied, unsatisfied or needs input
    gross capacity              and how it was computed
    prior usage                 ledger records counted, with sources
    remaining capacity
    required financial tests    each test, base value, pro-forma value, threshold
    pro-forma adjustments       each adjustment and who stated it
    status                      AVAILABLE · NOT_AVAILABLE · NEEDS_INPUT · REVIEW_REQUIRED · AMBIGUOUS · UNSUPPORTED
Selected path:                  only the path the user selects — Headroom does not choose
Post-transaction state:         capacity consumed · capacity remaining · ledger effects · financial-state effects
                                · reclassification / election effects
Evidence:                       document citations · certificate / reporting citations · ledger sources
                                · user-supplied transaction assumptions
Limitations:                    everything Headroom could not establish, and what would resolve it
```

## 11. Product success test (the ultimate integration test)

Given (A) a real debt package, (B) a real approved financial reporting snapshot, (C) real historical capacity / ledger
state and (D) a real contemplated transaction, Headroom returns the legally available paths, the correct applicable
financial tests, correct capacity and prior usage, correct pro-forma treatment, a correct before/after state, a
source-backed explanation, and truthful limitations — each checked against independently adjudicated expectations.

## 12. North-Star gate for future work (N1–N10)

Before a substantial feature is prioritised, answer each:

| | question |
|---|---|
| N1 | Does it make the certified rulebook more reliable? |
| N2 | Does it improve approved periodic financial snapshot ingestion or resolution? |
| N3 | Does it improve ledger / legal state? |
| N4 | Does it improve capacity calculation? |
| N5 | Does it improve transaction / pro-forma simulation? |
| N6 | Does it improve Ask Headroom's ability to answer a real transaction question? |
| N7 | Does it improve provenance / trust? |
| N8 | Is it actually required for a customer workflow? |
| N9 | Is it accidentally rebuilding ERP / FP&A / TMS functionality Headroom does not need? (a "yes" is a reason to stop) |
| N10 | Can it be deferred without weakening the core product? (a "yes" is a reason to defer) |

A feature needs at least one "yes" among N1–N8, a "no" on N9, and a written reason when N10 is "yes" but it proceeds anyway.
Technical interest is never a priority reason on its own.

## 13. Where the work stands

See `docs/headroom-north-star-reconciliation/` — the audit (01), conflicts (02), the preserve / demote / defer matrix (03),
the financial source-of-truth decision (04), the Ask Headroom boundary (05), the revised roadmap (06) and the next
implementation gate (07).

**Phase 3 current state (after the §7.5(j) trust-boundary seal).** The live-exposed deterministic defects A/B (blank-line
enumerator handoff; item-span-bound quantitative source authority) are SEALED at `semantic-accountability.v8` (offline
frozen §7.5(j) replay only; genuine residuals remain; candidate stays `REVIEW_REQUIRED`). The broader Phase 3 reliability
gate (composition contract CLOSED_OFFLINE, related-series aggregation IR decision still open, gap-call `localRef` reliability CLOSED_OFFLINE,
then stratified real-provision certification) remains **open** — see revised roadmap step 1. NS-4 is **not** implemented
here; it stays the next persistence gate.
