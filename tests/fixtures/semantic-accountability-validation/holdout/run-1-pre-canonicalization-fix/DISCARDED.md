# Discarded run: pre-canonicalization-fix (real architecture defect)

This run (Sonnet 5, $7.05 spent, budget-capped after 6 of 8 regions) was the
first real Sonnet-5 execution of the frozen holdout under
SEMANTIC_ACCOUNTABILITY_PRODUCTION_SHA 78c9fb1. All 6 completed regions
showed `semanticallyComplete=false` with high dangling-lineage-reference
counts (0, 47, 69, 12, 0, 0 - up to 43-44 material items MISSING_FROM_
COMPOSITION per region).

Root cause (confirmed by direct inspection of region-ebitda.json): the
composition model reliably reproduces an inventoryItemId's 24-hex-char
content digest but frequently drops its "inv-item:" prefix when writing it
into a rule/definition/sharedCapacity's `inventoryItemIds` array (48/48
lineage references in the ebitda region matched a real frozen item by digest
alone). Pass C's exact-string matching therefore scored every one of those
as a dangling/hallucinated reference and the corresponding item as
MISSING_FROM_COMPOSITION - a real architecture defect (an intolerant string
match on a formatting variance), not a model-capability limit. This was not
visible in the I1-I45 synthetic corpus because the harness there scripts the
"model" to echo the item's OWN excerpt and lets normalizeInventorySubmission
compute the real id - it never exercises a MODEL re-typing an id it was
merely shown in a prompt.

Fixed in lib/contract-model/compiler/semantic-accountability/reconciliation.ts
(digest-based id canonicalization: a lineage/disposition id that matches no
known id verbatim but matches a known item's content digest is resolved to
that item, counted separately as `canonicalizedLineageReferences`, never
silently and never for a genuinely non-matching id). Verified by a new
regression test and by the full synthetic suite (139/139 passing, unchanged
gate values). Production re-frozen at a new SHA after this fix; this run is
preserved (never deleted) as disclosed evidence of the defect it exposed. A
fresh run-1 was executed against the re-frozen, fixed production code.
