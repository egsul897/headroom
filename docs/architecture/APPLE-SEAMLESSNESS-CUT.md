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

Product tip rem after CFO PASS_WITH_NOTES (2026-10-07) on preview `568389f`. Buyer details do not carry eng instruction text. Product will re-PASS. This skeleton is not certification.

## What this chunk is

Company home (`/[companyId]`) is an overview skeleton matching the end-state **regions**: total headroom, utilization, covenants at risk, next test, headroom over time, capacity summary, status table, drivers, alerts, and transactions. While a slot’s source is unwired, the slot renders UNKNOWN copy. Verified-empty copy is a separate state. No mock figures are drawn.

Ask is a secondary route (`/[companyId]/ask`) plus a hero on the overview. The shell does not answer. An unrunnable open shows “Ask isn’t available on this deal yet.” A submitted question is refused and is not relabeled Unsupported.

Legacy Dashboard, Simulate, Feeds, Docs, and Ledger stay on their existing routes and are linked from Deal setup & tools (`/[companyId]/tools`).

ACTIVE company open from `/` goes to `/[companyId]`. A company still `ONBOARDING` still opens the wizard.

## Honesty

- IMPLEMENTED is not certification.
- A pinned offline run is not certification and does not make Ask runnable.
- Ask-as-landing is superseded. The overview is the company home.
- Soft gates: no live or paid stratified certification, no related-series option A or C, no NS-4 Slice 3.
- Empty slots are not provenance-bound figures.
- UNKNOWN is not verified empty. A factual-negative empty without an authoritative queried source is a hard FAIL, alongside mock KPIs.
- The company shell does not paint a leverage number beside those empty slots. Legacy Dashboard still computes its own existing view when opened from Deal setup & tools.
- Simulate remains the legacy scenario tool.

## IA-1 — invent-absence hard FAIL (soft gate)

**Status:** IMPLEMENTED. Not CERTIFIED. Merge HOLD.

Overview buyer copy binds Product LOCK UNKNOWN ≠ VERIFIED_EMPTY, sha256 `9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04` (plan `17e6f29f9bb933b48ef6ce13523ef3f68355c918fc29bb588e57a1f520b89822`).

False-claim watchlist, alongside mock KPIs: painting none / no / nothing / 0 / clear / healthy without an authoritative queried source is a hard FAIL. Unwired, not loaded, and failed load stay on UNKNOWN copy. An unloaded alert slot is not a zero count.

Architect review of this rem is COMMENT, not APPROVE. Soft gates hold. Phase 3 parallel work is outside this rem.

## Reversible

Restore the dashboard redirect in `app/[companyId]/page.tsx` and the previous five-tab `components/CompanyNav.tsx`.
