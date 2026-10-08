# PR #168 — independent IPV-16 remediation acceptance

Reviewed SHA `54325a53570c59cf54aab6e89db6c13329ac0c9d` (`cursor/ipv-16-section-override-safety-12c1`, one commit) against its
parent PR #136 at `ad7955cacae9c68a1b09998230b03908e50b8123` (merge base = parent). Both trees in detached read-only worktrees with
the challenger harness (main @ `b2740f7d`) overlaid. $0, no merge, no certification advanced, no frozen fixture edited. The
implementing agent's reported results were not used; every number below was produced here.

**Verdict: IPV16_INDEPENDENT_REMEDIATION_PASSED** — for the section-level side-letter path only. This does not make PR #136
safe (see §6).

## 1. Production diff

Four production files (+141/−28): `amendment/operative-state.ts` (`isNestedSectionRef`, `unresolvedNestedSectionProvisions`,
nested rollup inside `resolveOperativeSectionEvidence`), `candidate-span.ts` (`descendantProvisionHits` also matches a non-RESOLVED
SECTION provision through `currentSourceNodeId` / `candidateSourceNodeIds`; `withheldReasons` carried out of
`spliceDescendantAmendments` / `resolveOperativeSource`), `context-retrieval/structural-context.ts` (withhold reason = the
provision's `unresolvedIssues`; a withheld child is retained as `CHILD_RULE` with non-current evidence instead of being skipped),
`context-retrieval/cross-document-context.ts` (amendment leads for nested clause targets). One test added. Literal scan of the
production diff: no issuer, package, document, amount or section literal beyond the doc-comment example `7.01(b)`;
`isNestedSectionRef` is a `(`-bounded prefix test (`7.01` does not match `7.010`).

## 2. Adversarial replay (packages M on disk; A/B/C/H/I mutants; nested probe on H)

| # | requirement | parent `ad7955c` | PR `54325a5` | exact assertion / evidence |
|---|---|---|---|---|
| 1 | side letter overrides a child clause **without** `supersededSourceNodeIds` | provision 7.01(b): `supersededSourceNodeIds []`, `currentSourceNodeId structural-node:262bbc9b…`, status REVIEW_REQUIRED | same (the fix keys on `currentSourceNodeId`) | provision dump, package M @2026-06-30 |
| 2 | child present in structural retrieval, explicitly non-current | section 7.01 bundle: `CHILD_RULE:7.01(a), 7.01(c)` — **(b) silently dropped** | `CHILD_RULE:7.01(a)[current], 7.01(b)[non-current], 7.01(c)[current]` | `INV-16b:section-child-rule-not-silently-dropped` OK |
| 3 | parent inherits unresolved operative evidence | 7.01 bundle `hasUnresolvedOperativeEvidence: false`, OPERATIVE_SOURCE CURRENT | `hasUnresolvedOperativeEvidence: true`, OPERATIVE_SOURCE `OPERATIVE_STATE_UNRESOLVED`, text 0 chars | bundle dump M, MUT-12/13/14/15/16 |
| 4 | neither child nor parent served as CURRENT | parent served (514 chars incl. the $40,000,000 clause) as `isCurrentTruth: true` | child and parent both `isCurrentTruth: false`, text withheld | `INV-16b:clause-retrieval-withheld-or-flagged`, `…section-retrieval-does-not-serve-overridden-clause-as-current` OK |
| 5 | override identity in withholding reasons | generic "An amendment to a clause inside this text could not be applied without guessing…" | `2f269af0…: UNCLASSIFIED_OVERRIDE: this side letter, consent, or waiver names Section 7.01(b). Its effect … was not established…` on child and parent; `AMENDMENT_LEAD` items present where the lead resolves | **partial — see §5 correction**: the reason names the override *effect* (effectId) and its kind, not the override document's id/label |
| 6 | last authoritative text preserved, not treated as operative | provision `currentText` = $40,000,000 (M) / Amendment-1 $40,000,000 (MUT-14), REVIEW_REQUIRED, appliedChain unchanged | same; retrieval serves `""` for the clause and the section | `INV-16b:provision-not-resolved-last-text-preserved` OK on both |
| 7 | certification rejects the parent section | MUT-13 / MUT-12 `credit-agreement::7.01`: **CERTIFIED []**, 7.01(b) compiled at $30,000,000 | `EMPTY_OPERATIVE_TEXT` → `NOT_CERTIFIED [CANDIDATE_NOT_COMPILED, SEMANTIC_SOURCE_IDENTITY_WEAK, SOURCE_IDENTITY_WEAK, OPERATIVE_STATE_UNACCEPTABLE]`; every adversarial variant on 7.01 (A-P1/P2/P4/P5, B-P1) NOT_CERTIFIED | `INV-16b:section-with-overridden-clause-not-certified` OK; certification probe |
| 8 | no stale numerical capacity survives as executable | rule `7.01(b): 30000000` compiled and certified | compilation `undefined`, compiled 7.01(b) capacity `null`; M-P1 ("$40,000,000 as of 2026-06-30") refused on both | certification probe; acceptance `adversarial:M-P1` PASS |
| 9 | unrelated current siblings remain retrievable | — | M: 7.01(a) 44 chars CURRENT, 7.01(c) 180 chars CURRENT, 7.02 145 chars CURRENT (its `CROSS_REFERENCE:7.01(b)` non-current); MUT-13: 7.03 CERTIFIED; MUT-15: ABL 7.11 and intercreditor 4.01 CURRENT, flag false | bundle dumps |
| 10 | nested rollup without hardcoding | H + side letter naming `Section 7.03(c)(ii)`: 7.03(c)(ii) withheld but **7.03(c) and 7.03 served CURRENT** (`flag: false`) | 7.03(c)(ii), 7.03(c) and 7.03 all withheld, reason names the override; 7.03(a)/(b) CURRENT; 7.02, 7.11, intercreditor 4.01 untouched (`flag: false`) | nested probe, two levels deep; no section literal in code |

Cross-document contamination probe (B + side letter naming `Section 1.01`, present in both agreements): effect stays unattached
(`?#1.01`, unattached 1), credit-agreement 7.01/7.02 served CURRENT with `flag: false`, indenture 4.09 unchanged — identical on
both trees. No contamination introduced. (A sub-clause the parser does not mint — D `7.05(k)(ii)` — also stays unattached and
withholds nothing on either tree; pre-existing, outside this PR.)

## 3. INV-16b and the mutants

| | parent | PR |
|---|---|---|
| INV-16b PRODUCT | 3/5 (section-retrieval, section-certification FAIL) | **5/5**; both observations (reason names override; child retained) now OK |
| invariants overall | 55/60 PRODUCT | **57/60** (remaining: INV-04 ×2 back-reference gap, INV-18 inflected terms — unrelated) |
| MUT-08/12/13/14/15 | KILLED via `context:<pkg>-7.01(b):definitions` / `context:H-7.02(d)` | KILLED; PR additionally fails `context:<pkg>-7.01:definitions` (section text now withheld) |
| MUT-16 | SURVIVED | KILLED via `context:I-7.02:definitions` |
| killed / total | 20 / 22 | 21 / 22 |

Direct product safety controls (all pass on the PR): PRODUCT verdicts `instrument-status` (not RESOLVED) and `effects:side-letter`
(effect attached to the named provision) on all six mutants; INV-16b 5/5; `NOT_CERTIFIED` on the parent unit with no compiled
capacity. **Every deterministic-layer kill remains incidental**: the kills come from manifest definition rows that cannot be
satisfied once the clause (and now the section) text is withheld (`context:*:definitions`, `context:H-7.02(d)` undefined
terms). They are the expected shadow of withholding, not detection in their own right; the detection is the PRODUCT verdicts.

## 4. Regression evidence

| gate | parent | PR | note |
|---|---|---|---|
| product-acceptance corpus (14 packages) | 755: 681/55/19 | 752: 677/56/19 | only package M changes: `certification:credit-agreement::7.01` finding resolved (NOT_CERTIFIED, fail-closed), two new fail-closed rows (`semantic:7.01` EMPTY_OPERATIVE_TEXT, `context:M-7.01:definitions`). **No other package, no severity change, no certification result change** → no over-withholding on A–L, N |
| `tests/stratified-cert` | 60/60 | 60/60 | |
| `npm run test:phase3-certification` | 456/459 (3 fail) | 456/459 (**same 3**) | `certified/xref-fixtures.test.ts` 7.04 REVIEW vs CERTIFIED, SA-2 §26, §13–15 graph — pre-existing on #136, inherited |
| 8 amendment/retrieval/operative-state test files | 111/113 | 112/114 (**same 2 failures**, +1 new test passing) | `f4-authenticated-retrieved-evidence` (stale precondition) and `phase-3f1-operative-state-honesty` #40 (instrument-isolation leak, #136 regression, doc 21) |
| full `tests/contract-model` (no DB) | 27 failed / 3,608 passed | 26 failed / 3,610 passed | failure sets identical except one timing probe (`part-b-terminal-recert-open3`) failing only on the parent; 95 `DATABASE_URL` / Prisma-init failures on both — **DB-backed suites not exercised** (no Postgres in this environment) |
| `npx tsc --noEmit -p .` | 14 errors | 14 (**identical**) | pre-existing Prisma-client field errors (`app/[companyId]/ledger/*`, `lib/coherent.ts`, `tests/ledger/supersede-ledger-entry.test.ts`) |
| GitHub `canonical-compiler` / certified path | failure | failure (same 3 assertions) | `stratified-cert`, soft gates green on the parent; not re-run on the PR head by path filter |

Over-withholding review of the diff: `descendantProvisionHits` admits only non-RESOLVED **SECTION** provisions (definitions
excluded) whose current/candidate source node is a descendant; the corpus diff above shows it fires only where an override is
attached. `unresolvedNestedSectionProvisions` filters by `sectionRef` only (no `documentId`), which is safe while an operative
state has a single base document (true today) — worth a one-line guard if multi-base instruments appear.

## 5. Required minimal correction (non-blocking for this verdict)

Item 5 is met only in substance. `detectUnclassifiedOverrides` writes `unresolvedReason` as
`UNCLASSIFIED_OVERRIDE: this side letter, consent, or waiver names Section X …`; the effectId prefix identifies the effect, and the
document is recoverable through `effect.amendmentDocumentId`, but a reader of the bundle never sees the override **document**
(`side-letter` / "Side Letter"). Minimal correction: include `input.document.documentId` (and label) in that reason string in
`lib/contract-model/compiler/amendment/unclassified-override.ts`, so clause- and section-level withhold reasons and `CHILD_RULE`
descriptions name the instrument. One string change, no behavioural effect on the controls above.

## 6. Scope limits

Passing this PR closes the section-level certification path for an **attached** unclassified override. It does not change:
unattached overrides (ambiguous or non-node targets) still withhold nothing beyond the instrument status; the #136 instrument-
isolation regression (3f1 #40); INV-04 back-references; IPV-01/22/24 on #136; the three certified-path failures #136 already
carries. PR #136 as a whole is not declared safe by this review.

## 7. Repro

```
git fetch origin refs/pull/168/head refs/pull/136/head
git worktree add --detach <wt> 54325a53570c59cf54aab6e89db6c13329ac0c9d   # and ad7955cacae9c68a1b09998230b03908e50b8123
# overlay scripts/product-acceptance, tests/product-acceptance, tests/fixtures/product-acceptance from main
npx tsx scripts/product-acceptance/run-invariants.ts; run-mutations.ts; run-all.ts --out <dir>
npx vitest run tests/stratified-cert; npm run test:phase3-certification; npx tsc --noEmit -p .
# probes (session scratchpad): provision + bundle dumps for M / MUT-12..16; nested H 7.03(c)(ii); B ambiguous 1.01; certification of MUT-12/13/15 via runSemanticStage
```
