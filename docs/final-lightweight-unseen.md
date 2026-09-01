# HEADROOM — Final Lightweight Genuinely-Unseen Confirmation

**Final verdict: `LIGHTWEIGHT_UNSEEN_TRUST_BOUNDARY_FAILED`**
**Phase 4 readiness value: `NO_TRUST_BOUNDARY_BLOCKER`**
**Phase 3 Contract Intelligence does NOT close.**

Full machine-readable evidence: `docs/final-lightweight-unseen/00-validation-contract.json` through `22-final-verdict.json`.

## 1. What this validation was

A bounded, lightweight confirmation that the specific capabilities remediated in the immediately prior session — semantic multi-definition exhaustiveness, qualifier/completeness handling, document classification resistant to TOC/exhibit contamination, amended-and-restated/restatement target resolution, whole-document supersession, and hard-safety no-false-trusted-material-truth — generalize to one fresh, genuinely unseen credit-agreement package, with zero package-specific intervention after selection.

## 2. Package

Deterministically selected (SHA256 of a pre-committed seed, mod pool size, over a 9-candidate CIK-ascending pool built from public SEC EDGAR metadata only): **Superior Industries International, Inc.**, Term Loan Credit Agreement thread — 3 documents (original 2022-12-15 Credit Agreement, 2024-08-14 Amended and Restated Credit Agreement, 2025-03-31 First Amendment), 1,606,985 total extracted characters, ~2.93x larger than the mission's own size guidance. The user explicitly authorized proceeding as-is rather than re-selecting, with the mission's own $8.00 hard cost ceiling (enforced at $7.50 in code) as the sole size-related stop condition.

## 3. The run

Two process invocations of the same frozen script. The first completed structural indexing and discovery for all 3 documents, then crashed mid-Stage-5 when the shared Vercel AI Gateway account hit its own $100 budget cap (a real environmental incident, unrelated to this run's own ceiling — only $0.0498 spent at the time). The user authorized a resume once the account budget was raised; the script was extended with resume logic (carry forward real cost already spent, skip re-paying for already-completed discovery) and the SAME frozen provider/model/credential completed the remaining stages. Total real cost across both invocations: **$5.03 of the $7.50 ceiling**. No production code (`lib/`, `app/`, `prisma/`) was touched at any point — confirmed empty via `git diff <frozen-SHA> HEAD -- lib app prisma`.

Given `COMPILE_CAP=15` against 1,710 eligible candidates, the pre-committed document-then-discovery-emission ordering meant all 15 compiled candidates came from doc-a's later sections (§2.11–§8.04); none reached the Article I definitions cluster or doc-c's own amendment clauses, where 10 of the 16 pre-committed ground-truth claims live. This is a real sampling artifact of the cost ceiling, not a semantic-compiler defect — and it was honestly disclosed: the Stage 9 whole-package coverage audit reported `PACKAGE_SEMANTICALLY_INCOMPLETE` with real, named, per-family dangerous-unaccounted counts for every document, never a false claim of completeness.

## 4. The finding that decides the verdict

Independent of the compilation sample, Stage 3's real package-graph output showed:

- **doc-b classified `CREDIT_AGREEMENT` at confidence 0.9** — it should be `AMENDED_AND_RESTATED_AGREEMENT`. doc-b's own caption literally reads "$520,000,000 AMENDED AND RESTATED CREDIT AGREEMENT" and its own recital states it restates doc-a.
- **Zero relationship candidates exist anywhere for doc-b RESTATES doc-a** — not resolved, not `REVIEW_REQUIRED`, not present at all — despite doc-b's own recital directly naming doc-a's exact type and execution date, a textbook direct-match case.

Both trace to **one confirmed, precisely-located mechanical defect**, read directly from production source: `document-classifier.ts`'s `AMENDED_AND_RESTATED_AGREEMENT` pattern requires a literal space between "restated" and "credit agreement" with no whitespace normalization applied to the scanned preamble. doc-b's real extracted text has a newline there (the source PDF's own visual line-wrap: "AMENDED AND RESTATED\nCREDIT AGREEMENT"), so the pattern never matches and classification falls through to the generic `CREDIT_AGREEMENT` rule. `relationship-resolution.ts` then never even attempts a RESTATES scan for doc-b, because that scan is gated entirely on the source document's own classification type.

This trips two absolute hard gates simultaneously:

- **Section 21 (primary safety metric):** 1 CRITICAL dangerous silence (claim D1 — the doc-b→doc-a relationship, never surfaced anywhere).
- **Section 22 (false-trust metric):** 1 WRONG HIGH-CONFIDENCE CLASSIFICATION (claim C2), and the mission's own language is explicit — *"any one failing fails the validation."*

A downstream consequence (not separately scored, but concretely demonstrated): the package's supersession index (`documentLevelSupersededDocuments`) is entirely empty — no document is ever marked historical relative to another, so doc-a's own genuinely-superseded content carries no non-current marker at all. This is a real STALE-AS-CURRENT exposure, not a hypothetical one.

## 5. What worked

- Document classification for doc-a (`CREDIT_AGREEMENT`, correct) and doc-c (`AMENDMENT` at 0.97, correctly avoiding the "AMENDED AND RESTATED" phrase trap embedded in doc-c's own title — the self-referential-title-first architecture from the prior remediation held up here).
- The doc-c AMENDS doc-b relationship, surfaced at `REVIEW_REQUIRED`/0.6 confidence rather than force-resolved — exactly the safe, truthful-uncertainty behavior the mission's Section 28 protects, not a miss.
- The coverage-honesty architecture: every document was correctly flagged `DOCUMENT_GATE_FAILED` with real per-family CRITICAL/MATERIAL counts rather than silently claiming completeness.
- All 14/14 permanent false-credit controls passed, unchanged.
- Known-package regression: zero new material regression attributable to this session (zero production-code changes were made at any point).
- Production freeze proof: `lib`/`app`/`prisma` diff against the frozen SHA is empty.
- Independent audit: no benchmark-specific code, no post-selection production changes, no GT modification after seeing output, no hidden success-manufacturing.

## 6. Root-cause classification

Earliest failure layer: **DOCUMENT_CLASSIFICATION**, cascading into **PACKAGE_GRAPH**. Category: **LOCAL_DEFECT** — a single, narrow, mechanical regex bug (missing whitespace-tolerant matching for a multi-word pattern spanning a line break), not a deep architectural or generalization limit. No remediation was performed during this run, per the mission's own Section 29.

## 7. Phase 4

Phase 3 Contract Intelligence does **not** close. The recommended next step is a narrow, dedicated remediation session fixing the single root-cause regex, followed by re-confirmation — not a new architecture, and not another foundation-level audit.
