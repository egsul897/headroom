/**
 * PHASE 3 / 6.01 REQUIRED-DEPENDENCY PRECISION AUDIT §12 - GENERIC ANTI-OVERFIT.
 *
 * Every case runs on a synthetic agreement whose names, section numbers and amounts are inputs (see
 * dd-synthetic-agreement.ts). The expectation: only semantically justified dependencies enter the REQUIRED closure,
 * and every non-delivery is an explicit, distinct state - never "delivered".
 */
import { describe, expect, it } from "vitest";
import { BASE_SHAPE, antiOverfitExpectations, depsOf, deliveredKeys, planSynthetic, termKey, sectionKey, type SyntheticAgreementShape } from "./dd-synthetic-agreement";
import { findTermOccurrences, definedTermsOccurringIn, grammaticalNumberSpellings } from "../../lib/contract-model/compiler/semantic/required-dependencies";
import { buildSyntheticAgreement } from "./dd-synthetic-agreement";

const FALSE_EDGES = ["Hypothetical Reserve Tranche", "Notional Yield Basket"];
const withFalseEdges: SyntheticAgreementShape = { ...BASE_SHAPE, extraEdges: FALSE_EDGES };

describe("§12 anti-overfit - only semantically justified dependencies enter the required closure", () => {
  it("A/C/D/F/G/H/I - real, inflected, forwarding, cross-referenced and deep dependencies are delivered; incidental ones are not", () => {
    const plan = planSynthetic(withFalseEdges);
    const e = antiOverfitExpectations(withFalseEdges, plan);
    for (const [k, v] of Object.entries(e)) expect(v, k).toBe(true);
  });

  it("L - the operands of an ARITHMETIC definition are required at every threshold, however little of the body they cover; a padded prose definition is not expanded", () => {
    const shape: SyntheticAgreementShape = { ...BASE_SHAPE, arithmeticTerm: { term: "Composite Availability Amount", operands: ["Primary Tranche Component", "Secondary Tranche Component", "Tertiary Tranche Component"] } };
    for (const t of [0.25, 0.4, 0.5, 0.6, 0.75]) {
      const plan = planSynthetic(shape, {}, { compositionalCoverageThreshold: t });
      const e = antiOverfitExpectations(shape, plan);
      expect(e.L_arithmeticOperandsRequiredWhateverTheCoverage, `threshold ${t}`).toBe(true);
      expect(e.I_incidentalTermNotPulledIn, `threshold ${t}: the incidental mention inside a prose definition must still not expand`).toBe(true);
      for (const o of shape.arithmeticTerm!.operands) expect(depsOf(plan).find((d) => d.key === termKey(o))?.viaKey, `${o} via the arithmetic parent at ${t}`).toBe(termKey(shape.arithmeticTerm!.term));
    }
  });

  it("B - an ordinary capitalised phrase that is never defined is an INTERNAL limitation, never delivery and never a planning failure", () => {
    const plan = planSynthetic(BASE_SHAPE);
    const d = depsOf(plan).find((x) => x.key === termKey(BASE_SHAPE.undefinedCapitalisedPhrase))!;
    expect(d.disposition).toBe("INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED");
    expect(d.fullText).toBe("");
    expect(deliveredKeys(plan).has(d.key)).toBe(false);
    const shard = plan.shards.find((s) => s.requiredDependencies.includes(d))!;
    expect(shard.dependencyCertificate.certificateStatus).toBe("CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION");
    expect(shard.dependencyCertificate.executable).toBe(true);
    expect(shard.dependencyCertificate.contextComplete).toBe(false);
  });

  it("E - a false Pass-A referenced-term edge is excluded and cannot create downstream context", () => {
    const plan = planSynthetic(withFalseEdges);
    for (const t of FALSE_EDGES) {
      const d = depsOf(plan).find((x) => x.key === termKey(t))!;
      expect(d.disposition).toBe("NON_REQUIRED_EDGE");
      expect(d.resolution?.method).toBe("TERM_ABSENT_FROM_SOURCE");
    }
    // the exclusions are audit information only: not counted as required, not limitations, not failures
    const shard = plan.shards[0]!;
    expect(shard.dependencyCertificate.nonRequiredEdgesExcluded).toBe(FALSE_EDGES.length);
    expect(shard.dependencyCertificate.requiredDependenciesTotal).toBe(shard.requiredDependencies.length - FALSE_EDGES.length);
    // and the required context is byte-identical with or without the false edges: a hallucinated edge adds nothing
    const clean = planSynthetic(BASE_SHAPE);
    const chars = (p: typeof plan) => p.shards[0]!.context.filter((e) => e.tier === "REQUIRED").reduce((a, e) => a + e.chars, 0);
    expect(chars(plan)).toBe(chars(clean));
  });

  it("E2 - a lower-case ordinary word cited as a term is excluded as ORDINARY_LEGAL_WORD", () => {
    const plan = planSynthetic({ ...BASE_SHAPE, extraEdges: ["incurrence", "obligation"] });
    for (const t of ["incurrence", "obligation"]) expect(depsOf(plan).find((x) => x.key === termKey(t))?.resolution?.method).toBe("ORDINARY_LEGAL_WORD");
  });

  it("J - an ambiguous section reference preserves its candidates and is never guessed", () => {
    const plan = planSynthetic({ ...BASE_SHAPE, duplicateCrossRefParent: true });
    const d = depsOf(plan).find((x) => x.key === sectionKey(BASE_SHAPE.crossRefSection))!;
    expect(d.disposition).toBe("AMBIGUOUS_REQUIRED_DEPENDENCY");
    expect(d.candidates!.length).toBeGreaterThanOrEqual(2);
    expect(d.fullText).toBe("");
    expect(deliveredKeys(plan).has(d.key)).toBe(false);
  });

  it("K - externality is proven from the source's own '(as defined in ...)' pointer and package identity, not from the term's name", () => {
    const plan = planSynthetic({ ...BASE_SHAPE, externalTerm: { term: "Availability Block", agreement: "Working Capital Facility Agreement" } });
    const d = depsOf(plan).find((x) => x.key === termKey("Availability Block"))!;
    expect(d.disposition).toBe("EXTERNAL_REQUIRED_DEPENDENCY");
    expect(d.resolution?.method).toBe("EXTERNAL_BY_SOURCE_DECLARATION");
    // a term whose NAME merely sounds like an agreement is NOT external when the source does not say so
    const plan2 = planSynthetic({ ...BASE_SHAPE, extraEdges: ["Intercreditor Agreement Amount"] });
    expect(depsOf(plan2).find((x) => x.key === termKey("Intercreditor Agreement Amount"))?.disposition).not.toBe("EXTERNAL_REQUIRED_DEPENDENCY");
  });

  it("names are irrelevant: the same expectations hold under renamed terms, renumbered sections and different amounts", () => {
    const renamed: SyntheticAgreementShape = {
      ...BASE_SHAPE, capTerm: "Permitted Incurrence Envelope", components: ["Base Envelope Tranche", "Recycled Envelope Tranche", "Optional Envelope Tranche"], deepTerm: "Eligible Recycling Proceeds",
      crossRefSection: "7.04(c)", forwardingSection: "5.12(b)", forwardingTerm: "Certified Reference Figure", singularOnlyTerm: "Qualified Assignee", pluralOnlyTerm: "Sponsor Affiliates",
      undefinedCapitalisedPhrase: "Subordinated Priority Footing", incidentalTerm: "Closing Deliverables Index", operativeSection: "6.14", amounts: [3_250_000, 999_000_000, 12_500], extraEdges: ["Imaginary Carve-Out Bucket"],
    };
    const e = antiOverfitExpectations(renamed, planSynthetic(renamed));
    for (const [k, v] of Object.entries(e)) expect(v, k).toBe(true);
  });
});

