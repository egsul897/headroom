# Workstream A — Operative-authority / calculation consistency

**Branch:** `cursor/oa-calc-consistency-a324`  
**Base tip (PR #311):** `c1246becb15a3e3ff508334ba889a759c986a28a`  
**Controlling North Star:** `docs/headroom-north-star-v2.md` §§1–8 (source-backed rulebook; fail-closed; never manufacture permissions/capacity)  
**Phase gates preserved:** Phase 2G amendment precedence; Agent #7 operative restatement authority; #306 later-unresolved successor; trusted-identity BLOCKED; no production AVAILABLE.

## Defect (verified)

PR #311 correctly separated verified succession from provision-level operative
authority (`documentsShareOperativeAuthority` / restatement as-of supersession).
Identity matching intentionally permits:

- provision `governingDocumentId` = operative successor
- compile unit `documentId` = confirmed predecessor (discovery location)

**Mismatch:** `toExecutable` then published `SOURCE_BACKED_GROSS_CONTRACTUAL` /
`MODELED_HYPOTHETICAL` amounts from the unit’s predecessor `operativeText` while
labeling the successor as `governingDocumentId`. That is an OA/calculation
inconsistency: governing document, operative text, and computed output diverge.

## Correction

| Export | Behavior |
|---|---|
| `sanitizeCapacityForGoverningAuthority` | Refuse numeric publication when discovery document ≠ governing document, or operative text empty, or PRODUCTION/REMAINING class |
| `toExecutable` | Runs sanitize before emitting capacity; appends refusal reasons to `missingDependencies` |
| `auditOperativeAuthorityCalculationConsistency` | Post-compile audit; compile throws if any mismatch escapes |
| `auditCompilationPipelineAuthorityCalculation` | Read-only pipeline surface audit (P0/P1/INFO) |

No issuer-specific branches. Historical evidence / acceptance thresholds unchanged.
Amounts never invent authority.

## Pipeline audit (similar mismatches)

| Surface | Severity | Notes |
|---|---|---|
| `operative-covenant-package` | INFO_SAFE (after fix) | Sanitize + hard throw |
| `verified-executable-compile-core` | P1_RISK | Publishes GROSS; no independent governing≠discovery remap — consumes candidate documentId as source |
| `ve-position-feed` | P1_RISK / INFO | Relies on upstream VE units; no local sanitize |
| `phase3-compile-bridge` | P1_RISK | References governingDocumentId; Matthews section hints are fixture-loader scope, not production discovery |
| `offline-package-compile` | P1_RISK | Remaps retrieval onto governingDocumentId; capacity slices still bound to discovery unit text until operative-package sanitize |

Residual P1s are **disclosed, not closed**. Downstream must consume sanitized
operative-package units or refuse cross-document amounts. No silent ignore.

## Failing-before → passing-after

Adversarial cases in `tests/product/operative-covenant-package-remediation.test.ts`
(`P0 — operative-authority / calculation consistency`):

| Case | Before | After |
|---|---|---|
| Pred discovery + succ governing publishes $50M GROSS | would permit (mismatch) | REFUSE → UNSUPPORTED, null amount |
| Same-document GROSS | permit | permit |
| Empty operative text | could publish | REFUSE |
| Modeled hypo from non-governing text | could publish | REFUSE |
| Pipeline audit escaped mismatch | undetected | mismatchCount=1 |
| Authentic Matthews/MHK compile | n/a | `operativeAuthorityCalculationMismatches=0` |

## Unresolved dangerous omissions / unsupported semantics

- No automatic fetch/compile of successor operative text when discovery is on predecessor (refuse, do not invent).
- Ratio numeric VE still unsupported.
- Production AVAILABLE / verified remaining still refused (trusted-identity BLOCKED).
- Downstream VE Position feed P1 surfaces not yet locally gated.

## Readiness

**Verdict:** `OA_CALCULATION_CONSISTENCY_GATE_LANDED` — **not** production-authority ready.  
**Blockers:** independent review; #311/#312 merge order; residual P1 downstream surfaces; Phase 3 certification gate unchanged.

## Recommended next bounded task

Propagate the same sanitize contract into `ve-position-feed` / VE core consumers
so Position cannot display GROSS when `documentId ≠ governingDocumentId`, then
independent review of PR #311 tip + this gate.
