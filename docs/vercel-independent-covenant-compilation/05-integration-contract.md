# WS-VIC integration contract (Phase 2)

**Workstream:** `WS-VIC` (bc-01a11d85-2531-7ae2-a5d5-cf7360ca6d1d)  
**PR:** https://github.com/egsul897/headroom/pull/146  
**Coordinator:** WS-PAR ([Parallel agent operating rules](https://cursor.com/agents/bc-01a11d87-7950-77b8-8141-e448c7e00e3f))  
**Status:** PUBLISHED for peer consumption — does not rewrite peer exclusive trees

## Ownership (consumes WS-PAR map v6)

| Path | Disposition |
| --- | --- |
| `lib/contract-model/compiler/inference/**` | **OWN** (adapters, policy, run-store, comparison) |
| `lib/contract-model/compiler/deterministic-extraction/**` | **OWN** |
| `lib/contract-model/compiler/local-semantic/**` | **OWN** |
| `lib/contract-model/compiler/selective-compilation/**` | **OWN** |
| `docs/vercel-independent-covenant-compilation/**` | **OWN** |
| `scripts/vercel-independent-compilation/**` | **OWN** |
| `tests/vercel-independent-compilation/**` | **OWN** |
| `lib/contract-model/covenant-knowledge/**` | **REMOVED** — resolves **C-DUP-KF** |
| `lib/knowledge-factory/**` | **MUST NOT TOUCH** (WS-CKF) |
| `lib/contract-model/compiler/structural-index.ts` + discovery/amendment/package-graph | **CONSUME only** (Structural Compiler / Legal Core substrate) |
| `lib/covenant-dependency-atlas/**` | **MUST NOT TOUCH** (WS-CDA) |
| `lib/definition-encyclopedia/**` | **MUST NOT TOUCH** (WS-DEF) |

## C-DUP-KF resolution

Phase-1 accidentally introduced `lib/contract-model/covenant-knowledge/**` as a parallel corpus store. Per WS-PAR `11-concrete-integration-plan.md`, that path is deleted. Compile-run persistence now lives at:

`lib/contract-model/compiler/inference/run-store/**` (`VicRunStore`)

This is a **compile-run artifact cache** (facts/hypotheses/benchmarks for offline replay). It is **not** the Covenant Knowledge Factory corpus DB. Durable corpus upsert remains WS-CKF.

## Published contracts peers may depend on

1. **Provider adapter SPI** — `lib/contract-model/compiler/inference/types.ts` (`InferenceAdapter`, modes, provenance/cost fields).
2. **Deterministic-vs-hypothesis boundary** — `deterministic-extraction/types.ts` (`doesNotImplyPermission`, `doesNotImplyOperativeAuthority`).
3. **Run-store import shape** — `inference/run-store/schema.ts` (`verificationStatus` never auto-`INDEPENDENTLY_VERIFIED` from model output).
4. **Dataset delivery alignment** — VIC exports under `docs/vercel-independent-covenant-compilation/*` include `actualRecordCounts`, hashes, compiler versions, and honest verification labels per `06-dataset-delivery-contract.json`.

## Soft gates we honor

- No paid calls / paid infra without founder authorization.
- No edits to sealed evidence, certification boards, Claude-owned fixtures.
- No silent overwrite of Legal Core / Structural Compiler / CKF / CDA / DEF exclusive trees.
- No promotion of hypotheses to verified representations.
- Held-out CKB (#145) is never used for tuning.
