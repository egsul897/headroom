# CKF ↔ EHB coordination

- **WS-EHB** (`cursor/edgar-historical-backfill-c45c`) owns discovery queue production.
- **WS-CKF** (this branch) owns exhibit-body acquisition and the knowledge corpus registry.

## Handoff

Consumer copy of EHB’s committed handoff package:

`docs/knowledge-factory/coordination/ehb-handoff-summary.json`

Imported from `docs/edgar-historical-backfill/ckf-handoff-summary.json` on the EHB branch. CKF claims items in `.local-knowledge-corpus/manifests/ehb-claims.json` and does not mutate EHB’s runtime queue files.

## Fleet SEC access

Set `HEADROOM_SEC_FETCH_OWNER=WS-CKF` while CKF live-fetches. Prefer serial ownership with EHB rather than parallel fair-access claims across isolated VMs.

## Non-goals

- No second source registry
- No competing EDGAR download stack beyond CKF’s existing client
- No automatic legal certification
- No paid inference without authorization
