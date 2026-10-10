# Corpus-scale activation funnel

**Rule:** Do not equate ~30,051 covenant summaries with ~30,051 usable rules.

## Funnel stages

| Stage | What counts | How measured |
|---|---|---|
| Authentic source documents | `KnowledgeSource` rows / distinct hashes | Neon count |
| Structured provisions | Summary items with section identity | Sample + corpus stats |
| Formula candidates | Items with basket/threshold/ratio language | Heuristic on summary text |
| Correctly extracted formulas | `parseCounselFormula` → `MODELED` with threshold > 0 | Sample parse |
| Reviewed interpretations | Counsel ACCEPT/EDIT completed | Production count (near 0 at scale) |
| Accepted interpretations | Counsel `decision: ACCEPTED` | Production count |
| Durable executable Permissions | Permission rows (`MODELED`) | Neon count |
| Independently validated calculations | Matrix/E2E with pre-declared expecteds | Activation artifacts |
| Customer-ready verified outcomes | VERIFIED review **and** safety gates **and** approved financials **and** attributed utilization as required | **0** — gates not satisfied for newly activated rules |

## Failure reasons (extraction → executable)

| Reason | Class |
|---|---|
| No numeric basket / threshold in summary | `KNOWN_NOT_MODELED` |
| Incremental / prepayment / reallocation mechanics | Unsupported mechanic |
| Missing `companyId` / `documentId` binding | Cannot counsel-compile to customer Permission |
| No counsel ACCEPT | Stays DISCOVERED |
| Synthetic-only financials | Calculation may be correct; not customer-ready |
| Unattributed utilization | Remaining capacity not authoritative |
| Failed contractual gate | `GATE_NOT_SATISFIED` / `REVIEW_REQUIRED` (A8-01) |
| No encoded restoration/reclass edge | Phase 4D refuses inferred authority |
| Seeking CERTIFIED from discovery | Epistemic wall — intentional |

## Measurement artifact

See `neon-activation-matrix.json` → `funnel` for the latest sample-backed rates from this activation cycle.
