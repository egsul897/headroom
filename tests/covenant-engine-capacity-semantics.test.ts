/**
 * Capacity-semantics tests (task §12 of
 * docs/result-semantics-headroom-cleanup.md): proves the generalized fix for
 * the Q22 tautology - a solver-native CLEAR result does NOT imply
 * `maximumCapacity === testedAmount`, `remainingCapacity` is never a
 * fabricated zero, post-transaction headroom is recomputed from a real
 * post-transaction state (never `preMax - amount`), and `selectedPath` is
 * kept distinct from `bindingConstraint`.
 *
 * Pure in-memory fixtures throughout (no Prisma/DB) - `computeCovenantPosition`,
 * `simulateDebtIncurrence`, `computeRemainingCapacityAfterDebtIncurrence`, and
 * `runSolverForDocument` are all pure functions over plain data, exactly like
 * tests/solver/service.test.ts's style.
 */
import { describe, expect, it } from "vitest";
import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  deriveBindingConstraint,
  runSolverForDocument,
  simulateDebtIncurrence,
  type CompanyCovenantData,
  type FinancialSnapshotInput,
  type SolverNativeCompanyContext,
} from "../lib/covenant-engine";
import type { ActivationState, MaxCapacityResult, Permission, PermissionPathLeg } from "../lib/solver/types";

const AS_OF = new Date("2026-06-30");
const DOC = "flip-doc";

function permission(id: string, overrides: Partial<Permission> = {}): Permission {
  return {
    id,
    documentId: DOC,
    companyId: "flip-co",
    grantType: "DEBT_INCURRENCE",
    amountKind: "FIXED",
    action: `permission ${id}`,
    entityScope: [],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 100,
    eligibilityConditions: [],
    termConditions: [],
    measurementBasis: "CUMULATIVE_INCURRED",
    sourceProvision: { documentId: DOC, sectionRef: `§${id}` },
    modelingStatus: "MODELED",
    ...overrides,
  };
}

/**
 * F: a FIXED $600 basket, state-independent (its capacity never changes no
 * matter how much secured debt is outstanding).
 * R: an INCURRENCE_BASED, ratio-room permission (3.0x secured net leverage
 * on $500 EBITDA) - pre-transaction (netSecuredDebt = 700) its room is
 * 1500 - 700 = 800, the LOOSER (better) of the two, so it is the document's
 * pre-transaction `maximumCapacity`/bindingConstraint. After a $500M secured
 * draw (netSecuredDebt -> 1200), R's room collapses to 1500 - 1200 = 300 -
 * LESS than F's still-flat 600 - flipping which permission is actually best
 * post-transaction. This is the same real, empirically-observed mechanism
 * (docs/result-semantics-headroom-cleanup.md §G) that made Coherent's own
 * Q22 answer differ from naive subtraction, reproduced here in a minimal,
 * fully deterministic synthetic fixture.
 */
const PERM_F = permission("perm-f", { amountKind: "FIXED", formulaType: "FLAT_AMOUNT", thresholdValue: 600 });
const PERM_R = permission("perm-r", {
  amountKind: "INCURRENCE_BASED",
  formulaType: "LEVERAGE_RATIO_ROOM",
  thresholdValue: 3.0,
  params: { debtBasis: "secured" },
});

const FIN: FinancialSnapshotInput = {
  ebitda: 500,
  cash: 0,
  interestExpense: 50,
  cumulativeNetIncome: 0,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 6,
  totalDebt: 700,
  securedDebt: 700,
};

function fixtureData(): CompanyCovenantData {
  return {
    companyId: "flip-co",
    documents: [{ id: DOC, name: "Flip Document", type: "OTHER", capacityFormulas: null }],
    provisions: [],
    financials: FIN,
    ledger: [],
  };
}

function fixtureSolverContext(): SolverNativeCompanyContext {
  const activationState: ActivationState = { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() };
  return {
    permissions: [PERM_F, PERM_R],
    relationships: [],
    sharedConstraints: [],
    collateralScopes: [],
    ruleActivationConditions: [],
    coverageDeclarations: [{ documentId: DOC, side: "secured", grantType: "DEBT_INCURRENCE", isComplete: true }],
    activationState,
    asOfDate: AS_OF,
    entityClasses: ["BORROWER"],
    incurringEntity: { id: "borrower", name: "Borrower" },
    guarantorStatus: "GUARANTOR",
    collateralPools: [],
    requestedLienPriority: [],
  };
}

