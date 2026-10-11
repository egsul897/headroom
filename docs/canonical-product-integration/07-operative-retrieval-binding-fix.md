# P0 fix — operative → retrieval binding on #293

**Starting SHA:** `8a4beb52712a6e31e5458fe2a005026fadedd4f1`  
**Source:** selectively restored from #283 (`3643763a…` tip; binding introduced in `0dcb4a17`)  
**Verdict target:** `CANONICAL_293_OPERATIVE_RETRIEVAL_BINDING_VERIFIED`

## Defect

Canonical tip had `resolveOperativeSource` + `buildCovenantContextBundle` but **omitted** `bindCandidateToOperativeRetrievalSource`, so offline compile retrieved from discovery candidates without remapping to Agent #7 `governingDocumentId`.

## Minimal restoration

1. `lib/contract-model/compiler/operative-authority/retrieval-source.ts`
2. Export from `operative-authority/index.ts`
3. Binding loop + `OPERATIVE_RETRIEVAL_SOURCE_BLOCKED` in `offline-package-compile.ts`
4. `tests/operative-restatement-authority/retrieval-source-binding.test.ts`
5. Agent #11 Round 2 harness wires the same bind before context probes (measure acceptance)

## Invariants preserved

- PROVISIONAL / null governingDocumentId → no silent remap  
- Caveated CONFIRMED_OPERATIVE_WITH_CAVEATS usable for retrieval; production elevation gated separately  
- Retrieval success ≠ production authority  

## AutoNation

Frozen legal-ref hash unchanged (`393facc4…`). Context SUFFICIENT remains **0/10** after binding — **no improvement claimed**. Binding fields recorded per clause in `10-clause-coverage.json`.
