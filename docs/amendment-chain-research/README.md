# Real-World Amendment Chain Research Corpus

**Owner:** Real-world amendment chains agent (`bc-01a11d8c-04a1-7063-8ba7-696cb3502926`)  
**Branch:** `cursor/amendment-chain-research-2926`  
**Scope:** Research manifests, chronological graphs, before/after legal-text records, unresolved-authority cases, and independent verification candidates.  
**Out of scope:** Production operative-state engine modifications (`lib/contract-model/compiler/amendment/**` left untouched).

## Coordination

No peer cloud agent is currently titled “Amendment Intelligence.” This corpus coordinates with:

1. **Amendment Intelligence (product substrate)** — `lib/contract-model/compiler/amendment/` (types, chain, effective-date, independent-verification). Verification candidates are shaped to exercise those contracts without changing them.
2. **Covenant knowledge factory (WS-CKF)** — may ingest manifests under `docs/amendment-chain-research/` as research-only inputs; bulk EDGAR bytes stay out of git (see `source-retrieval-notes.md`).
3. **Fleet rules (WS-PAR)** — research docs only; no sealed-evidence / certification edits.

## Layout

| Path | Contents |
|---|---|
| `schema/` | Manifest + change-record + verification-candidate JSON Schemas |
| `chains/<issuer>/` | Per-issuer source manifest, chronology graph, change ledger, unresolved authority |
| `before-after/` | Source-backed legal-text comparisons (quoted excerpts only) |
| `verification-candidates/` | Independent verification cases for Amendment Intelligence |
| `adversarial-index.json` | Cross-chain index of adversarial drafting patterns |
| `corpus-index.json` | Top-level registry of chains + coverage of mission tasks 1–12 |
| `coordination/` | Interface note for Amendment Intelligence + CKF |
| `extracts/` | Small plain-text extracts used while building records (not full agreements) |
| `MISSION-REPORT.md` | Boxed mission report deliverable |

## Authority discipline

- Every change claim cites accession + exhibit + quoted text (or an explicit `UNRESOLVED_AUTHORITY` row).
- No inferred legal conclusions without sufficient source authority.
- Waivers/consents are tagged separately from permanent amendments.
- Conditional effectiveness is never collapsed to execution date.


## Phase 2

See `MISSION-REPORT-PHASE2.md`, `phase2/`, `authority-layers/`, `as-of-scenarios/`, `test-specs/`, `knowledge-factory-export/`, and `independent-review-handoff/`.

## Phase 3

See `MISSION-REPORT-PHASE3.md` and `tests/amendment-chain-research/phase3-export-consistency.test.ts`. Challenger PR #156 was not edited.
