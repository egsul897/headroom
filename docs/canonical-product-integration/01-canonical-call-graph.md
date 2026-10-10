# Canonical Dependency & Execution Call Graph

```
Position / Ask / Simulate
  └─ toProductExecutionHandoff / toAllProductExecutionHandoffs
       └─ executeUnifiedVerifiedTransaction   (#285; async)
            ├─ evaluateOperativeSourceAuthority
            │    ├─ #274 OperativeAuthorityClassification / operativeAuthorityFromProvision
            │    └─ #283 operativeAuthorityFromGoverningProvision
            │         └─ evaluateProductionAuthorityPromotion
            │              (CONFIRMED_OPERATIVE_WITH_CAVEATS / unproven CP → refuse production)
            ├─ authorizeDecision (#282)
            │    ├─ isVerifiedServerPrincipal / refuseClientInjectedIdentity
            │    ├─ companyScope tenant check
            │    ├─ discrete permissions
            │    └─ mintTrustedIssuerAuthorizationContext (production mint refuses while BLOCKED)
            ├─ validateFinancialEvidenceBundle (#273/#279 adapter)
            │    └─ feed: normalizeFinancialStatementEvidence (#290)
            ├─ evaluateUtilizationAuthorityGate (#268/#279)
            │    └─ feed: reconstructUtilizationEvidence → utilizationRecords (#290)
            │         UNKNOWN_HISTORICAL_ACTIVITY ≠ zero
            ├─ authorizeCompletenessIssuer (#268/#279 trusted-issuer host)
            ├─ evaluateVerifiedCapacity(... REQUIRE)   [canonical; no new solver]
            └─ simulateVerifiedTransaction(... REQUIRE)
                 └─ classifyProductionAuthority
                      (HYPOTHETICAL_ONLY | PRODUCTION_AUTHORITY_BLOCKED
                       until real IdP + complete evidence)

Recursive legal context (#287) — compiler path (not a second capacity engine):
  buildCovenantContextBundle
    → resolveCanonicalBodyAnchor
    → retrieveDefinitionsRecursive
    → buildContextCompletenessManifest
    (REVIEW_REQUIRED never silently → SUFFICIENT)

Package identity (#274, evidence #291):
  groupPackageIntoInstruments → persistPackageGraph
    (confirmed membership only; provisional isolated; EVAL DB disposed)
```

**Invariant:** one verified transaction pathway. Fixture IR / synthetic utilization / caller-stipulated financials remain hypothetical. No production activation without verified evidence + required authorization + real IdP.
