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

Payloads are structural only (`buildEnvelope`): error class name, a sha256
fingerprint and length of the message (never the text: messages here can quote
agreement language or figures), stack frame locations (function identifier,
repo-relative file, line, column), the `where` label and identifier-like tags.
Free-form `extra` was removed; non-identifier tags are dropped, not scrubbed.
An empty `HEADROOM_ERROR_DSN` counts as unset and falls through to `SENTRY_DSN`.

## PR gate

`.github/workflows/pr-gate.yml` is live on this branch (full vitest on the base
tip vs the PR merged into the base; fails only on new regressions or hidden
base failures). `docs/platform/pr-gate.workflow.yml` is its next revision,
waiting for a workflow-scoped push (this branch's token has no `workflow`
scope). It adds:

- **Gate tools from the BASE ref.** `pr-gate-compare.mjs`, `pr-gate-reporter.mjs`,
  `protected-paths.mjs` and `clean-tree.mjs` are read with
  `git show origin/<base>:scripts/platform/<file>`, so a PR cannot loosen the
  gate by editing them. A tool not yet on the base is taken from the PR with a
  `pr-gate bootstrap` warning. (The workflow file itself still comes from the
  PR under `pull_request`; making it tamper-proof needs a branch-protection
  required workflow, which is a repo setting.)
- **Protected paths.** Any added/modified/deleted/renamed path matching
  held-out / holdout / blind / frozen / ground-truth / baseline(s) / sealed
  fails the gate unless the PR has the label `owner-approved-protected-paths`.
  The job re-runs on `labeled` / `unlabeled`.
- **Clean tree.** After the PR test run, `git status --porcelain` must be empty.
  Tests and the scripts they spawn write generated artifacts through
  `lib/platform/artifact-output.ts`, which redirects to
  `$TMPDIR/headroom-test-artifacts/` under vitest (or to `HEADROOM_ARTIFACT_DIR`).
  An intentional regeneration run (plain `npx tsx scripts/...`) still writes the
  committed copy.
