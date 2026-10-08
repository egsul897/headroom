# Mandatory Data Production Checkpoint — Covenant Precedent Research

**As-of:** 2026-10-08  
**Scope distinction:** figures below separate (A) **this agent run’s new
production**, (B) **research-corpus surface**, and (C) **pre-existing
in-repo SEC package fixtures** that the interface reuses. No figure is a
legal validation claim.

---

## A. This agent run (actual)

| Metric | Measurement | Notes |
|---|---:|---|
| Real SEC filings newly discovered | **0** | No EDGAR search/acquisition this run |
| Distinct debt documents newly acquired | **0** | Reused pinned fixtures only |
| Unique instruments newly onboarded | **0** | |
| Unique issuers newly onboarded | **0** | |
| Provisions newly structurally indexed | **0** | No new Stage-1 structural pass |
| Covenant candidates newly extracted | **0** | No new discovery model pass |
| Independently verified representations newly produced | **0** | |
| Paid model / compute cost this run | **$0.00** | Provider-free; local vitest + tsx only |
| External acquisition failures | **None attempted** | DATABASE_URL unset; no live EDGAR fetch |

**What this run did produce (engineering, not validated legal knowledge):**
a CLI research interface + curated research corpus + discovery-fixture ingest
path. All research-corpus `verificationStatus` values are `FIXTURE` or
`UNVERIFIED` — **not** legally validated knowledge.

---

## B. Research corpus surface (measured)

| Metric | Curated JSON | + discovery ingest (FWRG/LSB) |
|---|---:|---:|
| Entries | 12 | **192** merged (12 curated + **180** ingested) |
| Real-issuer entries | 10 | same issuers + ingested candidates |
| Synthetic fixture entries | 2 (RFIC amendment pair) | unchanged |
| Distinct issuers (incl. synthetic) | 7 | 7 |
| Distinct real issuers (CIK present) | 6 | 6 |
| Distinct instrument keys | 7 real + 1 synthetic | same |
| Entries with SEC filing URL | 9 | all discovery-ingested rows also carry SEC URLs |
| Independently verified (`VERIFIED`) | **0** | **0** |
| Source-backed definition refs (curated) | 18 | n/a (discovery ingest does not invent defs) |
| Condition annotations (curated) | 7 | plus heuristic NO_DEFAULT tags on ingest |
| Amendment relationship edges (curated) | 4 | 0 from discovery ingest |

Curated accessions referenced: `0001193125-24-202196` (DSGR),
`0001193125-21-293207` (FWRG), `0001193125-23-303035` (LSB),
`0001174947-25-000941` (CONMED), `0001193125-26-281042` (CHWY). Gibraltar
excerpt is source-backed from the in-repo package; one curated amendment
pair is synthetic (RFIC).

---

## C. Pre-existing in-repo SEC package fixtures (measured, not produced this run)

These counts come from pinned package trees / prior phase run artifacts.
They are **not** outputs of this run and must not be reported as new
production.

1. **Real SEC filings discovered (unique accessions in package metadata):** **13**  
   FWRG 1 · LSB 1 · CONMED 3 · DSGR 4 · CHWY 1 · Gibraltar 3 (incl. related
   10-K / prior CA references in provenance).

2. **Distinct debt document files acquired (raw/extracted/curated on disk):** **35**  
   Logical debt packages ≈ FWRG, LSB (+joinder), CONMED×4, DSGR×4, CHWY×1,
   Gibraltar×1, RIOT×3, final-lightweight-sup×3.

3. **Unique instruments / issuers (package-level):** ≈ **8 issuers** with
   debt-package fixtures (FWRG, LSB, CONMED, DSGR, CHWY, Gibraltar, RIOT,
   final-lightweight/SUP). Instrument count ≈ one primary credit facility
   per package (multi-doc amendment chains share an instrument).

4. **Provisions structurally indexed (examples):**  
   - DSGR Phase-3F first blind: **4,149** nodes  
   - CHWY validation run: **1,559** nodes  
   - RIOT unseen run: **1,372** nodes  

5. **Covenant candidates extracted (examples):**  
   - DSGR 3F: **2,847**  
   - FWRG discovery run: **252**  
   - LSB discovery run: **82**  
   - RIOT: **887**  
   - CHWY deterministic pass-A: **766**

6. **Source-backed definitions + reference edges (examples):**  
   - Definitions: DSGR **1,072** · CHWY **381** · RIOT **335**  
   - Reference edges: DSGR **2,960** · RIOT **775**  
   (Definition rows carry excerpts; they are not full dependency-edge
   graphs. Reference edges are structural cross-refs.)

7. **Semantic hypotheses produced (compiled IR units / rules):**  
   - DSGR 3F: **30** compiled units → **70** rules + **80** definitions  
   - RIOT: **15** compiled units → **5** rules + **2** definitions  

8. **Independently verified representations:**  
   - DSGR 3F `candidatesFullyVerified`: **0** (28 verified attempts;
     statuses MATERIAL_DISCREPANCY 15 / VERIFICATION_INCOMPLETE 13)  
   - Research corpus: **0 VERIFIED**

9. **Unresolved / ambiguous legal issues (examples):**  
   - DSGR 3F package coverage: `PACKAGE_SEMANTICALLY_INCOMPLETE`  
   - Dangerous unaccounted units by doc gate: 696 / 718 / 15 / 781  
   - Research interface refuses capacity/permission questions rather than
     inventing resolutions.

10. **Newly discovered drafting patterns (this run):** **0 new patterns
    claimed.** Curated research intents reuse known drafting shapes
    (grower general basket, Available Amount sharing, springing FCCR,
    reclassification, synergy add-backs). No new pattern certification.

11. **Dangerous omissions / false permissions detected (prior DSGR 3F
    verifier findings, not this run):** finding-type counts include
    MISSING_BASKET 111, MISSING_RULE 49, OTHER_MATERIAL_SEMANTIC_DISCREPANCY
    32, MISSING_CONDITION 9, WRONG_ENTITY_SCOPE 9, … — **not** cleared by
    this research interface work.

12. **Processing time / cost:**  
    - This run: local tests ~0.3s for research suite; **$0** model cost  
    - Prior DSGR 3F blind run (historical artifact): wallClockMs
      25,419,744 (~7.06 h), **$9.34** (claude-sonnet-5 via gateway)

13. **GitHub SHA / PR / CI:** see live report footer below.

14. **Next executable batch / blockers:**  
    - **Done this checkpoint turn:** discovery-fixture ingest path
      (`--with-discovery-ingest`) over FWRG/LSB — unblocked, $0.  
    - **Next unblocked:** extend ingest to DSGR/CHWY/CONMED discovery or
      compiled-IR JSON already on disk; still $0 / no EDGAR required.  
    - **Blocked without policy change:** live EDGAR refresh; paid
      recompile/reverify; certification merges; claiming VERIFIED legal
      knowledge from FIXTURE/UNVERIFIED rows.  
    - **Blocked by env:** `DATABASE_URL` unset → SemanticTruthRecord
      projection empty.

---

## Footer (exact identifiers)

- **SHA:** `888d8bd3115ae929434d9f16348abd943aa16714` on `cursor/covenant-precedent-research-3e8f`
- **PR:** https://github.com/egsul897/headroom/pull/152
- **CI:** see PR checks (provider-free research tests are local; GitHub Actions
  soft-gates are separate)
