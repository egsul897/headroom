# Independent drift verification, bounded remediation and North Star integrity gate — 2026-10-09

Role: independent principal engineer / security auditor / legal-systems architect / release gatekeeper.
Standard applied: would Headroom behave safely and correctly on an unfamiliar financing package belonging to an unfamiliar
customer. Nothing below is marked passed because remediation code was written; every gate is tied to an executed check or
marked unverified.

## Part I — Repository reconciliation

| field | value |
|---|---|
| AUDIT_BASE_SHA | `2338e9e09fc9a6435bcfa4a330c424dd240ffb4d` (last externally audited main) |
| CURRENT_MAIN_SHA | `2338e9e09fc9a6435bcfa4a330c424dd240ffb4d` — `origin/main` had not moved; `git log 2338e9e0..origin/main` is empty, so the comparison base and the current base are the same commit |
| WORKTREE_STATUS | this checkout was on `claude/independent-product-validation` (challenger branch, clean, up to date with its upstream); remediation done in a fresh worktree branched from `origin/main` (`claude/audit-drift-remediation-2026-10-09`), nothing of the concurrent branches touched |
| CONTROLLING_NORTH_STAR | `docs/headroom-north-star-v2.md` (controlling, "North-Star gate for future work N1–N10", "Fail-closed principles"), with `docs/HEADROOM-NORTH-STAR.md` (product North Star), `docs/headroom-north-star-reconciliation/07-next-implementation-gate.json` (next gate NS-4) and `docs/HEADROOM-ROADMAP.md` (phase sequence 2G → 3 → 4 → 5 → 6 → 7) |
| CURRENT_PHASE_GATES | frozen contracts `docs/architecture/PHASE-3-TRACK-{A,B-DEFINITION,C1-SEAL,C2-D2,D,5-DEFINITION-SCOPE-TERMINAL}.FROZEN.md`; next implementation gate NS-4 (certificate-to-snapshot adapter); CI: `canonical-compiler.yml` (certified path, provider-free), `stratified-cert.yml`, `p3-r0-soft-gate.yml` (+ three invent-absence/home soft gates); none of the four findings is covered by a frozen phase contract |
| EXISTING_REMEDIATIONS | none merged or open for the four findings. Open PRs touching adjacent files: #181 (draft, `bda53749`, "covenant review workspace and fail-closed capacity") modifies `ask-retrieve.ts`, `shell-runner.ts`, `onboarding/documents/actions.ts`, `sec-batch-result.json`; #172 (draft, docs) recorded the "fragmented knowledge system" audit. Neither adds authorization, approval records, corpus quarantine or legacy/verified separation. This branch does not touch #181's new files; a textual merge of `onboarding/documents/actions.ts` and `ask-retrieve.ts` with #181 will need a one-line reconciliation each |
| FINDINGS_REQUIRING_INVESTIGATION | F1 cross-tenant authorization; F2 Neon write approval; F3 SEC corpus quality and hash mismatches; F4 legacy execution as verified capability |

Production entry points mapped: `app/[companyId]/layout.tsx` (company shell), 18 exported server actions under
`app/[companyId]/**/actions.ts`, `app/companies/[companyId]/delete/actions.ts`, `app/api/ask/route.ts` (the only route
handler), `app/[companyId]/documents/[documentId]/page.tsx` (stored bytes). Models: `Company.tenantKind` (CUSTOMER |
EVALUATION), `KnowledgeSource` (companyId nullable; null = public corpus), `LedgerEntry.status`. Authorization architecture:
none in code; `app/page.tsx` and the company layout state "no signed-in user / no real multi-tenant auth yet". Deployment:
`https://headroom-debt-compass.vercel.app/` and every PR preview answer `302 → https://vercel.com/sso-api` to an anonymous
request (Vercel Deployment Protection), checked live during this audit.

## Part II–VI — Findings and independent verdicts

Full detail with exact lines, reproduction and corrective action: `01-findings.json`. Summary:

