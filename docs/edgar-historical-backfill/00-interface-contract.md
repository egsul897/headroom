# EDGAR Historical Backfill — Interface Contract

**Workstream:** `WS-EHB` (EDGAR Historical Backfill Engine)  
**Agent:** `bc-01a11d8b-4342-7f20-8183-2aa3b387c45c`  
**Status:** DRAFT_CONTRACT  
**Coordinates with:** `WS-CKF` (Covenant Knowledge Factory)

## Ownership (exclusive)

- `docs/edgar-historical-backfill/**`
- `lib/edgar-historical-backfill/**`
- `scripts/edgar-historical-backfill/**`
- `tests/edgar-historical-backfill/**`
- `data/edgar-historical-backfill/**` (runtime artifacts; gitignored except committed pilot summaries under `docs/`)

## Non-goals / soft gates

- Do **not** create a second source registry (reuse `lib/connectors/registry.ts`).
- Do **not** download every filing blindly; metadata-first discovery only.
- Do **not** replace CKF’s acquisition/downloader.
- Do **not** evade SEC fair-access limits.
- No paid model calls, merges, or certification changes.

## Published artifacts

| Artifact | Path | Consumer |
| --- | --- | --- |
| Issuer manifest | `data/.../manifests/<cik>.json` | CKF / analytics |
| Duplicate groups | `data/.../manifests/<cik>.duplicates.json` | CKF dedupe awareness |
| Coverage report | `data/.../coverage.json` | Operators / CKF |
| Acquisition queue | `data/.../acquisition-queue.json` | **CKF acquisition agent** |
| Checkpoint | `data/.../checkpoint.json` | Resume |

## Acquisition queue item (v1)

```ts
type AcquisitionQueueItem = {
  queueId: string;
  priority: number;
  cik: string;
  ticker?: string;
  accessionNumber: string;
  filingDate: string;
  form: string;
  exhibitType: string;
  filename: string;
  description: string;
  documentKind: string;
  sourceUri: string;           // fetchable SEC URL
  agreementIdentityKey: string;
  relevanceScore: number;
  draftingDiversityBonus: number;
  reason: string;
  status: "QUEUED" | "CLAIMED" | "DONE" | "FAILED";
  enqueuedAt: string;
};
```

CKF should claim items by setting `status` to `CLAIMED` in its own durable store (do not require mutating this workstream’s queue file).

## SEC access coordinator

`lib/edgar-historical-backfill/sec-access.ts` — `SecAccessCoordinator`

- Identifying `User-Agent`
- On-disk GET cache
- 429/5xx exponential backoff + jitter
- Concurrency + RPS caps (default ≤ 8 req/s, ≤ 2 concurrent)

CKF should share this coordinator (or an equivalent process-wide limiter) so discovery and download share one fair-access budget.

## Relationship to existing EDGAR connector

- Consumes SEC public indexes / submissions the same way `EdgarConnector` does.
- Extends historically via `filings.files` archive shards (connector V1 only walks `filings.recent`).
- Does **not** modify `lib/connectors/edgar-connector.ts` or `registry.ts`.
