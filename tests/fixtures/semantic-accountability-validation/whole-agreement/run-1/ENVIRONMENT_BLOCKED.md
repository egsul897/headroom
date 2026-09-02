# Partial run: provider account budget exhausted (ENVIRONMENT_BLOCKED)

3 of 12 regions completed (definitions-lsb, definitions-dsgr, debt-dsgr) before
every subsequent call failed with HTTP 402 from the Vercel AI Gateway:

  "API key budget exceeded. Current spend: $150.34, limit: $150.00.
   Please contact your administrator to increase the budget."

This is an account-level budget cap on the Gateway credential itself,
unrelated to this mission's own per-run cost ceilings (the $10 ceiling this
run was given was never reached: total spend was $5.29, all pre-402).
Per user decision, this run is accepted as final (real) evidence for the 3
completed regions; the remaining 9 are reported ENVIRONMENT_BLOCKED, not
retried, not treated as a semantic failure of the architecture. All 9
failed region JSON files are preserved with the 402 error verbatim in
compile.unresolvedIssues.

The 3 completed regions are consistent with the post-canonicalization-fix
holdout results: dangling-lineage 0-1/region (vs. 47-69/region pre-fix).
