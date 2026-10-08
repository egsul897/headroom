# Parallel agents — published interface contracts

**Workstream:** `WS-PAR`  
**Status:** DRAFT_CONTRACT (consumable now; peers must not silently mutate)  
**Pairs with:** `01-workstream-map.json`

This file publishes the contracts concurrent agents may depend on **before** unfinished peer work lands. Prefer these over inventing parallel schemas.

---

## 1. Fleet coordination contracts (owned by WS-PAR)

### 1.1 Workstream map

- **Path:** `docs/architecture/parallel-agents/01-workstream-map.json`
- **Shape:** versioned JSON with `workstreams[].workstreamId`, `exclusiveOwn[]`, `mustNotTouch[]`, `softGates[]`
- **Consumers:** all fleet agents
- **Stability rule:** additive amendments preferred; removals of another agent’s `exclusiveOwn` entry require that agent’s published release of the path (ledger note + PR) or founder override

### 1.2 Mission report envelope (informal)

Peers should include these fields in boxed mission reports:

```ts
type ParallelAgentMissionReport = {
  workstreamId:
    | "WS-PAR"
    | "WS-CKF"
    | "WS-VIC"
    | "WS-CCA"
    | "WS-EHB"
    | "WS-CKB"
    | "WS-RCD"
    | "WS-NED"
    | "WS-CDA"
    | "WS-BFL"
    | "WS-DEF"
    | "WS-PCI"
    | string;
  baseMainSha: string;
  branchName: string;
  branchTipSha: string;
  changedFiles: string[];
  focusedTests: { command: string; passed: number; failed: number; skipped?: number };
  ciStatus?: "unknown" | "pending" | "success" | "failure";
  integrationDependencies: string[];
  ownershipViolations: string[]; // must be []
  blockers?: Array<{ blockedBy: string; adapterOrMockPath?: string; disposition: string }>;
};
```

No runtime dependency required; this is a reporting contract only.

### 1.3 Ownership boundary checker

```bash
git diff --name-only origin/main...HEAD \
  | npx tsx scripts/parallel-agents/check-ownership-boundaries.ts --workstream WS-CKF --stdin
```

Exit `0` if all listed paths are within the workstream’s boundaries; exit `1` on violation.

---

## 2. Contracts peers should reuse (existing production — consume, don’t fork)

| Contract | Path | Owning / extending workstream | Notes |
| --- | --- | --- | --- |
| `SourceConnector` | `lib/connectors/types.ts` | WS-CKF extends via new siblings; existing EDGAR connector is `extendViaNewSiblingOnly` | Do not invent a second connector SPI |
| Extraction provider SPI | `lib/extraction/provider.ts` | WS-VIC adds adapters under `lib/extraction/providers/**` | Keep `vercel-ai-gateway-provider.ts` intact unless a minimal factory hook is required |
| Analyzer provider factory | `lib/contract-model/analyzer/get-analyzer-provider.ts` | WS-VIC `extendViaNewSiblingOnly` | Mirror extraction adapter pattern |
| Phase 4B financial input contract | `lib/contract-model/runtime/input/**` + `docs/phase-4b/` | NS-4 track (not this fleet) | Frozen; consume only |
| North Star v2 | `docs/headroom-north-star-v2.md` | Product control (read-only) | No ERP-sync invent; certificates + ledger + rulebook |

---

## 3. Contracts each product workstream must publish before dependents rely on them

### 3.1 WS-CKF — Covenant knowledge factory

Publish under `docs/covenant-knowledge-factory/` before other agents depend on corpus APIs:

1. Corpus document identity (source URL, accession, content hash, issuer CIK)
2. Agreement / amendment graph edge kinds (reuse package-graph vocabulary where possible)
3. Candidate covenant record shape (source spans + status; no silent permission invent)
4. Retrieval query/result envelope

Until published, dependents must use local mocks in their own exclusive trees.

### 3.2 WS-VIC — Vercel-independent compilation

Publish under `docs/vercel-independent-compilation/` before CKF/CCA depend on local inference:

1. Provider adapter interface (deterministic / Ollama / vLLM / authorized-direct / offline-replay)
2. Required provenance fields (model id/version, prompt, schema, context hash, source lineage, policy, tokens, cost)
3. Deterministic-vs-hypothesis boundary (never infer permission solely from a numerical threshold)

Factory hooks into `get-provider.ts` remain minimal; adapters live in exclusive `providers/**`.

### 3.3 WS-CCA — Compute assessment

Publish under `docs/compute-assessment/`:

1. Benchmark job manifest (document count, stages, durability target)
2. Metrics schema (throughput, CPU time, peak RSS, failure rate, cost)
3. Optional GPU-worker interface (no provisioning in this fleet)

---

## 4. Conflict resolution

1. **Do not** edit another workstream’s exclusive files to “make integration work.”
2. Publish or consume an adapter/mock in the blocked workstream’s exclusive tree.
3. If two exclusiveOwn globs collide, WS-PAR records the conflict in `03-progress-ledger.md` and proposes a non-silent amendment; neither peer silently wins.
4. NS-4 and Phase-3 reliability tracks stay outside this fleet’s absorption boundary.

---

## 5. Authorization boundaries (all workstreams)

- Paid providers / paid infra: founder authorization required.
- Certification status / sealed evidence / Claude-owned acceptance: out of bounds.
- Merges: founder / COO / release gate only — agents stay on draft PRs.
