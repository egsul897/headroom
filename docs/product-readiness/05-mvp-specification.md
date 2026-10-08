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
6. The deterministic-layer false-permission gaps (IPV-01/02/03/22) are either fixed or their patterns are routed to
   the review queue by a product-layer rule (scope narrower than lead-in; "together with" / "pursuant to Section"
   phrases; proviso present in text but no condition on the unit; a capacity figure introduced by "in excess of" /
   "exceeding" / "not less than").
7. Any package document that is not a base agreement, indenture, intercreditor agreement or a parsed amendment (side
   letters, consents, waivers, board resolutions) is shown as an **unclassified override** card on every section it
   names, and the operative state for those sections is shown as UNKNOWN until a reviewer disposes of the card
   (IPV-16, INV-16).
8. A definition amendment is shown against the definition it names, never against the whole definitions section; the
   compiler view of every dependent basket shows the amended definition text with its lineage (IPV-19/20).
9. A "definition cycle" blocker is shown only when the cycle is genuine (each definition names the next); packages I
   and L must certify their covenants without a cycle card (IPV-21).

### Workflow acceptance criteria (directive product backlog 7, 8, 10; testable against the committed artefacts)

Reviewer approval workflow:
- W1. A unit cannot be approved while any blocker in its certification record is open; the reviewer sees the blocker
  code, the source excerpt and the unresolved dependency list (the `blockers`, `unresolvedIssues` and
  `unresolvedDependencies` fields that `acceptance-runs/<sha>/report.json` already carries per candidate).
- W2. Approving a unit records who, when, the unit's `sourceContentVersion` and the semantic cache key; a later text
  change to the clause (textSha256 mismatch, doc 09 §7) invalidates the approval automatically.
- W3. An adversarial representation of the kinds in `02-acceptance-matrix.md` "Adversarial acceptance" that the
  deterministic layer refuses never reaches the approval queue as "ready"; one that it accepts (IPV-01/02/03/22
  patterns) is flagged by the product-layer rules in criterion 6 until those defects close.

Amendment comparison:
- W4. For any provision with an applied effect, the user can see base text, every applied amendment in date order,
  and the current text, exactly as `computeOperativeContractState` reports `fullChain` / `appliedChain` (package C at
  three dates is the fixture).
- W5. An amendment whose effective date is conditional (INV-06) is shown as pending, never applied; an unresolved
  amendment (IPV-05, H) blocks the instrument with a card.
- W6. "What changed since the last compile" is not offered until a cross-version node identity exists (doc 09 §3);
  until then the comparison is clause-text based (textSha256), never node-id based.

Evidence export:
- W7. The export of a unit contains: operative text with document id and section ref, the lineage chain, every
  retrieved definition with its source, the unresolved dependency list, the certification record and its blockers,
  and the run identity (SHA, corpus identity, versions) — the same fields the acceptance report serialises.
- W8. A capacity answer exports with the snapshot binding (ids, versions, hash), the ledger rows it subtracted and the
  explanation trace (`explanations[]`, F-INV-trace), or with NEEDS_INPUT and the named missing input.
- W9. An export never contains a figure from a non-operative source (G recital, exhibit, stale amendment) as a
  capacity; those appear only under "non-operative mentions" with their source.

## 7. Open questions for design partners

- Is a clause-level "current text" view acceptable when a section has mixed current/superseded clauses?
- How do teams want to record ledger usage today (spreadsheet import vs manual entry)?
- Which exhibits/schedules must be treated as operative (pricing grids, collateral schedules)?
