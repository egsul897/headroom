# Pilot acceptance criteria

Two ladders, kept apart on purpose. **Diagnostic** gates say when a design-partner pilot may run with a human reviewer
approving every unit. **Certification** gates are what a "trust the number" product would need; none is proposed as
met and none can be met from offline evidence. Numbers below are gates on the committed artefacts, not accuracy claims.

## Diagnostic gates (must all hold before a partner package is loaded)

| # | gate | measured by | status at `83e6bf1` |
|---|---|---|---|
| D1 | Zero false permissions on the acceptance corpus and benchmark cases from the deterministic layers | `known-defects.test.ts`, `benchmark.test.ts` | **not met**: IPV-01, IPV-02, IPV-03 (certification), IPV-16 (operative state), F-R cases pass |
| D2 | Every fail-closed condition surfaces as no-answer with a reason: missing referenced document, unresolved amendment, undefined governing term, ambiguous section label, truncated clause | benchmark C fail-closed 4/4; acceptance G/H/E | met for the four benchmark classes; **not met** for unresolved amendment at instrument level (IPV-05) and override documents (IPV-16) |
| D3 | Selective closure recall equals broad on every benchmark case | `benchmark.test.ts` | met (18/18, 16/16) |
| D4 | Omission audit present on every answer, listing signalled-but-unexamined units | hybrid `notExamined` | met in the evaluation model; **not implemented** in product code |
| D5 | Operative-source gate: contents lines never dispatched; stale parent spans never authenticated | doc 07 | **not met** (PR136-F1, F4) |
| D6 | Structural identity: no node-id-keyed state crosses document versions | doc 09 §3 | no such feature exists yet; gate applies to the amendment-diff feature when built |
| D7 | Cross-reference closure symmetric through definitions | `context:*:cross-references` | met (J and K controls; IPV-17 closed as a harness false positive) |
| D8 | Mutation suite: every operator killed or explicitly declared equivalent/gap with a registered product finding | `mutations.test.ts` | met (9 killed, 1 equivalent, 6 gaps registered) |
| D11 | Definition amendments apply to the definition, and dependent baskets compile against the amended text | `invariants.test.ts` INV-05 | **not met** (IPV-19, IPV-20) |
| D9 | Reviewer workflow shows source text, lineage and every unresolved dependency for each unit before approval | MVP spec §3 steps 5–7 | **not testable offline**; UI not in scope of this branch |
| D10 | Partner package runs the deterministic stages with zero structural findings of IPV-06/07/08/11 class, or each finding is triaged by a human before any model call | acceptance runner on the partner package | per-partner |

Pilot may start when D1–D8 are met on the corpus and D10 holds on the partner package. Today: D3, D7, D8 met; D2 partial;
D1, D5, D11 blocked on the register; D4 needs product code; D7 met.

## Certification gates (not proposed as achievable from this branch)

| # | gate | why it cannot be met offline |
|---|---|---|
| C1 | Zero false permissions on reserved blind packages with the live model and live Layer-2 reviewer | requires paid execution and packages this track has not seen (none were reserved: the collaboration contract forbids it) |
| C2 | Measured inventory recall against counsel-confirmed covenants on ≥ 3 real packages | needs design partners |
| C3 | Measured cost and latency per package within a published budget | needs one metered live run (doc 15 E2) |
| C4 | Reviewer effectiveness: Layer-2 catches IPV-01/02/03-class submissions when the deterministic layer does not | doc 15 E3 |
| C5 | Compiled IR (not fixture IR) drives the runtime with the same 14 runtime invariants | needs a live compile of package F |
| C6 | Phase-4 persistence and app wiring exist and are tested | North Star reconciliation: in-memory only |

## How the gates are used

- D-gates are re-evaluated by `npx vitest run tests/product-acceptance` and the three runners; a gate flips when the
  register entry it cites closes (`known-defects.test.ts` forces the bookkeeping).
- Nothing on the C ladder may be claimed in sales material (doc 06 §8). The pilot readout reports D-gate status and
  the partner's own confirmed-covenant recall, nothing else.
