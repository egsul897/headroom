# WS-EHB Phase 2 progress

## SEC identity

- Placeholder User-Agent removed.
- Live requests require `SEC_EDGAR_USER_AGENT` or `SEC_EDGAR_CONTACT_EMAIL` (authorized operator config).
- Placeholder / example.com contacts rejected in code.

## Fleet coordination

- Documented: in-process limiter ≠ fleet-wide (`03-fleet-sec-access-contract.md`).
- `HEADROOM_SEC_FETCH_OWNER` single-owner gate; optional `HEADROOM_SEC_SHARED_BUDGET_PATH` for same-volume cooperation.
- Live network denied when owner is `NONE` and no shared budget path.

## Queue / CKF handoff

- Queue v2 fields: resolutionStatus, parentRelationshipCandidates, dedupeIdentity, validation.
- Offline validation of pilot-100 queue: **126/126 ok**, all FETCHABLE_INLINE → CKF handoff fetchable **126**.
- Export: `ckf-handoff.json` (workspace) + truncated `docs/.../ckf-handoff-summary.json`.

## IBR (smoke-ibr-v2)

| Metric | Prior smoke | smoke-ibr-v2 |
| --- | --- | --- |
| ibrResolved (engine stats) | 1 | **14** |
| RESOLVED residuals | 1 | **7** |
| NEEDS_ORIGINAL_INDEX | 47 | **10** |
| MISSING_ACCESSION | 19 | 19 |
| Queue IBR_RESOLVED items | 0 | **5** |

Ambiguity preserved when Form/date cannot match submissions. IBR ≠ operative amendment authority.

## Storage honesty

Runtime artifacts under `data/edgar-historical-backfill/` are **EPHEMERAL_WORKSPACE** unless exported. Integrity checksums written per run; committed docs hold summaries only.
