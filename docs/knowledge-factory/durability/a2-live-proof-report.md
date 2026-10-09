# A2 Live Durability Proof Report

**Verdict:** `A2_LIVE_DURABILITY_PROVEN`  
**Main tip at proof:** `2338e9e09fc9a6435bcfa4a330c424dd240ffb4d`  
**Byte store:** PostgreSQL BYTEA (`postgres-bytea`) on Neon `neondb`  
**Blob path:** not required (Cursor-first BYTEA)

## Document A (Gibraltar)

| Field | Value |
|---|---|
| sourceId | `edgar:0001140361-26-003087:ef20064499_ex10-1.htm` |
| DB id | `cmv0aqwg00002ndhsetpsslgx` |
| storageRef | `pgbytea:v1:6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a` |
| bytes | 2,266,666 |
| SHA-256 | `6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a` |

## Independent retrieve

Fresh process (`env -i` + new Node + `--phase=retrieve`): `RETRIEVE_OK`, byteEqual/hashEqual.

## Document B (Chewy)

| Field | Value |
|---|---|
| sourceId | `edgar:0001193125-26-281042:doc-a-2026-06-23-credit-agreement.htm` |
| DB id | `cmv0aqww30005ndhsvdpgtmn1` |
| storageRef | `pgbytea:v1:5fbd8c90046305871d3f93e78bf5726ae77a0004eef93183d43a887befa9c4af` |
| bytes | 1,306,165 |
| SHA-256 | `5fbd8c90046305871d3f93e78bf5726ae77a0004eef93183d43a887befa9c4af` |

Identities, hashes, and storageRefs remain separate. Both labeled `DISCOVERED_CANDIDATE` (non-certifying).

## Artifacts

- `a2-roundtrip-evidence.json`
- `a2-independent-retrieve.json`
- `a2-live-idempotency-docb.json`
- `scripts/knowledge-factory/a2-live-idempotency-docb.ts`
