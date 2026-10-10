# Agent 2 FCE selective port onto finish-product #258

**Target PR:** https://github.com/egsul897/headroom/pull/258  
**Source:** #257 functional tip `83617642` (additive FCE only)  
**Not replaced:** `certified-simulate-bridge.ts` (byte-identical), secured debt/lien (#250/#256), demo

## Ported

- `utilization-honesty.ts` → `#237` `computeVerifiedRemaining` + fail-closed metadata
- Mint-only trusted provenance (`trusted-provenance.ts`) — look-alike user JSON flags ignored
- `authority.ts` — minted production approval channel token required for REAL
- `verified-path.ts` → `runSequentialTransactions` under REQUIRE
- FCE regression tests: authority-defaults, final-integration, gate/authentic updates

## Hardening

`mintTrustedCompletenessCertificate` / `mintTrustedProductionApprovalChannel` require `authorizedApplicationLoader: true` and attach a non-enumerable Symbol brand. Bare `trustedCompletenessProvenance: true` or `trustedProductionApprovalChannel: true` from request JSON never confers trust.
