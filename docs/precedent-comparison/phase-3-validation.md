# Precedent Comparison Intelligence — Phase 3 Validation

**PR:** #144  
**Reconciled starting SHA (GitHub head at Phase 3 start):** `073d3960ee7cc40fb380c1bd5740cdafa2f6369e`  
**Reported SHA in brief:** `bd8707ca2a6766dfb22d95b42c380a1d59d25bdf`  
**Status:** IMPLEMENTED on draft branch (not merged)

## 0. Git reconciliation

| Ref | SHA | Meaning |
|---|---|---|
| Brief “Reported SHA” | `bd8707c…` | Phase 2 continuation (corpus expand + epistemic audit) |
| GitHub-observed head | `073d396…` | **+1 commit** after reported: held-out Superior/Gibraltar isolation |
| Intervening change | `073d396` | `Isolate Superior/Gibraltar held-out rows from pattern stats` — additive tags/filters only |
| Overwrite check | none | Linear history `bd8707c` → `073d396`; no force-push / reset |

Full PCI suite on tip before Phase 3 edits: **36 passed**.

## Mandatory return

1. **Reconciled starting SHA:** `073d3960ee7cc40fb380c1bd5740cdafa2f6369e` (treat `bd8707c` as ancestor, not tip).
2. **Deduplicated comparable provision count:** **495** (raw 734; 239 duplicate/overlapping spans collapsed). Distinct documents **18**, issuers **8**.
3. **Independent span-audit (≥100 stratified):** exact-match **100/100 (100%)**; context-completeness **64/100 (64%)** — rates reported separately (`phase-3-corpus-audit.json`).
4. **Held-out comparison precision / recall:** precision **0.917** (den 12); recall **0.917** (den 12); textual accuracy **1.0** (n=15).
5. **False legal-difference findings:** held-out **1** (`H02`); all-splits **3** (`D18`, `D28`, `H02`) — measured, not asserted zero via elevation gates.
6. **Dependency-closure gaps:** Atlas/DEF/ACR/FDP/NCED exports largely UNAVAILABLE in this worktree; comparisons with unclosed builder/financial terms or cross-document instruments are **qualified** (`comparisonQualified`); regex edges remain `REGEX_HEURISTIC`.
7. **New authentic documents integrated via CKF:** **0** — blocked (published KF corpus export not mounted; no second SEC downloader).
8. **Diff performance / truncation:** 5-case suite (`phase-3-diff-benchmark.json`); bounded LCS marked **non-exhaustive**; Myers-line does not claim token-level exhaustiveness.
9. **Ending SHA / tests / CI / PR:** `3851c47be73a4cabf63998146646184b31af6b7d`; `npx vitest run tests/precedent-comparison` → **41 passed**; draft #144 updated; **not merged**.

## Artifacts

- `docs/precedent-comparison/phase-3-corpus-audit.json`
- `docs/precedent-comparison/phase-3-benchmark-results.json`
- `docs/precedent-comparison/phase-3-diff-benchmark.json`
- `docs/precedent-comparison/phase-3-peer-status.json`

## Constraints honored

No paid inference · no merges · no certification advancement · no production covenant-engine edits · no Claude-owned fixture modifications · exclusive WS-PCI trees only.
