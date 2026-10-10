# PR #260 audit remediation — canonical identity + §7.01 probe honesty

**Starting SHA:** `48089e56312c7f5b528eb21679821d3b53178144`  
**Audited verdict addressed:** `MERGE_BLOCKED_BY_CANONICAL_IDENTITY_RISK`

## P0 — provisional associations ≠ canonical instrument identity

- `groupPackageIntoInstruments` unions **trusted** (`RESOLVED` + strong) edges only.
- `REVIEW_REQUIRED` associative edges attach as `provisionalDocumentIds` (discovery) or `provisionalBridgeBlockers` (refused merge / ambiguous multi-target).
- `persistPackageGraph` assigns `Document.instrumentId` only from confirmed `documentIds`; clears stale managed assignments; deletes empty orphan instruments after upgrade/merge.

## P1 — §7.01 script honesty

- Role: `CREDENTIAL_READINESS_PROBE` (`LIVE_PATH_IMPLEMENTED = false`).
- Gate order: implementation → budget/config → credentials/spend.
- Never reports `LIVE_PATH_ENTERED`; `verifiedRule.count` stays 0; exit 2; no paid calls.

## Tests

- `tests/agent6/provisional-bridge-canonical-identity.test.ts` (in-memory + persistence)
- Updated `tests/agent6/a6-d4-provisional-instrument-family.test.ts`
