# Local / open-weight semantic experiment plan (WS-VIC)

**Status:** RUNTIME UNAVAILABLE in this environment — plan only.  
**Do not claim semantic model accuracy without a measured run.**

## Constraints

- No Vercel AI Gateway.
- No paid infrastructure / large weight downloads without founder authorization.
- No contamination of WS-CKB held-out benchmark (#145).

## When a runtime becomes available

1. Install Ollama (or vLLM) on the worker; pull only an explicitly authorized model id.
2. Export:
   ```bash
   export HEADROOM_INFERENCE_MODE=OLLAMA_LOCAL
   export OLLAMA_BASE_URL=http://127.0.0.1:11434
   export OLLAMA_MODEL=<authorized-model>
   ```
3. Seed units: Pass A candidates from `06-phase2-authentic-corpus-report.json` (CONMED Article VII / Chewy negative covenants preferred).
4. Compare four labeled arms on the **same** seeds:
   - `DETERMINISTIC_ONLY` (baseline — measured this session)
   - `OLLAMA_LOCAL` / `VLLM_LOCAL` (if runtime present)
   - `OFFLINE_REPLAY` (recorded outputs only)
   - Historical gateway fixtures (label **HISTORICAL**, never current VIC accuracy)
5. First-class safety metric: **false-permission rate** on held-out probes (threshold-as-permission, shall-not without permit).
6. Persist via `VicRunStore` with `verificationStatus=UNVERIFIED`; never auto-verify.

## Measured this session

- Deterministic-only false-permission probes: **0** false permissions (no rules emitted).
- Ollama/vLLM: transport unavailable (`fetch failed` / not installed).
