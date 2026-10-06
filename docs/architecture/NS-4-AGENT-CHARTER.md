# NS-4 agent charter — approved snapshot store (expanded)

**Status:** ACCEPTED EXPANDED CHARTER (Architect PASS_WITH_NOTES + COO PASS_WITH_NOTES 2026-10-06)  
**Agent:** Headroom NS-4  
**Gate source of truth:** `docs/headroom-north-star-reconciliation/07-next-implementation-gate.json` → `nextGate.id = NS-4`  
**Short charter on main:** `docs/architecture/NS-4-PARALLEL-CHARTER.md` (landed #67, COO PASS 2026-10-06)  
**Contract:** frozen Phase 4B `financial-input-contract.v1` (`docs/phase-4b/`, `lib/contract-model/runtime/input/`)  
**Product control:** `docs/headroom-north-star-v2.md` §3–4 (approved dated snapshots; 4B resolve-only vs NS-4 write surface)  
**Base for review:** `origin/main` (ancestor includes `d5ac8be`)

This document expands the short parallel charter into an **executable scope lock** for NS-4. It does not change the #67 decision; it makes acceptance criteria, interfaces, and PR slices explicit so implementation cannot invent architecture. Store-impl slices remain authorized under #67 soft gates (see `NS-4-SOFT-GATES.md`).

---

## 1. Mission

Build the **append-only approved financial snapshot store** and the **heterogeneous certificate → fact-proposal → APPROVED** path so Ask Headroom can eventually bind capacity to real certificates — **without waiting for Phase 3 stratified live cert to finish**, and **without touching Phase 3**.

NS-4 is **not** a substitute for stratified cert, related-series A/C, or Ask Headroom.

---

## 2. Why NS-4 now

Every downstream North Star step (selector resolution, rulebook↔snapshot, capacity position, Ask Headroom, 4D over real state) needs **approved, persisted, provenance-complete** snapshots. None exists as a write surface today. Phase 4B is **resolve-only** over already-supplied immutable snapshots. NS-4 is the write surface. It depends only on the frozen 4B contract, so it may run **in parallel** with Phase 3 reliability work when capacity and COO auth allow.

---

## 3. In scope (v1)

### 3.1 Persisted store (4B identity 1:1)

Implement persistence for:

- Snapshot records matching 4B `FinancialSnapshot` fields: `snapshotId`, `version`, `companyId`, `asOf`, `reportingPeriod`, `status`, `supersedesSnapshotId`, `provenance`, `review`, `inputs`
- Fact records + **fact-level source-location join** (document id, version/hash, page / section / table / row)
- Identity of a fact: company, scope, kind, key, period, as-of, value type, currency — 4B identity 1:1; never invent a parallel identity model

### 3.2 Status machine

Statuses: `DRAFT | REVIEW_REQUIRED | APPROVED | SUPERSEDED`

Rules:

- Snapshots are **immutable once written** (no in-place edit of published rows)
- **APPROVED** only via a separate, attributable append-only approval transition (who / when / `approvalRef`)
- Extracted / proposed facts stay `DRAFT` or `REVIEW_REQUIRED` until that transition
- Restatement = **new** snapshot that supersedes the old via `supersedesSnapshotId` (successor → predecessor; never latest-looking / highest-version / newest-timestamp)

### 3.3 Unsafe-graph checks (write-time, all nine)

Before commit, refuse any set that triggers a 4B unsafe graph (`docs/phase-4b/04-snapshot-supersession-model.json`):

1. `SELF_SUPERSESSION`
2. `SUPERSESSION_CYCLE`
3. `COMPETING_SUCCESSORS`
4. `DUPLICATE_SNAPSHOT_ID`
5. `SUPERSEDES_UNKNOWN_SNAPSHOT`
6. `SUPERSEDED_STATUS_WITHOUT_SUCCESSOR`
7. `SUCCESSOR_OF_ANOTHER_COMPANY`
8. `MONEY_INPUT_WITHOUT_CURRENCY`
9. `DUPLICATE_IDENTITY_WITHIN_SNAPSHOT`

### 3.4 Loader

Loader from store → 4B snapshot types, **byte-identical** to hand-built fixtures, feeding `snapshotInputResolver` **unchanged**.

### 3.5 Certificate fact-proposal format

Model-agnostic proposal records for heterogeneous certificate layouts:

- Source document id + version hash
- Page / section / table / row locator
- Reporting period, as-of, scope, kind, key
- Value type, currency / unit
- Proposer (human or extractor)

No LLM / provider call is required for v1; the format is extraction-ready later.

### 3.6 Approval + restatement

- Explicit proposal → APPROVED transition (attributable)
- Restatement path: new APPROVED snapshot superseding prior; superseded remains queryable

### 3.7 Basket-usage schedules → 4C proposals only

Certificate basket-usage lines route to **4C ledger PROPOSALS** (recorded, not applied). They **never** become snapshot facts.

### 3.8 Tests (synthetic first)

Synthetic heterogeneous certificates built from CONMED / Chewy certificate **forms** and invented layouts. Adversarial cases required:

- Missing currency
- Duplicate identity
- Competing successors
- Carried-forward value
- LLM-extracted value without approval
- `PUBLIC_FILING_RECONSTRUCTION` marked for approval

Zero customer secrets required for v1. Zero provider calls.

---

## 4. Out of scope

- Any LLM extraction run or provider call
- Selector resolution (roadmap NS-6)
- UI / Feeds reframe
- Migration of legacy `FinancialSnapshot` rows
- ERP / bank / continuous sync
- Phase 3 or Phase 4A–4D **production** changes (consume frozen 4B types only)
- Ingesting a real customer certificate (NS-5)
- Applying ledger proposals into capacity truth (later 4C)
- Reopening Phase-3 IR, related-series A/C, paid §7.5(j), sealed A/B evidence

See also `NS-4-SOFT-GATES.md`.

---

## 5. Acceptance criteria

1. A stored APPROVED snapshot resolves through the **unchanged** 4B resolver to the same results as the equivalent in-memory fixture.
2. No fact becomes APPROVED without an explicit approval record; extracted proposals stay DRAFT / REVIEW_REQUIRED.
3. Every unsafe-graph condition the 4B contract defines is refused at write time.
4. No write path fills a missing fact from another period.
5. A restatement supersedes explicitly; the superseded snapshot stays queryable.
6. Basket-usage lines never become snapshot facts.
7. Zero provider calls; Phase 3 and Phase 4A–4D trees unchanged in NS-4 PRs.
8. Zero CONMED-only `sectionRef` (or package-id) hardcoding in store code.

---

## 6. Interface to the rest of the system

| Direction | Interface |
|-----------|-----------|
| **Consumes** | Frozen `financial-input-contract.v1` (4B types + resolver) |
| **Produces** | APPROVED snapshots + certificate proposals; ledger **proposals** for later 4C |
| **Enables later** | NS-5 real certificate ingest; NS-6 selector→snapshot identity; NS-7 rulebook + snapshot through 4A/4B |
| **Does not block** | Offline pin matrix, ADR-2, stratified cert design |

North Star gate tags from `07-next-implementation-gate.json`: N2 primary; N7/N8 yes; N9 no (periodic certificates, not ERP).

---

## 7. Suggested PR slices

1. **Docs (this pack)** — land under `docs/architecture/` **alongside** short #67 `NS-4-PARALLEL-CHARTER.md` (do not supersede). Soft-gates file included. No store-impl code in this PR.
2. **Store schema + append-only write API + supersession / nine-check tests** — authorized by #67 COO decision; hard exclusions apply.
3. **Synthetic certificate fixture pack + proposal→APPROVED path** — same.
4. **Loader parity tests** vs existing 4B hand fixtures — same.

---

## 8. Coordination

| Role | Expectation |
|------|-------------|
| **NS-4** | Own charter + store-impl PRs under #67 auth; never mix Phase-3 files |
| **Architect** | Challenge boundary leaks into Phase 3 / IR invent; PASS/FAIL on charter |
| **COO** | Sole merge/auth decider; PASS on expanded charter land; #67 already authorized soft-gated store-impl slices |
| **Grok Bot** | Opens **docs-only** PR after Architect + COO clear this pack; owns Phase-3 pins — do not dump NS-4 store into Phase-3 PRs |
| **Cert** | Stratified pins; orthogonal to NS-4 |
| **Product** | Headroom Answer needs snapshots eventually — NS-4 is the path |
| **Trust / Audit Peer / Release** | Standard merge gate after implementation PRs exist |

---

## 9. Land decision (ACCEPTED)

**Architect:** PASS_WITH_NOTES · **COO:** PASS_WITH_NOTES (2026-10-06).

**Docs PR:** land this expanded charter + `NS-4-SOFT-GATES.md` **alongside** short `NS-4-PARALLEL-CHARTER.md` (do **not** supersede the short #67 one-pager). Paths:
- `docs/architecture/NS-4-AGENT-CHARTER.md`
- `docs/architecture/NS-4-SOFT-GATES.md`

**Store-impl:** slices 2–4 in §7 (store schema/API + supersession tests; synthetic certificate→APPROVED; loader parity) are **already authorized** under #67 / soft gates / hard exclusions — this expanded pack does not re-block them. Grok Bot opens the docs-only PR; NS-4 owns follow-on store-impl PRs.
