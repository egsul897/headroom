# Pipeline execution

## Command surface

```bash
npx tsx scripts/product-proof/run-002-compile-package.ts --manifest=<manifest> --out=<dir>
```

Implements `compileFrozenDebtPackage` (`offline-package-compile.v1`).

## Stages exercised

| Stage | Library reused | MTN | MHK |
|---|---|---|---|
| Structure | `parseDocumentStructure`, definitions/refs, `StructuralIndex` | 1595 nodes / 252 defs | 0 nodes / 368 defs |
| Package graph | `buildPackageGraph` | 4 docs; CA+indentures | 1 doc; CREDIT_AGREEMENT |
| Amendment | `runAmendmentPipeline` + operative state | 0 effects | 0 effects |
| Discovery Pass A / pipeline | `runPassADeterministicSignals`, `runDiscoveryPipeline` | 810 / 201 | 0 / 0 |
| Exception catalogs | `discoverDefinitionExceptionCatalogs` + `discoverSectionExceptionCatalogs` | Permitted Debt 16 + Permitted Liens 17 | §7.01 23 + §7.03 12 |
| Context | `buildCovenantContextBundle` | 212 bundles | 37 bundles |
| Coverage audit | `runIndependentCoverageAudit` | 3173 findings / 884 regions | 308 findings / 0 regions |
| Local semantic | `compileLocalSemanticUnit` DETERMINISTIC_ONLY | all units | all units |
| Capacity | `evaluateVerifiedCapacity` gate | REFUSED_NO_VEP | REFUSED_NO_VEP |

## Artifacts

- `artifacts/mtn-regression/{compile-summary,exception-catalogs,units,candidates}.json`
- `artifacts/mhk-holdout/{compile-summary,exception-catalogs,units,candidates}.json`
- `logs/mtn-regression-console.txt`, `logs/mhk-holdout-console.txt`
- `logs/unit-test-full.txt` (5/5 vitest pass)

## Paid inference

`paidInferenceUsed: false` on both runs. Pass B synthetic/unpaid; catalog + Pass A supply deterministic candidates.
