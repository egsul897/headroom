# Legal intelligence acceptance — measured results

Branch: `cursor/phase3-ipv04-amended-default-f673`  
Acceptance SHA dir: `a3c6816922a7`

## Measured accuracy (product-acceptance run-all)

| Cohort | Checks pass | Findings | CRITICAL_FALSE_PERMISSION | WRONG_OPERATIVE_SOURCE |
|--------|-------------|----------|---------------------------|------------------------|
| Development (13 pkgs) | **615/670** | 38 | **0/670** | 2 |
| Unseen (`pkg-h-unseen-composition`) | **65/71** | 5 | **0/71** | 0 |
| Combined | **680/741** | 43 | **0/741** | 2 |

### Prior baseline (same harness)

| Run | Pass | CFP | WOS |
|-----|------|-----|-----|
| `731f34e2f9ae` | 577/657 | 4 | 11 |
| `97b245747f0b` | 678/742 | 0 | 2 |
| **this run** | **680/741** | **0** | **2** |

## Defect register (gates)

**CLOSED** (acceptance signatures observed passing): IPV-01, IPV-02, IPV-03, **IPV-04**, IPV-05, IPV-09, IPV-10, IPV-20, IPV-22 (plus pre-existing IPV-17).

**OPEN (priority remainders):**

| ID | Severity | Remaining acceptance signatures |
|----|----------|----------------------------------|
| IPV-15 | NONMATERIAL_OMISSION | `certification:credit-agreement::7.08` (builder shared-cap representation) |
| IPV-16 | EVIDENCE_INCOMPLETE | M side-letter fail-closed withhold / override text derivation |
| IPV-19 | WRONG_OPERATIVE_SOURCE / MISSING_REQUIRED_COVENANT | residual definition-amendment section 1.01 / some cert REVIEW |

## Package C (IPV-04 target)

`pkg-c-amendment-supersession`: **50/51 pass, 0 fail** (1 not tested).  
Section `credit-agreement::7.01` and clause `7.01(b)@clause` both **CERTIFIED** on the faithful submission.
