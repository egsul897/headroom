# PHASE-3-TRACK-C1 — OPERATIVE_SUBWINDOW seal primitive implement — invent-safe FROZEN

**Tip:** `62a40be22b9598d9732e9ce2574d86d2228d6270`
**Checked:** 2026-10-07T16:28:00Z
**Verdict:** invent-safe ALL Y — C1 YES: D1 seal independent of RECLASSIFIABLE_TO / D2

## C1 answer
**YES.** `OPERATIVE_SUBWINDOW` sealing (ADR #119 req 1–6) is the operative-*window* primitive. It does not require minting a `RECLASSIFIABLE_TO` edge, mapping category labels to `targetRuleId`, or resolving D2. Prior FREEZE_NOT_READY `2e2b988e…` / `edad8704…` wrongly conflated seal emit with D2 invent. Owner AUTHORIZE + this FROZEN supersede that conflation **for the seal primitive only**.

## Scope
Implement production seal so an unenumerated sentence can be an `OPERATIVE_SUBWINDOW` window under the generalized class (req 1–6):
1. Window = sentence half-open span (not container descendant text).
2. Window = source bytes (not Pass B description / citation / fingerprint).
3. **No Stage-1 marker invent.**
4. Container structural node stays; UNIQUE pin rule unchanged.
5. One generalized class — not Chewy-only hardcode / hand discoveryId.
6. Fail closed when requirements unmet.

## Forbidden
Stage-1 marker invent; Chewy-only sole path; `RECLASSIFIABLE_TO` / category→`targetRuleId` invent (C2); pin/CERTIFIED/% raise; Knife River; reopen D1 research.

## Invent-safe 5-part
| Part | Y/N |
|---|---|
| Tip-bound residual named | Y — ADR #119; pipeline cannot seal sentence window |
| Generalized | Y — req 5 |
| No invent | Y — no marker; no D2 edge; no hand discoveryId |
| File-disjoint / scoped | Y — seal primitive only; D2 separate |
| No CERTIFIED / eligible / pin | Y |

**ALL Y? YES.** Soft gate; invent-absence forever; IMPLEMENTED ≠ CERTIFIED.
