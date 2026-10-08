# Proposed paid experiments (authorisation currently $0; nothing below has run)

Each experiment states what runs, the maximum spend, why it is necessary, what evidence it buys, and the cheaper
alternative that was considered. Spend ceilings use the locked rate card for `deepseek/deepseek-v4-flash`
($0.13 input / $0.26 output per million tokens, `rateCardFor`) enforced by `HardDispatchBudget`; prompts are the
production prompts, inputs are the synthetic corpus only. No partner data, no reserved blind packages.

| id | experiment | max cost | necessity | evidence gained | cheaper alternative considered |
|---|---|---|---|---|---|
| E1 | Discovery Pass B–D over the ten packages (production discovery pipeline, one run) | $0.25 ceiling (estimate ≈ $0.05) | discovery completeness is NOT_TESTED; the manifest-declared population stands in for it everywhere | measured discovery recall against the 60 manifest covenants; first evidence for the DISC_PASS_B_PLUS column | none: no offline proxy exists for a model-driven pass |
| E2 | Hybrid closure + Pass B compile on the 14 benchmark cases, metered | $0.25 ceiling (estimate ≈ $0.09 for strategy C per doc 08) | cost and latency are estimates/projections; the architectural recommendation needs one measurement | measured calls, tokens, dollars, seconds per case; cache reuse on the second run; replaces doc 08's DETERMINISTIC_ESTIMATE labels for C | re-use historical live evidence: rejected, different SHA and different scope |
| E3 | Live Layer-2 reviewer on the 29 adversarial submissions (the mocked reviewer returns zero findings today) | $0.25 ceiling (estimate ≈ $0.03) | IPV-01/02/03 are "not caught without the reviewer"; whether the reviewer catches them is the single most important unknown for D1 | per-case reviewer verdicts; reclassifies IPV-01/02/03 as deterministic-gap-only or product-wide | none |
| E4 | Compile package F live and feed the compiled IR to the runtime cases | $0.25 ceiling | runtime evidence is on hand-built IR (C5) | whether compiled IR satisfies the 14 runtime invariants | none |

Total ceiling $1.00; expected ≈ $0.20. Preconditions: the key stays in `.env.local` (never committed or printed);
runs write under `docs/product-readiness/live-runs/<sha>/` with the budget ledger; tests never load the key. Order of
value: E3, E2, E1, E4.
