# Phase 3F.1.6.RX — Final Blocker Closure + Live Contract-Truth
Persistence + Targeted Independent Recertification

**Verdict: `PHASE_3F_1_6_RX_FINAL_FOUNDATION_CLOSURE_FAILED`**

Phase 3F.1.6.R remediated all 11 blockers from the frozen 3F.1.6
certification and self-reported PASS, but explicitly did not certify its
own fixes. This phase had two strictly separated parts: Part A
(production changes permitted) re-examined those 11 blockers plus 7
independently-identified new audit findings (AUDIT-F1 through F7) and
fixed what it found broken. Part B (production-frozen) then
independently tried to falsify every Part A remediation. Part B found 8
genuine, reproduced defects — so this phase's own final verdict is
**FAILED**, not PASSED. Production remains frozen at the exact commit
where Part B closed; nothing has been fixed post-freeze, per this
phase's own charter.

## Part A: what was fixed

Seven parallel isolated workstreams, each assigned one or a bundle of
the 11 frozen blockers plus specific AUDIT-F items:

| Workstream | Scope | Key fix |
|---|---|---|
| A | BLOCKER-1 | Two new root-cause structural-heading gaps (page-number-artifact whitespace collapse; `SECTION_PATTERNS` winner-take-all) |
| B | BLOCKERS 2–6 | Real production consumer wired for `supersessionStatus`; found (but couldn't fix, out of scope) a deeper coupled bug in the live orchestrator |
| C | BLOCKER-7 + AUDIT-F5 | Upgraded from format-shape check to genuine referential integrity; fixed coupled `DefinedTermNode.stableKey` staleness (71/71 rows) |
| D | BLOCKER-8 + AUDIT-F4 | Claim Identity V2 — grounded value-anchor fingerprinting + verified-quote disambiguation |
| E | BLOCKER-9 | Fixed a `CONDITIONAL_PHRASE` recall gap and a precision regression (deterministic findings could never be downgraded) |
| G | BLOCKER-11 | Re-validated the architecture-scope decision; no code change |
| H | BLOCKER-10 + AUDIT-F1/F2/F3/F6/F7 | New durable `SemanticTruthRecord` persistence; atomic `AnalysisRun` concurrency; durable partial-failure tracking; live-flow visibility card; no-log-only pre-ownership failure handling |

During integration, the orchestrating session itself closed a **newly
discovered coupled blocker** Workstream B found but was forbidden from
fixing: `lib/contract-model/analysis/orchestrator.ts` never wired a
real `NodeSupersessionIndex` into discovery at all, silently defeating
both its own `operativeLineage` and Workstream B's own context-retrieval
fix in live production. This was root-caused and closed at its single
source, not patched as a symptom.

Part A closed with `PHASE_3F_1_6_RX_REMEDIATION_READY_FOR_RECERTIFICATION`
at commit `d098cb4` — full quality gates green, known-package regression
unchanged, all 14 false-credit controls unanimous `NO_CREDIT`.

## Part B: independent, production-frozen recertification

Eight independent auditors, each pinned to the frozen commit and
forbidden from touching production code, tasked with falsifying Part
A's own claims using fresh adversarial tests against real Postgres and
source fixtures — never merely rerunning Part A's own tests.

**Genuinely closed (do not need revisiting):** BLOCKER-2, 3, 4, 7, 11
(scope-resolved), AUDIT-F1, AUDIT-F3, AUDIT-F5, and every cross-cutting
check (known-package regression, false-credit controls, tenant
isolation across all new tables, database/migration integrity, the
production-freeze-proof itself, diff classification).

**8 genuine, reproduced defects found — the reason this phase fails:**

1. **BLOCKER-1 residual** — a lowercase heading keyword off the line
   start, and a footnote-adjacent heading with only one newline before
   the next heading, are both silently dropped — the second
   demonstrably re-parents a real child SECTION to a null parent.
2. **BLOCKER-5** — `semantic/tools.ts`'s `getDefinition` tool serves
   stale definition text with no disclosure when the term has a real,
   on-file AMBIGUOUS/PARTIAL amendment — unlike its sibling
   `getOperativeProvision`, which discloses correctly in every branch.
3. **BLOCKER-6 (new coupled)** — the same `getDefinition` gap provides
   an unguarded bypass around BLOCKER-6's own otherwise-correct
   cross-reference-audit mechanism.
4. **BLOCKER-8 / AUDIT-F4** — `findCoordinateClauseSplit` performs at
   most one split per region and never recurses; a sentence fusing
   three independently-operative claims only partially separates.
5. **BLOCKER-9** — 8 of 12 new real-world condition phrasings ("upon
   the occurrence of," "as and when," passive "shall be deemed
   satisfied when," etc.) still silently bypass the verifier — the
   third occurrence of this exact defect class across three
   consecutive phases.
6. **AUDIT-F2** — a "zombie writer" gap: reclaiming a stale `RUNNING`
   `AnalysisRun` row has no fencing/lease-token protection, so a
   presumed-dead-but-actually-slow prior owner can silently overwrite a
   new owner's live state.
7. **AUDIT-F6** — the live product-flow bypass Part A itself disclosed
   is still fully reachable; the new status card's own "view findings"
   link is broken (the review page has zero `ClaimReviewItem`
   awareness).
8. **AUDIT-F7** — the fix's own `recordAnalysisFailureLog` call has no
   try/catch of its own; a single failed write there reproduces exactly
   the log-only failure mode the fix was meant to eliminate.

One genuinely positive re-interpretation: Part A's own reported DSGR
`materialUnitsWithoutClaimReviewItem: 215` figure is a measurement
artifact of the regression script's own tally (it excludes
`ALREADY_RECORDED` outcomes) — a direct database query found 0 items
actually missing. A stronger result than previously believed.

Also independently re-confirmed: the orchestrator supersession/lineage
closure this session made during Part A integration **holds end-to-end**
with real Postgres evidence, including the worst-first multi-node
attack — the single most consequential fix in Part A's own integration
work is genuinely correct.

## Gates run (Part B close)

- `npx tsc --noEmit -p .` — 6 pre-existing errors, unchanged, 0 new.
- `npx eslint .` — 1 pre-existing error, unchanged, 0 new.
- `npx vitest run` — 234 test files, 2,416 tests: 2,415 passing (the
  sole failure is the same pre-existing, environment-dependent,
  unrelated test present since before this phase began).
- `npm run build` — succeeds, 21 routes, unchanged.
- `npx prisma migrate diff` — empty; zero schema drift.
- **Production-freeze-proof**: `git diff d098cb4 HEAD -- 'lib/**'
  'app/**' 'prisma/schema.prisma' 'prisma/migrations/**'` is empty at
  the final commit — confirmed no production file was touched anywhere
  across all 8 Part B auditor commits.

## Verdict

```
PHASE_3F_1_6_RX_FINAL_FOUNDATION_CLOSURE_FAILED
```

Full detail, per-blocker/per-finding evidence citations, and exact
reproduction steps for all 8 open findings in
`docs/phase-3f1-6-rx-final-blocker-closure/33-final-verdict.json` and
`32-final-disposition-table.json`.

## Next step

Per this phase's own charter: **STOP here for human decision.**
Production is not touched again under this phase's own authority. This
is not a verdict that the architecture is unsound — every open finding
is a narrowly-scoped defect in an already-correct design (a missing
recursion step, a missing phrase in an enumerated list, a missing lease
token, a missing UI gate, a missing try/catch), each with its root
cause already identified by the auditor that found it. A future,
narrowly-scoped phase should fix exactly these 8 findings and re-run
only the targeted recertification for what changed — not a full
recertification of everything already `CERTIFIED_CLOSED` here. Do not
proceed to Phase 3F.2, do not select a new unseen package, do not touch
financial/dashboard/simulation/evaluator work.

## Artifact index

`docs/phase-3f1-6-rx-final-blocker-closure/`: 00 (baseline), 01–02
(frozen work items, audit findings), 03–08 (Part A per-blocker fixes),
09–17 (Part A AUDIT-F1/F2/F3/F6/F7 + BLOCKER-10), 18 (orchestrator
coupled-gap closure), 19–21 (Part A regression/gates/verdict), 22
(Part B baseline/freeze), 23–30 (Part B per-item recertification, one
per auditor), 31–33 (Part B gates, disposition table, final verdict).
