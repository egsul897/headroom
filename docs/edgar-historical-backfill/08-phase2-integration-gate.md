# WS-EHB Phase 2 — Final Integration Gate

**PR:** https://github.com/egsul897/headroom/pull/142  
**Workstream:** WS-EHB  
**Gate start tip:** `97400e5d7f7e65a7612fdc970abcbe8110cb1cdb`  
**Scope:** Source-discovery infrastructure only. No scale-1000. No additional SEC acquisition. No paid inference. No autonomous merge.

## Gate checklist

1. **Reconcile `origin/main`** — Merged `ab87979` (latest main at gate). Conflict only in `.gitignore`; resolved by adopting main’s `data/` + `.cache/` (covers EHB ephemeral runtime + SEC cache) with clarifying comments.
2. **Scope audit (47 PR files)** — Exclusive trees `docs|lib|scripts|tests/edgar-historical-backfill/**` plus shared `.env.example` (SEC/fleet vars) and `.gitignore` (ephemeral ignore). No edits to `lib/connectors/**`, `lib/knowledge-factory/**`, or registry. Overlap with CKF is handoff-shaped only (`ckf-handoff.ts` mirrors peer types without importing CKF or creating a second source registry). SEC connector reuse is metadata/index parsing discipline only.
3. **SEC gates preserved** — Single-owner `HEADROOM_SEC_FETCH_OWNER`; valid contact via `SEC_EDGAR_USER_AGENT` / `SEC_EDGAR_CONTACT_EMAIL` (placeholders rejected); process-local RPS/backoff; fail-closed when owner=`NONE` and no shared budget; IBR ambiguity left unresolved when Form/date cannot match submissions.
4. **IBR 45 vs 80** — Distinct denominators; see `07-ibr-denominator-reconciliation.md`. Not a discrepancy to “fix.”
5. **149 CKF handoff** — Offline `validate-queue` regenerates handoff from queue; `fetchableCount=149`; `sourceId` prefix `ehb:`; no registry writes.
6. **Storage** — Committed docs/manifests summaries under `docs/edgar-historical-backfill/`; runtime source bytes + full queue/manifests under `data/edgar-historical-backfill/` = `EPHEMERAL_WORKSPACE` (gitignored via `data/`).
7. **Replay / tests / tsc** — Resume hydration idempotent; 29 focused tests; TypeScript check.
8. **CI + merge compatibility** — Exact-head CI green; merge-tree clean vs `origin/main`.
9. **Ready + notify** — PR marked ready for review; Integration Lead (WS-PAR) notified for prompt merge. Agent does **not** merge.
