# Design-partner package

Complements `06-commercial-validation-plan.md` (ICP, buyer/user, discovery guide, demo plan, pilot structure, rubric,
claims we will not make, exit criteria). This document adds what a first conversation and a procurement review will
ask for. Every statement about Headroom is tied to the evidence in docs 02, 08, 09 and 10; nothing here is a result.

## 1. ICP and buyer (restated from doc 06, one line each)

- ICP: mid-market borrower (one syndicated credit agreement plus one bond or ABL, two to six amendments, treasury team
  of two to five) whose covenant questions currently go to outside counsel.
- Economic buyer: CFO / Treasurer. Day-to-day user: treasury analyst or assistant treasurer. Influencer and veto:
  general counsel, who must accept the evidence pack.

## 2. Objections and the honest answer

| objection | answer | evidence |
|---|---|---|
| "Our counsel already does this." | Headroom does not replace counsel; it gives treasury the operative text, lineage and a ledger-aware number *before* counsel is asked, and a refusal with a reason when it cannot. | MVP spec §1; refusal classes in doc 02 |
| "How do I know it is not hallucinating a basket?" | Every rule carries provenance to a source excerpt; a figure not in the source is refused deterministically (recital, exhibit, stale amendment, truncated clause cases). | 24/29 adversarial refusals, doc 02 |
| "What about amendments?" | Explicit amendments (restate / delete / replace) are applied by date and the superseded text is kept; amendments whose target cannot be resolved stop the answer *once IPV-05 is fixed*; waivers and side letters are not yet handled (IPV-16). | C 7/7; H IPV-05; MUT-08/12 |
| "Our agreement has a table of contents and messy numbering." | Today that fails closed (every reference ambiguous) or, for a dropped letter, silently merges clauses; the partner package is run through the structure stage first and any such finding is triaged by a human before any model call. | IPV-07, IPV-11; gate D10 |
| "Can you compute our leverage-ratio basket?" | Only from a financial snapshot the partner approves, dated at the evaluation date; otherwise NEEDS_INPUT, never a carried-forward number. | F-R2/F-R2c/F-R3 |
| "What does it cost to run?" | Unknown until measured; the offline estimate for a two-document package is cents at the locked rate card, and the estimate is labelled as such. | doc 08 §"Secondary economics" |
| "Is this certified / can we rely on it for a board paper?" | No. Diagnostic use with a reviewer approving every unit; certification gates are listed and none is met. | doc 11 |

## 3. Security and data handling (what we can say today)

- Documents are the partner's; processing is on infrastructure the founder controls; the model provider receives
  bounded excerpts (operative text plus retrieved definitions), never whole packages, per unit (`SemanticCompilerInput`
  bundles; benchmark closure sizes in doc 08).
- No partner document is used as a fixture, reserved package or training example; the acceptance corpus is synthetic.
- Open items a security questionnaire will ask and we cannot yet answer: data-retention policy for prompts and cache
  entries (`InMemorySemanticCompilationCache` is in-memory only), access control and audit logging in the application
  layer (not built), model-provider sub-processor terms, SOC 2 status (none).

## 4. Procurement path

- Pilot under NDA and a short pilot agreement: cost-recovery fee, no auto-renewal, partner owns all outputs, mutual
  termination at any time, no reference use without written consent.
- Deliverables: structure/amendment health report (week 2), reviewer-approved unit inventory (week 5), evidence pack
  export (week 8), readout against doc 06 §7.
- What we need from the partner: one redacted package (base, amendments, one related instrument), the last compliance
  certificate, two hours per week of a treasury user, one hour of counsel at the readout.

## 5. Competitive alternatives (as the buyer sees them)

| alternative | what it gives | where Headroom differs | where it does not (yet) |
|---|---|---|---|
| Outside counsel memo | authoritative, slow, expensive per question | repeatable, minutes, evidence attached, explicit refusals | authority; judgment on ambiguous drafting |
| Spreadsheet maintained by treasury | cheap, familiar | ledger, snapshot policy, supersession, lineage are enforced rather than remembered | none if the agreement is simple and stable |
| Generic LLM chat over the PDF | fast, cheap | will answer from a recital, an exhibit, a stale amendment or a contents line; Headroom refuses those deterministically (G cases, BM-07) and never lets top-k define the closure | breadth of questions |
| Contract-analytics platforms (clause extraction) | inventory of clauses across many contracts | Headroom computes capacity with dated inputs and a ledger, and fails closed on dependencies | portfolio scale, non-debt contracts |
| Loan-servicing / agent portals | facility data, notices | covenant *capacity* under negative covenants, not just financial-covenant tests | agent-side data feeds |

## 6. Pricing hypotheses (to be tested in discovery, not quoted)

- H1: per-instrument annual fee (base agreement + its amendments), tiered by number of instruments; the question count
  is not the unit of value, the maintained instrument is.
- H2: pilot at cost recovery; first-year price anchored to one counsel memo per quarter avoided.
- H3: evidence-pack export as the feature that unlocks counsel acceptance, included, not priced separately.
- Discovery questions that test them: "How many instruments do you track?", "How many basket questions reach counsel
  per quarter and what does one cost?", "Who signs off a capacity number today and what do they need to see?",
  "What happened the last time an amendment changed a basket?", "Do you have side letters or waivers in force?"

## 7. Demo script (synthetic corpus only; 25 minutes)

1. Package C: show 7.01(b) on three dates; superseded text kept; deleted basket shown as deleted (2 min).
2. Package G: ask for the debt cap; show the refusal of the $100m recital/exhibit figure and the stale amendment; show
   the truncated 7.04 refusal (4 min).
3. Package D: "can we sell the plant?" → hanging proviso stops the answer; "can we sell a warehouse for $8m?" → the
   three 7.05(k) conditions and the 2.05(b) sweep attached (5 min).
4. Package F: capacity with ledger, approved snapshot, exact as-of; the NEEDS_INPUT when the pack is stale; the
   simulation of a $15m investment (6 min).
5. Package I: "$40m secured?" → 7.02(b) lien cap and Article IX 9.15 brought in by the closure although the question
   named only 7.01(b) (4 min).
6. The register: show IPV-16 and say plainly what it means for packages with side letters (2 min).
7. What a pilot looks like (doc 06 §6) (2 min).
