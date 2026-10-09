# Legal intelligence acceptance — measured results

Branch: `cursor/covenant-retrieval-legal-excellence-8de2`  
Acceptance SHA dir: `97b245747f0b` (pre-commit tip; final commit SHA follows push)

## Measured accuracy (product-acceptance run-all)

| Cohort | Checks pass | Findings | CRITICAL_FALSE_PERMISSION | WRONG_OPERATIVE_SOURCE | Dangerous* |
|--------|-------------|----------|---------------------------|------------------------|------------|
| Development (13 pkgs) | **613/671** | 41 | **0/671** | 2 | 13/671 |
| Unseen (`pkg-h-unseen-composition`) | **65/71** | 5 | **0/71** | 0 | 4/71 |
| Combined | **678/742** | 46 | **0/742** | 2 | 17/742 |

\*Dangerous = CFP + WOS + MATERIAL_CONDITION_OMISSION + SOURCE_PROVENANCE_FAILURE + MISSING_REQUIRED_COVENANT.

### Prior baseline (same harness, earlier SHAs)

| Run | Pass | CFP | WOS |
|-----|------|-----|-----|
| `731f34e2f9ae` | 577/657 | 4 | 11 |
| `f182a679394b` | 539/604 | 3 | 4 |
| **this run** | **678/742** | **0** | **2** |

Measured improvement (not a target): CFP **4→0** and WOS **11→2** vs `731f34e2f9ae` on a larger check set.

Unseen package is evaluated separately from development packages; it is never counted as both training/dev evidence and independent validation in the table above.

## Defect register (gates)

**CLOSED** (acceptance signatures observed passing): IPV-01, IPV-02, IPV-03, IPV-05, IPV-09, IPV-10, IPV-20, IPV-22 (plus pre-existing IPV-17).

**OPEN (priority remainders):**

| ID | Severity now | Remaining acceptance signatures |
|----|--------------|----------------------------------|
| IPV-04 | NONMATERIAL_OMISSION | `context:C-7.01(b)-amended:definitions`; `certification:credit-agreement::7.01` (operative-text CA+indenture **pass**) |
| IPV-15 | NONMATERIAL_OMISSION | `certification:credit-agreement::7.08` (builder shared-cap representation) |
| IPV-16 | EVIDENCE_INCOMPLETE | M side-letter fail-closed withhold (no longer CRITICAL_FALSE_PERMISSION) |
| IPV-19 | WRONG_OPERATIVE_SOURCE | residual `semantic:…::1.01` / some cert REVIEW after definition-targeting wins |

## Customer Ask path

`answerFromCorpus` invokes `runLegalExcellence` → complete retrieval + independent adversarial verification + certification bridge. Incomplete retrieval or rejected interpretation cannot enable Phase 4 executable capacity (`usableByPhase4* = false`; gate text appended to Ask detail).

## Certified path

`npm run test:phase3-certification`: **481/481** pass.
