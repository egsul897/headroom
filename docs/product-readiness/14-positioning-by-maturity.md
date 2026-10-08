# Commercial positioning by maturity level

Positioning must track evidence, not roadmap. Each level names the claim that may be made, the gate that unlocks it
(doc 11), and the evidence that must exist. Headroom is at **Level 1** on this branch.

| level | what may be said | gate | evidence required | where we are |
|---|---|---|---|---|
| 0 — Internal tool | nothing externally | — | — | passed |
| 1 — Diagnostic (reviewer approves every unit) | "Shows treasury the operative text, lineage and dependencies for each covenant, computes capacity from inputs you approve, and refuses with a reason when it cannot." | D3, D8 met; D1/D2/D5/D7 open | offline corpus + runs (docs 02, 08, 09) | **here**; external pilot blocked until D1/D5 close |
| 2 — Pilot-proven diagnostic | Level 1 plus "on N partner packages, no material covenant was missed without a queue item and no false permission was found by counsel." | D1–D8 on corpus, D10 per partner; doc 06 §9 exit criteria | pilot readouts, counsel-confirmed recall | needs 2–3 partners, remediation of P0 items, one metered live run |
| 3 — Assisted decision support | "Capacity numbers reviewed by treasury can be relied on for internal planning; every number traces to approved inputs and source text." | C2, C3, C4 | measured recall on real packages, measured cost, reviewer effectiveness | needs live Layer-2 evidence and compiled-IR runtime (C5) |
| 4 — Certified | "Certified covenant capacity" | C1–C6 | blind reserved packages, live model, persistence, audit | not in sight from this branch; no phase gate is advanced by this track |

## Messaging rules by level

- Level 1: lead with refusals and evidence, never with accuracy. "It tells you when it does not know" is the
  differentiator against generic LLM tooling (BM-07, G cases).
- Level 2: quote partner-confirmed recall only as the partner's own count, never as a percentage of a population we
  defined.
- Level 3+: no claim without the C-gate artefact linked.

## What changes the level fastest

1. Close IPV-01, IPV-02, IPV-03, IPV-16 and PR136-F1/F4 (D1, D5) — all deterministic, all pinned by tests.
2. Author adversarial submission plans for packages I and J and a side-letter fixture family so D1 covers the new
   classes.
3. Run doc 15's E1–E3 to replace estimates with measurements (cost, discovery, reviewer).
