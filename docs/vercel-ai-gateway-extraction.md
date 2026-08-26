# Headroom — Vercel AI Gateway Extraction Transport

**Status: CODE COMPLETE, TESTED. LIVE VERIFICATION PENDING DEPLOYMENT.** This
document reports the switch of Headroom's production contract-extraction
provider to Vercel AI Gateway as an additional, preferred transport. The
provider abstraction, structured-extraction schemas, stage logic, and
solver are unchanged — this is a transport/routing change only.

## A. What changed

`AI_GATEWAY_API_KEY` is now configured as a Vercel Production environment
variable. `lib/extraction/get-provider.ts`'s `getExtractionProvider()`
factory now prefers it over `ANTHROPIC_API_KEY`:

1. `AI_GATEWAY_API_KEY` set → `VercelAIGatewayExtractionProvider`, routed
   through `https://ai-gateway.vercel.sh`. Recorded on `ExtractionRun` as
   `provider = "VERCEL_AI_GATEWAY"`.
2. `ANTHROPIC_API_KEY` set (and no Gateway key) → `AnthropicExtractionProvider`,
   calling Anthropic's API directly. Recorded as `provider = "anthropic"`.
   Still fully supported — the Gateway does not replace it.
3. Neither set, running on Vercel (`process.env.VERCEL`) →
   `MissingExtractionCredentialError` is thrown. Never a silent fallback.
4. Neither set, not on Vercel (local dev/test) → `SyntheticExtractionProvider`
   — deterministic, zero network calls, test/dev only.

## B. Architecture: transport-only change

`lib/extraction/anthropic-provider.ts` now exports an abstract base class,
`AnthropicMessagesProvider`, implementing every stage of
`ContractExtractionProvider` (`extractDocumentStructure`,
`extractDefinitions`, `extractPermissions`, `extractRelationships`,
`extractCoverageGaps`, `extractFinancialInputs`) against an already-
constructed `Anthropic` SDK client + model id. All prompts, Zod schemas
(`lib/extraction/schemas.ts`), and the `client.messages.parse()` +
`output_config.format: zodOutputFormat(...)` structured-output request
shape live here exactly once.

- `AnthropicExtractionProvider` (unchanged behavior) — subclass that builds
  `new Anthropic({apiKey: ANTHROPIC_API_KEY})` against Anthropic's own
  default base URL. Default model: `claude-opus-5`.
- `VercelAIGatewayExtractionProvider` (`lib/extraction/vercel-ai-gateway-provider.ts`,
  new) — subclass that builds `new Anthropic({apiKey: AI_GATEWAY_API_KEY,
  baseURL: "https://ai-gateway.vercel.sh"})`. Default model:
  `anthropic/claude-opus-5` (Gateway requires a provider-prefixed model id;
  confirmed against Vercel's own published AI Gateway documentation for the
  Anthropic Messages API — `POST /v1/messages` implements the identical
  request/response shape Anthropic's own API does, so no stage/schema/prompt
  code differs between the two providers).

Neither subclass overrides any stage method — the entire integration is the
six lines constructing the client + model id.

`EXTRACTION_MODEL` remains the one place a deployment can override the
model, for either provider; the model id format (bare vs. `anthropic/`-
prefixed) is the caller's responsibility to get right for whichever
transport is active. No other file in the application branches on a
specific model id or provider name — `getExtractionProvider()` is the one
call site every caller (`lib/connectors/ingestion.ts`,
`app/[companyId]/onboarding/documents/actions.ts`) goes through.

## C. What is recorded on ExtractionRun (no migration needed)

`ExtractionRun` already had `provider`, `model`, `promptVersion`,
`schemaVersion`, and `startedAt` columns from the original onboarding
pipeline. Every extraction now records:

- `provider` — `"VERCEL_AI_GATEWAY"`, `"anthropic"`, or `"synthetic"`.
- `model` — the actual model id used (e.g. `anthropic/claude-opus-5`).
- `promptVersion` / `schemaVersion` — `PROMPT_VERSION`/`SCHEMA_VERSION`
  from `anthropic-provider.ts`, shared by both real providers (previously a
  latent gap: the two call sites into `runExtractionForDocument` never
  actually passed these through and silently defaulted to the placeholder
  `"v1"`/`"v1"` regardless of which provider ran — fixed as part of this
  change since the task explicitly requires prompt/schema version to be
  recorded correctly).
- `startedAt` — the extraction timestamp.

No credential and no chain-of-thought is ever written to this row — only
the already-existing structured-output fields and this metadata.

## D. Tests added/updated

- `tests/extraction/get-provider.test.ts` — rewritten: Gateway provider
  selection, Gateway preferred over direct Anthropic when both keys are
  set, direct Anthropic still selectable alone, fail-loud
  `MissingExtractionCredentialError` on Vercel with neither credential,
  synthetic fallback only off-Vercel, `EXTRACTION_MODEL` respected,
  no credential value ever appears in the returned metadata.
- `tests/extraction/vercel-ai-gateway-provider.test.ts` — new: the Gateway
  provider shares `AnthropicMessagesProvider` (proving the transport-only
  claim structurally, not just by inspection), default/overridable model,
  fails closed with no key, base URL is Vercel's own documented one, and
  an end-to-end `ExtractionRun` persistence check (provider/model/prompt/
  schema/timestamp) using the metadata the real Gateway path would have
  produced.
- Full suite: 451 passing (53/53 files) after this change; Coherent golden
  26/3/1/0 and Matthews golden 2/4/10/2 unchanged; `tsc`/`eslint` clean.

## E. What could not be verified from this sandbox

No `AI_GATEWAY_API_KEY` (or `ANTHROPIC_API_KEY`) is available in this
sandbox, so `VercelAIGatewayExtractionProvider` cannot be exercised against
a live model here — the same limitation `anthropic-provider.ts`'s own
header comment already documented for the direct-API path. Live
verification (a real Gateway inference request, a real model executing,
`ExtractionRun` recording `VERCEL_AI_GATEWAY` and the real model id from a
live call) requires deployment plus a live acceptance pass against the
protected production app, reported separately.
