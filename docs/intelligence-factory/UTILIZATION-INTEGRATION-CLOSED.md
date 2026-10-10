# Utilization authority integration — CLOSED on main

| Field | Value |
|---|---|
| Integration PR | https://github.com/egsul897/headroom/pull/237 |
| Pre-merge tip | `cd8c7f2a3e9bc36c29f3768aa709957d0407ef45` |
| Merge commit (`main`) | `7f1dd3a202b026b9a862ef727480a1a9f284523a` |
| Merged at | 2026-10-10T00:01:49Z |
| Supersedes | #232, #234 (do not land independently) |

## Post-merge verification

- `lib/capacity/utilization-authority.ts` present on `main`
- A8 capacity `state.ts` / `types.ts` byte-identical to post-#229 `b99f934b`
- Empty ledger → `ZERO_NO_ATTRIBUTED_USAGE` / `UNKNOWN`, not authoritative
- Attributed without completeness cert → not authoritative
- `computeVerifiedRemaining` empty util → `mayPublishAvailable: false`
- Targeted tests: 33/33 (shared-usage, utilization-and-remaining, a8-gate, Agent8)

## Contract

See `UTILIZATION-AUTHORITY-CONTRACT.md` and `SILENT-ZERO-CONSUMER-AUDIT.md`.
