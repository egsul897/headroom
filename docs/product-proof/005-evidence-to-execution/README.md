# Product Proof 005 — Evidence → Execution (one family)

Shortest authentic path for **one** real covenant family after closing the #349 certification-integrity remediation mission.

## Target

| Field | Value |
|---|---|
| Package | CONMED Eighth A&R Credit Agreement |
| Family | `RESTRICTED_PAYMENTS` |
| Provision | §7.6(d) — $40M Restricted Payments / fiscal year |
| Candidate | `discovery-candidate:9e35243e01539edee04ff6a5` |

## Verdict

**EVIDENCE_TO_EXECUTION_BLOCKED**

Irreducible blocker: Phase-3 semantic verification is not clean (`MATERIAL_DISCREPANCY` / `WRONG_ENTITY_SCOPE` + compile accountability). Soft gate forbids paid re-verify; no offline-clean CERTIFIED packet exists for this leaf.

## Reproduce

```bash
npx tsx scripts/product/run-evidence-to-execution-76d.ts
npx vitest run tests/product/evidence-to-execution-76d.test.ts tests/product/authenticated-vep-offline.test.ts
```

## Why this leaf (not §7.2(c), not Matthews)

- §7.2(c) already has CERTIFIED + DERIVED VEP on main, but path is **UNSUPPORTED** (cross-rule) — architectural wall, not shortest completable eligible path.
- Matthews (1)(a) has VE GROSS only — zero Phase-3 CERTIFIED package.
- §7.6(d) has authentic text + fixed-dollar IR with **empty conditions** (no `OTHER_RULE_SATISFIED`) — once CERTIFIED, current `enumerateCertifiedPaths` can yield `CANDIDATE`.

## Deliverables

| File | Contents |
|---|---|
| `00-349-closure.md` | Close certification-integrity remediation (#349) |
| `01-inventory.md` | Repo vs external evidence |
| `02-plan.md` | Dependency-ordered VU → VEP → path → capacity → simulate |
| `03-blocker.md` | Exact irreducible blocker |
| `11-final-verdict.md` | Customer capabilities demonstrated |
| `artifacts/` | Machine-readable evaluation |
