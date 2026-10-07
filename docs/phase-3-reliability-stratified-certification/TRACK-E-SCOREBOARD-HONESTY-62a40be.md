# Track E — Phase 3 scoreboard honesty

**Tip read:** `62a40be22b9598d9732e9ce2574d86d2228d6270` (merge of #122).  
**Grant FROZEN path:** `docs/phase-3-reliability-stratified-certification/PHASE-3-TRACK-E.FROZEN.md`  
**sha256 of those bytes:** `37a4d8c1240fcbaf10341e9aaccc5ab294bbd95aec9243f17f1768bee5b22114` (MATCH). Recompute with `sha256sum` on that path. The file is the grant preimage. This note does not alter those bytes.  
**Authority:** COO MATCH + GRANT, CEO RE-APPROVE, Arch MATCH, bound at the tip above.  
**Lane:** Track E docs/ops. This is not the CONMED rerun cloud `bc-98c662d2`.

Soft gate. Docs only. Invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.** **BASELINE_PINNED ≠ CERTIFIED.** **DEVELOPMENT ≠ CERTIFIED.** **LOCK ≠ implement.** This note is not a certification, not a pin, and not a completion percentage.

## 1. What was retired

`docs/phase-3-reliability-stratified-certification/PHASE-3-TARGETED-UNLOCK-REPORT-1acdff3.md` §12 carried this sentence as a standing board figure:

> Phase 3 remains BLOCKED_BY_EVIDENCE, about 25%, CERTIFIED 0/12.

That percentage is not a field in `01-pin-matrix.json`. It was not recomputed from the 12 matrix rows. `hardCeilingUsd: 0.25` on pin preflights is a dollar ceiling, not a Phase-3 percent. The carried “about 25%” is retired. It is not raised. No replacement percent is published.

The counted half of that sentence still holds, and it was recounted on this tip. See §2.

## 2. Board truth at this tip

Source: `matrix.strata` (6) and `matrix.crossCuts` (6) in `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json`. Matrix `status` remains `OFFLINE_PIN_MATRIX_PARTIAL`. This note does not edit that file.

| Row | Kind | Status |
|---|---|---|
| DEBT | stratum | `PINNED_OFFLINE` |
| LIENS | stratum | `PINNED_OFFLINE` |
| RESTRICTED_PAYMENTS | stratum | `BASELINE_PINNED` |
| INVESTMENTS | stratum | `PINNED_OFFLINE` |
| ASSET_SALES | stratum | `PINNED_OFFLINE` |
| FINANCIAL_COVENANTS | stratum | `PINNED_OFFLINE` |
| WITH_SHARED_CAPS | cross-cut | `PINNED_OFFLINE` |
| WITHOUT_SHARED_CAPS | cross-cut | `BASELINE_PINNED` |
| WITH_BUILDERS | cross-cut | `DEFERRED` |
| WITHOUT_BUILDERS | cross-cut | `PINNED_OFFLINE` |
| WITH_RECLASSIFICATION | cross-cut | `BLOCKED` |
| WITHOUT_RECLASSIFICATION | cross-cut | `PINNED_OFFLINE` |

Rows whose `status` is `CERTIFIED`: **0**. Denominator: **12**. Stamp: **CERTIFIED 0/12**.

Status histogram, labels only: `PINNED_OFFLINE` 8, `BASELINE_PINNED` 2, `DEFERRED` 1, `BLOCKED` 1, `CERTIFIED` 0. Those labels are not a percent of Phase 3.

Rows with `eligible: true` on an offline pin remain `PINNED_OFFLINE` or sit under a pinned stratum. `eligible: true` is not `CERTIFIED`. `assetSalesEligibleForCertifiedPath` on this file is false. `certifyCandidate` still requires an empty blocker list. No row on this board has that live packet.

The two rows that are not pinned:

- `WITH_BUILDERS` is `DEFERRED` / pin HOLD. Chewy `discovery-candidate:f62db8ebcda9d35c4fc03b2a` stays `eligible: false` (`UNRESOLVED_OPERATIVE_EVIDENCE`). #118 locks `FAIL_CLOSED_AMBIGUOUS`. This note does not coerce `eligible: true`.
- `WITH_RECLASSIFICATION` is `BLOCKED`. #122 locks D2 fail-closed. Category labels are not `targetRuleId`. No `RECLASSIFIABLE_TO` edge. Seal implement remains HOLD. The lock is not an emit.

## 3. Pull requests #104–#111

The grant preimage clock is 2026-10-07T16:25:00Z. Its residual line still names #104–#111 as open drafts. That sentence stays inside `PHASE-3-TRACK-E.FROZEN.md` and is not edited. Live disposition below is later than that clock.

Checked live on GitHub at 2026-10-07T16:29:25Z and re-read after that close. Numbers 104–111 are pull requests. `gh issue view` on each number returns that pull request. There is no separate issue in this set. #106 and #107 stay open: closing them would drop notes that are not on main. That HOLD is execution honesty. It is not a rewrite of the frozen residual.

Closed below means closed unmerged (`mergedAt` null, still draft). Closed is not merged, and not `CERTIFIED`.

| PR | Live state | Disposition | Why |
|---|---|---|---|
| #104 | CLOSED 2026-10-07T16:29:25Z, not merged | Superseded closed-path | Lexical verdict is on main in #115: section-wide reclass prose, zero `RECLASSIFIABLE_TO`. #122 locks D2. The variant-count appendix in the draft was not copied onto main. |
| #105 | CLOSED 2026-10-07T16:29:25Z, not merged | Superseded closed-path | The five bounded spans and the sealed-identity mismatches are in #115. The draft JSON was not merged. |
| #106 | OPEN draft | **HOLD** | Pin HOLD itself is already on main (#114, #118, matrix). The draft’s window notes are not: the 285-character window as a greater-of cap component rather than an Available Amount builder; the `Pro Forma Basis` index miss; the asked definition chain; predicate-`eligible: true` rows `discovery-candidate:ac3033fd2611599aad30c670` (§1.08(j)) and `discovery-candidate:0fa404221f4a6ea4bce4d6ca` (§2.16(b)) are not this cell and are not pins. Those notes stay on the open draft. They are not `CERTIFIED`. |
| #107 | OPEN draft | **HOLD** | The six-issuer rank and the filing-index metadata are not in a merged record. #112 records Knife River as `BLIND` with `bodyOpened: false` and does not store a Knife River URL or accession. This draft is not closed as superseded. It is not authority to open a body. |
| #108 | CLOSED 2026-10-07T16:29:25Z, not merged | Superseded closed-path | Identity verdict is on main: prose exists, no sealed sentence identity, zero edges (#115, #119, #122). Architect review on this draft was COMMENT, not APPROVE, and named Merge HOLD. The later D2 lock is why the draft is closed unmerged rather than landed. The CONMED §7.3 limb mismatch in the draft was not copied onto main. It is not a sealed identity and not an edge. |
| #109 | CLOSED 2026-10-07T16:29:25Z, not merged | Superseded closed-path | Prep named Knife River first, then stopped. #112 replaced that slot: Gibraltar is `DEVELOPMENT` and not a matrix cell; Knife River is `BLIND`; `bodyOpened` is false. Index-only notes in the draft were not merged. They are not authority to open the body. |
| #110 | CLOSED 2026-10-07T16:29:25Z, not merged | Superseded closed-path | Weak-cell terminals are on main (matrix, #114, #115, #116, #118, #122). The 15-id Chewy `BUILDER` census in the draft was not copied onto main. No row is `CERTIFIED`. |
| #111 | CLOSED 2026-10-07T16:29:25Z, not merged | Superseded closed-path | Hunt labels at `1acdff3` were absorbed as historical labels in #117 / #121, then overtaken. `WITH_RECLASSIFICATION` on this tip is the #122 lock, not that hunt’s `NO_VALID_CANDIDATE`. Do not apply `NO_VALID_CANDIDATE` to Knife River. |

#123 is outside this set. It was already closed unmerged at 2026-10-07T16:25:06Z. It is not folded into this note.

## 4. Knife River

Not opened. Not evaluated. Terminal on main, from the Gibraltar package provenance: `knifeRiver.designation` `BLIND`, `bodyOpened` false, `clausesSearched` false, `covenantWordingInspected` false, `metadataRecordedFromThisRun` false. This note did not fetch a body, a URL, or an accession.

#107 stays open only because its rank is not on main. That open state is not a Knife River eval.

## 5. What this note does not do

- No production edit. No pin folder. No minted discoveryId. No `RECLASSIFIABLE_TO` edge. No `eligible: true` flip.
- No edit to `01-pin-matrix.json`.
- No Phase-3 percentage, new or raised.
- No `READY_TO_PIN` invent.
- No `CERTIFIED` claim for this note, for a pin, or for a merged analysis.
- No CONMED §7.5(a) rem. No NS-4. No related-series A/C. No live or paid cert.
- Gibraltar signals stay unselected. `DEVELOPMENT` is not a matrix cell.
