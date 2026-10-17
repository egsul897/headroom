# Consolidation proposals (2026-10-17)

Goal: software a CFO, treasurer or debt lawyer can trust. Fewer parallel paths =
fewer places for two answers to the same question. Each item names the owner and
what Grok will / will not do.

## 1. One EBITDA implementation

Today there are two:

| | A. `lib/financial-certificate-engine/contractual-ebitda-buildup.ts` (release-1) | B. #398 `lib/covenant-learning-factory/xbrl/ebitda-optimizer.ts` + `pipeline/ebitda-box*.ts` |
| --- | --- | --- |
| Input | a compliance-certificate engine run (`EngineRunResult`) + evidence package | the agreement's own EBITDA definition + SEC XBRL financials + CFO confirmations |
| Output | `ContractualEbitdaDerivation` (build-up components) | EBITDA box: total, add-backs with caps (exact LP for shared caps), NEEDS_INPUT items, CFO confirm log |
| Consumers | `lib/product/**` (contractual-computation, cross-domain simulate/transaction, debt-intelligence, metric resolver) | upload pipeline (`waitUntil`), `/api/companies/[id]/documents/[id]/ebitda[/confirm]`, #401 UI |

**Proposal:** B becomes the single source of add-back/definition logic (it is definition-driven,
cap-correct and invent-safe). A becomes a thin adapter: when a box exists for the governing
agreement, `resolveContractualEbitdaDerivation` maps the box's confirmed result into
`ContractualEbitdaDerivation` (components = add-back lines with their caps and sources); when no box
exists, A keeps its current certificate path, labelled as such. No consumer in `lib/product/**`
changes its import. Owner: Muse (A and its consumers are Muse's); Grok supplies the box-side
read API and tests. Until agreed, both stay; no silent swap.

## 2. One Simulate screen instead of three

`app/[companyId]/simulate/page.tsx` renders three panels backed by three engines:
`VerifiedSimulatePanel` (verified remaining), `CrossDomainSimulatePanel` (cross-domain
acquisition) and `SimulateClient` (legacy scenario runner). A CFO sees up to three capacity
answers for one transaction.

**Proposal:** one transaction form → one result card. Capacity figure comes from one engine
(`computeRemainingCapacityAfterDebtIncurrence` / verified-remaining, the same one the Dashboard
uses), with the other two engines' outputs shown only as labelled diagnostics when they disagree
(disagreement = a REVIEW_REQUIRED flag, never a silently-picked number). Owner: Muse (engines) +
Designer (screen). Grok will build the saved-scenario persistence that the single screen saves to,
and will not edit the engines.

## 3. Calendar / proof payloads

See the comment on #413: extraction of reporting deadlines/cure periods into
`ContractEventObligation` and a structured proof trace on engine rows are Muse's; Grok consumes
them read-only and returns NEEDS_INPUT until they exist.
