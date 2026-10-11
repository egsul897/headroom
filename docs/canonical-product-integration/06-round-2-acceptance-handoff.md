# Round 2 Independent Acceptance Handoff

**For:** a separate independent acceptance agent (Agent #11 lineage)  
**Do not alter:** frozen Round 1 results on PR **#286**  
**Sealed legal-reference hash (preserve):**  
`393facc432182df08dae690e3fc0e751a4c3a410b71c0e7b93a54122915fa1bd`

## Round 1 baseline (AutoNation) — do not rewrite

| Metric | Value |
| --- | --- |
| Structural recall | 10/10 |
| Operative-document accuracy | 0/1 |
| Context SUFFICIENT | 1/10 |
| Verified executable IR | 0/10 |
| Financial evidence completeness | 0/1 |
| Correct refusal | 5/5 |
| False favorables | 0/12 |

## Integrated pipeline the acceptance agent should exercise

Branch tip: `cursor/canonical-product-integration-5a28` (or merged main once human-approved).

```
1. Ingest / load package documents (offline fixtures OK)
2. #274 instrument identity + #283 operative restatement authority
3. #287 recursive legal context (body anchors + definition closure + manifest)
4. Compile / bind verified executable units only when artifacts exist
5. #290 normalize financial statement evidence + reconstruct utilization
6. #282 authorizeDecision (expect BLOCKED / refuse without real IdP)
7. #285 executeUnifiedVerifiedTransaction
8. Compare Position / Ask / Simulate handoffs for identical productionAuthority
```

## Scoring rules for Round 2

- Do **not** count hypothetical `EXECUTED_HYPOTHETICAL` as production readiness.
- Do **not** count correct refusal as affirmative covenant execution.
- Do **not** manipulate acceptance fixtures or sealed hashes.
- Do **not** lower `#287` sufficiency thresholds to improve scores.
- Production authority must remain non-ACTIVE without real IdP + complete evidence.

## Reproduction anchors on this integration tip

- Call graph: `docs/canonical-product-integration/01-canonical-call-graph.md`
- Example hypothetical trace: `docs/canonical-product-integration/03-example-transaction-trace.json`
- Production refusal expectations: `docs/canonical-product-integration/04-production-authority-refusal-trace.json`
- Entrypoint: `lib/product/verified-transaction-execution/execute.ts`
