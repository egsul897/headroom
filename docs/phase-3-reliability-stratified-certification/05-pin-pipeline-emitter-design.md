# Pin-pipeline emitter design (deterministic first-target packets)

**Status:** IMPLEMENTED (emitter + Chewy SHARED_CAP v1 + ASSET_SALES §6.05(a)(2)(c) v1) · 2026-10-06 — design retained as authority; see `scripts/stratified-cert/` + `pins/chwy-2026-credit-agreement/2.18(c)(vii)--cf3d8d94/v1/`  
**Soft gate:** docs + offline tooling only. **No live/paid.** No NS-4. No related-series A/C. A/B seal untouched.  
**Cite:** ADR-1 `EVIDENCE-PACKET-VERSIONING-ADR.md` (append-only); selection contract `00-selection-contract.json`

## Goal

Replace hand-authored pin JSON with a **deterministic emitter**:

```
pinCandidate({ packageKey, discoveryId, asOfDate, headSha })
  → writes versioned packet dir matching first-target/ shape
```

Same code path for CONMED and Chewy. **Chewy-first** for the next matrix row (generalization proof).

## Output shape (must match `first-target/`)

| File | Role |
|---|---|
| `00-preflight.json` | DRY_RUN_OFFLINE_PIN; headSha; hardCeilingUsd 0.25; operative-state summary; asOfConsistency; **no credential / no provider** |
| `01-target-identity.json` | discoveryId, documentId, sectionRef, structural nodes, operative text + sha256/chars, assertions |
| `01b-operative-state.json` | Phase-2 adapter view; instrument provisions; asOfConsistency |
| `01c-target-eligibility.json` | governingProvision; REVIEW_REQUIRED defs with govern flags; offlineBundle; eligible; **canonicalMapHonesty** |

Packet root also needs a tiny `00-pin-manifest.json`:

```json
{
  "schemaVersion": "1.0",
  "artifactId": "STRATIFIED_OFFLINE_PIN:<packageKey>:<discoveryId>",
  "status": "PINNED_OFFLINE",
  "baseSha": "<main tip>",
  "packageKey": "...",
  "discoveryId": "...",
  "stratum": "...",
  "crossCuts": ["..."],
  "citesAdr": "docs/architecture/EVIDENCE-PACKET-VERSIONING-ADR.md",
  "supersedes": null
}
```

## Directory layout (versioned)

```
docs/phase-3-reliability-stratified-certification/pins/
  <packageKey>/
    <normalizedSectionRef>--<shortDiscoverySuffix>/
      v1/
        00-pin-manifest.json
        00-preflight.json
        01-target-identity.json
        01b-operative-state.json
        01c-target-eligibility.json
```

- Never overwrite `v1/` bytes after merge on main — ship `v2/` with `supersedes` (ADR-1).  
- Keep legacy `first-target/` as the CONMED §7.6(c) pin (do not mutate); optionally add `pins/.../v1` copy later as superseding mirror, not in-place edit.

## Deterministic inputs (sealed only)

