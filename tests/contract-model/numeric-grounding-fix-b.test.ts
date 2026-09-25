/**
 * FIX B - numeric grounding for material numeric assertions carried in FREE-TEXT IR fields.
 *
 * Root cause under test (docs/phase-3-unsupported-numeric-forensics + docs/phase-3-numeric-
 * grounding/02-red-baseline.json): the verifier reconciled STRUCTURED numeric nodes against the
 * source and never looked at a figure the compiler stated in prose, so a rule asserting "100%" -
 * a figure present in no anchor, no retrieved context, no prompt and no few-shot - was blessed
 * VERIFIED_WITH_NON_MATERIAL_FINDINGS while its own representationSufficiency said COMPLETE.
 *
 * Every fixture is synthetic (numeric-grounding-fixtures.ts). Nothing here calls a model.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { collectNumericAssertions, extractNumericAssertions, groundNumericAssertions, IR_FREE_TEXT_FIELD_AUDIT } from "../../lib/contract-model/compiler/semantic-verification/numeric-assertion";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { NumericAssertionEvidenceText, SemanticVerificationResult, VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import {
  caseA_unsupportedProsePercentage,
  caseB_supportedProsePercentage,
  caseC_structuredNumericControl,
  caseD_supportedContextControl,
  caseE_parentEconomicsInContext,
  caseF_fabricatedExcerpt,
  caseG_citationNumbering,
  condition,
  ngRule,
} from "./numeric-grounding-fixtures";

function stub(response: unknown): StageCaller {
  return { providerName: "test", model: "test", isSynthetic: false, async call<T>(schema: ZodType<T>): Promise<T> { return schema.parse(response); }, lastTelemetry: () => null };
}

const verify = (input: VerificationInput): Promise<SemanticVerificationResult> =>
  verifyCompiledCandidate(input, {
    reviewCaller: stub({ findings: [], overallNotes: [] }),
    conditionSuspicionCaller: stub({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }),
  });

const groundingsFor = (r: SemanticVerificationResult) => r.numericAssertions?.groundings ?? [];
const unsupportedNumericFindings = (r: SemanticVerificationResult) => r.findings.filter((f) => f.findingType === "UNSUPPORTED_NUMERIC_ASSERTION");
const VERIFIED_STATUSES = ["VERIFIED_NO_MATERIAL_GAP_FOUND", "VERIFIED_WITH_NON_MATERIAL_FINDINGS"];

const evidence = (text: string, scope: "OPERATIVE" | "CONTEXT" = "OPERATIVE"): NumericAssertionEvidenceText[] => [{ scope, evidenceId: scope, label: "test evidence", text }];

/** The smallest IR that carries one free-text assertion, for the pure-unit tests below. */
const oneAssertion = (description: string) => collectNumericAssertions("unit", [ngRule({ conditions: [condition(description)] })], []);

describe("Fix B §4 - the free-text field audit", () => {
  it("classifies every audited field and inventories ONLY material-assertion and source-quotation fields", () => {
    expect(IR_FREE_TEXT_FIELD_AUDIT.length).toBeGreaterThanOrEqual(20);
    for (const entry of IR_FREE_TEXT_FIELD_AUDIT) {
      expect(entry.rationale.length).toBeGreaterThan(10);
      expect(entry.inventoried).toBe(entry.fieldClass === "MATERIAL_ASSERTION_FIELD" || entry.fieldClass === "SOURCE_QUOTATION_FIELD");
    }
    for (const required of ["IDENTIFIER_OR_CITATION_FIELD", "DIAGNOSTIC_FIELD", "NON_SEMANTIC_FIELD", "MATERIAL_ASSERTION_FIELD", "SOURCE_QUOTATION_FIELD"]) {
      expect(IR_FREE_TEXT_FIELD_AUDIT.some((e) => e.fieldClass === required)).toBe(true);
    }
  });

  it("never reads a numeric assertion out of a citation, an identifier, or the compiler's own diagnostics", () => {
    const rule = ngRule({
      sufficiencyReasons: ["could not represent the 100% threshold stated in the source"],
      provenance: { documentId: "ng-doc", sourceNodeKey: "ng-doc::7.2", sourceCitation: "§7.2(f) and Section 6.01(b)(iii)", excerpt: null },
      unresolvedDependencies: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRef: "Section 6.01(b)(iii)", description: "shares capacity with another clause", reason: "target outside this compilation unit" }],
    });
    const inventory = collectNumericAssertions("unit", [rule], []);
    expect(inventory.items).toHaveLength(0);
    expect(inventory.fieldsWalked).toBeGreaterThan(0);
  });

  it("does not re-inventory a STRUCTURED numeric literal as a free-text assertion (no double reporting)", () => {
    const rule = ngRule({ capacityExpression: { exprId: "x1", kind: "MONEY", type: "MONEY", amount: 150_000_000, currency: "USD" } as never });
    expect(collectNumericAssertions("unit", [rule], []).items).toHaveLength(0);
  });
});

