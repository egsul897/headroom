# Legal intelligence acceptance — measured results

Branch: `cursor/covenant-retrieval-legal-excellence-8de2`  
Acceptance SHA dir: `ddb118c23d85` (tip follow-up `ecc3d1f9` is certified-path statedReferences audit only; product-acceptance outcomes unchanged)

## Measured accuracy (product-acceptance run-all)

| Cohort | Checks pass | Findings | CRITICAL_FALSE_PERMISSION | WRONG_OPERATIVE_SOURCE |
|--------|-------------|----------|---------------------------|------------------------|
| Development (13 pkgs) | **617/670** | 36 | **0** | 2 |
| Unseen (`pkg-h-unseen-composition`) | **66/71** | 4 | **0** | 0 |
| Combined | **683/741** | 40 | **0/741** | **2** |

Findings by severity: MATERIAL_CONDITION_OMISSION 4, NONMATERIAL_OMISSION 23, UNSUPPORTED_AS_COMPLETE 1, MISSING_REQUIRED_COVENANT 2, SOURCE_PROVENANCE_FAILURE 6, WRONG_OPERATIVE_SOURCE 2, EVIDENCE_INCOMPLETE 2.

### Prior baseline

| Run | Pass | CFP | WOS |
|-----|------|-----|-----|
| `731f34e2f9ae` | 577/657 | 4 | 11 |
| `ff6c5ace0b36` | 678/742 | 0 | 2 |
| **this run** | **683/741** | **0** | **2** |

Unseen package is evaluated separately from development packages.

## Defect register (gates)

**CLOSED** this pass: IPV-15, IPV-19 (plus prior IPV-01/02/03/05/09/10/17/20/22).

**OPEN priority remainders:**

| ID | Severity | Remaining |
|----|----------|-----------|
| IPV-04 | NONMATERIAL_OMISSION | `certification:credit-agreement::7.01` section-level REVIEW (fail-closed); context Default retrieval **PASS** |
| IPV-16 | EVIDENCE_INCOMPLETE | M side-letter fail-closed withhold; $15m override text not derived (by design of unclassified-override detector) |

## Root-cause groups closed this pass

1. **IPV-04 context** — definition scan used base node text; now uses amendment-aware OPERATIVE_SOURCE excerpt.
2. **IPV-15** — dependsOn to sibling named only in Available Amount was MODEL_INVENTED; fidelity v3 admits retrieved-definition section refs; J `certification:…::7.08` **CERTIFIED**.
3. **IPV-19** — definition restatement capture stripped leading quote → ownership/`"Term" means` failed; quote preserved; H/I/M `semantic:…::1.01` **PASS**.

## IPV-16 posture

Unclassified side-letter override stays REVIEW_REQUIRED without inventing a dollar amount (unit-tested). Incomplete/ambiguous override cannot become executable contractual authority. Remaining SUPERSEDED/$15m expectation is intentional fail-closed evidence gap, not a critical false permission.

## Certified path

`npm run test:phase3-certification`: **481/481** pass @ `ecc3d1f9`.

## Caution

Do not claim full legal accuracy from a zero-error sample. Remaining failures include structure/enumeration gaps, junior-debt family (IPV-18), adversarial mock-silent-reviewer cases (IPV-24), and fail-closed CERT REVIEW rows.
