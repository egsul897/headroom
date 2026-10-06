# ADR: Evidence packet versioning & immutability

**Status:** ACCEPTED (COO PASS 2026-10-06; docs-only architecture lock)  
**Date:** 2026-10-06  
**Authors:** Headroom Architect (Systems Architect)  
**Base:** main `@ 1a2a7ad` (#64 stratified cert DESIGN + #65 BUILD STRATEGY)  
**Does not authorize:** live/paid certification, NS-4 start, related-series A/C, A/B seal reopen, mutate-in-place “fixes”  
**Related:**  
- `docs/architecture/BUILD-STRATEGY-GENERALIZED-HEADROOM.md` (ADR-1)  
- `docs/phase-3-reliability-stratified-certification/00-selection-contract.json` (acceptance + softGate)  
- Invariants: **21** (reproducible versioned transitions), **37** (NO_SILENT_MATERIAL_FAILURE)

---

## 1. Context

Headroom’s reliability story is only as strong as its evidence. We already forbid rewriting paid live packets (`7.2c-*`, `7.5j-end-to-end-certification/`) and mutating `7.5j-deterministic-remediation/` in place after later remediations. Stratified-cert design (#64) requires new packets to be **append/versioned**.

Without a single ADR, teams will keep “fixing forward” inside sealed directories, collapsing history and making CERTIFIED / REVIEW decisions non-reproducible.

## 2. Decision

**All certification, remediation, and replay evidence packets are append-only and versioned.**

### Normative rules

1. **Immutable once published on `main`:**  
   - `docs/phase-3-live-validation/7.2c-*`  
   - `docs/phase-3-live-validation/7.5j-end-to-end-certification/`  
   - Any future `docs/phase-3-live-validation/**` live/paid packet directory once merged  
   Edits that change substantive evidence bytes after merge are **FAIL** (typo-only doc errata require COO note in PR body).

2. **Remediation / deterministic replay:**  
   - Do **not** mutate `docs/phase-3-live-validation/7.5j-deterministic-remediation/` in place for a new remediation story.  
   - Ship a **new versioned sibling** (e.g. `7.5j-deterministic-remediation-v2/` or dated packet id) that points at `baseSha` + `supersedes` / `priorPacket`.  
   - Hygiene regenerations that are explicitly authorized as content-identical refreshes must say so in the PR and remain attributable; they are the exception, not the default.

3. **Stratified certification packets** under `docs/phase-3-reliability-stratified-certification/`:  
   - Every packet JSON includes at least: `schemaVersion`, `baseSha` (or `headSha`), `status`, and stable `artifactId`.  
   - New pins / live results = **new files or new version fields**, never silent overwrite of a prior pin’s sha/identity claims.  
   - First-target pin identity (`discoveryId`, `operativeSourceSha256`) is frozen until an explicit superseding pin packet is added.

4. **Supersession is explicit:** a newer packet names the prior via `supersedes` / `priorArtifactId` (or directory naming that encodes version). Readers must be able to find *both*.

5. **CI posture (follow-on chunk, not blocking this ADR text):** protect sealed globs from content mutation in PRs unless path is a new versioned directory or an allowlisted errata path with COO label.

## 3. Consequences

**Positive:** reproducible CERTIFIED/REVIEW decisions; honest history; aligns with BUILD STRATEGY and #64 acceptance.  
**Negative:** more directories / slightly more PR overhead.  
**Forbidden:** green-the-gate by editing yesterday’s packet; claiming CERTIFIED against evidence that no longer exists as merged.

## 4. Out of scope

- MODEL_CONTRACT_VIOLATION vs UNSUPPORTED (ADR-2, next)  
- Pin pipeline implementation (tooling chunk after this ADR)  
- Live/paid authorization for stratified cert

## 5. Acceptance

- This ADR merged under `docs/architecture/EVIDENCE-PACKET-VERSIONING-ADR.md` with Status **ACCEPTED** after COO PASS.  
- Next offline-pin PRs cite this ADR and never overwrite `first-target/` identity hashes without a superseding packet.  
- No live/paid calls authorized hereby.

## 6. COO decision

**COO: PASS (2026-10-06).** Architecture lock for append-only evidence accepted.  

**Authorized next chunk:** Grok Bot offline pin matrix (Chewy + remaining strata/cross-cuts) — docs-only, no live/paid. Still no NS-4, paid §7.5(j), or related-series A/C.