describe("Capacity semantics (task §12): CLEAR does not imply maximumCapacity === testedAmount", () => {
  it("A/E - a $500 CLEAR result reports maximumCapacity (800) distinct from and larger than testedAmount (500), never fabricated or absent when it IS determinable", () => {
    const data = fixtureData();
    const position = computeCovenantPosition(data);
    const ctx = fixtureSolverContext();
    const sim = simulateDebtIncurrence(data, position, 500, true, ctx);

    const doc = sim.perDocument[0]!;
    expect(doc.status).toBe("clear");
    expect(doc.testedAmount).toBe(500);
    // The old, buggy semantics: `capacity` (kept for backward compat) equals
    // testedAmount for a CLEAR solver-native result - this is the field the
    // Q22 bug read as if it were a maximum. It is NOT the fix's authoritative
    // maximum-capacity figure.
    expect(doc.capacity).toBe(500);
    // The FIX: `maximumCapacity` is the real, testedAmount-independent
    // ceiling (800, from permission R), never silently equal to 500.
    expect(doc.maximumCapacity).toEqual<MaxCapacityResult>(
      expect.objectContaining({ kind: "EXACT", amount: 800 })
    );
    expect(doc.maximumCapacity?.kind === "EXACT" && doc.maximumCapacity.amount).not.toBe(doc.testedAmount);
  });

  it("D/F - bindingConstraint (the tightest permission, R) is computed independently of selectedPath (whichever of F/R tie-broke the $500 clearing test)", () => {
    const data = fixtureData();
    const position = computeCovenantPosition(data);
    const ctx = fixtureSolverContext();
    const sim = simulateDebtIncurrence(data, position, 500, true, ctx);
    const doc = sim.perDocument[0]!;

    // bindingConstraint must cite permission R (the one whose own standalone
    // capacity, 800, is the SMALLEST among the winning maximumCapacity
    // election's own legs - trivially R itself here, since R's election is a
    // singleton) - never F, even though F ALSO validly clears $500.
    expect(doc.bindingConstraint).toEqual([expect.objectContaining({ permissionId: "perm-r" })]);

    // selectedPath is whichever CLEAR path the deterministic tie-break
    // picked for the $500 TESTED amount - both F and R validly clear $500,
    // so selectedPath is not required to equal bindingConstraint's
    // permission, and the test must not assume it does.
    expect(doc.selectedPath).toBeDefined();
    expect(["perm-f", "perm-r"]).toContain(doc.selectedPath!.legs[0]!.permissionId);
  });

  it("B/C/G - two equally valid clearing paths exist for the tested amount (solverResult.alternatives contains another CLEAR path) - real, structural evidence of multiplicity, not an assumption", () => {
    const data = fixtureData();
    const position = computeCovenantPosition(data);
    const ctx = fixtureSolverContext();
    const sim = simulateDebtIncurrence(data, position, 500, true, ctx);
    const solverResult = sim.perDocument[0]!.solverResult!;

    expect(solverResult.overall.status).toBe("CLEAR");
    expect(solverResult.alternatives.some((a) => a.path.status === "CLEAR")).toBe(true);
  });
});

describe("Capacity semantics (task §12): post-transaction remaining capacity is recomputed, not subtracted", () => {
  it("C/D - remainingCapacity after $500M is recomputed from the POST-transaction state (600, via a flip to permission F) - NOT preMax(800) - amount(500) = 300", () => {
    const data = fixtureData();
    const position = computeCovenantPosition(data);
    const ctx = fixtureSolverContext();

    const post = computeRemainingCapacityAfterDebtIncurrence(data, position, 500, true, ctx);

    expect(post.perDocument).toHaveLength(1);
    const doc = post.perDocument[0]!;
    expect(doc.method).toBe("SOLVER_NATIVE_RECOMPUTED");
    // The naive/legacy-style subtraction the Q22 bug effectively performed.
    const naiveSubtraction = 800 - 500;
    expect(naiveSubtraction).toBe(300);
    // The REAL post-transaction recomputation: R has collapsed to 300, but F
    // (state-independent) is now the better election at 600 - genuinely
    // larger than the naive subtraction, because capacity here is NOT a
    // linear, state-independent function of the tested amount alone.
    expect(doc.remainingCapacity).toBe(600);
    expect(doc.remainingCapacity).not.toBe(naiveSubtraction);
    expect(post.remainingCapacity).toBe(600);

    // The binding constraint has genuinely FLIPPED from R (pre-transaction)
    // to F (post-transaction) - a real permission-identity change driven by
    // the transaction's own effect on state, not a citation artifact.
    expect(doc.bindingConstraint).toEqual([expect.objectContaining({ permissionId: "perm-f" })]);
  });

  it("E - remainingCapacity is undefined (never a fabricated zero) when the post-transaction maximum is not a single EXACT figure", () => {
    // A rate of 0 makes COVERAGE_RATIO_ROOM unresolved (review_required) -
    // reused here as a minimal way to force a NOT-EXACT maximumCapacity
    // without touching any core solver algorithm.
    const data = fixtureData();
    data.financials = { ...FIN, assumedNewDebtRatePct: 0 };
    const position = computeCovenantPosition(data);
    const ctx: SolverNativeCompanyContext = {
      ...fixtureSolverContext(),
      permissions: [permission("perm-cov", { amountKind: "INCURRENCE_BASED", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2.0 })],
    };

    const post = computeRemainingCapacityAfterDebtIncurrence(data, position, 100, false, ctx);
    const doc = post.perDocument[0]!;
    expect(doc.remainingCapacity).toBeUndefined();
    expect(doc.reason).toBeDefined();
    expect(post.remainingCapacity).toBeUndefined();
    // Never silently 0 - undefined is the honest, explicit "not determinable".
    expect(doc.remainingCapacity).not.toBe(0);
  });

  it("fail-closed cross-document: remainingCapacity is undefined when ANY governing document/side is NOT_DETERMINABLE, even if another document DID resolve", () => {
    const data = fixtureData();
    data.documents.push({ id: "no-coverage-doc", name: "No coverage at all", type: "OTHER", capacityFormulas: null });
    const position = computeCovenantPosition(data);
    const ctx = fixtureSolverContext(); // no coverage declaration or permission for "no-coverage-doc" -> NOT_TESTED -> NOT_DETERMINABLE

    const post = computeRemainingCapacityAfterDebtIncurrence(data, position, 500, true, ctx);
    const determinableDoc = post.perDocument.find((d) => d.documentId === DOC)!;
    const undeterminedDoc = post.perDocument.find((d) => d.documentId === "no-coverage-doc")!;

    expect(determinableDoc.remainingCapacity).toBe(600); // that document's own figure is still real and computed
    expect(undeterminedDoc.method).toBe("NOT_DETERMINABLE");
    // But the CROSS-DOCUMENT figure fails closed - an undetermined document
    // could turn out to be the tighter one, so no top-level number is
    // reported (never silently the known-document's own figure).
    expect(post.remainingCapacity).toBeUndefined();
    expect(post.binding).toBeUndefined();
  });
});

