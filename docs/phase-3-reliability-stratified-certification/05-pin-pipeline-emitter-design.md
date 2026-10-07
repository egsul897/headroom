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

---

## Amendment — CONMED INVESTMENTS §7.8(l) offline pin (append · 2026-10-06)

**Living-design append** (not an ADR-1 evidence-packet mutate). Prior Status line, “Next pins to emit” list, and the LIENS amendment above are retained verbatim; this section records the completed pin and residual blockers.

| Field | Value |
|---|---|
| **discoveryId** | `discovery-candidate:3476b082d53dec709a3dca23` |
| **sectionRef** | `7.8(l)` general Investments BASKET |
| **pin folder** | `pins/conmed-2025-credit-facility/7.8(l)--3476b082/v1/` |
| **chars / eligible** | 427 / `eligible:true` (offline identity — **not** live CERTIFIED) |
| **matrix** | `01-pin-matrix.json` INVESTMENTS → `PINNED_OFFLINE` |

### Why §7.8(l) and not §7.8(d)

Both CONMED BASKET scouts seal `eligible:true`, UNIQUE, single occurrence, interim-B clean, `WITHOUT_SHARED_CAPS` / `WITHOUT_BUILDERS` / `WITHOUT_RECLASSIFICATION`:

- **§7.8(l)** `discovery-candidate:3476b082d53dec709a3dca23` — 427 chars, `multipleRulesLikely: false`, general greater-of basket, no page-footer artifact. **Pinned.**
- **§7.8(d)** `discovery-candidate:8aaa7b743717492d1a9fa0b2` — 389 chars (smaller) but operative text embeds PDF page footer `103` and a key-man-insurance proviso (`multipleRulesLikely: true`). **Left unpinned.** Still an eligible:true scout; not rejected, not invented.

Chewy INVESTMENTS remains **DEFERRED** (1.01 AMBIGUOUS; modest §1.08(i) `eligible:false`). Do not invent IDs. Map honesty for the pinned candidate is `UNSERVED` — not pre-credit.

### Priority list — residual after this pin

The LIENS amendment’s residual “INVESTMENTS — still open” line is **satisfied for the stratum** by CONMED §7.8(l):

- ~~**CONMED INVESTMENTS**~~ — **DONE** (this amendment / pin packet) for the matrix stratum.
- **CONMED §7.8(d)** — still **unpinned** (eligible:true scout; dirtier span). Optional follow-on, not required to hold INVESTMENTS at PINNED_OFFLINE.
- **Chewy INVESTMENTS** — still **DEFERRED**.
- Items 3–6 in the original priority list (WITH_BUILDERS, CONMED WITH_SHARED_CAPS, CONMED DEBT, FC/reclass) unchanged. FINANCIAL_COVENANTS remains deferred.

**Status addendum:** emitter + Chewy SHARED_CAP v1 + ASSET_SALES §6.05(a)(2)(c) v1 + CONMED LIENS §7.3(m) v1 **+ CONMED INVESTMENTS §7.8(l) v1**. Soft gate unchanged: offline only; no live/paid; no NS-4; no related-series A/C; no first-target/#68/#73/#76 mutation. PINNED_OFFLINE ≠ CERTIFIED.

---

## Amendment — CONMED FINANCIAL_COVENANTS §7.1(c) offline pin (append · 2026-10-06)

**Living-design append** (not an ADR-1 evidence-packet mutate). Prior Status line, “Next pins to emit” list, and the LIENS and INVESTMENTS amendments above are retained verbatim; this section records the completed pin and residual blockers.

| Field | Value |
|---|---|
| **discoveryId** | `discovery-candidate:5f83b15ed6cd0ea8b06289a0` |
| **sectionRef** | `7.1(c)` Minimum Interest Coverage Ratio FINANCIAL_TEST |
| **pin folder** | `pins/conmed-2025-credit-facility/7.1(c)--5f83b15e/v1/` |
| **chars / eligible** | 234 / `eligible:true` (offline identity — **not** live CERTIFIED) |
| **matrix** | `01-pin-matrix.json` FINANCIAL_COVENANTS → `PINNED_OFFLINE` |

