# Integration gates (fleet-wide)

**Status:** DRAFT_CONTRACT  
**Owner:** WS-PAR  
**Applies to:** all corpus / compilation / compute agents

A PR or dataset import **FAILS integration** if any gate trips.

## Hard gates

| ID | Gate | Fail condition |
| --- | --- | --- |
| G1 | Source ≠ verified rule | `verificationStatus` is `SOURCE_ONLY` or `HYPOTHESIS` but record is treated as certified/operative rule |
| G2 | Hypothesis ≠ approved capacity | Model output used as approved basket/capacity without human/attributable approval path |
| G3 | Superseded ≠ operative | Superseded / non-operative text asserted as current authority |
| G4 | Duplicate inflation | Distinct instrument/agreement counts ignore `contentHash` / filing reconciliation |
| G5 | Schema migration conflict | Migration touches another workstream’s exclusive Prisma models without ownership amendment |
| G6 | Eval contamination | Held-out / Claude-owned / WS-CKB evaluation sets edited by training/tuning workstreams |
| G7 | Sealed evidence | Unreviewed mutation of sealed certification evidence packets |
| G8 | SEC flood | Direct SEC.gov fetch outside centralized scheduler in production paths |
| G9 | Paid unauthorized | Paid provider/infra call without founder authorization |
| G10 | Ownership | Production path outside workstream `exclusiveOwn` / violates `mustNotTouch` |

## Merge sequence (dependency-aware, legal-safety first)

1. **WS-PAR** contracts (this pack) — docs + checkers only  
2. **WS-CKF** acquisition + corpus registry + SEC scheduler impl (no cert claims)  
3. **WS-EHB** backfill queue (depends on scheduler contract/mock; production after CKF scheduler)  
4. **WS-VIC** provider adapters (no paid calls; offline/deterministic first)  
5. **WS-CCA** / **WS-GIB** measurements & cost analyses (no provisioning; no paid inference)  
6. Corpus overlays in parallel once identities published: **WS-DEF / WS-BFL / WS-NED / WS-CDA / WS-RCD / WS-PCI / WS-SCR / WS-FDP / WS-RAC / WS-CRI**  
7. **WS-CKB** independent benchmark (must not be contaminated by #6 tuning)

Never merge certification-status or sealed-evidence changes in this fleet without founder authorization.

## Coordinator rule

WS-PAR proposes bounded resolutions for conflicts in the integration ledger. It does **not** independently rewrite CKF/VIC/CCA/GIB production components.