describe("§9 definition-occurrence precision", () => {
  it("never matches a defined term inside an unrelated longer word, and matches at word boundaries only", () => {
    const text = "the Controlled affiliate exercised Control over Controlling persons; a Person and two Persons; Cashless settlement of Cash";
    expect(findTermOccurrences(text, "Control").map((h) => h.spelling)).toEqual(["Control"]);
    expect(findTermOccurrences(text, "Person").map((h) => h.spelling)).toEqual(["Person", "Persons"]);
    expect(findTermOccurrences(text, "Cash").map((h) => h.spelling)).toEqual(["Cash"]);
  });
  it("grammatical-number spellings are deterministic suffix rules, applied to the last word only, never stem guessing", () => {
    expect(grammaticalNumberSpellings("Restricted Party")).toContain("Restricted Parties");
    expect(grammaticalNumberSpellings("Sale and Lease-Back Transaction")).toContain("Sale and Lease-Back Transactions");
    expect(grammaticalNumberSpellings("Investments")).toContain("Investment");
    expect(grammaticalNumberSpellings("Business")).not.toContain("Busines");
    expect(grammaticalNumberSpellings("Refinanced")).not.toContain("Refinance");
  });
  it("longest match wins and a shorter term is never credited with an occurrence inside a longer term's occurrence", () => {
    const built = buildSyntheticAgreement(BASE_SHAPE);
    const found = definedTermsOccurringIn(`the ${BASE_SHAPE.capTerm} and nothing else`, built.index, "syn-doc").map((d) => d.exactTerm);
    expect(found).toEqual([BASE_SHAPE.capTerm]);
  });
});
