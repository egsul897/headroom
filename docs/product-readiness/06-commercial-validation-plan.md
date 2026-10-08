# Commercial validation plan — design-partner phase

No traction is claimed or implied anywhere in this plan. Everything below is a hypothesis to be tested with the
MVP in `05-mvp-specification.md`.

## 1. Ideal customer profile (hypothesis)

- Mid-market or lower-large-cap borrower (revenue roughly $200m–$3bn) with **2–6 debt instruments** (bank credit
  agreement + one or more notes/indentures, often an ABL + term loan + intercreditor), **≥ 3 amendments** on the
  lead facility, and a treasury/finance team of 3–15 that owns covenant compliance.
- Sponsor-backed companies and recently refinanced companies are the sharpest fit: more amendments, more baskets,
  more "can we do X?" questions per quarter.
- Not a fit for the pilot: single-instrument borrowers with one page of covenants; distressed names mid-restructuring.

## 2. Buyer, user, influencer

| role | title | what they care about |
|---|---|---|
| Economic buyer | CFO / VP Finance | fewer surprises at compliance-certificate time; audit-ready evidence; less outside-counsel spend on routine questions |
| Day-to-day user | Treasurer / Assistant Treasurer / Director of FP&A | answering basket questions fast, keeping the ledger of usage, prepping the compliance certificate |
| Influencer / gatekeeper | GC / outside counsel; Controller (SOX) | that nothing is "advice"; that every statement is source-linked; that the tool cannot silently assume |

## 3. Pain (what we think is true; to be verified)

- The "contract as a spreadsheet" problem: baskets, usage and definitions live in a hand-maintained workbook that is
  wrong after every amendment.
- Latency: a "can we do X" question takes days when it goes to counsel; treasury wants minutes for routine ones.
- Evidence: at certificate time, the team re-derives the same numbers and cannot show where they came from.

## 4. 30-minute discovery call guide

1. (5 min) Their stack: instruments, amendments in the last 24 months, who maintains the covenant workbook.
2. (10 min) Last three "can we do X" questions: who asked, who answered, how long, what evidence was produced.
3. (5 min) Compliance certificate workflow: inputs, time spent, errors found in the last year.
4. (5 min) Walk through package C (amendment supersession) on screen — ask "is this how your amendments look?"
5. (5 min) Qualify: willingness to share a redacted package under NDA; who would be the daily user; what would make
   this a no.

Disqualifiers: no amendments; counsel answers everything and they like it that way; no one owns the workbook.

## 5. 60-minute demo plan (uses only the synthetic corpus)

| min | package | what we show | what we say |
|---|---|---|---|
| 0–5 | — | the promise and the non-promises (§2 of the MVP spec) | "inventory, not advice" |
| 5–15 | A | upload → outline → inventory → definition drawer | source-linked rows |
| 15–25 | C | amendment timeline, as-of selector, $25m → $40m with the new proviso, deleted (e) | "the amendment is applied clause by clause, with evidence" |
| 25–35 | G | duplicate section, truncated clause, stale amendment, exhibit figure excluded | "what it refuses to say" |
| 35–45 | F | approve two units, add ledger usage, approved snapshot, ask "can we incur $35m" → insufficient | capacity honesty |
| 45–55 | their questions | — | — |
| 55–60 | pilot proposal | — | — |

Never demo with a live model on a prospect's real document in the first meeting.

## 6. Pilot structure (8 weeks, 2–3 design partners)

- Week 0: NDA; partner supplies one redacted package (base + amendments + one related instrument) and last
  compliance certificate.
- Weeks 1–2: we run the package through the deterministic stages offline and return the structure/amendment health
  report (the same report format as the acceptance run). Partner confirms document roles.
- Weeks 3–5: reviewer workflow live; partner's treasury user approves units; we log every "could not determine".
- Weeks 6–7: ledger + one approved snapshot; the partner asks their real "can we do X" questions; we record
  answered / needs-input / unsupported.
- Week 8: readout against the rubric below. Pilot fee: cost-recovery only; no commitment beyond the readout.

## 7. Measurable rubric

| metric | how measured | pilot bar (hypothesis) |
|---|---|---|
| Inventory recall on partner-confirmed covenants | reviewer marks each row found / missed | no material covenant missed without a queue item explaining why |
| False permission count | any row showing more room than counsel's view | zero tolerated; each one is a stop-ship defect |
| "Could not determine" honesty | every NEEDS_INPUT / UNSUPPORTED traced to a stated reason | 100% have a reason the user understands |
| Time to answer a routine basket question | stopwatch, user-reported | minutes, with evidence attached |
| Reviewer effort | minutes per approved unit | trend down over the pilot |
| Evidence acceptance | partner's controller/counsel accepts the exported evidence pack | yes/no |

## 8. Claims we will not make

- "Automated covenant compliance", "AI legal review", "certified", "guaranteed accurate".
- Any accuracy percentage from the synthetic corpus or from a pilot of two.
- That capacity numbers are computable without an approved financial snapshot and a maintained ledger.
- That amendments are applied automatically when the target cannot be resolved (IPV-05).
- That a section-level "current text" view exists before IPV-04 is fixed.

## 9. Exit criteria for the design-partner phase

Proceed to a paid beta only if: ≥ 2 partners accept the evidence pack, zero false permissions in the readout, and
each partner names a second instrument they want loaded. Otherwise, return to the defect register and the MVP
acceptance criteria.
