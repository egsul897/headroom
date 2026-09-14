# Phase 3 Chewy remediation - F-7B.1: submit_compilation wire tolerance + exact 5-shard Stage-1 rerun

Starting SHA `c58acd9c9985569f24e19355e924e0338e56bcb5`. Paid calls: 18 turns over the same 5 shards, **$2.7197** (cap $3.25).
Stage 2 not run; 31 shards untouched. Production change: 1 new module + 1 caller insertion. Verdict: **F7_NOT_SAFE**
(pre-registered trust gate 6 fails on 20 unanchored nested-term definitions; every other gate passes - see below).

## 1. Root cause, reproduced offline (`00-root-cause-reproduction.json`, `01-freeze.json`)
All 5 retained raw `submit_compilation` inputs fail `SubmitCompilationSchema.safeParse` at the starting SHA with exactly
"expected array, received string" on top-level fields (`definitions`, `sharedCapacities`, `irExtensionCandidates`,
`overallNotes`; `inventoryDispositions` in 3 of 5). Every such string strict-parses to an array whose elements satisfy the
existing element schemas. No nested field is stringified. Classification **A - TOP_LEVEL_JSON_ARRAY_STRING_TRANSPORT_VARIANCE**.
Earliest failing function: `RealSemanticCaller.compile` at the `SubmitCompilationSchema.safeParse(submitBlock.input)`
statement in `lib/contract-model/compiler/semantic/caller.ts`. The strings are present in the provider tool input as
delivered: the retained raw is `submitBlock.input` stored without transformation, and no Headroom code touches it before
`safeParse`. The tool's advertised input schema declares these fields as arrays, so this is transport variance, not a
schema mismatch, and not caller corruption.

## 2. Remedy (`lib/contract-model/compiler/semantic/transport-normalization.ts`, `caller.ts`)
`normalizeSubmitCompilationTransport(raw)` runs immediately before `safeParse`. For each of the six top-level array
fields only: if the value is a string, strict `JSON.parse` succeeds, and the result is an array, the string is replaced by
that array on a shallow copy. Everything else (arrays, absent fields, non-JSON strings, JSON objects/null/numbers, nested
strings) is untouched, and the existing Zod schema remains the sole judge of content. `rawSubmission` keeps the untouched
provider input; the caller result exposes an additive `transportNormalization` audit (field, original type, string sha256
and length, parse attempted/succeeded, decoded type and length, applied). F-1 protocol, max_tokens recovery, tool budget
and every other caller path are unchanged. Malformed / non-array / invalid-element strings still end as MODEL_SCHEMA_FAILURE.

## 3. Offline proof (`02`, `03`, `04`, `05`)
- All 5 retained submissions validate after decoding; production normalize + IR validation pass; owned-material replay:
  13 represented + 11 dispositioned + 4 missing of 28; 0 lineage claims on unowned inventory.
- Decoded content equals `JSON.parse(original)` by canonical hash on every decoded field; untouched fields are identical
  references (`semanticPayloadExactEquality = true`).
- 16 recorded valid submissions (Chewy 6.08 + 15 Phase 3B/3B.1 results) pass through the normalizer as the same
  reference with the audit not applied and a byte-identical parse.
- Synthetic matrix A-N + caller behavior: 21/21; relevant suites 89/89; zero-cost gate 9/9.

## 4. Paid rerun of the exact same 5 shards (`06`, `07`, `08`, `10`)
Same plan hash, shard ids and hashes, source, inventory, context, model, prompt and tool policy. Every shard was ACCEPTED
(0 schema failures, 0 provider failures, 0 retries). **The transport decoder did not fire on any shard: the model returned
real arrays this run.** The stringification variance is therefore non-deterministic (5/5 in F-7B, 0/5 here); the normalizer
is proven by the offline replay and tests, not by this run.

| | original F-7B Stage 1 | rerun |
|---|---|---|
| owned material accounted / 28 | 0 (0%) | 26 (92.9%): 23 represented, 3 dispositioned, 2 missing |
| schema failures | 5 | 0 |
| cost / turns | $2.63 / 17 | $2.72 / 18 |
| peak single-turn input | 49,649 | 54,617 (envelope 60,000) |
| peak output per shard | 42,224 | 37,676 |
| aggregate input / output | 633,487 / 136,520 | 637,083 / 144,549 |

Oversized atomic definition ("Permitted Liens", 26,695 chars): ACCEPTED, 11 rules + 2 definitions, 5 of 6 owned material
items represented, largest turn 41,722 input tokens, no truncation. Lineage claims on unowned items: 0. Contextual
ownership credit: 0. Dangerous silent omissions: 0. False completeness: 0. Stitch collisions: none. Values lost / dangling
refs by stitching: 0. Global Pass C over all 108 material items: 37 represented, 3 dispositioned, 68 missing (the 31
unexecuted shards own 80 of them by construction).

## 5. Two architecture observations that decide the verdict (`08`, `09`)
**(a) Unanchored nested-term definitions - pre-registered trust gate 6 fails (20 objects).** The accepted submissions
contain 22 definitions whose terms are not planner DEFINITION units: 20 are nested defined terms inside the shard's own
primary text (e.g. "Transaction Threshold" / "Annual Threshold" inside "Prepayment Event", "Pro Forma Basis"), 2 are terms
defined outside the unit that the model reached through `getReferencedProvision` (Sections 1.08(a) / 2.22(a)). None carries
inventory lineage (Pass A inventoried no item for them), so the F-7A stitcher attributes them to the shard's first unit
by fallback and keeps them with no provenance anchor, and the pre-registered F-7B scorer counts them as source-unverifiable
IR surviving. Twenty of them are verifiable against the source text of the slice they came from, but nothing in the plan,
inventory or stitched IR records that; the 2 out-of-unit ones are contextual emissions the stitcher should have dropped.
This is a stitcher/planner gap (nested-definition units are not derived; the first-unit fallback grants ownership without
evidence), not a wire or model problem. Not fixed here: one root cause per mission.
**(b) MISSING_CONTEXT on every shard (F-7B gate 9).** 13 of 74 accepted definition/rule objects declare
MISSING_CONTEXT, each with a stated reason: the 8-call tool budget was exhausted, a large retrieved definition was
truncated at the tool's excerpt ceiling, or the term is defined by cross-reference into another Section (6.01(a),
6.08(a)(3), 9.02(b), 1.08(a)). These are honest disclosures, not silent gaps; they point to tool budget / excerpt bounds,
which a monolithic compile would hit identically for cross-Section references, rather than to the shard's bounded
read-only context (0 MISSING_CONTEXT dispositions on owned items).

## 6. Verdict logic
§24 gate: 1, 2, 3, 4, 5, 7, 8, 9, 10 pass; 6 ("no source-unverifiable IR survives") fails with 20 objects. The metric was
pre-registered in F-7B (02-scorer-and-gates.json, H) and is not softened after the fact; a failed trust gate maps to
**F7_NOT_SAFE**. What is established regardless: the F-7B 0/28 result was caused by the wire defect; owner shards recover
their owned semantics in reality (26/28); cross-shard ownership discipline held (0 unowned claims, 0 contextual credit);
the oversized definition is bounded. The next iteration is in the stitcher (anchor nested-term definitions to the unit
whose primary text defines them, drop and flag definitions whose term is not locatable in owned text), after which the
same frozen 5-shard results can be re-stitched offline at zero cost before any Stage 2 spend.