| finding | reported | independent verdict | gate |
|---|---|---|---|
| F1 cross-tenant authorization | HIGH | **PARTIALLY_CONFIRMED** — no application-layer authorization anywhere (confirmed in code); the deployment is behind Vercel SSO (external control demonstrated), so the exposure is "any team member reaches any company", not "anyone on the internet". The North Star requires fail-closed behaviour in the application regardless | REMEDIATED_PENDING_CI |
| F2 Neon live-write approval | HIGH | **CONFIRMED** evidence inconsistency; approval **APPROVAL_UNVERIFIED** for the migrations and the 29-document import (claimed by an agent commit 13 minutes after the checkpoint said `false`, no owner record anywhere); the 39-document SEC live persist carries **no approval claim at all**; persistence **NOT_VERIFIED** (no database access) | APPROVAL_UNVERIFIED |
| F3 SEC corpus quality | MEDIUM | **CONFIRMED** counts (48/39/39/9/0) reproduced from the artifacts; hash basis **INDETERMINATE** (two different fetch events, never compared); ESPP, executive severance and a charter amendment persisted and counted; retrieval already filtered most of them, persistence counts and manifest roles did not | REMEDIATED_PENDING_CI |
| F4 legacy execution as capability | MEDIUM | **CONFIRMED** — `survivingExecutableConclusions: 2` for Coherent were LEGACY_ENGINE numbers, ledger availability hardcoded `true`, issuer dispatch with a throw for any other company, CONMED-only missing-IR blocker | REMEDIATED_PENDING_CI |

Challenged premises: F1's "HIGH, exploitable" is not demonstrated for the deployed instance (SSO in front); the previous audit's
"39 hash mismatches = corruption" reading is not supported (the hashes come from two acquisitions and the persisted objects are
self-consistent); F2's checkpoint is a pre-approval checkpoint by its own structure, not an active prohibition, which does not
make the later approval claim evidenced.

## Part VII — Cross-cutting regression audit (material items only)

1. **Object-level authorization beside the tenant gap**: feed items and ledger entries were already loaded by id and then
   checked against `companyId` with an explicit refusal (`feeds/actions.ts:86,136`, `ledger/actions.ts:40`; the P3-R0 C10 test
   asserts that refusal) — correct and unchanged. Source-connection sync (`sources/actions.ts:25`) loaded the connection by id
   with no company check; now bound. Still open: `lib/onboarding/review.ts:94,152` loads extraction candidates by id without
   company binding (the review actions are now tenant-gated; the object binding is not). An earlier draft of this report and
   the first push of this branch (`cd5cdc86`) wrongly replaced the feed/ledger check with a bound query, which changed the
   refusal wording and failed the C10 test in CI; reverted in the next commit.
2. **Invalidating findings that did not invalidate**: `challenge.ts` honoured `invalidatesExecutability` only at BLOCKER
   severity, so an unresolved entity scope (MATERIAL, `invalidatesExecutability: true`) never blocked. Fixed (any severity).
3. **Fixture-specific UI**: `app/[companyId]/position/page.tsx` renders a CONMED-only panel keyed on `CONMED_DEMO_COMPANY_ID`.
   Left in place (UI, already gated to that id); recorded as issuer-specific presentation, not a generalized production branch.
4. **Corpus metrics count manifest roles**: `status-board.json` (`financingLocators: 113`) and `operational-dashboard.json`
   (`precedentsIndexedAndSearchable`) derive from manifest `corpusRole: FINANCING`, which includes the misclassified exhibits.
   Not rewritten (historical artifacts); future batches report financing vs quarantined ids separately.
5. **No fail-open introduced**: the boundary defaults to deny; the approval gate defaults to refuse; quarantine defaults to
   exclude; the generalized legal path defaults to not-determinable; ledger evidence defaults to unknown.
6. **Database-backed suites could not run here** (no Postgres); the synthetic companies in those suites were declared
   EVALUATION tenants so the data-driven boundary admits them in CI; this is a fixture declaration, not a test weakening.
