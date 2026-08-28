# Phase 3F.1.3 — Foundation Assurance & Adversarial Integrity Audit

**Verdict: `PHASE_1_2_FOUNDATION_ASSURANCE_AUDIT_PASSED`** (audit-rigor scope — see §Z and `docs/foundation-assurance/18-final-verdict-record.json`)

Baseline: commit `3b1b037` (`PHASE_3F_1_2_STRUCTURAL_IDENTITY_REMEDIATION_GATE_PASSED`), branch `claude/headroom-scaffold-covenant-engine-jrijk8`. Production code (`lib/`, `app/`, `prisma/schema.prisma`) remained byte-identical throughout this entire audit — confirmed empty `git diff --stat` at time of this report. All 19 machine-readable artifacts live under `docs/foundation-assurance/00-*.json` through `18-*.json`; this document is the narrative report and does not restate their full content.

This audit is not a remediation phase. Per its own charter: production code frozen; defects are recorded, reproduced, proven, classified, and traced to consequences — never fixed. It found 6 P0, 12 P1, 15 P2, and 6 P3 defects in the Phase 1/2 foundation. **A `PASSED` verdict here certifies the rigor of this audit, not the current safety of the foundation for Phase 4 build-out** — see §Z for why those are different questions, and `docs/foundation-assurance/17-remediation-priority-map.json` for what should happen before Phase 4 relies on this substrate.

---

## A. Was the 3F.1.2 baseline correctly re-verified, not merely trusted?

Yes. All 16 structural invariants (I1–I16) were independently reconfirmed via 26 new tests probing angles the frozen suites don't use (byte-identical text across 10 documents, real-parser quoted-amendment collision cross-merge checks, 4-level nested clause stress, 3-way ambiguity). Zero regression found. The frozen suites' own assertions were read line-by-line and confirmed to test what they claim (ADR-text-derived, not tautological). See `docs/foundation-assurance/06-structural-consumer-assurance.json`.

## B. Did the audit find NEW failure modes, or just rediscover the historical nodeKey defect?

New failure modes were found and are the majority of this audit's findings. The historical nodeKey/occurrence-identity defect is confirmed fixed and did not recur. Genuinely different triggers were found for the *same class* of problem (shared-substrate independence failure): a case-folded, run-on section heading defeats discovery and the raw-source-fallback simultaneously — a different mechanism than the duplicate-nodeKey collision 3F.1.2 fixed. See §H and `08-shared-dependency-independence-matrix.json`.

## C. Were the 104 DB-unavailability test failures from 3F.1.2 ever counted as correctness evidence?

No, and the question is now largely moot: a real local Postgres 16 instance was available this session (started; it was simply not running in the prior session, not fundamentally unavailable). Guarantees that could not be tested were marked `NOT_PROVEN_ENVIRONMENT_BLOCKED`; nothing was rounded up. Real-DB-backed guarantees newly certified this audit include cascade/FK behavior, concurrent-write races, and real duplicate-physical-occurrence persistence — none of these had ever been tested against a real database before. See `02-tenant-instrument-isolation-results.json`.

## D. Does the raw-source → structural-representation arrow correctly account for all source text?

