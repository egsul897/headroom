# Sealed holdout payloads (in-repo)

Files in this directory may contain **expected outcomes** for sealed cases.

## Isolation policy (Cycle 2)

Because this directory is readable by implementation agents through the
repository, cases that use these payloads are labeled **`FROZEN_REGRESSION`**,
**not** `BLIND_AUTHENTIC_HOLDOUT`.

- `BLIND_AUTHENTIC_HOLDOUT` requires answer keys stored **outside** the
  agent-accessible workspace (external vault / release-gate-only storage).
- Do **not** import these from `lib/product/**` or implementation agents' normal workflows.
- Scoring still requires `HOLDOUT_UNLOCK=1` via `openHoldoutSeal`.
- Public registry entries expose only `holdoutSealId` + `payloadSha256` (+ isolation note).

Example payload filename: `example-v1.json` (created by tests when demonstrating the seal API).
