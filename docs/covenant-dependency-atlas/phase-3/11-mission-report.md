# Covenant Dependency Atlas — Phase 3 Mission Report

**Starting PR:** #140  
**Starting SHA:** `fdea754a4c3f2cbf6ffa34ed2355506280b0f2b7`  
**Branch:** `cursor/covenant-dependency-atlas-5021`  
**Paid inference:** none  
**Production resolver/compiler edits:** none  
**Merges / certification:** none  

## 1. Five missed-edge root causes

| # | Doc | Expected | Root cause | Family |
|---|-----|----------|------------|--------|
| 1 | CHWY | RATIO_CALCULATION → EBITDA | **Incorrect extraction boundary** | Ratio dependency |
| 2 | RIOT | COVENANT_TO_DEFINITION → Indebtedness | **Unsupported legal interpretation** (bad GT) | Covenant-family |
| 3 | RIOT | COVENANT_TO_CROSS_DOCUMENT (Security/Intercreditor) | **Covenant-family recognition** | Cross-document |
| 4 | RIOT | COVENANT_TO_SHARED_BASKET (Available Amount) | **Unsupported legal interpretation** (absent term) | Shared basket |
| 5 | RIOT | RATIO_CALCULATION (Leverage Ratio) | **Ratio / family recognition** (Actual LTV Ratio instead) | Ratio dependency |

**Fix (Atlas adapter only):** `definitionBodyWindow` uses `definitionExcerpt` + text until next definition / bound (production `charEnd` unchanged). Cross-document patterns include Collateral Documents / Custody Agreement; section-body high-risk scan added. RIOT expected edges rewritten from exact source spans.

**Small CHWY/RIOT sample after fix:** 17/17 (recall 1.0).

## 2. Expanded independent ground truth

- **135** source-authored edges (`authoredFrom: SOURCE_TEXT_SPAN`)
- Splits: development **46** / evaluation **46** / blind **43**
- Issuers: CHWY, RIOT, DSGR, LSB, FWRG, CNMD, SXI, ROCK
- Not derived from extractor output
- Fixture: `tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json`

## 3. Recall and precision

| Set | Expected | TP | FN | Recall | Precision (probe FP) | Wilson 95% recall |
|-----|----------|----|----|--------|----------------------|-------------------|
| Small CHWY/RIOT | 17 | 17 | 0 | 1.00 | — | — |
| Expanded overall | 135 | 93 | 42 | **0.689** | **1.00** (0 FP) | 0.606–0.761 |
| Development | 46 | 36 | 10 | 0.783 | 1.00 | 0.644–0.877 |
| Evaluation | 46 | 27 | 19 | 0.587 | 1.00 | 0.443–0.717 |
| Blind | 43 | 30 | 13 | 0.698 | 1.00 | 0.549–0.814 |

Denominators: recall = TP / independently authored expected; precision = TP / (TP + precision-probe FP).

## 4. Controlling-restriction risks

Still **135** open controlling-restriction risks on GT-assisted DSGR edges. Categories:

- AMBIGUOUS_REFERENCE: 68  
- AMENDMENT_TARGET_RESOLUTION: 51  
- REMOTE_CONDITIONS: 14  
- CROSS_DOCUMENT_RESTRICTIONS: 2  

Source-backed defect cards for production owners (capped sample in docs; full set local-only). **Do not invent targets.**

## 5. Definition-resolution improvements

627 MISSING_DEFINITION-class cases subtyped:

| Subtype | Count |
|---------|------:|
| TRULY_MISSING_DEFINITION | 588 |
| NON_DEFINITION_REFERENCE | 28 |
| FORWARDING_DEFINITION | 4 |
| ALIAS_OR_PLURALIZATION | 4 |
| DEFINITION_IN_ANOTHER_DOCUMENT | 3 |
| INCORRECT_EXTRACTION_BOUNDARY | 0 |
| INCORRECT_CANDIDATE_EDGE | 0 |

Coordination notes for Definition Encyclopedia + Structural Compiler recorded (forwarding one-hop; production charEnd coordination; no unsupported merge).

## 6. Cycle / diamond adjudications

Independent adjudication of 7 cycles:

- **5** TEXTUAL_REFERENCE_CYCLE_WITHOUT_CIRCULAR_CALCULATION  
- **1** STRUCTURAL_EXTRACTION_ARTIFACT (self-loop)  
- **1** GENUINE_SEMANTIC_DEPENDENCY_CYCLE (ratio/financial edges)  

Diamonds: **25** sampled, **0** false cycles from shared dependency. IPV-21 coordination note recorded.

## 7. Authentic documents

25 available texts; issuers CHWY, CNMD, DSGR, FWRG, LSB, RIOT, ROCK, SXI. Structural edges after adapter improvements: **20,328** (Phase 2 baseline was 10,932). High-risk family coverage expanded without fabrication (entity scope, shared basket, reclassification, remote conditions, amendment, financial inputs, cross-document).

## 8. Held-out integrity

- **Gibraltar:** Phase 2 labeled evaluation; Arch+Cert designates DEVELOPMENT. Phase 3 reclassified to development. Used for corpus extraction + development GT spans; connective rules not Gibraltar-tuned.  
- **Evaluation package:** `cnmd-htm-amd2` (measurement only).  
- **Knife River BLIND:** preserved unread; no body registered or opened.

## 9. Durable CKF import

Local demo store (gitignored):

- Idempotent second import: **true**  
- Unresolved preserved: **1085**  
- Source-version identity: `srcver:a707f65f9c542f265b7d5f88`  
- Duplicate handling: skip on re-import  
- `promotedToLegalTruth`: **0**  
- Peer: `cursor/covenant-knowledge-factory-7327`  
- Bulk JSON outside Git under `.local-dependency-atlas/`

## 10. SHA / tests / CI / PR

- Tests: `npx vitest run tests/covenant-dependency-atlas/` → **31 passed**  
- Rebuild: `npx tsx scripts/covenant-dependency-atlas/build-phase3.ts`  
- PR: continue #140 on `cursor/covenant-dependency-atlas-5021` (no merge)  
- Exact tip SHA: set after commit in this turn  
