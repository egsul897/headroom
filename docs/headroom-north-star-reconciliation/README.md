# North Star reconciliation (2026-10-06, starting SHA `bbcfb54`)

Controlling document: `docs/headroom-north-star-v2.md`. Docs-only reconciliation; no production, app, Prisma or runtime change.

| file | content |
|---|---|
| `00-architecture-change-proposal.md` | the accepted ARCHITECTURE_CHANGE_PROPOSAL (invariants-document format) |
| `01-current-architecture-audit.json` | every relevant component, its state, evidence and North-Star alignment |
| `02-north-star-conflicts.json` | C1–C18 with severity and remediation step |
| `03-preserve-deprecate-defer-matrix.json` | preserve / demote / defer / migrate / remove decisions, incl. connector classes |
| `04-financial-source-of-truth-decision.md` | 4B as runtime truth, persistence target, legacy and dual-truth migration, selector resolution, certificate principles |
| `05-ask-headroom-boundary.md` | layer responsibilities and the Ask Headroom loop |
| `06-revised-roadmap.md` | foundation built, shortest path R0 + 1–16, deviations |
| `07-next-implementation-gate.json` | NS-4 certificate-to-snapshot adapter V1 |
