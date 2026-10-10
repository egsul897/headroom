# Phase 1 — Trace the missing bridge

## Existing production interfaces

| Component | Location | Status before PP002 |
|---|---|---|
| Structural index | `compiler/stage-structure`, `structural-index`, `structural-definitions`, `structural-references` | Exists; works on MTN EDGAR text |
| Covenant discovery | `discovery/pipeline`, `pass-a-signals` | Exists; Pass A deterministic; Pass B needs paid LLM |
| Definition resolution / context | `context-retrieval/pipeline`, `candidate-span` | Exists; builds bundles from candidates |
| Covenant IR compiler | `local-semantic/compile-local`, `semantic/package-compile`, deterministic extraction | Exists; DETERMINISTIC_ONLY path; verified IR requires VEP |
| Independent coverage auditor | `coverage-audit/pipeline` | Exists; consumes candidates + bundles |
| Verification / VEP | `verified-execution`, semantic verification | Exists; REQUIRE refuse when incomplete |
| Capacity evaluator | `evaluateVerifiedCapacity` | Exists; needs verified package + inputs |

## Disconnected interfaces (the actual missing bridge)

1. **Discovery → basket granularity.** Pass A / synthetic Pass B surface section-level or family-level candidates. Operative baskets often live in lettered `Permitted *` definitions or in `except:` / `other than the following:` section catalogs. Those catalogs were not emitted as first-class candidates with clause spans.
2. **Definition body → clause units.** Structural definitions detect terms, but do not split lettered exception catalogs into individually reviewable units with provenance.
3. **Cross-permission dependencies.** Debt↔lien clause links (`clause (l) of the definition of Permitted Debt`, `Section 7.03(g)`) were not extracted as structured dependencies.
4. **Compile entry point.** No single offline, Neon-free entry point wired structure → graph → amendment → discovery → catalogs → context → local compile → coverage → capacity refuse.
5. **Support-status discipline.** No consistent SUPPORTED / PARTIAL / AMBIGUOUS / UNSUPPORTED / REFUSED_EXECUTABLE labeling at unit level for fail-closed handoff.

## Semantics genuinely unsupported (not a wiring gap)

- Greater-of / difference-between facility formulas as **executable** IR without verified definition resolution + utilization
- Ratio tests as executable constraints without financial inputs
- Cross-document amendment supersession when package graph relationships are empty
- EDGAR extracts with zero structural nodes (MHK heading style) for Pass A / coverage regions

## Minimal integration design (reuse, no parallel compiler)

```
frozen package texts
  → parseDocumentStructure + structural definitions/refs + StructuralIndex
  → buildPackageGraph + amendment/operative state
  → Pass A (+ optional Pass B if authorized)
  → discoverDefinitionExceptionCatalogs   [NEW bridge]
  → discoverSectionExceptionCatalogs      [NEW bridge]
  → discoverProhibitionToPermittedLinks   [NEW bridge]
  → merge eligible candidates
  → buildCovenantContextBundle per candidate
  → runIndependentCoverageAudit
  → extractDeterministicCovenantFacts + compileLocalSemanticUnit (DETERMINISTIC_ONLY)
  → emit CompileUnitRepresentation (executableAuthority: REFUSED)
  → evaluateVerifiedCapacity only if verified executable units exist (else REFUSED_NO_VEP)
```

Entry point: `compileFrozenDebtPackage` in `lib/contract-model/analysis/offline-package-compile.ts`.

No second IR compiler. Catalog discovery feeds the existing candidate / context / local-semantic / coverage / VEP chain.
