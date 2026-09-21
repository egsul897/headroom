/**
 * §8 forbids synthetic propositions such as "rest of claim". Two propositions carried
 * forward from the integrity audit are authoring shorthands rather than self-contained
 * statements: one says "same lead-in" (meaning: identical to the sibling document's
 * chapeau) and one says "no default condition asserted". Neither can be checked on its
 * own, and neither can be read as a surfaced or unsurfaced atom.
 *
 * They are restated here from the same primary source the audit cited. The MEANING and
 * the SOURCE_CONFIRMED / SOURCE_PARTIALLY_CONFIRMED status are unchanged; only the
 * wording becomes self-contained.
 */
export const PROPOSITION_RESTATEMENTS: Record<string, Record<string, string>> = {
  "CASE-30db965277": {
    P1:
      "No Loan Party will, nor will it permit any Restricted Subsidiary to, form any subsidiary after the Effective Date, or purchase, hold or acquire Equity Interests, evidences of indebtedness or other securities of, make or permit loans or advances to, Guarantee obligations of, or make any investment or other interest in, any other Person, or acquire assets of another Person constituting a business unit, except as permitted by clauses (a) through (s).",
  },
  "CASE-57227cc234": {
    P3:
      "The general ratio-gated Indebtedness permission is additionally conditioned on the Payment Conditions being satisfied with respect to the incurrence.",
    P4:
      "This general ratio-gated permission stands apart from the enumerated exceptions in clauses (a) through (t), which the limitation does not apply to.",
  },
  "CASE-8de9def8ca": {
    P1:
      "No Loan Party will, nor will it permit any Restricted Subsidiary to, make or agree to make any payment or distribution of or in respect of principal or interest on any Indebtedness, or on account of the purchase, redemption, retirement, acquisition, cancellation or termination of any Indebtedness, except as permitted by clauses (i) through (iv).",
  },
  "CASE-466dbaa257": {
    P2:
      "\u201cNotes Priority Collateral\u201d is likewise defined only by cross-reference to the Intercreditor Agreement, which is not filed in this package.",
  },
  "CASE-99ee6598d1": {
    P2:
      "Section 6.04(a)(iii) carries no Event-of-Default prefix: the Restricted Payment permission under this clause is not gated on the absence of a Default or Event of Default.",
  },
};
