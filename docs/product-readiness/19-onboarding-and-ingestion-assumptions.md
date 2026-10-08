# Onboarding and data-room ingestion assumptions (directive product backlog 11–12)

What a design partner's package will look like when it arrives, what Headroom's deterministic stages do with each
shape today (artefact-backed), and what the onboarding step must therefore do before any model call. Assumptions
about partner practice are labelled; nothing here is customer evidence.

## 1. What arrives (assumptions)

| item | likely form | assumption to verify |
|---|---|---|
| Base credit agreement | PDF from the closing set; often a conformed copy; sometimes a Word draft | the executed conformed copy is available and the partner can identify it |
| Amendments | separate PDFs ("Amendment No. N", "First Amendment"); sometimes an amended-and-restated agreement; sometimes a markup exhibit | numbering is reliable; effective dates are stated |
| Indenture / notes | PDF with a table of contents, Article/Section headings, defined terms in Article I | TOC present in most indentures |
| Intercreditor / subordination agreements | PDF, cross-references to both facilities | present whenever there are two facilities |
| Side letters, consents, waivers, fee letters | PDFs or emails; informal headings ("Re: Consent under Section 7.02") | these exist in most packages and are the least organised documents |
| Compliance certificates | PDF/Excel; the latest quarter | available; partner's own covenant list is inside |
| Financial packs | Excel; monthly/quarterly | approved versions are identifiable |
| Ledger of past basket usage | spreadsheet or none | often none |

## 2. What the deterministic stages do with each shape today

| shape | behaviour on the synthetic corpus | artefact | onboarding rule |
|---|---|---|---|
| Clean agreement text (no TOC, contiguous enumeration) | structure, definitions, references exact | A, B, C, D, F, I, J, K, L STRUCTURE rows all pass | load directly |
| Table of contents present | TOC lines become duplicate nodes; every reference ambiguous; certification impossible | E (IPV-11); PR136-F1 | strip or mark the TOC before load (a triage parser exists off the certified path); otherwise the package is unusable |
| Dropped enumeration letter; spaced heading; homoglyph enumerator; mis-read section digit | following clause silently merged into the previous one; a bogus section label minted | G (IPV-07), MUT-17/19 (IPV-07), MUT-18 (IPV-23) | a structural diff against the partner's own clause list before approval; no diagnostic exists today |
| Inline (i)/(ii)/(A)/(B) inside definitions | definitions after the enumeration mis-sourced | H, E (IPV-06) | definitions review pass with the partner's defined-terms list |
| Exhibit "Term: …" lines | indexed as definitions | G (IPV-08) | mark exhibits non-operative at load; they must never feed definitions |
| Amendment "Section X … amended and restated to read as follows" / "deleted and replaced with [Reserved]" | resolved, dated, applied at clause level | C 7/7, MUT-05/11 | load as AMENDMENT; confirm effective date card |
| Amendment with conditions precedent to effectiveness | held back (CONDITIONAL_UNRESOLVED) | INV-06 | onboarding records the Amendment Effective Date when known (a dated input), else the amendment stays pending |
| Amendment "the definition of X in Section 1.01 is hereby amended and restated" | applied to the whole of Section 1.01; dependents compile on the old definition | IPV-19/20 (A in memory; I on disk) | until fixed: any package with a definition amendment is REVIEW for every dependent basket |
| Amendment "amended by replacing the words … with …" / "Section 1.01 … amended by amending and restating the definition of …" | routed to the interpreter → REVIEW offline | INV-05 F2/F4 | REVIEW card; needs a live model run (doc 15) |
| Amendment whose target cannot be resolved ("FIRST AMENDMENT … to the ABL Credit Agreement") | UNRESOLVED effect; instrument reported RESOLVED | H (IPV-05) | blocking card until fixed; the onboarding step must attach the amendment to its base agreement manually and record that it is pending |
| Side letter / consent / waiver ("notwithstanding Section X", "hereby consent to") | zero amendment effects; operative state unchanged | MUT-08/12/13/14/15/16 (IPV-16) | onboarding must list every such document and mark every section it names UNKNOWN (doc 05 §6 criterion 7) |
| Board resolution (designation) | modelled as a standalone instrument; no effect | INV-16 | same card as side letters |
| Second instrument (indenture, intercreditor) | separate instrument key; definitions kept apart; cross-document leads REVIEW_REQUIRED | B, H | partner confirms document roles; a referenced agreement not in the package is a hard stop for questions that depend on it (BM-13) |
| Missing referenced agreement (Term Loan Agreement, Management Agreement) | fail-closed for dependent questions | H, L, BM-13 | request the document or record that answers depending on it are refused |
| Definitions in "Guarantor means each Subsidiary that …" form | false DEFINITION_CYCLE; dependent covenants uncertifiable | IPV-21 (I, L) | until fixed: expect REVIEW on every covenant naming both terms; do not "fix" by editing the text |
| Junior-debt prepayment covenants, affiliate transactions | affiliate transactions compile (L); junior-debt prepayments have no family | L; K (IPV-18) | REVIEW card for unknown families |

## 3. Onboarding procedure derived from the above (reviewer-in-the-loop, Level 1)

1. Partner supplies the closing set and lists: base agreements, amendments (with dates), related instruments, side
   letters/consents/waivers, exhibits. Each document gets a role (doc 02 roles) confirmed by the partner.
2. Deterministic load only (no model call). The structure/amendment health report is produced (the acceptance
   runner's `summary.md` is the format): TOC cards, dropped-letter cards, inline-enumeration cards, exhibit-term
   cards, unresolved-amendment cards, conditional-effectiveness cards, override-document cards, false-cycle cards.
3. Every card is dispositioned by a reviewer before any unit is compiled (doc 11 D10). Cards that cannot be
   dispositioned mark the affected sections UNKNOWN.
4. Only then: inventory (Pass A deterministic signals; Pass B–D when a model run is authorised), unit review (W1–W3),
   ledger and financial-pack load (F-R cases), questions.

## 4. Data-room assumptions that change the design

- If most partners cannot produce a conformed copy, OCR noise is the first structural failure class: the scan-noise
  mutants (MUT-17…20) show a spaced heading or a homoglyph enumerator merges the affected covenant into its neighbour
  with no diagnostic (IPV-07) and a mis-read digit mints a bogus '7.0' section (IPV-23). Onboarding must therefore run
  a clause-count diff against the partner's own covenant list on every scanned document.
- If side letters are common (assumption 3 in doc 18), IPV-16 is pilot-blocking.
- If the partner's covenant list in the compliance certificate is reliable, it is the recall oracle for the pilot
  (doc 06 §7) and should be ingested as the reviewer's checklist, never as compiler input.
