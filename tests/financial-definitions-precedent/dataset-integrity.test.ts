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
      "20-calculation-models.json",
      "21-amendment-authority.json",
      "22-canonical-export-v3.json",
      "23-legal-completeness.json",
      "24-independent-legal-challenger.json",
      "25-phase5-failure-dispositions.json",
      "26-conmed-pro-forma-completeness.json",
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

  it("phase-4 calculation models close controlling defs without silent simplification", () => {
    const models = readJson<{
      version: string;
      models: Array<{
        id: string;
        typedCalcId: string;
        status: string;
        controllingDefinitions: string[];
        crossReferences: string[];
        provisos: string[];
        entityRestrictions: string;
        measurementDates: string;
        financialInputRequirements: string[];
        simplifiedAway: string[];
        blockedReasons: string[];
      }>;
      counts: { total: number; blockedReviewRequired: number };
    }>("20-calculation-models.json");
    expect(models.version).toBe("fdp.calc-model.v1");
    expect(models.counts.total).toBe(7);
    expect(models.counts.blockedReviewRequired).toBe(1);
    for (const m of models.models) {
      expect(m.controllingDefinitions.length).toBeGreaterThanOrEqual(3);
      expect(m.crossReferences.length).toBeGreaterThanOrEqual(1);
      expect(m.provisos.length).toBeGreaterThanOrEqual(1);
      expect(m.entityRestrictions.length).toBeGreaterThan(0);
      expect(m.measurementDates.length).toBeGreaterThan(0);
      expect(m.financialInputRequirements.length).toBeGreaterThanOrEqual(2);
      if (m.id === "CM-GIB-AA-BUILDER-v1") {
        expect(m.status).toBe("BLOCKED_REVIEW_REQUIRED");
        expect(m.blockedReasons.join(" ")).toMatch(/UQ-GIB-705AY-CITATION/);
      } else if (
        m.id === "CM-CONMED-EBITDA-PF-v1" ||
        m.id === "CM-DSGR-EBITDA-v1"
      ) {
        expect(m.status).toBe("PARTIAL_SEMANTIC_MODEL");
      } else {
        expect([
          "MODEL_COMPLETE_SEMANTIC_HYPOTHESIS",
          "PARTIAL_SEMANTIC_MODEL",
        ]).toContain(m.status);
      }
    }
  });

  it("amendment authority records preserve REVIEW_REQUIRED when incomplete", () => {
    const auth = readJson<{
      version: string;
      peerCoordination: { amendmentChainResearch: { branch: string; schemaVersion: string } };
      records: Array<{
        modelId: string;
        amendmentChainId: string | null;
        authorityStatus: string;
        unresolvedAuthority: string[];
        forcedResolutionForbidden?: boolean;
      }>;
    }>("21-amendment-authority.json");
    expect(auth.version).toBe("fdp.amend-auth.v1");
    expect(auth.peerCoordination.amendmentChainResearch.branch).toMatch(/amendment-chain-research/);
    expect(auth.records.length).toBe(7);
    const conmed = auth.records.find((r) => r.modelId === "CM-CONMED-SSLR-v1");
    expect(conmed?.amendmentChainId).toBe("cnmd-seventh-ar-to-eighth-ar");
    expect(conmed?.authorityStatus).toBe("REVIEW_REQUIRED");
    expect(conmed!.unresolvedAuthority.length).toBeGreaterThan(0);
    const gib = auth.records.find((r) => r.modelId === "CM-GIB-AA-BUILDER-v1");
    expect(gib?.authorityStatus).toBe("REVIEW_REQUIRED");
    expect(gib?.forcedResolutionForbidden).toBe(true);
  });

  it("phase-4 adds at least 50 independent arithmetic scenarios covering required control types", () => {
    const arith = readJson<{
      phase4NewCaseCount: number;
      totalCaseCount: number;
      cases: Array<{
        id: string;
        phase?: number;
        controlType: string;
        typedCalcId: string;
        inputs: Record<string, unknown>;
        expectedOutput: Record<string, unknown>;
      }>;
    }>("15-arithmetic-evaluation.json");
    expect(arith.phase4NewCaseCount).toBeGreaterThanOrEqual(50);
    expect(arith.totalCaseCount).toBe(arith.cases.length);
    const p4 = arith.cases.filter((c) => c.phase === 4);
    expect(p4.length).toBe(arith.phase4NewCaseCount);
    const types = new Set(p4.map((c) => c.controlType));
    for (const need of [
      "CAP_BOUNDARY",
      "ABOVE_CAP",
      "BELOW_CAP",
      "MISSING_INPUT",
      "ZERO_DENOMINATOR",
      "NEGATIVE_INPUT",
      "MULTIPLE_ADDBACKS",
      "DOUBLE_COUNTING_TRAP",
      "PRO_FORMA_ACQUISITION",
      "LOOKFORWARD_TIMING",
      "RATIO_THRESHOLD_EQUALITY",
      "AMENDMENT_EFFECTIVE_DATE_TRANSITION",
      "CURRENCY_UNIT_MISMATCH",
      "BUILDER_BASKET_SOURCE_AMBIGUITY",
    ]) {
      expect(types.has(need), need).toBe(true);
    }
    // Independent evaluator sample — CONMED exact cash-netting boundary
    const boundary = p4.find((c) => c.id === "ARITH-P4-CONMED-SSLR-001");
    expect(boundary).toBeTruthy();
    const debt = Number(boundary!.inputs.consolidated_senior_secured_funded_debt);
    const cash = Number(boundary!.inputs.unrestricted_cash_and_cash_equivalents);
    const ebitda = Number(boundary!.inputs.consolidated_ebitda_covenant_defined);
    const cashN = Math.min(100_000_000, cash);
    expect(cashN).toBe(100_000_000);
    expect(Number(boundary!.expectedOutput.ratio)).toBeCloseTo((debt - cashN) / ebitda, 9);
    // Gibraltar still refuses capacity
    const gibCases = p4.filter((c) => c.controlType === "BUILDER_BASKET_SOURCE_AMBIGUITY");
    expect(gibCases.length).toBeGreaterThanOrEqual(3);
    expect(gibCases.every((c) => c.expectedOutput.status === "REVIEW_REQUIRED")).toBe(true);
    // Zero denominator refusal
    const zd = p4.find((c) => c.controlType === "ZERO_DENOMINATOR" && c.typedCalcId === "TC-CONMED-SSLR-v1");
    expect(zd?.expectedOutput.status).toBe("UNSUPPORTED_CASE");
  });

  it("legal-completeness metrics are separate from arithmetic and never claim legal verification", () => {
    const legal = readJson<{
      version: string;
      disclaimer: string;
      models: Array<{
        modelId: string;
        independentlyLegallyReviewed: boolean;
        legalVerificationClaimedFromArithmetic: boolean;
        dimensions: Record<string, { status: string }>;
      }>;
      summary: { independentlyLegallyReviewedCount: number; blockedModels: number };
    }>("23-legal-completeness.json");
    expect(legal.version).toBe("fdp.legal-complete.v1");
    expect(legal.disclaimer).toMatch(/do NOT constitute independent legal review/i);
    expect(legal.summary.independentlyLegallyReviewedCount).toBe(0);
    expect(legal.summary.blockedModels).toBe(1);
    for (const m of legal.models) {
      expect(m.independentlyLegallyReviewed).toBe(false);
      expect(m.legalVerificationClaimedFromArithmetic).toBe(false);
      for (const dim of [
        "arithmeticCorrectness",
        "controllingSourceCompleteness",
        "definitionClosure",
        "amendmentVersionCorrectness",
        "provisoAttachment",
        "entityScopeFidelity",
        "missingInputRefusal",
        "unsupportedCaseRefusal",
      ]) {
        expect(m.dimensions[dim]?.status?.length).toBeGreaterThan(0);
      }
    }
    const gib = legal.models.find((m) => m.modelId === "CM-GIB-AA-BUILDER-v1");
    expect(gib?.dimensions.arithmeticCorrectness.status).toBe("BLOCKED");
  });

  it("canonical export v3 integrates peers without competing production schemas", () => {
    const canon = readJson<{
      schemaVersion: string;
      doesNotCompeteWith: string[];
      joinKeys: Record<string, string[]>;
      counts: { arithmeticCasesPhase4New: number; calculationModels: number };
      gibraltarCitationStatus: {
        status: string;
        certifiedBuilderFormula: boolean;
        capacityInferred: boolean;
        forcedResolutionForbidden: boolean;
      };
      independentlyLegallyReviewedCount: number;
    }>("22-canonical-export-v3.json");
    expect(canon.schemaVersion).toBe("fdp.canonical-export.v3");
    expect(canon.independentlyLegallyReviewedCount).toBe(0);
    expect(canon.counts.arithmeticCasesPhase4New).toBeGreaterThanOrEqual(50);
    expect(canon.counts.calculationModels).toBe(7);
    expect(canon.gibraltarCitationStatus.status).toBe("OPEN_REVIEW_REQUIRED");
    expect(canon.gibraltarCitationStatus.certifiedBuilderFormula).toBe(false);
    expect(canon.gibraltarCitationStatus.capacityInferred).toBe(false);
    expect(canon.gibraltarCitationStatus.forcedResolutionForbidden).toBe(true);
    const banned = canon.doesNotCompeteWith.join(" ");
    expect(banned).toMatch(/amendment-chain-research/);
    expect(banned).toMatch(/covenant-dependency-atlas/);
    expect(banned).toMatch(/covenant-engine/);
    expect(canon.joinKeys.amendmentIntelligence).toEqual(
      expect.arrayContaining(["amendmentChainId", "docId", "accession"]),
    );
    const withAliases = readJson<{
      joinFieldAliases: {
        definitionEncyclopedia: { peer: string[]; fdp: string[] };
        amendmentIntelligence: { packageCoverage: Record<string, string | null> };
      };
    }>("22-canonical-export-v3.json");
    expect(withAliases.joinFieldAliases.definitionEncyclopedia.peer.join(" ")).toMatch(
      /canonicalTerm/,
    );
    expect(withAliases.joinFieldAliases.amendmentIntelligence.packageCoverage.CONMED).toBe(
      "cnmd-seventh-ar-to-eighth-ar",
    );
    expect(withAliases.joinFieldAliases.amendmentIntelligence.packageCoverage.CHWY).toBeNull();
    expect(withAliases.joinFieldAliases.amendmentIntelligence.packageCoverage.GIB).toBeNull();
  });

  it("phase-5 fail-closed: missing-input and unsupported refusals pass for all seven models", () => {
    const legal = readJson<{
      summary: {
        missingInputRefusalPassCount: number;
        unsupportedCaseRefusalPassCount: number;
        independentlyLegallyReviewedCount: number;
      };
      models: Array<{
        modelId: string;
        independentlyLegallyReviewed: boolean;
        dimensions: {
          missingInputRefusal: { status: string };
          unsupportedCaseRefusal: { status: string };
        };
      }>;
    }>("23-legal-completeness.json");
    expect(legal.summary.missingInputRefusalPassCount).toBe(7);
    expect(legal.summary.unsupportedCaseRefusalPassCount).toBe(7);
    expect(legal.summary.independentlyLegallyReviewedCount).toBe(0);
    expect(legal.models.every((m) => m.independentlyLegallyReviewed === false)).toBe(true);

    const arith = readJson<{
      phase5NewCaseCount: number;
      cases: Array<{
        id: string;
        phase?: number;
        modelId?: string;
        controlType: string;
        inputs: Record<string, unknown>;
        expectedOutput: Record<string, unknown>;
        forbidInference?: string[];
      }>;
    }>("15-arithmetic-evaluation.json");
    expect(arith.phase5NewCaseCount).toBeGreaterThanOrEqual(20);
    const p5 = arith.cases.filter((c) => c.phase === 5);

    // Silent-zero traps must refuse
    for (const id of [
      "ARITH-P5-CONMED-PF-MISSING-GROSS",
      "ARITH-P5-CHWY-TLR-MISSING-CTD",
      "ARITH-P5-CHWY-ANTIDUPE-MISSING-ALREADY",
    ]) {
      const c = p5.find((x) => x.id === id);
      expect(c?.expectedOutput.status).toBe("MISSING_INPUT");
      expect(c?.forbidInference?.join(" ") || "").toMatch(/zero|capacity|overlap/i);
    }

    // DSGR unsupported semantics must not yield ebitda number
    for (const id of [
      "ARITH-P5-DSGR-UNSUPPORTED-ADDBACK",
      "ARITH-P5-DSGR-MISSING-SOURCE-AUTHORITY",
      "ARITH-P5-DSGR-UNMODELED-PROVISO",
      "ARITH-P5-DSGR-UNSUPPORTED-BRANCH",
    ]) {
      const c = p5.find((x) => x.id === id);
      expect(c?.expectedOutput.status).toBe("UNSUPPORTED_CASE");
      expect(c?.expectedOutput.ebitda).toBeUndefined();
    }

    // Amendment / parent refusals
    expect(
      p5.find((c) => c.id === "ARITH-P5-CONMED-WRONG-PARENT")?.expectedOutput.status,
    ).toBe("UNSUPPORTED_CASE");
    expect(
      p5.find((c) => c.id === "ARITH-P5-CONMED-AMD-SURVIVAL-UNRESOLVED")?.expectedOutput
        .status,
    ).toBe("REVIEW_REQUIRED");

    // Gibraltar: no capacity
    const gib = p5.find((c) => c.id === "ARITH-P5-GIB-NO-CAPACITY");
    expect(gib?.expectedOutput.available_capacity).toBeNull();
    expect(gib?.expectedOutput.is_capacity_basket_certified).toBe(false);

    // Maintenance headroom ≠ permission
    const neg = p5.find((c) => c.id === "ARITH-P5-NEG-MAINTENANCE-NOT-PERMISSION");
    expect(neg?.expectedOutput.permission_granted).toBe(false);
    expect(neg?.expectedOutput.capacity_amount).toBeNull();
  });

  it("independent legal challenger package is ready without self-verification", () => {
    const ch = readJson<{
      version: string;
      independentlyLegallyReviewedCount: number;
      selectedForChallenge: string[];
      models: Array<{
        modelId: string;
        independentlyLegallyReviewed: boolean;
        controllingSourceSpans: unknown[];
        refusalConditions: unknown[];
        knownSimplifications: unknown[];
        arithmeticTestEvidence: { caseCount: number };
      }>;
    }>("24-independent-legal-challenger.json");
    expect(ch.version).toBe("fdp.legal-challenger.v1");
    expect(ch.independentlyLegallyReviewedCount).toBe(0);
    expect(ch.selectedForChallenge).toEqual(
      expect.arrayContaining([
        "CM-CONMED-EBITDA-PF-v1",
        "CM-DSGR-EBITDA-v1",
        "CM-CONMED-SSLR-v1",
      ]),
    );
    expect(ch.selectedForChallenge.length).toBeGreaterThanOrEqual(3);
    expect(ch.models.length).toBe(7);
    for (const m of ch.models) {
      expect(m.independentlyLegallyReviewed).toBe(false);
      expect(m.controllingSourceSpans.length).toBeGreaterThan(0);
      expect(m.arithmeticTestEvidence.caseCount).toBeGreaterThan(0);
    }
    const pf = ch.models.find((m) => m.modelId === "CM-CONMED-EBITDA-PF-v1");
    expect(pf!.knownSimplifications.length).toBeGreaterThan(0);
  });

  it("CONMED PF completeness remains partial and not upgraded by arithmetic", () => {
    const pf = readJson<{
      representationClass: string;
      doNotUpgradeToLegallyCompleteFromArithmetic: boolean;
      taxonomy: { unsupportedLegalSemantics: string[] };
    }>("26-conmed-pro-forma-completeness.json");
    expect(pf.representationClass).toBe("PARTIAL_SEMANTIC_MODEL");
    expect(pf.doNotUpgradeToLegallyCompleteFromArithmetic).toBe(true);
    expect(pf.taxonomy.unsupportedLegalSemantics.length).toBeGreaterThan(0);

    const uq = readJson<{ items: Array<{ id: string; status: string }> }>(
      "07-unresolved-interpretation-queue.json",
    );
    const gib = uq.items.find((i) => i.id === "UQ-GIB-705AY-CITATION");
    expect(gib?.status).toBe("OPEN");
  });
});
