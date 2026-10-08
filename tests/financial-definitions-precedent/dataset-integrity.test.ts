import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const PACK = path.join(ROOT, "docs/financial-definitions-precedent");

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(PACK, name), "utf8")) as T;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Match Python html.unescape + tag strip + whitespace collapse used at atlas generation. */
function loadSourceText(sourcePath: string): string {
  const abs = path.join(ROOT, sourcePath);
  expect(existsSync(abs), `missing source ${sourcePath}`).toBe(true);
  let text = readFileSync(abs, "utf8");
  if (sourcePath.endsWith(".htm") || sourcePath.endsWith(".html")) {
    text = text
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&ldquo;/gi, "“")
      .replace(/&rdquo;/gi, "”")
      .replace(/&lsquo;/gi, "‘")
      .replace(/&rsquo;/gi, "’")
      .replace(/&mdash;/gi, "—")
      .replace(/&ndash;/gi, "–")
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  }
  return text;
}

type Atlas = {
  version: string;
  workstreamId: string;
  entries: Array<{
    id: string;
    kind: string;
    termLabel: string;
    sourceId: string;
    sourcePath: string;
    charStart: number;
    charEnd: number;
    excerpt: string;
    excerptSha256: string;
    verificationStatus: string;
    formulaSketch: string | null;
    dependencies: string[];
    units: string | null;
    measurementPeriod: string | null;
    entityScope: string | null;
  }>;
  counts: { entries: number; negativeExamples: number };
};

