# Severity-ranked findings

**Starting SHA:** `67027b8f499921a12cee7b9b9f04d832898b6384`  
**Production code modified:** No

Severity: **P0** = false current authority / REVIEW_REQUIRED→RESOLVED; **P1** = false remaining/AVAILABLE or gross→remaining; **P2** = incomplete→complete or assumed inputs with limited surface area.

---

## P0

### PAI-01 — Whole-document operative tip ignores as-of
- **Modules:** `lib/contract-model/compiler/amendment/chain.ts` (`computeOperativeDocument`); consumers in `operative-state.ts` document-level supersession
- **Defect:** No as-of filter; future-dated RESOLVED restatement becomes tip
- **Minimal repro:** `tests/adversarial-intelligence/cross-phase-semantic-consistency.test.ts` + lifecycle fork doc test
- **Safeguard that does NOT cover this:** Agent #7 `resolveGoverningProvision` / `authorityAsOf` (provision-level only)
- **Smallest remediation:** Add optional `asOfDate` to `computeOperativeDocument`; exclude edges with `effectiveDate > asOf` or undated when asOf supplied; plumb from `computeOperativeContractState`

### PAI-02 — REVIEW_REQUIRED restatement edges still yield `operativeDocument: RESOLVED`
- **Modules:** `chain.ts:124-195`
- **Defect:** Explicitly keeps REVIEW_REQUIRED effects that have a targetDocumentId and can return RESOLVED
- **Minimal repro:** `it.fails` “REVIEW_REQUIRED restatement effect must not yield…”
- **Contradiction:** Comments at `types.ts` / operative-state claim RESOLVED only for resolved restatements
- **Smallest remediation:** Require `effect.status === "RESOLVED"` for graph edges, or return REVIEW_REQUIRED when any edge is not RESOLVED

### PAI-03 — Confirmed UNKNOWN restatement scope → base `CONFIRMED_OPERATIVE`
- **Modules:** `lib/contract-model/compiler/operative-authority/governing-provision.ts:196-216, 375-386`
- **Defect:** UNKNOWN scope skipped; falls through to base confirmed
- **Minimal repro:** `it.fails` “UNKNOWN restatement scope must fail closed…”
- **Smallest remediation:** If any in-family confirmed authority has `restatementScope === "UNKNOWN"`, return `REVIEW_REQUIRED`

---

## P1

### PAI-04 — Phase-4C empty ledger → AVAILABLE remaining = gross
- **Modules:** `lib/contract-model/runtime/capacity/state.ts` `computeRemaining` (lines 174-178)
- **Defect:** “No applicable usage” treated as determined zero; contradicts `lib/capacity/utilization-authority.ts` (“Empty ledger is UNKNOWN”)
- **Minimal repro:** empty ledger flat rule → status AVAILABLE, remaining = gross
- **Existing product safeguard:** `computeVerifiedRemaining` / VTE `remainingPublicationAllowed` withhold publication — but nested capacity status still AVAILABLE
- **Smallest remediation:** When ledger has no attributed usage and no VERIFIED_EMPTY cert, keep `usage`/`remaining` NOT_DETERMINED and floor status away from AVAILABLE for remaining claims (or split status: gross AVAILABLE vs remaining UNKNOWN)

### PAI-05 — Live dashboard/home publish gross as remaining/headroom
- **Modules:** `lib/covenant-engine.ts` remaining-after-incurrence at amount=0; `lib/dashboard-service.ts`; `lib/home/load-overview.ts`
- **Defect:** `remainingCapacity` equals modeled gross; Home can show “Healthy” headroom dollars
- **Safeguard:** stamps `NOT_PRODUCTION_AUTHORITATIVE` but numeric publication continues
- **Smallest remediation:** Surface gross under `GROSS_CONTRACTUAL` only; null remaining without authority; Home must not label gross as headroom

### PAI-06 — Customer-intelligence operative precedence ignores as-of vs effectiveness
- **Modules:** `lib/product/customer-intelligence/operative-resolution.ts:99-183`
- **Defect:** Computes `eff` but never compares to `params.asOfDate`
- **Minimal repro:** lifecycle `it.fails` pre-effective restatement
- **Smallest remediation:** If `asOfDate < eff`, return predecessor / UNRESOLVED_PRECEDENCE (align with Agent #7)

### PAI-07 — Omitted transaction entities → path SATISFIED
- **Modules:** `lib/contract-model/runtime/transaction/simulate.ts:796-806`
- **Defect:** `NO_TRANSACTION_ENTITIES_SUPPLIED` maps to SATISFIED; VTE never sets entities
- **Minimal repro:** scoped rule + empty/undefined entities → SATISFIED
- **Smallest remediation:** Map to `REVIEW_REQUIRED` when rule declares non-empty entityScope or entityScopeAudit requires entities

---

## P2

### PAI-08 — Position `claimKind: REMAINING` for non-authoritative modeled amounts
- **Modules:** `lib/customer-workflow/position-view.ts`
- **Remediation:** Use `GROSS_CONTRACTUAL` when authority ≠ PRODUCTION_AUTHORITATIVE

### PAI-09 — Legacy `evaluateProvision` assumes missing pctEbitda = 0, still `modeled`
- **Modules:** `lib/covenant-engine.ts:354-356` (and builder path)
- **Contrast:** `adaptLegacyCovenantProvision` refuses missing pct
- **Remediation:** Return `review_required` when grower % missing (match IR adapter)

### PAI-10 — Empty atlas → cross-ref `RESOLVED_CONTROLLING`
- **Modules:** `lib/negative-covenant-exceptions/cross-reference.ts:76-78`
- **Remediation:** When `known.size === 0`, resolve as AMBIGUOUS or MISSING_TARGET (atlas-unjoined), never RESOLVED_CONTROLLING

### PAI-11 — Delivery date synthesized from period `asOf`
- **Modules:** `lib/product/north-star-workflow/transaction-readiness.ts:78-91`
- **Remediation:** Omit delivery when `reviewedAt` missing; leave cutoff NEEDS_INPUT

### PAI-12 — Amendment overlay ignores `targetDocumentId`
- **Modules:** `governing-provision.ts:278-294` (comment vs `return true`)
- **Remediation:** Enforce target against governing/predecessor set

---

## Closed / not reopened (safeguards holding)

| ID | Pattern | Safeguard |
|---|---|---|
| A8-01 | Failed gate → AVAILABLE | `statusForAmount` floor NOT_SATISFIED |
| A8-02 | Shared negative remaining under REVIEW_REQUIRED | Pool withhold NOT_DETERMINED |
| — | UNSUPPORTED → Infinity | IR UNSUPPORTED → NOT_DETERMINED |
| — | Solver silent zero | `currentUsageAuthoritative` fail-closed |
| — | Product verified remaining without cert | GROSS_ONLY / mayPublishAvailable false |
| — | Hypo → durable ledger | `commitPlan.executed === false`; simulate isolation |
| — | Later unresolved competing restatement | Agent #7 / production gate (PR #306) |

---

## Recommended integration order

1. **PAI-01 + PAI-02** (whole-doc tip honesty) — unlocks safe DOCUMENT_LEVEL supersession
2. **PAI-03** (UNKNOWN scope fail-closed)
3. **PAI-04** (Phase-4C empty-ledger / remaining fork) — align with utilization-authority
4. **PAI-07** (entity omission)
5. **PAI-06** (customer-intelligence as-of)
6. **PAI-05 / PAI-08** (product labeling gross vs remaining)
7. **PAI-09 / PAI-10 / PAI-11 / PAI-12** (bounded cleanups)
