# Evidence: #368 per-source COVERAGE_GAP increases are a region-overrun correction

Gate (seq 6 baseline, v2, snapshot 05b2234708d0): fam 8ece66ee HELDOUT 2595 [DEV 509]. It FAILS on exactly:
- edgar:0000732717-24-000059:exhibit1013q24.htm 10 → 15
- edgar:0000947871-20-000397:ss171930_ex1001.htm 19 → 21

This note does NOT create a migration record. Approval is pending with the owner.

## What changed
#368 bounds a covenant region at the next bare heading with a different major number (cross-article only, 79729730).
Before #368, the "Limitations…" sections' regions ran to the end of the document. Their clauses therefore
cited text from other articles, and those overrunning citations "bound" unrelated exceptions.

## Before (#367 1bd11740, mini snapshot): clauses that carry a covenant label but whose text is from other articles
- `UNSUPPORTED_SEMANTICS` numeric clause classified UNKNOWN: edgar-0000732717-24-000059-exhibit1013q24-htm-s5-4-limitations-on-the-company-s-activities-certain-separateness-cov
  excerpt: "(c) Notwithstanding anything to the contrary herein, (i) no Member shall Transfer all or any portion of such Member’s Membership Interest if such Tran"
- `UNSUPPORTED_SEMANTICS` numeric clause classified UNKNOWN: edgar-0000732717-24-000059-exhibit1013q24-htm-s5-4-limitations-on-the-company-s-activities-certain-separateness-cov
  excerpt: "(d) fourth , the balance, if any, to the Class B Common Members, pro rata in proportion to their holdings of Class B Common Membership Interests; prov"
- `UNSUPPORTED_SEMANTICS` numeric clause classified UNKNOWN: edgar-0000947871-20-000397-ss171930-ex1001-htm-s7-6-limitation-on-restricted-payments-a-2
  excerpt: "(a) The Borrower shall fail to pay any principal of any Loan when due in accordance with the terms thereof or hereof; or the Borrower shall fail to pa"
- `UNSUPPORTED_SEMANTICS` numeric clause classified UNKNOWN: edgar-0000947871-20-000397-ss171930-ex1001-htm-s7-6-limitation-on-restricted-payments-a-a
  excerpt: "(A) shall have acquired beneficial ownership of 40% or more of any outstanding class of Capital Stock having ordinary voting power in the election of "
- `UNSUPPORTED_SEMANTICS` numeric clause classified UNKNOWN: edgar-0000947871-20-000397-ss171930-ex1001-htm-s7-6-limitation-on-restricted-payments-d-d-c
  excerpt: "(c) Any Lender may, in the ordinary course of its commercial banking business and in accordance with applicable law, at any time and from time to time"
- `UNSUPPORTED_SEMANTICS` numeric clause classified UNKNOWN: edgar-0000947871-20-000397-ss171930-ex1001-htm-s7-6-limitation-on-restricted-payments-e
  excerpt: "(e) Upon its receipt of an Assignment and Assumption executed by an assigning Lender and an Assignee (and, in the case of an Assignee that is not then"
- `UNSUPPORTED_SEMANTICS` numeric clause classified UNKNOWN: edgar-0000947871-20-000397-ss171930-ex1001-htm-s7-6-limitation-on-restricted-payments-i
  excerpt: "(i) the arranging and other services regarding this Agreement provided by the Administrative Agent and the Lead Arrangers are arm’s-length commercial "

Reading these:
- ss171930: clauses labelled §7.6 "Limitation on Restricted Payments" contain the following:
  - Events of Default: "(a) The Borrower shall fail to pay any principal…" and "(A) …beneficial ownership of 40%…" (change of control).
  - Assignments: "(c) Any Lender may… assign", "(e) Upon its receipt of an Assignment and Assumption".
  - Agency / no-fiduciary text: "(i) the arranging and other services…".
  
  All of these sit in later articles, after §7.6.
- exhibit1013q24 (an LLC agreement): clauses labelled §5.4 "Limitations on the Company's Activities" contain the following:
  - Member transfer restrictions: "(c) …no Member shall Transfer…".
  - The distribution waterfall: "(d) fourth, the balance… to the Class B Common Members".
  
  Both sit in later sections.

## After (#368 8ece66ee): the same sources
- The overrunning clauses are gone. That removes UNSUPPORTED_SEMANTICS: 2 on exhibit1013q24 and 3 on ss171930.
- The exceptions those clauses used to "bind" are now reported honestly as unbound. These are the added COVERAGE_GAP findings:
  - exhibit1013q24 (+7): "Except as otherwise provided in Sections 4, 7, 11 and 13… no Member shall demand…", "Except as otherwise provided in Section 13, the Company shall make distributions…", "Except as provided in the third sentence of this Section 5.2(b)…", and 4 more of the same kind (LLC member/distribution provisions, not covenant baskets).
  - ss171930 (+5): "except that the Borrower may not assign…", "Except as provided in paragraphs (b) and (d) of this subsection 11.1…", "except that (x) the Commitment of any Defaulting Lender…", "Except for notices, reports… furnished to the Lenders by the Admin[istrative Agent]", and "except for its or such Person's own gross negligence…". These come from amendments, assignments and agency, Articles 10 and 11.
- Net per source: exhibit1013q24 +5, ss171930 +2. HELDOUT and DEV totals do not get worse, and no other source regresses.

Reproduce: `/workspace/sb/mini.sh <worktree> NAME`, then `python3 /tmp/diff.py m-nu4.jsonl m-fam4.jsonl exhibit1013q24.htm ss171930_ex1001.htm`.
