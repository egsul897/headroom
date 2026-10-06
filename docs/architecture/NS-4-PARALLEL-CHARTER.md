# NS-4 parallel charter — approved snapshot store (Architect scope lock)

**Status:** ACCEPTED CHARTER (COO PASS 2026-10-06) for Headroom NS-4 agent  
**Gate:** `docs/headroom-north-star-reconciliation/07-next-implementation-gate.json` → NS-4  
**Parallel safety:** touches **frozen Phase 4B contract only**; must not edit Phase 3 IR / semantic-accountability / stratified-cert / related-series.

## Mission

Build the **append-only approved financial snapshot store** + heterogeneous certificate → proposal → APPROVED path so Ask Headroom can eventually bind capacity to real certificates — **without waiting for Phase 3 stratified live cert to finish**.

## In scope (v1)

1. Persisted store implementing 4B `FinancialSnapshot` / `FinancialInput` identity 1:1 (snapshot, fact, fact-level source-location joins).  
2. States: `DRAFT | REVIEW_REQUIRED | APPROVED | SUPERSEDED` with **explicit supersession** (`supersedesSnapshotId`) and unsafe-graph checks before commit.  
3. APPROVED only via attributable append-only approval transition.  
4. Loader → 4B types, byte-identical to hand-built fixtures; feeds `snapshotInputResolver` unchanged.  
5. Certificate fact-proposal format (source doc id + version hash, locator, period, as-of, scope, kind, key, value type, currency/unit, proposer).  
6. Restatement = new snapshot superseding old.  
7. Certificate basket-usage schedules → **4C ledger PROPOSALS only** (recorded, not applied).  
8. Tests on **synthetic** heterogeneous certificates from CONMED/Chewy certificate *forms* (no customer secrets required for v1).

## Out of scope / soft gates

- Phase 3 IR, Pass A/B/C, stratified live/paid cert, related-series A/C  
- Reopening `semantic-accountability.v8`  
- Mutate-in-place of sealed Phase 3 evidence packets (ADR-1)  
- ERP sync / bank feeds / live EBITDA / TMS (N9 stop)  
- Applying ledger proposals into capacity truth (that’s later 4C)  
- Ask Headroom UI

## Success criteria

- Synthetic certificate → APPROVED snapshot → resolver returns identical values to fixture path.  
- Supersession + nine unsafe-graph checks enforced at write.  
- Zero dependency on CONMED-only sectionRefs in store code.  
- Phase 3 files untouched in NS-4 PRs (Architect/CI FAIL if mixed).

## Interface to rest of system

- **Consumes:** frozen `financial-input-contract.v1` (4B).  
- **Produces:** APPROVED snapshots + proposals for future selector resolution (roadmap step 6) and rulebook↔snapshot connect (step 7).  
- **Does not block / is not blocked by:** offline pin matrix or ADR-2 code chunk.

## First PRs suggested

1. Docs: this charter landed under `docs/architecture/NS-4-PARALLEL-CHARTER.md` after COO glance.  
2. Store schema + append-only write API + supersession tests.  
3. Synthetic certificate fixture pack + proposal→APPROVED path.  
4. Loader parity tests vs existing 4B hand fixtures.

## Coordination

- **Architect:** challenges boundary leaks into Phase 3 / IR invent.  
- **COO:** PASS on charter land; merge gates.  
- **Cert / Grok Bot:** own stratified pins; do not assign NS-4 store work to Phase 3 PRs.  
- **Product:** Headroom Answer needs snapshots eventually — NS-4 is the path.

## COO decision

**COO: PASS (2026-10-06).** Land under `docs/architecture/NS-4-PARALLEL-CHARTER.md`.

**Authorized after land:** NS-4 agent may open follow-on PRs for store schema + append-only API + supersession tests, then synthetic certificate→APPROVED path + loader parity — soft-gated (Phase 3 files untouched; no ERP; no live customer data). Mixed Phase-3/NS-4 PRs = FAIL.
