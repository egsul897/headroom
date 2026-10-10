# Product Proof 002 — Greater-of Assets Vertical Slice

Starting tip (pre-slice, local): `b12ef7d15ff7703b71884e9c1e2772cf26de87ee`  
Prior mission-observed PR head: `b4d45628054a8d532f1a0c12583cd1e731deff1c`  
Prior reported vertical-slice tip: `2011da01df3a1eeedc0d929f908109cb975c46c0`  
PR: https://github.com/egsul897/headroom/pull/266  
Branch: `cursor/product-proof-002-compilation-d8e9`

Frozen evidence hashes unchanged:

| Artifact | SHA-256 |
|---|---|
| MTN doc-A text | `a7d281818d70c085076dd612bb1fe8b3965bd452f61ad3d413c57e3f2879a58e` |
| MHK raw HTML | `6ee4abf323f03c509df295d82601baaeb3d40956105f2c18fd94add7af5f9784` |
| MHK extracted text | `f0210a431fef015a008e8821e1655407d618ec5984cb9899ced83a8679ddb12c` |

Sealed MHK legal reference (`04-independent-legal-reference.md`) was **not** rewritten.

---

## Tip / CI reconciliation

| SHA | Role |
|---|---|
| `2011da01` | Docs pin of first fixed-dollar ending SHA (`64e39ab5`) — not the live PR tip |
| `32701ecc` | Fix: `CompilerDocumentInput.label` in MHK structural test |
| `b4d45628` | Fix: assemble fixed-dollar `SemanticCompilerInput` via `candidate-input` (CI green tip recorded next) |
| `b12ef7d1` | Docs: record tip CI green at `b4d45628` — **actual pre-greater-of head** |

Mission text cited `b4d45628` as “current observed PR head” and `2011da01` as “prior reported tip.” Those differ because `2011da01` is a documentation pin, not the tip; two subsequent fix commits plus a CI-evidence doc commit advanced the branch. Fixed-dollar five-clause results remain valid at `b12ef7d1` (18/18 prior suite; 51/51 after greater-of suite expansion).

---

## Family implemented

Issuer-agnostic **greater of (fixed dollar amount, percentage of Total Assets / Total Consolidated Assets)** via existing canonical IR:

`IF(gates) → MAX(MONEY(fixed), MULTIPLY(PERCENT, METRIC_REFERENCE))`

| Module | Role |
|---|---|
| `lib/contract-model/compiler/greater-of-assets-basket/classify.ts` | Extract fixed limb, % limb, metric name, residuals, mutual shared-cap detection |
| `…/compile.ts` | Wire → `normalizeSubmission` → `IRRule` (+ optional `IRSharedCapacity`) |
| `…/verify-fidelity.ts` | Re-derive limbs/metric from operative text; compare to IR |
| `…/evaluate.ts` | Hypo vs PRODUCTION refuse; metric/currency/scope/version gates |
| `offline-package-compile.ts` | Bridge catalog clauses after fixed-dollar UNSUPPORTED |

No parallel compiler. No issuer/provision/amount hardcoding in IR JSON (Acme reuse locked).

---

## Authentic provisions

### MHK (executable greater-of + shared capacity)

| Clause | Formula | Metric | Shared |
|---|---|---|---|
| §7.01(u) | greater of (A) 10% of Total Consolidated Assets (as of last day of preceding fiscal quarter/year with §6.01 FS) and (B) $1,500,000,000 | Total Consolidated Assets | Yes ↔ §7.03(g) |
| §7.03(g) | greater of (i) 10% TCA (same as-of) and (ii) $1,500,000,000 | Total Consolidated Assets | Yes ↔ §7.01(u) |

**Shared-capacity legal basis (mutual, not inferred):** both operative texts contain `when combined (without duplication)` **and** each cites the other section. Evidence recorded in `artifacts/mhk-holdout/greater-of-shared-pairs.json`. One-way citation alone does **not** create shared capacity (adversarial lock).

