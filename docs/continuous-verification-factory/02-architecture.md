# CVF Architecture (substrate)

See `00-first-return.md` §3.

**Principle:** compose, do not compete.

```
Case registry (metadata + GT provenance)
        │
        ▼
   runHarness(tier)
        │
        ├── adapter: cross-document  → evaluateCrossDocumentTransaction / authentic runners
        ├── adapter: capacity-a8     → capacity status floor (state.ts)
        ├── adapter: sequential      → buildConmedSequentialDemo
        └── adapter: metamorphic     → invariant mutations over same evaluator
        │
        ▼
   CaseExecutionResult[] → aggregateMetrics (denominators required)
```

Certification remains exclusively on the Phase-3 / verified-execution path.
