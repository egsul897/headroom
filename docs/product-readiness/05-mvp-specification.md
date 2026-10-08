# MVP specification — "Source-backed debt covenant inventory and review workspace"

Status: proposal from the independent validation track. Scope is deliberately narrower than the full North Star
(`docs/headroom-north-star-v2.md`): it ships only what the acceptance run shows the deterministic substrate can do
honestly today, and it puts a human reviewer in every path that today's evidence says cannot yet be trusted alone.

## 1. One-sentence promise

A borrower's finance team uploads its credit agreement, amendments and related instruments and gets a reviewable,
source-linked inventory of every covenant, basket, condition and definition — with the system saying out loud what it
could not read, could not resolve, or could not reconcile — so the team can answer "what does the contract say about
X as of today?" from the contract itself instead of from a spreadsheet.

## 2. What the MVP is not

- Not a capacity calculator for arbitrary baskets. Capacity is shown only for units a reviewer has approved AND whose
  inputs are approved financial facts (Phase 4B snapshot, APPROVED status, exact as-of).
- Not a legal opinion. Every screen says "inventory, not advice".
- Not autonomous. No unit becomes "approved" without a named reviewer; the system never certifies on its own.
- Not multi-tenant SaaS at launch: single-company workspaces, design-partner operated.

## 3. The 10-step user journey

| # | step | user sees | system guarantees (and the evidence behind it) |
|---|---|---|---|
| 1 | Upload the package | Drop zone for base agreement, amendments, indenture/intercreditor, exhibits; each file gets a role the user confirms (base / amendment / related instrument / non-operative exhibit) | Role is user-confirmed, never inferred silently (IPV-08: exhibits leak into the definition index unless excluded) |
| 2 | Structure check | Outline of articles/sections/clauses with a health panel: duplicate labels, TOC detected, enumeration gaps, inline enumerations inside definitions | Fail-closed on ambiguity (E, G); the health panel exposes IPV-06/07/11 instead of hiding them |
| 3 | Amendment timeline | For each amendment: target found / not found, effective date, operation (restate / delete / modify); unresolved amendments shown as red cards | Resolved effects applied per clause (C); an unresolved amendment blocks "current" status for the whole instrument (closes IPV-05 at the product layer) |
| 4 | As-of selector | A date control; every provision shows CURRENT / SUPERSEDED (by …) / DELETED (by …) at that date | Clause-level operative state verified (C 7/7); section-level views are built from clause-level state, never from the base section text (closes IPV-04 at the product layer) |
| 5 | Covenant inventory | Table per family: section, text excerpt, posture, amount/ratio/percent if stated, conditions listed verbatim, defined terms it uses | Every row links to a verbatim excerpt; plural/singular term resolution is shown as "matched as 'Dispositions'" (IPV-09) |
| 6 | Definition drawer | Click a term → definition text, where it is defined, what it depends on, which of those are undefined | Undefined and cyclic terms shown as warnings (B 4.09 self-reference, H FCCR → undefined EBITDA) |
| 7 | Review queue | Units the system could not represent or that tripped a guard: ambiguous section, undefined term, truncated text, conflicting duplicate, shared cap detected in prose, scope narrower than the lead-in | Queue items are produced from deterministic signals and Layer-1 findings; nothing leaves the queue without a reviewer |
| 8 | Reviewer decision | Approve / reject / annotate a unit; approval records who, when, and the exact excerpt approved | Unit identity = source content hash + structural node id (already in Phase 3 artefacts) |
| 9 | Ask the contract | "Can we incur $35m under the general basket?" → shows the approved unit, its conditions, and — only if an APPROVED snapshot exists — remaining capacity with inputs and ledger entries listed | Runtime verified on fixture IR (F 14/14): ledger subtraction, shared pools, approved-only, exact as-of; otherwise NEEDS_INPUT |
| 10 | Export & audit | Export the inventory (CSV/PDF) with excerpts and reviewer stamps; audit log of every approval and every "could not determine" | Report format mirrors the acceptance report: every statement carries source, status and who approved it |

## 4. Functional scope by stage (what ships, what is gated)

| stage | ships in MVP | gated / deferred |
|---|---|---|
| Structure | plain-parser outline + health panel; TOC filter (deterministic) before parse | ambiguity resolution by model (classifier) deferred |
| Package graph | document roles confirmed by user; relationship resolution shown with its evidence | automatic resolution of unusual titles ("ABL Credit Agreement", "First Amendment") deferred - user resolves |
| Amendments | deterministic effects with explicit dates | interpreter for ambiguous operations behind review |
| Operative state | clause-level as-of views; instrument status REVIEW when any amendment is unresolved | section-level composite text only after IPV-04 is fixed |
| Discovery | Pass A signals + user-added rows | semantic discovery passes behind a "suggested rows" label |
| Semantic representation | model-proposed rows go to the review queue; approved rows become units | certification vocabulary not shown to users |
| Verification | Layer-1 findings surfaced as queue reasons | Layer-2 reviewer runs but its silence is never treated as approval |
| Runtime | capacity for approved units with APPROVED snapshot inputs and a user-maintained ledger | builder baskets, FX, reclassification elections, springing tests shown as NEEDS_INPUT/UNSUPPORTED |

## 5. Non-functional requirements

- Determinism: same package + same as-of + same snapshot → identical inventory and capacity (hashes shown).
- Evidence: every displayed number/clause carries document id, section ref, char range, content hash.
- No silent defaults: unresolved = shown as unresolved; the UI has no "assume current" switch.
- Cost: model calls bounded per package by the existing HardDispatchBudget; a priced model is mandatory.
- Privacy: documents stay in the customer's workspace; no training on customer documents.

## 6. Acceptance criteria for "MVP done" (testable, offline where possible)

1. Packages A, C, D, F from the acceptance corpus render steps 1–8 with zero INCORRECT_RESULT findings at the stages
   the MVP exposes (structure, amendments, operative state, inventory, definitions).
2. Package E shows the TOC health warning and still produces a usable outline (requires the TOC filter).
3. Package G shows: duplicate 7.01 conflict card, truncated 7.04 card, undefined-term card, stale amendment card, and
   the $100m exhibit figure never appears in the inventory.
4. Package H shows the unresolved First Amendment as a blocking card and the instrument as REVIEW.
5. "Ask the contract" over package F reproduces F-R1…F-R10 outcomes exactly, with NEEDS_INPUT when no approved
   snapshot exists.
6. The three deterministic-layer gaps (IPV-01/02/03) are either fixed or their patterns are routed to the review
   queue by a product-layer rule (scope narrower than lead-in; "together with" / "pursuant to Section" phrases;
   proviso present in text but no condition on the unit).

## 7. Open questions for design partners

- Is a clause-level "current text" view acceptable when a section has mixed current/superseded clauses?
- How do teams want to record ledger usage today (spreadsheet import vs manual entry)?
- Which exhibits/schedules must be treated as operative (pricing grids, collateral schedules)?
