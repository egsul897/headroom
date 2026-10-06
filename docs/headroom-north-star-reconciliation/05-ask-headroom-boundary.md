# 05 — Ask Headroom boundary

| layer | owns | input | output | must never |
|---|---|---|---|---|
| **Phase 3** — semantic rulebook | what the contract requires: rules, permissions, conditions, capacity expressions, period / as-of selectors, shared capacities, reclassification rights | operative document text (Phase 2), context | certified IR units with provenance; certification status | read financial data; resolve a selector to a date; certify an unverified unit |
| **Phase 4A** — evaluation | exact arithmetic over the IR | IR + strict resolvers | values, statuses, traces | evaluate a unit the verification gate excludes; use the legacy loose resolver on a North-Star path |
| **Phase 4B** — financial resolution | which approved base fact satisfies each reference | dependency manifest + approved snapshots + policy | resolved facts with provenance, or MISSING / AMBIGUOUS / NOT_APPROVED / NEEDS_INPUT | pick by order, recency or wildcard; widen policy silently |
| **selector resolution** (to build) | mapping a contractual selector + evaluation date to one snapshot identity | IR selector, fiscal calendar, delivery evidence | snapshot identity, or AMBIGUOUS / NEEDS_INPUT | assume "latest quarter" |
| **Phase 4C** — capacity / ledger | historical legal / capacity state | capacity graph + immutable ledger usage | capacity state per path; remaining capacity; issues | sum independent capacities; resolve an ambiguous historical allocation |
| **Phase 4D** — simulation | what an explicitly stated transaction does to that state | capacity state + base snapshot + explicit transaction + explicit adjustments + caller-selected path | pre/post state, overlay, ledger effects, commit plan, limitations | infer an adjustment; resize an over-draw; choose a path |
| **Phase 4E** — path enumeration (to build) | which legal paths could authorize the transaction and what each requires | transaction, rulebook, capacity state | neutral list of candidate paths with requirements | rank, recommend or optimise unless explicitly asked |
| **Ask Headroom** — orchestration | turning natural language into an explicit transaction and an explicit input / adjustment request; running the layers; presenting the Headroom Answer | user's proposal and answers | Headroom Answer (North Star §10) | be a legal authority, a financial-source authority or an accounting engine; fill a gap with a model's guess |

## The Ask Headroom loop

1. **Intake.** A model may parse the proposal into a draft transaction (kind, amount, currency, date, counterparties,
   entities). The draft is shown back and confirmed; nothing unconfirmed is used.
2. **Paths.** 4E enumerates candidate paths from the certified rulebook. Paths built on uncertified units are listed as
   REVIEW_REQUIRED, never as available.
3. **Requirements.** For each path the 4B dependency manifest states the facts and periods every test needs; selector
   resolution names the snapshot; 4C names the ledger state.
4. **Required pro-forma request.** For each test that a pro-forma clause governs, Ask Headroom lists the adjustments the
   contract requires (e.g. "give pro forma effect to the incurrence and the use of proceeds") and asks for each value.
   A model may *suggest* a value (e.g. principal × stated coupon for interest expense); a suggestion becomes an input only
   when the user confirms it, and it is labelled a user-supplied assumption in the answer.
5. **Run.** 4D simulates each path the user selects (or each candidate path, independently, never compared or merged).
6. **Answer.** Before / after, capacity, conditions, ledger effects, evidence, limitations. Missing anything →
   NEEDS_INPUT with exactly what is missing.

Invariants 25–27 apply directly: Ask Headroom reads trusted state through the same engines every surface uses; it never
recomputes a fact its own way.