1. Sealed discovery population (CONMED: `scripts/p3-conmed-pilot` / freeze fixtures; Chewy: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement` + discovery artifacts when present).  
2. Structural index / node keys from package documents (no invented IDs).  
3. Phase-2 operative-state fixture when available; else emit eligibility `eligible:false` + blocker (fail-closed).  
4. Canonical map tags for `canonicalMapHonesty` (map REVIEW ≠ pre-credit).

**Sort key** (selection contract): `(packageKey, documentId, normalizedSourceRef, discoveryId)`.

## Eligibility rules (fail-closed)

`eligible:true` only if all hold:
- Identity assertions all true (single occurrence, sha/chars match)
- No related-series claim in operative text under interim-B detector (`/\bseries\s+of\s+related\b/i`) — if matched, pin may exist but `eligible:false` for CERTIFIED path with reason interim B
- No *governing* Phase-2 `OPERATIVE_STATE_REVIEW_REQUIRED` provision for the target
- DiscoveryId exists in sealed population (no invented IDs)

## Emitter CLI sketch (implementer)

```
pnpm exec tsx scripts/stratified-cert/pin-candidate.ts \
  --package chwy-2026-credit-agreement \
  --discoveryId discovery-candidate:... \
  --asOf 2026-10-06 \
  --out docs/phase-3-reliability-stratified-certification/pins/.../v1
```

- Exit nonzero on missing sealed inputs.  
- Zero provider calls (assert in preflight `note`).  
- Unit test: re-run twice → byte-identical packet (inv 21).

## Next pins to emit (priority)

1. ~~**Chewy ASSET_SALES**~~ — **DONE** `discovery-candidate:b54ed7fe4f8f7bb7c224d99b` §6.05(a)(2)(c) Designated Non-cash Consideration (857 chars; identity PINNED_OFFLINE; `eligible:false` UNRESOLVED_OPERATIVE_EVIDENCE).  
2. **Chewy / CONMED LIENS or INVESTMENTS** — need narrower UNIQUE structural span than 1.01 definition nodes (353k chars blocked).  
3. **WITH_BUILDERS** — §6.08 BUILDER AMBIGUOUS; §6.01(b)(4)(a)(i) role BUILDER but text heuristic → WITHOUT_BUILDERS + eligible:false; consider role-aware cross-cut derivation.  
4. **CONMED WITH_SHARED_CAPS** — §7.6(b) `discovery-candidate:ac354ffa81d6ca806759ba60` (optional; Chewy already covers cross-cut; eligible:true offline).  
5. **CONMED DEBT** — distinct from §7.2(c).  
6. Financial covenants / reclass — TBD-with-blocker until bindable (FC sealed candidates currently eligible:false).

## Out of scope

Live certifyCandidate runs; paid calls; mutating `first-target/`; company `if (conmed)` branches; related-series A/C.

---

## Amendment — CONMED LIENS §7.3(m) offline pin (append · 2026-10-06)

**Living-design append** (not an ADR-1 evidence-packet mutate). Prior Status line and “Next pins to emit” list above are retained verbatim; this section records the completed pin and residual blockers.

| Field | Value |
|---|---|
| **discoveryId** | `discovery-candidate:b5bb07b092f9863985f89812` |
| **sectionRef** | `7.3(m)` general Lien BASKET |
| **pin folder** | `pins/conmed-2025-credit-facility/7.3(m)--b5bb07b0/v1/` |
| **chars / eligible** | 458 / `eligible:true` (offline identity — **not** live CERTIFIED) |
| **matrix** | `01-pin-matrix.json` LIENS → `PINNED_OFFLINE` |

### Priority list — residual after this pin

Item 2 above (“Chewy / CONMED LIENS or INVESTMENTS”) is **partially satisfied** by CONMED §7.3(m):

- ~~**CONMED LIENS**~~ — **DONE** (this amendment / pin packet).
- **Chewy LIENS** — still **DEFERRED** (no modest UNIQUE `eligible:true` sealed span; 1.01 AMBIGUOUS; body spans `UNRESOLVED_OPERATIVE_EVIDENCE`). Do not invent IDs.
- **INVESTMENTS** — still open: CONMED §7.8(l)/§7.8(d) BASKET scouted `eligible:true` offline (unpinned); Chewy still needs narrower UNIQUE `eligible:true` span than 1.01 / ambiguous §6.08.
- Items 3–6 above (WITH_BUILDERS, CONMED WITH_SHARED_CAPS, CONMED DEBT, FC/reclass) unchanged.

**Status addendum:** emitter + Chewy SHARED_CAP v1 + ASSET_SALES §6.05(a)(2)(c) v1 **+ CONMED LIENS §7.3(m) v1**. Soft gate unchanged: offline only; no live/paid; no NS-4; no related-series A/C; no first-target/#68/#73 mutation.

