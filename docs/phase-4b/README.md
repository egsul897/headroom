# Phase 4B: financial input and metric/term resolution contract

Starting SHA `4da8bc04da3d42bcfb917b3efff7d227811c4df4`. Zero paid, model or provider calls.
Phase-3 semantic tree `f79bc12dd479e9b803bf9e37092d76b6aedb8c12` and compiler tree
`b4e6a9da496a23b9f98607355520a456e6c48e1f` are frozen and unchanged. Runtime version
`contract-runtime.v1`; input contract version `financial-input-contract.v1`.

## The boundary

Phase 4A proved the IR can be evaluated exactly. It resolved facts through a fixture resolver that
matched on a bare name, treated a null period as a wildcard, and took the first array element that
matched. That was fine for fixtures and unsafe for money.

Phase 4B replaces it with an identity contract. A financial fact is identified by company, scope,
kind, key, period, as-of, value type and currency. Anything that differs in any of those is a
different fact, and one never stands in for another.

The invariant the module exists to enforce: no input is selected by array order, first match,
implicit wildcard, silent period or as-of fallback, company- or instrument-agnostic name equality,
or a latest-looking version guess.

## What was built

New area `lib/contract-model/runtime/input/`. Nothing outside `lib/contract-model/runtime/` changed.

| module | role |
|--------|------|
| `version.ts` | `financial-input-contract.v1`, carried on every resolution and every value |
| `types.ts` | identity, scope, selectors, snapshots, resolution states, policy, manifest records |
| `identity.ts` | canonical hashing (BigInt-safe), identity and candidate sort keys, contract period and as-of selectors |
| `snapshot.ts` | the snapshot graph, explicit supersession, and the nine ways a snapshot set is unsafe |
| `resolve.ts` | the single resolution path: canonical sort, exact filters, type contract, status policy, supersession, optional looser as-of mode |
| `snapshot-resolver.ts` | the `StrictInputResolver` the evaluator consumes, plus term resolution |
| `manifest.ts` | the dependency manifest: what a rule or expression needs, before anything is evaluated |

The Phase-4A evaluator gained an optional `strict` member on `InputResolver`. It prefers the strict
path and falls back to the legacy one, so every Phase-4A test passes unchanged.

## Two first-match defects the generality scan found

The anti-enumeration scan was written to ban a first match in the resolution path. It found two:

- `manifest.ts` picked the first definition whose term name, company and instrument matched.
- `snapshot-resolver.ts` picked the first rule whose rule id matched.

Both now require a unique match. A reference matching more than one Phase-3 object is recorded in
`ambiguousExpansions` and is never expanded. The manifest reports the dependency as an unexpanded
fact and names every candidate.

## Two defects the gate found

- A fact admitted by the looser `LATEST_ON_OR_BEFORE` as-of mode, when it was the only survivor,
  was reported as `EXACT_IDENTITY`. It had not matched exactly. Misreporting how a number was
  chosen is the same class of error as choosing it wrongly, so the selection method now says
  `LATEST_ON_OR_BEFORE_AS_OF` whenever the chosen as-of differs from the one asked for.
- `RejectionReason` carried `CURRENCY_NOT_REQUESTED` that nothing ever emitted. `InputQuery` now
  takes an optional `currency`: a reference that knows its currency rejects a fact in another one.
  A reference that names none still cannot be fooled, because two facts differing only in currency
  are two identities, so both survive and the answer is AMBIGUOUS rather than a pick.

## A named contract term, not a hidden one

The evaluation as-of is part of every reference identity. A fact stored as `NOT_AS_OF_SPECIFIC`
does not satisfy a reference evaluated as of a date, and vice versa. The alternative would be for
the runtime to decide on its own that an undated fact is good enough for a dated question, which is
the implicit assumption this phase exists to remove.

It fails closed: a mismatch is NEEDS_INPUT, never a substituted number. The cost is real and is
recorded in artifact 03 and the Phase-5 handoff: a snapshot is not reusable across evaluation dates
unless its facts carry the matching as-of or the caller explicitly names the looser mode. The
dependency manifest states the exact as-of each reference will ask for, so a supplier never guesses.

## Artifacts

| # | file | content |
|---|------|---------|
| 01 | `01-phase4a-input-resolution-audit.json` | what the Phase-4A resolver did, construct by construct, and what replaced it |
| 02 | `02-financial-input-identity-model.json` | the identity fields, scope model, identity strength, and distinct-hash proof |
| 03 | `03-temporal-resolution-contract.json` | period and as-of selectors, verbatim carriage, and the named as-of contract term |
| 04 | `04-snapshot-supersession-model.json` | snapshot shape, statuses, explicit supersession, and every unsafe graph detected |
| 05 | `05-resolution-algorithm.json` | the pipeline, states, rejection reasons, selection methods, order-invariance hashes |
| 06 | `06-input-provenance-contract.json` | what every resolved value carries about where it came from and who approved it |
| 07 | `07-term-resolution-contract.json` | definition versus supplied value, precedence, and the explicit override field |
| 08 | `08-dependency-manifest.json` | manifest shape and worked examples, including the ambiguity refusal |
| 09 | `09-runtime-integration.json` | the strict wiring, new diagnostic codes, and the five-state mapping |
| 10 | `10-adversarial-matrix.json` | the A to T matrix, executed through the production code |
| 11 | `11-anti-enumeration-determinism-fixture-proof.json` | the generality scans, repeatability, and the Phase-3 IR proof |
| 12 | `12-phase5-handoff.json` | what Phase 5 must produce, and what it must never do |
| 13 | `13-regression.json` | suites, full versus base, tsc, lint, build, and the timing characterisation |
| 14 | `14-phase4b-gate.json` | the 35 gate conditions and the verdict |

## Not in Phase 4B

No ingestion. No ERP, bank, spreadsheet, PDF or compliance-certificate parsing. No capacity ledger,
no reclassification, no solver, no persistence, no UI, no model or provider calls. Phase 4B defines
the shape of the truth Phase 5 will supply and refuses everything that does not fit it.
