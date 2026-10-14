# HEADROOM — Final Phase 3 Closure Remediation

**Final verdict: `SEMANTIC_HOLDOUT_GENERALIZATION_FAILED`**
**Phase 4 readiness value: `NO_GENERALIZATION_NOT_YET_SUFFICIENT`**
**Phase 3 Contract Intelligence does NOT close.**

Full machine-readable evidence: `docs/final-phase3-closure/00-baseline.json` through `20-final-verdict.json`.

## 1. What this session was

A bounded, three-unit closure attempt on the `LIGHTWEIGHT_UNSEEN_TRUST_BOUNDARY_FAILED` verdict from the prior final-lightweight-unseen validation, which found one confirmed causal defect on the Superior Industries International Term Loan Credit Agreement package: a literal-space regex in `document-classifier.ts` failed to match doc-b's real line-wrapped caption, causing a wrong high-confidence classification and a missed doc-b RESTATES doc-a relationship (a CRITICAL dangerous silence).

- **Unit A**: fix the generalized line-wrapped document-identity defect.
- **Unit B**: prove the independent semantic verifier is operational rather than silently failing every real review call.
- **Unit C**: exercise the precommitted A1-A6/B1-B4 semantic holdout claims the original unseen run never compiled.

## 2. Unit A — classifier fix (closes cleanly)

Root cause confirmed by direct source read and synthetic reproduction: `AMENDED_AND_RESTATED_AGREEMENT` and 18 other multi-word classifier patterns used literal ASCII spaces between words, matched against raw (never whitespace-normalized) text. Real financing-document captions routinely line-wrap on any word boundary — confirmed on Superior's own real doc-b text (`AMENDED AND RESTATED\nCREDIT AGREEMENT`).

Fix: every literal-space multi-word pattern rewritten to use `\s+` (layout-whitespace tolerance, not text normalization — matches still run against raw text, preserving the position-aware Tier 2 caption-zone/ambiguity-guard logic). 15 new wholly-synthetic adversarial tests (A1-A15) plus all 316 pre-existing package-graph/classifier tests pass unmodified. Production frozen immediately after this commit — no further `lib/app/prisma` changes for the rest of the session.

Superior regression: doc-b now correctly classifies `AMENDED_AND_RESTATED_AGREEMENT`; the doc-b RESTATES doc-a relationship is now surfaced (previously absent entirely). It resolves to `UNRESOLVED` rather than `RESOLVED`/`REVIEW_REQUIRED`, due to a separate, newly-discovered, honestly-disclosed limitation: `relationship-resolution.ts`'s own recital-search window (4,000 chars) is smaller than the real distance (8,496 chars) to doc-b's own recital — out of Unit A's declared classifier-only scope, not remediated here.

## 3. Unit B — verifier health (resolves cleanly)

The frozen prior run's 13/13 `VERIFICATION_FAILED` pattern (every call logging $0.0000 — a pre-response failure signature) was investigated by direct source reading (confirming a genuine, separate observability gap: the real thrown error is captured but never persisted) and then tested live: a trivial synthetic fixture, and — more decisively — the ACTUAL full-size real payload reconstructed byte-for-byte for the first failing candidate, both succeeded cleanly through the exact same production code path with real findings and real telemetry. Disposition: **ENVIRONMENTAL/PROVIDER_TRANSPORT** (a sustained high-volume real-call window, not a code defect) — confirmed independently by Unit C's own holdout run, where 8/8 real verify calls succeeded with zero failures.

## 4. Unit C — frozen semantic holdout (the actual blocker)

All 10 precommitted A1-A6/B1-B4 GT claims were compiled and verified for real, for the first time, by locating their exact source regions directly via character offsets (bypassing discovery's own sampling, per the mission's own Section 16) — 8 unique regions, $2.7384 of a $10 authorized ceiling.

**Hard safety held completely**: every one of the 10 claims that showed a real compilation gap was explicitly, specifically flagged by the independent verifier (`MATERIAL_DISCREPANCY`/`VERIFICATION_INCOMPLETE`) — zero silently-trusted material omissions, zero false `VERIFIED` results. One finding is a particularly strong positive signal: for Consolidated EBITDA, the compiler's own `calculationExpression` was honestly tagged `UNSUPPORTED`, but its `sufficiency` field said `PARTIAL` — the verifier caught this internal inconsistency and flagged it MATERIAL, exactly the kind of self-reported-completeness overclaim the architecture exists to catch.

**Generalization did not meet target**: 0 of 6 A1-A6 claims and 0 of 4 B1-B4 claims reached a clean, fully-captured compilation. Every Article I "definitions"-only region (EBITDA's 16-addback/4-subtraction structure, Applicable Rate's multi-tier pricing grid, etc.) produced a definition object with `calculationExpression` tagged `UNSUPPORTED` and zero rules — even when the compiler was handed the entire region directly. The one region that was a genuine operative covenant provision (B4, the Section 2.05(2)(c) cash-sweep-with-cure) DID produce 2 real rules with real computed expression trees, though still incompletely. This is a real, generalizable semantic-compiler capability limit, never previously measured because the original run's `COMPILE_CAP` sampling never reached these regions.

## 5. Gates and controls

14/14 permanent false-credit controls pass. Known-package regression (FWRG/LSB/CONMED/DSGR) shows no new regression attributable to Unit A — the classifier fix is a strict superset of prior matching behavior for any single-line caption, confirmed both by reasoning and by 316/316 unchanged pre-existing tests. Full regression: TypeScript and lint unchanged from baseline; vitest shows 2 new failures beyond baseline, both fully explained as legitimate new validation-evidence directories tripping pre-existing benchmark-contamination guard tests (not a functional regression). Semantic production code (`semantic/`, `semantic-verification/`, `ir/`) remained byte-identical to the frozen SHA throughout, confirmed before and after the holdout. Independent audit found no blocker across every named risk category.

## 6. Why this verdict, not another

Section 25's own 14-item closure checklist has 12 of 14 items true. The two false items (H: A1-A6 substantive+safety gate, I: B1-B4 qualifier+safety gate) both fail on their *generalization* half, not their *safety* half. This precisely matches `SEMANTIC_HOLDOUT_GENERALIZATION_FAILED` and rules out every other verdict: the classifier needed no iteration, the verifier needs no remediation, no trust-boundary regression occurred, the environment was never blocked, and no contamination was found.

## 7. Recommended next step

A bounded remediation session targeting semantic-compiler capability for complex, multi-clause Article I financial definitions specifically — a narrower, more precisely-scoped problem than a new foundation-level audit — followed by re-running this exact same frozen A1-A6/B1-B4 holdout (already committed, reusable, no re-selection needed) to confirm the fix before any further Phase 3 closure attempt.