describe("Fix B §5 - the numeric extractor", () => {
  it.each([
    ["$150,000,000", "CURRENCY_AMOUNT", 150_000_000],
    ["$150.0 million", "CURRENCY_AMOUNT", 150_000_000],
    ["150 million", "CURRENCY_AMOUNT", 150_000_000],
    ["720 million dollars", "CURRENCY_AMOUNT", 720_000_000],
    ["10%", "PERCENTAGE", 0.1],
    ["10.0%", "PERCENTAGE", 0.1],
    ["10 percent", "PERCENTAGE", 0.1],
    ["100%", "PERCENTAGE", 1],
    ["2.00x", "RATIO", 2],
    ["2.00:1.00", "RATIO", 2],
    ["4.50 to 1.00", "RATIO", 4.5],
    ["30 days", "QUALIFIED_QUANTITY", 30],
    ["5 business days", "QUALIFIED_QUANTITY", 5],
    ["2 Subsidiaries", "QUALIFIED_QUANTITY", 2],
    ["four consecutive fiscal quarters", "QUALIFIED_QUANTITY", undefined],
  ])("reads %s", (text, kind, value) => {
    const hits = extractNumericAssertions(`the threshold is ${text} for this purpose`);
    if (value === undefined) {
      // spelled-out figures are EVIDENCE-side only - never read as an assertion out of IR prose.
      expect(hits).toHaveLength(0);
      return;
    }
    expect(hits).toHaveLength(1);
    expect(hits[0]!.kind).toBe(kind);
    expect(hits[0]!.normalizedValue).toBeCloseTo(value as number, 9);
  });

  it("never treats a bare, unqualified figure as a material numeric assertion", () => {
    for (const text of ["Section 7.2(f)", "Article 10.1", "clause (iii) of Section 6.01(b)", "December 31, 2029", "the 2029 Notes", "ir-rule:1084b12"]) {
      expect(extractNumericAssertions(text)).toHaveLength(0);
    }
  });

  it("preserves the original text, the canonical value, the unit and the local span", () => {
    const [hit] = extractNumericAssertions("up to 10.0% of Consolidated Total Assets");
    expect(hit).toMatchObject({ rawText: "10.0%", normalizedValue: 0.1, unit: "%" });
    expect(hit!.charStart).toBe(6);
    expect(hit!.charEnd).toBe(11);
  });

  it("withholds a magnitude it cannot read safely rather than guessing one", () => {
    const grounding = groundNumericAssertions(oneAssertion("a basket of $720 mn"), evidence("a basket of $720,000,000"));
    expect(grounding[0]!.status).toBe("AMBIGUOUS");
  });
});

