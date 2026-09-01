# HEADROOM — Post-Holdout Semantic Computation Architecture Remediation

**Final verdict: `SEMANTIC_REMEDIATION_NEEDS_ITERATION`**
**Phase 4 readiness value: `NOT_YET_ONE_MORE_BOUNDED_ITERATION`**
**Phase 3 Contract Intelligence does NOT close.**

Full machine-readable evidence: `docs/post-holdout-semantic-remediation/00-baseline.json` through `16-final-verdict.json`.

## 1. What this session was

The prior session (`docs/final-phase3-closure.md`) closed Units A and B of its own mission (a classifier whitespace bug; verifier health) but surfaced a new, previously-unmeasured blocker: the semantic compiler could not substantively decompose dense, multi-clause Article I financial definitions (Consolidated EBITDA's own 16-addback/4-subtraction structure) into computable IR, and `relationship-resolution.ts`'s fixed character-window scan was blind to evidence past 4,000/8,000 characters — missing Superior's own real doc-b→doc-a RESTATES relationship entirely.

This session had two independent remediation units, gated by an explicit architecture-analysis-before-implementation requirement:

- **Unit A**: fix the semantic computation architecture so dense, multi-clause financial definitions can be substantively captured, generically.
- **Unit B**: fix relationship evidence retrieval so it is not blind past an arbitrary fixed character window, using structural navigation instead of an enlarged magic number.

## 2. Architecture analysis (before any code change)

Two independent research passes (docs `00`–`06`) traced the real root causes by direct source reading, not guessing:

- **Unit A's real defect** was isolated to `normalize.ts`'s `buildComposite`: when a composite expression's own top-level type-check failed (because any single operand was itself unsupported), the function discarded the *entire* assembled operand tree — even operands that individually type-checked fine — replacing 20 real, mostly-correct clauses with one opaque `UNSUPPORTED` leaf. `type-check.ts`'s own type-inference logic was confirmed sound and untouched; the defect was purely in what got *materialized* on failure. The IR's own expression vocabulary was confirmed to already represent all ten of the mission's own synthetic representability scenarios (A–J), ruling out an IR rewrite.
- **Unit B's real defect** was the fixed-window heuristic itself, plus a second, independently-discovered whitespace-tolerance bug in `document-identity.ts`'s execution-date regex (the same defect class Mission 2 fixed in the classifier, recurring in a second file). Live reproduction against Superior's real text proved that simply widening the window would not have worked: doc-b's recital uses "PRELIMINARY STATEMENTS," not "WHEREAS," and doc-a's execution date was independently blocked by the whitespace bug.

These findings were committed (`83b96de`) with zero production code changes, satisfying the mission's own gate.

## 3. Implementation

- **Unit A**: `IRUnsupportedExpression` gained an additive, diagnostic-only `attemptedStructure` field. `buildComposite` now attaches the fully-assembled (but ultimately top-level-unsupported) draft to it instead of discarding it. A new `checkIntraDefinitionComponentCompleteness` function walks that preserved structure to report how much of a "failed" definition actually normalized successfully. `type-check.ts` was **not** modified — the UNSUPPORTED verdict, and its `type: null`, remain exactly as conservative as before.
- **Unit B**: `relationship-resolution.ts`'s `resolvePreambleBoundary` replaces the fixed window with a document's own recital block (now recognizing both `WHEREAS` and `PRELIMINARY STATEMENTS`, searched over the full text) or, absent a recital, the earliest `ARTICLE`/`SECTION` structural node — with the old fixed window kept only as a last-resort floor. `document-identity.ts`'s execution-date regex became whitespace-tolerant.

31 wholly-synthetic tests (S1–S20, R1–R12) were written and pass, including explicit anti-enumeration cases proving neither fix branches on term or entity identity. The full suite (3,163 tests) shows zero regressions attributable to this session; TypeScript and lint are unchanged from baseline. Production was then frozen at `db7f32a`.

## 4. Real evidence: zero-cost Superior regression (Unit B)

A real, deterministic (zero LLM calls) re-run of the Superior package graph against the frozen, fixed code confirms Unit B works on the actual target case: doc-b's RESTATES doc-a relationship — the original CRITICAL dangerous silence this whole engagement traces back to — now surfaces at `REVIEW_REQUIRED`/0.6, correctly *not* force-resolved to `RESOLVED` (the reference lives in a recital, not doc-b's own caption, so the existing, unmodified confidence rules correctly cap it at supporting-strength evidence). Classifications and instrument grouping are unchanged; no premature supersession was manufactured.

