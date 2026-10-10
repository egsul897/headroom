# Wrong-document production promotion guard

**Code tip (wrong-document fix):** 59c3c4b36cd31d21e1c2deeff25ef0fb1f4cfab3  
**Corrected tip (adversarial fixture + authority closure):** 60dbdeeeb1e067e1823972f2ea79ea5f3ba19f72  
**Agent #11 retest SHA:** 60dbdeeeb1e067e1823972f2ea79ea5f3ba19f72  
**Branch tip (artifacts/docs):** see `git rev-parse origin/cursor/canonical-product-integration-5a28`  
**Verdict target:** OPERATIVE_INTEGRATION_SAFETY_VERIFIED

## Binding status

Already landed in 74526ead (selective restore from #283):

- retrieval-source.ts
- index export
- offline-compile binder wiring
- retrieval-source-binding.test.ts

No duplication.

## Wrong-document root cause

When restatement authorities were REVIEW_REQUIRED with null predecessorDocumentId (named prior out of package), governing-provision skipped them (predecessorDocumentId && ...). Base doc-a then became CONFIRMED_OPERATIVE and summarizeBundleProductionAuthority reported allProvisionsProductionActive=true — Agent #11 wrong-document diagnostic — while package-wide succession remained unresolved and expected operative was doc-b.

## Fix (package vs provision semantics)

1. Competing in-family REVIEW_REQUIRED successors dated on/before as-of block unconditional base promotion even when predecessorDocumentId is null.
2. Downgrade mis-promoted CONFIRMED_OPERATIVE to REVIEW_REQUIRED with governingDocumentId=null plus caveats PACKAGE_RESTATEMENT_SUCCESSION_UNRESOLVED / LOCAL_BASE_CANDIDATE_NOT_PACKAGE_OPERATIVE.
3. Bundle summary belt-and-suspenders: unresolved package restatements with no OPERATIVE_AUTHORITY_CONFIRMED refuse allProvisionsProductionActive.

Local base candidacy may be disclosed via caveat; it is not package-wide operative production authority.

## AutoNation evidence gap (preserved)

- Fifth A&R references Fourth A&R dated July 18, 2023.
- Sealed package: Third + Fifth only.
- No invented predecessor, RESTATES edge, or CP satisfaction.
- Restatement authorities remain REVIEW_REQUIRED / predecessorDocumentId=null.
- Operative-document accuracy may remain 0/1; wrong-document diagnostic must be false.

## Live reproduction on tip (authentic AN fixtures)

- wrongDocumentProductionPromotion: false
- allProvisionsProductionActive: false (inferred: 0 CONFIRMED_OPERATIVE; all REVIEW_REQUIRED)
- provision classes: REVIEW_REQUIRED
- restatement preds: doc-a/doc-b REVIEW_REQUIRED, predecessorDocumentId null
- Offline acceptance tip SHA recorded in docs/agent-11-round-2-acceptance/

## Adversarial-gate closure

- Root cause: stale harness expected remaining=150M from APPROVED completeness without authenticity/trusted issuer.
- Classification: test/harness defect (fail-closed product behavior correct; same null on 8a4beb52/74526ead baselines).
- Fix: authentic cert + productionTrustedIssuerAuth for consistency path; incomplete-cert refusal regression.

## Regression

tests/operative-restatement-authority/wrong-document-production-guard.test.ts  
tests/product/unified-product-adversarial-gate.test.ts
