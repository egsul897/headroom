# Track D — Gibraltar DEVELOPMENT pipeline

Tip `62a40be22b9598d9732e9ce2574d86d2228d6270`.

Soft gate. **DEVELOPMENT ≠ CERTIFIED.** **IMPLEMENTED ≠ CERTIFIED.** invent-absence forever. This note does not raise a Phase 3 completion percentage.

## 1. Grant

COO formal grant: Gibraltar DEVELOPMENT pipeline only.

Bound Arch invent-safe FROZEN sha256, cited in full:

`f782f2f98537c8b76a8a4506c92a51e74c40a0a8eafd203b7343eaa0a21aede3`

The grant states COO+Arch MATCH of that hash against the full Arch body at this tip, with CEO APPROVED and COO GRANTED. This change does not recompute that MATCH. The Arch body bytes were not in the grant text.

Machine-readable record: `docs/p3-track-d-gibraltar-development-pipeline-hold-62a40be.json`.

## 2. Finding

**HOLD. Terminal: `HOLD_FROZEN_BODY_ABSENT`.**

The FROZEN body is not a file in the tree at `62a40be22b9598d9732e9ce2574d86d2228d6270`. A SHA-256 scan of 3,804 text files in this checkout (raw bytes, and the same bytes with one trailing newline when the file did not already end in one) returned no match for the bound hash. The hash string itself is absent from the tip. Prior #112 does not contain it.

Missing body = HOLD. A pipeline path whose specification is that body is not wired here. No substitute spec was written.

## 3. What is already on the tip

Pull request #112 merged at `7c079b49703702e028441d88c35070a8313c3828`. It is the Lane C development fixture and lane note. It is on this tip. It is not a matrix cell, not a pin, and not CERTIFIED.

| Item | Tip fact |
|---|---|
| Lane note | `docs/p3-lane-c-gibraltar-dev-edgar-1acdff3.md` |
| Fixture | `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/` |
| Designation | DEVELOPMENT (`provenance.json` `designation`, `designationIsNotCertified: true`) |
| Pass A | Recorded in the fixture structure summary (946 deterministic candidates) |
| Pass B / C / D | Not executed. The structure summary records Pass B skipped because no model credential was set, and a synthetic Pass B was refused |
| discoveryId | Not minted. Structural node ids in the fixture are compiler output |
| Pin matrix | `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json` has no Gibraltar row |

The lane note already records three unselected development signals: Available Amount Builder Basket marker disagreement, a §7.01 classify/reclassify paragraph whose compiler path is `7.01(b)(a)`, and §7.04 Asset Dispositions whose bare label is ambiguous. This note does not re-select them and does not re-derive them.

## 4. What this change does

It records the HOLD and the bound hash. It does not edit the fixture, the lane note, the pin matrix, or production code.

Not done, and not claimed:

- Pass B, Pass C, or Pass D
- A minted discoveryId
- A selected matrix cell
- A pin folder, or an invented ready-to-pin state
- A Stage-1 marker
- A completion-percentage change
- A CERTIFIED designation
- Opening, pinning, or evaluating the reserved blind issuer

## 5. Residuals

1. The Arch FROZEN body bytes are absent from the tip, so this change cannot recompute COO+Arch MATCH.
2. The Gibraltar DEVELOPMENT pipeline path stays unwired (`pipelineWired: false`).
3. Pass B, Pass C, and Pass D remain unrun. #112 refused a synthetic Pass B. That refusal stands.
4. The three development signals in the lane note stay unselected. No discoveryId exists to pin.
5. DEVELOPMENT ≠ CERTIFIED. A later grant can wire a path only from the body that hashes to `f782f2f98537c8b76a8a4506c92a51e74c40a0a8eafd203b7343eaa0a21aede3`.
