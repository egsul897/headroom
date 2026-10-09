# Workstream 1 — Lifecycle blockers (KnowledgeSource → Permission)

## Lifecycle (actual)

```
KnowledgeSource.metadata.covenantSummary (DISCOVERED)
  → counsel ACCEPT/EDIT → compileAcceptedInterpretation → Permission (UNVERIFIED, LEGACY_ENGINE)
  → (separate) ExtractionCandidate → human review → promoteCompanyCandidates → Permission
  → (separate) AnalysisRun → SemanticTruthRecord (trust-gated)
  → (separate) Phase3 CERTIFIED → Phase4 VEP capacity
```

**There is no automatic path from the ~30k summary items into SemanticTruthRecord or CERTIFIED KF edges.** That is intentional (epistemic wall), not a bug.

## Where the 30,051 summaries stop

| Stage | Status of bulk corpus |
|---|---|
| Acquire / register | Present (730 KS) |
| Discover candidates / summarize | Present (`promotedToLegalTruth: 0`) |
| Bind `companyId` + `documentId` | Mostly missing on public rows |
| Human counsel ACCEPT | Not run at scale |
| Compile MODELED Permission | Only via counsel or onboarding promotion |
| VERIFIED review | Orthogonal human gate |
| CERTIFIED / SemanticTruth | Separate Phase 3 pipeline — currently empty |

## Blocker classes

| Class | Root cause | Smallest safe advance |
|---|---|---|
| A. Epistemic wall | Discovery ≠ legal truth | Keep; do not bulk-certify |
| B. Summary cap | 120 items/doc | Raise only with quality metrics |
| C. Missing binding | `companyId`/`documentId` null | Bind on customer upload (already in analyze-upload) |
| D. No cross-pipeline adapter | Summaries ≠ ExtractionCandidate | Optional PENDING candidate bridge after counsel |
| E. Formula parse fail-closed | Unparseable → KNOWN_NOT_MODELED | Improve parsers (extraction PR #225) |
| F. Package seal | CERTIFIED package needs sealed population | Per-candidate CERTIFIED → Phase4 adapter only |
| G. Analysis ≠ truth | AnalysisRun can complete with 0 STR | Persist IR units; verification separate |

## Demonstrated activation (this cycle)

Neon CONMED §7.2 greater-of $50M / 3% CTA summary → counsel formula parse → capacity **$84M** (synthetic assets) → simulate $50M clear / $200M blocked → refuse without totalAssets → ephemeral counsel compile mints MODELED Permission (UNVERIFIED).

See `neon-activation-e2e-proof.json`.
