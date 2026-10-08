# Workflow analyses (directive product backlog 1–4)

Four workflows, each described as: trigger → inputs → steps → decision → evidence the user needs → what Headroom
provides today (with the artefact that proves it) → what is REVIEW / UNSUPPORTED today (register id) → acceptance
criterion (doc 05 §6 / W1–W9, doc 11 D-gates). Everything about Headroom cites an artefact on this branch; everything
about the user is an assumption to be tested in discovery (doc 06 §4, doc 13 §6) and is labelled as such. No
customer evidence exists.

Common vocabulary for the four workflows: a **unit** is a compiled covenant clause (rule + conditions + lineage +
dependencies); a **blocker** is a certification blocker code; a **refusal** is NEEDS_INPUT / UNSUPPORTED /
REVIEW_REQUIRED with a stated reason; the **evidence pack** is the per-unit export of doc 05 W7–W9.

## 1. CFO workflow — "can we do this transaction, and what will the board paper say?"

- Trigger (assumption): an acquisition, dividend, refinancing or new facility is proposed; the CFO needs a yes / no /
  conditions answer with something defensible attached, within days.
- Inputs: the proposed transaction (amount, entity, date, form), the current package (base + amendments + related
  instruments), the latest approved financials, the usage ledger.
- Steps: (1) treasury loads the package and confirms document roles; (2) the covenant inventory is built and reviewed
  (workflow 2); (3) the question is asked as a transaction simulation; (4) the answer and its evidence pack go to
  counsel for sign-off (workflow 3/4); (5) the board paper cites the pack.
- Decision: proceed / proceed with conditions (approvals, consents, amendments) / do not proceed / obtain a waiver.
- Evidence the CFO needs: the operative text that governs, the capacity figure with its inputs and ledger, every
  condition and who confirms it, every refusal and why, and a clear line between "the contract says" and "the model
  thinks".
- Headroom today: capacity with approved-only snapshot binding, exact as-of, ledger subtraction, shared pools,
  explicit supersession and simulation (F-R1…R10, `acceptance-runs/f182a679394b/`); fail-closed on missing inputs
  (F-R3, INV-09) and on unsupported effects (INV-34); the deterministic closure finds cross-document restrictions
  (BM-01/03/13, doc 08).
- Not today (REVIEW / UNSUPPORTED): any answer that depends on a side letter, consent or waiver (IPV-16); any answer
  that depends on an amended definition (IPV-19/20); baskets gated by "in excess of" thresholds or ratio comparators
  where a submission may have inverted them (IPV-22); entity-scope-widened baskets (IPV-01); shared caps stated as
  "together with" (IPV-02); builder pools netted through a definition (IPV-15); springing covenants at runtime (ledger
  #8). Until these close, every CFO answer is a reviewer-approved answer (doc 14 Level 1).
- Acceptance: doc 05 §6 criteria 5, 7, 8; W7–W9; D1, D2, D11 (doc 11).

## 2. Treasury workflow — "keep the inventory and the ledger right"

- Trigger (assumption): quarterly compliance certificate, a new amendment, a new facility, or a question from the
  CFO; the analyst owns the spreadsheet today.
- Inputs: the package, amendment notices, the ledger of past usages (with corrections), financial packs.
- Steps: (1) load / re-load documents; read the structure and amendment health report; (2) triage structural cards
  (TOC, dropped letters, inline enumerations, exhibit term lists — IPV-06/07/08/11) before any model call (D10); (3)
  review and approve units (W1–W3); (4) maintain the ledger (record usage, supersede corrections, never double count —
  F-R9/R10); (5) load the approved financial pack dated at the evaluation date (F-R2/R2c/R4); (6) answer routine
  basket questions (doc 06 §7 "time to answer").
- Decision: which units are approved, which stay in the review queue, which refusals need counsel.
- Evidence needed: lineage per clause at any date (C 7/7, MUT-05/11), the unit's unresolved dependencies, the
  blocker list, the ledger explanation (F-INV-trace).
- Headroom today: all of the above at the deterministic layer; the acceptance runner's per-package summary is the
  shape of the health report (`summary.md`); clause-text pinning (doc 09 §7) makes re-approval after a text change
  mechanical (W2).
- Not today: a definition amendment view (IPV-19/20); unclassified-override cards (IPV-16, doc 05 §6 criterion 7); a
  "what changed since last compile" view (doc 09 §3 identity); false-cycle blockers that hide real review items
  (IPV-21); the inventory itself when Pass B–D are not run (NOT_TESTED, doc 15 E1).
- Acceptance: doc 05 §6 criteria 1–4, 7, 9; W1–W6; D5, D10, D12.

## 3. In-house legal review — "is the machine's reading of the clause right?"

- Trigger (assumption): counsel is asked to sign off a unit or an answer before it reaches the CFO or the board; they
  will not trust a number without the text.
- Inputs: the unit (rule, conditions, exceptions, shared caps), the operative text with lineage, the retrieved
  definitions, the unresolved dependency list, the blockers, the adversarial-refusal record (what the deterministic
  layer refused and why).
- Steps: (1) read the operative text and lineage; (2) compare the unit to the text: scope, amount, conditions,
  exceptions, cross-references; (3) check the definitions used and the undefined terms flagged; (4) approve, send
  back with a note, or escalate to outside counsel.
- Decision: approve / reject / escalate; a rejection is a defect report in the register's format (input, expected,
  actual, severity, repro) — the same format this track uses.
