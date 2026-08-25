/**
 * The permanent regression suite. Every row in golden_tests is a lawyer-
 * reviewable question with a mechanically-executable form (queryType +
 * queryParams); this script runs each one against the LIVE database and the
 * SAME engine functions the app uses, and reports pass/fail against up to
 * four independent things:
 *   1. expectedAnswer, within tolerance - the number (only checked when the
 *      engine actually reached a "modeled" / "clear" / "blocked" result).
 *   2. expectedStatus (optional, in queryParams) - the fail-closed status
 *      (EvaluationStatus/TransactionStatus) the engine returned, so a golden
 *      row can assert "this should come back not_tested" or "review_required"
 *      without needing a number at all.
 *   3. bindingProvision - which basket/test the engine says is actually
 *      binding, so a change that gets the number right for the wrong reason
 *      still fails.
 *   4. bindingDefinedTerms - the defined terms that binding provision is
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
 *
 * This script defaults to Coherent (the only seeded company) purely because
 * there's no multi-tenant account selection yet - `npm run golden-test -- <companyId>`
 * runs it against any other company's golden_tests rows instead.
 */
import { PrismaClient, type GoldenTest } from "@prisma/client";
import {
  computeCovenantPosition,
  loadCompanyCovenantData,
  loadCompanySolverStaticData,
  simulateAssetSale,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type AssetSaleSimulation,
  type CompanyCovenantData,
  type CovenantPosition,
  type CovenantProvisionInput,
  type DebtIncurrenceSimulation,
  type EvaluationStatus,
  type RestrictedPaymentKind,
  type RestrictedPaymentSimulation,
  type SolverNativeCompanyContext,
  type TransactionStatus,
} from "../lib/covenant-engine";
import type { EntityClass, GuarantorStatus, Permission } from "../lib/solver/types";
import { COHERENT_COMPANY } from "../prisma/seed-data";

const prisma = new PrismaClient();

type Outcome = "PASS" | "FAIL" | "FLAGGED" | "ERROR";
type AnyStatus = EvaluationStatus | TransactionStatus;

/**
 * Reused, not reinvented, from docs/coherent-phase8-population-reconciliation.md
 * §P ("Difference classifications") — the vocabulary that document already
 * established for characterizing a legacy-vs-solver-native disagreement.
 * `HARNESS_COVERAGE_GAP` is the one addition: none of §P's eight categories
 * describe "no legacy model was ever populated for this document at all"
 * (Matthews went solver-native from the start — see
 * scripts/populate-matthews-solver-native.ts's header) — that is not a
 * disagreement between two populated models (LEGACY_MODEL_ERROR presupposes
 * a legacy formula that computed something wrong), nor genuine legal/data
 * uncertainty (UNKNOWN_REVIEW_REQUIRED) — it is this harness's own prior
 * failure to invoke the only model that ever existed for that scope.
 */
type DiscrepancyCategory =
  | "LEGACY_MODEL_ERROR"
  | "SOLVER_CONFIGURATION_ERROR"
  | "SOLVER_ENGINE_ERROR"
  | "FINANCIAL_INPUT_DIFFERENCE"
  | "LEGAL_SPEC_AMBIGUITY"
  | "EXPECTED_ANSWER_STALE"
  | "REPRESENTATION_DIFFERENCE_ONLY"
  | "UNKNOWN_REVIEW_REQUIRED"
  | "HARNESS_COVERAGE_GAP";

interface Discrepancy {
  category: DiscrepancyCategory;
  justification: string;
  legacyOnlyOutcome: Outcome;
  legacyStatus: AnyStatus | null;
  legacyComputed: number | null;
  solverStatus: AnyStatus | null;
  solverComputed: number | null;
}

interface EvalResult {
  outcome: Outcome;
  computed: number | null;
  numericOk: boolean | null;
  status: AnyStatus | null;
  expectedStatus: string | null;
  statusOk: boolean | null;
  bindingLabel: string | null;
  bindingSectionRef: string | null;
  bindingOk: boolean | null;
  actualDefinedTerms: string[];
  expectedDefinedTerms: string[];
  definedTermsOk: boolean | null;
  detail: string;
  /** Informational only — never affects outcome. Explains what solver-native-aware grading did (or explicitly could not do) for this row. */
  solverNote: string | null;
  /** Present only when solver-native-aware grading produced a DIFFERENT actual (status or number) than legacy-only grading would have for this same row. */
  discrepancy: Discrepancy | null;
}