## 5. Real evidence: paid holdout re-run (Unit A)

With the user's authorization (up to $10, matching the prior session's own ceiling), the exact same frozen A1–A6/B1–B4 holdout was re-run against the frozen, fixed production code — same 8 source regions, same GT, same provider/model/verifier/thresholds. Total cost: $3.11579.

**The fix works exactly as designed.** Direct inspection of the real compiled output shows what was previously one opaque `UNSUPPORTED` blob per dense definition is now a mostly-well-typed, individually-inspectable tree: EBITDA's own definition preserved 17 of 18 real components (only the source-truncated clause 2 remains genuinely unsupported); Consolidated First Lien Secured Debt and Maintenance Liquidity — two GT-primary terms that were fully opaque in the prior run — now compile cleanly end-to-end with real, executable structure; the cash-sweep-cure claim now genuinely captures both real dollar thresholds ($50M and $115M) inside real rule trees with real source citations, where the prior run had neither. An entirely unplanned, honestly-disclosed side effect also emerged: the independent verifier's own findings became far more precise — citing exact clause letters and structural paths — because it can now see structure that used to be silently discarded.

**The mission's own numeric closure gates are not yet met.** A1–A6 definition-exhaustiveness moved from 0/6 to 3/6 clean substantive captures (a real, +50-percentage-point improvement) against a required ≥5/6. B1–B4 qualifier-preservation stayed at 0/4 numerically, though the same underlying evidence shows real, uncounted progress (a self-reported "complete" definition's internal overclaim caught by the verifier; both of B4's dollar thresholds now genuinely present). The hard safety requirement held completely in both directions: 0 of the 10 real claims showed a silently trusted material omission, in either this run or the prior one.

## 6. Gates and controls

14/14 permanent false-credit controls pass. Known-package regression (FWRG/LSB/CONMED/DSGR) shows no new material regression — Unit A's changes don't touch package-graph output at all, and Unit B's structural-boundary change is empirically confirmed unchanged for every pre-existing package-graph/relationship test, including those built from real historical package evidence. Full regression: TypeScript and lint unchanged from baseline; vitest's failure count actually *decreased* by one versus baseline, and the 3 remaining failures are the same pre-existing, already-explained fixture-directory guard category. Production code stayed byte-identical to the frozen SHA throughout the entire paid re-run, confirmed both before authorization and after. An independent audit checked all 14 named anti-patterns this mission explicitly warned against (Superior-specific logic, hardcoded thresholds, weakened type safety, a relationship window simply enlarged, benchmark tuning, and so on) and found zero blockers.

## 7. Why this verdict, not another

The closure checklist (`15`) has 9 of 11 items true. The two false items (F: A1–A6 substantive gate, G: B1–B4 qualifier gate) both fail on their *generalization* half, exactly as in the prior session — but this session's own evidence now precisely re-characterizes the remaining gap: it is a genuine `MODEL_DECOMPOSITION_GAP` for the hardest, densest real definition shapes (EBITDA's full clause structure end-to-end, a `DIVIDE`-based ratio, a multi-tier pricing grid, a cure mechanism's residual conditional clause), layered on top of what this session's own architecturally-sound `NORMALIZATION` fix has already resolved — not evidence the fix was wrong, and not a recurrence of the original trust-boundary defect.

## 8. Recommended next step

A further-bounded remediation session targeting model-side decomposition strategy for the specific hardest definition shapes now precisely identified — very likely a light, generic prompt or decomposition-strategy adjustment, or the bounded multi-pass ("inventory then compose then compare") architecture this session explored but did not need to implement — followed by re-running this same frozen holdout again (already twice-executed, immediately reusable) to confirm the ≥5/6 and 4/4-or-3/4-safe-failed bars are finally met.