describe("Fix B §6 - normalized equivalence, and the inferences it must NOT make", () => {
  it.each([
    ["10%", "10.0%"],
    ["$150 million", "$150,000,000"],
    ["2.0x", "2.00x"],
    ["30 days", "thirty days"],
  ])("grounds %s against %s", (asserted, inSource) => {
    const [g] = groundNumericAssertions(oneAssertion(`limited to ${asserted}`), evidence(`limited to ${inSource}`));
    expect(["GROUNDED_OPERATIVE", "NORMALIZED_EQUIVALENT"]).toContain(g!.status);
    expect(g!.groundedIn).toBe("OPERATIVE");
  });

  it.each(["all of the obligations", "the entire amount", "fully guaranteed"])("never infers 100%% from %s", (sourceText) => {
    const [g] = groundNumericAssertions(oneAssertion("covers up to 100% of the obligations"), evidence(sourceText));
    expect(g!.status).toBe("UNGROUNDED");
  });

  it("reads the parenthetical-numeral form legal drafting actually uses - 'within ninety (90) days' grounds an asserted '90 days' (a false-positive class the \u00a715 scan surfaced before this fix shipped)", () => {
    for (const sourceText of ["within ninety (90) days after each fiscal year end", "within 90 days after each fiscal year end", "within (90) days after each fiscal year end"]) {
      const [g] = groundNumericAssertions(oneAssertion("Within 90 days after each fiscal year end"), evidence(sourceText));
      expect(["GROUNDED_OPERATIVE", "NORMALIZED_EQUIVALENT"], sourceText).toContain(g!.status);
    }
  });

  it("never matches across incompatible types or units", () => {
    expect(groundNumericAssertions(oneAssertion("a ratio of 0.1x"), evidence("10%"))[0]!.status).toBe("UNGROUNDED");
    expect(groundNumericAssertions(oneAssertion("within 30 days"), evidence("within 30 months"))[0]!.status).toBe("UNGROUNDED");
    expect(groundNumericAssertions(oneAssertion("a basket of $5,000,000"), evidence("a basket of €5,000,000"))[0]!.status).toBe("UNGROUNDED");
  });
});

describe("Fix B §10 - the §7.2(f) synthetic reproduction", () => {
  it("detects the assertion, finds no supporting source figure, emits an IR_ONLY finding naming the exact field path, and forces review", async () => {
    const result = await verify(caseA_unsupportedProsePercentage());

    const grounding = groundingsFor(result).find((g) => g.assertion.rawText === "100%");
    expect(grounding?.status).toBe("UNGROUNDED");
    expect(grounding?.assertion.fieldPath).toBe("rules[0].conditions[0].description");
    expect(grounding?.assertion.normalizedValue).toBe(1);

    const reconciliationItem = result.reconciliation.items.find((i) => i.numericGrounding?.assertion.rawText === "100%");
    expect(reconciliationItem?.classification).toBe("IR_ONLY");

    const findings = unsupportedNumericFindings(result);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.irPath).toBe("rules[0].conditions[0].description");
    expect(findings[0]!.sourceCitation).toContain("7.2(f)");
    expect(VERIFIED_STATUSES).not.toContain(result.status);
  });

  it("a representationSufficiency of COMPLETE cannot hide the defect (§9)", async () => {
    const input = caseA_unsupportedProsePercentage();
    expect(input.compilationResult.rules[0]!.sufficiency).toBe("COMPLETE");
    const result = await verify(input);
    expect(unsupportedNumericFindings(result)[0]!.severity).toBe("MATERIAL");
    expect(VERIFIED_STATUSES).not.toContain(result.status);
  });

  it("never deletes or mutates the IR value (§8) - the compiler's output is returned untouched", async () => {
    const input = caseA_unsupportedProsePercentage();
    const before = JSON.stringify(input.compilationResult.rules);
    await verify(input);
    expect(JSON.stringify(input.compilationResult.rules)).toBe(before);
    expect(input.compilationResult.rules[0]!.conditions[0]!.description).toContain("100%");
  });
});

