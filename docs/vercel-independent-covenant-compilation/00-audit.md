# Phase 1 audit — Vercel-independent covenant compilation

**Controlling North Star:** `docs/headroom-north-star-v2.md` (accepted 2026-10-06).  
**Historical North Star (superseded for product direction):** `docs/HEADROOM-NORTH-STAR.md`.  
**Invariants:** `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md` (37 remain in force).

## Vercel AI Gateway dependencies (measured)

| Location | Role |
| --- | --- |
| `lib/contract-model/compiler/semantic/caller.ts` `getSemanticCaller()` | Prefers `AI_GATEWAY_API_KEY` → `vercel-ai-gateway` |
| `lib/contract-model/analyzer/anthropic-analyzer.ts` | `AI_GATEWAY_BASE_URL = https://ai-gateway.vercel.sh` |
| `lib/contract-model/analyzer/get-analyzer-provider.ts` | Gateway-first analyzer selection |
| `lib/extraction/vercel-ai-gateway-provider.ts` | Extraction transport |
| `lib/extraction/get-provider.ts` | Gateway-first extraction selection |
| `lib/contract-model/evaluation-v2/live-judge.ts` | Live judge via gateway |
| Multiple `scripts/phase-3-*.ts` | Paid validation runners |

Existing certified path is **preserved**. This work adds a parallel provider-independent inference layer; it does not rewrite `RealSemanticCaller`.

## Semantic compiler model interface (reuse)

- `SemanticCaller` / `SemanticCallerResult` in `caller.ts`
- `compileCovenantToIR(input, { caller })` accepts injected callers
- Wire schema: `SubmitCompilationSchema` in `wire-schema.ts`
- Versions: `SEMANTIC_COMPILER_ALGORITHM_VERSION` v11 (do not casually bump)

New bridge: `BridgedSemanticCaller` implements `SemanticCaller` over deterministic / Ollama / vLLM / replay / authorized-direct adapters.

## Reusable substrate (do not rewrite)

- Structural index: `lib/contract-model/compiler/structural-index.ts`
- Discovery: `lib/contract-model/compiler/discovery/`
- Package graph: `lib/contract-model/compiler/package-graph/`
- Amendment / operative state: `lib/contract-model/compiler/amendment/`
- Context retrieval: `lib/contract-model/compiler/context-retrieval/`
- Required dependency closure: `lib/contract-model/compiler/semantic/required-dependencies.ts`
- Verified units: `lib/contract-model/verified-units.ts` (never auto-label model output verified)
- Candidate assembly: `lib/contract-model/covenant-map/candidate-input.ts`
- Pilot file evidence persist: `scripts/p3-conmed-pilot/evidence.ts`

### Recommended reuse spine (confirmed by substrate audit)

```
parseDocumentStructure → defs/refs → buildStructuralIndex
  → runDiscoveryPipeline (or sealed candidates)
  → buildPackageGraph → runAmendmentPipeline / computeOperativeContractState
  → buildCovenantContextBundle → assembleCompilerInput
  → compileCovenantToIR({ caller: BridgedSemanticCaller | RealSemanticCaller })
  → verifyCompiledCandidate → buildVerifiedUnitPackage
  → file or Prisma persist
```

The vercel-independent layer injects at the `SemanticCaller` boundary and adds
deterministic inventory / selective planning / knowledge store around that spine.
It does **not** replace Phase 2A–2G or the certified tool-loop caller.

### IPV failure-mode IDs

`IPV-16` … `IPV-22` **do not exist** as pre-existing repo defect IDs (confirmed
repo-wide search). Closest historical ID systems: `P0-*`/`P1-*`, `P3-DEFECT-*`,
`BLOCKER-*`, `F-*`. The model-comparison harness introduces IPV-* labels as
**harness-local** independent-verification protocol tags for this workstream only;
they are not Claude-owned acceptance fixtures and do not rewrite historical ledgers.

Engineering defect ledgers to feed (existing):  
`docs/phase-3f1-6-final-foundation-certification/01-historical-defect-ledger.json`,  
`docs/phase-3-closure/03-defect-closure-ledger.json`, plus this workstream’s  
`docs/vercel-independent-covenant-compilation/engineering-ledger.json`.

## Certification gates

Do not merge PRs that advance certification, rewrite evidence, or modify Claude-owned acceptance fixtures. Paid calls require explicit founder authorization (`HEADROOM_FOUNDER_PAID_INFERENCE_AUTH` + policy flags).
