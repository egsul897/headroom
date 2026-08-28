# Phase 3F.1.4 — Foundation Trust-Boundary Remediation

**Verdict: `PHASE_3F_1_4_FOUNDATION_TRUST_BOUNDARY_REMEDIATION_GATE_PASSED`**

Starting SHA: `d0fbfb49fd7df777ae5700ca4474efd7e92bdd7c` (merge of Phase 3F.1.3's audit into `main`). All 15 required machine-readable artifacts live under `docs/foundation-remediation/00-*.json` through `14-*.json`; this document is the narrative report and does not restate their full content.

This phase remediated the production-foundation defects discovered by the completed Phase 3F.1.3 Foundation Assurance & Adversarial Integrity Audit. It is **not** Phase 3F.2, not a new unseen-package validation, not Phase 4, and not a rewrite of the evaluation/scoring methodology. **It does not certify that the foundation is production-ready, safe for Phase 4, or free of unknown defects** — see `docs/foundation-remediation/13-remaining-foundation-risks.json` for everything this phase left open.

---

## What was fixed

Six parallel workstreams (A–F), each isolated in its own git worktree with disjoint file ownership, fixed 5 of 6 P0 defects and 8 of 12 P1 defects from the 3F.1.3 audit:

- **Workstream A (source accounting)** — `structural-coverage.ts` now measures coverage against a node's real `charEnd`, not merely the gap to the next node's `charStart`. A new boundary-anomaly detection mechanism (`EMBEDDED_HEADING_LIKE_FRAGMENT`, `SIGNAL_DENSITY_SHIFT`) catches the non-gap "swallow" failure shape the coverage-gap fix alone couldn't. The raw-source fallback's routing no longer inherits the primary pipeline's blindness. The Q3 rank-stack-corruption defect (P1-10) was investigated and correctly determined to require an Architecture Change Proposal rather than an unreviewed parser rewrite — a bounded, detection-only mitigation (`SECTION_NUMBER_SEQUENCE_ANOMALY`) was implemented instead.

- **Workstream B (identity & isolation)** — `DefinedTermNode`'s stable key now includes `documentId`, closing the silent cross-instrument corruption where one definition row could carry a self-contradictory identity. All five `persist*` functions now tombstone stale rows inside a real transaction instead of accumulating orphans forever — and along the way, discovered and fixed that `ContractReferenceEdge` had *no* identity at all (every replay duplicated every edge). The semantic-compiler cache is now tenant-scoped. The tenant-isolation validator was extended against a full mechanical sweep of the schema, not just the two fields the audit happened to name.

- **Workstream C (package relationships)** — Built a real evidence taxonomy (`STRONG_TARGET_EVIDENCE` / `SUPPORTING_TARGET_EVIDENCE` / `CONTEXTUAL_MENTION_ONLY` / `NEGATIVE_EVIDENCE`) that now gates whether a document relationship may resolve confidently, closing the false-`AMENDS`-edge defect that could merge an unrelated agreement into the wrong instrument. Proven not to break any of 9 previously-correct scenarios, and a new positive control (a genuine multi-target amendment) confirms the fix discriminates by evidence rather than adding blanket caution.

- **Workstream D (operative state)** — Fixed the audit's single most severe finding: `buildProvisionView` no longer infers a target's validity from the mere presence of replacement text. A real, independently-derived `targetResolutionStatus` (covering both SECTION and DEFINITION targets) is now the sole gate on whether an amendment's effect may confidently attach to a provision. The independent-verification module was strengthened to catch ambiguity (not just non-existence) and wired into the live pipeline as a real gate. Conflicting same-date amendments no longer expose an arbitrary, array-order-dependent answer.

- **Workstream E (context integrity)** — Amendment-lead disclosure now generalizes to every cross-referenced section reached at any depth (with real cycle protection), not just the primary candidate's own section. Sibling context items now require actual evidence of subject-matter correspondence before being attached at full confidence — a generic keyword match alone is no longer sufficient, closing the "looks equally trustworthy as real context" contamination risk the original audit called out as its own distinct danger.

- **Workstream F (cache reproducibility, legacy quarantine, disclosure)** — The orchestrator's STRUCTURE and AMENDMENTS stage cache gates now correctly invalidate on a structural-algorithm version bump or a text change, respectively — proven in both directions (forced recompute when it should, real cache-hit when it shouldn't). A mechanical ESLint guardrail now blocks `app/` from ever importing the quarantined legacy Phase C compiler. The known scorer-circularity defect is now disclosed prominently in `docs/HEADROOM-ROADMAP.md`, exactly where a future reader would look.