function money(n: number | null): string {
  if (n === null) return "n/a";
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/** Shape both a legacy CovenantProvisionInput and a solver-native Permission (adapted) satisfy, for binding-citation matching. */
interface BindingLike {
  code: string;
  basketName: string;
  sectionRef: string;
  documentId: string;
}

/** A golden row's bindingProvision may name a provision by code, basket name, or section ref — true regardless of whether the binding came from the legacy engine or the solver. */
function matchesBindingLabel(expected: string, provision: BindingLike): boolean {
  const e = normalize(expected);
  return (
    e === normalize(provision.code) ||
    normalize(provision.basketName).includes(e) ||
    normalize(provision.sectionRef).includes(e) ||
    e.includes(normalize(provision.code))
  );
}

/** Adapts a solver-native Permission (won by the solver as the binding leg of a DEBT_SIMULATION) into the same BindingLike shape a legacy CovenantProvisionInput satisfies, so one matching/reporting path serves both engines. */
function permissionAsBindingLike(p: Permission): BindingLike {
  return { code: p.code ?? p.id, basketName: p.action, sectionRef: p.sourceProvision.sectionRef, documentId: p.documentId };
}

/** Permission.definedTermRefs stores defined-term ids by convention (mirroring loadCompanySolverStaticData's own mapping) — resolved to display names via the same id->termName map built once in main(). A ref that isn't a known id (e.g. a literal name, for a population that didn't go through the id convention) is passed through unchanged rather than dropped. */
function permissionDefinedTermNames(p: Permission, definedTermIdToName: Map<string, string>): string[] {
  return (p.sourceProvision.definedTermIds ?? []).map((ref) => definedTermIdToName.get(ref) ?? ref);
}

/** Company-specific transaction context the two already-live-verified shadow-run scripts (scripts/coherent-shadow-run.ts, scripts/matthews-shadow-run.ts) established and exercised — reused verbatim here rather than re-derived, per those scripts being this repo's own precedent for "how do you build a real SolverNativeCompanyContext for this company." A companyId outside this table (there is none today besides Coherent/Matthews) falls back to a generic, conservative default that still round-trips correctly: zero Permission/SolverCoverageDeclaration rows for an unrecognized company makes every document/side resolve LEGACY/NOT_TESTED regardless of these entity-context fields' exact values. */
const SOLVER_CONTEXT_ENTITY_DEFAULTS: Record<string, { entityClasses: EntityClass[]; incurringEntity: { id: string; name: string }; guarantorStatus: GuarantorStatus }> = {
  coherent: { entityClasses: ["BORROWER"], incurringEntity: { id: "coherent-borrower", name: "Coherent Corp." }, guarantorStatus: "GUARANTOR" },
  matthews: { entityClasses: ["BORROWER"], incurringEntity: { id: "matw-borrower", name: "Matthews International Corporation (Borrower)" }, guarantorStatus: "GUARANTOR" },
};

/**
 * Builds the real SolverNativeCompanyContext for `companyId`, exactly as
 * scripts/coherent-shadow-run.ts and scripts/matthews-shadow-run.ts already
 * do (the only two places in this repo that have ever driven a populated
 * solverContext through simulateDebtIncurrence): loadCompanySolverStaticData
 * for the DB read (the same function lib/coherent.ts's getSolverStaticData
 * wraps for the live app), plus the per-company entity/collateral fields
 * those two scripts already established and live-verified. Never
 * reimplements the DB read.
 */
async function buildSolverContext(companyId: string, asOfDate: Date): Promise<SolverNativeCompanyContext> {
  const staticData = await loadCompanySolverStaticData(prisma, companyId, asOfDate);
  const entityDefaults = SOLVER_CONTEXT_ENTITY_DEFAULTS[companyId] ?? {
    entityClasses: ["BORROWER"] as EntityClass[],
    incurringEntity: { id: `${companyId}-borrower`, name: companyId },
    guarantorStatus: "GUARANTOR" as GuarantorStatus,
  };
  return {
    ...staticData,
    activationState: { asOfDate, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() },
    asOfDate,
    ...entityDefaults,
    collateralPools: [],
    requestedLienPriority: [],
  };
}

/**
 * Classifies a DEBT_SIMULATION row where solver-native-aware grading
 * produced a different actual (status or number) than legacy-only grading
 * would have, using docs/coherent-phase8-population-reconciliation.md §P's
 * vocabulary (plus HARNESS_COVERAGE_GAP — see its definition above). A
 * best-effort heuristic, not a legal determination: rows landing in
 * UNKNOWN_REVIEW_REQUIRED are exactly the ones that need a human to look,
 * which is the honest outcome when the heuristic itself can't tell.
 */
function classifyDebtSimDiscrepancy(params: {
  legacyStatus: TransactionStatus;
  legacyComputed: number | null;
  solverStatus: TransactionStatus;
  solverComputed: number | null;
  expectedAnswer: number | null;
  companyHasLegacyCapacityFormulas: boolean;
  legacyBindingCode: string | null;
  solverBindingCode: string | null;
  expectedBindingCode: string | null;
}): { category: DiscrepancyCategory; justification: string } {
  const { legacyStatus, legacyComputed, solverStatus, solverComputed, expectedAnswer, companyHasLegacyCapacityFormulas, legacyBindingCode, solverBindingCode, expectedBindingCode } =
    params;

  if (!companyHasLegacyCapacityFormulas) {
    return {
      category: "HARNESS_COVERAGE_GAP",
      justification:
        "No legacy CapacityExpr/CovenantProvision configuration was ever populated for this company (solver-native from the start) - " +
        "the previous legacy-only result reflects this harness never invoking solverContext, not two populated models disagreeing.",
    };
  }

  const closeToExpected = (v: number | null) => v !== null && expectedAnswer !== null && Math.abs(v - expectedAnswer) < 1;
  const bothResolved = (s: TransactionStatus) => s !== "not_tested" && s !== "review_required";
  const numberOrStatusDiffers = legacyStatus !== solverStatus || Math.abs((legacyComputed ?? NaN) - (solverComputed ?? NaN)) > 1e-6;

  if (bothResolved(legacyStatus) && bothResolved(solverStatus)) {
    if (closeToExpected(legacyComputed) && !closeToExpected(solverComputed)) {
      return {
        category: "EXPECTED_ANSWER_STALE",
        justification: `expectedAnswer (${expectedAnswer}) matches the legacy figure (${legacyComputed}); solver-native now computes ${solverComputed} - the stored expectation reflects the pre-correction legacy model.`,
      };
    }
    if (closeToExpected(solverComputed) && !closeToExpected(legacyComputed)) {
      return {
        category: "LEGACY_MODEL_ERROR",
        justification: `Legacy computed ${legacyComputed}; solver-native computes ${solverComputed}, matching expectedAnswer (${expectedAnswer}) - the legacy formula under/overstates true capacity.`,
      };
    }
    if (!numberOrStatusDiffers) {
      // Same verdict and figure, only the cited binding provision changed -
      // exactly docs/coherent-phase8-population-reconciliation.md §P's
      // already-established "same verdict, different (and more complete)
      // binding-permission citation" pattern for scenarios C-E/H-J.
      return {
        category: "REPRESENTATION_DIFFERENCE_ONLY",
        justification: `Same verdict and figure (${solverComputed}) under both paths; only the cited binding provision changed (legacy "${legacyBindingCode ?? "none"}" -> solver-native "${solverBindingCode ?? "none"}", golden row expects "${expectedBindingCode ?? "none"}") - the solver's own election logic cleared the same amount via a different, equally-valid alternative permission, not a capacity disagreement.`,
      };
    }
    return {
      category: "REPRESENTATION_DIFFERENCE_ONLY",
      justification: `Both paths resolve (legacy ${legacyComputed}, solver-native ${solverComputed}) with no clear preference against expectedAnswer (${expectedAnswer}) - treated as a citation/representation difference, not a methodology disagreement, pending review.`,
    };
  }

  return {
    category: "UNKNOWN_REVIEW_REQUIRED",
    justification: `Legacy (${legacyStatus}/${legacyComputed ?? "n/a"}) and solver-native (${solverStatus}/${solverComputed ?? "n/a"}) disagree in a way the heuristic above doesn't resolve with confidence - flagged for manual review rather than guessed.`,
  };
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
  return sim.binding?.bindingProvision ?? null;
}

function rpBindingProvision(
  sim: RestrictedPaymentSimulation,
  data: CompanyCovenantData,
  position: CovenantPosition,
  documentId: string,
  kind: RestrictedPaymentKind
): CovenantProvisionInput | null {
  if (sim.status === "clear" && sim.steps.length > 0) {
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
  definedTermsByKey: Map<string, string[]>,
  solverContext: SolverNativeCompanyContext,
  companyHasLegacyCapacityFormulas: boolean,
  definedTermIdToName: Map<string, string>
): EvalResult {
  if (test.queryType === "OUT_OF_SCOPE") {
    return {
      outcome: "FLAGGED",
      computed: null,
      numericOk: null,
      status: null,
      expectedStatus: null,
      statusOk: null,
      bindingLabel: null,
      bindingSectionRef: null,
      bindingOk: null,
      actualDefinedTerms: [],
      expectedDefinedTerms: [],
      definedTermsOk: null,
      detail: test.reviewerNotes ?? "Out of scope for this phase - not attempted.",
      solverNote: null,
      discrepancy: null,
    };
  }

  const params = (test.queryParams ?? {}) as Record<string, unknown>;
  const expectedStatus = (params.expectedStatus as string | undefined) ?? null;
  const expectedAnswer = test.expectedAnswer !== null ? Number(test.expectedAnswer) : null;
  let computed: number | null = null;
  let status: AnyStatus | null = null;
  let bindingProvision: BindingLike | null = null;
  let solverNote: string | null = null;
  let discrepancy: Discrepancy | null = null;
  /** Set only for a solver-bound DEBT_SIMULATION row (Permission.definedTermRefs has no counterpart in definedTermsByKey, which only indexes legacy CovenantProvision rows). Null elsewhere, meaning "use definedTermsByKey as usual." */
  let solverBoundDefinedTerms: string[] | null = null;

  // LEVERAGE_METRIC/PROVISION_CAPACITY/DOCUMENT_CAPACITY/CROSS_DOCUMENT_CAPACITY
  // all read `position` (computeCovenantPosition's output) directly, and
  // computeCovenantPosition has NO solverContext parameter — solver-native
  // routing is wired ONLY into simulateDebtIncurrence (lib/covenant-engine.ts,
  // see the file header comment on "Solver-native live routing"). This is a
  // confirmed, real architecture boundary, not an oversight of this fix: these
  // four query types cannot be solver-native-graded with the engine's current
  // live-wired boundary. Extending them would mean adding a solver-native path
  // to computeCovenantPosition itself, in lib/covenant-engine.ts - out of this
  // task's script-only scope (see docs/golden-harness-solver-native-grading-fix.md §A).
  const NO_SOLVER_EQUIVALENT =
    "N/A - computeCovenantPosition has no solverContext parameter; solver-native routing is wired only into simulateDebtIncurrence. " +
    "This queryType reads position.provisionCapacities/documents/crossDocument* directly, which have no solver-native counterpart. " +
    "Confirmed architecture gap (lib/covenant-engine.ts), not a script-level omission - see report §A.";

  switch (test.queryType) {
    case "LEVERAGE_METRIC": {
      const metric = params.metric as string;
      computed = readNumericMetric(position.metrics as unknown as Record<string, unknown>, metric);
      // A raw leverage ratio isn't itself computed from one provision, but a
      // golden row MAY optionally name the provision that states the threshold
      // this ratio is tested against, for citation-traceability checking.
      const bindingDocumentId = params.bindingProvisionDocumentId as string | undefined;
      const bindingCode = params.bindingProvisionCode as string | undefined;
      if (bindingDocumentId && bindingCode) {
        bindingProvision = position.provisionCapacities.get(`${bindingDocumentId}:${bindingCode}`)?.provision ?? null;
      }
      solverNote = NO_SOLVER_EQUIVALENT;
      break;
    }
    case "PROVISION_CAPACITY": {
      const documentId = params.documentId as string;
      const provisionCode = params.provisionCode as string;
      const evaluated = position.provisionCapacities.get(`${documentId}:${provisionCode}`);
      if (!evaluated) throw new Error(`Unknown provision ${documentId}:${provisionCode}`);
      status = evaluated.status;
      computed = evaluated.status === "modeled" ? evaluated.capacity ?? null : null;
      bindingProvision = evaluated.provision;
      solverNote = NO_SOLVER_EQUIVALENT;
      break;
    }
    case "DOCUMENT_CAPACITY": {
      const documentId = params.documentId as string;
      const secured = Boolean(params.secured);
      const doc = position.documents.find((d) => d.documentId === documentId);
      if (!doc) throw new Error(`Unknown document ${documentId}`);
      status = secured ? doc.securedStatus : doc.unsecuredStatus;
      computed = status === "modeled" ? (secured ? doc.securedCapacity : doc.unsecuredCapacity) ?? null : null;
      bindingProvision = (secured ? doc.securedBindingProvision : doc.unsecuredBindingProvision) ?? null;
      solverNote = NO_SOLVER_EQUIVALENT;
      break;
    }
    case "CROSS_DOCUMENT_CAPACITY": {
      const secured = Boolean(params.secured);
      const cross = secured ? position.crossDocumentSecured : position.crossDocumentUnsecured;
      status = cross.status;
      computed = cross.status === "modeled" ? cross.capacity ?? null : null;
      bindingProvision = cross.bindingProvision ?? null;
      solverNote = NO_SOLVER_EQUIVALENT;
      break;
    }
    case "DEBT_SIMULATION": {
      const amount = Number(params.amount);
      const secured = Boolean(params.secured);
      const metric = params.metric as string;

      // Legacy-only (exactly today's pre-fix harness behavior - no
      // solverContext) computed purely for the discrepancy comparison below;
      // never the source of the row's outcome any more.
      const legacySim = simulateDebtIncurrence(data, position, amount, secured);
      // Solver-native-aware: the SAME call the live application makes when a
      // solverContext is supplied - resolveDocumentSideCoverage decides,
      // per-document/side, whether that document routes to the solver or
      // falls back to legacy in full (never partially). This is the row's
      // new, authoritative "actual."
      const solverSim = simulateDebtIncurrence(data, position, amount, secured, solverContext);

      const readDebtMetric = (sim: DebtIncurrenceSimulation): number => {
        if (metric === "cleared") return sim.status === "clear" ? 1 : 0;
        const remainingAfterAmount = sim.overallCapacity !== undefined ? sim.overallCapacity - amount : undefined;
        return readNumericMetric(
          { overallCapacity: sim.overallCapacity, remainingAfterAmount, ...sim.proForma } as unknown as Record<string, unknown>,
          metric
        );
      };

      const legacyComputed = readDebtMetric(legacySim);
      const solverComputed = readDebtMetric(solverSim);

      status = solverSim.status;
      computed = solverComputed;

      const solverBindingPermission = solverSim.binding?.solverResult?.permissionPathUsed?.legs[0]?.permissionId;
      if (solverBindingPermission) {
        const perm = solverContext.permissions.find((p) => p.id === solverBindingPermission);
        if (perm) {
          bindingProvision = permissionAsBindingLike(perm);
          // bindingDefinedTerms, for a solver-bound permission, comes from
          // Permission.definedTermRefs (resolved via definedTermIdToName) -
          // definedTermsByKey only indexes legacy CovenantProvision rows.
          solverBoundDefinedTerms = permissionDefinedTermNames(perm, definedTermIdToName);
        }
      } else {
        bindingProvision = debtBindingProvision(solverSim);
      }

      // "Differs" covers everything a golden row actually asserts against a
      // DEBT_SIMULATION result (task requirement 3 - "in either direction"):
      // not just the status/number, but also WHICH provision the engine now
      // cites as binding, since Coherent's rich, multi-alternative Permission
      // graph frequently lets the solver's own election logic clear the same
      // amount via a different (equally valid) permission than the legacy
      // CapacityExpr's single deterministic MIN/REF path picked - exactly the
      // "same verdict, different (and more complete) binding-permission
      // citation" pattern docs/coherent-phase8-population-reconciliation.md
      // §P already classified REPRESENTATION_DIFFERENCE_ONLY for scenarios
      // C-E/H-J, now confirmed machine-verified here for the first time.
      const legacyBindingCode = debtBindingProvision(legacySim)?.code ?? null;
      const solverBindingCode = bindingProvision?.code ?? null;
      const statusDiffers = legacySim.status !== solverSim.status;
      const valueDiffers = Math.abs((legacyComputed ?? NaN) - (solverComputed ?? NaN)) > 1e-6 || Number.isNaN(legacyComputed) !== Number.isNaN(solverComputed);
      const bindingDiffers = normalize(legacyBindingCode ?? "") !== normalize(solverBindingCode ?? "");
      if (statusDiffers || valueDiffers || bindingDiffers) {
        const legacyOutcome = classifyLegacyOutcome(test, legacySim.status, legacyComputed, expectedAnswer, expectedStatus);
        const { category, justification } = classifyDebtSimDiscrepancy({
          legacyStatus: legacySim.status,
          legacyComputed,
          solverStatus: solverSim.status,
          solverComputed,
          expectedAnswer,
          companyHasLegacyCapacityFormulas,
          legacyBindingCode,
          solverBindingCode,
          expectedBindingCode: test.bindingProvision,
        });
        discrepancy = {
          category,
          justification,
          legacyOnlyOutcome: legacyOutcome,
          legacyStatus: legacySim.status,
          legacyComputed,
          solverStatus: solverSim.status,
          solverComputed,
        };
      }
      break;
    }
    case "RP_SIMULATION": {
      const documentId = params.documentId as string;
      const amount = Number(params.amount);
      const kind = params.kind as RestrictedPaymentKind;
      const metric = params.metric as string;
      const sim = simulateRestrictedPayment(data, position, documentId, amount, kind);
      status = sim.status;
      if (metric === "cleared") {
        computed = sim.status === "clear" ? 1 : 0;
      } else {
        computed = readNumericMetric(
          { remaining: sim.remaining, poolUsed: sim.poolUsed, proFormaTotalNetLeverage: sim.proFormaTotalNetLeverage } as unknown as Record<
            string,
            unknown
          >,
          metric
        );
      }
      bindingProvision = rpBindingProvision(sim, data, position, documentId, kind);
      break;
    }
    case "ASSET_SALE_SIMULATION": {
      const documentId = params.documentId as string;
      const amount = Number(params.amount);
      const reinvest = Boolean(params.reinvest);
      const metric = params.metric as string;
      const sim: AssetSaleSimulation = simulateAssetSale(data, position, documentId, amount, reinvest);
      status = sim.status;
      computed = sim.status === "clear" ? readNumericMetric(sim as unknown as Record<string, unknown>, metric) : null;
      bindingProvision = assetSaleBindingProvision(data, position, documentId);
      break;
    }
    default:
      throw new Error(`Unknown query type: ${test.queryType}`);
  }

  const expected = expectedAnswer;
  const tolerance = test.tolerance !== null ? Number(test.tolerance) : 0;
  const numericOk = expected === null ? null : computed === null ? false : Math.abs(computed - expected) <= tolerance;

  const statusOk = expectedStatus ? status === expectedStatus : null;

  const bindingOk = test.bindingProvision ? (bindingProvision ? matchesBindingLabel(test.bindingProvision, bindingProvision) : false) : null;

  const actualDefinedTerms =
    solverBoundDefinedTerms ?? (bindingProvision ? definedTermsByKey.get(`${bindingProvision.documentId}:${bindingProvision.code}`) ?? [] : []);
  const expectedDefinedTerms = test.bindingDefinedTerms;
  const definedTermsOk = expectedDefinedTerms.length > 0 ? setEqualsCaseInsensitive(expectedDefinedTerms, actualDefinedTerms) : null;

  const failed = numericOk === false || statusOk === false || bindingOk === false || definedTermsOk === false;
  const detailParts: string[] = [];
  if (numericOk === false) detailParts.push(`expected ${money(expected)} (±${money(tolerance)}), got ${money(computed)}`);
  if (statusOk === false) detailParts.push(`expected status "${expectedStatus}", got "${status ?? "none"}"`);
  if (bindingOk === false) detailParts.push(`expected binding provision "${test.bindingProvision}", got "${bindingProvision?.code ?? "none"}"`);
  if (definedTermsOk === false) {
    detailParts.push(`expected defined terms [${expectedDefinedTerms.join(", ")}], got [${actualDefinedTerms.join(", ")}]`);
  }

  return {
    outcome: failed ? "FAIL" : "PASS",
    computed,
    numericOk,
    status,
    expectedStatus,
    statusOk,
    bindingLabel: bindingProvision?.code ?? null,
    bindingSectionRef: bindingProvision?.sectionRef ?? null,
    bindingOk,
    actualDefinedTerms,
    expectedDefinedTerms,
    definedTermsOk,
    detail: detailParts.join("; ") || "matches expected answer, status, binding provision, and defined terms",
    solverNote,
    discrepancy,
  };
}

/** What legacy-only grading (today's pre-fix harness) would have reported for this DEBT_SIMULATION row, for the "was this test previously passing against a stale/legacy-only comparison" report requirement. Mirrors evaluateGoldenTest's own PASS/FAIL logic, narrowly, for the legacy actual only. */
function classifyLegacyOutcome(
  test: GoldenTest,
  legacyStatus: TransactionStatus,
  legacyComputed: number | null,
  expectedAnswer: number | null,
  expectedStatus: string | null
): Outcome {
  const tolerance = test.tolerance !== null ? Number(test.tolerance) : 0;
  const numericOk = expectedAnswer === null ? null : legacyComputed === null ? false : Math.abs(legacyComputed - expectedAnswer) <= tolerance;
  const statusOk = expectedStatus ? legacyStatus === expectedStatus : null;
  // Binding-provision/defined-terms checks are deliberately not replayed here
  // (the legacy DEBT_SIMULATION path never populated a meaningful binding
  // provision for a not_tested/review_required result, and Matthews's own
  // pre-fix binding/defined-terms failures are already fully explained by
  // §F.5 of docs/matthews-international-onboarding.md) - this narrow replay
  // answers exactly the report's own question ("was the NUMBER/STATUS
  // verdict previously passing against a stale comparison"), not a full
  // re-run of every historical assertion.
  return numericOk === false || statusOk === false ? "FAIL" : "PASS";
}

async function main() {
  const companyId = process.argv[2] ?? COHERENT_COMPANY.id;

  const tests = await prisma.goldenTest.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });

  if (tests.length === 0) {
    console.log("No golden tests found for", companyId, "- populate the golden_tests table to run the regression suite.");
    return;
  }

  const asOfDate = new Date();
  const data = await loadCompanyCovenantData(prisma, companyId, asOfDate);
  const position = computeCovenantPosition(data);

  // Always attempt to build the real SolverNativeCompanyContext, per the same
  // routing the live application uses (task requirement 1) - a company with
  // zero Permission/SolverCoverageDeclaration rows naturally yields empty
  // arrays here, which resolveDocumentSideCoverage already treats as "fall
  // back to LEGACY/NOT_TESTED in full" (lib/solver/coverage.ts), so this is
  // safe to build unconditionally for any companyId.
  const solverContext = await buildSolverContext(companyId, asOfDate);
  console.log(
    `Solver-native context: ${solverContext.permissions.length} permission(s), ${solverContext.relationships.length} relationship(s), ` +
      `${solverContext.coverageDeclarations.length} coverage declaration(s) loaded for "${companyId}".`
  );

  const companyHasLegacyCapacityFormulas = data.documents.some((d) => d.capacityFormulas?.secured || d.capacityFormulas?.unsecured);

  const provisionRows = await prisma.covenantProvision.findMany({
    where: { companyId },
    include: { definedTerms: true },
  });
  const definedTermsByKey = new Map<string, string[]>();
  for (const p of provisionRows) {
    definedTermsByKey.set(`${p.documentId}:${p.code}`, p.definedTerms.map((t) => t.termName));
  }

  // id -> termName, for resolving solver-native Permission.definedTermRefs
  // (which, per loadCompanySolverStaticData's own mapping, stores defined-term
  // ids by convention) - built once, company-wide, rather than per-row.
  const definedTermRows = await prisma.definedTerm.findMany({ where: { document: { companyId } } });
  const definedTermIdToName = new Map<string, string>(definedTermRows.map((t) => [t.id, t.termName]));

  let pass = 0;
  let fail = 0;
  let flagged = 0;
  let errored = 0;
  const discrepancies: { question: string; queryType: string; discrepancy: Discrepancy }[] = [];

  console.log(`\nGolden test run — ${companyId} — ${tests.length} question(s)\n${"=".repeat(72)}`);

  for (const [i, test] of tests.entries()) {
    let result: EvalResult;
    try {
      result = evaluateGoldenTest(test, data, position, definedTermsByKey, solverContext, companyHasLegacyCapacityFormulas, definedTermIdToName);
    } catch (err) {
      result = {
        outcome: "ERROR",
        computed: null,
        numericOk: null,
        status: null,
        expectedStatus: null,
        statusOk: null,
        bindingLabel: null,
        bindingSectionRef: null,
        bindingOk: null,
        actualDefinedTerms: [],
        expectedDefinedTerms: test.bindingDefinedTerms,
        definedTermsOk: null,
        detail: err instanceof Error ? err.message : String(err),
        solverNote: null,
        discrepancy: null,
      };
    }

    if (result.discrepancy) discrepancies.push({ question: test.question, queryType: test.queryType, discrepancy: result.discrepancy });

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
      console.log(
        `  computed: ${money(result.computed)}${test.expectedAnswer !== null ? ` (expected ${money(Number(test.expectedAnswer))})` : ""}${
          result.status ? ` [status: ${result.status}]` : ""
        }`
      );
      if (result.bindingLabel) {
        console.log(`  binding: ${result.bindingLabel} (${result.bindingSectionRef})`);
        console.log(`  defined terms: ${result.actualDefinedTerms.join(", ") || "(none linked)"}`);
      } else if (test.bindingProvision) {
        console.log(`  binding: none found (expected "${test.bindingProvision}")`);
      }
      if (result.outcome !== "PASS") console.log(`  ${result.detail}`);
      if (result.solverNote) console.log(`  solver-native: ${result.solverNote}`);
      if (result.discrepancy) {
        const d = result.discrepancy;
        console.log(
          `  ⚠ solver-native-aware actual DIFFERS from legacy-only: legacy=${money(d.legacyComputed)} [${d.legacyStatus}] (legacy-only would have been ${d.legacyOnlyOutcome}) ` +
            `vs. solver-native=${money(d.solverComputed)} [${d.solverStatus}]`
        );
        console.log(`  ⚠ classification: ${d.category} — ${d.justification}`);
      }
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(
    `${pass} passed, ${fail} failed, ${flagged} flagged out-of-scope, ${errored} errored (${tests.length} total)`
  );

  if (discrepancies.length === 0) {
    console.log(`\nSolver-native-aware grading: 0 row(s) differ from what legacy-only grading would have reported.`);
  } else {
    console.log(
      `\nSolver-native-aware grading: ${discrepancies.length} row(s) differ from what legacy-only grading would have reported ` +
        `(engine output changed by wiring solverContext through - see docs/golden-harness-solver-native-grading-fix.md):`
    );
    for (const { question, queryType, discrepancy: d } of discrepancies) {
      console.log(`  - [${queryType}] ${question}`);
      console.log(
        `      legacy-only: ${money(d.legacyComputed)} [${d.legacyStatus}] (would have graded ${d.legacyOnlyOutcome})  |  solver-native-aware: ${money(d.solverComputed)} [${d.solverStatus}]`
      );
      console.log(`      ${d.category}: ${d.justification}`);
    }
  }

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
