# Phase 3 certification closure

Starting commit `9d2e5b46e21033e7339c47844efe746f89a794b1`. Zero paid calls: every suite below runs with scripted provider
clients; no credential is read by the certified path and none is present in the test process.

## What changed

**Certification is a dimension separate from the map outcome.** `lib/contract-model/phase3-certification/` is new
production code:

- `types.ts` - `Phase3CertificationStatus = CERTIFIED | REVIEW_REQUIRED | NOT_CERTIFIED`, `CandidateCertification`
  (status, structured blockers with BLOCKING/REVIEW severity, warnings, both identity strengths, operative and
  semantic source versions, artifact package hash, snapshot hash, per-unit artifact hashes),
  `Phase3PackageCertification = CERTIFIED | PARTIAL | REVIEW_REQUIRED | FAILED`, `DiscoveryPopulationIdentity`,
  the manifest schema `p3-package-certification-manifest.v1`.
- `certify.ts` - `certifyCandidate(...)`, THE one pure decision. BLOCKING blockers (NOT_CERTIFIED): not anchored,
  not compiled / compile FAILED, no units, operative identity WEAK, semantic contract WEAK or absent, duplicate unit
  id, verification missing / not completed, inventory missing, snapshot missing, package incomplete, artifact
  identity or content mismatch, WEAK persisted identity. REVIEW blockers (REVIEW_REQUIRED): compile not COMPLETED,
  operative state unresolved, context contract not SUFFICIENT / HIGH unresolved dependency, unit sufficiency not
  COMPLETE, lineage disagreement, invalid dependency, verification not clean, non-canonical finding owner, open
  MATERIAL/UNCERTAIN finding, unaccounted material source, ungrounded support.
- `semantic-source-contract.ts` - `sscv1` (see below).
- `discovery-population.ts` - `computeCandidatePopulationHash` (`cph1`), `sealDiscoveryPopulation` (`sdi1`, what Phase 2
  does), `unsealedPopulation` (benchmark subsets).
- `package-certification.ts` - `certifyPackage` and `buildPackageCertificationManifest`.
- `phase4-adapter.ts` - `certifiedMapToVerifiedExecutionPackage(...)`: consumes CERTIFIED certification records and
  their persisted verified-unit packages only (hash-checked); refuses non-certified, tampered, mismatched, mixed or
  dangling input. It never reads a map node or raw compiler output.

