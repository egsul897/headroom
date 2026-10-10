# Product Proof 002 — Vertical Slice Continuation (Phases 1–7)

Starting tip verified: `e6f82aa9c719ab8975bd9296bd17cba3a7b78666`  
Feature slice: `64e39ab50af98dcb5884f21f169b785f171d0a37`  
Ending tip (CI green): `b4d45628054a8d532f1a0c12583cd1e731deff1c`  
Feature commit preserved: `334f2755f85bcb7351683b3672eb8bc0b7a7f689`  
`origin/main` at start of continuation: `c2dde8f1dd28832eb77ab6c9f50d4609a9efd52e`  
PR: https://github.com/egsul897/headroom/pull/266

Frozen evidence hashes unchanged:

| Artifact | SHA-256 |
|---|---|
| MTN doc-A text | `a7d281818d70c085076dd612bb1fe8b3965bd452f61ad3d413c57e3f2879a58e` |
| MHK raw HTML | `6ee4abf323f03c509df295d82601baaeb3d40956105f2c18fd94add7af5f9784` |
| MHK extracted text | `f0210a431fef015a008e8821e1655407d618ec5984cb9899ced83a8679ddb12c` |

Sealed MHK legal reference (`04-independent-legal-reference.md`) was **not** rewritten.

---

## Phase 1 — Audit of prior claims

### Reproduced baseline (pre-slice tip `e6f82aa9`)

Prior manifests at tip reported:

| Package | structuralNodes | catalog clauses | verified executable | capacity |
|---|---|---|---|---|
| MTN | 1595 | 33 (Debt 16 + Liens 17) | 0 | REFUSED_NO_VEP |
| MHK | **0** | 35 (7.01×23 + 7.03×12) | 0 | REFUSED_NO_VEP |

MHK clause discovery **35 TP / 0 FP / 0 FN** was **catalog recall** against the sealed marker list — not semantic compilation into executable IR. No false executable classifications.

Holdout chronology (unchanged): freeze-manifest precedes independent legal reference. Legal reference was written after freeze and is scoring-only.

### MHK `structuralNodes=0` diagnosis

**Material missing structural representation**, not a reporting/interface bug.

Root cause: MHK EDGAR HTML→text extract uses bare-decimal headings with leading horizontal whitespace and NNBSP between number and title, e.g.:

```
 7.01    Liens .
```

`SECTION_PATTERNS` previously required `^(\d+\.\d+)(?![A-Za-z])\s+([A-Z]…)` without leading WS / without NNBSP (`U+202F`) / NBSP (`U+00A0`) in the separator class. Zero section matches → empty structural index → Pass A / coverage regions unavailable. Definition-exception catalogs still worked from raw-text scans (hence 35/35 catalog recall with 0 nodes).

**Fix (generalized):** accept leading `[ \t\u00a0\u202f]*` and NNBSP/NBSP in the bare-decimal separator. Post-fix MHK `nodeCount=910` including `7.01` / `7.03`. Locked by `tests/contract-model/fixed-dollar-basket/mhk-structural-and-slice.test.ts`.

Human interventions: only unpaid/synthetic discovery mode (Pass B). No paid inference. No sealed-reference edits.

---

## Phase 2 — First non-executable break (representative path)

Representative authentic permission discovered by catalog bridge but previously non-executable:

**MTN `Permitted Debt (o)`** — *Debt of any Restricted Company organized outside the United States in an aggregate principal amount which does not exceed $50,000,000 at any time outstanding*

| Boundary | Identity / status | Break? |
|---|---|---|
| Source document | MTN Tenth A&R CA, def Permitted Debt (o); sha256 `a7d28181…` | OK |
| Structural extraction | nodeCount>0; definition detected | OK |
| Catalog discovery | `def:Permitted Debt(o)` in exception catalog | OK |
| Candidate/context assembly | catalog clause → operative text assembly | OK |
| Definition resolution | entity term Restricted Company unresolved in context bundle | soft — not amount-determinative |
| Operative authority | lettered exception under Permitted Debt | OK |
| Normalized permission | **FIRST GENUINE BREAK (pre-slice):** no generalized IR builder for fixed-dollar + qualitative residual; local semantic compile stayed PARTIAL / REFUSED | **BREAK** |
| IR construction | none | consequence |
| Evaluator | N/A | consequence |
| Independent legal verification | N/A | consequence |
| VEP / certified authority | REFUSED_NO_VEP | consequence |
| Verified capacity | refused | consequence |
| Selected-path simulation | not reached | consequence |