## Integration

All 6 worktrees were committed and merged sequentially. Two real merge conflicts arose from intentional, coordinated overlaps (Workstream B's narrow one-line fix inside a function Workstream D was also rewriting; two workstreams both extending the same shared test file) — both were resolved by hand, keeping both sides' fixes rather than picking one arbitrarily, and verified with `tsc` afterward. A git-stash collision between two workstreams (stash refs are shared across worktrees, not worktree-local) was independently caught and recovered by both affected agents; the orchestrator verified at integration time that neither workstream's final diff carried any cross-contamination.

## Validation

- **Full test suite**: 177 files / 1739 tests / **0 failures** (up from 175/1659 at the pre-remediation baseline — all new tests from this phase's own regression and generalized-adversarial coverage).
- **Real Postgres**: every DB-backed guarantee (DefinedTermNode isolation, persistence stale-row lifecycle, tenant-blind cache, cascade/FK behavior, structural persistence) re-certified against a live database on the fully integrated tree, not just inside each workstream's isolated worktree.
- **Known-package regression** (FWRG/LSB/CONMED/DSGR, permanent regression evidence only, never unseen validation): the only observed change anywhere — CONMED +4 and DSGR +27 INFO-level findings — was traced precisely and completely to the one new detection signal Workstream A added. Zero change to error findings, package-graph resolution, node counts, or hash reproducibility.
- **Historical artifact integrity**: all 19 Phase 3F.1.3 audit artifacts and 97 other historical-phase paths confirmed byte-identical to their pre-remediation hashes.
- **Build**: `next build` completes cleanly across all 21 routes.
- **`tsc`/`eslint`**: 3 pre-existing type errors and 1 pre-existing lint-configuration error were confirmed, by direct comparison against the pre-remediation baseline, to predate this phase entirely and to be untouched by any of the 6 workstreams — disclosed rather than hidden, but not blocking, since re-litigating unrelated pre-existing hygiene was never this phase's charter.

## What remains open

Per `docs/foundation-remediation/13-remaining-foundation-risks.json`:

- **P0-6** (evaluation-methodology circularity) is explicitly deferred to a future Phase 3F.1.5, exactly as authorized — disclosed, not fixed.
- **P1-3** (upload-path dedup bypass) and **P1-11** (no supersession marker for consumers bypassing the amendment pipeline) were never assigned to any of the 6 workstreams by this phase's own charter — honestly reported as `STILL_OPEN`, not silently rounded up.
- **P1-10 / Q3** (the rank-stack-corruption failure mode) has a bounded detection signal but not a correction — it genuinely requires a reviewed Architecture Change Proposal, which this phase correctly declined to improvise.
- The 15 P2 and 6 P3 defects from the original audit were out of this phase's scope entirely, except where a workstream's own root-cause fix incidentally closed one (three did: the cross-document definition fallback, missing per-item fault isolation in `persistStructuralReferences`, and sibling-span-overlap detection).

## Verdict scope

This verdict means the known production-foundation trust-boundary defects assigned to this phase were successfully remediated under adversarial regression. **It does not mean** evaluation methodology is certified, the full foundation is finally certified, unseen validation has passed, or Phase 4 is authorized.

**Per the phase charter, this phase stops here.** No Phase 3F.1.5 work was started. The scorer was not rewritten. No new unseen package was selected or inspected. Foundation Certification was not begun. No Phase 4 work was started.
