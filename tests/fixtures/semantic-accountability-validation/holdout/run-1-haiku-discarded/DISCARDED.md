# Discarded run: Haiku 4.5 substitution

This run (2026-09-01T23:29Z, $4.17 spent, budget-capped before the 8th region)
was executed with ANALYZER_MODEL/SEMANTIC_COMPILER_MODEL overridden to
`anthropic/claude-haiku-4-5` at the user's request, to reduce validation cost.

Results showed severe compiler/lineage quality degradation relative to every
prior Sonnet-5 execution of this same frozen holdout: 0/7 completed regions
before the ceiling, one outright compile FAILURE (net-income), and dangling-
lineage-reference counts of 6-73 per region (vs. low single digits or zero on
Sonnet 5) - consistent with Haiku 4.5 frequently fabricating inventoryItemIds
rather than citing the ones it was actually given, a capability gap in the
lineage-citing convention this architecture depends on, not an architecture
defect (the accountability layer correctly caught every one of these as
MISSING_FROM_COMPOSITION / dangling, exactly as designed).

Per user decision (AskUserQuestion, this session), this run is DISCARDED and
excluded from the final verdict; a fresh run-1 was executed on Sonnet 5 (the
model Mission-4's baseline used) in its place. This directory is preserved,
never deleted, as disclosed evidence of the substitution and its outcome.
