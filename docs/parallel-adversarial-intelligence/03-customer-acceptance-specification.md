# Mission 4 — Customer Acceptance Specification

**Status:** Independently executable specification (not a claim of product support).  
**Controlling architecture:** `docs/headroom-north-star-v2.md`  
**Starting SHA:** `67027b8f499921a12cee7b9b9f04d832898b6384`  
**Rule:** Do not claim support for a transaction type the existing architecture cannot represent.

---

## Shared refusal semantics (all questions)

| Outcome | Meaning | Customer-visible requirement |
|---|---|---|
| `AVAILABLE` / numeric remaining | Authoritative remaining after verified usage | Completeness certificate AUTHENTIC + trusted issuer; production authority active; gate satisfied |
| `GROSS_ONLY` | Contractual gross known; remaining withheld | Must not be labeled “headroom” / “remaining availability” |
| `NEEDS_INPUT` | Missing financial / entity / adjustment input | List exact missing keys |
| `REVIEW_REQUIRED` | Material legal/financial uncertainty | Cite conflicting or incomplete evidence |
| `UNSUPPORTED` | Architecture cannot represent the mechanics | Explicit refusal; never coerce to nearest formula |
| `NOT_CERTIFIED` / `LEGACY` | Prototype / legacy engine path | Must not be presented as certified Headroom Answer |

**Citation minimum for any authoritative answer:** governing document id + section/ref + operative version/as-of + financial snapshot id (period, as-of, approval) + ledger usage ids counted (or explicit VERIFIED_EMPTY cert).

**Human-review conditions (global):** UNKNOWN restatement scope; REVIEW_REQUIRED package-graph edges; competing same-date authorities; unproven conditions precedent; incomplete utilization; entity scope unsafe/unspecified when entities matter; proviso attachment AMBIGUOUS; cross-doc inventory incomplete.

---

## Q1 — How much additional secured debt can the issuer incur?

| Field | Requirement |
|---|---|
| **Required source documents** | Operative credit agreement / AR (as-of), all amendments overlaying secured-debt / lien baskets, intercreditor if it constrains secured capacity, any indenture with equal/priority secured restrictions on file |
| **Required financial / ledger inputs** | APPROVED snapshot supplying every metric in the secured capacity IR (EBITDA, Total Assets, leverage ratios as applicable); attributed secured/lien basket usage **or** VERIFIED_EMPTY completeness cert; entity classes for borrower/guarantors |
| **Expected output** | Per-path: governing provision, conditions, **gross** capacity, prior usage, **remaining** only if utilization-authoritative; else `GROSS_ONLY` / `REVIEW_REQUIRED` |
| **Refusal** | Empty ledger without cert → refuse remaining; missing grower % / metric → `NEEDS_INPUT` / `REVIEW_REQUIRED`; UNKNOWN operative tip → refuse |
| **Source citations** | Secured debt + lien sections; shared-cap provisions; ICA caps if evaluated |
| **Adversarial cases** | Empty ledger treated as zero (DEF-C1); gross labeled remaining on dashboard (DEF-C2); missing pctEbitda modeled as flat (DEF-C4); omitted entities SATISFIED (DEF-M2-ENTITY) |
| **Human-review** | Shared baskets unquantified; reclassification rights contemplated but unelected; competing restatement |
| **Acceptance criteria** | Numeric remaining published iff `authoritativeForRemaining === true` and path status not floored; otherwise non-AVAILABLE label; citations present; no Infinity/silent zero |
| **Architecture support** | **Partial:** Phase 4C/4D + utilization authority for certified paths; product UI still largely legacy |

---

## Q2 — Can the issuer make a restricted payment?

| Field | Requirement |
|---|---|
| **Required source documents** | Operative RP covenant + builder/available-amount definitions; amendments; any note indenture RP; designation of unrestricted subsidiaries if RP depends on them |
| **Required inputs** | APPROVED snapshot for builder components / ratio gates; RP ledger attribution (dividends, investments, etc.); payment kind + amount + payee entity class |
| **Expected output** | Path enumeration (builder, general basket, ratio gate); each path SATISFIED / NOT_SATISFIED / REVIEW_REQUIRED / NEEDS_INPUT; never a bare yes without path |
| **Refusal** | Legacy RP pool without path attribution → not certified; missing builder components → `NEEDS_INPUT` |
| **Citations** | RP section, builder definition, ratio gate section |
| **Adversarial cases** | Ratio gate failed but AVAILABLE (closed A8-01); Ask LEGACY answer without ledger |
| **Human-review** | Builder reclassification; “Available Amount” definitional closure incomplete |
| **Acceptance criteria** | No CLEAR/AVAILABLE when any path requirement UNKNOWN; LEGACY answers labeled `NOT_CERTIFIED_4E` |
| **Architecture support** | **Partial:** legacy waterfall exists; certified 4E path enumeration not product-complete |

---

## Q3 — Can the issuer transfer assets to an unrestricted subsidiary?

