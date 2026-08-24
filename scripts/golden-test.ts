/**
 * The permanent regression suite. Every row in golden_tests is a lawyer-
 * reviewable question with a mechanically-executable form (queryType +
 * queryParams); this script runs each one against the LIVE database and the
 * SAME engine functions the app uses, and reports pass/fail against three
 * independent things:
 *   1. expectedAnswer, within tolerance - the number.
 *   2. bindingProvision - which basket/test the engine says is actually
 *      binding, so a change that gets the number right for the wrong reason
 *      still fails.
 *   3. bindingDefinedTerms - the defined terms that binding provision is
 *      wired to, so a change that silently drops a term dependency fails too.
 *
 * Run: npm run golden-test
 * Exit code is non-zero if any row FAILs (errors count as FAIL) - wire this
 * into CI so no engine change merges without a clean run.
 *
 * OUT_OF_SCOPE rows (reclassification, LME/priority/intercreditor,
 * Restricted/Unrestricted Subsidiary redesignation, etc.) are never computed
 * - they're reported FLAGGED and do not affect the exit code, per the
 * explicit instruction to flag rather than attempt those.
 */
import { PrismaClient, type GoldenTest } from "@prisma/client";
import {
  computeCovenantPosition,
  loadCompanyCovenantData,
  simulateAssetSale,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type AssetSaleSimulation,
  type CompanyCovenantData,
  type CovenantPosition,
  type CovenantProvisionInput,
  type DebtIncurrenceSimulation,
  type RestrictedPaymentKind,
  type RestrictedPaymentSimulation,
} from "../lib/covenant-engine";
import { COHERENT_COMPANY } from "../prisma/seed-data";

const prisma = new PrismaClient();

type Outcome = "PASS" | "FAIL" | "FLAGGED" | "ERROR";

interface EvalResult {
  outcome: Outcome;
  computed: number | null;
  numericOk: boolean | null;
  bindingLabel: string | null;
  bindingSectionRef: string | null;
  bindingOk: boolean | null;
  actualDefinedTerms: string[];
  expectedDefinedTerms: string[];
  definedTermsOk: boolean | null;
  detail: string;
}

