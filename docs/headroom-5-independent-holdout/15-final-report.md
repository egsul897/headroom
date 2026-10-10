# HEADROOM-5 — Independent Unseen-Package Validation

**Verdict:** `INDEPENDENT_HOLDOUT_EVALUATION_COMPLETE`  
**Archive:** `SAFE_TO_ARCHIVE` after handoff  
**Workstream status:** `CLOSED`

## Identity

| Field | Value |
|---|---|
| Starting SHA | `342a6b059e3385fb14d605b8d1593e878a221578` |
| Ending SHA | `3fa5a2623e148fee452a668600feb2f0c7784f70` |
| PR | https://github.com/egsul897/headroom/pull/276 |
| Holdout | WOR Fourth→Fifth AR credit facility (`wor-2023-2026-credit-facility`) |
| Issuer | Worthington Enterprises, Inc. (WOR / CIK 0000108516) |
| Paid inference | $0 |
| Production code changes | None (`lib/`, `app/`, `prisma/` untouched) |
| Handoff path | `docs/headroom-5-independent-holdout/14-handoff-to-headroom-1.json` |

### Holdout hashes

| Doc | Raw SHA256 | Extracted SHA256 |
|---|---|---|
| doc-a Fourth AR 2023-09-27 | `54477026996a1f39285955ae22812be5a5399dfaae2b9cd07f8466e2ec2ec679` | `29751da8c5ee22c84facccf0d643312b2fa8c485b612f92970bdbff05a4df5b2` |
| doc-b Fifth AR 2026-08-31 | `f573ea31756d2f0b1d4bd0e125b82900f3ab59c0ec48f14fb0d45d2956760a47` | `e5ce81017e3635960bcd519af513b480ca48a297cf97ba72e485ecb023399d3b` |

Legal-reference provenance: `05-legal-reference-answers.json` created and committed at `f17601ba` **before** any compiler run (`06-legal-reference-chronology.json`).

## Fixture separation (not combined)

| Bucket | Packages |
|---|---|
| DEVELOPMENT | CONMED, Chewy, DSGR, RIOT, Gibraltar, Matthews/MTN product-proof path |
| REGRESSION | FWRG, LSB, SUP (prior unseen) |
| SEALED UNSEEN HOLDOUT | **WOR only** |
| Absent on main tip | MHK (Mohawk) — not present |

## Layer results (sealed holdout only)

Denominator unless noted: **10** frozen GT clauses.

| Layer | Result |
|---|---|
| A Structural indexing | 10/10 section nodes found |
| B Clause discovery (Pass A) | 10/10 recall; Pass B synthetic/empty (no paid inference) |
| C Context retrieval | SUFFICIENT **0/10**; BUDGET_EXCEEDED 9/10; INCOMPLETE 1/10 (body anchors) |
| D Cross-doc / amendment | Both docs classified A&R; doc-b→doc-a RESTATES = REVIEW_REQUIRED; operativeDocumentId = null |
| E Legal representation | Best-node complete span 10/10; **naive first-match 0/10**; TOC collisions 10/10; local compile UNVERIFIED |
| F Independent fidelity verification | `NO_PAID_INFERENCE_BLOCKED` |
| G Executable IR | 0/10 claimed; false executable rate 0/10 |
| H Hypothetical capacity | Not counted as production |
| I Production-authoritative capacity | Correct refusal 6/6 where refusal expected; **false favorable capacity 0/10** |

## Adversarial modes

Applicable modes exercised on WOR; `builders` and `reclassification` marked `NOT_APPLICABLE`. Critical finding: duplicate TOC/body section references break naive span selection.

## Three highest-value failures → HEADROOM-1

See `14-handoff-to-headroom-1.json`:

1. TOC stub vs body duplicate `sectionRef` selection  
2. Restatement does not resolve operative governing document  
3. Context retrieval never reaches `SUFFICIENT` on authentic body anchors  

## Reproduction

```bash
git checkout <this-branch>
npm ci
npx prisma generate
npx tsx scripts/headroom-5/run-offline-evaluation.ts
# Artifacts: docs/headroom-5-independent-holdout/10-*.json … 15-final-report.md
```

Exact-tip CI: run the offline evaluation script at the PR tip; expect `paidInferenceUsd: 0` and unchanged `05-legal-reference-answers.json` hash vs seal commit.
