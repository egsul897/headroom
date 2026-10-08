# HEADROOM — Independent Parser / Gibraltar Merge-Gate Audit

Soft gate. Read-only. **DEVELOPMENT ≠ CERTIFIED.** Passing CI is necessary but not sufficient. Certification was not advanced. Knife River BLIND was not opened. No paid inference. Frozen evidence was not modified.

| Field | Value |
|---|---|
| Audit tip / report branch | `cursor/parser-gibraltar-merge-gate-audit-aa25` |
| `origin/main` | `9de4e5737166fcec84a35fdc9a3404870549211f` |
| PR #132 reviewed SHA | `348bfedb33725d9a00adbf331131c038aa7d5a22` |
| PR #128 reviewed SHA | `fc530e18294c90c6a8f2b31acb93f5400e14ff5a` |
| PR #130 reviewed SHA | `980eeba9ee1ca31c9ba34b62f9c93cb8f558784c` |
| PR #129 | Merged at `1c0a4fc9…`; frozen; not reopened |

---

## Verdicts

| PR | Verdict |
|---|---|
| **#132** (parser) | **REMEDIATION_REQUIRED** |
| **#128** (Gibraltar) | **REMEDIATION_REQUIRED** |
| **#130** (unlimited carve-out) | **DEPENDENCY_BLOCKED** |
| **#129** | Frozen / merged — out of scope |

---

## 1. Git history reconciliation

### Actual SHAs and merge bases