| Field | Requirement |
|---|---|
| **Required source documents** | Investments / restricted-payments / asset-sale covenants; Unrestricted Subsidiary definition + designation mechanics; guarantor release provisions |
| **Required inputs** | Transfer amount/type; transferor/transferee entity classes; designation status evidence; investment/RP/asset-sale usage |
| **Expected output** | Which covenants bind; whether designation is effective as-of; capacity/permission per path; or `UNSUPPORTED` / `REVIEW_REQUIRED` if designation mechanics not represented |
| **Refusal** | If entity scope omitted → must not SATISFIED; if US designation authority UNKNOWN → `REVIEW_REQUIRED` |
| **Citations** | Investment basket, US definition, designation section |
| **Adversarial cases** | Omitted entities → SATISFIED (DEF-M2-ENTITY); empty atlas cross-ref RESOLVED_CONTROLLING (DEF-M2-XREF) |
| **Human-review** | Cross-document investment caps; guarantor release conditions |
| **Acceptance criteria** | Entity identity required before SATISFIED; incomplete inventory → `NOT_FULLY_EVALUATED` |
| **Architecture support** | **Limited:** entity tags exist; full designation/recharacterization workflow not certified end-to-end — **do not claim full product support** |

---

## Q4 — What capacity remains after a hypothetical transaction?

| Field | Requirement |
|---|---|
| **Required source documents** | Same as the governing capacity question for the contemplated action |
| **Required inputs** | Base APPROVED snapshot; current ledger; explicit pro-forma adjustments (no invented accounting); selected path; transaction entities |
| **Expected output** | Before-state; stated effects; after-state; remaining only if authoritative; `commitPlan.executed === false` unless explicit COMPLETED commit |
| **Refusal** | Missing adjustment for required pro-forma fact → `NEEDS_INPUT`; insufficient capacity → `INSUFFICIENT_CAPACITY` with shortfall |
| **Citations** | Same as path + snapshot + ledger ids |
| **Adversarial cases** | Hypo effects becoming ledger (safeguard: simulate isolation holds); nested AVAILABLE while publication withheld |
| **Human-review** | Multi-path allocation; shared-cap over-consumption |
| **Acceptance criteria** | Simulation does not mutate durable ledger; post-state null when not satisfied; remaining publication gated |
| **Architecture support** | **Yes (runtime):** Phase 4D `simulateTransaction`; product VTE publication gates |

---

## Q5 — Which document provisions constrain the proposed action?

| Field | Requirement |
|---|---|
| **Required source documents** | Full package on file for the instrument family; package-graph relationships |
| **Required inputs** | Action type; as-of date; entity scope |
| **Expected output** | Neutral list of constraining provisions with operative document id, section, authority classification, caveats |
| **Refusal** | Provisional package membership → no consolidation; WITH_CAVEATS never production-active |
| **Citations** | Each provision’s source citation + operative authority status |
| **Adversarial cases** | Future restatement tip (DEF-AUTH-1); REVIEW_REQUIRED → RESOLVED tip (DEF-AUTH-2); UNKNOWN scope → base confirmed (DEF-AUTH-3) |
| **Human-review** | Any `REVIEW_REQUIRED` / `AMBIGUOUS` / competing restatement |
| **Acceptance criteria** | Provision-level Agent #7 as-of rules; no confident CURRENT from unresolved whole-doc tip alone |
| **Architecture support** | **Strong** at Agent #7 provision path; **weak** at whole-document tip / customer-intelligence precedence |

---

## Q6 — What changes after an amendment?

| Field | Requirement |
|---|---|
| **Required source documents** | Base + amendment (+ prior AR chain); effective date evidence |
| **Required inputs** | as-of date for “before” and “after”; section-level compare inputs where available |
| **Expected output** | Bindings of changed sections; superseded vs operative language; effective date; unresolved chronology |
| **Refusal** | Pre-effective as-of must not select amendment/restatement as operative; undated amendment → unresolved |
| **Citations** | Amendment section restatement language + base section |
| **Adversarial cases** | Customer-intelligence ignores as-of (DEF-AUTH-5); wrong-facility overlay accepted into narrative (DEF-AUTH-4) |
| **Human-review** | Inferential predecessor links; type-only matches |
| **Acceptance criteria** | Historical as-of reproducible; current calc not contaminated by future tip |
| **Architecture support** | **Partial:** Agent #7 good; customer-intelligence / `computeOperativeDocument` gaps confirmed |

---

## Q7 — What additional evidence is required before an authoritative answer is possible?

| Field | Requirement |
|---|---|
| **Required source documents** | Whatever the readiness / blocker inventory names |
| **Required inputs** | Evaluation date; delivery evidence for contractual selectors; completeness cert authenticity; entity list; pro-forma adjustments |
| **Expected output** | Structured blockers: documents, counsel-executable rules, APPROVED snapshot, historical ledger, cutoff resolvable, utilization completeness, operative authority |
| **Refusal** | Must not set `canRun` true while inventing delivery dates from period asOf, or while treating empty ledger as optional for *remaining* claims |
| **Citations** | N/A — evidence checklist with pointers |
| **Adversarial cases** | `deliveredAtIsoDate = reviewedAt ?? asOf` (Mission 2 #4); Ask `canRun` without ledger (Mission 2 #5) |
| **Human-review** | Any blocker involving REVIEW_REQUIRED authority or incomplete coverage audit |
| **Acceptance criteria** | Checklist is complete and fail-closed; no silent manufacture of delivery/usage/metrics |
| **Architecture support** | **Partial:** readiness surface exists; several blockers still soft for Ask/LEGACY |

---

## Independently executable suite layout

```
tests/adversarial-intelligence/
  cross-phase-semantic-consistency.test.ts   # Mission 1
  false-confidence-omissions.test.ts         # Mission 2
  document-lifecycle-stress.test.ts          # Mission 3
docs/parallel-adversarial-intelligence/
  03-customer-acceptance-specification.md    # this file
```

Run:

```bash
npx vitest run tests/adversarial-intelligence
```

`it.fails` cases are **failing-before locks** on confirmed defects. When remediation lands, convert `it.fails` → `it` and require green.
