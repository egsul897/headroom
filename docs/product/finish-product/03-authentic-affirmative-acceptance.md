# Authentic affirmative milestone — acceptance verification

**Audited SHA:** `887b41abc7fb928828a5a6317bd9f03cfb2812ae`  
**Verdict:** `AUTHENTIC_AFFIRMATIVE_BLOCKED_WITH_FAIL_CLOSED_BEHAVIOR_PRESERVED`  
**Merge approval:** **none** — this acceptance does not authorize merge of PR #258  
**Auto-merge:** **no**  
**Phase certification advanced:** **no**

> Working-tree acceptance note only if committed later; verification below was executed against tip `887b41ab` with a clean tree matching origin.

## 1. Refusal preserved

| Artifact | Status |
|---|---|
| `docs/phase-3-live-validation/7.2c-recompute-phase2-certified/10-certification.json` | Unmodified; unit `CERTIFIED` with `SEMANTIC_BINDING_PENDING_PACKAGE` |
| Authentic VEP | Unmodified |
| `tests/product/authentic-conmed-72c-affirmative-blocker.test.ts` | Expects REQUIRE `REFUSED` / `CROSS_RULE_GATE_NOT_EXECUTABLE` |
| Production gates | Not weakened |

## 2. Test at exact tip

```text
npx vitest run tests/product/authentic-conmed-72c-affirmative-blocker.test.ts
✓ 2 tests passed (tip 887b41ab)
```

## 3. Production gate enforcement (not fixture-only)

Module: `lib/contract-model/verified-execution.ts`

| Gate | Production reference | Enforced on §7.2(c)? |
|---|---|---|
| `referencesRuleTargets` / §7.1 financial compliance condition | `isCompanionRequiresDischargeable` L187 returns false; `bind` L289–303 records condition gates | **Yes** — refusal ref `rule[r-c].condition[0] -> Section 7.1` |
| `REQUIRES` §7.3(g) companion | `bind` L290–308 depGates; discharge requires in-package COMPLETE PERMISSION at L200–208 | **Yes** — refusal ref `REQUIRES Section 7.3(g)` |
| `REQUIRES` §7.1 | same depGates path | **Yes** — refusal ref `REQUIRES Section 7.1` |
| `UNLIMITED_CAPACITY` non-discharge | L198–199 | **Yes** — discharge false |
| Package refusal | L312–318 `CROSS_RULE_GATE_NOT_EXECUTABLE` | **Yes** |

Direct production call at tip: `evaluateVerifiedCapacity` → `REFUSED` with the three refs above.

## 4. Certification-scope inventory (qualified)

Independent scan of `docs/**/*.json` for `phase3-candidate-certification.v1` with `status: CERTIFIED`:

| Path | Candidate | Role |
|---|---|---|
| `docs/phase-3-live-validation/7.2c-recompute-phase2-certified/10-certification.json` | `discovery-candidate:7a3f36589dacd05c41331a80` / `ir-rule:29309c463e06b77b4b243eda` | **Only authoritative on-disk unit CERTIFIED artifact** |
| `docs/product/customer-workflow/authenticated-vep/01-scan.json` | same candidate | Offline **scan summary** (`certifiedCount: 1`) pointing at the artifact above — **not** a second certification |

Also:

- Canonical map `conmed-2025-credit-facility.map.json`: **0 / 163** candidates `CERTIFIED` (`NOT_CERTIFIED` for all)
- Other live-validation `10-certification.json` packets for the same §7.2(c) candidate: `REVIEW_REQUIRED`
- §7.5(j): `REVIEW_REQUIRED`

**Qualified claim:** Only one authentic Phase-3 **unit-level** CERTIFIED candidate packet exists on disk (§7.2(c) recompute). That is not package-level CERTIFIED and not capacity-approved.

## 5. Unit ≠ package ≠ capacity approval

| Layer | Status |
|---|---|
| Unit certification | `CERTIFIED` + warning `SEMANTIC_BINDING_PENDING_PACKAGE` (semantic binding of §7.1 / §7.3(g) is package-level) |
| Package certification | `PARTIAL` (`DISCOVERY_POPULATION_UNSEALED`, `PARTIAL_TARGET_SET`, `REVIEW_UNRESOLVED_ITEM`) — `03-certify-package.json` |
| Production capacity | `REFUSED` `CROSS_RULE_GATE_NOT_EXECUTABLE` |

## 6–8. Constraints honored

No fabricated companions, financials, or utilization. No unlimited / cross-rule gate weakening. Documented blocker remains an evidence-backed limitation, not a defect to shortcut.

## 9. Shared-lien conservation

Outstanding **HIGH-severity merge hold** for shared-lien conservation on #258 remains **separate** from this milestone. Not investigated or “fixed” here; not cleared by this acceptance.

## 10. Remaining blockers (unchanged)

1. Independently CERTIFIED §7.3(g) companion unit(s)  
2. Independently CERTIFIED §7.1 + certified `OTHER_RULE_SATISFIED` / pro-forma compliance evaluator  
3. APPROVED financial snapshots (and for remaining vs gross: attributed utilization + completeness certificates)  
4. Separate: shared-lien conservation HIGH merge hold on #258  
5. Ops: Neon for live Position/Simulate/Ask (not required for this fail-closed refusal proof)
