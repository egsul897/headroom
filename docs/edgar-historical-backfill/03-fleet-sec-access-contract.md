# Fleet SEC access contract (WS-EHB ↔ WS-CKF)

**Status:** DRAFT_CONTRACT  
**Version:** 1

## Hard truth

`SecAccessCoordinator` (process-local) **does not** coordinate separate Cursor Cloud Agents. Process-local request counters must never be described as fleet-wide enforcement.

## Required identity

Live SEC requests require configuration:

```bash
export SEC_EDGAR_USER_AGENT='HeadroomHistoricalBackfill/1.0 (contact: AUTHORIZED_EMAIL; research; respectful fair-access)'
# or
export SEC_EDGAR_CONTACT_EMAIL='AUTHORIZED_EMAIL'
```

Placeholder / `example.com` / `*.example` contacts are rejected. No default contact is invented in code.

## Ownership modes

| Mode | How | Live network |
| --- | --- | --- |
| Designated owner | `HEADROOM_SEC_FETCH_OWNER=WS-EHB` or `WS-CKF` | Only that role may live-fetch |
| Shared budget file | `HEADROOM_SEC_SHARED_BUDGET_PATH` on a **shared volume** | Cooperative lease + token bucket across processes that can see the file |
| None | owner unset/`NONE` and no shared path | Live network **denied** (cache-only / fail closed) |

Recommended for this fleet when VMs are isolated: run discovery (`WS-EHB`) and acquisition (`WS-CKF`) **serially**, flipping `HEADROOM_SEC_FETCH_OWNER`, rather than claiming parallel fair-access.

## Roles

- **WS-EHB** — submissions, indexes, primary exhibit-list metadata, queue production
- **WS-CKF** — canonical exhibit-body downloader / corpus registry (`lib/knowledge-factory`)

EHB does not create a second source registry.