- Evidence needed: verbatim excerpts for every figure and condition (ledger #35, `auditSemantic` provenance check);
  the full chain for amended provisions (W4); the list of what the compiler did not see (omission audit, doc 08).
- Headroom today: verbatim provenance on every compiled rule (mocked submissions); refusals of wrong-source figures
  (G cases), truncated clauses, undefined terms, currency relabelling; amendment chains at clause level.
- Not today: the four certified-but-wrong patterns counsel must catch by hand until fixed — scope widening (IPV-01),
  dropped "together with" cap (IPV-02), lineage-cited dropped proviso (IPV-03), threshold-as-cap / flipped comparator
  (IPV-22); stale section text (IPV-04); false cycles that block review of correct units (IPV-21).
- Acceptance: W1, W3, W7; D1 (the register's CRITICAL entries closed or routed to review by product-layer rules,
  doc 05 §6 criterion 6).

## 4. Outside-counsel collaboration — "send them less, get an answer faster"

- Trigger (assumption): a question in-house counsel will not sign alone (ambiguous drafting, a waiver, a conflict
  between documents, a novel transaction); outside counsel bills by the hour and starts from the documents.
- Inputs: the evidence pack for the units in question (W7), the specific ambiguity or conflict card (G duplicate
  7.01, E TOC ambiguity, H unresolved amendment, IPV-16 override), the proposed transaction.
- Steps: (1) in-house counsel selects the units and cards; (2) the pack is exported with source citations, lineage
  and refusals; (3) outside counsel answers the narrow question; (4) the answer is recorded against the unit as a
  reviewer note with its own citation; (5) the unit is approved or amended.
- Decision: outside counsel's opinion on the narrow point; whether an amendment or waiver is needed.
- Evidence needed: exactly the pack; never a model's paraphrase; the conflict stated as the two texts side by side.
- Headroom today: the conflict cards exist as deterministic findings (ambiguous duplicate sections, unresolved
  amendments, undefined terms, missing referenced documents — BM-13, H), each with the source excerpt; the pack's
  fields are the acceptance report's fields.
- Not today: an export format (doc 05 W7 defines it; nothing is built); reviewer notes with citations (W1 records
  approval only); side-letter / waiver documents as first-class cards (IPV-16).
- Acceptance: W7–W9; doc 06 §7 "evidence acceptance" (partner's counsel accepts the pack: yes/no).

## Cross-cutting assumptions to test in discovery

1. Treasury maintains a usage ledger today in some form (spreadsheet); if not, the ledger is the first thing the
   pilot builds and the capacity answers are gated on it.
2. Counsel will accept verbatim excerpts plus lineage as sufficient evidence for routine basket questions.
3. Side letters, consents and waivers exist in most packages; the IPV-16 fix is therefore pilot-blocking, not a nice
   to have.
4. The board paper needs the refusal list as much as the number.