Partially. Wholesale non-recognition is caught (FWRG/LSB's `*-definitions.txt` documents produce zero top-level nodes, correctly flagged `STRUCTURE_FAILED`). But a **P0** defect (`DISC-01`) means a materially-real region *between* or *after* recognized nodes can be silently absorbed into a neighbor's own span and reported 100% covered — the mechanism was never asked "is this node's own end boundary correct," only "are there gaps between recognized nodes." Real per-package uncovered-character percentages (FWRG 13.70%, LSB 32.40%, CONMED 0.469%, DSGR 0.376%) were computed for the first time and show zero `UNKNOWN`-classified regions and zero `INVALID_SOURCE_SPAN` violations on real data — I12 holds in practice, but the swallow failure mode is invisible to it. See `07-source-span-accounting.json`.

## E. Is document identity distinct from structural-node identity, and correctly non-conflated?

Yes, distinct concepts exist and are not conflated in the type system. But `Document` itself has no `stableKey`/`contentHash` of its own (only `SourceArtifact`, one layer above, does) and the real, live-wired upload path bypasses that dedup layer entirely (`FA-DOCID-01`, P1) — a tested, correct dedup wrapper exists but nothing calls it. See `04-document-identity-dating-provenance-review-findings.json`.

## F. Does structural representation correctly feed definitions/references without cross-document leakage?

No — this is a **P0**. `persistStructuralDefinitions`/`persistDefinedTerms`'s stable key omits `documentId`/instrument scoping entirely, unlike `DocumentNode` and `ContractRule`. Two facilities in one company defining the same term collapse onto one internally-contradictory DB row. Independently rediscovered by two separate workstreams via different methods. In-memory `getDefinition` calls without a `documentId` argument (4 real call sites) have the same class of risk one layer up. See `02-tenant-instrument-isolation-results.json` and `12-fault-injection-results.json`.

## G. Does discovery fail closed?

Mostly. Per-section fault isolation is real (Phase 2F.2, re-verified); total failure correctly degrades to `DISCOVERY_FAILED` with zero fabricated candidates; malformed AI output is caught by a tolerant canonicalization layer. But discovery inherits `DISC-01`'s blindness completely — a swallowed region produces zero candidates with no health signal, because there was never a structural node to route to Pass A in the first place. See `05-discovery-package-context-findings.json`.

## H. Does Architecture Invariant #18 (independent-auditor substrate risk) still hold on current, post-3F.1.2 code?

**No, not for this failure mode.** A live re-test constructed a realistic PDF/HTML-extraction-artifact heading (case-folded, run into the prior section) and traced it through the real, current pipeline: no node created → discovery produces no candidate → `structural-coverage.ts` reports `STRUCTURE_HEALTHY`/100% coverage → `coverage-audit/pipeline.ts`'s own skip condition short-circuits → raw-source-fallback never runs. Mechanical independence (never reading the other's conclusions) genuinely holds; substrate independence does not. This is the same class of defect that dominated 15 of 20 quadrant-D cases in Phase 3F.1.1's forensics, reproduced live via a different trigger than the one 3F.1.2 fixed — proving 3F.1.2's fix, while real and necessary, did not close this invariant's exposure. Positive controls confirm the fallback genuinely works for total-parser-failure and density-collapse shapes; it is real, just narrower than the actual failure surface. See `08-shared-dependency-independence-matrix.json`.

## I. Does the package graph correctly resolve amendment/relationship targets without false edges?

No — **P0** (`PKG-01`). An amendment whose recital merely quotes an unrelated agreement's own dated self-reference for context (explicitly disclaiming any amendment to it) produces a second, equally-confident (0.95), `RESOLVED` `AMENDS` edge to that unrelated document. `instrument-grouping.ts` then unions the unrelated document into the same instrument cluster as the real target — genuine cross-instrument contamination. The `REVIEW_REQUIRED` flag that happens to catch this specific scenario is a coincidental multi-target side effect, not a designed defense (`PKG-02`, P1) — a single-quote variant would produce a silent, unflagged false edge. 9 of 11 other adversarial scenarios (base+amendment, guarantee targeting, joinder, restatement-vs-new-facility, supplemental indenture, intercreditor typing, same-borrower isolation, obsolete/current non-conflation, bare-mention honesty) held correctly. See `05-discovery-package-context-findings.json`.

## J. Does context retrieval achieve required recall without contaminating with irrelevant context?

Recall is strong (9/9 tested reference shapes retrieved truly-necessary context when structurally resolvable; unresolved/ambiguous-reference honesty is consistently strong — typed `UnresolvedDependency` entries, never silent omission). Two real defects found: `CTX-01` (P1) — a cross-referenced section's own pending, real, resolved amendment is never surfaced, because `retrieveAmendmentLeadsForSection` is only ever called for the primary candidate's own section. `CTX-02` (P1, WRONG-CONTEXT CONTAMINATION) — sibling proviso/shared-cap inclusion fires on generic keyword match alone with zero subject-matter check, attaching a semantically unrelated clause with the identical confidence/shape as genuinely relevant context. The audit charter explicitly names this contamination pattern as potentially worse than a missing item, since it looks equally trustworthy. See `05-discovery-package-context-findings.json`.

## K. Does the coverage audit provide real, independent assurance, or is it circular?

