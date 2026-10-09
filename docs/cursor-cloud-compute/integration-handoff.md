# WS-CCA → Headroom Integration Lead (WS-PAR) handoff

**PR:** https://github.com/egsul897/headroom/pull/141  
**Tip SHA (at handoff prep):** see branch head  
**Workstream:** WS-CCA  
**Status:** Soft-gate compute infrastructure — **IMPLEMENTED ≠ CERTIFIED**

## Separation: infrastructure vs research

| Layer | Paths | Merge posture |
|---|---|---|
| **Safe infrastructure** | `lib/cursor-cloud-compute/**`, `scripts/cursor-cloud-compute/**`, `tests/cursor-cloud-compute/**`, `package.json` scripts, `.gitignore` (`data/`, `.cache/`, `.local-knowledge-corpus/`), `docs/cursor-cloud-compute/README.md`, measured-results summaries, `integration-handoff.md`, promotion guards | **Ready for main** after Integration Lead ack |
| **Research / quality findings** | Large per-doc JSON under `docs/cursor-cloud-compute/results/` (forensics, handoff index, quality sample, phase1/2 dumps); VM corpus under gitignored `data/`; artifact tarball under `/opt/cursor/artifacts` | **Not production behavior.** Summaries retained; bulky JSON quarantined from the infra merge surface where possible. Findings remain reproducible from artifact CAS + EHB manifests |

## Legal-safety confirmation (G1 / G2)

- All CCA outputs are `SOURCE_ONLY` / `*_NOT_CERTIFIED`.
- `lib/cursor-cloud-compute/promotion-guards.ts` **fail-closed** refuses:
  - `STRUCTURE_EMPTY` / `MISSING_DEFINITIONS` / broken hierarchy → legal or capacity promotion
  - Any write to `Permission` / capacity targets
  - `CERTIFIED` / `REVIEWER_VERIFIED` from the compute path
- Structural / Pass A success is **never** an affirmative covenant conclusion.
- Meta sidecars stamp `verificationStatus: "SOURCE_ONLY"`.

## 155-document handoff reproducibility

| Field | Value |
|---|---|
| Documents packaged | 155 (154 distinct `sourceHash`) |
| Contract | `cca-handoff-v1` |
| Processing version | `cca-phase3-pipeline-v1` |
| Artifact tarball sha256 | `c2cb47e331e39f1ae35f7cb848b98ea7cb364108fdbd3301ba139668a523222b` |
| Independent reconstruct | 155/155 hash match |
| SEC refetch sample | 5/5 via WS-EHB |
| CKF compatibility | `phase3/ckf-compat.ts` → `SOURCE_ONLY` / `DISCOVERED_CANDIDATE` / `legalPromotionBlocked: true` |

Does **not** create a competing SEC downloader, canonical registry, or production DB schema.

## Overlap with peer PRs

| Peer PR | Overlap with #141 |
|---|---|
| #132 / #128 parser | **None** (no `lib/contract-model/**` edits) |
| #154 WS-CKF | Soft: `.gitignore` (`.local-knowledge-corpus/`) + additive `package.json` scripts only — no `lib/knowledge-factory/**` |
| #142 WS-EHB | Soft: `.gitignore` (`data/` supersets EHB’s more specific ignore) + additive scripts — no `lib/edgar-historical-backfill/**` |

## Exact merge-order requirements (from WS-PAR `07-integration-gates.md`)

1. **WS-PAR #138** — contracts / ownership / gates  
2. **WS-CKF #154** — acquisition + corpus registry (+ SEC scheduler impl)  
3. **WS-EHB #142** — backfill queue (after scheduler contract)  
4. **WS-VIC #146** — provider adapters (resolve C-DUP-KF blocker first per PAR ledger)  
5. **WS-CCA #141** — compute harness (this PR) — **no paid provisioning**  
6. Corpus overlays…  
7. WS-CKB independent benchmark  

**Hard dependencies for #141 behavior at runtime:** none of CKF/EHB need to be *merged* for CCA unit tests; live SEC/exhibit paths require peer trees + `HEADROOM_SEC_FETCH_OWNER=WS-EHB` + authorized UA.  
**Hard dependencies for fleet identity:** merge **after** WS-PAR contracts so ownership map / gates are authoritative.

## Integration recommendation

**Split posture applied on #141:** keep safe compute infrastructure + summary docs; quarantine bulky research JSON from the production merge narrative (pointer file under `results/`).

**Can mark ready for review:** yes, as soft-gate infra — **not** certification.

**Do not merge** if any of: paid inference introduced; cert evidence edited; parser/CKF exclusive trees touched; promotion guards removed.

## Coordinator contact

Headroom Integration Lead = **WS-PAR** (PR #138 / agent “Parallel agent operating rules”).  
This document is the formal dependency + merge-order packet for queue ledger intake.
