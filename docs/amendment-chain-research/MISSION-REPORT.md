# Mission Report — Real-World Amendment Chain Research

**Agent:** Real-world amendment chains (`bc-01a11d8c-04a1-7063-8ba7-696cb3502926`)  
**Branch:** `cursor/amendment-chain-research-2926`  
**Date:** 2026-10-08  
**Production engine modified:** No

## Verdict

Delivered an authentic multi-issuer amendment-chain research corpus under `docs/amendment-chain-research/`: five chains with ≥3 related amendment/restatement events, plus one adversarial narrowing specimen; source manifests; chronological graphs; before/after legal-text records; unresolved-authority cases; and eight independent verification candidates aligned to Amendment Intelligence product modules without changing them.

## Coordination

No peer cloud agent named “Amendment Intelligence” was found. Coordination is documented in `coordination/amendment-intelligence-interface.md` against:

- Product substrate `lib/contract-model/compiler/amendment/` (read-only alignment)
- Covenant knowledge factory / fleet rules (path ownership: this corpus only)

## Chains (≥3 events)

| Chain | Events | Headline adversarial value |
|---|---|---|
| Coherent 2022 CA | Am1–Am5 | Same-day Am4+Am5; basket/ratio reset; §6.11(i)→(a) |
| Matthews Third A&R | Am1–Am6 | Restatement then targeted narrowing of §6.01(j) |
| AZZ 2022 CA | Am1–Am4 | Multi-era Applicable Margin in one definition |
| DSGR 2022 A&R lineage | Am3, Am4, Second A&R | Deemed retroactive effect; restatement after targeted amends |
| CONMED Seventh→Eighth | Am2, Eighth A&R, Omnibus | Wrong-parent risk; multi-definition; incorporation by reference |

Internap Seventh Amendment included as **permission-narrowing / multi-family** specimen only (Am1–6 missing; not counted toward ≥3-event requirement).

## Deliverable map

| Deliverable | Path |
|---|---|
| Corpus registry | `corpus-index.json` |
| Schemas | `schema/*.schema.json` |
| Source manifests | `chains/*/manifest.json` |
| Chronological graphs | `chains/*/chronology-graph.json` |
| Before/after text | `before-after/*.json` |
| Unresolved authority | `chains/*/unresolved-authority.json` |
| Verification candidates | `verification-candidates/VC-00*.json` |
| Adversarial index | `adversarial-index.json` |

## Explicit gaps (honest)

- Side-letter restrictions: **none located** with chain linkage this pass (`adversarial-index.json`).
- Matthews Second Amendment exhibit: **recital-only**.
- CONMED Seventh A&R body + Omnibus blackline exhibits: **missing / curated out**.
- Internap / some basket befores: **PARTIAL** (8-K narrative ≠ operative authority).
- Coherent Am1–Am3: **not re-fetched** this session; prior reconstruction cited.

## Non-goals confirmed

- No edits under `lib/contract-model/compiler/amendment/**`
- No inferred legal conclusions without source authority rows
- Waivers/consents tracked separately via non-waiver clauses + VC-007
