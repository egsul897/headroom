# Independent executive assessment

Written from the artefacts on branch `claude/independent-product-validation` at `83e6bf1` (ten synthetic packages,
444 offline checks, 14 benchmark cases, 12 mutants, 28 PR #136 cases). Nothing here rests on a live model run.

## What Headroom demonstrably does

1. Parses cleanly drafted credit agreements and indentures into a structural index with definitions and references,
   and keeps a package of base agreement plus amendments in a graph with resolved relationships (A–D, F, I, J; C's
   two amendments).
2. Applies explicit amendments (restate, delete) to the right clause at the right date and answers "what did 7.01(b)
   say on 2025-12-31" correctly, including a new amendment added after the fact (MUT-05) and a changed amount inside
   an amendment (MUT-11).
3. Retrieves the right same-document definitions for a covenant and keeps indenture definitions out of credit-agreement
   compilations (B).
4. Refuses most wrong representations at the deterministic layer without a model: wrong amounts, figures from
   recitals/exhibits/stale amendments, truncated clauses, undefined terms claimed complete, currency relabelling,
   mislabelled families (24/29 adversarial cases).
5. Computes capacity honestly at runtime: approved-only snapshots, exact as-of binding, ledger subtraction, shared
   pools, explicit supersession, duplicate quarantine, simulation with traceable explanations (14/14, fixture IR).
6. Establishes the legal universe for a question cheaply when the deterministic package pass is mandatory: the hybrid
   closure matched broad compilation's recall at roughly two-thirds of its estimated cost; question-scoped retrieval
   did not (5 false permissions).

## What it demonstrably does not do yet

1. **Three ways to show more room than the contract gives, with the deterministic gates silent**: entity-scope
   widening certified (IPV-01); a dropped "together with" shared cap certified (IPV-02); a dropped material condition
   certified when its inventory item is cited on the rule (IPV-03). These are the priority-0 defects.
2. **Override documents are invisible to the operative state** (IPV-16): a side letter that tightens a basket produces
   no effect; the instrument reports RESOLVED on the base text. Any real package with waivers or consents is
   unsafe until this is fixed.
3. **Section-level compilation over an amended agreement uses stale text** (IPV-04) and an unresolvable amendment
   leaves the instrument RESOLVED (IPV-05).
4. **Real-world formatting breaks the parser**: tables of contents, dropped enumeration letters, inline enumerations
   inside definitions, exhibit term lists (IPV-06/07/08/11). Two of these fail closed, two fail silently.
5. **Definition-mediated relationships** (builder baskets netting across sections) are retrieved correctly (J and K
   controls) but have no representation the compiler accepts (IPV-15), and a junior-debt prepayment basket has no
   covenant family at all (IPV-18).
6. **Nothing is known about model-stage quality**: discovery Pass B–D, extraction accuracy, Layer-2 reviewer
   effectiveness, cost and latency are unmeasured on this branch.
7. **No persistence, no application wiring** for Phase 4 (North Star reconciliation).

## Assessment

- The deterministic substrate is real engineering and most of it holds up under adversarial synthetic input. That is
  the asset.
- The product is not ready for a reviewer-free workflow and must not be positioned as one. It is ready for a
  **reviewer-in-the-loop diagnostic pilot** once the four priority-0 items (IPV-01/02/03/16) and the operative-source
  gate (PR136-F1/F4) are closed and re-verified by the committed tests, and after one metered live run establishes
  cost and model-stage behaviour (doc 15).
- Generality is plausible but unproven: the static audit found no issuer-specific logic, but the amendment and
  classifier vocabularies were grown on one issuer's drafting, and the first synthetic corpus exposed eleven
  parser/retrieval defects. Each real package family will likely add patterns; budget for that.
- The commercially meaningful capability is narrower than "covenant compliance": it is *"an evidence-backed answer or
  an explained refusal for a basket question, with the operative text and lineage attached"*. Doc 05 scopes the MVP
  to that; doc 14 positions it by maturity.

## Three decisions for the founder

1. Fund the Cursor track to close IPV-01/02/03/16 and PR136-F1/F4 before any external demo on a real package.
2. Authorise the three paid experiments in doc 15 (bounded, ≈$1 total at the locked rate card) to replace estimates
   with measurements before pricing conversations.
3. Keep the synthetic corpus and the three runners as the CI oracle; every remediation commit must keep 160 tests green
   and move register entries to FIXED_UNVERIFIED → CLOSED through the tests, never by editing the register.
