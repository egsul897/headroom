# Schema — `source-to-covenant-dataset.v1`

## Record (`SourceToCovenantRecord`)

Top-level fields:

| Field | Meaning |
|---|---|
| `exampleId` | Stable example identity |
| `schemaVersion` | `source-to-covenant-dataset.v1` |
| `polarity` | `POSITIVE` \| `NEGATIVE` |
| `role` | Operative / definition / exception / amendment / reserved / unsupported |
| `split` | `train` \| `dev` \| `eval-heldout` |
| `document` | Issuer/instrument/document/fixture identity |
| `operativeVersion` | Operative document, as-of, amendment identity |
| `structural` | Section / article / unit kind |
| `governingProhibition` | Governing prohibition text when applicable |
| `input` | Controlling context + hashes + defs/exceptions/conditions/xrefs |
| `output` | Candidate structured representation + uncertainty + verification |
| `toolVersions` | Exact compiler/IR/verifier/dataset version pins |
| `nearDuplicateClusterId` | Set when near-dup detection clusters the window |
| `contaminationRestrictions` | Hard exclusions for acceptance/few-shot corpora |
| `authoredAt` / `authoringMethod` | Label provenance |

`toolVersions.pinsAreNotLabelAuthority` is always `true`.

## Verification status semantics

| Status | Meaning |
|---|---|
| `HUMAN_SOURCE_VERIFIED` | Human read the authentic source and verified the candidate fields |
| `HUMAN_HYPOTHESIS` | Human proposed; not fully verified |
| `MODEL_HYPOTHESIS` | Model-like hypothesis retained for contrast; never auto-approved |
| `UNRESOLVED` | Cannot resolve from available controlling context |
| `UNSUPPORTED` | Semantics outside current representation target |
| `NOT_APPLICABLE` | Negative / reserved / non-covenant material |

## Export contracts

- `exports/importable-records.json` — `{ schemaVersion, provenance, records }`
- `exports/sft-ready.jsonl` — one flat row per example; every row carries
  `usage_rights_review_required: true` and
  `exclude_from_claude_acceptance_corpus: true`