describe("financial-definitions-precedent dataset integrity", () => {
  it("pack contains required artifacts", () => {
    const required = [
      "00-ownership-and-coordination.md",
      "01-schema.json",
      "02-precedent-atlas.json",
      "03-calculation-dependency-graph.json",
      "04-addback-taxonomy.json",
      "05-negative-examples-conditions-not-capacity.json",
      "06-missing-financial-inputs.json",
      "07-unresolved-interpretation-queue.json",
      "08-regression-candidates.json",
      "09-mechanic-divergences.json",
      "10-dataset-export.json",
      "11-progress-ledger.md",
      "14-typed-calculations.json",
      "15-arithmetic-evaluation.json",
      "16-legal-review-states.json",
      "17-source-document-registry.json",
      "18-canonical-export-v2.json",
      "README.md",
    ];
    for (const f of required) {
      expect(existsSync(path.join(PACK, f)), f).toBe(true);
    }
    // ensure we did not accidentally write outside pack via empty dir listing sanity
    expect(readdirSync(PACK).length).toBeGreaterThan(10);
  });

  it("schema declares missing-input fail-closed rule and peer boundaries", () => {
    const schema = readJson<{
      version: string;
      missingInputRepresentation: { pattern: string };
      coordination: Record<string, { bcId: string }>;
      nonGoals: string[];
    }>("01-schema.json");
    expect(schema.version).toBe("fdp.v1");
    expect(schema.missingInputRepresentation.pattern).toBe("MISSING_INPUT:<inputKey>");
    expect(schema.coordination.definitionEncyclopedia.bcId).toMatch(/^bc-/);
    expect(schema.coordination.basketFormulaLibrary.bcId).toMatch(/^bc-/);
    expect(schema.nonGoals.join(" ")).toMatch(/calculation equivalence/i);
  });

  it("atlas entries have unique ids and required calculation fields", () => {
    const atlas = readJson<Atlas>("02-precedent-atlas.json");
    expect(atlas.workstreamId).toBe("WS-FDP");
    expect(atlas.entries.length).toBe(atlas.counts.entries);
    expect(atlas.entries.length).toBeGreaterThanOrEqual(25);
    const ids = new Set<string>();
    for (const e of atlas.entries) {
      expect(ids.has(e.id), `duplicate ${e.id}`).toBe(false);
      ids.add(e.id);
      expect(e.termLabel.length).toBeGreaterThan(0);
      expect(e.sourcePath.length).toBeGreaterThan(0);
      expect(e.excerpt.length).toBeGreaterThan(0);
      expect(e.formulaSketch && e.formulaSketch.length).toBeGreaterThan(0);
      expect(e.units && e.units.length).toBeGreaterThan(0);
      expect(e.measurementPeriod && e.measurementPeriod.length).toBeGreaterThan(0);
      expect(e.entityScope && e.entityScope.length).toBeGreaterThan(0);
      expect(Array.isArray(e.dependencies)).toBe(true);
    }
  });

  it("every atlas excerpt matches source bytes and sha256", () => {
    const atlas = readJson<Atlas>("02-precedent-atlas.json");
    for (const e of atlas.entries) {
      const text = loadSourceText(e.sourcePath);
      const span = text.slice(e.charStart, e.charEnd);
      expect(span, e.id).toBe(e.excerpt);
      expect(sha256(span), e.id).toBe(e.excerptSha256);
    }
  });

  it("negative examples are conditions/gates, not capacity, with verified spans", () => {
    const neg = readJson<{
      examples: Array<{
        id: string;
        kind: string;
        sourcePath: string;
        charStart: number;
        charEnd: number;
        excerpt: string;
        excerptSha256: string;
        whyNotCapacity: string;
        correctClassification: string;
      }>;
    }>("05-negative-examples-conditions-not-capacity.json");
    expect(neg.examples.length).toBeGreaterThanOrEqual(5);
    for (const n of neg.examples) {
      expect(n.kind).toBe("NEGATIVE_EXAMPLE_CONDITION_NOT_CAPACITY");
      expect(n.whyNotCapacity.toLowerCase()).not.toMatch(/this is a basket/);
      expect(n.correctClassification.length).toBeGreaterThan(0);
      const text = loadSourceText(n.sourcePath);
      const span = text.slice(n.charStart, n.charEnd);
      expect(span, n.id).toBe(n.excerpt);
      expect(sha256(span), n.id).toBe(n.excerptSha256);
    }
  });

  it("dependency graph includes non-equivalence edges for same labels", () => {
    const graph = readJson<{
      edges: Array<{ edgeType: string; from: string; to: string }>;
    }>("03-calculation-dependency-graph.json");
    const nonEq = graph.edges.filter((e) =>
      [
        "SAME_LABEL_NOT_EQUIVALENT",
        "RELATED_LABEL_NOT_EQUIVALENT",
        "RELATED_MECHANIC_NOT_EQUIVALENT",
        "CASH_NETTING_MECHANICS_DIFFER",
      ].includes(e.edgeType),
    );
    expect(nonEq.length).toBeGreaterThanOrEqual(4);
  });

  it("add-back taxonomy covers synergies, caps, cash netting, cures, step-ups", () => {
    const tax = readJson<{ families: Array<{ id: string }> }>("04-addback-taxonomy.json");
    const ids = new Set(tax.families.map((f) => f.id));
    for (const need of [
      "SYNERGIES_RUN_RATE",
      "PRO_FORMA_SYNERGY",
      "CASH_NETTING",
      "ANTI_DOUBLE_COUNT",
      "STEP_UP",
      "CURE",
      "RESTRUCTURING_OPTIMIZATION",
    ]) {
      expect(ids.has(need), need).toBe(true);
    }
  });

  it("missing inputs use explicit MISSING_INPUT keys and never invent results", () => {
    const missing = readJson<{
      rule: string;
      inputs: Array<{ key: string; status: string }>;
    }>("06-missing-financial-inputs.json");
    expect(missing.rule).toMatch(/MISSING_INPUT/);
    expect(missing.inputs.length).toBeGreaterThanOrEqual(10);
    expect(missing.inputs.every((i) => i.key.length > 0 && i.status.length > 0)).toBe(true);
  });

  it("unresolved queue and regression candidates are non-empty drafts", () => {
    const uq = readJson<{ items: Array<{ id: string; status: string }> }>(
      "07-unresolved-interpretation-queue.json",
    );
    const reg = readJson<{ candidates: Array<{ id: string; failureClass: string }> }>(
      "08-regression-candidates.json",
    );
    expect(uq.items.length).toBeGreaterThanOrEqual(5);
    expect(reg.candidates.length).toBeGreaterThanOrEqual(6);
    expect(reg.candidates.some((c) => c.failureClass === "CONDITION_AS_CAPACITY")).toBe(true);
    expect(reg.candidates.some((c) => c.failureClass === "INVENTED_FINANCIAL_RESULT")).toBe(true);
  });

  it("ownership doc forbids peer production edits and paid calls", () => {
    const md = readFileSync(path.join(PACK, "00-ownership-and-coordination.md"), "utf8");
    expect(md).toMatch(/Must not touch/);
    expect(md).toMatch(/Definition Encyclopedia/);
    expect(md).toMatch(/Basket Formula Library/);
    expect(md).toMatch(/docs\/financial-definitions-precedent\/\*\*/);
  });

  it("dataset export ids are unique across atlas + negatives", () => {
    const exp = readJson<{ records: Array<{ id: string }> }>("10-dataset-export.json");
    const ids = exp.records.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("phase-3 pack artifacts exist with versioned schemas", () => {
    for (const f of [
      "14-typed-calculations.json",
      "15-arithmetic-evaluation.json",
      "16-legal-review-states.json",
      "17-source-document-registry.json",
      "18-canonical-export-v2.json",
      "19-sha-reconciliation.json",
    ]) {
      expect(existsSync(path.join(PACK, f)), f).toBe(true);
    }
    const typed = readJson<{ version: string; calculations: unknown[] }>("14-typed-calculations.json");
    const arith = readJson<{ version: string; cases: unknown[] }>("15-arithmetic-evaluation.json");
    const states = readJson<{
      states: Array<{ id: string }>;
      independentlyLegallyReviewedCount: number;
      promotionRule: string;
    }>("16-legal-review-states.json");
    const canon = readJson<{
      schemaVersion: string;
      independentlyLegallyReviewedCount: number;
      counts: { atlasEntries: number; typedCalculations: number; arithmeticCases: number };
      gibraltarCitationStatus: { certifiedBuilderFormula: boolean; capacityInferred: boolean };
    }>("18-canonical-export-v2.json");
    expect(typed.version).toBe("fdp.typed-calc.v1");
    expect(arith.version).toBe("fdp.arith.v1");
    expect(canon.schemaVersion).toBe("fdp.canonical-export.v2");
    expect(typed.calculations.length).toBeGreaterThanOrEqual(7);
    expect(arith.cases.length).toBeGreaterThanOrEqual(13);
    expect(states.independentlyLegallyReviewedCount).toBe(0);
    expect(canon.independentlyLegallyReviewedCount).toBe(0);
    expect(states.promotionRule).toMatch(/reviewerEvidence/);
    const stateIds = new Set(states.states.map((s) => s.id));
    for (const need of [
      "SOURCE_SPAN_VERIFIED",
      "ARITHMETICALLY_TESTED",
      "SEMANTIC_HYPOTHESIS",
      "INDEPENDENTLY_LEGALLY_REVIEWED",
      "REVIEW_REQUIRED",
    ]) {
      expect(stateIds.has(need), need).toBe(true);
    }
    expect(canon.gibraltarCitationStatus.certifiedBuilderFormula).toBe(false);
    expect(canon.gibraltarCitationStatus.capacityInferred).toBe(false);
    expect(canon.counts.atlasEntries).toBe(
      readJson<Atlas>("02-precedent-atlas.json").entries.length,
    );
  });

  it("typed calculations separate extraction from unverified interpretation", () => {
    const typed = readJson<{
      disclaimer: string;
      componentKinds: string[];
      calculations: Array<{
        id: string;
        legalReviewState: string;
        legalCertified: boolean;
        arithmeticEvaluable: boolean;
        components: Array<{ kind: string }>;
      }>;
    }>("14-typed-calculations.json");
    expect(typed.disclaimer).toMatch(/SEMANTIC_HYPOTHESIS/);
    expect(typed.disclaimer).toMatch(/Not INDEPENDENTLY_LEGALLY_REVIEWED/);
    for (const need of [
      "BASE_METRIC",
      "ADDBACK",
      "DEDUCTION",
      "CAP",
      "LOOKBACK_OR_LOOKFORWARD",
      "PRO_FORMA_ADJUSTMENT",
      "CURE_AMOUNT",
      "RATIO_NUMERATOR",
      "RATIO_DENOMINATOR",
      "FINANCIAL_INPUT_REQUIREMENT",
      "CONDITIONAL_TEST",
      "DOUBLE_COUNTING_RESTRICTION",
    ]) {
      expect(typed.componentKinds.includes(need), need).toBe(true);
    }
    expect(typed.calculations.every((c) => c.legalCertified === false)).toBe(true);
    expect(typed.calculations.every((c) => c.legalReviewState !== "INDEPENDENTLY_LEGALLY_REVIEWED")).toBe(
      true,
    );
    const gib = typed.calculations.find((c) => c.id === "TC-GIB-AA-BUILDER-v1");
    expect(gib).toBeTruthy();
    expect(gib!.arithmeticEvaluable).toBe(false);
    expect(gib!.legalReviewState).toBe("REVIEW_REQUIRED");
    expect(gib!.components.some((c) => c.kind === "CITATION_AMBIGUITY")).toBe(true);
  });

  it("source document registry hashes match fixture bytes; no new SEC acquisition", () => {
    const reg = readJson<{
      documents: Array<{
        sourceDocId: string;
        path: string;
        fileSha256: string;
        byteLength: number;
        newSecAcquisition: boolean;
        acquisitionKind: string;
      }>;
    }>("17-source-document-registry.json");
    expect(reg.documents.length).toBeGreaterThanOrEqual(11);
    for (const d of reg.documents) {
      expect(d.newSecAcquisition).toBe(false);
      expect(d.acquisitionKind).toBe("IN_REPO_FIXTURE");
      const abs = path.join(ROOT, d.path);
      expect(existsSync(abs), d.path).toBe(true);
      const buf = readFileSync(abs);
      expect(buf.byteLength).toBe(d.byteLength);
      expect(createHash("sha256").update(buf).digest("hex")).toBe(d.fileSha256);
    }
  });

  it("Gibraltar §7.05(a)(y) citation conflict remains OPEN without capacity inference", () => {
    const uq = readJson<{
      items: Array<{
        id: string;
        status: string;
        forcedResolutionForbidden?: boolean;
        topic: string;
      }>;
    }>("07-unresolved-interpretation-queue.json");
    const item = uq.items.find((i) => i.id === "UQ-GIB-705AY-CITATION");
    expect(item).toBeTruthy();
    expect(item!.status).toBe("OPEN");
    expect(item!.forcedResolutionForbidden).toBe(true);
    expect(item!.topic).toMatch(/7\.05\(a\)\(y\)/);
    const arith = readJson<{
      cases: Array<{ id: string; expectedOutput: { status?: string }; forbidInference?: string[] }>;
    }>("15-arithmetic-evaluation.json");
    const blocked = arith.cases.find((c) => c.id === "ARITH-GIB-AA-BLOCKED-001");
    expect(blocked?.expectedOutput.status).toBe("REVIEW_REQUIRED");
    expect(blocked?.forbidInference).toEqual(
      expect.arrayContaining(["zero", "unlimited", "available_capacity"]),
    );
  });

  it("independent arithmetic cases match authored expected values without using formulaSketch as oracle", () => {
    const atlas = readJson<Atlas>("02-precedent-atlas.json");
    const formulaSketches = new Set(
      atlas.entries.map((e) => e.formulaSketch).filter((s): s is string => !!s),
    );
    const arith = readJson<{
      disclaimer: string;
      cases: Array<{
        id: string;
        typedCalcId: string;
        controlType: string;
        inputs: Record<string, number | string | undefined>;
        expectedIntermediates?: Record<string, number>;
        expectedOutput: Record<string, unknown>;
        forbidInference?: string[];
      }>;
    }>("15-arithmetic-evaluation.json");
    expect(arith.disclaimer).toMatch(/does NOT mean legal correctness/i);
    // Ground truth is the case record itself + independent evaluator — not atlas formulaSketch.
    for (const c of arith.cases) {
      for (const sketch of formulaSketches) {
        expect(JSON.stringify(c.expectedOutput)).not.toBe(sketch);
      }
    }

    const nearly = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

    for (const c of arith.cases) {
      if (c.id === "ARITH-CONMED-SSLR-001" || c.id === "ARITH-CONMED-SSLR-002") {
        const debt = Number(c.inputs.consolidated_senior_secured_funded_debt);
        const rtp = Number(c.inputs.rtp_attributed_principal);
        const cash = Number(c.inputs.unrestricted_cash_and_cash_equivalents);
        const ebitda = Number(c.inputs.consolidated_ebitda_covenant_defined);
        const cashNetting = Math.min(100_000_000, cash);
        const numerator = debt + rtp - cashNetting;
        nearly(cashNetting, Number(c.expectedIntermediates!.cash_netting));
        nearly(numerator, Number(c.expectedIntermediates!.numerator));
        nearly(numerator / ebitda, Number(c.expectedOutput.ratio));
      }
      if (c.id === "ARITH-CONMED-SSLR-MISSING-001") {
        expect(c.inputs.consolidated_ebitda_covenant_defined).toBeUndefined();
        expect(c.expectedOutput.status).toBe("MISSING_INPUT");
        expect(c.forbidInference).toEqual(
          expect.arrayContaining(["zero_ebitda", "unlimited_capacity", "available_capacity"]),
        );
      }
      if (c.id.startsWith("ARITH-DSGR-COMBINED-CAP") || c.id === "ARITH-DSGR-COST-SAVINGS-NET-001") {
        const ni = Number(c.inputs.net_income);
        const interest = Number(c.inputs.interest_expense);
        const tax = Number(c.inputs.income_tax_expense_net);
        const da = Number(c.inputs.depreciation_amortization);
        const nonrec = Number(c.inputs.nonrecurring_unusual_expenses);
        const csProj = Number(c.inputs.cost_savings_projected);
        const csReal = Number(c.inputs.cost_savings_benefits_realized);
        const xviii = Number(c.inputs.clause_a_xviii_b);
        const before = ni + interest + tax + da;
        const costSavingsNet = Math.max(0, csProj - csReal);
        const combinedCap = 0.2 * before;
        const uncapped = nonrec + costSavingsNet + xviii;
        const allowed = Math.min(uncapped, combinedCap);
        nearly(before, Number(c.expectedIntermediates!.ebitda_before_capped_addbacks));
        nearly(combinedCap, Number(c.expectedIntermediates!.combined_cap));
        nearly(allowed, Number(c.expectedIntermediates!.allowed_capped_bucket_sum));
        nearly(before + allowed, Number(c.expectedOutput.ebitda));
      }
      if (c.id === "ARITH-CHWY-ANTIDUPE-001") {
        const clauseD = Number(c.inputs.addback_amount_clause_d);
        const already = Number(c.inputs.addback_amount_already_in_ebitda);
        const allowed = clauseD > 0 && already >= clauseD ? 0 : clauseD;
        expect(allowed).toBe(Number(c.expectedOutput.allowed_clause_d_add));
        expect(c.expectedOutput.status).toBe("DOUBLE_COUNT_BLOCKED");
        expect(c.controlType).toBe("DOUBLE_COUNTING_TRAP");
      }
      if (c.id === "ARITH-CHWY-TLR-001") {
        const num =
          Number(c.inputs.consolidated_total_debt) -
          Number(c.inputs.excluded_revolving_loans_balance);
        nearly(num, Number(c.expectedIntermediates!.numerator));
        nearly(num / Number(c.inputs.consolidated_ebitda_covenant_defined), Number(c.expectedOutput.ratio));
      }
      if (c.id === "ARITH-RIOT-LTV-001") {
        const principal = Number(c.inputs.loan_principal);
        const pmv = Number(c.inputs.collateral_pmv);
        const initial = Number(c.inputs.initial_ltv);
        const btc = Number(c.inputs.btc_price);
        const actual = principal / pmv;
        const targetPmv = principal / initial;
        const addUsd = targetPmv - pmv;
        nearly(actual, Number(c.expectedIntermediates!.actual_ltv));
        nearly(targetPmv, Number(c.expectedIntermediates!.target_collateral_pmv));
        nearly(addUsd, Number(c.expectedIntermediates!.additional_collateral_usd));
        nearly(addUsd / btc, Number(c.expectedOutput.cure_amount_btc));
      }
      if (c.id === "ARITH-RIOT-LTV-MISSING-001") {
        expect(c.inputs.btc_price).toBeUndefined();
        expect(c.expectedOutput.status).toBe("MISSING_INPUT");
      }
      if (c.id === "ARITH-CONMED-PF-CAP-001") {
        const before = Number(c.inputs.ebitda_before_pf_clause_i);
        const gross = Number(c.inputs.pro_forma_adjustment_gross);
        const realized = Number(c.inputs.benefits_realized);
        const uncapped = gross - realized;
        // after-giving-effect: pf = 0.15 * (before + pf) => pf = 0.15*before / 0.85
        const pfAllowed = Math.min(uncapped, (0.15 * before) / 0.85);
        nearly(uncapped, Number(c.expectedIntermediates!.pf_net_uncapped));
        nearly(pfAllowed, Number(c.expectedOutput.pf_allowed));
        nearly(before + pfAllowed, Number(c.expectedOutput.ebitda_after));
      }
      if (c.id === "ARITH-NEG-MAINTENANCE-NOT-CAPACITY-001") {
        expect(c.expectedOutput.is_capacity_basket).toBe(false);
        expect(c.expectedOutput.capacity_amount).toBeNull();
        expect(c.controlType).toBe("NEGATIVE_CONTROL_NOT_CAPACITY");
      }
    }
    expect(arith.cases.some((c) => c.controlType === "MISSING_INPUT")).toBe(true);
    expect(arith.cases.some((c) => c.controlType === "DOUBLE_COUNTING_TRAP")).toBe(true);
    expect(arith.cases.some((c) => c.controlType === "ADDBACK_CAP")).toBe(true);
    expect(arith.cases.some((c) => c.controlType === "NEGATIVE_CONTROL_NO_CAPACITY_INFERENCE")).toBe(
      true,
    );
  });

  it("canonical export v2 join keys do not compete with peer production schemas", () => {
    const canon = readJson<{
      doesNotCompeteWith: string[];
      joinKeys: Record<string, string[]>;
      sourceDocuments: Array<{ newSecAcquisition: boolean }>;
    }>("18-canonical-export-v2.json");
    expect(canon.doesNotCompeteWith.join(" ")).toMatch(/definition-encyclopedia/);
    expect(canon.doesNotCompeteWith.join(" ")).toMatch(/covenant-basket-capacity-formula-library/);
    expect(canon.doesNotCompeteWith.join(" ")).toMatch(/knowledge-factory/);
    expect(canon.joinKeys.definitionEncyclopedia).toEqual(
      expect.arrayContaining(["termLabel", "sourcePath", "excerptSha256"]),
    );
    expect(canon.sourceDocuments.every((d) => d.newSecAcquisition === false)).toBe(true);
  });
});
