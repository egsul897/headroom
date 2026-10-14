# Pre-Unseen Operative-State Integration Closure

## Purpose

The pre-unseen-classifier-remediation session's own Riot deleted-carve-out safety check disclosed, transparently but unfixed, a genuine node/document trust inconsistency: `computeOperativeDocument` (the whole-document restatement-chain resolver) could correctly establish that a document is a historical predecessor, while `buildNodeSupersessionIndex`/`getNodeSupersessionStatus` (the physical-node-level trust mechanism) remained completely blind to that fact, reporting the predecessor's own untouched physical nodes `CURRENT_OPERATIVE`. This session closes that gap.

## Governing Invariant

**Whole-document currentness places an upper bound on node/source currentness.** A node whose physical occurrence belongs to a document affirmatively established as a superseded predecessor in a `RESOLVED` operative-document chain cannot independently be trusted `CURRENT_OPERATIVE`, while remaining fully retrievable as historical evidence.

## Root Cause

Independently re-traced from production code (`docs/pre-unseen-operative-integration/01-inconsistency-trace.json`): `buildNodeSupersessionIndex` reads only `OperativeContractState.provisions` (section/definition-level amendment history) - it never reads `OperativeContractState.operativeDocument`, the whole-document restatement result `computeOperativeDocument` already computes. The two mechanisms are structurally independent code paths with no data flow between them, exactly as this mission's own governing hypothesis anticipated.

## Fix

`buildNodeSupersessionIndex` now additionally composes the already-computed `OperativeDocumentResolution` for each entry: when `operativeDocument.status === "RESOLVED"` and a document is in `predecessorDocumentIds`, every node in that document is registered in a new `documentLevelSupersededDocuments` map (keyed by documentId, not nodeId - no need to enumerate physical nodes). `getNodeSupersessionStatus` checks this map first. This is a pure composition, never a second version-chain algorithm - `chain.ts` is unmodified.

The fix reuses the existing `KNOWN_SUPERSEDED` status literal (a new `NodeSupersessionRecord.supersessionKind` field distinguishes `PROVISION_LEVEL` from `DOCUMENT_LEVEL` provenance) rather than adding a new status value, because a full consumer inventory found every real consumer already treats `KNOWN_SUPERSEDED` as the single fail-closed non-current signal - reuse means the whole consumer graph (orchestrator, semantic tools, independent verifier, coverage audit, discovery) inherits correct behavior with zero downstream code changes, and avoids the real risk of a future status-literal-unaware bypass.

Gated strictly on `status === "RESOLVED"`: ordinary amendments (no `RESTATE_AGREEMENT` effect at all) and unresolved/forked/cyclic restatement chains are structurally untouched - `computeOperativeDocument` only ever resolves `RESOLVED` when a real whole-document restatement effect exists, so "V1 as amended" never becomes historical merely because one of its own sections was amended, and uncertainty is never converted into supersession.

## Verification

- **21/21 generic synthetic/adversarial tests** (`tests/contract-model/pre-unseen-operative-integration.test.ts`, S1-S15 plus adversarial A-F) on wholly invented fixtures, using the real, unmodified production pipeline end to end.
- **Full existing regression suite**: 3115/3117 passed - the same 2 pre-existing, unrelated failures as baseline, zero new (one transient CPU-contention flake during a concurrent run was isolated, re-run, and confirmed not a real failure).
- **Known-package regression** (FWRG/LSB/CONMED/DSGR): byte-identical results via a controlled pre-fix-worktree-vs-post-fix comparison at the same commit pair.
- **14/14 permanent false-credit controls** pass, unchanged.

## Riot Deterministic Replay

Deterministic only - no AI/semantic call, no classifier/package-graph/GT changes, no post-hoc tuning. Unlike the prior session's own replay (which combined all three documents into one `runAmendmentPipeline` call), this session's replay mirrors the **real production orchestrator's own per-instrument scoping**: `buildPackageGraph`'s instrument-grouping only merges documents whose restatement relationship resolved with `RESOLVED` confidence.

This surfaces an honest, important, pre-existing architecture fact: doc-b's restatement of doc-a resolves `RESOLVED` (0.95), so doc-a and doc-b merge into one instrument; doc-c's restatement of doc-b resolves only `REVIEW_REQUIRED` (0.7, chronological-predecessor), so doc-c remains a **separate** instrument. Within instrument:doc-a's own real scope, `operativeDocument` resolves `RESOLVED`, operative = doc-b, predecessors = [doc-a] - it has no visibility into doc-c at all, and correctly never claims any.

The real, frozen `doc-a::6.01(d)` node - previously `CURRENT_OPERATIVE` at both the pre-classifier-fix commit and this mission's own starting commit - now correctly reports `KNOWN_SUPERSEDED` (`DOCUMENT_LEVEL`, superseding document doc-b). `resolveOperativeSectionEvidence` (the real production trust primitive `semantic/tools.ts` routes current-vs-historical decisions through) confirms `isCurrentTruth: false` end to end, exercised directly against real evidence, deterministically, with zero AI spend.

This session deliberately does **not** claim the fix reaches across the `REVIEW_REQUIRED` doc-b-to-doc-c instrument boundary to assert doc-a is a predecessor of doc-c specifically - no code path in this codebase, before or after this fix, makes that claim, and per the mission's own uncertainty-routing rule, none should. This is disclosed transparently as a correct non-overreach, not hidden as a residual gap.

## Independent Audit

A fresh, adversarial re-read of the full diff against a 14-item checklist (false-current-evidence paths, ordinary-amendment safety, uncertainty-routing, duplicate-logic risk, provenance, benchmark contamination, status-vocabulary reuse correctness, lookup ordering, tenant/family isolation, real-Riot closure, honest scoping disclosure, schema impact, TypeScript exhaustiveness, regression cleanliness) found no blocker. See `docs/pre-unseen-operative-integration/11-independent-audit.json`.

## Readiness

`READY_FOR_LIGHTWEIGHT_UNSEEN_CONFIRMATION` - every criterion in the required readiness gate is met, with no unmet items. This does **not** declare Phase 4 ready, and does not treat the instrument-grouping RESOLVED-only merge policy (a real, pre-existing, disclosed architecture property, out of scope for this mission) as a defect requiring further work in this session - a separate, lightweight, genuinely-unseen package confirmation remains required first.
