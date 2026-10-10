# Wrong-document production promotion guard

**Canonical tip (fix):** 
**Agent #11 retest SHA:** 
**Verdict target:** `OPERATIVE_INTEGRATION_SAFETY_VERIFIED`

## Binding status

Already landed in `66d00a97` (selective restore from #283):

- `retrieval-source.ts`
- index export
- offline-compile binder wiring
- `retrieval-source-binding.test.ts`

No duplication.

## Wrong-document root cause

When restatement authorities were `REVIEW_REQUIRED` with **null** `predecessorDocumentId` (named prior out of package), governing-provision skipped them (`predecessorDocumentId && …`). Base `doc-a` then became `CONFIRMED_OPERATIVE` and `summarizeBundleProductionAuthority` reported `allProvisionsProductionActive=true` — Agent #11’s wrong-document diagnostic — while package-wide succession remained unresolved and expected operative was `doc-b`.

## Fix (package vs provision semantics)

1. Competing in-family `REVIEW_REQUIRED` successors dated on/before as-of block unconditional base promotion **even when predecessorDocumentId is null**.
2. Downgrade mis-promoted `CONFIRMED_OPERATIVE` → `REVIEW_REQUIRED` with `governingDocumentId=null` + caveats `PACKAGE_RESTATEMENT_SUCCESSION_UNRESOLVED` / `LOCAL_BASE_CANDIDATE_NOT_PACKAGE_OPERATIVE:<id>`.
3. Bundle summary belt-and-suspenders: unresolved package restatements with no `OPERATIVE_AUTHORITY_CONFIRMED` refuse `allProvisionsProductionActive`.

Local base candidacy may be disclosed via caveat; it is **not** package-wide operative production authority.

## AutoNation evidence gap (preserved)

- Fifth A&R references Fourth A&R dated July 18, 2023.
- Sealed package: Third + Fifth only.
- No invented predecessor, RESTATES edge, or CP satisfaction.
- Restatement authorities remain `REVIEW_REQUIRED` / `predecessorDocumentId=null`.
- Operative-document accuracy may remain **0/1**; wrong-document diagnostic must be **false**.

## Regression

`tests/operative-restatement-authority/wrong-document-production-guard.test.ts`
