# Phase 3F.1.5.3 — Final Evaluation V2 Resolution: Semantic Claim Identity + Taxonomy Reproducibility

**Starting SHA:** `fe5f5c688dfcd1dae18e8d2f8958421219a0ff9b` (Phase 3F.1.5.2's close, verdict `NEEDS_ITERATION`)
**Final verdict:** `PHASE_3F_1_5_3_EVALUATION_V2_FINAL_RESOLUTION_NEEDS_ARCHITECTURE_DECISION`
**All artifacts:** `docs/evaluation-v2-final-resolution/00` through `25` plus supporting `_`-prefixed data files.

## Mission

Two independent scientific questions, not "make 85% turn green":

1. **Matching correctness** — can V2 distinguish a specific semantic claim from a sibling/sub-provision sharing family vocabulary?
2. **Taxonomy reproducibility** — can independent blinded adjudicators themselves reliably distinguish the 12 detailed evaluator states at ≥85% agreement?

## Preserved historical baseline (untouched)

- Phase 3F.1.5: binary ~78.4–84.3%, detailed 37.3%
- Phase 3F.1.5.1: binary 87.5% (42/48), detailed 18.75% (9/48)
- Phase 3F.1.5.2: binary 90.5% PASS, detailed 11.9% FAIL

None of these numbers, or any artifact under `docs/evaluation-v2/`, `docs/evaluation-v2-iteration/`, or `docs/evaluation-v2-iteration-2/`, was modified this phase.

## Workstream A — Specific Semantic Claim Identity (fixed)

**Root cause confirmed** (`01`): no dimension previously distinguished a candidate anchored at a *sibling* enumerated sub-item (same parent section, different sub-item) from a candidate anchored at the claim's own sub-item. Shared covenant-family vocabulary let sibling candidates deterministically resolve `CORRESPONDS_PARTIALLY` — a terminal outcome the live semantic judge is never consulted on — silently granting safe-surfacing/partial credit to a different, specific claim.

**Fix**: a new `I_CLAIM_IDENTITY` dimension (`claim-identity.ts`, `evaluation-v2-algorithm.v3`), purely structural (compares `sectionRef` shape via the existing `splitSectionRef()` parser), added to `BLOCKING_DIMENSIONS`. When siblings are detected, the pair is forced to `INDETERMINATE` — the only outcome the live judge ever reviews — instead of resolving deterministically.

**Verification**: 22 new adversarial tests (117/117 evaluation-v2 tests passing, zero regression on the 95 pre-existing), a single confirmed real-data correction (the exact repeat-offender candidate from 3F.1.5.2's forensics), and an at-scale correction on `fwrg-6.06-b-ii` (~30 sibling candidates correctly excluded — confirmed as the *intended*, safety-correct consequence, not a regression, even though it raises FWRG's dangerous-unaccounted count from 7 to 8). Frozen at `05-matcher-freeze.json`; **not modified for the remainder of the phase**, per Section 10's anti-gaming discipline.

Two narrower, still-open variants are explicitly out of scope and disclosed in `24` (different-base-section false matches; bare-undifferentiated-section definitional overmatch).

## Workstream B — Taxonomy Reproducibility (failed both attempts)

### Original study
- Wrote an operational rubric (`06`) formalizing the 12-state taxonomy into necessary/sufficient/exclusion conditions, precedence order, and discriminators.
- Pre-registered (`08`) the agreement formulas and gates (binary ≥90%, detailed ≥85%) *before* any adjudication.
- Built a fresh, stratified 65-case sample (`07`) spanning all 4 frozen datasets — not limited to the historical 51-case sample — force-including all 14 historical false-credit controls and all of FWRG/LSB.
- Dispatched 3 independent, mutually-isolated blinded adjudicators (no access to V2's disposition, each other, or history) against blinded evidence packets (V2's own disposition fields grep-verified stripped).
- **Result** (`12`): binary gate **passed** (94.9% mean pairwise, Fleiss κ=0.87). Detailed gate **failed** (76.7% vs 85% required). All 14 false-credit controls unanimously rejected by all three adjudicators.
- **Root cause** (`13`, `14`): 17 of 65 cases (26%) clustered entirely within `DISCOVERED_ONLY` / `DISCOVERED_REVIEW_REQUIRED` / `HONESTLY_UNSUPPORTED` confusion — 76% of them chapeau/composite claims. The rubric's shared "textual overlap with location" precondition was underspecified for composite claims and sibling-adjacent candidates. Product-actionability testing confirmed no state should be merged — the three states remain behaviorally distinct; the defect is rubric precision, not conceptual overlap.

### The one permitted redesign
- `15`: froze two precision clarifications (location-scoping for composite/chapeau claims; sibling-adjacency exclusion) extending Workstream A's already-frozen `SAME_COVENANT_FAMILY_IS_NOT_SAME_SEMANTIC_CLAIM` principle to the discovery-layer rubric — zero state merges, zero matcher changes.
- `16`: froze a fresh 22-case holdout, zero overlap with the original 65, weighted toward the two confirmed defect mechanisms.
- Re-dispatched the same three-adjudicator methodology against the replacement rubric.
- **Result** (`17`): binary gate passed again (97.0%, though with a mandatory kappa disclosure — near-zero due to extreme category skew, not a real agreement problem; the raw threshold, not kappa, is the actual gate). Detailed gate **failed again, worse** (69.7% vs 76.7% originally). A *third*, previously-unobserved confusable pair (`INCOMPARABLE` vs `DISCOVERED_ONLY`, driven by CONMED's blank-excerpt ground-truth authoring style) emerged that the redesign didn't anticipate.
- Per Section 20's explicit instruction, **no second (V3) redesign was attempted** (`18`).

One adjudicator self-reported a shared-scratchpad temp-file collision with another; investigated and found zero evidence of contamination reaching final results (zero verbatim matches, substantively independent — in places directly opposing — reasoning). Disclosed as a process/infrastructure risk (`24`, R5), not a validity threat to these results.

## V2 vs. consensus (not certified)

Because neither sample achieved detailed reproducibility, Section 20's own gate for comparing V2 against a consensus is not met. `19` discloses, informationally only, V2's binary agreement with the (binary-reproducible) adjudicator consensus: 86.2% on the original sample (9 disagreements, all V2 under-crediting) and 86.4% on the holdout (3 disagreements, all V2 over-crediting) — neither asserted as "V2 is wrong," but flagged for manual legal review (`24`, R6).

## Cost

Zero dollars spent against `AI_GATEWAY_API_KEY` this phase. The ~$5 budget approved in advance was never used, because the comparison it would have funded (V2 vs. a reproducible consensus) never became applicable — spending it would have produced a number without valid ground truth to compare against (`22`).

## Gates

- `tests/evaluation-v2/*`: 117/117 passing.
- Full repository test suite: 55 files / 117 tests fail, all with `Can't reach database server at localhost:5432` — the same pre-existing, disclosed sandbox limitation present since before this phase began; zero evaluation-v2 failures.
- `tsc --noEmit`: zero new errors; the only errors are pre-existing `tests/foundation-audit/*` issues predating Phase 3F.1.5.2.
- `eslint` on all changed files: clean.
- `npm run build`: succeeds.
- Diff classification (`23`): 41 files changed, zero forbidden categories (package/term-specific tuning, ground-truth mutation, historical-artifact mutation, production-semantic changes) — grep-verified.

## Final verdict and why

**`PHASE_3F_1_5_3_EVALUATION_V2_FINAL_RESOLUTION_NEEDS_ARCHITECTURE_DECISION`**

This is not a generic failure (no prohibited change occurred, no false credit regressed, the sibling-matching defect is genuinely fixed) and it is not a pass (Section 37: PASS means Headroom has a trustworthy instrument for measuring itself — that instrument doesn't yet exist at the detailed-label granularity). It is the specific, narrower outcome Section 36 reserves for exactly this evidence pattern: a well-designed, minimally-scoped, evidence-backed rubric redesign was attempted once, on a genuinely fresh holdout, and still could not make a 12-state detailed taxonomy reproducible.

**What is solid**: the binary credit/no-credit layer — reproducible on two independent samples, unanimous on all 14 false-credit controls, and the layer every historical false-credit incident this project has ever confirmed actually lived in. **What is not solid**: the 12-state detailed label, whose reproducibility problem is concentrated in identifiable structural clusters rather than diffuse noise — suggesting the underlying concepts are sound (per the product-actionability analysis) but the state count or rubric precision may be mismatched to what any reviewer, human or AI, can reliably discriminate from the evidence Headroom's pipeline currently records.

`25` lays out the evidence for the architecture decision without prescribing a specific replacement — that judgment call belongs to a human weighing product priorities this evidence can inform but not make.

## What happens next (per Section 40 — explicitly NOT started this phase)

EVALUATION V2 DEVELOPMENT IS **NOT** CLOSED. No Phase 3F.1.5.4 is created automatically. No residual-foundation remediation, no Phase 3F.1.6, no new unseen package, no Phase 4 work was begun. This phase stops here, at the verdict and the evidence-backed architecture question, per its own governing charter.
