# 13 - Provenance excerpt source-binding contract

Starting SHA `f230338084009d1829ae18927707cb912fd1bb12`. Zero paid calls. §7.2(c) retired; its final live evidence under
`docs/phase-3-live-validation/7.2c-final-source-authority/` is read by the regression only and never rewritten.

## Invariant

AUTHORITATIVE PROVENANCE IS ALWAYS SOURCE-ADDRESSABLE. A model may emit an abbreviated or elided excerpt ("LEFT … RIGHT");
model-authored prose becomes authoritative source evidence only when it resolves deterministically to exactly one
contiguous span of one admissible source text. The compiler keeps two things apart on every provenance:

| field | meaning | authority |
|---|---|---|
| `provenance.excerpt` | the exact source substring the model excerpt was bound to; the verbatim model text when it is itself a real quotation; `null` when the model excerpt could not be bound | authoritative - read by grounding, the projection, verified units, certification |
| `provenance.rawModelExcerpt` | the model's excerpt verbatim, present whenever it differs from `excerpt` or could not be bound | audit only - never projected to Layer 2 |
| `provenance.excerptResolution` | `{version, status, reason, detail, segments, sourceKey, sourceKind, sourceDocumentId, sourceSectionRef, charStart, charEnd, absCharStart, absCharEnd, boundSha256}` | deterministic record of how `excerpt` was established |

The resolver (`compiler/semantic/provenance-binding.ts`, `provenance-source-binding.v1`) runs inside `provenanceFor` in
`normalize.ts` - the single place model excerpts enter canonical IR (rules, definitions, shared capacities, expressions,
conditions, exceptions) - so every downstream consumer (qualitative grounding, numeric / qualitative lineage, verification
projection, verified-unit packaging, certification) sees bound provenance only. The raw model output is never altered.

## Resolution algorithm (source binding, never quote repair)

1. Split the excerpt on ellipses (`...`, `…`, `. . .`); leading / trailing ellipses are dropped; no non-empty segment left
   is `DEGENERATE_ELLIPSIS`.
2. Normalize source and excerpt with the one canonical rule qualitative grounding already applies (whitespace runs collapse
   to one space, case-insensitive) while keeping an index map back to the original source; every bound excerpt is the
   ORIGINAL source substring (line wraps intact) at ORIGINAL offsets. No edit distance, no token insertion, no punctuation
   change, no semantic matching, no provider call, no time dependence.
3. Source tiers: the candidate's own OPERATIVE text first; resolved source-context regions and context-bundle excerpts
   (identical texts deduplicated) only when the excerpt - or an anchor - occurs nowhere in the operative text. An
   ambiguous, reversed or boundary-crossing operative match is final. The operative text carries the spans owned by
   separate child candidates as inadmissible boundaries (the verifier's own exclusion rule).
4. Exact excerpt (one segment): one occurrence -> `VERBATIM_UNIQUE` (span bound); several -> `VERBATIM_NON_UNIQUE` (the
   quotation is verbatim, no span is claimed); shorter than 12 normalized chars -> `VERBATIM_SHORT` (not locating
   evidence, unchanged); none -> `UNRESOLVED / NOT_IN_SOURCE`.
5. Elided excerpt (several segments): each segment must be at least 8 normalized chars (`ANCHOR_TOO_SHORT`), present
   (`LEFT_ANCHOR_MISSING` / `RIGHT_ANCHOR_MISSING` / `SEGMENT_MISSING`), and exactly one ordered, non-overlapping chain of
   occurrences inside one source must exist (`AMBIGUOUS_SPAN` for several, `REVERSED_ANCHORS` for none in order,
   `CROSS_SOURCE` when the anchors live in different sources, `CROSSES_INADMISSIBLE_BOUNDARY` when the only chain straddles
   an owned-elsewhere boundary; more than 10,000 candidate chains is ambiguous). Several interior ellipses are supported
   through exactly this one-unique-chain proof - never by choosing. The result is `SOURCE_BOUND_ELIDED`.

## Behaviour in the compiler and the verifier

- `SOURCE_BOUND_ELIDED`: `excerpt` becomes the source substring, `rawModelExcerpt` keeps the model text, a DIAGNOSTIC-class
  `PROVENANCE_EXCERPT_SOURCE_BOUND` records the binding (scope, source, span). Sufficiency unaffected.
- `VERBATIM_*`: `excerpt` unchanged; the resolution records the span when unique.
- `UNRESOLVED`: `excerpt` is `null`, `rawModelExcerpt` keeps the model text, and the rule is limited
  (`PROVENANCE_EXCERPT_UNRESOLVED`, SUFFICIENCY class -> COMPLETE becomes PARTIAL) before verification sees it. Qualitative
  grounding v4 treats an UNRESOLVED resolution exactly like an unlocatable excerpt: FABRICATED, MATERIAL - inventory lineage
  never rescues it and the raw model text is never consulted. Nothing about grounding was relaxed; an unlocatable excerpt on
  a hand-built provenance is still FABRICATED (tested).
- Projection v4 projects `excerpt` and `excerptResolution` and strips `rawModelExcerpt` (it joins the internal-metadata
  key set); the reviewer independently checks exact grounding against the source as before.

## Versions
semantic-accountability-compiler.v7 -> v8 (prompt v8 unchanged); qualitative-grounding.v3 -> v4; phase-3c-semantic-verifier.v4
-> v5 (prompt v4 unchanged); phase-3c-verification-projection.v3 -> v4; provenance-source-binding.v1 (new). IR schema
unchanged (additive optional `SourceProvenance.rawModelExcerpt` / `excerptResolution`); identity derivation unchanged
(provenance stays outside expression identity).

## §7.2(c) regression (frozen evidence, offline)
The raw condition excerpt of the final live run elides "of the Parent Borrower and its Subsidiaries for which financial
statements are available" with "...". The generic resolver binds it to the one operative-text span [63, 527) (document
offsets [48166, 48630)) whose whitespace-normalized text is the expected full quotation, keeping the source's own line
wraps; through the normalizer the frozen raw submission yields `SOURCE_BOUND_ELIDED` provenance and grounding v4 finds the
condition GROUNDED. The persisted artifact is unchanged; the recorded MATERIAL finding stands as history.

## Not changed
No verifier relaxation, no certification shortcut, no special case keyed to any agreement, section or candidate; Phase 2,
Phase 4 runtime and the historical live evidence untouched; no paid call.