Both, in different senses. Its algorithmic independence from discovery/context-retrieval's conclusions is real and mechanically enforced (import-boundary checked). But it shares the same structural substrate as everything upstream, so it inherits `DISC-01`'s blind spot completely (§H). Separately, `coverage-audit/pipeline.ts` hardcodes a stale `structuralParserVersion` literal (`"phase-2a-structural-index"`) into its own content-identity fingerprint instead of the real, current `STRUCTURAL_INDEX_VERSION` constant — the two strings already disagree in the repository today, so this field cannot currently detect a structural-parser-version change at all (P2, not yet exploitable since this pipeline recomputes from scratch every call). See `10-cache-invalidation-assurance.json`.

## L. Does amendment precedence correctly classify effective dates, including conditions precedent?

Mostly, with one real gap. All four effective-dating consumers are genuinely consistent (closed-open `[effectiveFrom, effectiveTo)`, verified at the source-text operator level, not just behaviorally). But `resolveEffectiveDate` (`FA-EFFDATE-01`, P1) checks its explicit-date regex *before* checking conditions-precedent language in the same sentence — a common real drafting pattern ("effective as of December 1, 2023, subject to the satisfaction of..."), is classified as an unconditionally-applicable explicit date. The identical language without a date is correctly caught as unresolved, isolating the gap precisely to "date present + condition present." This is the inverse of Invariant #13's core concern: here, not-yet-effective language silently appears current. See `04-document-identity-dating-provenance-review-findings.json`.

## M. Does the operative-state computation ever confidently resolve when it should not?

**Yes — this is the audit's single most severe finding (P0).** An amendment effect whose target is `AMBIGUOUS` (two real physical occurrences share a label — the exact 3F.1.2 scenario, re-tested from the amendment-consumer side) or entirely `MISSING` (no matching node at all) still produces `OPERATIVE_STATE_RESOLVED`, zero `unresolvedIssues`, and a confident `currentText`, as long as the effect carries verbatim `newText`. `buildProvisionView` sets `currentText = effect.newText` unconditionally, never checking whether the underlying reference actually resolved uniquely. The one mechanism designed to independently catch exactly this (`independent-verification.ts`) would catch the `MISSING` case — but has zero real callers anywhere in the live pipeline. This directly violates the audit's own charter invariant and Architecture Invariants #11 and #13. It is not yet customer-facing, but Phase 2G's own recommended next phase (the AI Covenant Semantic Compiler) is explicitly designed to trust this exact status field. See `09-amendment-operative-state-assurance.json`.

## N. Is 3F.1.2's structural-identity fix load-bearing for the amendment layer, or does it stop short?

It stops short. 3F.1.2 correctly gives `resolveUniqueNodeByRef` an honest `AMBIGUOUS` status at the structural-index layer — real and necessary — but `operative-state.ts`, one layer up, discards that honesty the moment `newText` is present (§M). The fix delivered is real but not sufficient by itself for the amendment consumer.

## O. Does tenant isolation hold across the persisted models?

Mostly, with one real gap. `DocumentNode`, `ContractRule`, `DefinedTermNode` (across companies), and `ContractReferenceEdge` all correctly isolate by `companyId`, verified against real Postgres with byte-identical drafting across two companies. But `validateTenantIsolation` — the tool this repository relies on to catch exactly this class of leak — only checks `targetRuleId` and the package-graph edges; it never checks `ContractReferenceEdge.targetTermId`/`targetDocumentNodeId`. An injected cross-tenant edge through either field passes clean (P1). See `02-tenant-instrument-isolation-results.json`.

## P. Does instrument isolation hold within a single company?

No — **P0**. `DefinedTermNode` does not isolate across instruments (§F). `DocumentNode` and `ContractRule` do, correctly, because their stable keys include `charStart`/`sourceDocumentId` respectively. The live legacy `covenant-engine.ts` — the only calculation engine actually wired to the dashboard today — has zero `instrumentId`/`Facility` concept in its queries; whether this causes real computational conflation of two instruments' covenant capacity could not be resolved within this audit's time budget and is honestly reported `NOT_PROVEN_INSUFFICIENT_EVIDENCE` rather than rounded up either way.

## Q. Is caching anywhere silently tenant-blind?