function money(n: number | null): string {
  if (n === null) return "n/a";
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/** A golden row's bindingProvision may name a provision by code, basket name, or section ref. */
function matchesBindingLabel(expected: string, provision: CovenantProvisionInput): boolean {
  const e = normalize(expected);
  return (
    e === normalize(provision.code) ||
    normalize(provision.basketName).includes(e) ||
    normalize(provision.sectionRef).includes(e) ||
    e.includes(normalize(provision.code))
  );
}

function setEqualsCaseInsensitive(a: string[], b: string[]): boolean {
  const na = new Set(a.map(normalize));
  const nb = new Set(b.map(normalize));
  if (na.size !== nb.size) return false;
  for (const x of na) if (!nb.has(x)) return false;
  return true;
}

function readNumericMetric(source: Record<string, unknown>, metric: string): number {
  const value = source[metric];
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new Error(`Metric "${metric}" not found or not numeric/boolean on ${JSON.stringify(source)}`);
}

/** Which provision a Debt/RP/Asset Sale simulation should cite as "binding," for the traceability check. */
function debtBindingProvision(sim: DebtIncurrenceSimulation): CovenantProvisionInput | null {
  return sim.binding.bindingProvision ?? null;
}

function rpBindingProvision(
  sim: RestrictedPaymentSimulation,
  data: CompanyCovenantData,
  position: CovenantPosition,
  documentId: string,
  kind: RestrictedPaymentKind
): CovenantProvisionInput | null {
  if (sim.cleared && sim.steps.length > 0) {
    const lastCode = sim.steps[sim.steps.length - 1]!.code;
    return position.provisionCapacities.get(`${documentId}:${lastCode}`)?.provision ?? null;
  }
  const doc = data.documents.find((d) => d.id === documentId);
  const gateCode = doc?.rpWaterfall?.ratioGateCodeByKind[kind];
  return gateCode ? position.provisionCapacities.get(`${documentId}:${gateCode}`)?.provision ?? null : null;
}

function assetSaleBindingProvision(
  data: CompanyCovenantData,
  position: CovenantPosition,
  documentId: string
): CovenantProvisionInput | null {
  const doc = data.documents.find((d) => d.id === documentId);
  const code = doc?.assetSale?.thresholdCode;
  return code ? position.provisionCapacities.get(`${documentId}:${code}`)?.provision ?? null : null;
}

function evaluateGoldenTest(
  test: GoldenTest,
  data: CompanyCovenantData,
  position: CovenantPosition,
  definedTermsByKey: Map<string, string[]>
): EvalResult {
  if (test.queryType === "OUT_OF_SCOPE") {
    return {
      outcome: "FLAGGED",
      computed: null,
      numericOk: null,
      bindingLabel: null,
      bindingSectionRef: null,
      bindingOk: null,
      actualDefinedTerms: [],
      expectedDefinedTerms: [],
      definedTermsOk: null,
      detail: test.reviewerNotes ?? "Out of scope for this phase - not attempted.",
    };
  }

  const params = (test.queryParams ?? {}) as Record<string, unknown>;
  let computed: number;
  let bindingProvision: CovenantProvisionInput | null = null;

  switch (test.queryType) {
    case "LEVERAGE_METRIC": {
      const metric = params.metric as string;
      computed = readNumericMetric(position.metrics as unknown as Record<string, unknown>, metric);
      break;
    }
    case "PROVISION_CAPACITY": {
      const documentId = params.documentId as string;
      const provisionCode = params.provisionCode as string;
      const evaluated = position.provisionCapacities.get(`${documentId}:${provisionCode}`);
      if (!evaluated) throw new Error(`Unknown provision ${documentId}:${provisionCode}`);
      computed = evaluated.capacity;
      bindingProvision = evaluated.provision;
      break;
    }
    case "DOCUMENT_CAPACITY": {
      const documentId = params.documentId as string;
      const secured = Boolean(params.secured);
      const doc = position.documents.find((d) => d.documentId === documentId);
      if (!doc) throw new Error(`Unknown document ${documentId}`);
      computed = secured ? doc.securedCapacity : doc.unsecuredCapacity;
      bindingProvision = (secured ? doc.securedBindingProvision : doc.unsecuredBindingProvision) ?? null;
      break;
    }
    case "CROSS_DOCUMENT_CAPACITY": {
      const secured = Boolean(params.secured);
      computed = secured ? position.crossDocumentSecuredCapacity : position.crossDocumentUnsecuredCapacity;
      const bindingDoc = position.documents.reduce((min, d) => {
        const v = secured ? d.securedCapacity : d.unsecuredCapacity;
        const minV = secured ? min.securedCapacity : min.unsecuredCapacity;
        return v < minV ? d : min;
      });
      bindingProvision = (secured ? bindingDoc.securedBindingProvision : bindingDoc.unsecuredBindingProvision) ?? null;
      break;
    }
    case "DEBT_SIMULATION": {
      const amount = Number(params.amount);
      const secured = Boolean(params.secured);
      const metric = params.metric as string;
      const sim = simulateDebtIncurrence(position, data.financials, amount, secured);
      computed = readNumericMetric(
        { overallCapacity: sim.overallCapacity, cleared: sim.cleared, ...sim.proForma } as unknown as Record<string, unknown>,
        metric
      );
      bindingProvision = debtBindingProvision(sim);
      break;
    }
    case "RP_SIMULATION": {
      const documentId = params.documentId as string;
      const amount = Number(params.amount);
      const kind = params.kind as RestrictedPaymentKind;
      const metric = params.metric as string;
      const sim = simulateRestrictedPayment(data, position, documentId, amount, kind);
      computed = readNumericMetric(
        { remaining: sim.remaining, cleared: sim.cleared, poolUsed: sim.poolUsed, proFormaTotalNetLeverage: sim.proFormaTotalNetLeverage } as unknown as Record<
          string,
          unknown
        >,
        metric
      );
      bindingProvision = rpBindingProvision(sim, data, position, documentId, kind);
      break;
    }
    case "ASSET_SALE_SIMULATION": {
      const documentId = params.documentId as string;
      const amount = Number(params.amount);
      const reinvest = Boolean(params.reinvest);
      const metric = params.metric as string;
      const sim: AssetSaleSimulation = simulateAssetSale(data, position, documentId, amount, reinvest);
      computed = readNumericMetric(sim as unknown as Record<string, unknown>, metric);
      bindingProvision = assetSaleBindingProvision(data, position, documentId);
      break;
    }
    default:
      throw new Error(`Unknown query type: ${test.queryType}`);
  }

  const expected = test.expectedAnswer !== null ? Number(test.expectedAnswer) : null;
  const tolerance = test.tolerance !== null ? Number(test.tolerance) : 0;
  const numericOk = expected === null ? null : Math.abs(computed - expected) <= tolerance;

  const bindingOk = test.bindingProvision ? (bindingProvision ? matchesBindingLabel(test.bindingProvision, bindingProvision) : false) : null;

  const actualDefinedTerms = bindingProvision
    ? definedTermsByKey.get(`${bindingProvision.documentId}:${bindingProvision.code}`) ?? []
    : [];
  const expectedDefinedTerms = test.bindingDefinedTerms;
  const definedTermsOk = expectedDefinedTerms.length > 0 ? setEqualsCaseInsensitive(expectedDefinedTerms, actualDefinedTerms) : null;

  const failed = numericOk === false || bindingOk === false || definedTermsOk === false;
  const detailParts: string[] = [];
  if (numericOk === false) detailParts.push(`expected ${money(expected)} (±${money(tolerance)}), got ${money(computed)}`);
  if (bindingOk === false) detailParts.push(`expected binding provision "${test.bindingProvision}", got "${bindingProvision?.code ?? "none"}"`);
  if (definedTermsOk === false) {
    detailParts.push(`expected defined terms [${expectedDefinedTerms.join(", ")}], got [${actualDefinedTerms.join(", ")}]`);
  }

  return {
    outcome: failed ? "FAIL" : "PASS",
    computed,
    numericOk,
    bindingLabel: bindingProvision?.code ?? null,
    bindingSectionRef: bindingProvision?.sectionRef ?? null,
    bindingOk,
    actualDefinedTerms,
    expectedDefinedTerms,
    definedTermsOk,
    detail: detailParts.join("; ") || "matches expected answer, binding provision, and defined terms",
  };
}

async function main() {
  const tests = await prisma.goldenTest.findMany({
    where: { companyId: COHERENT_COMPANY.id },
    orderBy: { createdAt: "asc" },
  });

  if (tests.length === 0) {
    console.log("No golden tests found for", COHERENT_COMPANY.name, "- populate the golden_tests table to run the regression suite.");
    return;
  }

  const data = await loadCompanyCovenantData(prisma, COHERENT_COMPANY.id);
  const position = computeCovenantPosition(data);

  const provisionRows = await prisma.covenantProvision.findMany({
    where: { companyId: COHERENT_COMPANY.id },
    include: { definedTerms: true },
  });
  const definedTermsByKey = new Map<string, string[]>();
  for (const p of provisionRows) {
    definedTermsByKey.set(`${p.documentId}:${p.code}`, p.definedTerms.map((t) => t.termName));
  }

  let pass = 0;
  let fail = 0;
  let flagged = 0;
  let errored = 0;

  console.log(`\nGolden test run — ${COHERENT_COMPANY.name} — ${tests.length} question(s)\n${"=".repeat(72)}`);

  for (const [i, test] of tests.entries()) {
    let result: EvalResult;
    try {
      result = evaluateGoldenTest(test, data, position, definedTermsByKey);
    } catch (err) {
      result = {
        outcome: "ERROR",
        computed: null,
        numericOk: null,
        bindingLabel: null,
        bindingSectionRef: null,
        bindingOk: null,
        actualDefinedTerms: [],
        expectedDefinedTerms: test.bindingDefinedTerms,
        definedTermsOk: null,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    if (result.outcome === "PASS") pass++;
    else if (result.outcome === "FAIL") fail++;
    else if (result.outcome === "FLAGGED") flagged++;
    else errored++;

    const badge = { PASS: "✓ PASS", FAIL: "✗ FAIL", FLAGGED: "⚑ FLAGGED", ERROR: "‼ ERROR" }[result.outcome];
    console.log(`\n[${i + 1}/${tests.length}] ${badge}  (${test.status.toLowerCase()})`);
    console.log(`  Q: ${test.question}`);
    if (result.outcome === "FLAGGED") {
      console.log(`  ${result.detail}`);
    } else {
      console.log(`  computed: ${money(result.computed)}${test.expectedAnswer !== null ? ` (expected ${money(Number(test.expectedAnswer))})` : ""}`);
      if (result.bindingLabel) {
        console.log(`  binding: ${result.bindingLabel} (${result.bindingSectionRef})`);
        console.log(`  defined terms: ${result.actualDefinedTerms.join(", ") || "(none linked)"}`);
      } else if (test.bindingProvision) {
        console.log(`  binding: none found (expected "${test.bindingProvision}")`);
      }
      if (result.outcome !== "PASS") console.log(`  ${result.detail}`);
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(
    `${pass} passed, ${fail} failed, ${flagged} flagged out-of-scope, ${errored} errored (${tests.length} total)`
  );

  if (fail > 0 || errored > 0) {
    console.log("\nFAILING. Fix the engine or correct the golden_tests row before merging.");
    process.exitCode = 1;
  } else {
    console.log("\nAll executable golden tests pass.");
    process.exitCode = 0;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
