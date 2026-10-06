# NS-4 soft gates (binding until explicitly lifted)

**Status:** ACCEPTED (Architect PASS_WITH_NOTES + COO PASS_WITH_NOTES 2026-10-06)  
**Owner:** Headroom NS-4  
**As of:** 2026-10-06  
**Pairs with:** short ACCEPTED charter `docs/architecture/NS-4-PARALLEL-CHARTER.md` (#67) — do not supersede that file

## Hard exclusions (FAIL if a PR touches these)

1. **Phase-3 IR / semantic tree** — no edits under Phase-3 IR, Pass A/B/C, or compiler trees that Phase 3 owns.
2. **`semantic-accountability.v8` A/B seal** — do not reopen.
3. **Related-series option A or C** — interim B stands; no IR invent.
4. **Paid / live §7.5(j) (or any live provider cert)** — zero provider calls in NS-4 PRs.
5. **Historical live evidence packets** — append-only / versioned only; never mutate-in-place. Normative: `docs/architecture/EVIDENCE-PACKET-VERSIONING-ADR.md` (ADR-1).
6. **ERP / bank / TMS / continuous sync** — North Star N9 stop; certificates / delivered reporting only.
7. **Ask Headroom UI** — out of scope for NS-4.
8. **Applying ledger proposals into capacity truth** — record 4C PROPOSALS only; do not apply.
9. **Mixed Phase-3 + NS-4 PRs** — Architect/CI FAIL.

## Implementation auth (already granted by #67 — do not re-block)

After the short PARALLEL-CHARTER landed under `docs/architecture/NS-4-PARALLEL-CHARTER.md` (#67), COO **already authorized** follow-on PRs for:

1. Store schema + append-only write API + supersession / nine-check tests  
2. Synthetic certificate → APPROVED path  
3. Loader parity vs 4B fixtures  

Those remain soft-gated **only** by the hard exclusions above (Phase 3 files untouched; frozen 4B only; synthetic certs; ledger proposals not applied; no ERP / live customer data / provider calls; mixed Phase-3/NS-4 PRs = FAIL).

**This expanded docs pack does not re-block that #67 auth.** Landing `NS-4-AGENT-CHARTER.md` + this file is additive documentation alongside the short charter.

Keep docs-expansion PRs separate from store-impl PRs (no mixed Phase-3 content in either).

## Parallel tracks (do not block / do not absorb)

- Offline pin matrix / stratified cert (Cert + Grok Bot)
- ADR-2 model-contract vs UNSUPPORTED
- Related-series stays explicit UNSUPPORTED

## Coordination rule

- **Docs land:** Grok Bot opens docs-only PR after Architect + COO clear this pack (short charter stays; expanded alongside).
- **Store-impl:** NS-4 may open slices 1–3 under #67 auth + hard exclusions; NS-4 does not self-merge past COO/Release gate.