Yes — **P1**, found independently by two different methods (a live executable cross-tenant test, and static code inspection). The semantic-compiler's default in-memory cache (`compile.ts`'s module-level singleton, used by every real current caller that omits an explicit cache option — which is all of them today) is keyed by a formula that excludes `companyId`/`instrumentKey`/`sourceDocumentId` entirely. Currently latent (no `app/` route is wired to this layer), but it is the default the moment one is. See `02-tenant-instrument-isolation-results.json` and `15-suspicious-pattern-inventory.json`.

## R. Are the orchestrator's own cache-invalidation gates trustworthy?

No — two real, live-proven gaps (P1 each). The `STRUCTURE`-stage cache gate never references `STRUCTURAL_INDEX_VERSION` — a structural-algorithm change over unchanged text is silently invisible to it, and stale nodes get resumed and re-persisted. The `AMENDMENTS`-stage cache gate is keyed on document `label` only, while the real stage function also inspects `text` — a text edit that flips amendment-shaped detection is not recompiled. Both proven against real, unmocked production code. `persistence.ts`'s upsert functions additionally never tombstone a row for content the current run no longer produces — an orphaned row from a superseded algorithm survives indefinitely, mixed in with current rows on every plain read. See `10-cache-invalidation-assurance.json`.

## S. Is the golden/evaluation infrastructure itself trustworthy, or partly circular?

Partly circular, and this is now a confirmed **systemic pattern, not a one-off (P0)**. The I1–I16 invariant suites and the coverage-audit fault-injection suite are genuinely `INVARIANT_DERIVED` — not circular. The FWRG/LSB/CONMED/DSGR ground-truth files and the founder's golden-test review are `INDEPENDENTLY_ADJUDICATED`, with disclosed caveats (single-pass AI authorship rather than external legal review; single-reviewer confirmation rather than the schema's own implied two-reviewer standard; 3 of 48 golden rows carry an unconfirmed, disclosed engineering bug in the very citation reviewed; no code path anywhere gates on `GoldenTest.status`). But the Phase 3F/3F.1/3F.1.1 scorer's known false-credit defect (structural/section-ref proximity substituting for content correspondence — 14–16 of 26 "resolved" cases were false credits per 3F.1.1's own forensics) is confirmed **still present, unmodified**, and — newly found this audit — the same defect class independently recurs in the separately-built, earlier Phase C.1 evaluator (`evaluator.ts`), just with a partial numeric-match guard that only fires for provisions carrying dollar figures. This is strong evidence of a systemic hazard in how this codebase approaches automated grading, not an isolated bug. Every historical coverage percentage computed with the affected scorer should be treated as potentially overstated by an unquantified margin. See `10-cache-invalidation-assurance.json` and `11-test-evidence-classification.json`.

## T. Is the known scorer defect adequately disclosed to future readers?

No. It exists only in `docs/phase-3f1-1-residual-safety-forensics.md` §17–20. `docs/HEADROOM-ROADMAP.md` — the document most likely to be a future session's first stop — never mentions it and reports Phase 3F/3F.1's coverage findings with no caveat. `docs/phase-3f1-2-structural-identity-remediation.md` disclaims touching the scorer but doesn't restate the caveat either. No aggregating "known limitations" ledger exists. A reader consulting either of the two most natural places to check before quoting a coverage number would not encounter this.

## U. Is the legacy Phase C compiler safely quarantined?

Reachability-wise, yes: zero imports of `orchestrator.ts`/`service.ts`/`validators.ts` anywhere under `app/` (grep-confirmed). Mechanically, no: there is no lint rule, no dependency-boundary test, nothing besides a paragraph in `HEADROOM-ROADMAP.md` stopping a future session — with no memory of the never-closed 25%→15.625% dangerous-unflagged safety gap — from wiring it back in. Recommended (not implemented): an ESLint `no-restricted-imports` rule plus a grep-based import-boundary test mirroring this audit's own reachability check.

## V. Does the raw-source-accounting mechanism ever declare uncovered text "non-material" just because the parser missed it?

No — confirmed the opposite discipline holds. Zero `UNKNOWN`-classified regions were produced across all four real known packages; every uncovered region was mechanically classified by content pattern (definitions/toc/exhibitSchedule), never defaulted to "not material." The mechanism's real limitation is §D's swallow blind spot, not a policy of downgrading unexplained gaps.

## W. Is the 1500-case fuzz suite circular?

