# Failure register

| ID | Severity | Description | Evidence |
|---|---|---|---|
| F001 | High | No verified executable IR from deterministic-only path | All units `executableAuthority: REFUSED`; supportStatus PARTIAL |
| F002 | High | Capacity numerical claims unavailable | `REFUSED_NO_VEP` on both packages |
| F003 | Medium | MHK structural parse yields 0 nodes | `stages.structural.nodeCount: 0`; Pass A empty; coverage regions 0 |
| F004 | Medium | Unresolved context keeps units PARTIAL even when catalog structure is SUPPORTED_STRUCTURE | Unit support breakdown PARTIAL=100% |
| F005 | Low | Prohibition-candidate nearest-heading attribution still noisy on some non-primary matches | Catalog-level §10.4/§10.5 refs correct; some candidate descriptions mis-point |
| F006 | Medium | Formula types (greater-of, % TCA, difference-between) preserved as excerpts only — not modeled executable | Caps arrays + debtLienLinks; no false modeled formulas |
| F007 | Low | Indenture Pass A noise inflates MTN candidate count | 212 MTN units vs 33 catalog clauses |

None of these produced unsupported affirmative permissions.
