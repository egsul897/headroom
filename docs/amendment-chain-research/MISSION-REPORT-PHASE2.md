# Mission Report — Amendment Chain Research Phase 2

**Branch:** `cursor/amendment-chain-research-2926`  
**Starting SHA:** `0927e043a693456470c694c501cc46d006e03605`  
**PR:** #150 (draft; not merged)  
**Production amendment code modified:** No  
**Claude-owned fixtures modified:** No  
**Paid inference:** No

## 1. Newly acquired operative documents

Acquired via shared `EdgarConnector.fetch` (bytes in gitignored `.local-amendment-research/bytes/`; hashes in `phase2/acquisition-ledger.json`):

| docId | Accession | Exhibit / file | Status |
|---|---|---|---|
| cnmd-seventh-ar | 0001193125-21-217426 | EX-10.1 | ACQUIRED (corrected; EX-10.2 was GCA am) |
| cnmd-am1-2022 | 0001193125-22-169336 | EX-10.25 | ACQUIRED |
| cnmd-omnibus-2026 blacklines | 0002077096-26-000190 | EX-10.1 embedded | FIXTURE_RAW_PRESENT (no separate SEC exhibits) |
| matw-am1 | 0000063296-21-000048 | firstamendmenttothirdamend.htm | ACQUIRED |
| matw-am2 | 0000063296-22-000060 | EX-10.1 | ACQUIRED |
| matw-am3 | 0000063296-22-000099 | thirdamendmenttothirdamend.htm | ACQUIRED |
| matw-am4 | 0000063296-23-000044 | fourthamendmenttothirdamen.htm | ACQUIRED |
| matw-am5 | 0000063296-24-000010 | fifthamendmenttothirdamend.htm | ACQUIRED |
| dsgr-am1 | 0001193125-23-163984 | EX-10.1 | ACQUIRED |
| dsgr-am2 | 0000703604-24-000079 | EX-10.1 | ACQUIRED_CONFORMED_EXHIBIT_A (image) |
| dsgr-am2-10q | 0000703604-24-000079 | dsgr-20240630.htm | ACQUIRED (narrative only; not operative) |
| cohr-ca-orig, am1–am5 | (see ledger) | EX-10.x | ACQUIRED |
| inap-ca-orig, am1–am7 | (see ledger) | EX-10.x | ACQUIRED |

## 2. Source-complete vs incomplete

See `phase2/source-completeness.json`.

- **Complete for core mission gaps:** Coherent orig+Am1–5; Internap orig+Am1–7; CONMED Seventh-era definition chain (Seventh+Am1+Am2) + Omnibus raw; **Matthews base+Am1–Am6**.
- **Improved incomplete:** DSGR (Am1 acquired; Am2 image EX-10.1 + 10-Q narrative; wrapper text still `MISSING_DOCUMENT`).

## 3. Verified amendment operations (source-backed excerpts)

- **CONMED CSSLR/CTLR cash-netting:** $25M (Seventh A&R) → $75M (Am1) → $100M (Am2). Applying Am2 to Seventh A&R is wrong-parent (WP-003).
- **CONMED §7.1(b):** before text from Seventh A&R SOURCE_BACKED; after from Second Amendment.
- **Matthews §5.14:** numeric caps SOURCE_BACKED unchanged across base→Am2→Am4→Am5; Am1/Am3/Am6 do not amend §5.14; Am5 blackline date-era shift only (WP-008).
- **Matthews §6.01(j):** SOURCE_BACKED base→Am6 narrowing.
- **Coherent Am4 baskets/ratios:** re-verified from Am4/Am5 acquired bytes.
- **DSGR Am2:** 10-Q narrative (CDOR→CORRA; dated June 13, 2024) is discovery-only — not operative wrapper text.

## 4. Verified effective dates

Named Effective Date constructs recorded; **condition satisfaction calendar dates remain CONDITIONAL_UNRESOLVED** unless proven — never silently set from execution/filing date (`authority-layers/`, WP-006).

DSGR Fourth Amendment **deemed effect as of 2025-01-01** retained as DEEMED_RETROACTIVE (VC-002).

## 5. Replayable as-of-date scenarios

`as-of-scenarios/all-chains.json` — before/between/after queries for same-day, conditional, deemed retroactive, multi-era pricing, definition replacement, restatement supersession, omnibus, waiver separation, Matthews §5.14 eras, DSGR Am2 narrative guard.

## 6. Independently reviewed outcomes

All test specs set `independentlyReviewedLegalGroundTruth.status = PENDING_INDEPENDENT_REVIEW`.  
Handoff packet: `independent-review-handoff/HANDOFF.json` (no Independent Legal Challenger peer agent found in fleet).

## 7. Remaining missing authority

- DSGR Am2 text wrapper (`MISSING_DOCUMENT`; image EX-10.1)
- Calendar proof of condition satisfaction for conditional Effective Dates (Matthews Am1–Am6, Coherent Am4/Am5, others)
- DSGR prior §6.08(a)(v) before-text
- Side-letter restrictions still none located

## 8. SHA / PR / tests / CI

- **Branch tip SHA:** recorded at commit time on `cursor/amendment-chain-research-2926` (avoid self-referential tip drift)
- **PR:** https://github.com/egsul897/headroom/pull/150 (draft; not merged)
- **Local tests:** `npx vitest run tests/amendment-chain-research/phase2-corpus-integrity.test.ts`
- **CI:** subscribed on `cursor/amendment-chain-research-2926`
