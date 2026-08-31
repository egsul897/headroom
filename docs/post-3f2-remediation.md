# POST-3F.2 Generalization Remediation

## Purpose

Phase 3F.2's blind unseen-package validation against Riot Platforms' credit facility failed two generalization gates: material substantive credit rate 46.2% (required ≥85%) and operative-state correctness 0/1 (required ≥95%). The governing architecture decision (`docs/post-3f2-generalization-architecture-decision.json`) traced both failures to two narrow, generic root causes rather than any fundamental IR/schema defect, and recommended two bounded, additive implementation units. This document records their implementation, testing, and regression evidence.

## Unit A: Semantic-Compiler Definition-Exhaustiveness Remediation

**Root cause**: the semantic compiler's IR/schema/normalization layers already support an arbitrary number of sibling definitions per candidate — there was no cardinality defect. The gap was (1) the compiler prompt had an exhaustiveness instruction for rules but none for definitions, and (2) nothing noticed when the model's `definitions[]` output was a strict subset of what the source text actually declared.

**What was built**:
- A "MULTIPLE DEFINITIONS" prompt instruction mirroring the existing rules instruction, with a domain-general synthetic worked example (invented "Zeta" terminology, never any real or benchmark term).
- A deterministic completeness cross-check (`completeness-check.ts`) that detects `"Term" means`/`"Term" shall mean` citation syntax in the source and compares it against the compiled output's own term labels — purely syntactic, never legal-semantic, never firing on zero detections, never inventing missing content.
- Explicit truncation-signal propagation (`evidenceTruncated` on every tool-call log entry, `TRUNCATED_EVIDENCE_USED` failure reason) so truncated evidence can never be silently treated as complete, without raising any global token/character limit.

**Verification**: 20/20 targeted tests (three-sibling extraction, 10+-definition representability, deliberate single/multiple omission detection, false-positive hardening, arbitrary terminology, truncation-never-complete, no-benchmark-strings). Full semantic-compiler + verification suite (121 tests) unchanged.

## Unit B: Package-Graph Restatement-Target-Resolution Remediation

**Root cause**: (1) the agreement-reference regex required a reference to sit immediately after "the"/"that certain", missing the equally standard recital phrasing beginning with "a"/"an"; (2) a restatement's recital conventionally quotes its chain's ORIGINAL date even on a second-or-later restatement, and nothing distinguished that from a true immediate-predecessor date; (3) the pre-existing `unresolvedTargetEffectsForThisInstrument` escape hatch existed but was never wired into the real orchestrator call site; (4) there was no consumer-level concept for "which whole document currently governs."

**What was built**:
- `AGREEMENT_REF_RE`'s determiner set generalized to include "a"/"an" (ordinary English grammar, no package-specific text).
- A generic superseding-qualifier phrase detector (`SUPERSEDING_QUALIFIER_RE`) that triggers chronological-predecessor resolution — capped at `REVIEW_REQUIRED`/0.7 confidence, never a guess, returning `UNRESOLVED` on zero or multiple candidates.
- A self-discovered confidence-propagation fix: `deterministic-parser.ts`/`pipeline.ts` previously collapsed any non-null restatement target to a flat confidence-0.9 `RESOLVED` effect regardless of the underlying resolution's real confidence — now the full resolution object (status/confidence/reason) propagates verbatim.
- `computeOperativeDocument` (new, in `chain.ts`): a generic directed-graph algorithm over resolved `RESTATE_AGREEMENT` effects, handling arbitrary chain depth, forks, and cycles, failing safe to `REVIEW_REQUIRED` on any ambiguity. Wired additively into `OperativeContractState` via `operative-state.ts`.
- The pre-existing escape hatch wired into `orchestrator.ts`'s real production call site.

No Prisma migration — confirmed empty schema diff against the pre-remediation freeze SHA.

**Verification**: 15/15 targeted tests (`post-3f2-package-graph-restatement.test.ts`, B1-B16) using a wholly synthetic 3-document restatement chain (Zenith Robotics/Meridian Capital) that mirrors Riot's structural shape without any Riot terminology.

## Full Regression

Full repository suite (280 files / 3,078 tests), TypeScript, and lint show zero new failures attributable to Unit A or Unit B — only the 2 pre-existing baseline failures (a stale fixture-directory assertion, documented before this remediation began) and one reproduced timing-flake in an unrelated module, both confirmed to pass in isolation. Known-package regression (FWRG/LSB/CONMED/DSGR), measured via a temporary git worktree at the pre-implementation commit compared against the post-remediation HEAD, is byte-for-byte identical across all four packages. The 14 permanent false-credit controls pass unchanged.

## Riot Regression Replay

This is a bounded, targeted REPLAY, not a new validation — ground truth, source, and thresholds are immutable, and only the specific candidates implicated in the original failure ledger were recompiled (3 semantic candidates, $1.69 of the $15 forecast ceiling; the package-graph/operative-state side is fully deterministic, zero cost).

- **All four previously-omitted/truncated claims are now correctly extracted**: "Final Maturity Date," "Collateral Documents" (doc-a), "Collateral Documents"/"Security Confirmation"/"Second Security Confirmation" (doc-c, after a corrective recompile identified the actual Section 1.01 definitions candidate — the architecture decision's own candidate-ID citation for this claim turned out to point at a different section), and the "Day Count Fraction" zero-floor qualifier is now captured in the compiled expression rather than silently dropped.
- **Unit B's own fixes both work correctly on real evidence**: the recital-style regex generalization detects doc-b's reference (previously zero references detected at all), and the date-ambiguity safeguard correctly resolves doc-c's true immediate predecessor (doc-b) despite doc-c's recital quoting the chain's original date.
- **A genuine, independent, pre-existing, out-of-scope defect was discovered as a byproduct**: `document-classifier.ts` misclassifies doc-a as `COMPLIANCE_CERTIFICATE` (because doc-a's own Exhibit E table-of-contents entry, "Form of Compliance Certificate," is matched ahead of its real "CREDIT AGREEMENT" title). This causes doc-b's restatement target to incorrectly resolve to doc-c, producing a cycle. `computeOperativeDocument`'s cycle-detection safeguard correctly refuses to resolve either document as operative — the safe, designed-for outcome given corrupted input, not a defect in Unit B. This defect was NOT fixed in this session (out of scope) and is flagged for a future, separately-scoped architecture decision.
- The deleted-carve-out safety check passes trivially and genuinely: since no document is ever confidently asserted as currently governing, no historical/superseded language can ever be presented as current trusted truth.

## Independent Code Audit

A fresh, adversarial re-read of the full production diff against the required checklist (Riot-specific strings, benchmark conditionals, package/section branching, hidden dictionaries, cardinality collapse, semantic invention, unsafe completeness assumptions, weakened verifier thresholds, recital false positives, fuzzy guessing, status overclaiming, stale-document leakage, unwired paths, helper-only test coverage) found no blocker. See `docs/post-3f2-remediation/10-independent-code-audit.json`.

## Readiness

`READY_FOR_LIGHTWEIGHT_UNSEEN_CONFIRMATION` — both units are complete, correct, and verified on real evidence; the shared gate's two unmet items are both explicitly hedged ("if justified by unchanged evidence") and both trace to the same disclosed, out-of-scope classifier defect, not to any incompleteness in this remediation's own work. This does **not** declare Phase 4 ready — a separate, lightweight, genuinely-unseen package confirmation remains required first and was explicitly not performed in this session.
