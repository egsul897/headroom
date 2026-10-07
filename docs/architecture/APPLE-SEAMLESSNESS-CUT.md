# Apple seamlessness — Chunk A′

**Status:** IMPLEMENTED skeleton. This is not a certified dashboard. Ask is not runnable from this shell.
**Merge:** HOLD until Architect pass, Product copy pass, Trust claim-hygiene, COO, and CI.

## Bindings (COO FROZEN GRANT)

| Binding | Value |
|---|---|
| Plan sha256 | `bb1cda9249b606e2d3fe1a064d8b22315500eed4169468660af052cef6f01379` |
| Product LOCK sha256 | `7f68ced002e91cb4750f4a8680462f840a2bf54ae92bfb4a423af6d8c2b7d0a4` (buyer polish; supersedes `cda3a4bd53f37677e0bfe5fc996d18b09af5a75712847a238361849ad5ba845a`) |
| Visual sha256 | `fbe53a17738e4c66106213906439451126fcea797346fd42830865195f7ace1f` |
| Visual path | `/workspace/headroom-product-vision/home-dashboard-endstate.png` |
| Product LOCK path | `/workspace/headroom-product-vision/CHUNK-A-PRIME-KPI-EMPTY-COPY-LOCK.md` |
| Implementation base | `3193db3a74ceafb504f4bed764d7672d983f91e9` (post-#81) |

The plan file is not edited by this change. Product LOCK strings are implemented in `lib/home/copy.ts`. Ask empty cases are in `lib/ask/copy.ts`.

## What this chunk is

Company home (`/[companyId]`) is an overview skeleton matching the end-state **regions**: total headroom, utilization, covenants at risk, next test, headroom over time, capacity summary, status table, drivers, alerts, and transactions. Every slot renders Product LOCK empty copy. No mock figures are drawn.

Ask is a secondary route (`/[companyId]/ask`) plus a hero on the overview. The shell does not answer. An unrunnable open shows “Ask isn’t available on this deal yet.” A submitted question is refused and is not relabeled Unsupported.

Legacy Dashboard, Simulate, Feeds, Docs, and Ledger stay on their existing routes and are linked from Deal setup & tools (`/[companyId]/tools`).

ACTIVE company open from `/` goes to `/[companyId]`. A company still `ONBOARDING` still opens the wizard.

## Honesty

- IMPLEMENTED is not certification.
- A pinned offline run is not certification and does not make Ask runnable.
- Ask-as-landing is superseded. The overview is the company home.
- Soft gates: no live or paid stratified certification, no related-series option A or C, no NS-4 Slice 3.
- Empty slots are not provenance-bound figures.
- The company shell does not paint a leverage number beside those empty slots. Legacy Dashboard still computes its own existing view when opened from Deal setup & tools.
- Simulate remains the legacy scenario tool.

## Reversible

Restore the dashboard redirect in `app/[companyId]/page.tsx` and the previous five-tab `components/CompanyNav.tsx`.