Yes, in one specific, now-precisely-characterized sense: every corruption knob perturbs content *surrounding* a heading that is always emitted in the exact well-formed shape the parser's own regex family is built to match — it never generates a heading the parser wasn't designed to recognize, so it structurally cannot discover the Q1/Q2/Q3 swallow-and-misattachment failure class found elsewhere in this audit. Five new extension categories (OCR-style substitution, alpha/roman ambiguity, double-letter continuation, bracket markup, ARTICLE-level duplication) plus a 300-case combined stress loop were added and found **no** new I1–I16 violation — an honest negative result confirming the identity substrate's own robustness within the space the suite *can* explore, while leaving its blind spot exactly where it was. See `06-structural-consumer-assurance.json`.

## X. Were combined/compound failure scenarios tested, and did any produce emergent false certainty beyond what either fault alone would produce?

Yes, on both counts. Four of five combined scenarios produced genuine emergent false certainty: (1) an extraction-flagged-ERROR section targeted by a real amendment still resolves confidently, because `operative-state.ts` never consults the structural index's own health diagnostics; (2) an ambiguous base section plus a not-yet-effective amendment produces a confident `RESOLVED` with zero unresolved issues, because the ambiguity-detection code path only fires once an effect has actually applied; (3) a missing base-document definition falling back to an unrelated document's same-named definition, discovered by combining two individually-known gaps; (4) same-effective-date conflicting amendments correctly flag `CONFLICTED` at the status level but still populate a non-null, order-dependent `currentText`. One scenario (persistence reload + duplicated labels against real Postgres) held up correctly with no degradation. See `13-combined-failure-results.json`.

## Y. Does the repo-wide suspicious-pattern grep find anything the workstream-specific audits missed, and is there any benchmark-specific ("gaming") logic anywhere?

The suspicious-pattern grep corroborated rather than expanded the finding set (every `REAL_BUG` adjudication maps to a finding already independently reproduced by a targeted workstream) — a positive sign that the targeted adversarial testing was not missing an obviously-different class of defect a blunter grep would catch. Zero package-specific (`fwrg`/`lsb`/`conmed`/`dsgr`) matching, decision, or threshold logic was found anywhere in `lib/` or `app/`; every one of 65 grep hits is either a historical evidence-citing comment explaining a *generalized* pattern (matching the Architecture Invariants' own carve-out) or one declared-but-genuinely-unread provenance field. See `15-suspicious-pattern-inventory.json`.

## Z. Final verdict and its scope

**`PHASE_1_2_FOUNDATION_ASSURANCE_AUDIT_PASSED`.**

This verdict is about the audit, not the foundation. The foundation itself carries 6 P0 defects (`docs/foundation-assurance/16-foundation-certification-matrix.json`, `18-final-verdict-record.json`) that each represent a way the system can produce confident-looking, plausible, but silently wrong contractual state with zero error signal — exactly the failure mode this audit's own central invariant ("where Headroom does not know, Headroom must know that it does not know") exists to prevent. The foundation is **not** currently safe to build Phase 4 on top of without remediating at minimum the Tier-1 items in `docs/foundation-assurance/17-remediation-priority-map.json`.

The audit is judged `PASSED` because it met its own governing bar: it read the baseline and every governing doc in full rather than trusting summaries; it independently re-verified rather than re-affirmed the 3F.1.2 baseline; it found genuinely new failure modes rather than rediscovering the old one; it used a real database rather than rounding environment-blocked guarantees up to "proven"; it cross-corroborated findings across independently-dispatched workstreams and reconciled disagreements transparently rather than picking whichever severity was convenient; it disclosed every place its own evidence ran out (`NOT_PROVEN_INSUFFICIENT_EVIDENCE`) rather than guessing; and it left production code, historical artifacts, and prior verdicts completely untouched. Per the governing charter's own explicit terms, these are the conditions under which a `PASSED` verdict is appropriate *even when* the audit surfaces serious defects — because this is the audit gate, not the final Foundation Certification Gate.

**Per the charter, this phase stops here.** No remediation was implemented. No item from the remediation priority map was applied. No Phase 3F.2 unseen package was selected or inspected. No Phase 4 work was started. No historical evidence was rewritten — every finding in this report is a new artifact under `docs/foundation-assurance/`, and every prior phase's committed artifacts remain byte-identical.