**The canonical path** (`covenant-map/pipeline.ts`, `canonical-compiler-path.v2`) now runs per candidate:
build input -> compile -> compute the semantic source contract and STAMP `sourceContentVersion` (= sscv1),
`compilerVersion`, `irSchemaVersion` on every rule, definition and shared capacity -> `snapshotUnitsForVerification`
(deep-frozen copies) -> verify -> `buildVerifiedUnitPackage` (snapshot + verification, drift-checked against the units
in hand) -> `certifyCandidate`. `CandidateMapResult` carries `semanticSourceContract`, `snapshot`, `verifiedPackage`,
`certification`. The package entry point is `certifyDiscoveredCovenantPackage(...)` (`compileCovenantMap` is a
retained alias); its run returns `certifications`, `packageCertification` and `manifest`. Package input gains
`discoveryPopulation` (Phase 2's seal) and `runId`.

**Phase boundary.** Phase 2 owns documents -> index -> package graph -> discovery -> operative state -> candidate
population and seals it. Phase 3 receives the sealed population and certifies. No raw-document product entry point was
added: nothing needed it, and adding one would pull discovery into Phase 3.

**Shared capacity - OPTION A.** `IRSharedCapacity` carries `irSchemaVersion`, `compilerVersion`, `sourceContentVersion`;
`VerifiedUnitKind` is `RULE | DEFINITION | SHARED_CAPACITY`; the verifier inventories and reconciles shared capacities
(`ir-inventory.ts`, `numeric-assertion.ts`, `verify.ts`), finding owners resolve `ir-sharedcap:` ids and
`sharedCapacities[i]` paths (`finding-owner.ts`, `reviewer.ts`); the envelope resolver and the Phase 4 boundary bind
SHARED_CAPACITY artifacts. `p3-verified-unit-package.v2` adds `snapshotHash` and `counts.sharedCapacitiesCompiled`
and hashes CONTENT (the wall-clock keys `verifiedAt`/`createdAt` and the cache flag `fromCache` are excluded, so the
same verified content hashes the same across runs and the hash can sit inside the map). v1 packages still parse under
their own full-body rule (`tests/.../certification.test.ts` reads three run-original CONMED packages).
`toVerifiedExecutionPackage(packages)` derives rules, definitions AND shared capacities from the persisted artifacts;
the unverified `sharedCapacities` pass-through parameter is gone.

**Phase 4 boundary** (`verified-execution.ts`, runtime/ untouched): under REQUIRE a shared capacity carried without a
clean, STRONG, identity-bound SHARED_CAPACITY artifact refuses the whole package, and the artifact's own IR inventory
is the content witness - a cap figure or member set edited after verification refuses even under an unchanged
identity. Hash of `lib/contract-model/runtime/` before and after: `79707038daf39918`.

## Semantic source contract (sscv1)

`operativeSourceVersion` (scv1) binds the exact operative text, anchor and applied effects.
`semanticSourceContractVersion` (sscv1) = sha256 over {scv1, contextDependencyHash, retrievalHash, lineageHash,
asOfDate, attributionMode, bundleContentIdentity-if-broad}:

- contextDependencyHash: the RELIED-UPON bundle items - definition excerpts (document, term, excerpt sha256, evidence
  state) for every defined term the units reference, transitively through the compiled definitions' own
  dependencies; OPERATIVE_SOURCE / PARENT_SCOPE / AMENDMENT_LEAD / SUPPLEMENT_LEAD / ENTITY_SCOPE items; any section the
  units cite outside their own text.
- retrievalHash: the compiler's authenticated retrieval records (request, document, node, content hash, text origin).
- lineageHash: operative lineage (provision key, status, current document, as-of), applied effect ids, supersession state.
- never model output, verification results, cost or wall-clock.

Attribution: RELIED_UPON when every referenced term / cited section is attributable (golden 7.01 and 7.02 both are);
BROAD_BUNDLE binds the whole bundle `contentIdentity` when something could not be attributed (conservative - any
bundle change then invalidates; recorded as a certification warning); NO_BUNDLE is WEAK and never certifies.
The verifier's evidence set is bound by the artifact (`evidenceSetHash`), not by the contract, because the contract is
stamped BEFORE verification.

## Edge authority

`CovenantMapEdge.corroboratedBy` lists every derivation that established the same (type, from, to).
`edgeAuthority`: CERTIFIED_SEMANTIC (an IR_* derivation AND both endpoints CERTIFIED), REVIEW_ONLY (IR-established but
an endpoint not certified), DETERMINISTIC_STRUCTURAL (only structural ancestry / operative state), CONTEXTUAL_INFERENCE
(only a context-bundle classification). Package certification treats a REVIEW_ONLY executable edge as a REVIEW blocker
and a non-semantic executable edge as a warning Phase 4 does not act on.

## Map schema v2

`canonical-covenant-map.v2` / `covenant-map-assembly.v2`: node `operativeSourceVersion` and `certification {status,
artifactHash, semanticSourceContractVersion, blockers}`; candidate record `certificationStatus`, `certificationBlockers`,
`semanticSourceContractVersion`; completeness adds `mapComplete`, `certificationComplete`, `candidatesCertified`,
`candidatesReviewRequired`, `candidatesNotCertified`, `semanticUnits`, `semanticUnitsCertified`, `edgesByAuthority`; the
map carries `discoveryPopulation`. The derived offline maps under `maps/` were rebuilt (offline, zero paid calls); every
reconstructed node is honestly NOT_CERTIFIED (CERTIFICATION_NOT_PERFORMED) because historical evidence carries no paired
artifacts. Run-original evidence is untouched.

## Pilot scripts

`scripts/p3-conmed-pilot/evidence.ts` only decides where to write: `persistCandidate` includes shared capacities in the
drift check and records the production `certifyCandidate` decision in the evidence (`certification`). A runner that did
not stamp the identities is honestly NOT_CERTIFIED. Benchmark runners are PARTIAL_TARGET_SET callers and are never
package-certified (an unsealed population is PARTIAL by construction).

## Tests (all provider-free)

`npm run test:phase3-certification` -> 17 files, 215 tests, exit 0. New suites in `tests/contract-model/certified/`:
`certification.test.ts` (cases 1-3, exact identity, mutation after snapshot, dependency change transitive and direct,
unrelated change stability, PARTIAL_TARGET_SET / unsealed / subset, manifest, v1 readability), `edge-authority.test.ts`
(false ancestry, true exception, REVIEW_ONLY, contextual inference), `shared-capacity.test.ts` (attack $20m/$30m/$10m,
honest pool, strict-boundary regression: unverified / mutated / stale / tampered), and five architecture guards.
`golden-harness.ts` is the parametric fixture; `golden-map.test.ts` keeps the hand-authored expectation (now asserting
CERTIFIED nodes, CERTIFIED_SEMANTIC edges and a CERTIFIED package, byte-identical across runs).

Global `npx tsc --noEmit -p .` is green (the six pre-existing foundation-audit errors were fixed: duplicate `...overrides`
keys, `sectionRef` -> `normalizedSourceRef`).

## Remaining limitations

- Certification has run only over scripted fixtures; no live (paid) candidate has been certified yet. The next bounded
  action is one live 7.2(c) validation under a hard $0.25 ceiling.
- BROAD_BUNDLE attribution is conservative, not precise: a candidate citing a section the bundle does not carry binds the
  whole bundle identity.
- Historical offline maps cannot be certified retroactively (no paired artifacts in v1 evidence).
- The pilot runners do not yet route through `compileCandidateToVerifiedIR`; they persist honest NOT_CERTIFIED records.