Secondary break observed on MHK `7.01(i)` during slice development: short residual excerpt `"in respect of"` bound ambiguously (2 spans) → normalize honesty `SUFFICIENCY=PARTIAL` → fidelity FAIL (fail-closed; never false-favorable). Fixed by longer unique object-restriction excerpts.

---

## Phase 3 — Generalized executable vertical slice

**Selected family:** fixed-amount debt/lien baskets with optional qualitative residuals (geographic, object, proviso, cross-section), encoded as `IF(TRANSACTION_INPUT) → MONEY` through existing `normalizeSubmission` / IR / `evaluateVerifiedCapacity`.

**Not selected:** facility-difference, greater-of / % TCA growers (remain UNSUPPORTED — adversarial tests lock this).

### Implementation (no parallel compiler)

| Module | Role |
|---|---|
| `lib/contract-model/compiler/fixed-dollar-basket/classify.ts` | Issuer-agnostic cap-role + residual detection |
| `…/compile.ts` | Wire submission → `normalizeSubmission` → IRRule |
| `…/verify-fidelity.ts` | Re-derive amount/gates from operative text; compare to IR |
| `…/evaluate.ts` | Hypothetical gates vs PRODUCTION refuse |
| `offline-package-compile.ts` | Bridge catalog clauses → slice; set `VERIFIED_EXECUTABLE` only on fidelity PASS + hypo EXECUTED |

### Authentic clauses now VERIFIED_EXECUTABLE (hypothetical authority)

| Package | Clause | Cap | Residuals gated | Hypo available | Production |
|---|---|---|---|---|---|
| MTN | Permitted Debt (n) | $100,000,000 | object + proviso | $100M | REFUSED |
| MTN | Permitted Debt (o) | $50,000,000 | geographic | $50M | REFUSED |
| MTN | Permitted Liens (p) | $250,000 | object | $250k | REFUSED |
| MHK | §7.01(i) | $100,000,000 | object + cross-section + proviso | $100M | REFUSED |
| MHK | §7.03(f) | $700,000,000 | object (Permitted Receivables) + proviso | $700M | REFUSED |

Reuse beyond issuer: Acme sole-cap unit test (`$25M` / `$50M`) with no MTN/MHK/Vail/Mohawk hardcoding in IR JSON.

---

## Phase 4 — Adversarial legal fidelity

Covered in `tests/contract-model/fixed-dollar-basket/adversarial-fidelity.test.ts`:

| Attack | Result |
|---|---|
| Gate stipulated false | available $0 / not VERIFIED_EXECUTABLE affirmative |
| Grower / difference / % assets | `NOT_FIXED_DOLLAR` → UNSUPPORTED; no IR |
| Threshold/floor language | NOT_FIXED_DOLLAR |
| Tampered IR amount | fidelity FAIL (`AMOUNT_MISMATCH`) |
| PRODUCTION mode | always `PRODUCTION_CAPACITY_REFUSED` |
| Ambiguous short provenance excerpt | PARTIAL sufficiency → fidelity FAIL (observed on 7.01(i) pre-excerpt fix) |

Partial representations cannot silently become over-complete affirmative permissions.

---

## Phase 5 — Independent authentic validation

Sealed MHK clause-discovery metrics **unchanged** (35/35). Separate executable metrics:

| Metric | MTN | MHK |
|---|---|---|
| A. Clause discovery | Debt (a)–(p) + Liens (a)–(q) catalogs | 35/35 markers |
| B. Fixed-dollar classification attempted | 3 | 2 |
| C–E. Representation + fidelity + evaluator | 3 PASS | 2 PASS |
| F. Verified executable authority | **3** | **2** |
| G. Production-authoritative capacity | **0 / REFUSED** | **0 / REFUSED** |

Per-permission class: all five listed above = `VERIFIED_EXECUTABLE` under `CALLER_STIPULATED_HYPOTHETICAL`; `PRODUCTION_CAPACITY_REFUSED` for customer capacity. False executable = **0**. Material omissions: growers, facility-difference Debt (l), shared TCA baskets, ratio-conditioned permissions remain unsupported.

---

## Phase 6 — Capacity and transaction boundary

Preserved:

- `CALLER_STIPULATED_HYPOTHETICAL` vs production refuse (no fabricated AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE)
- UNKNOWN utilization ≠ zero (production path refuses before ledger)
- Completeness certificate / trusted issuer gates untouched
- Shared-capacity conservation untouched
- Capacity handoff outcome: `VERTICAL_SLICE_PASSED_PRODUCTION_CAPACITY_REFUSED`

Legal-rule executability ≠ authorization to issue a customer-facing capacity answer.

---

## Phase 7 — Acceptance inventory

See `11-final-verdict.md`, `10-ci-evidence.md`, `artifacts/quantitative-scorecard.json`.
