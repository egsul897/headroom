# NS-4 store slice 2 — synthetic certificate → proposal → APPROVED

**Status:** implementation slice 2 (certificate fact-proposal types + pipeline + synthetic fixtures + adversarial tests)  
**Charter:** `docs/architecture/NS-4-PARALLEL-CHARTER.md` / `docs/architecture/NS-4-AGENT-CHARTER.md`  
**Auth:** COO PASS 2026-10-06 — slice 2 AUTHORIZED (bounded). Slice 3 (loader parity) is **HOLD**.  
**Gate:** `docs/headroom-north-star-reconciliation/07-next-implementation-gate.json` → NS-4  
**Depends on:** slice 1 append-only store (`NS-4-STORE-SLICE-1.md`, #72)

## What this slice delivers

1. **Certificate fact-proposal types** under `lib/contract-model/runtime/input/store/certificate/`
   - Source document id + version hash
   - Page / section / table / row locator
   - Reporting period, as-of, scope, kind, key
   - Value type, currency / unit
   - Proposer: `human` | `extractor` | `PUBLIC_FILING_RECONSTRUCTION`
   - Optional basket-usage schedule lines → **4C ledger PROPOSALS only** (`LedgerProposalRecorder`; status always `RECORDED`; never snapshot facts; never applied)

2. **Proposal pipeline**
   - `proposeFromCertificate(store, syntheticCert, ledgerRecorder)` → DRAFT / REVIEW_REQUIRED snapshot(s) via sealed `appendSnapshot`
   - Certificate facts map **1:1** onto Phase 4B `FinancialInput` identities
   - MONEY without currency refused **at proposal time** (before store write)
   - Duplicate identities within a certificate refused at proposal time
   - Basket-usage lines recorded on `LedgerProposalRecorder` only — never into `snapshot.inputs`
   - No carried-forward fill from another period / certificate

3. **Approval path**
   - Proposals stay DRAFT / REVIEW_REQUIRED until attributable approve
   - `approveCertificateProposal(...)` wraps sealed `approveSnapshot` with provenance-enriched `approvalRef` (doc / version / proposer kind)
   - Extractor and `PUBLIC_FILING_RECONSTRUCTION` never auto-approve

4. **Synthetic fixture pack** (no customer secrets)
   - `fixtures/conmed-form-inspired.ts` — sectioned leverage-block layout
   - `fixtures/chewy-form-inspired.ts` — cover + exhibit layout; extractor proposer
   - `fixtures/invented-tabular.ts` — invented table layout; `PUBLIC_FILING_RECONSTRUCTION` + restatement
   - Invented companies and numbers only; form *inspiration* only — store code never hardcodes CONMED/Chewy `sectionRef`s

5. **Adversarial tests** (charter §3.8)
   - Missing currency → refuse
   - Duplicate identity → refuse
   - Competing successors → refuse
   - Carried-forward value → must not silently fill from another period
   - LLM-extracted (`extractor`) without approval stays REVIEW_REQUIRED
   - `PUBLIC_FILING_RECONSTRUCTION` only reaches APPROVED via explicit `approveCertificateProposal`

## Soft gates (FAIL if violated)

- Phase-3 trees untouched (IR / semantic-accountability / stratified-cert / related-series / Pass A/B/C)
- Frozen 4B consume-only — no edits to `resolver` / `identity` / `snapshot.ts` semantics
- Synthetic certs only — no ERP / live / provider / paid calls
- Ledger proposals recorded, **not** applied (`LedgerProposalRecorder.apply` throws)
- No Ask Headroom UI
- Legacy Prisma `FinancialSnapshot` untouched
- Public store façade remains sealed from slice 1 (no unvalidated `commit` export; frozen event copies)

## Explicitly NOT in this slice (slice 3 HOLD)

- **Loader parity** vs hand-built 4B fixtures (byte-identical load into `snapshotInputResolver`) — **HOLD; do not implement**
- Prisma migration / durable adapter
- Real certificate ingest (NS-5)
- Any Phase-3 file edits
- Applying ledger proposals into capacity truth (later 4C)

## Module map

| Path | Role |
| --- | --- |
| `store/certificate/types.ts` | Fact-proposal, locator, proposer, ledger proposal, synthetic cert types |
| `store/certificate/map-fact.ts` | Certificate fact → 4B `FinancialInput` 1:1 |
| `store/certificate/propose.ts` | `proposeFromCertificate` |
| `store/certificate/approve.ts` | `approveCertificateProposal` |
| `store/certificate/ledger-proposals.ts` | Record-only `LedgerProposalRecorder` |
| `store/certificate/fixtures/*` | Synthetic heterogeneous layouts |
| `tests/.../store/certificate/*` | Happy-path + adversarial vitest |

## Test commands

```bash
npx vitest run tests/contract-model/runtime/input/store
npx vitest run tests/contract-model/runtime/input
```

## Remediation — public `clear()` removed (append-only)

**Auth:** COO CRITICAL coding auth — production public `LedgerProposalRecorder.clear()` remediation.

- Removed production public `clear()` from `LedgerProposalRecorder` entirely.
- Recorder is append-only: `#proposals` grows only via `record()`; no `clear` / `reset` / `truncate` / `empty` / `wipe` / `__testing` / env-gated / subclass backdoor that can empty or shrink the buffer exists in `lib/`.
- Public surface: `record` / `list` / `count` / `apply` (throws) only.
- Tests isolate state with a fresh `new LedgerProposalRecorder()` per case — not by resetting a shared instance.
- Adversarial coverage: shrink-mutator names absent on instance+prototype; `apply` still throws; `list()` returns frozen clones.

### Audit (same PR) — NS-4 store surfaces

Scoped audit of `lib/.../store/certificate/*` and Slice 1 façade (`InMemoryApprovedSnapshotStore` / write API) for other production public mutators that shrink, wipe, or bypass append-only:

| Surface | Finding |
| --- | --- |
| `LedgerProposalRecorder.clear()` | **Fixed** — same-class production public wipe; removed completely |
| `InMemoryApprovedSnapshotStore` | **No same-class bug** — no `clear`/`reset`/`truncate`/`empty`/`wipe`; unvalidated `commit` remains on private `PrivateEventLog` only (façade seal from slice 1 / PR #72) |
| `proposeFromCertificate` / `approveCertificateProposal` | **No same-class bug** — write only via sealed store append/approve paths |
| `SnapshotStoreBackend.commit` | Append-only push on private backend; not exposed on public façade class |

No additional production public shrink/wipe mutators found beyond `LedgerProposalRecorder.clear()`.
