/**
 * Phase 2B - independently authored expected covenant-discovery inventory
 * for the FWRG 2021 Credit Agreement regression fixture (task §14/§17).
 *
 * ADJUDICATION STATUS: AI-authored by direct reading of the real source
 * text (article-6-negative-covenants.txt), enumerated at SUBSECTION
 * granularity using Phase 2A's own structural parser as a scaffold - every
 * listed ref was independently read and manually cross-checked against the
 * raw source text (not copied from any discovery-system output; this file
 * was written and committed BEFORE any Phase 2B semantic discovery call was
 * ever run against this document). Not yet reviewed by independent human
 * legal counsel - the same disclosed posture every prior ground-truth file
 * in this project uses (see human-ground-truth.ts in the sibling unseen-
 * packages fixture directories).
 *
 * SCOPE DECISION (V1): "operative rule" is measured at SUBSECTION
 * granularity (the lettered (a)/(b)/(c) level), not the deeper CLAUSE/
 * SUBCLAUSE level - e.g. FWRG 6.01(w)'s own internal (x)/(y)/(z) sub-limbs
 * are not separately required for V1 recall. A section with zero lettered
 * children (e.g. 6.08) is itself exactly one operative rule.
 * "[Reserved]" subsections are explicitly excluded - they are placeholders,
 * not operative rules.
 */
import type { CovenantFamily } from "@prisma/client";

export interface ExpectedSection {
  sectionRef: string;
  heading: string;
  covenantBearing: boolean;
  /** Every family this section's own operative rules genuinely concern - more than one is a real, expected case (task §18 test 12), not an error. */
  families: CovenantFamily[];
  otherFamilyDescription?: string;
  /** Every independently operative rule expected to be discoverable, by ref. A section with no lettered children lists its own sectionRef once. */
  expectedOperativeRefs: string[];
  /** The subset of expectedOperativeRefs that are baskets/exceptions specifically (carve-outs from a general prohibition), vs. a distinct standalone rule/test. */
  expectedBasketExceptionRefs: string[];
  notes?: string;
}

