# Integration requirements for the independent acceptance framework

Audience: the acceptance workstream that owns `tests/product-acceptance/`, `tests/fixtures/product-acceptance/`, `scripts/product-acceptance/`, and `docs/product-readiness/`.

This note is not that framework. Those directories were not modified. Do not weaken an expectation so a production branch passes.

DEVELOPMENT ≠ CERTIFIED. A dry-run plan, a cache hit, and a passing synthetic test are not certification.

## What production now guarantees, and what it does not

| behavior | production status | how to test it without treating it as certification |
| --- | --- | --- |
| Contents listing is not operative text. | Enforced in `compileCovenantToIR` and in the question planner. | Feed a section id whose own text is a contents row, including a non-breaking space between the label, the title, and the page number. Expect `OPERATIVE_AUTHORITY_REFUSED` or a refused source, and zero model calls. |
| Two physical nodes for one label are not collapsed by length. | Enforced in operative-source selection. | Two different occurrence ids, same section ref, different body text. Expect a refusal, not the longer body. |
| One physical node emitted twice by discovery is one body. | Enforced. | Same occurrence id, two discovery rows. Expect one selected body. |
| Definition declaration is operative structure. | Enforced. | A definitions span using `"Term" means`, a quoted colon, or an unquoted colon, with no `shall`. Expect it not to be refused as a contents or empty span. |
| Qualitative extra gate is kept. Ambiguous unlimited attribution is not copied onto a sibling. | Enforced in compiler v12. | Use a fixture with three independent qualifiers, and a fixture with two unlimited siblings and no attribution. |
| Unknown spend is not zero. | Enforced on the development spending target. | A ledger row with missing tokens must block the next dispatch. |
| Unknown capacity is not unlimited. Unsupported is not permitted. | The question planner hard-codes `unknownIsUnlimited: false` and `permitsCapacity: false`. Capacity is not computed. | A question that names a dollar amount must come back with that amount as a parameter only. |
| Closure is not package coverage. | The planner returns `REVIEW_REQUIRED` while any operative section is unexamined, and lists discovery-labeled same-action sections the cites did not reach. | Ask a debt question. Expect cited parents and targets in the plan, and expect the uncited same-action section in `sameActionNotReached`, not in `planned`. |
| Cache hit is not correctness and not certification. | Store reads set `advancesCertification: false`. A hit requires the full contract and a complete payload. | Change source hash, dependency hash, prompt version, or operative version. Expect a miss. A `PARTIAL` record must not count as reuse. `UNKNOWN` operative version or dependency must not dispatch. |
| Unpriceable model is not replaced. | Haiku (`anthropic/claude-haiku-4.5`) has no rate card. The planner's action is `REFUSED_UNPRICEABLE`. | Do not assert a fallback to Sonnet or DeepSeek. |
| Broad compilation is still the production compile path. | `package-compile.ts` was not switched. | Do not score the product as if only the question closure is compiled. Do not point Phase 3 certification gates at the closure. |

## Sealed artifacts that must stay byte-stable

- `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/article-vii-compile.json` sha256 `c866c1c1bb31095a73687257f68a23f4e232b1f92f9dfe278f8ac0b02b8f4651`
- `verification.json` sha256 `4da1126d854704962cf27a2a20c82d4c6f2a56b00420ff1ab8e1fe173445b621`
- `execution.json` sha256 `6dc500ebbe1866a93bcc26d9a696bbfa0b7b9871fcb520ef1290c6f19782c17f`

The Article VII file is summary-only diagnostic evidence. Do not reconstruct 82 IR objects from the count. Do not upgrade historical certification fields.

## Suggested acceptance checks

1. Dangerous omission: compile or plan a permission that cites a ratio, a lien basket, and a parent debt covenant. Approach B (the asked section only) must fail the expectation. The closure plan must include those cites or mark the edge unresolved. An unresolved or ambiguous edge is a failed completeness check, not a guess.
2. Same-action omission: a second indebtedness covenant that discovery labeled and that nothing cites must appear on the omission list. Silence is a failure.
3. Contents contamination: a short contents row must not become the covenant, including when it is longer than a real stub elsewhere.
4. Spend: a run with no founder authorization must perform zero provider calls. A reported dollar figure from the dry-run is an estimate only when `pricingStatus` is `PRICED`, and `measuredBillingUsd` must stay null until an invoice or a settled ledger exists.
5. Do not use issuer names in production branches. Fixtures may name a package. Compiler branches may not.

## What this branch will not do for the acceptance workstream

- It will not edit the acceptance directories.
- It will not lower a threshold, delete a failing product test, or mark a review result approved.
- It will not run a paid provider to make a scorecard move.
- It will not declare production readiness.
