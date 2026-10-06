# ADR: MODEL_CONTRACT_VIOLATION vs semantic UNSUPPORTED

**Status:** ACCEPTED (COO PASS 2026-10-06; docs-only architecture lock)  
**Date:** 2026-10-06  
**Authors:** Headroom Architect (Systems Architect)  
**Base:** main after ADR-1 (`EVIDENCE-PACKET-VERSIONING-ADR.md` ACCEPTED)  
**Does not authorize:** live/paid cert, NS-4, related-series A/C, A/B seal reopen (`semantic-accountability.v8`)  
**Related:**  
- `docs/phase-3-reliability-composition-gaps/01-non-vocabulary-disposition-contract.md`  
- `docs/architecture/BUILD-STRATEGY-GENERALIZED-HEADROOM.md` (ADR-2)  
- Stratified cert softGate / OOV standing scrutiny  
- Invariants **9**, **36**, **37**

---

## 1. Context

Pass B may emit `inventoryDisposition` strings outside the stated vocabulary  
`INTENTIONALLY_NON_COMPUTATIONAL | UNSUPPORTED | AMBIGUOUS` (e.g. live `CONSUMED_IN_EXPRESSION`).

Pass C today maps non-vocab → `UNSUPPORTED` with raw label on `modelDisposition`  
(`UNSUPPORTED_VIA_NON_VOCABULARY_DISPOSITION`). That prevents silent `MISSING`, but **collapses two different failures**:

| Failure | Meaning | Owner |
|---|---|---|
| **Illegal emit** | Model/wire violated the Pass B contract | Emitter / prompt / wire schema |
| **Honest semantic gap** | Source exceeds licensed IR | Product residual / IR roadmap |

Quiet OOV→UNSUPPORTED launders emitter bugs as covenant residuals. Standing scrutiny requires an explicit **model-contract violation diagnostic**.

## 2. Decision

**Split the diagnostics. Do not treat them as the same residual.**

### A. Legal Pass B dispositions (vocabulary)
`INTENTIONALLY_NON_COMPUTATIONAL` | `UNSUPPORTED` | `AMBIGUOUS`  
(`REPRESENTED` remains **inferred only** via lineage/value correspondence — never self-declared.)

### B. MODEL_CONTRACT_VIOLATION (new diagnostic class)
Triggered when Pass B (or wire normalizer inputs) emit:
- non-vocabulary `inventoryDisposition` string
- invented expression `kind` / wire-kind invalid (existing `SEMANTIC_WIRE_KIND_INVALID` aligns here)
- self-declared `REPRESENTED` disposition

**Required surface (normative):**
1. Inventory/accountability disposition outcome may still be fail-closed `UNSUPPORTED` for safety (no false REPRESENTED / no silent MISSING).
2. **Additionally** record a distinct diagnostic with code **`MODEL_CONTRACT_VIOLATION`** (or subtype) carrying:
   - `rawLabel` / illegal value
   - `contractRef` (vocab list + ADR id)
   - `inventoryItemId` (claim-specific — inv 37)
3. Certification / EC-V3: model-contract violations are **emitter defects**, not credit for semantic competence. They must not be rewritten as ordinary “source unsupported.”

### C. Semantic UNSUPPORTED (unchanged product meaning)
Legal `UNSUPPORTED` (or IR `kind: UNSUPPORTED`) meaning: source claim cannot be safely represented in licensed IR — including interim-B related-series after Pass C override.

## 3. Implementation boundary (follow-on code chunk — not this ADR file)

| Layer | Change when authorized |
|---|---|
| Pass C `normalizeDisposition` / reconciliation | Keep UNSUPPORTED mapping; **add** explicit MODEL_CONTRACT_VIOLATION diagnostic alongside |
| Wire schema / prompts | Prefer enum-tight dispositions; tolerant parse still allowed but must flag violation |
| Frozen §7.5(j) offline replay | Expect violation diagnostic on the three valuation items — not only UNSUPPORTED_VIA_NON_VOCABULARY |
| A/B seal | **Untouched** |

## 4. Consequences

**Positive:** honest gates; faster Pass B repair; cert won’t mistake model bugs for IR gaps.  
**Negative:** more red until prompts tighten.  
**Forbidden:** collapsing violation into quiet UNSUPPORTED without diagnostic; using violation codes to dilute interim-B series residuals.

## 5. Acceptance

- ADR merged at `docs/architecture/MODEL-CONTRACT-VIOLATION-VS-UNSUPPORTED-ADR.md` with Status ACCEPTED after COO PASS.  
- Next code PR cites this ADR and shows distinct diagnostic in offline replay or unit test.  
- No live/paid / NS-4 / series A/C hereby.

## 6. COO decision

**COO: PASS (2026-10-06).** Diagnostic split accepted. Land with Status ACCEPTED.

**Authorized after land:** small follow-on **code** chunk (Pass C `normalizeDisposition` + tests / offline replay expect violation diagnostic) under soft gates — full merge gate (Trust+CI). No live/paid. A/B seal untouched.
