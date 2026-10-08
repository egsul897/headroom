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

## Certification gates

Do not merge PRs that advance certification, rewrite evidence, or modify Claude-owned acceptance fixtures. Paid calls require explicit founder authorization (`HEADROOM_FOUNDER_PAID_INFERENCE_AUTH` + policy flags).
