# PAI defect closure status

**PR:** https://github.com/egsul897/headroom/pull/330  
**Production fix SHA:** `05c6ad284523c79209f60cdfca6487703026f3db`  
**Tip:** branch head after typecheck fixture align (see git)  
**Source suite tip (PR #323):** `059994b9e0788ec8029808bad78520d937e382bb`  
**Base:** `main` (includes #323 adversarial locks + production closures)

Open PRs inspected (#308–#329): none already closed these defect modules on the production paths named below. Restatement-precedence (#316/#317) and operative-source-binding (#318/#319) may touch adjacent amendment/OA surfaces — absorb on merge rather than re-implement.

| ID | Status | PR/SHA | Focused tests | Notes |
|---|---|---|---|---|
| PAI-01 | FIXED_HERE | #330 / `05c6ad28` | `document-lifecycle-stress`, `cross-phase-semantic-consistency` | `computeOperativeDocument` as-of filter |
| PAI-02 | FIXED_HERE | #330 / `05c6ad28` | same | RESOLVED-only tip edges |
| PAI-03 | FIXED_HERE | #330 / `05c6ad28` | `cross-phase-semantic-consistency` | UNKNOWN scope fail-closed in governing-provision |
| PAI-04 | FIXED_HERE | #330 / `05c6ad28` | adversarial + `capacity-state` PAI-04 case | default UNKNOWN; VERIFIED_EMPTY opt-in |
| PAI-05 | FIXED_HERE | #330 / `05c6ad28` | `tests/home/load-overview.test.ts` | headroom withheld without PRODUCTION_AUTHORITATIVE |
| PAI-06 | FIXED_HERE | #330 / `05c6ad28` | `document-lifecycle-stress` | CI as-of vs effectiveness |
| PAI-07 | FIXED_HERE | #330 / `05c6ad28` | adversarial entity omission | missing entities ≠ SATISFIED |
| PAI-08 | FIXED_HERE | #330 / `05c6ad28` | customer-workflow adversarial routes | GROSS / non-authoritative labeling |
| PAI-09 | FIXED_HERE | #330 / `05c6ad28` | `cross-phase-semantic-consistency` | missing pctEbitda → review_required |
| PAI-10 | FIXED_HERE | #330 / `05c6ad28` | (bounded production fix) | empty atlas → AMBIGUOUS |
| PAI-11 | FIXED_HERE | #330 / `05c6ad28` | (bounded production fix) | no delivery from period asOf |
| PAI-12 | FIXED_HERE | #330 / `05c6ad28` | governing-provision overlay | targetDocumentId enforced |

**CI:** pending at push of `05c6ad28` (subscribe for terminal result).  
**Local focused:** adversarial 25, capacity suites (excl. Neon authentic), verified-execution, home overview, utilization-and-remaining — green. Pre-existing: `determinism-and-generality` anti-enumeration vs greater-of-assets type import (not introduced here).
