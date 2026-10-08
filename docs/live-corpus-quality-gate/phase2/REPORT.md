# Live Corpus Quality Gate — Phase 2 Report

**Verdict:** `LIVE_CORPUS_QUALITY_GATE_PHASE2_REPLAY_AND_TRIAGE_RECORDED`

**Starting PR:** #153
**Starting SHA:** `084405770a02f5eebe88b0b7ffb192a46fd7960c`
**Frozen evaluation content SHA:** `cebec8ab3aaecd894b1903ac0b758828655a88df`
**Generation HEAD:** `ea708993828fa3951b9373ebc5cd1dce19dfb82a`
**Paid calls:** `0`
**Certification impact:** `NONE`
**Production fixes in this branch:** `false`
**Phase-1 oracle untouched:** `true`

## 1. Original findings reproduced

- Freeze intact: **true**
- Reproduced: **45/46**
- Non-reproduced (summary drift): 0
- Status changed: 0
- New in replay: 0
- Missing in replay: 0

## 2–5. Critical adjudication / classifications

| Defect | Classification | Owning agent |
|---|---|---|
| `LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT` | SOURCE_INCONSISTENCY | Dependency Atlas |
| `LCQG-GIB-FALSE-AFFIRM-SHARED-CAP` | COMPILER_DEFECT | Covenant Knowledge Factory |
| `LCQG-SUP-AMEND-RESTATES-MISSING` | COMPILER_DEFECT | Amendment Intelligence |
| `LCQG-GIB-STRUCT-AMBIGUOUS-TOC` | COMPILER_DEFECT | Structural Compiler |
| `LCQG-GIB-XREF-LOW-RESOLVE` | COMPILER_DEFECT | Dependency Atlas |

Confirmed compiler defects: LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT, LCQG-GIB-FALSE-AFFIRM-SHARED-CAP, LCQG-SUP-AMEND-RESTATES-MISSING, LCQG-GIB-STRUCT-AMBIGUOUS-TOC, LCQG-GIB-XREF-LOW-RESOLVE
Source inconsistencies: LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT, LCQG-GIB-STRUCT-AMBIGUOUS-TOC
Evaluation-harness defects: LCQG-HARNESS-FINDING-ID-COLLISION

## 6. New authentic agreements evaluated

Shared fixture corpus contains 22 additional authentic documents beyond Phase-1 (target was 25). Gap of 3 disclosed; no fabricated documents; Knife River BLIND unread.
- Total authentic documents in gate corpus: **26**
- Additional beyond Phase-1: **22** (target 25; gap **3**)
- Blind reservation: Knife River — BLIND_BODY_UNREAD

## 7–9. Extraction metrics, legal-safety, UNVERIFIED

See `14-extraction-and-legal-safety.json` and `15-phase2-report.json`.

## 10. Reproducible commands

```bash
npm run live-corpus-quality-gate
npm run live-corpus-quality-gate:phase2
npx vitest run tests/live-corpus-quality-gate/
```

Defect tickets: `12-defect-tickets.json` (routed to Structural Compiler, Legal Core, Amendment Intelligence, Dependency Atlas, Covenant Knowledge Factory).
