# Source retrieval notes

## Policy

- Bulk EDGAR HTML is **not** committed to git (size + fleet convention).
- This corpus stores **manifests, graphs, quoted excerpts, and fixture pointers**.
- Session retrievals used User-Agent `HeadroomResearch/1.0 (research; contact: engineering@headroom-app.example)`.

## Retrieved this session (ephemeral `/tmp/amendment-research/`)

| Issuer | Docs | Status |
|---|---|---|
| Coherent | Am4 EX-10.1, Am5 EX-10.2 (accession 0001193125-25-220656) | OK |
| Matthews | Third A&R base, First, Fifth, Sixth Amendments | OK |
| AZZ | Base CA + First–Fourth Amendments | OK |
| Internap | Seventh Amendment EX-10.1 | OK |

## Fixture-backed (already in repo)

| Issuer | Path |
|---|---|
| DSGR | `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/` |
| CONMED | `tests/fixtures/unseen-packages/conmed-2025-credit-facility/` |

## Prior Headroom reconstructions reused (cited, not re-asserted as new)

- `docs/coherent-credit-agreement-amendment-reconstruction.md`
- `docs/matthews-international-onboarding.md`
