# Pilot module classification (`scripts/p3-conmed-pilot/`)

Quarantine audit required by the cleanse. Classes:

- **REQUIRED** - a production capability that the canonical path depends on or that stays the single owner of a
  concern (it must move under `lib/` or already delegates to `lib/`).
- **BENCHMARKING ONLY** - harness tooling for population runs, resume, recovery, spend accounting. Never imported by
  `lib/`. Allowed to stay, must never be a dependency of the compiler.
- **SUPERSEDED** - a behaviour the certified path now provides inside `lib/`; kept only because preserved evidence and
  tests reference it. Candidates for deletion once the referenced runs are archived.
- **DANGEROUS** - a module that can make paid calls or mutate run evidence; requires an explicit mission authorization
  and the `.env.local` credential export to run at all.

| module | class | reason / disposition |
|---|---|---|
| `pipeline.ts` | REQUIRED (delegating) | deterministic CONMED scaffold; `operativeTextFor` delegates to `lib/contract-model/compiler/candidate-span.ts` (the ONE operative-source rule). Package assembly (`buildDeterministicStages`) is the pattern `covenant-map/pipeline.ts` takes as `CovenantMapPackageInput`. |
| `compile-run.ts` | SUPERSEDED / DANGEROUS | `buildInput` now delegates to `covenant-map/candidate-input.ts#assembleCompilerInput`; `callerFor` still constructs the legacy `RealSemanticCaller` with `maxRetries: 2` (the 12-turn loop). Paid. Replaced by `covenant-map/callers.ts#createCertifiedCallers` (maxRetries 0, bounded caller). Do not use for new runs. |
| `evidence.ts` | REQUIRED | evidence writer (`p3-candidate-evidence.v2`), secret scan (`assertNoSecrets`), verified-unit persistence. Candidate to move under `lib/contract-model/verified-units`. |
| `gateway-credit.ts`, `reservation-policy.ts`, `timeout-policy.ts`, `cost-model.ts` | SUPERSEDED (harness) | 402 detection, output-rate reservations, harness timeouts and harness pricing. The compiler now owns these: `analyzer/provider-error.ts` (structural 402), `analyzer/dispatch-budget.ts` (pre-dispatch reservation), `analyzer/deadline.ts` (AbortSignal), `analyzer/pricing.ts` (rate cards). The harness copies remain for the preserved runs' validators. |
| `population-loop.ts`, `run-population*.ts`, `resume.ts`, `resume-calibration.ts`, `conmed-resume-*.ts`, `conmed-continuation-postrun.ts` | BENCHMARKING ONLY / DANGEROUS | population execution and resume orchestration over the legacy caller. Paid. Superseded for new runs by `covenant-map/pipeline.ts#compileCovenantMap`. |
| `run-benchmark-recovery.ts`, `benchmark-recovery-postrun.ts`, `recovery-preflight-baseline.ts` | BENCHMARKING ONLY / DANGEROUS | the $15 recovery harness. Authorization SUSPENDED for this mission; not run. |
| `run-pilot.ts`, `run-bakeoff.ts`, `bakeoff.ts`, `probe-models.ts`, `premium-lock.ts`, `qualify.ts`, `f1-closure-run.ts`, `f1-paid-check.ts`, `health-probe.ts`, `gateway-health.ts` | BENCHMARKING ONLY / DANGEROUS | model selection, gateway health, paid probes. Never imported by `lib/`. `premium-lock.test.ts` depends on a `/tmp` artifact (known-red, baseline). |
| `build-artifacts.ts`, `build-bakeoff-artifacts.ts`, `build-resume-artifacts.ts`, `rescore.ts`, `dedup.ts` | BENCHMARKING ONLY | artifact builders and scorers over preserved runs. Zero cost. Never imported by `lib/`. |
| `forensic-grounding.ts`, `forensic-grounding-replay.ts`, `call-sequence-forensics.ts`, `payload-forensics.ts`, `evidence-universe-audit.ts`, `bundle-typing-audit.ts`, `false-credit-span-probe.ts`, `numeric-grounding-*.ts`, `condition-markers.ts`, `r2-real-case-verification.ts`, `red-baseline.ts`, `runtime-envelope-corpus-report.ts` | BENCHMARKING ONLY (forensics) | offline forensics over preserved evidence. Zero cost. |
| `span-*.ts`, `pre-change-span.ts`, `shard-threshold-sim.ts`, `verified-units-dry-run.ts` | SUPERSEDED (forensics) | span-contract and shard simulations from the population investigation; the certified path's expansion policy (`CONTEXT_ONLY`) and the offline sharding measurement (`docs/canonical-covenant-map/01-audit.md`) supersede their questions. |

Invariant (enforced): nothing under `lib/` imports from `scripts/`. The canonical path (`lib/contract-model/covenant-map/`)
imports no pilot module; the pilot's `buildInput` and `operativeTextFor` delegate to `lib/`.
