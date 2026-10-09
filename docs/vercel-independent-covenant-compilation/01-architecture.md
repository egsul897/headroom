# Provider-independent covenant compilation architecture

## Goal

Process real debt documents into a source-backed covenant knowledge database **without** requiring Vercel AI Gateway, with minimal paid inference and no reduction in legal correctness posture.

## Layers

```
REAL DOCUMENTS / FIXTURES
  → DETERMINISTIC EXTRACTION (facts ≠ hypotheses)
  → SELECTIVE COMPILATION PLANNER (dependency closure, not top-k)
  → INFERENCE ADAPTERS (deterministic | ollama | vllm | replay | authorized direct)
  → LOCAL SEMANTIC COMPILER (strict schema, always UNVERIFIED)
  → COVENANT KNOWLEDGE STORE (content-addressed; no auto-verify)
  → ADVERSARIAL QUALITY + ENGINEERING LEDGER
```

## Inference modes

| Mode | Network | Cost | Notes |
| --- | --- | --- | --- |
| `DETERMINISTIC_ONLY` | no | $0 | Default; no invented permission |
| `OLLAMA_LOCAL` | localhost | $0 metered | Requires Ollama |
| `VLLM_LOCAL` | localhost | $0 metered | Requires vLLM |
| `OFFLINE_REPLAY` | no | $0 | Recorded outputs only |
| `DIRECT_PROVIDER` | yes | paid | **Blocked** without founder authorization |

## Safety rules preserved

- Never infer permission solely from a numerical threshold.
- Never infer operative authority solely from structural recognition.
- Never label model-generated output as independently verified.
- Do not reuse semantic interpretations across different operative contexts without equivalence.
- Do not use naive top-k retrieval as legal dependency closure.

## CLI

```bash
# Measured corpus checkpoint + deterministic vertical slice (zero paid)
npx tsx scripts/vercel-independent-compilation/measure-corpus-and-run-deterministic.ts

# Phase 2A authentic corpus (Pass A + VicRunStore)
npx tsx scripts/vercel-independent-compilation/run-phase2a-authentic-corpus.ts

# Focused tests
npx vitest run tests/contract-model/inference tests/contract-model/deterministic-extraction tests/contract-model/selective-compilation tests/contract-model/local-semantic tests/vercel-independent-compilation
```

## Bulk data

`covenant-knowledge-data/`, `.ollama/`, `.vllm/`, `*.gguf` are gitignored. Model weights stay out of Git.

## Ownership

See `05-integration-contract.md`. Compile-run persistence is `lib/contract-model/compiler/inference/run-store` (not WS-CKF corpus DB). C-DUP-KF cleared.
