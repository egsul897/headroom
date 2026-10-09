# Document A → Document B — next test design (post-durability)

**Status:** DESIGN ONLY — do not claim generalization until executed after A2 live proof.

## Document A (knowledge source)

| Field | Value |
|---|---|
| Issuer | Gibraltar Industries, Inc. |
| CIK | `0000912562` |
| sourceId | `edgar:0001140361-26-003087:ef20064499_ex10-1.htm` |
| Role | Durable knowledge source (precedent intelligence only) |

## Document B (evaluation target — issuer-disjoint)

| Field | Value |
|---|---|
| Issuer | Chewy, Inc. |
| CIK | `0001766502` |
| Package | `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/` |
| Document | `raw-html/doc-a-2026-06-23-credit-agreement.htm` |
| Accession (manifest) | `0001193125-26-281042` |
| Role | Operative package under analysis |

Issuer-disjoint from Gibraltar. Already in-repo; no mass SEC acquisition required.

## Retrieval / authority rules

1. Retrieve Gibraltar definitions / candidates / edges by canonical `sourceId` via `consumer-export.v1` consumers (DEF, atlas) and/or research retrieve.
2. Every retrieved hit must carry: `sourceId`, span, content hash, representation/verification label.
3. Chewy operative text **controls**. Precedent from A is intelligence only — never silently overrides B.
4. Unsupported / uncertain outcomes remain explicit (`SOURCE_ONLY` / `UNVERIFIED` / refusal) — no certification or capacity promotion.
5. Replay: given durable A + B fixture bytes, reproduce retrieval set with identical canonical identities.

## Pass criteria (future)

- ≥1 relevant Gibraltar precedent retrieved for a Chewy query with correct citation/`sourceId`
- Zero cases where Gibraltar text is asserted as Chewy operative authority
- Labels remain non-executable; independent replay of the run artifact succeeds

## Out of scope for this design note

Paid inference, bulk EDGAR acquisition, certification advancement.