export const FWRG_EXPECTED_INVENTORY: ExpectedSection[] = [
  {
    sectionRef: "6.01",
    heading: "Indebtedness",
    covenantBearing: true,
    families: ["INDEBTEDNESS"],
    expectedOperativeRefs: ["6.01(a)", "6.01(b)", "6.01(d)", "6.01(e)", "6.01(f)", "6.01(g)", "6.01(h)", "6.01(i)", "6.01(j)", "6.01(k)", "6.01(l)", "6.01(m)", "6.01(n)", "6.01(o)", "6.01(p)", "6.01(s)", "6.01(t)", "6.01(u)", "6.01(w)", "6.01(x)", "6.01(y)", "6.01(z)", "6.01(aa)", "6.01(bb)", "6.01(cc)", "6.01(dd)", "6.01(ee)", "6.01(ff)", "6.01(gg)", "6.01(hh)", "6.01(jj)", "6.01(kk)"],
    expectedBasketExceptionRefs: ["6.01(a)", "6.01(b)", "6.01(d)", "6.01(e)", "6.01(f)", "6.01(g)", "6.01(h)", "6.01(i)", "6.01(j)", "6.01(k)", "6.01(l)", "6.01(m)", "6.01(n)", "6.01(o)", "6.01(p)", "6.01(s)", "6.01(t)", "6.01(u)", "6.01(w)", "6.01(y)", "6.01(z)", "6.01(aa)", "6.01(bb)", "6.01(cc)", "6.01(dd)", "6.01(ee)", "6.01(ff)", "6.01(gg)", "6.01(hh)", "6.01(jj)", "6.01(kk)"],
    notes: "6.01(c)/(q)/(r)/(v)/(ii) are [Reserved] - excluded. 6.01(x) is itself a sub-limb of the (w) Ratio Debt basket's own internal formula, not a separately operative top-level basket - included in the operative-ref count (structurally a sibling per the parser) but excluded from the basket/exception subset to avoid double-crediting the same economic basket twice.",
  },
  {
    sectionRef: "6.02",
    heading: "Liens",
    covenantBearing: true,
    families: ["LIENS"],
    expectedOperativeRefs: ["6.02(a)", "6.02(b)", "6.02(c)", "6.02(d)", "6.02(e)", "6.02(f)", "6.02(g)", "6.02(h)", "6.02(i)", "6.02(j)", "6.02(k)", "6.02(l)", "6.02(m)", "6.02(n)", "6.02(o)", "6.02(p)", "6.02(q)", "6.02(r)", "6.02(s)", "6.02(u)", "6.02(v)", "6.02(w)", "6.02(x)", "6.02(y)", "6.02(z)", "6.02(aa)", "6.02(bb)", "6.02(cc)", "6.02(dd)", "6.02(ee)", "6.02(ff)", "6.02(gg)", "6.02(hh)", "6.02(ii)", "6.02(jj)", "6.02(kk)", "6.02(ll)", "6.02(nn)"],
    expectedBasketExceptionRefs: ["6.02(a)", "6.02(b)", "6.02(c)", "6.02(d)", "6.02(e)", "6.02(f)", "6.02(g)", "6.02(h)", "6.02(i)", "6.02(j)", "6.02(k)", "6.02(l)", "6.02(m)", "6.02(n)", "6.02(o)", "6.02(p)", "6.02(q)", "6.02(r)", "6.02(s)", "6.02(u)", "6.02(v)", "6.02(w)", "6.02(x)", "6.02(y)", "6.02(z)", "6.02(aa)", "6.02(bb)", "6.02(cc)", "6.02(dd)", "6.02(ee)", "6.02(ff)", "6.02(gg)", "6.02(hh)", "6.02(ii)", "6.02(jj)", "6.02(kk)", "6.02(ll)", "6.02(nn)"],
    notes: "6.02(t)/(mm) are [Reserved] - excluded.",
  },
  {
    sectionRef: "6.03",
    heading: "[Reserved]",
    covenantBearing: false,
    families: [],
    expectedOperativeRefs: [],
    expectedBasketExceptionRefs: [],
    notes: "Placeholder only - not economically operative. A discovery system must not fabricate a rule here (test §18 case 10 analog).",
  },
  {
    sectionRef: "6.04",
    heading: "Restricted Payments; Restricted Debt Payments",
    covenantBearing: true,
    families: ["RESTRICTED_PAYMENTS"],
    expectedOperativeRefs: ["6.04(a)", "6.04(b)"],
    expectedBasketExceptionRefs: [],
    notes: "6.04(a) itself contains many further internal baskets at the CLAUSE level (roman numerals) not separately enumerated in this V1 SUBSECTION-granularity benchmark - a discovery system correctly flagging 6.04(a).multipleRulesLikely=true should be credited, not penalized, for not fully decomposing it.",
  },
  {
    sectionRef: "6.05",
    heading: "Burdensome Agreements",
    covenantBearing: true,
    families: [],
    otherFamilyDescription: "Restricts contractual restrictions on Restricted Subsidiaries' ability to pay dividends/transfer assets/make loans to the Borrower - a real, common covenant (sometimes called a 'negative pledge on negative covenants') with no single clean CovenantFamily fit; closest real analogs are QUALITATIVE_NEGATIVE_COVENANTS or a composite of LIENS/RESTRICTED_PAYMENTS/INDEBTEDNESS restrictions-on-restrictions. A correct discovery system should surface this via otherFamilyDescription rather than forcing one family (task §6/§18 test 6: non-obvious heading).",
    expectedOperativeRefs: ["6.05(a)"],
    expectedBasketExceptionRefs: [],
  },
  {
    sectionRef: "6.06",
    heading: "Investments",
    covenantBearing: true,
    families: ["INVESTMENTS"],
    expectedOperativeRefs: ["6.06(a)", "6.06(b)", "6.06(c)", "6.06(d)", "6.06(e)", "6.06(f)", "6.06(g)", "6.06(h)", "6.06(i)", "6.06(j)", "6.06(k)", "6.06(l)", "6.06(m)", "6.06(n)", "6.06(o)", "6.06(p)", "6.06(q)", "6.06(r)", "6.06(s)", "6.06(t)", "6.06(u)", "6.06(v)", "6.06(w)", "6.06(y)", "6.06(z)", "6.06(aa)", "6.06(bb)", "6.06(cc)", "6.06(dd)", "6.06(ee)", "6.06(ff)", "6.06(hh)", "6.06(ii)", "6.06(jj)", "6.06(kk)", "6.06(ll)", "6.06(mm)", "6.06(nn)"],
    expectedBasketExceptionRefs: ["6.06(a)", "6.06(b)", "6.06(c)", "6.06(d)", "6.06(e)", "6.06(f)", "6.06(g)", "6.06(h)", "6.06(i)", "6.06(j)", "6.06(k)", "6.06(l)", "6.06(m)", "6.06(n)", "6.06(o)", "6.06(p)", "6.06(q)", "6.06(r)", "6.06(s)", "6.06(t)", "6.06(u)", "6.06(v)", "6.06(w)", "6.06(y)", "6.06(z)", "6.06(aa)", "6.06(bb)", "6.06(cc)", "6.06(dd)", "6.06(ee)", "6.06(ff)", "6.06(hh)", "6.06(ii)", "6.06(jj)", "6.06(kk)", "6.06(ll)", "6.06(mm)", "6.06(nn)"],
    notes: "6.06(x)/(gg) are [Reserved] - excluded.",
  },
  {
    sectionRef: "6.07",
    heading: "Fundamental Changes; Disposition of Assets",
    covenantBearing: true,
    families: ["FUNDAMENTAL_CHANGES", "ASSET_SALES", "DISPOSITIONS"],
    expectedOperativeRefs: ["6.07(a)", "6.07(b)", "6.07(c)", "6.07(d)", "6.07(e)", "6.07(f)", "6.07(g)", "6.07(h)", "6.07(i)", "6.07(j)", "6.07(k)", "6.07(l)", "6.07(m)", "6.07(n)", "6.07(o)", "6.07(q)", "6.07(r)", "6.07(s)", "6.07(t)", "6.07(u)", "6.07(v)", "6.07(w)", "6.07(x)", "6.07(y)", "6.07(z)", "6.07(aa)", "6.07(bb)", "6.07(cc)", "6.07(ee)", "6.07(ii)", "6.07(jj)", "6.07(kk)"],
    expectedBasketExceptionRefs: ["6.07(b)", "6.07(c)", "6.07(d)", "6.07(e)", "6.07(f)", "6.07(g)", "6.07(h)", "6.07(i)", "6.07(j)", "6.07(k)", "6.07(l)", "6.07(m)", "6.07(n)", "6.07(o)", "6.07(q)", "6.07(r)", "6.07(s)", "6.07(t)", "6.07(u)", "6.07(v)", "6.07(w)", "6.07(x)", "6.07(y)", "6.07(z)", "6.07(aa)", "6.07(bb)", "6.07(cc)", "6.07(ee)", "6.07(ii)", "6.07(jj)", "6.07(kk)"],
    notes: "Genuine two-family section (task §18 test 12): 6.07(a) is a FUNDAMENTAL_CHANGES (merger/consolidation) permission; 6.07(b) onward are ASSET_SALES/DISPOSITIONS baskets. 6.07(p)/(dd)/(ff)/(gg)/(hh) are [Reserved] - excluded.",
  },
  {
    sectionRef: "6.08",
    heading: "Amendments of or Waivers with Respect to Restricted Debt",
    covenantBearing: true,
    families: ["AMENDMENT_WAIVER_CONSENT"],
    expectedOperativeRefs: ["6.08"],
    expectedBasketExceptionRefs: [],
    notes: "Single unified prohibition, no lettered children - the section itself is the one operative rule.",
  },
  {
    sectionRef: "6.09",
    heading: "Holdings",
    covenantBearing: true,
    families: ["LIENS", "FUNDAMENTAL_CHANGES", "ENTITY_SCOPE_RESTRICTIONS"],
    expectedOperativeRefs: ["6.09(a)", "6.09(b)"],
    expectedBasketExceptionRefs: [],
    notes: "A second, real two-family case (task §18 test 12/13): 6.09(a) is a Holdings-specific Lien restriction, 6.09(b) a Holdings-specific merger/disposition restriction - both scoped by the entity-restriction concept (ENTITY_SCOPE_RESTRICTIONS) but each also genuinely a LIENS/FUNDAMENTAL_CHANGES rule respectively (task §18 test 13: one rule relevant to multiple families).",
  },
  {
    sectionRef: "6.10",
    heading: "Financial Covenants",
    covenantBearing: true,
    families: ["FINANCIAL_COVENANTS"],
    expectedOperativeRefs: ["6.10(a)", "6.10(b)", "6.10(c)"],
    expectedBasketExceptionRefs: [],
    notes: "6.10(a)/(b) are ratio-based financial tests (FINANCIAL_TEST role); 6.10(c) is a CURE mechanism, not a basket.",
  },
];

/** Total independently operative rules expected across the whole document (sum of expectedOperativeRefs, deduplicated by the fixed section list above). */
export const FWRG_TOTAL_EXPECTED_OPERATIVE_RULES = FWRG_EXPECTED_INVENTORY.reduce((n, s) => n + s.expectedOperativeRefs.length, 0);
export const FWRG_TOTAL_EXPECTED_BASKETS_EXCEPTIONS = FWRG_EXPECTED_INVENTORY.reduce((n, s) => n + s.expectedBasketExceptionRefs.length, 0);
export const FWRG_TOTAL_EXPECTED_COVENANT_SECTIONS = FWRG_EXPECTED_INVENTORY.filter((s) => s.covenantBearing).length;