describe("Capacity semantics (task §12.I): co-binding constraints are representable", () => {
  it("deriveBindingConstraint returns EVERY tied leg when two DEBT_INCURRENCE legs of the winning election share the same minimum standaloneCapacity", () => {
    const legA: PermissionPathLeg = {
      permissionId: "leg-a",
      grantType: "DEBT_INCURRENCE",
      amountAllocated: 200,
      standaloneCapacity: 200,
      measurementBasis: "CUMULATIVE_INCURRED",
      historicalUsage: {},
      sourceProvision: { documentId: DOC, sectionRef: "§A" },
    };
    const legB: PermissionPathLeg = {
      permissionId: "leg-b",
      grantType: "DEBT_INCURRENCE",
      amountAllocated: 200,
      standaloneCapacity: 200, // tied with legA - both are simultaneously binding
      measurementBasis: "CUMULATIVE_INCURRED",
      historicalUsage: {},
      sourceProvision: { documentId: DOC, sectionRef: "§B" },
    };
    const legLooser: PermissionPathLeg = {
      permissionId: "leg-c",
      grantType: "DEBT_INCURRENCE",
      amountAllocated: 0,
      standaloneCapacity: 900, // not binding - well above the tied minimum
      measurementBasis: "CUMULATIVE_INCURRED",
      historicalUsage: {},
      sourceProvision: { documentId: DOC, sectionRef: "§C" },
    };
    const maxCapacity: MaxCapacityResult = {
      kind: "EXACT",
      amount: 200,
      path: {
        id: "election:leg-a+leg-b+leg-c",
        status: "CLEAR",
        legs: [legA, legB, legLooser],
        linkedPermissions: [],
        conditionsTested: [],
        sharedConstraintsConsumed: [],
        assumptionsUsed: [],
        parameterAdjustmentsTriggered: [],
        sourceProvisions: [],
        stateEffects: { debtOutstandingDelta: [], cashDelta: 0, basketUsageDelta: [], sharedConstraintUsageDelta: [] },
      },
    };

    const binding = deriveBindingConstraint(maxCapacity);
    expect(binding).toHaveLength(2);
    expect(binding!.map((b) => b.permissionId).sort()).toEqual(["leg-a", "leg-b"]);
  });

  it("returns undefined (never fabricated) when maximumCapacity is not EXACT", () => {
    expect(deriveBindingConstraint({ kind: "REVIEW_REQUIRED", reason: "test" })).toBeUndefined();
    expect(deriveBindingConstraint(undefined)).toBeUndefined();
  });
});

describe("Capacity semantics (task §12.H): a genuinely-wrong binding constraint is still detectable", () => {
  it("runSolverForDocument's bindingConstraint reflects the TRUE tightest permission (R), not whichever path the amount-500 test happened to select", () => {
    const ctx = fixtureSolverContext();
    const result = runSolverForDocument(DOC, "Flip Document", FIN, 500, true, ctx, {
      status: "SOLVER_NATIVE",
      documentId: DOC,
      side: "secured",
      grantType: "DEBT_INCURRENCE",
      reason: "test fixture",
      scopedPermissionIds: ["perm-f", "perm-r"],
    });

    // Even though F is ALSO a valid selectedPath candidate for $500, the
    // real binding constraint (what actually limits the ceiling) is R - a
    // caller asking "which provision binds" and being told "perm-f" would
    // get a wrong answer; this proves bindingConstraint does not silently
    // default to whichever path cleared the tested amount.
    expect(result.bindingConstraint).toEqual([expect.objectContaining({ permissionId: "perm-r" })]);
    expect(result.bindingConstraint!.map((b) => b.permissionId)).not.toEqual(["perm-f"]);
  });
});
