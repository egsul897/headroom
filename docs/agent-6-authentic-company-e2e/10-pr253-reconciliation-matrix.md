# Agent 6 (PR #226) ↔ Canonical PR #253 reconciliation matrix

## Identity

| Item | Value |
|---|---|
| Agent 6 branch | `cursor/agent6-authentic-company-e2e-aebc` (PR #226) |
| Agent 6 HEAD | `f4237e7b8a2ecd1c3d2353c21b9bf986d6dd0c14` |
| Canonical branch | `cursor/canonical-integrated-product-10ff` (PR #253) |
| #253 tip SHA (branch HEAD) | `85d52b93e23b3a813890651d27358d5826a91ede` |
| #253 functional tip (docs) | `58ae735f28afd5f26bf48392ac3b1152dfb3e275` |
| Merge-base | `7f1dd3a202b026b9a862ef727480a1a9f284523a` (`Merge pull request #237` utilization authority) |
| Agent 6 files since MB | 103 |
| #253 files since MB | 170 |
| Path overlap (both edited since MB) | **1** — `lib/contract-model/compiler/package-graph/instrument-grouping.ts` |

## Status counts (Agent 6 changed files)

| agent6_status | count |
|---|---|
| ADDITIVE_AGENT6 | 93 |
| TESTS_REQUIRED | 7 |
| NEEDS_API_ADAPTATION | 2 |
| CONFLICTING | 1 |

## Classification legend

- **ALREADY_IN_253** — Agent 6 delta already present/subsumed on #253 tip (none of the A6-unique deltas).
- **ADDITIVE_AGENT6** — Only on Agent 6; textual apply onto #253 is clean (or new file).
- **CONFLICTING** — Both sides edited the same path differently; manual merge required.
- **NEEDS_API_ADAPTATION** — Port requires aligning to #253 API/behavior (esp. verified-execution).
- **SUPERSEDED** — Agent 6 approach replaced by #253 (none for A6 compiler/harness work).
- **TESTS_REQUIRED** — Must land/re-run tests as part of port.

## Theme notes (Phase 3/4, #237, #231)

| Theme | Finding |
|---|---|
| Utilization (#237) | In **merge-base**. Agent 6 does not re-implement utilization authority; harnesses/docs assert DO_NOT_INVENT / withheld remaining. #253 adds `utilization-honesty`, attributed-utilization, product gates on top of same #237 floor. **No SUPERSEDED A6 utilization code.** |
| Debt/lien (#231) | **#253-only** (solver election, secured-debt-lien-binding tests, packageAuthoritative MODELED_CROSS_DOCUMENT). Agent 6 has zero solver/debt-lien file edits. Orthogonal; provisional instrument families do not replace lien dual-path. |
| Verified / sequential execution | **#253 owns** `verified-execution.ts` expansion + new `sequential-execution.ts` and product runners. Agent 6 baselines call `attemptAuthenticatedVep` / document REQUIRE refusals — complementary evidence, not a competing sequential engine. Port of `authenticated-vep-offline.test.ts` + `run-execution-baseline.ts` needs outcome revalidation on #253 tip. |
| package-graph | Sole true edit conflict. See deep-dive below. |
| discovery / stage-structure | Agent 6 additive; #253 untouched since MB. |

## Deep dive: `compiler/package-graph`

| path | A6 since MB | #253 since MB | agent6_status | merge guidance |
|---|---|---|---|---|
| `instrument-grouping.ts` | +160/−45 PROVISIONAL_FAMILY | +1/−1 FINANCIAL_STATEMENT in NON_INSTRUMENT_TYPES | **CONFLICTING** | Take A6 logic; re-insert `FINANCIAL_STATEMENT` into NON_INSTRUMENT_TYPES; keep defense-in-depth that RESOLVED+SUPPORTING never trusted-confirms (section8 P1-7). Associative path is REVIEW_REQUIRED-only. |
| `types.ts` | +20 associationKind fields | unchanged | ADDITIVE_AGENT6 | Apply A6; required by grouping merge. |
| `pipeline.ts` | version bump v1.1-provisional-family | unchanged | ADDITIVE_AGENT6 | Apply with grouping merge. |
| other package-graph/* | unchanged on A6 | unchanged | — | No further conflicts. |

### Conflict mechanics

1. #253 one-liner sits on the same `NON_INSTRUMENT_TYPES` initializer A6 reformatted/extended around — `git apply` fails both directions.
2. A6 tip **lacks** `FINANCIAL_STATEMENT` exclusion → merging A6 onto #253 without the FCE line would let financial statements enter instrument clustering.
3. #253 tip **lacks** PROVISIONAL_FAMILY → loses A6-D4 discovery association + `mayConsolidateOperativeAgreement` safety gate.
4. Expected post-merge: NON_INSTRUMENT includes FINANCIAL_STATEMENT; associative REVIEW_REQUIRED edges yield `associationKind=PROVISIONAL_FAMILY` + `reviewStatus=REVIEW_REQUIRED`; RESOLVED+STRONG remains CONFIRMED; RESOLVED+SUPPORTING still does not trusted-union (section8).

## File-by-file matrix (Agent 6 changed paths)

| path | agent6_status | notes |
|---|---|---|
| `docs/agent-6-authentic-company-e2e/00-expectation-pins.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/01-package-selection.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/02-independent-expected-outcomes/benchmark-2025.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/02-independent-expected-outcomes/benchmark-2025.md` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/02-independent-expected-outcomes/insulet-2021-2026.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/02-independent-expected-outcomes/insulet-2021-2026.md` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/02-independent-expected-outcomes/knife-river-2023-2026.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/02-independent-expected-outcomes/knife-river-2023-2026.md` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/00-ingest.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/01-structural.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/02-package-graph.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/02b-pass-a-deterministic.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/03-amendment-operative.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/04-financial-utilization.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. Utilization theme: #237 authority already in merge-base; A6 evidence asserts DO_NOT_INVENT / withheld remaining — aligned with #253 utilization-honesty, not duplicated implementation. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/05-transactions.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/06-position-report.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/07-scorecard.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/benchmark-2025/08-comparison.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/00-ingest.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/01-structural.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/02-package-graph.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/02b-pass-a-deterministic.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/03-amendment-operative.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/04-financial-utilization.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. Utilization theme: #237 authority already in merge-base; A6 evidence asserts DO_NOT_INVENT / withheld remaining — aligned with #253 utilization-honesty, not duplicated implementation. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/05-transactions.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/06-position-report.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/07-scorecard.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/insulet-2021-2026/08-comparison.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/00-ingest.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/01-structural.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/02-package-graph.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/02b-pass-a-deterministic.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/03-amendment-operative.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/04-financial-utilization.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. Utilization theme: #237 authority already in merge-base; A6 evidence asserts DO_NOT_INVENT / withheld remaining — aligned with #253 utilization-honesty, not duplicated implementation. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/05-transactions.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/06-position-report.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/07-scorecard.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/03-runs/knife-river-2023-2026/08-comparison.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/04-scorecards/aggregate.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/04-scorecards/benchmark-2025.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/04-scorecards/insulet-2021-2026.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/04-scorecards/knife-river-2023-2026.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/05-defect-register.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/06-execution-baseline/aggregate.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. Phase3/4 verified-execution theme: A6 baselines record REFUSAL/stop-stages; #253 owns sequential verified composition — do not treat A6 refusals as competing engines. |
| `docs/agent-6-authentic-company-e2e/06-execution-baseline/authentic-capacity-attempt.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. Utilization theme: #237 authority already in merge-base; A6 evidence asserts DO_NOT_INVENT / withheld remaining — aligned with #253 utilization-honesty, not duplicated implementation. Phase3/4 verified-execution theme: A6 baselines record REFUSAL/stop-stages; #253 owns sequential verified composition — do not treat A6 refusals as competing engines. |
| `docs/agent-6-authentic-company-e2e/06-execution-baseline/benchmark-2025/baseline.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. Phase3/4 verified-execution theme: A6 baselines record REFUSAL/stop-stages; #253 owns sequential verified composition — do not treat A6 refusals as competing engines. |
| `docs/agent-6-authentic-company-e2e/06-execution-baseline/discovery-coordination.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. Phase3/4 verified-execution theme: A6 baselines record REFUSAL/stop-stages; #253 owns sequential verified composition — do not treat A6 refusals as competing engines. |
| `docs/agent-6-authentic-company-e2e/06-execution-baseline/insulet-2021-2026/baseline.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. Phase3/4 verified-execution theme: A6 baselines record REFUSAL/stop-stages; #253 owns sequential verified composition — do not treat A6 refusals as competing engines. |
| `docs/agent-6-authentic-company-e2e/06-execution-baseline/knife-river-2023-2026/baseline.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. Phase3/4 verified-execution theme: A6 baselines record REFUSAL/stop-stages; #253 owns sequential verified composition — do not treat A6 refusals as competing engines. |
| `docs/agent-6-authentic-company-e2e/07-product-benchmark/aggregate.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/07-product-benchmark/benchmark-2025.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/07-product-benchmark/insulet-2021-2026.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/07-product-benchmark/knife-river-2023-2026.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/08-discovery-completeness-audit/aggregate.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/08-discovery-completeness-audit/benchmark-2025.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/08-discovery-completeness-audit/insulet-2021-2026.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/08-discovery-completeness-audit/knife-river-2023-2026.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/09-legal-interpretation-activation-plan.json` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `docs/agent-6-authentic-company-e2e/MISSION-REPORT.md` | ADDITIVE_AGENT6 | A6 mission/evidence artifacts only; #253 has parallel docs under docs/product/unified-integration/* but different scope. Not superseded. Keep as Agent6 provenance; refresh SHAs after rebase onto #253. |
| `lib/contract-model/compiler/deterministic-extraction/html-text.ts` | ADDITIVE_AGENT6 | A6-only; clean apply. Hex numeric entities + CP1252 C1 curly-quote remap. Surfaced on Benchmark/Insulet EDGAR HTML. No #253 overlap. |
| `lib/contract-model/compiler/discovery/eligibility.ts` | ADDITIVE_AGENT6 | New on A6; absent from #253. Agent1 conservative Pass A eligibility (executableCount always 0). Orthogonal to #253 product stack. |
| `lib/contract-model/compiler/discovery/pass-a-signals.ts` | ADDITIVE_AGENT6 | A6-only; clean apply. Exports isCovenantHeadlineHeading for completeness audits (inventory signal, not executable discovery). |
| `lib/contract-model/compiler/package-graph/instrument-grouping.ts` | CONFLICTING | Both sides edit since merge-base. #253 adds FINANCIAL_STATEMENT to NON_INSTRUMENT_TYPES (+1 line). Agent6 adds PROVISIONAL_FAMILY / associative REVIEW_REQUIRED+SUPPORTING\|STRONG grouping (+160/−45), exports isTrustedGroupingEdge/isAssociativeGroupingEdge/isLegallyConfirmedAmendmentChain/isProvisionalInstrumentFamily/mayConsolidateOperativeAgreement. Neither patch applies cleanly onto the other tip. Merge must keep FINANCIAL_STATEMENT AND provisional-family semantics. Re-run section8-package-relationship-independent + tests/agent6/a6-d4-* after merge. A6 currently omits FINANCIAL_STATEMENT — porting A6 alone would regress FCE DocumentType exclusion. |
| `lib/contract-model/compiler/package-graph/pipeline.ts` | ADDITIVE_AGENT6 | A6-only since MB; clean apply. Bumps PACKAGE_GRAPH_PIPELINE_VERSION to v1.1-provisional-family. Co-requisite with instrument-grouping conflict resolution. [package-graph] |
| `lib/contract-model/compiler/package-graph/types.ts` | ADDITIVE_AGENT6 | A6-only since MB; clean apply onto #253. Adds InstrumentAssociationKind + optional associationKind/provisionalDocumentIds on InstrumentGroupingResult. Co-requisite with CONFLICTING instrument-grouping merge. Optional fields are backward-compatible for #253 orchestrator/covenant-association consumers. [package-graph] |
| `lib/contract-model/compiler/stage-structure.ts` | ADDITIVE_AGENT6 | A6-only; clean apply. ARTICLE lookahead accepts bare decimal section after ALL-CAPS title; SECTION pattern allows leading whitespace + requires trailing period (BofA/Benchmark drafting). No #253 overlap. Re-verify structure fixtures after port. |
| `package.json` | ADDITIVE_AGENT6 | A6-only scripts: agent6:authentic-e2e, agent6:execution-baseline, agent6:discovery-audit, test:agent6. #253 did not touch package.json since MB — clean apply. |
| `scripts/agent6/audit-discovery-completeness.ts` | ADDITIVE_AGENT6 | New A6 script; absent from #253. Uses stage-structure/package-graph/discovery surfaces A6 also ships. No direct edit of #253 sequential/FCE/solver modules. Re-run after package-graph merge. |
| `scripts/agent6/run-authentic-company-e2e.ts` | ADDITIVE_AGENT6 | New A6 script; absent from #253. Uses stage-structure/package-graph/discovery surfaces A6 also ships. No direct edit of #253 sequential/FCE/solver modules. Re-run after package-graph merge. |
| `scripts/agent6/run-execution-baseline.ts` | NEEDS_API_ADAPTATION | New A6 harness. Imports package-graph + eligibility + attempt-authenticated-vep; documents evaluateVerifiedCapacity REQUIRE refusal honesty. Does not implement sequential/#231 solver paths. After port onto #253, align narrative/blocker codes with canonical verified-execution + utilization-honesty APIs (#237 already in merge-base). Depends on CONFLICTING instrument-grouping PROVISIONAL_FAMILY fields. |
| `tests/agent6/a6-d4-provisional-instrument-family.test.ts` | TESTS_REQUIRED | New Agent6 regression/scorecard suite — must be included when porting A6 onto #253. a6-d4 + execution-baseline tests gate PROVISIONAL_FAMILY safety; structure/html/eligibility tests gate compiler fixes. Status also ADDITIVE_AGENT6 (absent on #253). |
| `tests/agent6/authentic-e2e-scorecard.test.ts` | TESTS_REQUIRED | New Agent6 regression/scorecard suite — must be included when porting A6 onto #253. a6-d4 + execution-baseline tests gate PROVISIONAL_FAMILY safety; structure/html/eligibility tests gate compiler fixes. Status also ADDITIVE_AGENT6 (absent on #253). |
| `tests/agent6/benchmark-bofa-structure.test.ts` | TESTS_REQUIRED | New Agent6 regression/scorecard suite — must be included when porting A6 onto #253. a6-d4 + execution-baseline tests gate PROVISIONAL_FAMILY safety; structure/html/eligibility tests gate compiler fixes. Status also ADDITIVE_AGENT6 (absent on #253). |
| `tests/agent6/discovery-completeness-audit.test.ts` | TESTS_REQUIRED | New Agent6 regression/scorecard suite — must be included when porting A6 onto #253. a6-d4 + execution-baseline tests gate PROVISIONAL_FAMILY safety; structure/html/eligibility tests gate compiler fixes. Status also ADDITIVE_AGENT6 (absent on #253). |
| `tests/agent6/discovery-eligibility.test.ts` | TESTS_REQUIRED | New Agent6 regression/scorecard suite — must be included when porting A6 onto #253. a6-d4 + execution-baseline tests gate PROVISIONAL_FAMILY safety; structure/html/eligibility tests gate compiler fixes. Status also ADDITIVE_AGENT6 (absent on #253). |
| `tests/agent6/execution-baseline.test.ts` | TESTS_REQUIRED | New Agent6 regression/scorecard suite — must be included when porting A6 onto #253. a6-d4 + execution-baseline tests gate PROVISIONAL_FAMILY safety; structure/html/eligibility tests gate compiler fixes. Status also ADDITIVE_AGENT6 (absent on #253). Phase3/4 verified-execution theme: A6 baselines record REFUSAL/stop-stages; #253 owns sequential verified composition — do not treat A6 refusals as competing engines. |
| `tests/agent6/html-entity-hex-decode.test.ts` | TESTS_REQUIRED | New Agent6 regression/scorecard suite — must be included when porting A6 onto #253. a6-d4 + execution-baseline tests gate PROVISIONAL_FAMILY safety; structure/html/eligibility tests gate compiler fixes. Status also ADDITIVE_AGENT6 (absent on #253). |
| `tests/fixtures/authentic-packages/README.md` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/benchmark-2025/extracted-text/doc-a-2022-05-20-amendment-no-1.txt` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/benchmark-2025/extracted-text/doc-b-2023-05-01-amendment-no-3.txt` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/benchmark-2025/extracted-text/doc-c-2025-06-27-second-ar-credit-agreement.txt` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/benchmark-2025/package-manifest.json` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/benchmark-2025/provenance.json` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/benchmark-2025/raw-html/doc-a-2022-05-20-amendment-no-1.htm` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/benchmark-2025/raw-html/doc-b-2023-05-01-amendment-no-3.htm` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/benchmark-2025/raw-html/doc-c-2025-06-27-second-ar-credit-agreement.htm` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/insulet-2021-2026/extracted-text/doc-a-2021-05-04-credit-agreement.txt` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/insulet-2021-2026/extracted-text/doc-b-2025-03-20-indenture.txt` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/insulet-2021-2026/extracted-text/doc-c-2026-09-21-ninth-amendment.txt` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/insulet-2021-2026/package-manifest.json` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/insulet-2021-2026/provenance.json` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/insulet-2021-2026/raw-html/doc-a-2021-05-04-credit-agreement.htm` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/insulet-2021-2026/raw-html/doc-b-2025-03-20-indenture.htm` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/insulet-2021-2026/raw-html/doc-c-2026-09-21-ninth-amendment.htm` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/knife-river-2023-2026/extracted-text/doc-a-2023-05-31-credit-agreement.txt` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/knife-river-2023-2026/extracted-text/doc-b-2025-03-07-first-amendment.txt` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/knife-river-2023-2026/extracted-text/doc-c-2026-05-15-second-amendment.txt` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/knife-river-2023-2026/package-manifest.json` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/knife-river-2023-2026/provenance.json` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/knife-river-2023-2026/raw-html/doc-a-2023-05-31-credit-agreement.htm` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/knife-river-2023-2026/raw-html/doc-b-2025-03-07-first-amendment.htm` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/fixtures/authentic-packages/knife-river-2023-2026/raw-html/doc-c-2026-05-15-second-amendment.htm` | ADDITIVE_AGENT6 | Unseen authentic EDGAR package fixtures for Knife River / Insulet / Benchmark. Absent from #253. Pure additive corpus; no product API conflict. |
| `tests/product/authenticated-vep-offline.test.ts` | NEEDS_API_ADAPTATION | A6 patch applies textually clean onto #253, but expectations changed from NO_CERTIFIED_ARTIFACTS refusal to DERIVED VEP + evaluateVerifiedCapacity REFUSED (CROSS_RULE_GATE_NOT_EXECUTABLE). #253 heavily extends verified-execution.ts (+198/−15) with sequential/restore-authority surfaces and Stage D companion/entity-scope may alter CONMED §7.2(c) refusal codes/outcomes. Must re-run against #253 tip before accepting assertions. Also TESTS_REQUIRED. |

## Appendix: #253-only focus paths (not on Agent 6 diff)

These changed on #253 since merge-base and are relevant context for adaptation; they are **not** Agent 6 rows.

| path | relevance |
|---|---|
| `app/[companyId]/capacity/page.tsx` | canonical product / runtime |
| `app/[companyId]/simulate/SimulateClient.tsx` | unified Position/Simulate/Ask (Stage 5) |
| `components/DashboardClient.tsx` | unified Position/Simulate/Ask (Stage 5) |
| `docs/product/customer-workflow/stage-d-pkgi-entity-scope/verified-execution-package.json` | Phase 3/4 verified + sequential composition |
| `docs/product/primary-engine/01-financial-certificate-engine-mission-report.md` | FCE (#220 lineage) on canonical tip |
| `lib/contract-model/compiler/package-graph/instrument-grouping.ts` | CONFLICT site with Agent 6 |
| `lib/contract-model/runtime/capacity/graph.ts` | canonical product / runtime |
| `lib/contract-model/runtime/capacity/state.ts` | canonical product / runtime |
| `lib/contract-model/sequential-execution.ts` | Phase 3/4 verified + sequential composition |
| `lib/contract-model/verified-execution.ts` | Phase 3/4 verified + sequential composition |
| `lib/financial-certificate-engine/approval-bridge.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/authentic-capacity-bridge.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/authority.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/capacity-bridge.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/derived-metrics.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/extract.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/financial-view.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/fixtures/authentic-coherent-fy2026.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/fixtures/authentic-coherent-q1-fy2027.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/fixtures/authentic-matthews-q1-fy2025.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/fixtures/index.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/fixtures/synthetic-calc-q2.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/identity.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/index.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/pipeline.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/reconcile.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/sequential-financial.ts` | Phase 3/4 verified + sequential composition |
| `lib/financial-certificate-engine/snapshot.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/types.ts` | FCE (#220 lineage) on canonical tip |
| `lib/financial-certificate-engine/utilization-honesty.ts` | #237-aligned utilization surfaces on canonical tip |
| `lib/financial-certificate-engine/verified-path.ts` | FCE (#220 lineage) on canonical tip |
| `lib/product/north-star-workflow/utilization-history.ts` | #237-aligned utilization surfaces on canonical tip |
| `lib/product/unified-position/attributed-utilization-server.ts` | #237-aligned utilization surfaces on canonical tip |
| `lib/product/unified-position/attributed-utilization.ts` | #237-aligned utilization surfaces on canonical tip |
| `lib/solver/election.ts` | #231 debt/lien / solver authority |
| `tests/contract-model/runtime/capacity/remediation-matrices.test.ts` | canonical product / runtime |
| `tests/contract-model/verified-execution.test.ts` | Phase 3/4 verified + sequential composition |
| `tests/financial-certificate-engine/approval-bridge.test.ts` | FCE (#220 lineage) on canonical tip |
| `tests/financial-certificate-engine/authentic-capacity-bridge.test.ts` | FCE (#220 lineage) on canonical tip |
| `tests/financial-certificate-engine/derived-and-reconcile.test.ts` | FCE (#220 lineage) on canonical tip |
| `tests/financial-certificate-engine/engine.test.ts` | FCE (#220 lineage) on canonical tip |
| `tests/financial-certificate-engine/integration-gate.test.ts` | FCE (#220 lineage) on canonical tip |
| `tests/financial-certificate-engine/ns4-propose.test.ts` | FCE (#220 lineage) on canonical tip |
| `tests/financial-certificate-engine/sequential-financial.test.ts` | Phase 3/4 verified + sequential composition |
| `tests/solver/election.test.ts` | #231 debt/lien / solver authority |
| `tests/solver/gate0-security-scope.test.ts` | #231 debt/lien / solver authority |
| `tests/solver/secured-debt-lien-binding.test.ts` | #231 debt/lien / solver authority |

## Port recommendation (shortest safe path)

1. Rebase/cherry-pick Agent 6 onto #253 tip `85d52b93…` (or functional `58ae735f…` + docs).
2. Manually merge `instrument-grouping.ts`: A6 provisional-family + #253 `FINANCIAL_STATEMENT`.
3. Apply clean A6 patches: `types.ts`, `pipeline.ts`, `stage-structure.ts`, `html-text.ts`, `pass-a-signals.ts`, `eligibility.ts`, scripts/tests/docs/fixtures, `package.json`.
4. Re-validate `tests/product/authenticated-vep-offline.test.ts` and `scripts/agent6/run-execution-baseline.ts` against #253 `evaluateVerifiedCapacity` behavior; adjust assertions if Stage D changed refusal codes.
5. Required test gates: `test:agent6`, section8 package-relationship certification, authenticated-vep-offline, plus #253 sequential/solver suites for non-regression.

_Generated from merge-base `7f1dd3a202b0`, A6 `f4237e7b8a2e`, #253 `85d52b93e23b`._