describe("Fix B - the controls that must NOT newly fail", () => {
  it("§3B: the same percentage, stated in the candidate's own anchor, is GROUNDED_OPERATIVE with no unsupported-numeric finding", async () => {
    const result = await verify(caseB_supportedProsePercentage());
    const grounding = groundingsFor(result).find((g) => g.assertion.rawText === "100%");
    expect(grounding?.status).toBe("GROUNDED_OPERATIVE");
    expect(unsupportedNumericFindings(result)).toHaveLength(0);
  });

  it("§3C: the STRUCTURED path is untouched - an unsupported PERCENT literal still produces IR_ONLY / UNSUPPORTED_IR_ADDITION, exactly once", async () => {
    const result = await verify(caseC_structuredNumericControl());
    const structured = result.reconciliation.items.filter((i) => i.classification === "IR_ONLY" && !i.numericGrounding);
    expect(structured).toHaveLength(1);
    expect(structured[0]!.irItems[0]!.numericValue).toBe(1);
    expect(result.findings.filter((f) => f.findingType === "UNSUPPORTED_IR_ADDITION")).toHaveLength(1);
    expect(unsupportedNumericFindings(result)).toHaveLength(0);
  });

  it("§11: figures absent from the anchor but present in an authenticated DEFINITION stay grounded (the 7.1(d) shape - Fix B must not reject legitimate context-supported economics)", async () => {
    const result = await verify(caseD_supportedContextControl());
    // R2: still grounded, and now through a named relation to the definition rather than merely
    // because the figure occurred in authenticated text somewhere.
    const statuses = groundingsFor(result).map((g) => `${g.assertion.rawText}=${g.status}/${g.groundedIn}`).sort();
    expect(statuses).toEqual(["$800,000,000=GROUNDED_TOOL_EVIDENCE/CONTEXT", "2.25%=GROUNDED_TOOL_EVIDENCE/CONTEXT"]);
    expect(groundingsFor(result).every((g) => (g.relation ?? "").includes("Convertible Notes"))).toBe(true);
    expect(unsupportedNumericFindings(result)).toHaveLength(0);
  });

  it("\u00a712: the closed 7.2(k)(i) shape - numeric grounding says GROUNDED_TOOL_EVIDENCE, and records that the support came from CONTEXT rather than the candidate's own anchor, so grounding and source OWNERSHIP stay independently inspectable", async () => {
    const result = await verify(caseE_parentEconomicsInContext());
    const groundings = groundingsFor(result);
    expect(groundings.map((g) => g.assertion.rawText).sort()).toEqual(["$150,000,000", "10.0%"]);
    for (const g of groundings) {
      // R2: GROUNDED_TOOL_EVIDENCE - the parent section is authenticated retrieved source, and the
      // child clause's own citation is a sub-clause of it, which is what establishes the relation.
      expect(g.status).toBe("GROUNDED_TOOL_EVIDENCE");
      expect(g.groundedIn).toBe("CONTEXT");
      expect(g.matchedEvidenceId).not.toBeNull();
      expect(g.relation).toBeTruthy();
    }
    expect(unsupportedNumericFindings(result)).toHaveLength(0);
    // Grounding is NOT an ownership verdict: nothing here claims the child clause owns the parent's figures.
    expect(groundings.every((g) => g.groundedIn !== "OPERATIVE")).toBe(true);
  });
});

describe("Fix B §13 - source-citation and excerpt safety", () => {
  it("a fabricated provenance excerpt cannot self-authenticate: a figure quoted as source text but absent from the authenticated source is reported as a provenance defect, not as a supported value", async () => {
    const result = await verify(caseF_fabricatedExcerpt());
    const grounding = groundingsFor(result).find((g) => g.assertion.rawText === "100%");
    expect(grounding?.status).toBe("UNGROUNDED");
    expect(grounding?.assertion.fieldClass).toBe("SOURCE_QUOTATION_FIELD");
    expect(grounding?.assertion.fieldPath).toBe("rules[0].provenance.excerpt");
    expect(result.findings.some((f) => f.findingType === "PROVENANCE_MISMATCH")).toBe(true);
    expect(VERIFIED_STATUSES).not.toContain(result.status);
  });

  it("section numbering never becomes a numeric assertion", async () => {
    const result = await verify(caseG_citationNumbering());
    expect(groundingsFor(result)).toHaveLength(0);
    expect(unsupportedNumericFindings(result)).toHaveLength(0);
    expect(result.numericAssertions?.inventory.fieldsWalked).toBeGreaterThan(0);
  });
});
