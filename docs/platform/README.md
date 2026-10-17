# Platform / ops (Grok lane 4)

## Large uploads are no longer cut off

`app/[companyId]/onboarding/documents/actions.ts` deferred analysis of large
uploads with `void reanalyzeCustomerDocumentFromStorage(...)`. On a
serverless host the instance is frozen once the response returns, so the
floating promise could be killed mid-analysis and the document stayed
STAGED ("in progress") with no worker to resume it.

It now goes through `lib/platform/background.ts#runInBackground`, which
registers the promise with `waitUntil` (`@vercel/functions`) so the instance
lives until it settles (bounded by the segment's `maxDuration = 300`). A
thrown deferred analysis stamps `FAILED_RETRYABLE` (same rule as the direct
path) and is reported to the error tracker.

## Error tracking (env-gated)

`lib/platform/error-tracking.ts` posts Sentry-protocol envelopes over HTTPS.
No SDK, no AI, no paid inference.

| Env var | Effect |
| --- | --- |
| `HEADROOM_ERROR_DSN` (or `SENTRY_DSN`) unset | OFF: every call is a no-op |
| set but malformed | OFF (`INVALID_DSN`): never guesses a destination |
| valid DSN | errors from background tasks are reported |

Messages and extras are scrubbed (connection strings, bearer tokens, Stripe
keys, `token=`/`password=` pairs) before leaving the process.

## PR gate (held: needs a workflow-scoped push)

`docs/platform/pr-gate.workflow.yml` is the proposed
`.github/workflows/pr-gate.yml`. It must be pushed by a token with the
`workflow` scope; it is inactive until then.
