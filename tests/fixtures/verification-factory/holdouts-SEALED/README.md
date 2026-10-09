# Sealed holdout payloads

Files in this directory contain **expected outcomes** for blind authentic holdouts.

- Do **not** import these from `lib/product/**` or implementation agents' normal workflows.
- Scoring requires `HOLDOUT_UNLOCK=1` via `openHoldoutSeal`.
- Public registry entries expose only `holdoutSealId` + `payloadSha256`.

Example payload filename: `example-v1.json` (created by tests when demonstrating the seal API).
