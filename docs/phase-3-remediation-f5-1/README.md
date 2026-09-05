# Phase 3 Chewy remediation 5 - F-5.1 semantic role instability (ontology / canonical semantic functions)

Starting SHA `97da90b5ceb6d1b5fbdc388dcaa38c5ed0e81c84`. Diagnosis from the already-paid F-5 certification pair
(`tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification/`, read-only), one bounded remediation, one
paid certification pair (`.../certification-v5/`). **Verdict: F5_NEEDS_ARCHITECTURAL_ITERATION** - the role mechanism
is resolved and trust is safe, but critical/material stability (0.832) misses the pre-registered 0.85 gate.

| # | artifact | what |
|---|----------|------|
| 00 | `00-freeze-and-diagnosis.json` | frozen-evidence blob hashes, confusion-matrix headline, A-E adjudication of every high-frequency pair, scalar-role verdict (unsound) |
| 01 | `01-role-confusion-matrix.json` | `scripts/f5-1-role-confusion.py`: 337 aligned pairs (300 identical slot+span, 37 same-slot overlap+values), 90 role conflicts (82 on identical spans), ordered/unordered matrices, per-role conflict share |
| 02 | `02-certification-pair-v4-scored-both-ways.json` | the UNCHANGED v4 pair under `scripts/f5-1-canonical-score.py`: legacy 0.5251/0.5236 reproduced; label-blind representation alone 0.8426/0.8321 |
| 03 | `03-migration-record.json`, `03-certification-pair-migrated-v5.json` | zero-cost migration of the v4 pair through the v5 normalizer (4 merges/run, 0 lost items, 0 lost values, 1 flagged merge inspected = correct) |
| 04 | `04-migrated-v5-scored.json`, `04-migrated-v5-reference-recall.json` | proxy: strict 0.501 -> 0.8101, canonical 0.8456/0.8358, legacy 0.8277/0.8177, recall 1.0 |
| 05 | `05-same-root-replay.json` | 33 recorded inventories: 72 role-conflict pairs (1 identical-span, canonicalized), 0 false merges, 0 items/values lost, 0 coverage or materiality change |
| 06 | `06-ontology-and-migration.json` | invariant, model before/after, dimensions, deterministic rules, identity before/after, false-merge protections, consumer migration table, anti-gaming decomposition |
| 08 | `08-paid-pair-precheck.json` | GO at $44.00 balance, pair upper bound $4.89, cap $8.00 |
| 09 | `09-paid-pair-v5-canonical-scored.json`, `09-paid-pair-v5-legacy-{alignment,decomposition,metrics}.json` | the paid v5 pair under the canonical scorer AND the frozen F-5 scorer |
| 10 | `10-paid-pair-v5-reference-recall.json` | frozen 6.08 human subset (never in model context): 1.0 in A, B and intersection |
| 11 | `11-final-summary.json` | gate evaluation, spend, dominant remaining mechanism |

Production changes (7 files under `lib/`): `semantic-accountability/semantic-functions.ts` (new: effect / logic /
quantitative / dependency dimensions, deterministic source-structure augmentation, derived legacy role),
`inventory.ts` (role-blind identity + start/value/effect false-merge guards + function-union merge + member refs),
`types.ts`, `wire-schema.ts` (`additionalRoles`), `prompt.ts` (v5), `reconciliation.ts` (dependency via functions),
`semantic/caller.ts` (Pass B context label). Untouched: slots, source coverage/context, F-1 caller, F-6 IR, verifier,
F-3 money parser, precedent, frozen scorers, reference set, Chewy source/unit.

Paid pair: A 352 / B 326 items, 8 calls each, $6.8777 rate card = gateway delta, no guard refusals. Strict identity
0.7984; semantic 0.8374 (canonical) / 0.8324 (frozen scorer); critical/material 0.832 / 0.8269; coverage 0.9645;
quantitative 0.9474; D_ROLE_INSTABILITY 158 -> 2; F_TRUE_SEMANTIC_OMISSION 50 is now the dominant residual
(run B inventoried 26 fewer propositions than run A). Zero dangerous silent omissions, zero false completeness.
