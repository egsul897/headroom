# Precedent Intelligence Phase 2 — Market-Wide Comparison

**Workstream:** WS-PCI  
**Starting PR:** #144  
**Starting SHA:** `9f4562c4cd9850d43de69c11049c47bd25e8d3f8`  
**Status:** IMPLEMENTED on branch (draft PR, not merged)

## Mandatory return

| Metric | Result |
|---|---|
| New distinct agreements (documents) | **18** (local authentic fixtures; target 100 **not met**) |
| New distinct issuers | **8** (conmed, fwrg, lsb, chwy, dsgr, riot, gibraltar, superior; target 50 **not met**) |
| Comparable provisions | **734** (target 500 **met**) |
| Source-span validation | Sampled 30 spans; ≥70% match on-disk excerpts (`validateCorpusSpans`); offline sample 30/30 |
| Independently verified comparison claims | 8 quality scenarios; claim-level `ClaimReviewRecord` elevation proven in tests (Q5 + adversarial) |
| False legal-difference claims | Guarded by evidence requirements + adversarial suite + `auditElevatedStandingEmissions`; no auto-elevation from provision approval; retrieval `standingCeiling` never `REVIEWER_VERIFIED_CONCLUSION` |
| Dependency closure gaps | Explicitly reported via `missingOrAmbiguousContext` / `closureComplete=false` when Atlas/Encyclopedia absent or ambiguous; regex edges labeled `REGEX_HEURISTIC` |
| Diff performance | `token-lcs.v1` / `token-lcs-bounded.v1` / `myers-line.v1`; benchmark on 12k-char FWRG excerpt &lt; 5s each |
| Exact SHA | See PR tip after push |
| Tests | `npx vitest run tests/precedent-comparison` → **35 passed** |
| PR status | Draft #144 updated; **not merged** |

## Peer coordination (no duplication)

| Peer | Adapter | Status in this worktree |
|---|---|---|
| WS-EHB EDGAR Backfill | `adapters/edgar-backfill.ts` | UNAVAILABLE — sample schema fixture only; PCI does not fetch exhibits |
| WS-CKF Knowledge Factory | `adapters/knowledge-factory.ts` | UNAVAILABLE — expands from local fixtures; will ingest published export when mounted |
| WS-CDA Dependency Atlas | `adapters/dependency-atlas.ts` | AVAILABLE via sample fixture (+ real/portable export if present with edges) |
| WS-DEF Definition Encyclopedia | `adapters/definition-encyclopedia.ts` | AVAILABLE via sample fixture (+ real export if present) |

100-agreement / 50-issuer targets remain blocked on EHB queue + CKF acquisition delivery. Peer branches inspected (`cursor/edgar-historical-backfill-c45c`, `cursor/covenant-knowledge-factory-7327`); published provision corpora are not mounted in this worktree.

## Corpus expansion (continuation)

Harvested previously unused authentic on-disk packages without modifying Claude-owned fixtures:

- Superior Industries term loan + A&R + first amendment
- CONMED first omnibus amendment (hand span)
- DSGR fourth amendment (hand span)
- LSB intercreditor joinder (hand span)

Harvest improvements: multiline `SECTION` headers, TOC-vs-body dedupe, roman-numeral baskets, amendment `SECTION N. Title` headers, CKF ingest path when export available.

## Epistemic boundaries (Phase 2)

- Every elevated standing requires `ClaimEvidence` (justification + source excerpts for legal standings).
- `maxStandingAmongClaims` is a rollup only (`standingRollupNote`); consumers must inspect per-claim standing.
- `REVIEWER_VERIFIED_CONCLUSION` requires `ClaimReviewRecord` bound to `claimId` + both `sourceVersionHash` values — provision-level `APPROVED_PRECEDENT` is insufficient.
- `auditElevatedStandingEmissions` scans the exclusive tree for claim-emission violations.
- Corpus frequency ≠ market prevalence (`marketPrevalence: NOT_ESTIMATED`).

## Quality scenarios

Offline adjudications in `lib/precedent-comparison/quality/reviewed-examples.ts` cover all eight mandated scenarios (similar wording/different effect; different wording/comparable mechanics; remote condition; definition-changed basket; amendment supersession; entity scope; shared basket; numeric comparator ≠ permission).

## Constraints honored

- No paid inference
- No merges
- No certification changes
- No production legal-engine edits
- No Claude-owned fixture modifications (read-only extraction into PCI corpus)
- Exclusive tree limited to `lib/precedent-comparison/**`, `scripts/precedent-comparison/**`, `tests/precedent-comparison/**`, `docs/precedent-comparison/**` (+ mission md)