Package compile without stipulated Total Assets → `NEEDS_METRIC_INPUT` (never zero / never unlimited). With stipulated TCA under `CALLER_STIPULATED_HYPOTHETICAL`: fixed limb dominates at $10B TCA ($1.5B); percent limb at $20B TCA ($2.0B); equal at $15B TCA ($1.5B). Shared ledger consumption of $1.2B leaves $300M pool remaining (conservation via existing shared-capacity engine).

### MTN (not modeled as shared greater-of)

| Clause | Relationship finding | Slice outcome |
|---|---|---|
| Permitted Debt (l) | Facility-difference (`Maximum Facility Amount` − `Facility Amount`) — **not** greater-of assets | `NOT_GREATER_OF_ASSETS` / UNSUPPORTED |
| Permitted Liens (d) | Cross-link to Debt (l) facility basket — **not** mutual without-duplication shared TCA pool | No greater-of shared pair invented |

MTN fixed-dollar (n)/(o)/Liens(p) preserved (3 VERIFIED_EXECUTABLE; production refused).

---

## Independent fidelity / adversarial results

Covered in `tests/contract-model/greater-of-assets-basket/`:

| Attack | Result |
|---|---|
| Fixed limb dominates | PASS ($1.5B at $10B TCA) |
| Percent limb dominates | PASS ($2.0B at $20B TCA) |
| Equal limbs | PASS ($1.5B at $15B TCA) |
| Missing Total Assets | `NEEDS_METRIC_INPUT`; available null |
| Stale/unauthenticated financial evidence | refuse affirmative |
| Currency mismatch (EUR metric) | `NEEDS_METRIC_INPUT` |
| Entity-scope mismatch | `FAILED` |
| Wrong metric definition (EBITDA tamper) | fidelity `METRIC_MISMATCH` FAIL |
| Amendment/version ambiguity | `FAILED` |
| Shared-capacity overlap | pool conserved ($1.2B used → $300M remain) |
| Tampered fixed limb | fidelity `FIXED_LIMB_MISMATCH` FAIL |
| Qualitative residual false | not VERIFIED_EXECUTABLE affirmative |
| Facility-difference language | UNSUPPORTED |
| One-way cross-ref only | shared=false |
| Deterministic replay | identical available |
| PRODUCTION mode | `PRODUCTION_CAPACITY_REFUSED` |

False-favorable in tested scope: **0**.

---

## Before / after executable counts

| Package | Before (fixed-dollar tip) | After (greater-of slice) |
|---|---|---|
| MTN verified executable | 3 | **3** (unchanged; greater-of attempted 0) |
| MHK verified executable | 2 | **4** (2 fixed-dollar + 2 greater-of) |
| MHK shared capacity pairs | 0 | **1** (7.01(u)↔7.03(g)) |
| MHK catalog recall | 35/35 | **35/35** (unchanged) |
| MHK structural nodes | 910 | **910** |
| False executable | 0 | **0** |
| Production authoritative capacity | REFUSED | **REFUSED** |

---

## Product authority layers (preserved)

1. **Source discovery** — catalog / Pass A (synthetic unpaid).
2. **Legal representation** — operative text → classification + residuals.
3. **Independently verified executable IR** — fidelity PASS + IR rule.
4. **Hypothetical capacity** — `CALLER_STIPULATED_HYPOTHETICAL` with stipulated TCA / gates.
5. **Authenticated production-authoritative capacity** — **refused** (no AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE, no utilization completeness certificate).

---

## Remaining unsupported families

- Facility-difference (MTN Debt (l) / Liens (d) chain)
- Ratio-conditioned permissions
- Growers other than fixed-or-%-assets greater-of
- Full definition-resolution sufficiency under unpaid discovery for all baskets
- Production capacity under trusted issuer gates

---

## Verdict

**GREATER_OF_VERTICAL_SLICE_PASSED — PRODUCTION_CAPACITY_REFUSED**

Authenticated production capacity is **not** claimed: metric inputs in package compile are null; PRODUCTION mode refuses even when hypothetical would execute.
