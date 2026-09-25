# Known-red tests and their documented reasons

Full-suite status is recorded in `05-report.md`. Every red file falls into one of these classes; none is a regression of
the cleanse (each was re-run against the pre-cleanse baseline commit `e9f6b97` in an isolated worktree with the same
node_modules).

## 1. Database-backed suites (environment: no PostgreSQL in the sandbox)

36 files fail with `PrismaClientInitializationError` at their first `prisma.*` call. They exercise persistence,
tenant isolation, replay safety and the legacy Phase C orchestrator against a real database. They pass on the
baseline commit only where a database is reachable; in this sandbox they fail identically on the baseline.
Representative: `tests/contract-model/service-api.test.ts`, `stable-keys-and-replay.test.ts`,
`package-graph-persistence.test.ts`, `part-b-recert-*.test.ts` (DB variants), `compiler-orchestrator.test.ts`,
`tests/contract-model/compatibility.test.ts`, `amendment-and-versioning.test.ts`, `tests/extraction/run-stage.test.ts`,
`tests/extraction/vercel-ai-gateway-provider.test.ts`.

The CI workflow `.github/workflows/canonical-compiler.yml` runs the provider-free certified suites only; the
database suites need a database service and are not part of that job.

## 2. Baseline-red, environment-dependent

- `tests/contract-model/architecture-proposal-node-identity.test.ts` and
  `tests/contract-model/phase-3f1-1-forensic-machinery.test.ts`: assert that no new directory exists under
  `tests/fixtures/unseen-packages/` beyond DSGR/FWRG/LSB/CONMED. The `chwy-2026-credit-agreement` fixture was added
  by commit `578c755` (qualification harness), before this mission. Red on the baseline commit as well.
- `tests/phase-3-conmed-pilot/premium-lock.test.ts`: reads `/tmp/claude-0/pilot/models-bakeoff.json`, an artifact of
  a past bake-off run that does not survive the sandbox. Red on the baseline commit as well. The module is classified
  BENCHMARKING ONLY (see `03-pilot-module-classification.md`).

## 2b. Environment-dependent, not code-dependent

- `tests/benchmark-integrity/v31-benchmark-integrity.test.ts` asserts a clean git working tree; it is red while
  work is uncommitted and green after the commit.
- `tests/contract-model/part-b-terminal-recert-open3-independent.test.ts` ("measured multi-point scaling is
  consistent with O(n)") is a wall-clock timing test; it fails under the full parallel suite (2.46 vs a 2.40 bound)
  and passes when run alone. Timing-sensitive, not a code regression.
- `tests/certification/part-b-recert-fix3-independent-adversarial.test.ts` is database-backed (its first
  `prisma.analysisFailureLog.deleteMany` fails) although its failure message does not name Prisma.

## 3. Pre-existing TypeScript errors outside the compiler

`tests/foundation-audit/*` carries 6 pre-existing `tsc` errors (recorded at mission start). Not touched.

## 4. What the cleanse changed in test expectations

- `tests/phase-3-conmed-pilot/verified-unit-persistence.test.ts`: evidence schema pin `p3-candidate-evidence.v1` ->
  `v2` (additive sections `execution`, `sourceContext`, `certified`, `passA`, `compilerInput.operativeSourceOrigin`,
  `compilation.providerError`, `verification.qualitativeLineage`).
- `tests/phase-3-conmed-pilot/benchmark-recovery-preflight.test.ts`: the Pass A batch-size mirror now reads the
  explicit inventory policy (`input.batchChars ?? policy.batchChars`, certified value 6,000) instead of a literal.
- `tests/contract-model/phase-3-601-hd4-durable-replay.test.ts`, `scripts/phase-3-601-hd4-scripted.ts`
  (`stripVolatile`): the new `FrozenSemanticInventory.calls` execution records (latency, live-vs-replay token
  counters) are stripped like `frozenAt` before content equality; `frozenContentHash` never covered them.
- `tests/contract-model/f7c-production-activation.test.ts`: unchanged assertion; the SINGLE_PASS compile path now
  receives the structural index like DUAL_PASS does (it partitioned slots without it before), so both modes make the
  same number of Pass A calls under the batch-slot ceiling.
- `lib/contract-model/compiler/semantic-accountability/ensemble.ts`: prompt generations v5 (preserved runs) and v6
  (bounded prompt) are both ensemble-compatible; the STRICT gate still requires one ensemble's two passes to match.

No test was skipped, disabled or quarantined by the cleanse.
