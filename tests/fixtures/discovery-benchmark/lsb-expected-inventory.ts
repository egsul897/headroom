/**
 * Phase 2B - independently authored expected covenant-discovery inventory
 * for the LSB 2023 ABL Credit Agreement regression fixture (task §14/§17).
 * Same adjudication status and V1 scope decision as fwrg-expected-inventory.ts
 * (see that file's header) - authored by direct reading of the real source
 * text before any Phase 2B semantic discovery call was run against it.
 */
import type { CovenantFamily } from "@prisma/client";
import type { ExpectedSection } from "./fwrg-expected-inventory";

export const LSB_EXPECTED_INVENTORY: ExpectedSection[] = [
  {
    sectionRef: "6.01",
    heading: "Indebtedness",
    covenantBearing: true,
    families: ["INDEBTEDNESS"] as CovenantFamily[],
    expectedOperativeRefs: ["6.01(a)", "6.01(b)", "6.01(c)", "6.01(d)", "6.01(f)", "6.01(g)", "6.01(i)", "6.01(j)", "6.01(l)", "6.01(m)", "6.01(n)", "6.01(p)", "6.01(q)", "6.01(r)", "6.01(s)", "6.01(t)"],
    expectedBasketExceptionRefs: ["6.01(a)", "6.01(b)", "6.01(c)", "6.01(d)", "6.01(f)", "6.01(g)", "6.01(i)", "6.01(j)", "6.01(l)", "6.01(m)", "6.01(n)", "6.01(p)", "6.01(q)", "6.01(r)", "6.01(s)", "6.01(t)"],
    notes: "6.01(e)/(h)/(k)/(o) are [Reserved] - excluded. 6.01(i) is the specific case Phase 1A/1B's own evaluator hierarchy fix and executability audit centered on (greater of $70,000,000 and 5.5% of total consolidated assets).",
  },
  {
    sectionRef: "6.02",
    heading: "Liens",
    covenantBearing: true,
    families: ["LIENS"] as CovenantFamily[],
    expectedOperativeRefs: ["6.02"],
    expectedBasketExceptionRefs: [],
    notes: "Single unified prohibition ('...except for Permitted Liens'), no lettered children - the section itself is the one operative rule. The real exceptions live inside the separately-defined term 'Permitted Liens', which this V1 discovery phase correctly does not need to resolve (task §11) - it should mark definedTermDependencyLikely=true instead.",
  },
  {
    sectionRef: "6.03",
    heading: "Restrictions on Fundamental Changes",
    covenantBearing: true,
    families: ["FUNDAMENTAL_CHANGES"] as CovenantFamily[],
    expectedOperativeRefs: ["6.03(a)", "6.03(b)", "6.03(c)"],
    expectedBasketExceptionRefs: [],
    notes: "Three distinct prohibited-transaction-types, not baskets/exceptions off one another.",
  },
  {
    sectionRef: "6.04",
    heading: "Disposal of Assets",
    covenantBearing: true,
    families: ["ASSET_SALES", "DISPOSITIONS"] as CovenantFamily[],
    expectedOperativeRefs: ["6.04(a)", "6.04(b)", "6.04(c)", "6.04(d)", "6.04(e)", "6.04(f)", "6.04(g)", "6.04(h)", "6.04(i)"],
    expectedBasketExceptionRefs: ["6.04(a)", "6.04(b)", "6.04(c)", "6.04(d)", "6.04(e)", "6.04(f)", "6.04(g)", "6.04(h)", "6.04(i)"],
    notes: "6.04(a) is the specific case Phase 1A's greater-of/non-EBITDA-metric audit centered on (greater of $10,000,000 and 1.0% of total consolidated assets); 6.04(b) delegates operative content to the Secured Notes Documents entirely outside this filing - a real cross-reference-dependent permission (task §18 test 14).",
  },
  {
    sectionRef: "6.05",
    heading: "[Reserved]",
    covenantBearing: false,
    families: [],
    expectedOperativeRefs: [],
    expectedBasketExceptionRefs: [],
  },
  {
    sectionRef: "6.06",
    heading: "[Reserved]",
    covenantBearing: false,
    families: [],
    expectedOperativeRefs: [],
    expectedBasketExceptionRefs: [],
  },
  {
    sectionRef: "6.07",
    heading: "Nature of Business",
    covenantBearing: true,
    families: [],
    otherFamilyDescription: "Business/line-of-business restriction - no clean CovenantFamily fit (closest generic analog: QUALITATIVE_NEGATIVE_COVENANTS).",
    expectedOperativeRefs: ["6.07"],
    expectedBasketExceptionRefs: [],
    notes: "Non-obvious/false-positive-heavy case (task §18 tests 6/16): reads like a qualitative restriction with a built-in proviso, easily either over-flagged as boilerplate or missed as immaterial - it is genuinely a material, if qualitative, covenant restricting business scope.",
  },
  {
    sectionRef: "6.08",
    heading: "Payments of Indebtedness; Modifications of Subordinated Indebtedness",
    covenantBearing: true,
    families: ["INDEBTEDNESS"] as CovenantFamily[],
    expectedOperativeRefs: ["6.08(a)", "6.08(b)"],
    expectedBasketExceptionRefs: [],
    notes: "The section this entire session's Phase 1A/1B evaluator-hierarchy work centered on - the real $500,000 fixed basket lives at 6.08(a)(vi), a CLAUSE-level child of 6.08(a) not separately required at this V1's SUBSECTION granularity, but 6.08(a).multipleRulesLikely=true should be flagged by a correct discovery system given it bundles at least 6 further internal payment carve-outs.",
  },
  {
    sectionRef: "6.11",
    heading: "Restricted Payments",
    covenantBearing: true,
    families: ["RESTRICTED_PAYMENTS"] as CovenantFamily[],
    expectedOperativeRefs: ["6.11(a)", "6.11(b)", "6.11(c)", "6.11(d)"],
    expectedBasketExceptionRefs: ["6.11(a)", "6.11(c)", "6.11(d)"],
    notes: "6.11(b) is a cross-reference to Section 6.03 rather than its own basket (task §18 test 14 analog) - correctly discoverable but should be flagged as delegating, not an independent economic basket in its own right.",
  },
  {
    sectionRef: "6.13",
    heading: "Investments",
    covenantBearing: true,
    families: ["INVESTMENTS"] as CovenantFamily[],
    expectedOperativeRefs: ["6.13(a)", "6.13(b)", "6.13(c)", "6.13(d)", "6.13(e)", "6.13(f)", "6.13(g)", "6.13(h)", "6.13(i)", "6.13(j)", "6.13(k)", "6.13(l)"],
    expectedBasketExceptionRefs: ["6.13(a)", "6.13(b)", "6.13(c)", "6.13(d)", "6.13(e)", "6.13(g)", "6.13(h)", "6.13(i)", "6.13(j)", "6.13(k)", "6.13(l)"],
    notes: "6.13(f) is a cross-reference to Section 6.01 rather than its own basket.",
  },
  {
    sectionRef: "6.14",
    heading: "Transactions With Affiliates",
    covenantBearing: true,
    families: ["AFFILIATE_TRANSACTIONS"] as CovenantFamily[],
    expectedOperativeRefs: ["6.14(a)", "6.14(b)", "6.14(c)", "6.14(d)"],
    expectedBasketExceptionRefs: ["6.14(a)", "6.14(b)", "6.14(c)", "6.14(d)"],
    notes: "KNOWN PHASE 2A LIMITATION (carried forward per task §21): the real source text separates these four exceptions with commas, not semicolons ('...except for transactions (a) set forth on Schedule 6.14, (b) transactions not exceeding $5,000,000..., and (c) transactions that are..., and (d) transactions that are otherwise permitted...'). Phase 2A's structural parser deliberately excludes a comma-preceded marker to avoid a real, larger false-positive risk (citation lists like 'clauses (a), (b), (c) of Section X'), so only 6.14(a) is structurally addressable as its own node - (b)/(c)/(d) exist only within 6.14(a)'s own OWN-text span as parsed. This is EXPECTED to produce a genuine recall gap at the sub-reference level for a discovery system that can only address structurally-resolved nodes, and is diagnosed explicitly in the Phase 2B final report rather than silently under-counted.",
  },
  {
    sectionRef: "6.15",
    heading: "Financial Covenant",
    covenantBearing: true,
    families: ["FINANCIAL_COVENANTS"] as CovenantFamily[],
    expectedOperativeRefs: ["6.15"],
    expectedBasketExceptionRefs: [],
    notes: "A springing financial covenant (task §18 test 5: covenant with ratio language) - conditioned on an 'Availability Block Removal Period' trigger, itself worth flagging as a TRIGGER-dependent FINANCIAL_TEST.",
  },
];

export const LSB_TOTAL_EXPECTED_OPERATIVE_RULES = LSB_EXPECTED_INVENTORY.reduce((n, s) => n + s.expectedOperativeRefs.length, 0);
export const LSB_TOTAL_EXPECTED_BASKETS_EXCEPTIONS = LSB_EXPECTED_INVENTORY.reduce((n, s) => n + s.expectedBasketExceptionRefs.length, 0);
export const LSB_TOTAL_EXPECTED_COVENANT_SECTIONS = LSB_EXPECTED_INVENTORY.filter((s) => s.covenantBearing).length;

/** Refs that exist in this benchmark's economic enumeration but are NOT addressable as their own structural node today (the 6.14 comma-list gap) - a discovery system cannot be faulted for missing these at the node level, but the gap itself must be reported (task §21/§28), never silently absorbed into the recall denominator as if it were a normal miss. */
export const LSB_STRUCTURALLY_UNADDRESSABLE_REFS = ["6.14(b)", "6.14(c)", "6.14(d)"];