| Ref | SHA |
|---|---|
| `origin/main` | `9de4e5737166fcec84a35fdc9a3404870549211f` (#134 tip) |
| #132 merge-base vs main | `9de4e573…` (fully rebased onto current main) |
| #128 merge-base vs main | `554698a0e9403436c637f6789a663321fa03701a` (#124 tip) |
| #130 merge-base vs main | `554698a0…` (same) |
| Common ancestor of #132/#128/#130 | `554698a0…` |

### Why #132 targets `9de4e573` while #128/#130 target `554698a0`

- After #124 (`554698a0`), main absorbed #129 (OPERATIVE_SUBWINDOW seal), disposition-reliance notes, #133, #131, and **#134** (qualitative-gate narrowing in `unlimited-carveout-honesty.ts`).
- #132 later merged `origin/main` (`4f43ac2`) and now sits on tip `9de4e573`.
- #128 and #130 were never rebased past `554698a0`. GitHub reports #128 `MERGEABLE`, #130 `CONFLICTING`.

### Safe combination without silent revert?

| Pair | Parser / cert risk |
|---|---|
| #132 ↔ #128 | **Parser blobs identical** (`clause-hierarchy.ts` and its test share blob `31e6190e…` / `40f49247…`). Combining them does **not** silently revert the letter/roman parser between those two tips. |
| #128 → current main | Merge-tree clean at audit time, but #128 still carries the **same** #132 parser defect and a **stale Haiku `execution.json`** (2087 / NOT_FOUND) that contradicts tip offline (2064 / UNIQUE). |
| #130 → current main | **Content conflict** on `unlimited-carveout-honesty.ts` and `package.json` with #134 / #129. Blind merge can drop `operative-subwindow-seal.test.ts` from `test:phase3-certification`. |

---

## 2. PR #132 — parser audit

### What changed

Adds `skipDeepestForOuterLetter`, `restartedLetterCandidate`, and `innerResumesBeforeOuter` so restarted letter runs like `(x)/(y)` are not stolen by roman continuation, while `(i)` after `(h)` stays a letter and `(x)` then `(xi)` stays roman.

### Independent Chewy reconstruction (SHA `348bfed…`)

Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt`.

| Expected (F-2 golden / legal) | Live on #132 | Result |
|---|---|---|
| Body §6.08 at `[659042, 697571)` + TOC duplicate at `[4922, 4976)` | Present | OK (TOC/body duplication preserved) |
| Subsections exactly `6.08(a)`, `6.08(b)` | Exact | OK |
| True `(b)` text at `670039`: “The foregoing provisions of Section…” | Present; `(a).charEnd == (b).charStart` | OK — **historical dropped limb restored (pre-existing F-2)** |
| `6.08(a)(3)(a)–(i)` under `(3)` | All nine present; `(a)` text “the greater of (x) 50%…” | OK for direct letter limbs |
| `6.08(b)(1)–(27)` under true `(b)` | All 27 | OK |
| No false `6.08(i)*` | None | OK |
| Provisos / “shall not prohibit” / inline refs | 35 inline markers skipped (including “this clause (b)”, “clauses (i) through (iv)”) | OK — F-2 inline-ref discipline holds |

### Defects golden tests do **not** catch (adversarial)

**False nesting + span regression under `6.08(a)(3)(b)`**

Source structure under builder limb `(b)` (abs `664123`):

```text
(b) … from the issue or sale of:
  (i)(A) Equity Interests … excluding … sale of:
        (x) Equity Interests to employees…; or
        (y) Designated Preferred Stock; and
      (B) … contributed …
  (ii) Indebtedness … converted …
```

| Metric | `main` @ `9de4e573` | #132 @ `348bfed` |
|---|---|---|
| `6.08(a)(3)(b)` owned span | `[664123, 666205)` — **2082 chars** (to `(c)`) | `[664123, 664780)` — **657 chars** |
| Nodes `6.08(a)(3)(b)(x)/(y)` | absent | **present**, parented to `6.08(a)(3)` (not under `(b)` in `parentNodeId`) |
| `6.08(a)(3)(b)(i)/(ii)/(A)/(B)` | absent (pre-existing gap) | still absent; `(B)` and `(ii)` text **swallowed into `(y)` span** `[665096, 666205)` |

`buildClauseTree` path claims `(a)(3)(b)(x)` while stage-structure `parentNodeId` points at `6.08(a)(3)`. SectionRef path and parent link disagree. Restarted-letter logic correctly helps Gibraltar `(x)/(y)` after `(4)`, but over-fires inside Chewy’s `(b)` after a glued `(i)(A)` and hanging prose, truncating the limb that F-2’s golden owned span still expects at `666205`.

**Pre-existing (not introduced, still open):** `6.08(a)(3)(a)(A)/(B)` are the `(z)(A)/(B)` EBITDA limbs; `sectionRef` implies child of `(a)` but `parentNodeId` is `6.08(a)(3)`. Letter `(i)` under `(3)` correctly stays a letter; nested roman `(i)/(ii)` exist as siblings by parent link.

**Verdict driver:** F-2 / synthetic tests **pass** while Chewy builder limb `(b)` **regresses** vs main/golden span. Passing golden is not sufficient proof.

---

## 3. PR #128 — Gibraltar vs parser identity

### Parser vs #132

| File | #132 blob | #128 blob |
|---|---|---|
| `lib/contract-model/compiler/clause-hierarchy.ts` | `31e6190e…` | **identical** |
| `tests/contract-model/clause-hierarchy.test.ts` | `40f49247…` | **identical** |

#128 tip message claims the parser commit matches the clause-hierarchy branch. Confirmed: **identical, not behind, not divergent** — including the Chewy `(b)` regression.

### 2,064-node tree reproducibility

Independent offline run on `fc530e1` (no provider key):

```text
totalNodes: 2064
passACandidates: 938
sectionsToCall: 121
expectedMaxCostUsd: 156.01
7.05(a)(y): UNIQUE (1 candidate)
7.04: UNIQUE_AFTER_DEGENERATE_EXCLUSION (TOC excluded, body a80b8b…, selected: false)
Pass B: PROVIDER_EXECUTION_REQUIRED
```

Reproducible. Main without parser: **2087** nodes; `7.05(a)(y)` **absent**.

### “2,096-node” reconciliation

No Gibraltar `totalNodes: 2096` exists in repo or these PR tips. Documented pair is **2087 → 2064** (Δ 23 nodes, Δ 8 Pass A candidates). Stray “2096” hits elsewhere are unrelated (vitest counts, char offsets, financial notes).

### Dropped Chewy limb

Historical F-2 defect (true `6.08(b)` dropped) remains fixed on main and on these tips. #128/#132 do not reopen that failure. They **do** introduce the new `(a)(3)(b)` span truncation via the shared parser.

### Pass A / later stages vs tree identity — **FAIL**

| Artifact | Nodes | Pass A | `7.05(a)(y)` | `7.04` | Pass B |
|---|---:|---:|---|---|---|
| Live offline tip (`fc530e1`) | **2064** | **938** | UNIQUE | UNIQUE_AFTER_DEGENERATE_EXCLUSION | refused (no key) |
| Persisted `development-pipeline/execution.json` | **2087** | **946** | **NOT_FOUND** | **AMBIGUOUS** | Haiku executed: 842 candidates |
| `structure/structure-summary.json` (#112 era) | 2087 | 946 | — | — | — |
| `docs/p3-track-d-gibraltar-development-execution.md` | still narrates 2087 / NOT_FOUND / AMBIGUOUS / path `7.05(a)(4)(ii)(vi)(B)` | | | | |

**Stale Haiku execution is being stored beside tip tests that assert the new parser.** Pass B rows were minted against the **pre-parser** tree. Tip offline correctly refuses Pass B without a key and does not remint — but the on-disk `execution.json` still presents Haiku/`2087`/`NOT_FOUND` as if current. That is not the current parser result.

---

## 4. Gibraltar legal-safety controls

### Builder Basket `7.05(a)(y)` vs printed `(vi)`

Independent source read:

| Span | Text |
|---|---|
| Def `37218` | `“Available Amount Builder Basket” has the meaning specified in Section 7.05(a)(y).` |
| Operative `(y)` `776996` | `(y) the aggregate amount of such Restricted Payment … would exceed the sum of …` |
| Operative `(vi)` `782798` | `(vi) the greater of (A) $137,600,000 and (B) 40.0% of LTM EBITDA (the foregoing clause (y), the “Available Amount Builder Basket”).` |

Lane C’s “marker disagreement” overstated the absence of `(y)`. **`(y)` is printed.** `(vi)` is the last summand under `(y)`; the defined-term parenthetical names **clause `(y)`**, not `(vi)` alone. On the new tree, `7.05(a)(y)` is **UNIQUE** and children include `(i)…(vi)(A)/(B)`. Old path `7.05(a)(4)(ii)(vi)(B)` is **ABSENT**.

**Fail-closed status:** Investigation leaves `discoveryId: null`, no sealed role. Unique structural resolution of the cite is warranted. It does **not** authorize selecting the 95-char `(vi)(B)` prong as the whole basket, inventing a discoveryId, or curing Haiku mis-labels on the old tree.

### §7.04 TOC/body

| Node | Span | Chars |
|---|---|---:|
| TOC `a744dbe…` | `[5496, 5535)` | 39 |
| Body `a80b8b…` | `[768425, 774192)` | 5767 |

Resolver: `UNIQUE_AFTER_DEGENERATE_EXCLUSION`; TOC excluded; **`selected: false`**. Unique structural candidate does not auto-select a matrix cell. OK.

### Ambiguous references / supersession / shared capacity / controlling conditions

| Control | Finding |
|---|---|
| Ambiguous refs | Live offline: 800 ambiguous, 154 unresolved, 505 resolved. Bare labels still need resolver discipline. |
| Supersession | `supersessionIndex: "EMPTY"` → Pass A `UNKNOWN_SUPERSESSION_STATUS`. Missing supersession evidence remains fail-closed. |
| Shared-capacity FPs | 51 `shared_cap` hits on tip offline; package fixture still shows “aggregate amount” false positives (EBITDA add-backs). Phrase “shared capacity” absent. Not a selected shared-cap cell. |
| Missing controlling conditions | No Pass B on current tree; cannot adjudicate condition completeness. Haiku rows are wrong-tree. HOLD. |
| Builder_language FPs | Still include “cumulative” / Cumulative Remedies (§10.03) — unrelated to Available Amount. |

---

## 5. PR #130 compatibility

| Check | Result |
|---|---|
| Base | `554698a0` — missing #129, #131, #133, **#134** |
| Merge vs current main | **CONFLICTING** on `unlimited-carveout-honesty.ts` and `package.json` |
| Dependency on #134 | **Yes.** #134 narrowed exact qualitative gates whose description only restates the other gate. #130 tip lacks that logic and conflicts on the same file. |
| `package.json` hazard | #130 **replaces** `operative-subwindow-seal.test.ts` in `test:phase3-certification` with unlimited-carveout tests. Rebase must **union** both, or #129 seal coverage drops from CI. |
| Tests on tip `980eeba` | Unlimited carve-out: 20/20 pass. `npm run test:phase3-certification`: 27 files / 462 tests pass **on the stale base** (no seal suite on that tip). |
| Parser interaction | No file overlap with #132/#128 parser. Semantic-only. Still invalid to merge until rebased onto #134 + #129 cert script. |

---

## 6. Independent execution (no paid inference)

| Command | SHA | Result |
|---|---|---|
| `npx vitest run tests/contract-model/clause-hierarchy.test.ts tests/contract-model/clause-hierarchy-f2-nesting.test.ts` | #132 `348bfed` | **35/35 pass** |
| Same + `tests/stratified-cert/gibraltar-development-pipeline.test.ts` | #128 `fc530e1` | **37/37 pass** |
| `npx tsc --noEmit -p .` | #128 `fc530e1` | **pass** |
| `npx vitest run tests/stratified-cert` | #128 `fc530e1` | **45/45 pass** |
| Live `runOfflineDevelopmentPipeline` (no `AI_GATEWAY_API_KEY`) | #128 `fc530e1` | **2064 / 938 / UNIQUE `(y)` / TOC exclusion / Pass B refused** |
| `npx vitest run …/unlimited-carveout-qualitative-gates.test.ts` | #130 `980eeba` | **20/20 pass** |
| `npm run test:phase3-certification` | #130 `980eeba` | **462/462 pass** (seal tests absent from script) |
| Pass B / paid provider | — | **Not executed** (mission forbid) |

---

## 7. Required returns

### 1. Actual `origin/main` SHA

`9de4e5737166fcec84a35fdc9a3404870549211f`

### 2. Exact reviewed SHAs

- #132: `348bfedb33725d9a00adbf331131c038aa7d5a22`
- #128: `fc530e18294c90c6a8f2b31acb93f5400e14ff5a`
- #130: `980eeba9ee1ca31c9ba34b62f9c93cb8f558784c`

### 3. Parser tree comparison

| Surface | main | #132/#128 tip |
|---|---|---|
| Chewy doc nodes | 1548 | 1576 |
| Chewy §6.08 inside | 105 | 109 |
| Chewy `6.08(a)(3)(b)` end | 666205 | **664780 (REGRESSION)** |
| Gibraltar totalNodes | 2087 | **2064** |
| Gibraltar `7.05(a)(y)` | absent / NOT_FOUND | UNIQUE with `(i)…(vi)(B)` children |
| #132 vs #128 parser source | — | **byte-identical** |

### 4. Chewy limb coverage

- True `6.08(b)` + `(1)–(27)`: **covered**
- `6.08(a)(3)(a)–(i)` direct letters: **covered**
- Builder `(b)` internal `(i)(A)/(x)/(y)/(B)/(ii)`: **not correctly nested**; #132 **shortens** `(b)` and invents `(b)(x)/(y)`
- Historical false `6.08(i)` promotion: **still absent**

### 5. Gibraltar reference adjudication

| Ref | Live tip | Stale execution.json | Adjudication |
|---|---|---|---|
| `7.05(a)(y)` | UNIQUE | NOT_FOUND | Live UNIQUE is source-correct; do not seal from stale Haiku |
| `7.04` | UNIQUE_AFTER_DEGENERATE_EXCLUSION; selected false | AMBIGUOUS | Fail-closed non-selection OK |
| Phrase owning nodes | `1.01(…)` def + `7.05(a)(y)(vi)(B)` | old path `7.05(a)(4)(ii)(vi)(B)` | Phrase at `(vi)(B)` ≠ authority that basket is only `(vi)` |

### 6. Cross-PR conflicts

- #132 ∩ #128: shared parser (identical) — combine only after #132 remediation, then refresh #128 evidence.
- #132 ∩ #130: no file overlap.
- #128 ∩ #130: no file overlap.
- #130 ∩ main/#134/#129: **hard conflicts**; cert-script regression risk.

### 7. Independent test results

See §6. CI-green on tips; **not** certification.

### 8. Remaining legal-safety risks

1. Chewy Available Amount builder limb `(b)` falsely split by restarted-letter logic.
2. Gibraltar Pass B / discovery roles bound to **2087-node** Haiku tree, not 2064.
3. Empty supersession index → unknown amendment state.
4. Shared-cap and builder_language false positives still in Pass A counts.
5. Unique `7.04` / `7.05(a)(y)` must not be treated as pin/CERTIFIED selection.
6. #130 rebase can silently drop #129 seal tests from CI.

### 9. Recommended merge order and HOLD conditions

**Order (after remediation, not now):**

1. **Remediate #132** — fix Chewy `(a)(3)(b)` over-expansion without losing Gibraltar `(x)/(y)` after `(4)`; add regression asserting `6.08(a)(3)(b).charEnd === 666205` and absence of false `6.08(a)(3)(b)(x)` **or** correct deeper nesting under `(i)(A)`.
2. **Rebase #128 onto main+#132 fix** — re-run offline; quarantine or clearly banner stale Haiku `execution.json` as **pre-parser / wrong-tree**; do not present it as current; Pass B remains PROVIDER_EXECUTION_REQUIRED until a deliberate paid rerun on the new tree.
3. **Rebase #130 onto main+#134** — union cert script (`operative-subwindow-seal` **and** unlimited-carveout tests); resolve honesty.ts with both A1/A2 and #134 narrowing.
4. **#129** stays frozen.

**HOLD — do not merge any of #132/#128/#130 while:**

- HOLD_PARSER_CHEWY_A3B_REGRESSION
- HOLD_GIBRALTAR_TREE_EVIDENCE_MISMATCH (2064 live vs 2087 Haiku artifact)
- HOLD_NO_PASS_B_ON_CURRENT_TREE
- HOLD_EMPTY_SUPERSESSION
- HOLD_130_REBASE_ON_134_AND_129_CERT_SCRIPT
- HOLD_NO_CERTIFICATION / HOLD_NO_PIN / Knife River unopened

**Do not advance certification.**