### Why §7.1(c)

Sealed FINANCIAL_COVENANTS stratum scout (emitter `pinCandidate`, offline only):

- **§7.1(c)** `discovery-candidate:5f83b15ed6cd0ea8b06289a0` — 234 chars, `FINANCIAL_TEST`, `multipleRulesLikely: false`, single occurrence, interim-B clean. Governing-definition check matches first-target shape: Phase-2 `OPERATIVE_STATE_REVIEW_REQUIRED` definitions `consolidated senior secured leverage ratio` and `consolidated total leverage ratio` (plus `indebtedness` and §1.1) are recorded on the eligibility packet with `definedTermMentionedInOperativeText: false`, `directlyReferencedBySection: false`, and `governingProvision: null`. Offline bundle `SUFFICIENT`, `hasUnresolvedOperativeEvidence: false`. **Pinned.** `eligible:true`.
- **§7.1(a)** `discovery-candidate:8fe38049fe62ea9e9e741511` — 712 chars, seals identity, `eligible:false` (`PHASE2_REVIEW_REQUIRED_MENTIONED_IN_OPERATIVE`: operative text names Consolidated Senior Secured Leverage Ratio). **Unpinned.**
- **§7.1(b)** `discovery-candidate:cf15af8f5fb1f77bd861a2ac` — 1886 chars, same fail-closed leverage-definition mention. **Unpinned.**
- **§7.1(d)** `discovery-candidate:1b08da2e952127a1caebe77d` — 399 chars, `eligible:false` (`UNRESOLVED_OPERATIVE_EVIDENCE`). **Unpinned.**
- Chewy hinted **§1.08(a)(i)** `discovery-candidate:3746c55b7f0755c138bbcf59` (214 chars) and **§1.04(b)** `discovery-candidate:c9e7af41092f13e79989b95e` (579 chars) seal identity, `eligible:false` (`UNRESOLVED_OPERATIVE_EVIDENCE`). **Unpinned.**
- Chewy **§1.08(d)(i)** / **§1.08(d)(ii)** / **§1.08(g)** seal `eligible:true` but roles are CONDITION / EXCEPTION / EXCEPTION, not the preferred `FINANCIAL_TEST`. **Unpinned.** Do not invent narrower IDs.

Map honesty for the pinned candidate is `MAPPED_WITH_REVIEW` with `CANDIDATE_COMPILE_REVIEW_REQUIRED` / `VERIFICATION_INCOMPLETE`. That historical map tag is not pre-credit. Canonical map `certificationStatus` on this candidate remains `NOT_CERTIFIED`.

### Priority list — residual after this pin

The INVESTMENTS amendment’s residual “FINANCIAL_COVENANTS remains deferred” line is **satisfied for the stratum** by CONMED §7.1(c):

- ~~**CONMED FINANCIAL_COVENANTS**~~ — **DONE** (this amendment / pin packet) for the matrix stratum.
- **CONMED §7.1(a) / §7.1(b) / §7.1(d)** — still **unpinned** (eligible:false). Leverage-definition fail-closed stands.
- **Chewy FINANCIAL_COVENANTS** — still **DEFERRED** (hinted FINANCIAL_TEST eligible:false).
- Items 3–5 in the original priority list (WITH_BUILDERS, CONMED WITH_SHARED_CAPS, CONMED DEBT) unchanged. Reclass remains blocked.

**Status addendum:** emitter + Chewy SHARED_CAP v1 + ASSET_SALES §6.05(a)(2)(c) v1 + CONMED LIENS §7.3(m) v1 + CONMED INVESTMENTS §7.8(l) v1 **+ CONMED FINANCIAL_COVENANTS §7.1(c) v1**. Soft gate unchanged: offline only; no live/paid; no NS-4; no related-series A/C; no first-target/#68/#73/#76/#78 mutation. PINNED_OFFLINE ≠ CERTIFIED.