7. **Earlier high-severity findings in current main**: the parser defect (#161 merged, #163/#164 open — see
   `docs/product-readiness/27`), the governing-limit enforcement gap (PR #136, `docs/product-readiness/28`) and the PR #163
   regressions remain as recorded in those documents; none is altered or resolved by this branch.

## Part VIII — Change inventory

Commits on `claude/audit-drift-remediation-2026-10-09` (base `2338e9e0`):

| commit | unit | files |
|---|---|---|
| `79e6b4eb` | F1 tenant boundary | `lib/auth/tenant-boundary.ts` (new), `.env.example`, `app/[companyId]/layout.tsx`, `app/api/ask/route.ts`, `app/[companyId]/documents/[documentId]/page.tsx`, `app/[companyId]/{feeds,ledger}/actions.ts`, `app/[companyId]/onboarding/{activate,documents,facilities,financials,review,sources}/actions.ts`, `app/companies/[companyId]/delete/actions.ts`, `tests/product/tenant-boundary.test.ts` (new), EVALUATION fixture declarations in `tests/{ledger,feeds,onboarding,foundation-audit}` (8 files) |
| `a8e1748b` | F4 legacy vs verified | `lib/product/legal-intelligence/{types,challenge,run-package-path}.ts`, `tests/product/legal-intelligence-verified-boundary.test.ts` (new) |
| `fbec7248` | F3 corpus acceptance | `lib/knowledge-factory/mass-precedent/corpus-acceptance.ts` (new), `lib/product/covenant-intelligence/corpus-quality.ts`, `lib/knowledge-factory/mass-precedent/sec-batch-persist.ts`, `tests/knowledge-factory/corpus-acceptance.test.ts` (new) |
| `9a15d856` | F2 approval record + reconciliation | `lib/knowledge-factory/live-write-approval.ts` (new), `docs/knowledge-factory/approvals/README.md` (new), `lib/knowledge-factory/consolidation/{import-original-bytes,import-derived-export}.ts`, `tests/knowledge-factory/live-write-approval.test.ts` (new), `tests/knowledge-factory/consolidation.test.ts` (approval stubbed; assertions unchanged), `docs/knowledge-factory/mass-precedent/approval-reconciliation-2026-10-09.md` (new, append-only) |
| (this commit) | evidence | `docs/audits/2026-10-09-independent-drift-verification/*` |

Not changed: any frozen contract, any historical evidence artifact (`APPROVAL_CHECKPOINT.md`, `live-import-evidence.json`,
`import-result.json`, `sec-batch-result.json`, `status-board.json`, `operational-dashboard.json`,
`docs/product/legal-intelligence/{summary,path-results}.json`, acquisition manifest), any golden label, any acceptance
threshold, `lib/contract-model/**`, schema or migrations.

## Part IX — Tests and CI

See `02-test-matrix.json` for exact commands, SHA, exit codes and counts. Locally executed on the committed tree: TypeScript
(0 errors; identical to main with a regenerated Prisma client), `next lint` (clean), `npm run test:product`,
`npm run test:knowledge-factory`, the four new suites, `npm run test:phase3-certification` (481/481), `next build` (exit 0).
Not executed locally: every Postgres-backed suite (`tests/ledger`, `tests/feeds`, `tests/onboarding`, `tests/company-state`,
`tests/foundation-audit`, `tests/contract-model` DB suites) — **NOT_VERIFIED** here; the `p3-r0-soft-gate` workflow runs the
ledger and feeds suites on an ephemeral Postgres and is path-triggered by this branch (`app/**/feeds/**`, `app/**/ledger/**`).
CI results are recorded on the PR, not asserted here. Vercel deployment success is not treated as evidence of anything legal.

## Part X — North Star compliance

1. Fail-closed preserved: yes — every new decision defaults to deny / refuse / exclude / not-determinable.
2. Generalized architecture preserved: yes — the boundary is tenant-kind-driven, the legal path has a generalized branch, the
   corpus rule is content-driven; no issuer id was added to production logic.
3. Issuer-specific shortcuts introduced: none; the existing CONMED/Coherent fixture paths are now explicitly registered as
   fixture paths.
4. Independent evaluation integrity: preserved — no golden label, benchmark, threshold or frozen fixture changed; the new tests
   use synthetic inputs and read historical artifacts read-only.
5. Historical evidence preserved: yes, byte-for-byte; reconciliation is a new append-only artifact.
6. Legal permission / capacity boundaries preserved: strengthened — legacy numbers can no longer be counted as executable
   capacity; missing ledger evidence blocks; missing IR blocks for every company.
7. Unsupported capabilities promoted: none.
8. Phase gates advanced: none (no disposition here is VERIFIED_PASS).
9. Authorization and provenance: the application boundary exists; identity-provider integration and an owner-authored
   approval record for the 2026-10-09 writes remain open.
10. Unverified: Neon persistence and migrations; CI on this branch at the time of writing; database-backed suites locally;
    the cause of the 100% manifest-hash drift; the deployed instance's Vercel protection configuration over time.

## Part XI — Gate dispositions

| gate | disposition |
|---|---|
| F1 tenant isolation | REMEDIATED_PENDING_CI (identity-provider integration still required for customer deployments) |
| F2 Neon write approval | APPROVAL_UNVERIFIED (+ persistence EVIDENCE_INSUFFICIENT without database access) |
| F3 corpus quality | REMEDIATED_PENDING_CI (persisted rows need a byte-level re-analysis under the new rule) |
| F4 verified capability reporting | REMEDIATED_PENDING_CI |
| NS-4 and every frozen Phase-3 contract | NOT_APPLICABLE — untouched |

## Part XII — Delivery

Branch `claude/audit-drift-remediation-2026-10-09`, pushed; PR opened for review; not merged; no force-push; no history
rewritten. Verdict: **REMEDIATION_PARTIAL** — the four application-layer corrections are implemented and locally verified;
F2's authorization cannot be established from the repository and Neon persistence could not be checked; CI on the exact
branch head is pending at the time of writing.