---

## Amendment — Chewy FINANCIAL_COVENANTS §1.08(d)(i) offline pin (append · 2026-10-07)

**Living-design append** (not an ADR-1 evidence-packet mutate). Prior Status line, “Next pins to emit” list, and the LIENS, INVESTMENTS, and CONMED FINANCIAL_COVENANTS amendments above are retained verbatim; this section records the one-cell Chewy follow-on.

| Field | Value |
|---|---|
| **chunk** | P3-CF1 |
| **plan sha256** | `6f71e081842913e79ce22dd0a018d891feb5d78a39cd2f14274120a98c130483` |
| **base** | `7351d0fad8d75451b39a6ffb338de41be90518fc` |
| **discoveryId** | `discovery-candidate:c2018498f55ca1d0fef7aa4f` |
| **sectionRef** | `1.08(d)(i)` CONDITION (family `FINANCIAL_COVENANTS`) |
| **pin folder** | `pins/chwy-2026-credit-agreement/1.08(d)(i)--c2018498/v1/` |
| **chars / eligible** | 557 / `eligible:true` (offline identity — **not** live CERTIFIED) |
| **matrix** | `01-pin-matrix.json` FinCov `chewyFollowOn` → `PINNED_OFFLINE` |

### Why this cell

Primary sealed at tip without an emitter logic change. `sectionRef` `1.08(d)(i)` is UNIQUE, identity assertions all true, interim-B clean, `eligible:true`. Sealed role is **CONDITION**, not `FINANCIAL_TEST`. The pin is a FinCov-stratum follow-on by family mapping. It is **not** a claim that a Chewy `FINANCIAL_TEST` became `eligible:true`.

Left unpinned:

- `discovery-candidate:3746c55b7f0755c138bbcf59` §1.08(a)(i) `FINANCIAL_TEST` — identity seals, `eligible:false` (`UNRESOLVED_OPERATIVE_EVIDENCE`).
- `discovery-candidate:c9e7af41092f13e79989b95e` §1.04(b) `FINANCIAL_TEST` — identity seals, `eligible:false` (`UNRESOLVED_OPERATIVE_EVIDENCE`).
- `discovery-candidate:5be40987571c84b616abb07e` §1.08(d)(ii) EXCEPTION — would seal UNIQUE `eligible:true`; unused because the primary sealed. One cell only.
- `discovery-candidate:c3708f1e7541fd0456804118` §1.08(g) EXCEPTION — same.

No invented discoveryIds. CONMED §7.1(c) remains the stratum `FINANCIAL_TEST` pin. Map honesty `NO_CHEWY_CANONICAL_MAP_YET` is not pre-credit. `PINNED_OFFLINE` ≠ `CERTIFIED`. `IMPLEMENTED` ≠ `CERTIFIED`. Soft gate: Merge HOLD (Architect COMMENT, not APPROVE; Notes/Cert; Trust; COO; CI).

### Priority list — residual after this pin

The prior amendment’s “Chewy FINANCIAL_COVENANTS — still DEFERRED” line is **satisfied only for this one CONDITION cell**:

- **Chewy §1.08(d)(i) CONDITION** — **PINNED_OFFLINE** (this amendment).
- **Chewy FINANCIAL_TEST** — still **DEFERRED** (`eligible:false`). Do not coerce.
- **WITH_BUILDERS** — still deferred (P3-WB1 rescinded; not this packet).
- Reclass remains blocked.

**Status addendum:** prior pins **+ Chewy FinCov §1.08(d)(i) CONDITION v1**. Soft gate unchanged: offline only; no live/paid; no NS-4 Slice 3; no related-series A/C; no SFG-1; no Rem H; no first-target/#68/#73/#76/#78/#81 mutation. PINNED_OFFLINE ≠ CERTIFIED.

